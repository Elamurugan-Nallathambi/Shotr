import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  applyPattern,
  buildNamingContext,
  padCounter,
  patternHasCounter,
  type NamingInputs,
} from './file-namer.js';

export interface ResolvePathOptions {
  outputDir: string;
  pattern: string;
  naming: NamingInputs;
  /** Force a specific image extension when the pattern omits one. */
  extension?: 'png' | 'jpeg';
  /** Injectable for tests; defaults to fs.existsSync. */
  exists?: (path: string) => boolean;
}

const MAX_COUNTER = 100_000;

/**
 * Resolve the absolute output path for a capture. When the pattern includes a
 * `{counter}` token, the lowest counter that does not collide with an existing
 * file is chosen, giving stable `..._001`, `..._002` numbering.
 */
export function resolveOutputPath(opts: ResolvePathOptions): string {
  const exists = opts.exists ?? existsSync;
  const baseDir = isAbsolute(opts.outputDir) ? opts.outputDir : resolve(opts.outputDir);
  const counterWidth = opts.naming.counterWidth ?? 3;

  const build = (counter: number): string => {
    const ctx = buildNamingContext({ ...opts.naming, counter, counterWidth });
    let rel = applyPattern(opts.pattern, ctx);
    rel = ensureExtension(rel, opts.extension);
    return join(baseDir, rel);
  };

  if (!patternHasCounter(opts.pattern)) {
    return build(1);
  }

  for (let n = 1; n <= MAX_COUNTER; n++) {
    const candidate = build(n);
    if (!exists(candidate)) return candidate;
  }
  throw new Error(`Could not allocate a unique file name after ${MAX_COUNTER} attempts.`);
}

function ensureExtension(rel: string, extension?: 'png' | 'jpeg'): string {
  if (!extension) return rel;
  const ext = extension === 'jpeg' ? '.jpg' : '.png';
  return /\.(png|jpe?g)$/i.test(rel) ? rel : `${rel}${ext}`;
}

/** Create the directory for a file path if it does not already exist. */
export function ensureDirFor(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export { padCounter };
