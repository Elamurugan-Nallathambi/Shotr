import type { BrowserName, ImageType, WaitUntil } from './schema.js';
import type { ResolvedCapture, ResolvedFrame, ResolvedHeader } from '../core/types.js';
import { resolvePlatform } from '../overlay/urlbar-renderer.js';

export const DEFAULT_OUTPUT_DIR = './shots';
export const DEFAULT_FILENAME_PATTERN = '{date}/{pageId}_{counter}.png';
export const DEFAULT_TIMESTAMP_FORMAT = 'YYYY-MM-DD HH:mm:ss';
export const DEFAULT_BROWSER: BrowserName = 'chromium';
export const DEFAULT_WAIT_UNTIL: WaitUntil = 'load';
export const DEFAULT_IMAGE_TYPE: ImageType = 'png';
export const DEFAULT_DEVICE_SCALE_FACTOR = 1;

export const DEFAULT_CAPTURE: ResolvedCapture = {
  mode: 'viewport',
  autoScroll: false,
  type: DEFAULT_IMAGE_TYPE,
};

export const DEFAULT_FRAME: ResolvedFrame = {
  enabled: false,
  padding: 64,
  radius: 12,
  shadow: true,
  shadowBlur: 28,
  shadowOpacity: 0.35,
  background: {
    type: 'gradient',
    color: '#1e293b',
    from: '#6366f1',
    to: '#a855f7',
    angle: 135,
  },
};

export const DEFAULT_HEADER: ResolvedHeader = {
  enabled: true,
  height: 96,
  includeProjectName: true,
  includeEnvironment: true,
  includePageTitle: true,
  includeUrl: true,
  includeTimestamp: true,
  includeViewport: true,
  includeBrowser: true,
  includeUrlBar: true,
  includeUser: false,
  os: resolvePlatform(),
  notes: '',
  background: '#1f2937',
  textColor: '#f9fafb',
};
