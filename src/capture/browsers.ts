import type { BrowserName } from '../config/schema.js';

export type PlaywrightEngine = 'chromium' | 'firefox' | 'webkit';

export interface ResolvedBrowser {
  /** The Playwright engine that backs the requested browser. */
  engine: PlaywrightEngine;
  /** Chromium channel for installed Chrome/Edge, when applicable. */
  channel?: string;
  /** Friendly label recorded in results/headers (e.g. "chrome", "safari"). */
  label: BrowserName;
}

/**
 * Map a friendly browser name to a Playwright engine (+ channel). Chrome and
 * Edge launch the installed browser via a Chromium channel; Safari maps to the
 * WebKit engine (Playwright cannot drive Safari.app, but it is the same engine).
 */
export function resolveBrowser(name: BrowserName): ResolvedBrowser {
  switch (name) {
    case 'chromium':
      return { engine: 'chromium', label: 'chromium' };
    case 'chrome':
      return { engine: 'chromium', channel: 'chrome', label: 'chrome' };
    case 'edge':
    case 'msedge':
      return { engine: 'chromium', channel: 'msedge', label: 'edge' };
    case 'firefox':
      return { engine: 'firefox', label: 'firefox' };
    case 'webkit':
      return { engine: 'webkit', label: 'webkit' };
    case 'safari':
      return { engine: 'webkit', label: 'safari' };
  }
}
