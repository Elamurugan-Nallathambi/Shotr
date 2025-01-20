import { describe, it, expect, vi } from 'vitest';
import { autoScrollPage, runAction, runActions, scrollTo } from '../../src/capture/actions.js';
import { captureScreenshot } from '../../src/capture/screenshot.js';
import { loadAndPrepare } from '../../src/capture/page-runner.js';
import { buildContextOptions } from '../../src/capture/context-options.js';
import type { PageLike } from '../../src/capture/page-like.js';
import type { ResolvedAuth, ResolvedProfile } from '../../src/core/types.js';

type MockPage = PageLike & { calls: Record<string, unknown[][]> };

function mockPage(): MockPage {
  const calls: Record<string, unknown[][]> = {};
  const rec =
    (name: string, ret: unknown = undefined) =>
    (...args: unknown[]): Promise<unknown> => {
      (calls[name] ??= []).push(args);
      return Promise.resolve(ret);
    };
  const locatorShot = vi.fn().mockResolvedValue(Buffer.from('element'));
  return {
    calls,
    goto: rec('goto'),
    title: rec('title', 'Title'),
    waitForTimeout: rec('waitForTimeout'),
    waitForSelector: rec('waitForSelector'),
    click: rec('click'),
    fill: rec('fill'),
    selectOption: rec('selectOption'),
    hover: rec('hover'),
    keyboard: { press: rec('press') },
    evaluate: rec('evaluate'),
    screenshot: rec('screenshot', Buffer.from('page')),
    locator: (sel: string) => {
      (calls.locator ??= []).push([sel]);
      return { screenshot: locatorShot };
    },
  } as unknown as MockPage;
}

describe('runAction', () => {
  it('maps each action type to the right page call', async () => {
    const page = mockPage();
    await runAction(page, { wait: 500 });
    await runAction(page, { waitForSelector: '#x' });
    await runAction(page, { click: '#btn' });
    await runAction(page, { fill: { selector: '#in', value: 'hi' } });
    await runAction(page, { select: { selector: '#sel', value: 'opt' } });
    await runAction(page, { hover: '#h' });
    await runAction(page, { press: 'Enter' });

    expect(page.calls.waitForTimeout).toEqual([[500]]);
    expect(page.calls.waitForSelector).toEqual([['#x']]);
    expect(page.calls.click).toEqual([['#btn']]);
    expect(page.calls.fill).toEqual([['#in', 'hi']]);
    expect(page.calls.selectOption).toEqual([['#sel', 'opt']]);
    expect(page.calls.hover).toEqual([['#h']]);
    expect(page.calls.press).toEqual([['Enter']]);
  });

  it('throws on an unsupported action', async () => {
    const page = mockPage();
    await expect(runAction(page, { bogus: 1 } as never)).rejects.toThrow(/Unsupported action/);
  });
});

describe('scrollTo', () => {
  it('evaluates with a numeric offset', async () => {
    const page = mockPage();
    await scrollTo(page, 300);
    expect(page.calls.evaluate?.[0]?.[1]).toBe(300);
  });
  it('evaluates with a selector', async () => {
    const page = mockPage();
    await scrollTo(page, '#footer');
    expect(page.calls.evaluate?.[0]?.[1]).toBe('#footer');
  });
});

describe('autoScrollPage', () => {
  it('evaluates a scroll routine with default tuning', async () => {
    const page = mockPage();
    await autoScrollPage(page);
    expect(page.calls.evaluate).toHaveLength(1);
    expect(page.calls.evaluate![0]![1]).toEqual({ step: 600, delayMs: 100, maxScrolls: 100 });
  });

  it('passes through custom tuning', async () => {
    const page = mockPage();
    await autoScrollPage(page, { step: 200, delayMs: 50, maxScrolls: 10 });
    expect(page.calls.evaluate![0]![1]).toEqual({ step: 200, delayMs: 50, maxScrolls: 10 });
  });
});

