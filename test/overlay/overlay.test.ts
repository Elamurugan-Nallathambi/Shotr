import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  buildHeaderLines,
  escapeXml,
  renderHeaderBand,
  type HeaderInfo,
} from '../../src/overlay/header-renderer.js';
import {
  renderUrlBar,
  resolvePlatform,
  truncateUrl,
  URLBAR_HEIGHT,
} from '../../src/overlay/urlbar-renderer.js';
import { applyOverlay, stack } from '../../src/overlay/compositor.js';
import { DEFAULT_HEADER } from '../../src/config/defaults.js';
import type { ResolvedHeader } from '../../src/core/types.js';

const info: HeaderInfo = {
  projectName: 'My Web App',
  environment: 'QA',
  pageTitle: 'Checkout Page',
  url: 'https://qa.example.com/checkout',
  capturedAt: new Date('2026-06-15T10:25:43Z'),
  timestampFormat: 'YYYY-MM-DD HH:mm:ss',
  browser: 'Chromium',
  viewport: '1440x900',
};

const header: ResolvedHeader = { ...DEFAULT_HEADER };

/** A solid-colour test screenshot of a known size. */
function fakeShot(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
}

describe('escapeXml', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml('a & b <c> "d" \'e\'')).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;');
  });
});

describe('buildHeaderLines', () => {
  it('produces the spec three-line layout when all fields enabled', () => {
    const lines = buildHeaderLines(header, info);
    expect(lines[0]).toBe('Project: My Web App  |  Env: QA  |  Page: Checkout Page');
    expect(lines[1]).toBe('URL: https://qa.example.com/checkout');
    expect(lines[2]).toContain('Browser: Chromium');
    expect(lines[2]).toContain('Viewport: 1440x900');
    expect(lines[2]).toContain('Captured: 2026-06-15');
  });

  it('omits disabled fields', () => {
    const lines = buildHeaderLines(
      { ...header, includeUrl: false, includeBrowser: false, includeViewport: false },
      info,
    );
    expect(lines.some((l) => l.startsWith('URL:'))).toBe(false);
    expect(lines.some((l) => l.includes('Browser:'))).toBe(false);
  });

  it('appends notes when present', () => {
    const lines = buildHeaderLines({ ...header, notes: 'Release 1.2 evidence' }, info);
    expect(lines.at(-1)).toBe('Release 1.2 evidence');
  });

  it('includes user only when enabled and provided', () => {
    expect(buildHeaderLines({ ...header, includeUser: true }, info).join(' ')).not.toContain('User:');
    expect(
      buildHeaderLines({ ...header, includeUser: true }, { ...info, user: 'qa@x.com' }).join(' '),
    ).toContain('User: qa@x.com');
  });
});

describe('renderHeaderBand', () => {
  it('renders a PNG of the requested width and header height', async () => {
    const buf = await renderHeaderBand(800, header, info);
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(header.height);
  });
});

describe('truncateUrl', () => {
  it('leaves short urls intact', () => {
    expect(truncateUrl('https://x.com', 50)).toBe('https://x.com');
  });
  it('truncates long urls with an ellipsis', () => {
    const out = truncateUrl('https://example.com/a/very/long/path/segment', 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('resolvePlatform', () => {
  it('maps node platforms to chrome styles', () => {
    expect(resolvePlatform(undefined, 'darwin')).toBe('macos');
    expect(resolvePlatform(undefined, 'win32')).toBe('windows');
    expect(resolvePlatform(undefined, 'linux')).toBe('linux');
    expect(resolvePlatform(undefined, 'freebsd')).toBe('linux'); // fallback
  });

  it('honours an explicit value over the host OS', () => {
    expect(resolvePlatform('windows', 'darwin')).toBe('windows');
    expect(resolvePlatform('macos', 'win32')).toBe('macos');
  });

  it('treats "auto" as detect-from-host', () => {
    expect(resolvePlatform('auto', 'darwin')).toBe('macos');
  });
});

describe('renderUrlBar', () => {
  it('renders a PNG of the requested width and fixed height for each platform', async () => {
    for (const os of ['macos', 'windows', 'linux'] as const) {
      const buf = await renderUrlBar(800, info.url, os);
      const meta = await sharp(buf).metadata();
      expect(meta.width).toBe(800);
      expect(meta.height).toBe(URLBAR_HEIGHT);
    }
  });

  it('produces visibly different chrome per platform (macOS dots vs Windows controls)', async () => {
    const mac = await renderUrlBar(800, info.url, 'macos');
    const win = await renderUrlBar(800, info.url, 'windows');
    expect(Buffer.compare(mac, win)).not.toBe(0);
  });
});

describe('stack', () => {
  it('throws on an unreadable screenshot', async () => {
    await expect(stack(Buffer.from('not-an-image'), [], 'png')).rejects.toThrow();
  });
});

describe('applyOverlay', () => {
  it('adds header + url bar height above the screenshot', async () => {
    const shot = await fakeShot(600, 400);
    const out = await applyOverlay(shot, { header, info, type: 'png' });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(400 + header.height + URLBAR_HEIGHT);
  });

  it('omits the url bar when includeUrlBar is false', async () => {
    const shot = await fakeShot(600, 400);
    const out = await applyOverlay(shot, {
      header: { ...header, includeUrlBar: false },
      info,
      type: 'png',
    });
    const meta = await sharp(out).metadata();
    expect(meta.height).toBe(400 + header.height);
  });

  it('returns the screenshot unchanged in size when header disabled', async () => {
    const shot = await fakeShot(600, 400);
    const out = await applyOverlay(shot, {
      header: { ...header, enabled: false },
      info,
      type: 'png',
    });
    const meta = await sharp(out).metadata();
    expect(meta.height).toBe(400);
    expect(meta.width).toBe(600);
  });

  it('encodes as JPEG when requested', async () => {
    const shot = await fakeShot(300, 200);
    const out = await applyOverlay(shot, { header, info, type: 'jpeg', quality: 80 });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
  });
});
