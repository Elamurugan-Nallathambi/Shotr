import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { CaptureResult, RunManifest } from '../core/types.js';

export interface ImageAsset {
  pageId: string;
  title: string;
  profile: string;
  viewport: string;
  url: string;
  browser: string;
  status: CaptureResult['status'];
  error?: string;
  filePath?: string;
  /** Resized PNG buffer (present only for successful captures). */
  buffer?: Buffer;
  /** Downscaled thumbnail, for inline display in the report. */
  dataUri?: string;
  /** Full-resolution image, for "open in new tab". */
  fullDataUri?: string;
  width?: number;
  height?: number;
}

export interface PrepareAssetsOptions {
  maxWidth?: number;
  readImage?: (path: string) => Promise<Buffer>;
}

/**
 * Read each successful capture, downscale to a thumbnail, and produce both a
 * data URI (for HTML/PDF) and a raw buffer with dimensions (for Word).
 */
export async function prepareAssets(
  manifest: RunManifest,
  opts: PrepareAssetsOptions = {},
): Promise<ImageAsset[]> {
  const maxWidth = opts.maxWidth ?? 640;
  const readImage = opts.readImage ?? ((p: string) => readFile(p));

  return Promise.all(
    manifest.results.map(async (r): Promise<ImageAsset> => {
      const base: ImageAsset = {
        pageId: r.pageId,
        title: r.title,
        profile: r.profile,
        viewport: r.viewport,
        url: r.url,
        browser: r.browser,
        status: r.status,
        error: r.error,
        filePath: r.filePath,
      };
      if (r.status !== 'success' || !r.filePath) return base;

      const original = await readImage(r.filePath);
      const resized = await sharp(original)
        .resize({ width: maxWidth, withoutEnlargement: true })
        .png()
        .toBuffer();
      const meta = await sharp(resized).metadata();
      const fullMime = /\.jpe?g$/i.test(r.filePath) ? 'image/jpeg' : 'image/png';
      return {
        ...base,
        buffer: resized,
        dataUri: `data:image/png;base64,${resized.toString('base64')}`,
        fullDataUri: `data:${fullMime};base64,${original.toString('base64')}`,
        width: meta.width ?? maxWidth,
        height: meta.height ?? maxWidth,
      };
    }),
  );
}
