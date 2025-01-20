import { describe, it, expect } from 'vitest';
import { createLogger, silentLogger } from '../../src/core/logger.js';
import { finalizeManifest } from '../../src/report/collector.js';
import { formatSummary } from '../../src/report/summary.js';
import type { CaptureResult } from '../../src/core/types.js';

describe('createLogger', () => {
  it('routes each level to the sink without color when disabled', () => {
    const out: string[] = [];
    const log = createLogger({ color: false, sink: (m) => out.push(m) });
    log.log('a');
    log.ok('b');
    log.warn('c');
    log.err('d');
    expect(out).toEqual(['[shotr] a', '[ ok ] b', '[warn] c', '[fail] d']);
  });

  it('emits nothing when quiet', () => {
    const out: string[] = [];
    const log = createLogger({ quiet: true, sink: (m) => out.push(m) });
    log.log('x');
    expect(out).toEqual([]);
  });

  it('wraps labels in ANSI when color enabled', () => {
    const out: string[] = [];
    createLogger({ color: true, sink: (m) => out.push(m) }).ok('hi');
    expect(out[0]).toContain('[32m');
  });

  it('silentLogger discards everything', () => {
    expect(() => {
      silentLogger.log('x');
      silentLogger.ok('x');
      silentLogger.warn('x');
      silentLogger.err('x');
    }).not.toThrow();
  });
});

function result(status: CaptureResult['status'], extra: Partial<CaptureResult> = {}): CaptureResult {
  return {
    pageId: 'p',
    title: 'P',
    url: 'https://x.com',
    profile: 'laptop',
    viewport: '1440x900',
    browser: 'chromium',
    status,
    startedAt: '2026-06-15T00:00:00.000Z',
    durationMs: 5,
    ...extra,
  };
}

describe('finalizeManifest + formatSummary', () => {
  const start = new Date('2026-06-15T00:00:00Z');
  const end = new Date('2026-06-15T00:01:00Z');

  it('computes totals', () => {
    const m = finalizeManifest(
      { projectName: 'App', environment: 'QA', outputDir: './shots' },
      [result('success'), result('failed', { error: 'boom', pageId: 'bad' })],
      start,
      end,
    );
    expect(m.total).toBe(2);
    expect(m.successful).toBe(1);
    expect(m.failed).toBe(1);
  });

  it('renders the spec-style summary', () => {
    const m = finalizeManifest(
      { projectName: 'My Web App', environment: 'QA', outputDir: './shots/2026-06-15' },
      [result('success')],
      start,
      end,
    );
    const text = formatSummary(m);
    expect(text).toContain('Screenshot Capture Completed');
    expect(text).toContain('Project: My Web App');
    expect(text).toContain('Successful Captures: 1');
    expect(text).toContain('Output Folder: ./shots/2026-06-15');
  });

  it('lists failures when present', () => {
    const m = finalizeManifest(
      { projectName: 'App', environment: 'QA', outputDir: './shots' },
      [result('failed', { pageId: 'checkout', error: 'timeout' })],
      start,
      end,
    );
    expect(formatSummary(m)).toContain('checkout: timeout');
  });
});
