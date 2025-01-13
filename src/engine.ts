/**
 * Library entry for embedding the web-capture engine in other apps (e.g. the
 * desktop UI). Re-exports the config + capture + report pipeline so callers can
 * run a capture in-process without going through the CLI.
 */
export {
  validateConfig,
  resolveConfig,
  parseConfigText,
  interpolateEnv,
  findUnresolvedEnvRefs,
  loadConfig,
  ConfigError,
} from './config/loader.js';
export { runScriptedLogin, resolveLoginUrl } from './auth/setup.js';
export { openLoginContext, captureLoginSession } from './auth/session.js';
export { runCapture } from './core/runner.js';
export type { RunOptions, RunnerDeps } from './core/runner.js';
export { createLogger, silentLogger, type Logger } from './core/logger.js';
export { finalizeManifest } from './report/collector.js';
export { generateReports, type ReportFormat } from './report/index.js';
export type {
  ConfigInput,
  CaptureInput,
  HeaderInput,
  PageInput,
  BrowserName,
  OsInput,
} from './config/schema.js';
export type {
  ResolvedConfig,
  CaptureResult,
  RunManifest,
} from './core/types.js';
