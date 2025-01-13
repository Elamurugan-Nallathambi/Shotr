import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { configInputSchema, type ConfigInput } from './schema.js';
import {
  DEFAULT_BROWSER,
  DEFAULT_CAPTURE,
  DEFAULT_DEVICE_SCALE_FACTOR,
  DEFAULT_FILENAME_PATTERN,
  DEFAULT_FRAME,
  DEFAULT_HEADER,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_TIMESTAMP_FORMAT,
  DEFAULT_WAIT_UNTIL,
} from './defaults.js';
import type {
  ResolvedAuth,
  ResolvedCapture,
  ResolvedConfig,
  ResolvedFrame,
  ResolvedHeader,
  ResolvedPage,
  ResolvedProfile,
} from '../core/types.js';
import type { CaptureInput } from './schema.js';
import { resolvePlatform } from '../overlay/urlbar-renderer.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const ENV_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Replace `${VAR}` references anywhere in the parsed config with environment
 * variables, keeping secrets out of the YAML file. Unset variables are left as
 * the literal `${VAR}` rather than failing — so a run that reuses a saved
 * session does not require the login credentials to be present. Code paths that
 * actually need a value (e.g. scripted login) validate it themselves via
 * `findUnresolvedEnvRefs`.
 */
export function interpolateEnv(raw: unknown, env: NodeJS.ProcessEnv = process.env): unknown {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.replace(ENV_RE, (match, name: string) => env[name] ?? match);
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };
  return walk(raw);
}

/** Collect any `${VAR}` references still present in a value (after interpolation). */
export function findUnresolvedEnvRefs(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(ENV_RE)) found.add(m[1]!);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return [...found];
}

/** Parse raw config text (YAML or JSON — YAML is a superset) into an object. */
export function parseConfigText(text: string): unknown {
  try {
    return parseYaml(text);
  } catch (err) {
    throw new ConfigError(`Failed to parse config: ${(err as Error).message}`);
  }
}

/** Validate a parsed object against the input schema, throwing readable errors. */
export function validateConfig(raw: unknown): ConfigInput {
  const result = configInputSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`Invalid config:\n${details}`);
  }
  return result.data;
}

