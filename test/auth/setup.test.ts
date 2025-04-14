import { describe, it, expect } from 'vitest';
import { resolveLoginUrl, runScriptedLogin, type LoginContext } from '../../src/auth/setup.js';
import { resolveConfig, validateConfig } from '../../src/config/loader.js';
import { silentLogger } from '../../src/core/logger.js';
import type { PageLike } from '../../src/capture/page-like.js';

function cfg(extra: Record<string, unknown>) {
  return resolveConfig(
    validateConfig({ baseUrl: 'https://app.example.com', pages: [{ id: 'a', path: '/' }], ...extra }),
  );
}

describe('resolveLoginUrl', () => {
  it('uses an absolute loginUrl as-is', () => {
    expect(resolveLoginUrl(cfg({ auth: { loginUrl: 'https://auth.example.com/login' } }))).toBe(
      'https://auth.example.com/login',
    );
  });

  it('resolves a relative loginUrl against baseUrl', () => {
    expect(resolveLoginUrl(cfg({ auth: { loginUrl: '/signin' } }))).toBe(
      'https://app.example.com/signin',
    );
  });

  it('falls back to baseUrl when no loginUrl set', () => {
    expect(resolveLoginUrl(cfg({}))).toBe('https://app.example.com');
  });

  it('throws when neither loginUrl nor baseUrl can yield a URL', () => {
    const c = resolveConfig(validateConfig({ pages: [{ id: 'a', url: 'https://x.com' }] }));
    expect(() => resolveLoginUrl(c)).toThrow(/login URL/);
  });
});

/** Mock login context recording navigation, actions, and the saved path. */
function mockLogin() {
  const calls: Record<string, unknown[][]> = {};
  const rec =
    (name: string) =>
    (...args: unknown[]): Promise<unknown> => {
      (calls[name] ??= []).push(args);
      return Promise.resolve();
    };
  let savedPath: string | undefined;
  let closed = false;
  const page = {
    goto: rec('goto'),
    fill: rec('fill'),
    click: rec('click'),
    waitForSelector: rec('waitForSelector'),
    waitForTimeout: rec('waitForTimeout'),
    selectOption: rec('selectOption'),
    hover: rec('hover'),
    keyboard: { press: rec('press') },
    evaluate: rec('evaluate'),
  } as unknown as PageLike;
  const ctx: LoginContext = {
    page,
    save: async (p) => void (savedPath = p),
    close: async () => void (closed = true),
  };
  return { calls, ctx, get savedPath() { return savedPath; }, get closed() { return closed; } };
}

const loginCfg = cfg({
  auth: {
    enabled: true,
    storageState: './auth/session.json',
    loginUrl: '/login',
    loginScript: [
      { fill: { selector: '#user', value: 'alice' } },
      { fill: { selector: '#pass', value: 'secret' } },
      { click: '#submit' },
      { waitForSelector: '#dashboard' },
    ],
  },
});

describe('runScriptedLogin', () => {
  it('navigates, runs the login steps, and saves the session', async () => {
    const m = mockLogin();
    const path = await runScriptedLogin(loginCfg, { open: async () => m.ctx, logger: silentLogger });

    expect(path).toBe('./auth/session.json');
    expect(m.calls.goto).toEqual([['https://app.example.com/login', { waitUntil: 'load' }]]);
    expect(m.calls.fill).toEqual([
      ['#user', 'alice'],
      ['#pass', 'secret'],
    ]);
    expect(m.calls.click).toEqual([['#submit']]);
    expect(m.calls.waitForSelector).toEqual([['#dashboard']]);
    expect(m.savedPath).toBe('./auth/session.json');
    expect(m.closed).toBe(true);
  });

  it('passes the configured browser to the factory', async () => {
    let seen: string | undefined;
    const m = mockLogin();
    await runScriptedLogin(cfg({ defaults: { browser: 'chrome' }, auth: loginCfg.auth }), {
      open: async ({ browser }) => {
        seen = browser;
        return m.ctx;
      },
      logger: silentLogger,
    });
    expect(seen).toBe('chrome');
  });

  it('closes the context even if a login step throws', async () => {
    const m = mockLogin();
    const failing: LoginContext = {
      ...m.ctx,
      page: { ...m.ctx.page, goto: async () => { throw new Error('nav blew up'); } } as PageLike,
    };
    await expect(
      runScriptedLogin(loginCfg, { open: async () => failing, logger: silentLogger }),
    ).rejects.toThrow('nav blew up');
    expect(m.closed).toBe(true); // close() runs in finally
  });

  it('errors when storageState is missing', async () => {
    const c = cfg({ auth: { enabled: true, loginScript: [{ click: '#x' }] } });
    await expect(runScriptedLogin(c, { open: async () => mockLogin().ctx })).rejects.toThrow(
      /storageState/,
    );
  });

  it('errors when loginScript is empty', async () => {
    const c = cfg({ auth: { enabled: true, storageState: './s.json' } });
    await expect(runScriptedLogin(c, { open: async () => mockLogin().ctx })).rejects.toThrow(
      /loginScript/,
    );
  });

  it('errors when the login script still has unresolved ${VAR} references', async () => {
    const c = cfg({
      auth: {
        enabled: true,
        storageState: './s.json',
        loginScript: [{ fill: { selector: '#u', value: '${MISSING_VAR}' } }],
      },
    });
    await expect(runScriptedLogin(c, { open: async () => mockLogin().ctx })).rejects.toThrow(
      /MISSING_VAR/,
    );
  });
});
