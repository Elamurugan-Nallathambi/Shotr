import type { WaitUntil } from '../config/schema.js';
import type { Action } from '../core/types.js';
import type { PageLike } from './page-like.js';
import { runActions } from './actions.js';

export interface PrepareOptions {
  url: string;
  waitUntil: WaitUntil;
  actions: Action[];
}

/** Navigate to the page URL, wait per `waitUntil`, then run any pre-capture actions. */
export async function loadAndPrepare(page: PageLike, opts: PrepareOptions): Promise<void> {
  await page.goto(opts.url, { waitUntil: opts.waitUntil });
  await runActions(page, opts.actions);
}
