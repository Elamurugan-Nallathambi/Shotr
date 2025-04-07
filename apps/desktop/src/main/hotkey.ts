import type { CaptureMode, Hotkeys } from './config.js';

const MODIFIERS = new Set([
  'Command',
  'Cmd',
  'Control',
  'Ctrl',
  'CommandOrControl',
  'CmdOrCtrl',
  'Alt',
  'Option',
  'AltGr',
  'Shift',
  'Super',
  'Meta',
]);

/**
 * Validate an Electron accelerator string: at least one modifier plus a final
 * non-modifier key (e.g. `CommandOrControl+Shift+4`).
 */
export function validateAccelerator(accelerator: string): boolean {
  if (typeof accelerator !== 'string') return false;
  const parts = accelerator
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return false;
  const key = parts[parts.length - 1]!;
  const mods = parts.slice(0, -1);
  if (!mods.every((m) => MODIFIERS.has(m))) return false;
  if (MODIFIERS.has(key)) return false;
  return key.length >= 1;
}

/** Minimal slice of Electron's globalShortcut we use (injectable for tests). */
export interface GlobalShortcutLike {
  register(accelerator: string, callback: () => void): boolean;
  unregisterAll(): void;
}

export interface HotkeyFailure {
  mode: CaptureMode;
  accelerator: string;
  reason: 'invalid' | 'register-failed';
}

export interface HotkeyResult {
  registered: { mode: CaptureMode; accelerator: string }[];
  failed: HotkeyFailure[];
}

const MODES: CaptureMode[] = ['region', 'window', 'screen'];

/** Register each configured hotkey; returns which succeeded and which failed. */
export function registerHotkeys(
  globalShortcut: GlobalShortcutLike,
  hotkeys: Hotkeys,
  onTrigger: (mode: CaptureMode) => void,
): HotkeyResult {
  const result: HotkeyResult = { registered: [], failed: [] };
  for (const mode of MODES) {
    const accelerator = hotkeys[mode];
    if (!validateAccelerator(accelerator)) {
      result.failed.push({ mode, accelerator, reason: 'invalid' });
      continue;
    }
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, () => onTrigger(mode));
    } catch {
      ok = false;
    }
    if (ok) result.registered.push({ mode, accelerator });
    else result.failed.push({ mode, accelerator, reason: 'register-failed' });
  }
  return result;
}
