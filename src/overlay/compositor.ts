import sharp from 'sharp';
import type { ImageType } from '../config/schema.js';
import type { ResolvedHeader } from '../core/types.js';
import { renderHeaderBand, type HeaderInfo } from './header-renderer.js';
import { renderUrlBar } from './urlbar-renderer.js';

/** Vertically stack bands above a screenshot into a single image buffer. */
export async function stack(
  screenshot: Buffer,
  bands: Buffer[],
  type: ImageType,
  quality?: number,
): Promise<Buffer> {
  const meta = await sharp(screenshot).metadata();
  const width = meta.width ?? 0;
  const shotHeight = meta.height ?? 0;
  if (!width || !shotHeight) throw new Error('Screenshot has no readable dimensions.');

  const bandMetas = await Promise.all(bands.map((b) => sharp(b).metadata()));
  const bandsHeight = bandMetas.reduce((sum, m) => sum + (m.height ?? 0), 0);
  const totalHeight = shotHeight + bandsHeight;

  const layers: sharp.OverlayOptions[] = [];
  let top = 0;
  bands.forEach((band, i) => {
    layers.push({ input: band, top, left: 0 });
    top += bandMetas[i]?.height ?? 0;
  });
  layers.push({ input: screenshot, top, left: 0 });

  const base = sharp({
    create: {
      width,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).composite(layers);

  return type === 'jpeg'
    ? base.jpeg({ quality: quality ?? 90 }).toBuffer()
    : base.png().toBuffer();
}

export interface OverlayOptions {
  header: ResolvedHeader;
  info: HeaderInfo;
  type: ImageType;
  quality?: number;
}

/**
 * Apply the configured header band and optional URL bar on top of a captured
 * screenshot. When the header is disabled, the screenshot is returned in the
 * requested format unchanged (re-encoded only if format differs).
 */
export async function applyOverlay(screenshot: Buffer, opts: OverlayOptions): Promise<Buffer> {
  const { header, info, type, quality } = opts;
  if (!header.enabled) {
    return stack(screenshot, [], type, quality);
  }

  const meta = await sharp(screenshot).metadata();
  const width = meta.width ?? 0;
  if (!width) throw new Error('Screenshot has no readable width.');

  const bands: Buffer[] = [];
  bands.push(await renderHeaderBand(width, header, info));
  if (header.includeUrlBar) {
    bands.push(await renderUrlBar(width, info.url, header.os));
  }

  return stack(screenshot, bands, type, quality);
}
