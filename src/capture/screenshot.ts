import type { ResolvedCapture } from '../core/types.js';
import type { ImageOptions, PageLike } from './page-like.js';
import { autoScrollPage, scrollTo } from './actions.js';

function imageOptions(capture: ResolvedCapture): ImageOptions {
  const opts: ImageOptions = { type: capture.type };
  if (capture.type === 'jpeg' && capture.quality !== undefined) opts.quality = capture.quality;
  return opts;
}

/**
 * Capture a screenshot according to the resolved capture settings. Applies
 * optional pre-capture steps (waitForSelector, scrollTo, delay) in order.
 */
export async function captureScreenshot(
  page: PageLike,
  capture: ResolvedCapture,
): Promise<Buffer> {
  if (capture.waitForSelector) await page.waitForSelector(capture.waitForSelector);
  if (capture.autoScroll) await autoScrollPage(page);
  if (capture.scrollTo !== undefined) await scrollTo(page, capture.scrollTo);
  if (capture.delayMs) await page.waitForTimeout(capture.delayMs);

  const opts = imageOptions(capture);

  if (capture.mode === 'element') {
    if (!capture.selector) throw new Error('Capture mode "element" requires a selector.');
    return page.locator(capture.selector).screenshot(opts);
  }

  return page.screenshot({ ...opts, fullPage: capture.mode === 'fullPage' });
}
