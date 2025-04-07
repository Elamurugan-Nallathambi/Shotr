import { describe, it, expect } from 'vitest';
import { sep } from 'node:path';
import { extensionFor, formatDate, pad, resolveCapturePath } from '../src/main/naming.js';

// Local-constructed date avoids timezone day-shift.
const DATE = new Date(2026, 5, 15, 10, 30);

describe('formatDate / pad / extensionFor', () => {
  it('formats a local date', () => {
    expect(formatDate(DATE)).toBe('2026-06-15');
  });
  it('zero-pads counters', () => {
    expect(pad(7)).toBe('007');
    expect(pad(12, 4)).toBe('0012');
  });
  it('maps formats to extensions', () => {
    expect(extensionFor('png')).toBe('png');
    expect(extensionFor('jpeg')).toBe('jpg');
  });
});

describe('resolveCapturePath', () => {
  it('builds saveDir/<date>/capture_NNN.ext', () => {
    const p = resolveCapturePath({ saveDir: '/shots', date: DATE, format: 'png', exists: () => false });
    expect(p).toMatch(/[/\\]shots[/\\]2026-06-15[/\\]capture_001\.png$/);
  });

  it('uses .jpg for jpeg', () => {
    const p = resolveCapturePath({ saveDir: '/shots', date: DATE, format: 'jpeg', exists: () => false });
    expect(p.endsWith('.jpg')).toBe(true);
  });

  it('picks the first free counter', () => {
    const taken = new Set(
      ['/shots/2026-06-15/capture_001.png', '/shots/2026-06-15/capture_002.png'].map((s) =>
        s.replace(/\//g, sep),
      ),
    );
    const p = resolveCapturePath({
      saveDir: '/shots',
      date: DATE,
      format: 'png',
      exists: (path) => taken.has(path),
    });
    expect(p).toMatch(/capture_003\.png$/);
  });
});
