import { existsSync } from 'node:fs';
import {
  interpolateEnv,
  validateConfig,
  resolveConfig,
  runScriptedLogin,
  openLoginContext,
  runCapture,
  generateReports,
} from 'shotr/engine';
import type { ConfigInput, Logger, RunManifest } from 'shotr/engine';

export interface WebProgress {
  level: 'log' | 'ok' | 'err';
  text: string;
}

export interface WebRunOptions {
  outputDir: string;
  reportsDir: string;
  baseName: string;
  /** Absolute path for the saved auth session. */
  storageStatePath: string;
  /** Credentials injected for ${LOGIN_USER}/${LOGIN_PASS}. */
  env?: Record<string, string>;
  onProgress?: (p: WebProgress) => void;
}

export interface WebRunResult {
  manifest: RunManifest;
  reportPaths: string[];
  outputDir: string;
}

/**
 * Run a web capture in-process using the shared engine: interpolate creds,
 * optionally perform scripted login, capture every page, and build an HTML
 * report. Mirrors what the CLI `capture` command does, driven from the UI.
 */
export async function runWebCapture(
  configInput: ConfigInput,
  opts: WebRunOptions,
): Promise<WebRunResult> {
  const logger: Logger = {
    log: (text) => opts.onProgress?.({ level: 'log', text }),
    ok: (text) => opts.onProgress?.({ level: 'ok', text }),
    warn: (text) => opts.onProgress?.({ level: 'log', text }),
    err: (text) => opts.onProgress?.({ level: 'err', text }),
  };

  // Resolve ${LOGIN_USER}/${LOGIN_PASS} (and any env refs) into the config.
  const env = { ...process.env, ...(opts.env ?? {}) };
  const interpolated = interpolateEnv(configInput, env) as ConfigInput;
  const config = resolveConfig(validateConfig(interpolated));

  // Use absolute, app-managed paths.
  config.auth.storageState = opts.storageStatePath;

  // Log in once if configured and no session exists yet.
  if (config.auth.enabled && config.auth.loginScript.length > 0) {
    if (!existsSync(opts.storageStatePath)) {
      logger.log('Logging in…');
      await runScriptedLogin(config, { open: openLoginContext, logger });
    }
  }

  const manifest = await runCapture(config, { outputDir: opts.outputDir }, { logger });
  const reportPaths = await generateReports(manifest, {
    formats: ['html', 'json'],
    reportsDir: opts.reportsDir,
    baseName: opts.baseName,
  });

  return { manifest, reportPaths, outputDir: opts.outputDir };
}
