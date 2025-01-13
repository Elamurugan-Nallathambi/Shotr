import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { RunManifest } from '../core/types.js';
import { ensureDirFor } from '../naming/paths.js';
import { prepareAssets } from './assets.js';
import { renderHtmlReport } from './html-report.js';
import { buildWordReport } from './word-report.js';
import { renderPdfFromHtml, type PdfPageFactory } from './pdf-report.js';

export type ReportFormat = 'html' | 'pdf' | 'word' | 'json';

export interface GenerateReportsOptions {
  formats: ReportFormat[];
  reportsDir: string;
  baseName?: string;
  pdfFactory?: PdfPageFactory;
}

const chromiumPdfFactory: PdfPageFactory = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  return { page, dispose: () => browser.close() };
};

/** Write the requested report formats for a run; returns the written paths. */
export async function generateReports(
  manifest: RunManifest,
  opts: GenerateReportsOptions,
): Promise<string[]> {
  const base = opts.baseName ?? 'report';
  const written: string[] = [];
  const want = new Set(opts.formats);

  const out = (file: string) => join(opts.reportsDir, file);
  const save = async (file: string, data: string | Buffer) => {
    const path = out(file);
    ensureDirFor(path);
    await writeFile(path, data);
    written.push(path);
  };

  if (want.has('json')) {
    await save(`${base}.json`, JSON.stringify(manifest, null, 2));
  }

  const needsAssets = want.has('html') || want.has('pdf') || want.has('word');
  if (!needsAssets) return written;

  const assets = await prepareAssets(manifest);

  let html: string | undefined;
  if (want.has('html') || want.has('pdf')) {
    html = renderHtmlReport(manifest, assets);
  }
  if (want.has('html') && html) {
    await save(`${base}.html`, html);
  }
  if (want.has('pdf') && html) {
    const pdf = await renderPdfFromHtml(html, opts.pdfFactory ?? chromiumPdfFactory);
    await save(`${base}.pdf`, pdf);
  }
  if (want.has('word')) {
    await save(`${base}.docx`, await buildWordReport(manifest, assets));
  }

  return written;
}
