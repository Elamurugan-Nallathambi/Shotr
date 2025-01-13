import dayjs from 'dayjs';
import type { NamingContext } from '../core/types.js';

/** Make a single value safe to use as a path segment. */
export function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // strip accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+)|(-+$)/g, '') || 'untitled'
  );
}

/** Filesystem-safe timestamp, e.g. 2026-06-15_10-25-43. */
export function formatFileTimestamp(date: Date): string {
  return dayjs(date).format('YYYY-MM-DD_HH-mm-ss');
}

/** Date-only token, e.g. 2026-06-15. */
export function formatDate(date: Date): string {
  return dayjs(date).format('YYYY-MM-DD');
}

/** Zero-pad a counter to a fixed width. */
export function padCounter(n: number, width = 3): string {
  return String(n).padStart(width, '0');
}

export interface NamingInputs {
  projectName: string;
  environment: string;
  profile: string;
  pageId: string;
  title: string;
  browser: string;
  date: Date;
  counter?: number;
  counterWidth?: number;
}

/**
 * Build the token context for file naming / header text. "Texty" tokens are
 * slugified so they are path-safe; date/timestamp/counter are already safe.
 */
export function buildNamingContext(inputs: NamingInputs): NamingContext {
  return {
    projectName: slugify(inputs.projectName),
    environment: slugify(inputs.environment),
    profile: slugify(inputs.profile),
    pageId: slugify(inputs.pageId),
    title: slugify(inputs.title),
    browser: slugify(inputs.browser),
    date: formatDate(inputs.date),
    timestamp: formatFileTimestamp(inputs.date),
    counter: padCounter(inputs.counter ?? 1, inputs.counterWidth ?? 3),
  };
}

const TOKEN_RE = /\{(\w+)\}/g;

/** True if the pattern contains a {counter} token. */
export function patternHasCounter(pattern: string): boolean {
  return /\{counter\}/.test(pattern);
}

/**
 * Substitute `{token}` placeholders in a pattern. Throws if the pattern
 * references a token that is not part of the naming context (typo guard).
 */
export function applyPattern(pattern: string, ctx: NamingContext): string {
  const known = new Set(Object.keys(ctx));
  const unknown: string[] = [];
  const out = pattern.replace(TOKEN_RE, (_match, token: string) => {
    if (!known.has(token)) {
      unknown.push(token);
      return _match;
    }
    return ctx[token as keyof NamingContext];
  });
  if (unknown.length > 0) {
    throw new Error(
      `Unknown token(s) in fileNamePattern: ${unknown.map((t) => `{${t}}`).join(', ')}. ` +
        `Valid tokens: ${[...known].map((t) => `{${t}}`).join(', ')}.`,
    );
  }
  return out;
}
