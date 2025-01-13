import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import type { BrowserName } from '../config/schema.js';
import type { ResolvedAuth, ResolvedProfile } from '../core/types.js';
import { buildContextOptions } from './context-options.js';
import { resolveBrowser } from './browsers.js';

const ENGINES = { chromium, firefox, webkit } as const;

export interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

export interface LaunchOptions {
  browser: BrowserName;
  profile: ResolvedProfile;
  auth: ResolvedAuth;
  headed?: boolean;
}

/** Launch a browser + context + page for one profile. Thin Playwright wrapper. */
export async function launchSession(opts: LaunchOptions): Promise<Session> {
  const { engine, channel } = resolveBrowser(opts.browser);
  const browser = await ENGINES[engine].launch({
    headless: !opts.headed,
    ...(channel ? { channel } : {}),
  });
  const ctxOpts = buildContextOptions(opts.profile, opts.auth);
  // WebKit rejects isMobile; strip it for that engine.
  const safeOpts = engine === 'webkit' ? { ...ctxOpts, isMobile: undefined } : ctxOpts;
  const context = await browser.newContext(safeOpts as Parameters<Browser['newContext']>[0]);
  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}
