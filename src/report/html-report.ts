import { escapeXml } from '../overlay/header-renderer.js';
import type { RunManifest } from '../core/types.js';
import type { ImageAsset } from './assets.js';

/** Render a self-contained HTML report (images embedded as data URIs). */
export function renderHtmlReport(manifest: RunManifest, assets: ImageAsset[]): string {
  // Full-resolution images are collected once and opened by index, so a clicked
  // thumbnail opens the full image in a new tab without duplicating data in
  // every onclick attribute. (A plain <a href="data:…"> is blocked by Chrome
  // for top-level navigation, so we write the image into the opened tab.)
  const fulls: string[] = [];
  const cards = assets
    .map((a) => {
      let index = -1;
      if (a.fullDataUri) {
        index = fulls.length;
        fulls.push(a.fullDataUri);
      }
      return renderCard(a, index);
    })
    .join('\n');

  const script = `<script>
  const SHOTR_FULL = [${fulls.map((u) => JSON.stringify(u)).join(',')}];
  function shotrOpen(i) {
    const src = SHOTR_FULL[i];
    if (!src) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write('<!doctype html><title>shotr — full image</title><body style="margin:0;background:#0b0f17;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="' + src + '" style="max-width:100%;height:auto;display:block"></body>');
    w.document.close();
  }
  </script>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeXml(manifest.projectName)} — Screenshot Report</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 0; background: #f5f6f8; color: #1f2937; }
  header { background: #1f2937; color: #f9fafb; padding: 20px 28px; }
  header h1 { margin: 0 0 6px; font-size: 20px; }
  header .meta { font-size: 13px; opacity: .85; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; padding: 24px 28px; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .card img { width: 100%; display: block; border-bottom: 1px solid #eee; }
  .card img.zoom { cursor: zoom-in; }
  .card .hint { font-size: 11px; color: #6b7280; margin-top: 6px; }
  .card .body { padding: 12px 14px; }
  .card h2 { font-size: 15px; margin: 0 0 6px; }
  .card dl { margin: 0; font-size: 12px; color: #4b5563; display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; }
  .card dt { font-weight: 600; }
  .badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
  .badge.success { background: #dcfce7; color: #166534; }
  .badge.failed { background: #fee2e2; color: #991b1b; }
  .badge.skipped { background: #e5e7eb; color: #374151; }
  .err { color: #991b1b; font-size: 12px; margin-top: 6px; }
  a { color: inherit; word-break: break-all; }
</style>
</head>
<body>
<header>
  <h1>${escapeXml(manifest.projectName)} — Screenshot Report</h1>
  <div class="meta">Environment: ${escapeXml(manifest.environment)} &nbsp;·&nbsp; ${manifest.successful}/${manifest.total} captured &nbsp;·&nbsp; ${escapeXml(manifest.finishedAt)}</div>
</header>
<main class="grid">
${cards}
</main>
${script}
</body>
</html>`;
}

function renderCard(a: ImageAsset, fullIndex: number): string {
  let img = '';
  if (a.dataUri) {
    img =
      fullIndex >= 0
        ? `<img class="zoom" src="${a.dataUri}" alt="${escapeXml(a.title)}" title="Open full image in a new tab" onclick="shotrOpen(${fullIndex})"/>`
        : `<img src="${a.dataUri}" alt="${escapeXml(a.title)}"/>`;
  }
  const hint = fullIndex >= 0 ? '<div class="hint">Click image to open full size →</div>' : '';
  const err = a.error ? `<div class="err">${escapeXml(a.error)}</div>` : '';
  return `<section class="card">
  ${img}
  <div class="body">
    <h2>${escapeXml(a.title)} <span class="badge ${a.status}">${a.status}</span></h2>
    <dl>
      <dt>Page</dt><dd>${escapeXml(a.pageId)}</dd>
      <dt>Profile</dt><dd>${escapeXml(a.profile)} (${escapeXml(a.viewport)})</dd>
      <dt>Browser</dt><dd>${escapeXml(a.browser)}</dd>
      <dt>URL</dt><dd><a href="${escapeXml(a.url)}">${escapeXml(a.url)}</a></dd>
    </dl>
    ${hint}
    ${err}
  </div>
</section>`;
}
