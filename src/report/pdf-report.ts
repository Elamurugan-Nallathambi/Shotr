/**
 * PDF generation. We reuse a real browser to print the HTML report, which gives
 * high-fidelity layout. The browser/page is supplied via a factory so this
 * function stays unit-testable without launching Playwright.
 */

export interface PdfPage {
  setContent(html: string, opts?: { waitUntil?: 'load' | 'networkidle' }): Promise<void>;
  pdf(opts?: { format?: string; printBackground?: boolean }): Promise<Buffer>;
}

export interface PdfPageHandle {
  page: PdfPage;
  dispose: () => Promise<void>;
}

export type PdfPageFactory = () => Promise<PdfPageHandle>;

/** Render an HTML string to a PDF buffer using the provided page factory. */
export async function renderPdfFromHtml(html: string, factory: PdfPageFactory): Promise<Buffer> {
  const { page, dispose } = await factory();
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.pdf({ format: 'A4', printBackground: true });
  } finally {
    await dispose();
  }
}
