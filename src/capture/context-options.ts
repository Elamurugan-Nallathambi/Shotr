import type { ResolvedAuth, ResolvedProfile } from '../core/types.js';

export interface BrowserContextOptions {
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch?: boolean;
  userAgent?: string;
  storageState?: string;
}

/**
 * Build Playwright `newContext` options from a profile and auth config. WebKit
 * does not support `isMobile`; callers targeting WebKit should drop it, but the
 * mapping itself is engine-agnostic here.
 */
export function buildContextOptions(
  profile: ResolvedProfile,
  auth: ResolvedAuth,
): BrowserContextOptions {
  const opts: BrowserContextOptions = {
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
  };
  if (profile.hasTouch !== undefined) opts.hasTouch = profile.hasTouch;
  if (profile.userAgent !== undefined) opts.userAgent = profile.userAgent;
  if (auth.enabled && auth.storageState) opts.storageState = auth.storageState;
  return opts;
}
