import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export type ImageFormat = 'png' | 'jpeg';
export type CaptureMode = 'region' | 'window' | 'screen';

export interface Hotkeys {
  region: string;
  window: string;
  screen: string;
}

export interface DesktopConfig {
  hotkeys: Hotkeys;
  saveDir: string;
  format: ImageFormat;
  jpegQuality: number;
  copyOnCapture: boolean;
  /** Start hidden in the menu bar / tray (no control window) on launch. */
  runInBackground: boolean;
}

/** Built-in defaults (saveDir relative to the user's home). */
export function defaultConfig(home: string = homedir()): DesktopConfig {
  return {
    hotkeys: {
      region: 'CommandOrControl+Shift+4',
      window: 'CommandOrControl+Shift+5',
      screen: 'CommandOrControl+Shift+3',
    },
    saveDir: join(home, 'Pictures', 'shotr'),
    format: 'png',
    jpegQuality: 90,
    copyOnCapture: true,
    runInBackground: false,
  };
}

function clampQuality(value: unknown, fallback: number): number {
  return typeof value === 'number' && value >= 1 && value <= 100 ? Math.round(value) : fallback;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Merge a partial config over the defaults, sanitizing each field. */
export function mergeConfig(
  partial: Partial<DesktopConfig> | undefined,
  base: DesktopConfig = defaultConfig(),
): DesktopConfig {
  const p = partial ?? {};
  return {
    hotkeys: {
      region: isNonEmptyString(p.hotkeys?.region) ? p.hotkeys!.region : base.hotkeys.region,
      window: isNonEmptyString(p.hotkeys?.window) ? p.hotkeys!.window : base.hotkeys.window,
      screen: isNonEmptyString(p.hotkeys?.screen) ? p.hotkeys!.screen : base.hotkeys.screen,
    },
    saveDir: isNonEmptyString(p.saveDir) ? p.saveDir : base.saveDir,
    format: p.format === 'jpeg' || p.format === 'png' ? p.format : base.format,
    jpegQuality: clampQuality(p.jpegQuality, base.jpegQuality),
    copyOnCapture: typeof p.copyOnCapture === 'boolean' ? p.copyOnCapture : base.copyOnCapture,
    runInBackground:
      typeof p.runInBackground === 'boolean' ? p.runInBackground : base.runInBackground,
  };
}

/** Parse config JSON text; invalid JSON falls back to defaults (resilient). */
export function parseConfig(text: string, base: DesktopConfig = defaultConfig()): DesktopConfig {
  try {
    return mergeConfig(JSON.parse(text) as Partial<DesktopConfig>, base);
  } catch {
    return base;
  }
}

/** Load config from disk; a missing/unreadable file yields the defaults. */
export function loadConfig(filePath: string): DesktopConfig {
  if (!existsSync(filePath)) return defaultConfig();
  try {
    return parseConfig(readFileSync(filePath, 'utf8'));
  } catch {
    return defaultConfig();
  }
}

/** Persist config as pretty JSON, creating the directory if needed. */
export function saveConfig(filePath: string, config: DesktopConfig): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(config, null, 2));
}
