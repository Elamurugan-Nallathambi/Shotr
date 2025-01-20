import { describe, it, expect } from 'vitest';
import {
  ConfigError,
  findUnresolvedEnvRefs,
  interpolateEnv,
  loadConfig,
  parseConfigText,
  resolveConfig,
  validateConfig,
} from '../../src/config/loader.js';

const minimal = {
  baseUrl: 'https://example.com',
  pages: [{ id: 'home', path: '/' }],
};

describe('parseConfigText', () => {
  it('parses YAML', () => {
    const obj = parseConfigText('baseUrl: https://x.com\npages:\n  - id: a\n    path: /');
    expect(obj).toMatchObject({ baseUrl: 'https://x.com' });
  });

  it('parses JSON (YAML superset)', () => {
    const obj = parseConfigText('{"baseUrl":"https://x.com","pages":[{"id":"a","path":"/"}]}');
    expect(obj).toMatchObject({ baseUrl: 'https://x.com' });
  });

  it('throws ConfigError on malformed input', () => {
    expect(() => parseConfigText('foo: [unclosed')).toThrow(ConfigError);
  });
});

describe('interpolateEnv', () => {
  const env = { SHOTR_USER: 'alice', SHOTR_PASS: 's3cret' } as NodeJS.ProcessEnv;

  it('replaces ${VAR} in nested strings and arrays', () => {
    const out = interpolateEnv(
      {
        baseUrl: 'https://${SHOTR_USER}.example.com',
        auth: { loginScript: [{ fill: { selector: '#p', value: '${SHOTR_PASS}' } }] },
      },
      env,
    );
    expect(out).toEqual({
      baseUrl: 'https://alice.example.com',
      auth: { loginScript: [{ fill: { selector: '#p', value: 's3cret' } }] },
    });
  });

  it('leaves strings without references untouched', () => {
    expect(interpolateEnv({ a: 'plain', n: 5, b: true }, env)).toEqual({ a: 'plain', n: 5, b: true });
  });

  it('leaves unset variables as the literal ${VAR} (does not throw)', () => {
    expect(interpolateEnv({ x: '${NOPE}', y: '${SHOTR_USER}' }, env)).toEqual({
      x: '${NOPE}',
      y: 'alice',
    });
  });
});

describe('findUnresolvedEnvRefs', () => {
  it('finds remaining ${VAR} references across nested structures', () => {
    expect(
      findUnresolvedEnvRefs({ a: 'ok', b: ['${ONE}', { c: '${TWO}' }], d: 'plain' }).sort(),
    ).toEqual(['ONE', 'TWO']);
  });
  it('returns empty when everything is resolved', () => {
    expect(findUnresolvedEnvRefs({ a: 'ok', b: ['plain'] })).toEqual([]);
  });
});

describe('validateConfig', () => {
  it('accepts a minimal valid config', () => {
    expect(() => validateConfig(minimal)).not.toThrow();
  });

  it('requires at least one page', () => {
    expect(() => validateConfig({ pages: [] })).toThrow(ConfigError);
  });

  it('rejects a page without path or url', () => {
    expect(() => validateConfig({ pages: [{ id: 'x' }] })).toThrow(/path.*url|url.*path/i);
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(() => validateConfig({ ...minimal, bogus: 1 })).toThrow(ConfigError);
  });

  it('rejects a non-url absolute url', () => {
    expect(() => validateConfig({ pages: [{ id: 'x', url: 'not-a-url' }] })).toThrow(ConfigError);
  });
});

describe('resolveConfig — URL resolution', () => {
  it('joins baseUrl + path', () => {
    const cfg = resolveConfig(validateConfig(minimal));
    expect(cfg.pages[0]!.url).toBe('https://example.com/');
  });

  it('handles paths with and without leading slash consistently', () => {
    const cfg = resolveConfig(
      validateConfig({
        baseUrl: 'https://example.com/app',
        pages: [
          { id: 'a', path: '/products' },
          { id: 'b', path: 'products' },
        ],
      }),
    );
    // Leading slash is stripped, so both resolve relative to the base path.
    expect(cfg.pages[0]!.url).toBe('https://example.com/app/products');
    expect(cfg.pages[1]!.url).toBe('https://example.com/app/products');
  });

  it('uses an absolute url verbatim', () => {
    const cfg = resolveConfig(
      validateConfig({ pages: [{ id: 'a', url: 'https://other.com/x' }] }),
    );
    expect(cfg.pages[0]!.url).toBe('https://other.com/x');
  });

  it('throws when path is used without baseUrl', () => {
    expect(() => resolveConfig(validateConfig({ pages: [{ id: 'a', path: '/x' }] }))).toThrow(
      /baseUrl/,
    );
  });
});

