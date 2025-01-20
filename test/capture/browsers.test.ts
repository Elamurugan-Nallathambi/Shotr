import { describe, it, expect } from 'vitest';
import { resolveBrowser } from '../../src/capture/browsers.js';

describe('resolveBrowser', () => {
  it('maps chromium to the bundled engine with no channel', () => {
    expect(resolveBrowser('chromium')).toEqual({ engine: 'chromium', label: 'chromium' });
  });

  it('maps chrome and edge to chromium channels', () => {
    expect(resolveBrowser('chrome')).toEqual({ engine: 'chromium', channel: 'chrome', label: 'chrome' });
    expect(resolveBrowser('edge')).toEqual({ engine: 'chromium', channel: 'msedge', label: 'edge' });
    expect(resolveBrowser('msedge')).toEqual({ engine: 'chromium', channel: 'msedge', label: 'edge' });
  });

  it('maps firefox to its engine', () => {
    expect(resolveBrowser('firefox')).toEqual({ engine: 'firefox', label: 'firefox' });
  });

  it('maps webkit and safari to the WebKit engine', () => {
    expect(resolveBrowser('webkit')).toEqual({ engine: 'webkit', label: 'webkit' });
    expect(resolveBrowser('safari')).toEqual({ engine: 'webkit', label: 'safari' });
  });
});
