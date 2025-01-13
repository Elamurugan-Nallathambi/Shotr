import type { Action } from '../core/types.js';
import type { PageLike } from './page-like.js';

/** Scroll to a pixel offset (number) or scroll an element into view (selector). */
export async function scrollTo(page: PageLike, target: number | string): Promise<void> {
  if (typeof target === 'number') {
    await page.evaluate(((y: number) => window.scrollTo(0, y)) as never, target);
  } else {
    await page.evaluate(
      ((sel: string) => document.querySelector(sel)?.scrollIntoView()) as never,
      target,
    );
  }
}

export interface AutoScrollOptions {
  step?: number;
  delayMs?: number;
  maxScrolls?: number;
}

/**
 * Scroll from top to bottom in steps (triggering lazy-loaded / infinite content)
 * then return to the top, ready for a full-page capture.
 */
export async function autoScrollPage(page: PageLike, opts: AutoScrollOptions = {}): Promise<void> {
  const args = {
    step: opts.step ?? 600,
    delayMs: opts.delayMs ?? 100,
    maxScrolls: opts.maxScrolls ?? 100,
  };
  await page.evaluate(
    (({ step, delayMs, maxScrolls }: AutoScrollOptions & { step: number; delayMs: number; maxScrolls: number }) =>
      new Promise<void>((resolve) => {
        let scrolled = 0;
        let count = 0;
        const timer = setInterval(() => {
          const height = document.body.scrollHeight;
          window.scrollBy(0, step);
          scrolled += step;
          count += 1;
          if (scrolled >= height || count >= maxScrolls) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, delayMs);
      })) as never,
    args,
  );
}

/** Execute a single declarative action against the page. */
export async function runAction(page: PageLike, action: Action): Promise<void> {
  if ('wait' in action) return void (await page.waitForTimeout(action.wait));
  if ('waitForSelector' in action) return void (await page.waitForSelector(action.waitForSelector));
  if ('click' in action) return void (await page.click(action.click));
  if ('fill' in action) return void (await page.fill(action.fill.selector, action.fill.value));
  if ('select' in action) {
    return void (await page.selectOption(action.select.selector, action.select.value));
  }
  if ('scroll' in action) return scrollTo(page, action.scroll);
  if ('hover' in action) return void (await page.hover(action.hover));
  if ('press' in action) return void (await page.keyboard.press(action.press));
  throw new Error(`Unsupported action: ${JSON.stringify(action)}`);
}

/** Run a sequence of actions in order. */
export async function runActions(page: PageLike, actions: Action[]): Promise<void> {
  for (const action of actions) {
    await runAction(page, action);
  }
}
