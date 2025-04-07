import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { ImageFormat } from './config.js';

/** Local date as YYYY-MM-DD (mirrors the CLI's naming convention). */
export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Zero-pad a counter to a fixed width. */
export function pad(n: number, width = 3): string {
  return String(n).padStart(width, '0');
}

export function extensionFor(format: ImageFormat): string {
  return format === 'jpeg' ? 'jpg' : 'png';
}

export interface ResolveCaptureOptions {
  saveDir: string;
  date: Date;
  format: ImageFormat;
  counterWidth?: number;
  /** Injectable for tests; defaults to fs.existsSync. */
  exists?: (path: string) => boolean;
}

const MAX_COUNTER = 100_000;

/**
 * Resolve `<saveDir>/<YYYY-MM-DD>/capture_<NNN>.<ext>`, choosing the lowest free
 * counter so captures number stably within the day.
 */
export function resolveCapturePath(opts: ResolveCaptureOptions): string {
  const exists = opts.exists ?? existsSync;
  const ext = extensionFor(opts.format);
  const baseDir = isAbsolute(opts.saveDir) ? opts.saveDir : resolve(opts.saveDir);
  const dayDir = join(baseDir, formatDate(opts.date));
  const width = opts.counterWidth ?? 3;

  for (let n = 1; n <= MAX_COUNTER; n++) {
    const candidate = join(dayDir, `capture_${pad(n, width)}.${ext}`);
    if (!exists(candidate)) return candidate;
  }
  throw new Error(`Could not allocate a capture file name after ${MAX_COUNTER} attempts.`);
}