describe('resolveConfig — merge precedence (defaults < page)', () => {
  it('page capture overrides defaults capture, unspecified inherits', () => {
    const cfg = resolveConfig(
      validateConfig({
        baseUrl: 'https://example.com',
        defaults: { capture: { mode: 'fullPage', type: 'jpeg' } },
        pages: [{ id: 'a', path: '/', capture: { mode: 'viewport' } }],
      }),
    );
    expect(cfg.pages[0]!.capture.mode).toBe('viewport'); // page wins
    expect(cfg.pages[0]!.capture.type).toBe('jpeg'); // inherited from defaults
  });

  it('applies built-in capture default when nothing is set', () => {
    const cfg = resolveConfig(validateConfig(minimal));
    expect(cfg.pages[0]!.capture.mode).toBe('viewport');
    expect(cfg.pages[0]!.capture.type).toBe('png');
    expect(cfg.pages[0]!.capture.autoScroll).toBe(false);
  });

  it('fullPage:true sets fullPage mode and enables auto-scroll by default', () => {
    const cfg = resolveConfig(
      validateConfig({
        baseUrl: 'https://example.com',
        pages: [{ id: 'a', path: '/', capture: { fullPage: true } }],
      }),
    );
    expect(cfg.pages[0]!.capture.mode).toBe('fullPage');
    expect(cfg.pages[0]!.capture.autoScroll).toBe(true);
  });

  it('fullPage:false forces viewport mode', () => {
    const cfg = resolveConfig(
      validateConfig({
        baseUrl: 'https://example.com',
        defaults: { capture: { mode: 'fullPage' } },
        pages: [{ id: 'a', path: '/', capture: { fullPage: false } }],
      }),
    );
    expect(cfg.pages[0]!.capture.mode).toBe('viewport');
    expect(cfg.pages[0]!.capture.autoScroll).toBe(false);
  });

  it('autoScroll can be explicitly disabled on a full-page capture', () => {
    const cfg = resolveConfig(
      validateConfig({
        baseUrl: 'https://example.com',
        pages: [{ id: 'a', path: '/', capture: { fullPage: true, autoScroll: false } }],
      }),
    );
    expect(cfg.pages[0]!.capture.mode).toBe('fullPage');
    expect(cfg.pages[0]!.capture.autoScroll).toBe(false);
  });

  it('autoScroll can be enabled independently of full-page', () => {
    const cfg = resolveConfig(
      validateConfig({
        baseUrl: 'https://example.com',
        pages: [{ id: 'a', path: '/', capture: { autoScroll: true } }],
      }),
    );
    expect(cfg.pages[0]!.capture.mode).toBe('viewport');
    expect(cfg.pages[0]!.capture.autoScroll).toBe(true);
  });

  it('waitUntil: page overrides defaults overrides built-in', () => {
    const cfg = resolveConfig(
      validateConfig({
        baseUrl: 'https://example.com',
        defaults: { waitUntil: 'networkidle' },
        pages: [
          { id: 'a', path: '/' },
          { id: 'b', path: '/b', waitUntil: 'domcontentloaded' },
        ],
      }),
    );
    expect(cfg.pages[0]!.waitUntil).toBe('networkidle');
    expect(cfg.pages[1]!.waitUntil).toBe('domcontentloaded');
  });
});

