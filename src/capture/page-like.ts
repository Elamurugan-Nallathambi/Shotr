import type { WaitUntil } from '../config/schema.js';

/**
 * Minimal structural interfaces covering the Playwright surface shotr uses.
 * Playwright's real `Page`/`Locator` satisfy these, and tests can supply light
 * mocks without launching a browser.
 */

export interface ImageOptions {
  type?: 'png' | 'jpeg';
  quality?: number;
}

export interface LocatorLike {
  screenshot(opts?: ImageOptions): Promise<Buffer>;
}

export interface KeyboardLike {
  press(key: string): Promise<void>;
}

export interface PageLike {
  goto(url: string, opts?: { waitUntil?: WaitUntil; timeout?: number }): Promise<unknown>;
  title(): Promise<string>;
  waitForTimeout(ms: number): Promise<void>;
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<unknown>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  selectOption(selector: string, values: string | string[]): Promise<unknown>;
  hover(selector: string): Promise<void>;
  keyboard: KeyboardLike;
  evaluate(fn: (arg: never) => unknown, arg?: unknown): Promise<unknown>;
  screenshot(opts?: ImageOptions & { fullPage?: boolean }): Promise<Buffer>;
  locator(selector: string): LocatorLike;
}
