import type { ResolvedConfig } from '../core/types.js';
import type { BrowserName } from '../config/schema.js';
import type { PageLike } from '../capture/page-like.js';
import { runActions } from '../capture/actions.js';
import { findUnresolvedEnvRefs } from '../config/loader.js';
import { type Logger, silentLogger } from '../core/logger.js';

/** Determine the URL to open for login (absolute loginUrl, or relative to baseUrl). */
export function resolveLoginUrl(config: ResolvedConfig): string {
  const { auth, baseUrl } = config;
  if (auth.loginUrl) {
    if (/^https?:\/\//.test(auth.loginUrl)) return auth.loginUrl;
    if (!baseUrl) throw new Error('auth.loginUrl is relative but no baseUrl is set.');
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return new URL(auth.loginUrl.replace(/^\//, ''), base).toString();
  }
  if (baseUrl) return baseUrl;
  throw new Error('Cannot determine a login URL: set auth.loginUrl or baseUrl.');
}

/** A browser context opened for login: a page to drive and a way to persist state. */
export interface LoginContext {
  page: PageLike;
  save: (storageStatePath: string) => Promise<void>;
  close: () => Promise<void>;
}

export type LoginContextFactory = (opts: {
  browser: BrowserName;
  headed: boolean;
}) => Promise<LoginContext>;

export interface ScriptedLoginDeps {
  open: LoginContextFactory;
  logger: Logger;
}

/**
 * Run the declarative `auth.loginScript` once: open the login page, perform the
 * steps (fill/click/wait/…), and save the resulting browser storage state so
 * subsequent captures reuse the authenticated session. Returns the saved path.
 *
 * The browser is supplied via a factory so the orchestration is unit-testable
 * without launching Playwright.
 */
export async function runScriptedLogin(
  config: ResolvedConfig,
  deps: Partial<ScriptedLoginDeps> & Pick<ScriptedLoginDeps, 'open'>,
): Promise<string> {
  const { auth } = config;
  if (!auth.storageState) {
    throw new Error('auth.storageState path is required to save a login session.');
  }
  if (auth.loginScript.length === 0) {
    throw new Error(
      'auth.loginScript has no steps. Add login steps, or use `shotr auth login` for manual login.',
    );
  }
  const unresolved = findUnresolvedEnvRefs(auth.loginScript);
  if (unresolved.length > 0) {
    throw new Error(
      `Login requires environment variable(s) that are not set: ${unresolved.join(', ')}.`,
    );
  }
  const logger = deps.logger ?? silentLogger;
  const url = resolveLoginUrl(config);

  logger.log(`Logging in at ${url} …`);
  const ctx = await deps.open({ browser: config.browser, headed: false });
  try {
    await ctx.page.goto(url, { waitUntil: 'load' });
    await runActions(ctx.page, auth.loginScript);
    await ctx.save(auth.storageState);
    logger.ok(`Saved login session to ${auth.storageState}`);
    return auth.storageState;
  } finally {
    await ctx.close();
  }
}
