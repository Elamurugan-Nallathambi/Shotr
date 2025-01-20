import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import {
  applyFullPageOverride,
  filterPages,
  runCapture,
  selectProfiles,
} from '../../src/core/runner.js';
import { silentLogger } from '../../src/core/logger.js';
import { resolveConfig, validateConfig } from '../../src/config/loader.js';
import type { Session } from '../../src/capture/browser.js';
import type { PageLike } from '../../src/capture/page-like.js';
import type { ResolvedConfig, ResolvedPage } from '../../src/core/types.js';

let PNG: Buffer;
beforeAll(async () => {
  PNG = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .png()
    .toBuffer();
});

function cfg(extra: Record<string, unknown> = {}): ResolvedConfig {
  return resolveConfig(
    validateConfig({
      projectName: 'App',
      environment: 'QA',
      baseUrl: 'https://example.com',
      profiles: { laptop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } },
      defaults: { profile: 'laptop' },
      pages: [{ id: 'home', path: '/' }],
      ...extra,
    }),
  );
}

function page(id: string, extra: Partial<ResolvedPage> = {}): ResolvedPage {
  return {
    id,
    title: id,
    url: `https://example.com/${id}`,
    tags: [],
    actions: [],
    capture: { mode: 'viewport', autoScroll: false, type: 'png' },
    waitUntil: 'load',
    ...extra,
  };
}

/** A fake Playwright page that returns a real PNG so the overlay pipeline runs. */
function fakePage(opts: { failOnGoto?: boolean } = {}): PageLike {
  return {
    goto: async () => {
      if (opts.failOnGoto) throw new Error('navigation failed');
    },
    title: async () => 'T',
    waitForTimeout: async () => {},
    waitForSelector: async () => {},
    click: async () => {},
    fill: async () => {},
    selectOption: async () => {},
    hover: async () => {},
    keyboard: { press: async () => {} },
    evaluate: async () => {},
    screenshot: async () => PNG,
    locator: () => ({ screenshot: async () => PNG }),
  };
}

function fakeDeps(overrides: { failOnGoto?: boolean } = {}) {
  const written = new Map<string, Buffer>();
  let tick = 0;
  return {
    written,
    deps: {
      launchSession: async (): Promise<Session> =>
        ({
          page: fakePage(overrides),
          close: async () => {},
        }) as unknown as Session,
      now: () => new Date(1_700_000_000_000 + tick++ * 1000),
      writeFile: async (path: string, data: Buffer) => {
        written.set(path, data);
      },
      ensureDir: () => {},
      exists: (path: string) => written.has(path),
      logger: silentLogger,
    },
  };
}

describe('selectProfiles', () => {
  it('uses the default profile when none requested', () => {
    expect(selectProfiles(cfg(), {}).map((p) => p.name)).toEqual(['laptop']);
  });
  it('uses requested profiles', () => {
    expect(selectProfiles(cfg(), { profiles: ['mobile', 'laptop'] }).map((p) => p.name)).toEqual([
      'mobile',
      'laptop',
    ]);
  });
  it('synthesizes a default profile when config defines none', () => {
    const c = resolveConfig(validateConfig({ baseUrl: 'https://x.com', pages: [{ id: 'a', path: '/' }] }));
    const profiles = selectProfiles(c, {});
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.name).toBe('default');
  });
  it('throws on an unknown profile name', () => {
    expect(() => selectProfiles(cfg(), { profiles: ['ghost'] })).toThrow(/Unknown profile/);
  });
});

describe('filterPages', () => {
  const pages = [
    page('a', { tags: ['smoke'] }),
    page('b', { tags: ['regression'] }),
    page('c', { profile: 'mobile' }),
  ];
  it('filters by page id', () => {
    expect(filterPages(pages, { pageIds: ['b'], profileName: 'laptop' }).map((p) => p.id)).toEqual(['b']);
  });
  it('filters by tag', () => {
    expect(filterPages(pages, { tags: ['smoke'], profileName: 'laptop' }).map((p) => p.id)).toEqual(['a']);
  });
  it('respects per-page profile pinning', () => {
    expect(filterPages(pages, { profileName: 'laptop' }).map((p) => p.id)).toEqual(['a', 'b']);
    expect(filterPages(pages, { profileName: 'mobile' }).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('applyFullPageOverride', () => {
  const cap = { mode: 'viewport' as const, autoScroll: false, type: 'png' as const };
  it('returns capture unchanged without the flag', () => {
    expect(applyFullPageOverride(cap)).toBe(cap);
    expect(applyFullPageOverride(cap, false)).toBe(cap);
  });
  it('forces full-page mode and auto-scroll when set', () => {
    const out = applyFullPageOverride(cap, true);
    expect(out.mode).toBe('fullPage');
    expect(out.autoScroll).toBe(true);
  });
});

describe('runCapture', () => {
  it('captures each page and writes a headered PNG', async () => {
    const { deps, written } = fakeDeps();
    const manifest = await runCapture(
      cfg({ pages: [{ id: 'home', path: '/' }, { id: 'about', path: '/about' }] }),
      {},
      deps,
    );
    expect(manifest.total).toBe(2);
    expect(manifest.successful).toBe(2);
    expect(manifest.failed).toBe(0);
    expect(written.size).toBe(2);

    // The written image is taller than the raw screenshot (header was added).
    const first = [...written.values()][0]!;
    const meta = await sharp(first).metadata();
    expect(meta.height).toBeGreaterThan(300);
    expect(meta.width).toBe(400);
  });

  it('runs across multiple profiles', async () => {
    const { deps, written } = fakeDeps();
    const manifest = await runCapture(cfg(), { profiles: ['laptop', 'mobile'] }, deps);
    expect(manifest.total).toBe(2); // 1 page × 2 profiles
    expect(written.size).toBe(2);
    expect(manifest.results.map((r) => r.profile).sort()).toEqual(['laptop', 'mobile']);
  });

  it('records the normalized browser label (msedge → edge)', async () => {
    const { deps } = fakeDeps();
    const manifest = await runCapture(cfg(), { browser: 'msedge' }, deps);
    expect(manifest.results[0]!.browser).toBe('edge');
  });

  it('records a failure but continues', async () => {
    const { deps } = fakeDeps({ failOnGoto: true });
    const manifest = await runCapture(cfg(), {}, deps);
    expect(manifest.failed).toBe(1);
    expect(manifest.results[0]!.status).toBe('failed');
    expect(manifest.results[0]!.error).toMatch(/navigation failed/);
  });
});
