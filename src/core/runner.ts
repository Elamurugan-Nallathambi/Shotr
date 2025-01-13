import { writeFile as fsWriteFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { BrowserName } from '../config/schema.js';
import type {
  CaptureResult,
  ResolvedCapture,
  ResolvedConfig,
  ResolvedPage,
  ResolvedProfile,
  RunManifest,
} from './types.js';
import { launchSession, type LaunchOptions, type Session } from '../capture/browser.js';
import type { PageLike } from '../capture/page-like.js';
import { resolveBrowser } from '../capture/browsers.js';
import { loadAndPrepare } from '../capture/page-runner.js';
import { captureScreenshot } from '../capture/screenshot.js';
import { applyOverlay } from '../overlay/compositor.js';
import { applyFrame } from '../overlay/frame-renderer.js';
import type { HeaderInfo } from '../overlay/header-renderer.js';
import { resolveOutputPath, ensureDirFor } from '../naming/paths.js';
import { finalizeManifest } from '../report/collector.js';
import { createLogger, type Logger } from './logger.js';

export interface RunOptions {
  profiles?: string[];
  pageIds?: string[];
  tags?: string[];
  browser?: BrowserName;
  headed?: boolean;
  outputDir?: string;
  /** Force full-page (scrolled) capture for every page, overriding config. */
  fullPage?: boolean;
}

export interface RunnerDeps {
  launchSession: (opts: LaunchOptions) => Promise<Session>;
  now: () => Date;
  writeFile: (path: string, data: Buffer) => Promise<void>;
  ensureDir: (filePath: string) => void;
  exists: (path: string) => boolean;
  logger: Logger;
}

const DEFAULT_PROFILE: ResolvedProfile = {
  name: 'default',
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  isMobile: false,
};

/** Resolve which profiles to run, synthesizing a default if none are defined. */
export function selectProfiles(config: ResolvedConfig, options: RunOptions): ResolvedProfile[] {
  const map = { ...config.profiles };
  if (Object.keys(map).length === 0) {
    map[DEFAULT_PROFILE.name] = DEFAULT_PROFILE;
  }
  const names =
    options.profiles && options.profiles.length > 0
      ? options.profiles
      : config.defaultProfile
        ? [config.defaultProfile]
        : Object.keys(map);

  return names.map((name) => {
    const profile = map[name];
    if (!profile) {
      throw new Error(`Unknown profile "${name}". Defined: ${Object.keys(map).join(', ') || '(none)'}.`);
    }
    return profile;
  });
}

/** Filter pages by id/tag selectors and per-page profile pinning. */
export function filterPages(
  pages: ResolvedPage[],
  selectors: { pageIds?: string[]; tags?: string[]; profileName: string },
): ResolvedPage[] {
  return pages.filter((page) => {
    if (selectors.pageIds && selectors.pageIds.length > 0 && !selectors.pageIds.includes(page.id)) {
      return false;
    }
    if (selectors.tags && selectors.tags.length > 0 && !page.tags.some((t) => selectors.tags!.includes(t))) {
      return false;
    }
    if (page.profile && page.profile !== selectors.profileName) return false;
    return true;
  });
}

function resolveDeps(deps?: Partial<RunnerDeps>): RunnerDeps {
  return {
    launchSession: deps?.launchSession ?? launchSession,
    now: deps?.now ?? (() => new Date()),
    writeFile: deps?.writeFile ?? ((path, data) => fsWriteFile(path, data)),
    ensureDir: deps?.ensureDir ?? ensureDirFor,
    exists: deps?.exists ?? existsSync,
    logger: deps?.logger ?? createLogger(),
  };
}

/**
 * Execute a capture run over every selected profile × page. Per-page failures
 * are recorded and do not abort the run. Returns a manifest of all results.
 */
export async function runCapture(
  config: ResolvedConfig,
  options: RunOptions = {},
  partialDeps?: Partial<RunnerDeps>,
): Promise<RunManifest> {
  const deps = resolveDeps(partialDeps);
  const browser = options.browser ?? config.browser;
  const browserLabel = resolveBrowser(browser).label;
  const outputDir = options.outputDir ?? config.outputDir;
  const profiles = selectProfiles(config, options);
  const startedAt = deps.now();
  const results: CaptureResult[] = [];

  for (const profile of profiles) {
    const pages = filterPages(config.pages, {
      pageIds: options.pageIds,
      tags: options.tags,
      profileName: profile.name,
    });
    if (pages.length === 0) continue;

    deps.logger.log(`Profile "${profile.name}" (${profile.width}x${profile.height}) — ${pages.length} page(s)`);
    const session = await deps.launchSession({ browser, profile, auth: config.auth, headed: options.headed });
    try {
      const pwPage = session.page as unknown as PageLike;
      for (const page of pages) {
        const capture = applyFullPageOverride(page.capture, options.fullPage);
        results.push(
          await capturePage(config, page, capture, profile, browserLabel, outputDir, deps, pwPage),
        );
      }
    } finally {
      await session.close();
    }
  }

  const manifest = finalizeManifest(
    { projectName: config.projectName, environment: config.environment, outputDir },
    results,
    startedAt,
    deps.now(),
  );
  return manifest;
}

/** Force full-page capture (with auto-scroll) when requested via CLI. */
export function applyFullPageOverride(capture: ResolvedCapture, force?: boolean): ResolvedCapture {
  if (!force) return capture;
  return { ...capture, mode: 'fullPage', autoScroll: true };
}

async function capturePage(
  config: ResolvedConfig,
  page: ResolvedPage,
  capture: ResolvedCapture,
  profile: ResolvedProfile,
  browser: BrowserName,
  outputDir: string,
  deps: RunnerDeps,
  pwPage: PageLike,
): Promise<CaptureResult> {
  const startedAt = deps.now();
  const viewport = `${profile.width}x${profile.height}`;
  const base: Omit<CaptureResult, 'status'> = {
    pageId: page.id,
    title: page.title,
    url: page.url,
    profile: profile.name,
    viewport,
    browser,
    startedAt: startedAt.toISOString(),
    durationMs: 0,
  };

  try {
    await loadAndPrepare(pwPage, { url: page.url, waitUntil: page.waitUntil, actions: page.actions });
    const shot = await captureScreenshot(pwPage, capture);

    const info: HeaderInfo = {
      projectName: config.projectName,
      environment: config.environment,
      pageTitle: page.title,
      url: page.url,
      capturedAt: startedAt,
      timestampFormat: config.timestampFormat,
      browser,
      viewport,
    };
    const composed = await applyOverlay(shot, {
      header: config.header,
      info,
      type: capture.type,
      quality: capture.quality,
    });
    const final = config.frame.enabled
      ? await applyFrame(composed, config.frame, capture.type, capture.quality)
      : composed;

    const filePath = resolveOutputPath({
      outputDir,
      pattern: page.fileName ?? config.fileNamePattern,
      extension: capture.type,
      exists: deps.exists,
      naming: {
        projectName: config.projectName,
        environment: config.environment,
        profile: profile.name,
        pageId: page.id,
        title: page.title,
        browser,
        date: startedAt,
      },
    });
    deps.ensureDir(filePath);
    await deps.writeFile(filePath, final);

    deps.logger.ok(`${page.id} → ${filePath}`);
    return { ...base, status: 'success', filePath, durationMs: deps.now().getTime() - startedAt.getTime() };
  } catch (err) {
    const message = (err as Error).message;
    deps.logger.err(`${page.id} failed: ${message}`);
    return { ...base, status: 'failed', error: message, durationMs: deps.now().getTime() - startedAt.getTime() };
  }
}