describe('captureScreenshot — autoScroll', () => {
  it('auto-scrolls before capturing when enabled', async () => {
    const page = mockPage();
    await captureScreenshot(page, { mode: 'fullPage', autoScroll: true, type: 'png' });
    expect(page.calls.evaluate).toHaveLength(1); // the auto-scroll routine
    expect(page.calls.screenshot).toEqual([[{ type: 'png', fullPage: true }]]);
  });

  it('does not auto-scroll when disabled', async () => {
    const page = mockPage();
    await captureScreenshot(page, { mode: 'fullPage', autoScroll: false, type: 'png' });
    expect(page.calls.evaluate).toBeUndefined();
  });
});

describe('runActions', () => {
  it('runs actions in order', async () => {
    const page = mockPage();
    await runActions(page, [{ click: '#a' }, { wait: 10 }, { click: '#b' }]);
    expect(page.calls.click).toEqual([['#a'], ['#b']]);
    expect(page.calls.waitForTimeout).toEqual([[10]]);
  });
});

describe('captureScreenshot', () => {
  it('viewport mode → fullPage:false', async () => {
    const page = mockPage();
    await captureScreenshot(page, { mode: 'viewport', autoScroll: false, type: 'png' });
    expect(page.calls.screenshot).toEqual([[{ type: 'png', fullPage: false }]]);
  });

  it('fullPage mode → fullPage:true', async () => {
    const page = mockPage();
    await captureScreenshot(page, { mode: 'fullPage', autoScroll: false, type: 'png' });
    expect(page.calls.screenshot).toEqual([[{ type: 'png', fullPage: true }]]);
  });

  it('jpeg passes quality through', async () => {
    const page = mockPage();
    await captureScreenshot(page, { mode: 'viewport', autoScroll: false, type: 'jpeg', quality: 70 });
    expect(page.calls.screenshot).toEqual([[{ type: 'jpeg', quality: 70, fullPage: false }]]);
  });

  it('element mode uses a locator screenshot', async () => {
    const page = mockPage();
    const buf = await captureScreenshot(page, {
      mode: 'element',
      selector: '#card',
      autoScroll: false,
      type: 'png',
    });
    expect(page.calls.locator).toEqual([['#card']]);
    expect(buf.toString()).toBe('element');
  });

  it('element mode without a selector throws', async () => {
    const page = mockPage();
    await expect(
      captureScreenshot(page, { mode: 'element', autoScroll: false, type: 'png' }),
    ).rejects.toThrow(/selector/);
  });

  it('applies pre-capture wait/scroll/delay in order', async () => {
    const page = mockPage();
    await captureScreenshot(page, {
      mode: 'viewport',
      autoScroll: false,
      type: 'png',
      waitForSelector: '#ready',
      scrollTo: 200,
      delayMs: 50,
    });
    expect(page.calls.waitForSelector).toEqual([['#ready']]);
    expect(page.calls.evaluate?.[0]?.[1]).toBe(200);
    expect(page.calls.waitForTimeout).toEqual([[50]]);
  });
});

describe('loadAndPrepare', () => {
  it('navigates with waitUntil then runs actions', async () => {
    const page = mockPage();
    await loadAndPrepare(page, {
      url: 'https://x.com/p',
      waitUntil: 'networkidle',
      actions: [{ click: '#go' }],
    });
    expect(page.calls.goto).toEqual([['https://x.com/p', { waitUntil: 'networkidle' }]]);
    expect(page.calls.click).toEqual([['#go']]);
  });
});

describe('buildContextOptions', () => {
  const profile: ResolvedProfile = {
    name: 'laptop',
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    isMobile: true,
    userAgent: 'UA',
  };
  const noAuth: ResolvedAuth = { enabled: false, loginScript: [] };

  it('maps profile fields to context options', () => {
    expect(buildContextOptions(profile, noAuth)).toEqual({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      isMobile: true,
      userAgent: 'UA',
    });
  });

  it('includes storageState only when auth enabled with a path', () => {
    const auth: ResolvedAuth = { enabled: true, storageState: './s.json', loginScript: [] };
    expect(buildContextOptions(profile, auth).storageState).toBe('./s.json');
    expect(
      buildContextOptions(profile, { enabled: true, loginScript: [] }).storageState,
    ).toBeUndefined();
    expect(
      buildContextOptions(profile, { enabled: false, storageState: './s.json', loginScript: [] })
        .storageState,
    ).toBeUndefined();
  });
});
