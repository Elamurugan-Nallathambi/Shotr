import { chromium, firefox, webkit } from 'playwright';
import { createInterface } from 'node:readline/promises';
import type { ResolvedConfig } from '../core/types.js';
import type { PageLike } from '../capture/page-like.js';
import { resolveBrowser } from '../capture/browsers.js';
import { resolveLoginUrl, type LoginContext, type LoginContextFactory } from './setup.js';

const ENGINES = { chromium, firefox, webkit } as const;

/**
 * Real Playwright login context: launches a fresh browser (no stored state) so
 * scripted login starts from a clean session, and saves storage state on demand.
 */
export const openLoginContext: LoginContextFactory = async ({ browser, headed }) => {
  const { engine, channel } = resolveBrowser(browser);
  const instance = await ENGINES[engine].launch({
    headless: !headed,
    ...(channel ? { channel } : {}),
  });
  const context = await instance.newContext();
  const page = await context.newPage();
  const ctx: LoginContext = {
    page: page as unknown as PageLike,
    save: async (path) => {
      await context.storageState({ path });
    },
    close: async () => {
      await instance.close();
    },
  };
  return ctx;
};

/**
 * Open a headed browser at the login page, wait for the user to authenticate
 * manually, then persist the browser storage state to the configured path.
 */
export async function captureLoginSession(
  config: ResolvedConfig,
  prompt: (message: string) => Promise<unknown> = defaultPrompt,
): Promise<string> {
  const storageState = config.auth.storageState;
  if (!storageState) throw new Error('auth.storageState path is required to save a session.');

  const url = resolveLoginUrl(config);
  const { engine, channel } = resolveBrowser(config.browser);
  const browser = await ENGINES[engine].launch({ headless: false, ...(channel ? { channel } : {}) });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url);
    await prompt('Log in in the opened browser, then press Enter here to save the session… ');
    await context.storageState({ path: storageState });
    return storageState;
  } finally {
    await browser.close();
  }
}

async function defaultPrompt(message: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(message);
  } finally {
    rl.close();
  }
}
