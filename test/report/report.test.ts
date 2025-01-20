import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { prepareAssets } from '../../src/report/assets.js';
import { renderHtmlReport } from '../../src/report/html-report.js';
import { buildWordReport } from '../../src/report/word-report.js';
import { renderPdfFromHtml } from '../../src/report/pdf-report.js';
import { finalizeManifest } from '../../src/report/collector.js';
import type { CaptureResult, RunManifest } from '../../src/core/types.js';

let PNG: Buffer;
beforeAll(async () => {
  PNG = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 5, g: 6, b: 7 } } })
    .png()
    .toBuffer();
});

function result(extra: Partial<CaptureResult>): CaptureResult {
  return {
    pageId: 'home',
    title: 'Home Page',
    url: 'https://example.com/',
    profile: 'laptop',
    viewport: '1440x900',
    browser: 'chromium',
    status: 'success',
    filePath: '/shots/home.png',
    startedAt: '2026-06-15T00:00:00.000Z',
    durationMs: 10,
    ...extra,
  };
}

function manifest(results: CaptureResult[]): RunManifest {
  return finalizeManifest(
    { projectName: 'My App', environment: 'QA', outputDir: './shots' },
    results,
    new Date('2026-06-15T00:00:00Z'),
    new Date('2026-06-15T00:01:00Z'),
  );
}

describe('prepareAssets', () => {
  it('reads and downscales successful captures', async () => {
    const assets = await prepareAssets(manifest([result({})]), {
      maxWidth: 200,
      readImage: async () => PNG,
    });
    expect(assets[0]!.width).toBe(200);
    expect(assets[0]!.dataUri?.startsWith('data:image/png;base64,')).toBe(true);
    expect(assets[0]!.fullDataUri?.startsWith('data:image/png;base64,')).toBe(true);
    expect(assets[0]!.buffer).toBeInstanceOf(Buffer);
  });

  it('skips image work for failed captures', async () => {
    const assets = await prepareAssets(
      manifest([result({ status: 'failed', error: 'boom', filePath: undefined })]),
      { readImage: async () => PNG },
    );
    expect(assets[0]!.buffer).toBeUndefined();
    expect(assets[0]!.dataUri).toBeUndefined();
    expect(assets[0]!.error).toBe('boom');
  });
});

describe('renderHtmlReport', () => {
  it('embeds metadata, status badge, and the data URI', async () => {
    const assets = await prepareAssets(manifest([result({})]), { readImage: async () => PNG });
    const html = renderHtmlReport(manifest([result({})]), assets);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('My App');
    expect(html).toContain('Home Page');
    expect(html).toContain('https://example.com/');
    expect(html).toContain('badge success');
    expect(html).toContain('data:image/png;base64,');
  });

  it('makes the thumbnail open the full image in a new tab', async () => {
    const m = manifest([result({})]);
    const assets = await prepareAssets(m, { readImage: async () => PNG });
    const html = renderHtmlReport(m, assets);
    expect(html).toContain('onclick="shotrOpen(0)"');
    expect(html).toContain('function shotrOpen');
    expect(html).toContain('SHOTR_FULL');
    expect(html).toContain("window.open('', '_blank')");
  });

  it('does not add a zoom handler for failed (imageless) captures', () => {
    const html = renderHtmlReport(manifest([result({ status: 'failed', error: 'x', filePath: undefined })]), [
      {
        pageId: 'home',
        title: 'Home',
        profile: 'laptop',
        viewport: '1440x900',
        url: 'https://x.com',
        browser: 'chromium',
        status: 'failed',
        error: 'x',
      },
    ]);
    expect(html).not.toContain('onclick="shotrOpen');
    expect(html).toContain('SHOTR_FULL = []');
  });

  it('shows the error for a failed capture', () => {
    const html = renderHtmlReport(manifest([result({ status: 'failed', error: 'nav timeout', filePath: undefined })]), [
      {
        pageId: 'home',
        title: 'Home',
        profile: 'laptop',
        viewport: '1440x900',
        url: 'https://x.com',
        browser: 'chromium',
        status: 'failed',
        error: 'nav timeout',
      },
    ]);
    expect(html).toContain('badge failed');
    expect(html).toContain('nav timeout');
  });
});

describe('buildWordReport', () => {
  it('produces a valid .docx (zip) buffer with an image', async () => {
    const assets = await prepareAssets(manifest([result({})]), { readImage: async () => PNG });
    const buf = await buildWordReport(manifest([result({})]), assets);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK'); // zip signature
  });

  it('handles a failed capture without an image', async () => {
    const buf = await buildWordReport(manifest([result({ status: 'failed', error: 'x', filePath: undefined })]), [
      {
        pageId: 'home',
        title: 'Home',
        profile: 'laptop',
        viewport: '1440x900',
        url: 'https://x.com',
        browser: 'chromium',
        status: 'failed',
        error: 'x',
      },
    ]);
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});

describe('renderPdfFromHtml', () => {
  it('feeds HTML to the page and returns its pdf buffer', async () => {
    const calls: string[] = [];
    let disposed = false;
    const buf = await renderPdfFromHtml('<html><body>hi</body></html>', async () => ({
      page: {
        setContent: async (html) => void calls.push(html),
        pdf: async () => Buffer.from('%PDF-1.4 fake'),
      },
      dispose: async () => {
        disposed = true;
      },
    }));
    expect(calls[0]).toContain('hi');
    expect(buf.toString()).toContain('%PDF');
    expect(disposed).toBe(true);
  });

  it('disposes the page even if pdf generation throws', async () => {
    let disposed = false;
    await expect(
      renderPdfFromHtml('<html></html>', async () => ({
        page: {
          setContent: async () => {},
          pdf: async () => {
            throw new Error('pdf failed');
          },
        },
        dispose: async () => {
          disposed = true;
        },
      })),
    ).rejects.toThrow('pdf failed');
    expect(disposed).toBe(true);
  });
});
