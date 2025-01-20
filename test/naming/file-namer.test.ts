import { describe, it, expect } from 'vitest';
import {
  applyPattern,
  buildNamingContext,
  formatDate,
  formatFileTimestamp,
  padCounter,
  patternHasCounter,
  slugify,
} from '../../src/naming/file-namer.js';

const D = new Date('2026-06-15T10:25:43Z');

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with dashes', () => {
    expect(slugify('My Web App')).toBe('my-web-app');
    expect(slugify('Checkout / Page!')).toBe('checkout-page');
  });

  it('strips accents', () => {
    expect(slugify('Café Münchën')).toBe('cafe-munchen');
  });

  it('trims leading/trailing dashes and falls back for empty', () => {
    expect(slugify('  ---  ')).toBe('untitled');
    expect(slugify('')).toBe('untitled');
  });
});

describe('date/timestamp/counter formatting', () => {
  it('formats a filesystem-safe timestamp', () => {
    // Compare to the locally-formatted value to stay timezone-independent.
    expect(formatFileTimestamp(D)).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  it('formats a date token', () => {
    expect(formatDate(D)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('zero-pads counters', () => {
    expect(padCounter(1)).toBe('001');
    expect(padCounter(42, 4)).toBe('0042');
  });
});

describe('buildNamingContext', () => {
  it('slugifies texty tokens and keeps date/timestamp/counter safe', () => {
    const ctx = buildNamingContext({
      projectName: 'My Web App',
      environment: 'QA',
      profile: 'Laptop',
      pageId: 'checkout',
      title: 'Checkout Page',
      browser: 'Chromium',
      date: D,
      counter: 2,
    });
    expect(ctx.projectName).toBe('my-web-app');
    expect(ctx.title).toBe('checkout-page');
    expect(ctx.counter).toBe('002');
    expect(ctx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('applyPattern', () => {
  const ctx = buildNamingContext({
    projectName: 'app',
    environment: 'qa',
    profile: 'laptop',
    pageId: 'checkout',
    title: 'Checkout',
    browser: 'chromium',
    date: D,
    counter: 1,
  });

  it('substitutes known tokens', () => {
    expect(applyPattern('{date}/{pageId}_{counter}.png', ctx)).toBe(
      `${ctx.date}/checkout_001.png`,
    );
  });

  it('substitutes the spec-style pattern', () => {
    expect(applyPattern('{environment}_{profile}_{pageId}_{timestamp}.png', ctx)).toBe(
      `qa_laptop_checkout_${ctx.timestamp}.png`,
    );
  });

  it('throws on unknown tokens', () => {
    expect(() => applyPattern('{bogus}.png', ctx)).toThrow(/Unknown token/);
  });
});

describe('patternHasCounter', () => {
  it('detects the counter token', () => {
    expect(patternHasCounter('{date}_{counter}.png')).toBe(true);
    expect(patternHasCounter('{date}.png')).toBe(false);
  });
});
