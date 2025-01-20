import { describe, it, expect } from 'vitest';
import { sep } from 'node:path';
import { resolveOutputPath } from '../../src/naming/paths.js';
import type { NamingInputs } from '../../src/naming/file-namer.js';

const naming: NamingInputs = {
  projectName: 'app',
  environment: 'qa',
  profile: 'laptop',
  pageId: 'checkout',
  title: 'Checkout',
  browser: 'chromium',
  date: new Date('2026-06-15T10:25:43Z'),
};

describe('resolveOutputPath', () => {
  it('returns an absolute path under the output dir', () => {
    const p = resolveOutputPath({
      outputDir: 'shots',
      pattern: '{pageId}.png',
      naming,
      exists: () => false,
    });
    expect(p.endsWith('/shots/checkout.png') || /\\shots\\checkout\.png$/.test(p)).toBe(true);
  });

  it('picks the first free counter when files collide', () => {
    const taken = new Set(
      ['/out/checkout_001.png', '/out/checkout_002.png'].map((s) => s.replace(/\//g, sep)),
    );
    const p = resolveOutputPath({
      outputDir: '/out',
      pattern: '{pageId}_{counter}.png',
      naming,
      exists: (path) => taken.has(path),
    });
    expect(p).toMatch(/checkout_003\.png$/);
  });

  it('does not loop for patterns without a counter token', () => {
    let calls = 0;
    const p = resolveOutputPath({
      outputDir: '/out',
      pattern: '{pageId}.png',
      naming,
      exists: () => {
        calls++;
        return true; // would loop forever if counter logic ran
      },
    });
    expect(p).toMatch(/checkout\.png$/);
    expect(calls).toBe(0);
  });

  it('appends an extension when the pattern omits one', () => {
    const p = resolveOutputPath({
      outputDir: '/out',
      pattern: '{pageId}',
      naming,
      extension: 'jpeg',
      exists: () => false,
    });
    expect(p).toMatch(/checkout\.jpg$/);
  });
});