describe('resolveConfig — profiles & validation', () => {
  it('injects profile name and defaults deviceScaleFactor/isMobile', () => {
    const cfg = resolveConfig(
      validateConfig({
        ...minimal,
        profiles: { laptop: { width: 1440, height: 900 } },
      }),
    );
    expect(cfg.profiles.laptop).toMatchObject({
      name: 'laptop',
      deviceScaleFactor: 1,
      isMobile: false,
    });
  });

  it('throws when defaults.profile is undefined in profiles', () => {
    expect(() =>
      resolveConfig(validateConfig({ ...minimal, defaults: { profile: 'ghost' } })),
    ).toThrow(/ghost/);
  });

  it('throws when a page references an undefined profile', () => {
    expect(() =>
      resolveConfig(
        validateConfig({
          baseUrl: 'https://example.com',
          profiles: { laptop: { width: 1440, height: 900 } },
          pages: [{ id: 'a', path: '/', profile: 'ghost' }],
        }),
      ),
    ).toThrow(/ghost/);
  });

  it('throws on duplicate page ids', () => {
    expect(() =>
      resolveConfig(
        validateConfig({
          baseUrl: 'https://example.com',
          pages: [
            { id: 'a', path: '/' },
            { id: 'a', path: '/b' },
          ],
        }),
      ),
    ).toThrow(/Duplicate/);
  });

  it('throws when element mode lacks a selector', () => {
    expect(() =>
      resolveConfig(
        validateConfig({
          baseUrl: 'https://example.com',
          pages: [{ id: 'a', path: '/', capture: { mode: 'element' } }],
        }),
      ),
    ).toThrow(/selector/);
  });
});

describe('resolveConfig — defaults for meta/header/auth', () => {
  it('accepts friendly browser names (chrome/edge/safari)', () => {
    for (const browser of ['chrome', 'edge', 'safari', 'firefox'] as const) {
      const cfg = resolveConfig(validateConfig({ ...minimal, defaults: { browser } }));
      expect(cfg.browser).toBe(browser);
    }
  });

  it('fills sensible meta defaults', () => {
    const cfg = resolveConfig(validateConfig(minimal));
    expect(cfg.projectName).toBe('shotr');
    expect(cfg.environment).toBe('default');
    expect(cfg.browser).toBe('chromium');
    expect(cfg.outputDir).toBe('./shots');
    expect(cfg.fileNamePattern).toBe('{date}/{pageId}_{counter}.png');
  });

  it('merges header overrides over defaults', () => {
    const cfg = resolveConfig(
      validateConfig({ ...minimal, header: { enabled: false, height: 120 } }),
    );
    expect(cfg.header.enabled).toBe(false);
    expect(cfg.header.height).toBe(120);
    expect(cfg.header.includeUrlBar).toBe(true); // untouched default
  });

  it('resolves header.os to a concrete platform (auto/host)', () => {
    const cfg = resolveConfig(validateConfig(minimal));
    expect(['macos', 'windows', 'linux']).toContain(cfg.header.os);
  });

  it('honours an explicit header.os', () => {
    const cfg = resolveConfig(validateConfig({ ...minimal, header: { os: 'windows' } }));
    expect(cfg.header.os).toBe('windows');
  });

  it('frame defaults to disabled with a gradient backdrop', () => {
    const cfg = resolveConfig(validateConfig(minimal));
    expect(cfg.frame.enabled).toBe(false);
    expect(cfg.frame.background.type).toBe('gradient');
    expect(cfg.frame.padding).toBeGreaterThan(0);
  });

  it('merges frame + nested background overrides over defaults', () => {
    const cfg = resolveConfig(
      validateConfig({
        ...minimal,
        frame: { enabled: true, padding: 120, background: { from: '#ff0000' } },
      }),
    );
    expect(cfg.frame.enabled).toBe(true);
    expect(cfg.frame.padding).toBe(120);
    expect(cfg.frame.background.from).toBe('#ff0000');
    expect(cfg.frame.background.to).toBe('#a855f7'); // untouched default
    expect(cfg.frame.shadow).toBe(true); // untouched default
  });

  it('resolves auth defaults', () => {
    const cfg = resolveConfig(validateConfig(minimal));
    expect(cfg.auth).toEqual({ enabled: false, storageState: undefined, loginUrl: undefined, loginScript: [] });
  });
});

describe('loadConfig', () => {
  it('throws ConfigError for a missing file', async () => {
    await expect(loadConfig('/no/such/file.yaml')).rejects.toThrow(ConfigError);
  });
});