function joinUrl(baseUrl: string | undefined, page: ConfigInput['pages'][number]): string {
  if (page.url) return page.url;
  if (!baseUrl) {
    throw new ConfigError(
      `Page "${page.id}" uses \`path\` but no top-level \`baseUrl\` is set.`,
    );
  }
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const path = (page.path ?? '').replace(/^\//, '');
  return new URL(path, base).toString();
}

function mergeCapture(
  defaultsCapture: CaptureInput | undefined,
  pageCapture: CaptureInput | undefined,
): ResolvedCapture {
  const merged: ResolvedCapture = { ...DEFAULT_CAPTURE };
  let fullPageFlag: boolean | undefined;
  let autoScrollFlag: boolean | undefined;
  for (const src of [defaultsCapture, pageCapture]) {
    if (!src) continue;
    if (src.mode !== undefined) merged.mode = src.mode;
    if (src.selector !== undefined) merged.selector = src.selector;
    if (src.waitForSelector !== undefined) merged.waitForSelector = src.waitForSelector;
    if (src.scrollTo !== undefined) merged.scrollTo = src.scrollTo;
    if (src.delayMs !== undefined) merged.delayMs = src.delayMs;
    if (src.type !== undefined) merged.type = src.type;
    if (src.quality !== undefined) merged.quality = src.quality;
    if (src.fullPage !== undefined) fullPageFlag = src.fullPage;
    if (src.autoScroll !== undefined) autoScrollFlag = src.autoScroll;
  }
  // The `fullPage` boolean is an ergonomic override of the viewport/fullPage
  // mode decision; an explicit element mode is left untouched.
  if (fullPageFlag !== undefined && merged.mode !== 'element') {
    merged.mode = fullPageFlag ? 'fullPage' : 'viewport';
  }
  if (merged.mode === 'element' && !merged.selector) {
    throw new ConfigError('Capture mode "element" requires a `selector`.');
  }
  // Auto-scroll defaults on for full-page captures (to load lazy content) unless
  // the user states otherwise.
  merged.autoScroll = autoScrollFlag ?? merged.mode === 'fullPage';
  return merged;
}

function resolveHeader(input: ConfigInput['header']): ResolvedHeader {
  const { os, ...rest } = input ?? {};
  return { ...DEFAULT_HEADER, ...stripUndefined(rest), os: resolvePlatform(os) };
}

function resolveFrame(input: ConfigInput['frame']): ResolvedFrame {
  const { background, ...rest } = input ?? {};
  return {
    ...DEFAULT_FRAME,
    ...stripUndefined(rest),
    background: { ...DEFAULT_FRAME.background, ...stripUndefined(background ?? {}) },
  };
}

function resolveAuth(input: ConfigInput['auth']): ResolvedAuth {
  return {
    enabled: input?.enabled ?? false,
    storageState: input?.storageState,
    loginUrl: input?.loginUrl,
    loginScript: input?.loginScript ?? [],
  };
}

function resolveProfiles(input: ConfigInput['profiles']): Record<string, ResolvedProfile> {
  const out: Record<string, ResolvedProfile> = {};
  for (const [name, p] of Object.entries(input ?? {})) {
    out[name] = {
      name,
      width: p.width,
      height: p.height,
      deviceScaleFactor: p.deviceScaleFactor ?? DEFAULT_DEVICE_SCALE_FACTOR,
      isMobile: p.isMobile ?? false,
      hasTouch: p.hasTouch,
      userAgent: p.userAgent,
    };
  }
  return out;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** Resolve a validated input config into a fully-defaulted ResolvedConfig. */
export function resolveConfig(input: ConfigInput): ResolvedConfig {
  const profiles = resolveProfiles(input.profiles);
  const defaults = input.defaults ?? {};
  const defaultProfile = defaults.profile;

  if (defaultProfile && !profiles[defaultProfile]) {
    throw new ConfigError(
      `defaults.profile "${defaultProfile}" is not defined in \`profiles\`.`,
    );
  }

  const pages: ResolvedPage[] = input.pages.map((page) => {
    if (page.profile && !profiles[page.profile]) {
      throw new ConfigError(
        `Page "${page.id}" references profile "${page.profile}" which is not defined.`,
      );
    }
    return {
      id: page.id,
      title: page.title ?? page.id,
      url: joinUrl(input.baseUrl, page),
      fileName: page.fileName,
      tags: page.tags ?? [],
      actions: page.actions ?? [],
      capture: mergeCapture(defaults.capture, page.capture),
      waitUntil: page.waitUntil ?? defaults.waitUntil ?? DEFAULT_WAIT_UNTIL,
      profile: page.profile,
    };
  });

  const ids = new Set<string>();
  for (const p of pages) {
    if (ids.has(p.id)) throw new ConfigError(`Duplicate page id "${p.id}".`);
    ids.add(p.id);
  }

  return {
    projectName: input.projectName ?? 'shotr',
    environment: input.environment ?? 'default',
    baseUrl: input.baseUrl,
    profiles,
    defaultProfile,
    browser: defaults.browser ?? DEFAULT_BROWSER,
    header: resolveHeader(input.header),
    frame: resolveFrame(input.frame),
    auth: resolveAuth(input.auth),
    fileNamePattern: input.fileNamePattern ?? DEFAULT_FILENAME_PATTERN,
    outputDir: defaults.outputDir ?? DEFAULT_OUTPUT_DIR,
    timestampFormat: defaults.timestampFormat ?? DEFAULT_TIMESTAMP_FORMAT,
    pages,
  };
}

/** Load, parse, validate, and resolve a config file from disk. */
export async function loadConfig(filePath: string): Promise<ResolvedConfig> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    throw new ConfigError(`Config file not found or unreadable: ${filePath}`);
  }
  return resolveConfig(validateConfig(interpolateEnv(parseConfigText(text))));
}
