import sharp from 'sharp';
import { escapeXml } from './header-renderer.js';
import type { ImageType } from '../config/schema.js';
import type { ResolvedBackground, ResolvedFrame } from '../core/types.js';

/** SVG for the backdrop: a gradient (angled) or a solid fill. */
export function backgroundSvg(width: number, height: number, bg: ResolvedBackground): string {
  if (bg.type === 'solid') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${escapeXml(
      bg.color,
    )}"/></svg>`;
  }
  const stops = bg.colors && bg.colors.length >= 2 ? bg.colors : [bg.from, bg.to];
  const rad = (bg.angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const x1 = (0.5 - dx / 2) * 100;
  const y1 = (0.5 - dy / 2) * 100;
  const x2 = (0.5 + dx / 2) * 100;
  const y2 = (0.5 + dy / 2) * 100;
  const stopEls = stops
    .map(
      (c, i) =>
        `<stop offset="${((i / (stops.length - 1)) * 100).toFixed(2)}%" stop-color="${escapeXml(c)}"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stopEls}</linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
  </svg>`;
}

/**
 * Wrap a composited screenshot in a "floating" backdrop: padding on a gradient
 * (or solid) background, rounded corners on the card, and a soft drop shadow.
 */
export async function applyFrame(
  content: Buffer,
  frame: ResolvedFrame,
  type: ImageType,
  quality?: number,
): Promise<Buffer> {
  const meta = await sharp(content).metadata();
  const cw = meta.width ?? 0;
  const ch = meta.height ?? 0;
  if (!cw || !ch) throw new Error('Frame content has no readable dimensions.');

  const pad = frame.padding;
  const radius = Math.max(0, Math.min(frame.radius, Math.floor(Math.min(cw, ch) / 2)));
  const canvasW = cw + pad * 2;
  const canvasH = ch + pad * 2;

  const background = Buffer.from(backgroundSvg(canvasW, canvasH, frame.background));

  // Round the card's corners by masking with a rounded rectangle.
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}"><rect width="${cw}" height="${ch}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`;
  const rounded = await sharp(content)
    .ensureAlpha()
    .composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }])
    .png()
    .toBuffer();

  const layers: sharp.OverlayOptions[] = [];

  if (frame.shadow && frame.shadowBlur > 0) {
    // Canvas-sized shadow silhouette (nudged down) so the blur never needs a
    // negative composite offset and clips cleanly at the canvas edges.
    const offsetY = Math.round(frame.shadowBlur * 0.4);
    const shadowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}"><rect x="${pad}" y="${pad + offsetY}" width="${cw}" height="${ch}" rx="${radius}" ry="${radius}" fill="rgb(0,0,0)" fill-opacity="${frame.shadowOpacity}"/></svg>`;
    const shadow = await sharp(Buffer.from(shadowSvg))
      .blur(Math.max(0.3, frame.shadowBlur))
      .png()
      .toBuffer();
    layers.push({ input: shadow, top: 0, left: 0 });
  }

  layers.push({ input: rounded, top: pad, left: pad });

  const out = sharp(background).composite(layers);
  return type === 'jpeg' ? out.jpeg({ quality: quality ?? 90 }).toBuffer() : out.png().toBuffer();
}
