import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Write an image buffer to disk, creating parent directories as needed. */
export function saveImage(filePath: string, buffer: Buffer): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buffer);
}
