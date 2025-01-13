import sharp from 'sharp';
import { escapeXml } from './header-renderer.js';
import type { Platform } from '../core/types.js';
import type { OsInput } from '../config/schema.js';

export const URLBAR_HEIGHT = 44;

/** Resolve an `os` config/CLI value (incl. `auto`) to a concrete platform. */
export function resolvePlatform(
  value?: OsInput,
  nodePlatform: NodeJS.Platform = process.platform,
): Platform {
  if (value && value !== 'auto') return value;
  if (nodePlatform === 'darwin') return 'macos';
  if (nodePlatform === 'win32') return 'windows';
  return 'linux';
}

/** Roughly truncate a URL to fit the address pill width. */
export function truncateUrl(url: string, maxChars: number): string {
  if (url.length <= maxChars) return url;
  if (maxChars <= 1) return '…';
  return `${url.slice(0, maxChars - 1)}…`;
}

interface Chrome {
  bg: string;
  controls: string;
  pillX: number;
  pillW: number;
}

/** Build the platform-specific window controls and the address-pill geometry. */
function buildChrome(width: number, platform: Platform): Chrome {
  const h = URLBAR_HEIGHT;
  const mid = h / 2;
  const rightPad = 16;

  if (platform === 'macos') {
    const dotR = 6;
    const controls = ['#ff5f57', '#febc2e', '#28c840']
      .map((c, i) => `<circle cx="${20 + i * 20}" cy="${mid}" r="${dotR}" fill="${c}"/>`)
      .join('');
    const pillX = 92;
    return { bg: '#e9ebee', controls, pillX, pillW: Math.max(40, width - pillX - rightPad) };
  }

  if (platform === 'windows') {
    // Flat minimize / maximize / close on the far right (Windows 10/11 style).
    const cw = 44;
    const startX = width - cw * 3;
    const stroke = '#4b5563';
    const c1 = startX + cw / 2;
    const c2 = startX + cw + cw / 2;
    const c3 = startX + cw * 2 + cw / 2;
    const controls = [
      `<line x1="${c1 - 6}" y1="${mid}" x2="${c1 + 6}" y2="${mid}" stroke="${stroke}" stroke-width="1.3"/>`,
      `<rect x="${c2 - 6}" y="${mid - 6}" width="12" height="12" fill="none" stroke="${stroke}" stroke-width="1.3"/>`,
      `<path d="M ${c3 - 6} ${mid - 6} L ${c3 + 6} ${mid + 6} M ${c3 + 6} ${mid - 6} L ${c3 - 6} ${mid + 6}" stroke="${stroke}" stroke-width="1.3"/>`,
    ].join('');
    const pillX = 16;
    return { bg: '#f3f3f3', controls, pillX, pillW: Math.max(40, startX - 8 - pillX) };
  }

  // linux (GNOME / Adwaita): round grey buttons with min / max / close on the right.
  const r = 11;
  const gap = 10;
  const cClose = width - rightPad - r;
  const cMax = cClose - (r * 2 + gap);
  const cMin = cMax - (r * 2 + gap);
  const stroke = '#3a3a3a';
  const btn = (cx: number) => `<circle cx="${cx}" cy="${mid}" r="${r}" fill="#d7d7d7"/>`;
  const controls = [
    btn(cMin),
    btn(cMax),
    btn(cClose),
    `<line x1="${cMin - 4}" y1="${mid + 3}" x2="${cMin + 4}" y2="${mid + 3}" stroke="${stroke}" stroke-width="1.4"/>`,
    `<rect x="${cMax - 4}" y="${mid - 4}" width="8" height="8" fill="none" stroke="${stroke}" stroke-width="1.4"/>`,
    `<path d="M ${cClose - 4} ${mid - 4} L ${cClose + 4} ${mid + 4} M ${cClose + 4} ${mid - 4} L ${cClose - 4} ${mid + 4}" stroke="${stroke}" stroke-width="1.4"/>`,
  ].join('');
  const pillX = 16;
  return { bg: '#ebebeb', controls, pillX, pillW: Math.max(40, cMin - r - 8 - pillX) };
}

/**
 * Render a fake browser address bar as a PNG buffer of the given pixel width.
 * The window controls match the requested platform (macOS dots on the left,
 * Windows/Linux min-max-close controls on the right).
 */
export async function renderUrlBar(
  width: number,
  url: string,
  platform: Platform = 'macos',
): Promise<Buffer> {
  const height = URLBAR_HEIGHT;
  const mid = height / 2;
  const { bg, controls, pillX, pillW } = buildChrome(width, platform);

  const pillH = height - 14;
  const pillY = 7;
  const lockX = pillX + 14;
  const textX = pillX + 30;
  const maxChars = Math.max(4, Math.floor((pillW - 40) / 7.2));
  const shown = truncateUrl(url, maxChars);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${bg}"/>
    ${controls}
    <rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#ffffff" stroke="#d0d4da"/>
    <path d="M ${lockX} ${mid - 4} a 3.5 3.5 0 0 1 7 0 v 2 h -7 z M ${lockX - 1} ${mid - 2} h 9 v 7 h -9 z" fill="#6b7280"/>
    <text x="${textX}" y="${mid + 4}" font-size="13" fill="#374151" font-family="-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif">${escapeXml(
      shown,
    )}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
