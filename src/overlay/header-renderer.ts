import sharp from 'sharp';
import dayjs from 'dayjs';
import type { ResolvedHeader } from '../core/types.js';

export interface HeaderInfo {
  projectName: string;
  environment: string;
  pageTitle: string;
  url: string;
  capturedAt: Date;
  timestampFormat: string;
  browser: string;
  viewport: string;
  user?: string;
}

/** Escape a string for safe inclusion in SVG/XML text. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build the header text lines from the enabled fields. Pure (no rendering),
 * so the field-toggle logic is unit-testable on its own.
 */
export function buildHeaderLines(header: ResolvedHeader, info: HeaderInfo): string[] {
  const lines: string[] = [];

  const top: string[] = [];
  if (header.includeProjectName) top.push(`Project: ${info.projectName}`);
  if (header.includeEnvironment) top.push(`Env: ${info.environment}`);
  if (header.includePageTitle) top.push(`Page: ${info.pageTitle}`);
  if (top.length) lines.push(top.join('  |  '));

  if (header.includeUrl) lines.push(`URL: ${info.url}`);

  const bottom: string[] = [];
  if (header.includeTimestamp) {
    bottom.push(`Captured: ${dayjs(info.capturedAt).format(info.timestampFormat)}`);
  }
  if (header.includeBrowser) bottom.push(`Browser: ${info.browser}`);
  if (header.includeViewport) bottom.push(`Viewport: ${info.viewport}`);
  if (header.includeUser && info.user) bottom.push(`User: ${info.user}`);
  if (bottom.length) lines.push(bottom.join('  |  '));

  if (header.notes) lines.push(header.notes);

  return lines;
}

/** Render the header band as a PNG buffer of the given pixel width. */
export async function renderHeaderBand(
  width: number,
  header: ResolvedHeader,
  info: HeaderInfo,
): Promise<Buffer> {
  const lines = buildHeaderLines(header, info);
  const height = header.height;
  const padX = 18;
  const fontSize = lines.length > 3 ? 13 : 15;
  const lineGap = fontSize + 7;
  const blockHeight = lines.length * lineGap;
  const startY = Math.max(fontSize + 6, (height - blockHeight) / 2 + fontSize);

  const text = lines
    .map((line, i) => {
      const weight = i === 0 ? '600' : '400';
      const y = startY + i * lineGap;
      return `<text x="${padX}" y="${y}" font-size="${fontSize}" font-weight="${weight}" fill="${escapeXml(
        header.textColor,
      )}" font-family="-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif">${escapeXml(
        line,
      )}</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${escapeXml(header.background)}"/>
    ${text}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
