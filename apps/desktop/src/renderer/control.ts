// Control window: trigger captures, edit shortcuts inline, custom window chrome.
type Mode = 'region' | 'window' | 'screen';

declare global {
  interface Window {
    shotr?: {
      version: string;
      capture: (mode: Mode) => void;
      getHotkeys: () => Promise<Record<Mode, string>>;
      setHotkey: (mode: Mode, accelerator: string) => Promise<{ ok: boolean; accelerator: string; error?: string }>;
      getPermission: () => Promise<string>;
      requestAccess: () => Promise<string>;
      getBackground: () => Promise<boolean>;
      setBackground: (on: boolean) => void;
      openSettings: () => void;
      close: () => void;
      minimize: () => void;
      resize: (height: number) => void;
    };
    shotrWeb?: { open: () => void };
  }
}

const api = window.shotr;

/** Pretty mac-style display for an Electron accelerator. */
function pretty(accelerator: string): string {
  return accelerator
    .replace(/CommandOrControl|Command|Cmd/g, '⌘')
    .replace(/Control|Ctrl/g, '⌃')
    .replace(/Alt|Option/g, '⌥')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, ' ');
}

/** Map a keydown to an Electron accelerator, or a sentinel/null. */
function toAccelerator(e: KeyboardEvent): string | null | 'cancel' {
  if (e.key === 'Escape') return 'cancel';
  const mods: string[] = [];
  if (e.metaKey) mods.push('CommandOrControl');
  if (e.ctrlKey && !e.metaKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const key = keyName(e);
  if (!key || mods.length === 0) return null;
  return [...mods, key].join('+');
}

function keyName(e: KeyboardEvent): string | null {
  const { key, code } = e;
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(key)) return null;
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1] as string;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1] as string;
  if (/^F\d{1,2}$/.test(key)) return key;
  if (key === ' ' || code === 'Space') return 'Space';
  if (key.startsWith('Arrow')) return key.slice(5);
  const named: Record<string, string> = { Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete' };
  if (named[key]) return named[key] as string;
  return key.length === 1 ? key.toUpperCase() : null;
}

const chips = new Map<Mode, HTMLButtonElement>();
let recording: Mode | null = null;

function chipFor(mode: Mode): HTMLButtonElement {
  return chips.get(mode) as HTMLButtonElement;
}

async function loadHotkeys(): Promise<void> {
  const keys = (await api?.getHotkeys()) ?? ({} as Record<Mode, string>);
  (['region', 'window', 'screen'] as Mode[]).forEach((mode) => {
    chipFor(mode).textContent = pretty(keys[mode] ?? '');
  });
}

function startRecording(mode: Mode): void {
  if (recording) stopRecording();
  recording = mode;
  const chip = chipFor(mode);
  chip.classList.remove('error');
  chip.classList.add('recording');
  chip.textContent = 'Press keys…';
}

function stopRecording(): void {
  if (!recording) return;
  chipFor(recording).classList.remove('recording');
  recording = null;
  void loadHotkeys();
}

async function commit(mode: Mode, accelerator: string): Promise<void> {
  const chip = chipFor(mode);
  const res = await api?.setHotkey(mode, accelerator);
  chip.classList.remove('recording');
  recording = null;
  if (res?.ok) {
    chip.textContent = pretty(res.accelerator);
    flashStatus(`Shortcut for ${mode} updated.`, false);
  } else {
    chip.classList.add('error');
    chip.textContent = pretty(res?.accelerator ?? '');
    flashStatus(res?.error === 'in-use' ? 'That shortcut is already in use.' : 'Invalid shortcut.', true);
    window.setTimeout(() => chip.classList.remove('error'), 1500);
  }
}

let statusTimer = 0;
function flashStatus(msg: string, warn: boolean): void {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.className = warn ? 'status warn' : 'status';
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    el.textContent = '';
    el.className = 'status';
  }, 2600);
}

// Wire rows + chips
(['region', 'window', 'screen'] as Mode[]).forEach((mode) => {
  const chip = document.querySelector<HTMLButtonElement>(`.hotkey[data-mode="${mode}"]`);
  if (chip) chips.set(mode, chip);
  chip?.addEventListener('click', (e) => {
    e.stopPropagation();
    startRecording(mode);
  });
  document.querySelector(`.row[data-mode="${mode}"]`)?.addEventListener('click', () => {
    if (!recording) api?.capture(mode);
  });
});

window.addEventListener('keydown', (e) => {
  if (!recording) return;
  e.preventDefault();
  const result = toAccelerator(e);
  if (result === 'cancel') return stopRecording();
  if (result === null) return; // wait for a real combo
  void commit(recording, result);
});

// App mode: Dock & Taskbar vs Menu bar only (background tray app)
function renderAppMode(background: boolean): void {
  document.querySelectorAll('#modeSeg button').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.bg === String(background));
  });
}
document.querySelectorAll('#modeSeg button').forEach((b) => {
  b.addEventListener('click', () => {
    const on = (b as HTMLElement).dataset.bg === 'true';
    api?.setBackground(on);
    renderAppMode(on);
  });
});
void api?.getBackground().then((bg) => renderAppMode(Boolean(bg)));

document.getElementById('webrow')?.addEventListener('click', () => window.shotrWeb?.open());
document.getElementById('close')?.addEventListener('click', () => api?.close());
document.getElementById('min')?.addEventListener('click', () => api?.minimize());

/** Resize the window to fit its content exactly (plus breathing room below). */
function fitWindow(): void {
  const h = Math.ceil(document.documentElement.scrollHeight) + 22;
  api?.resize(h);
}

async function checkPermission(): Promise<void> {
  const perm = await api?.getPermission();
  const card = document.getElementById('permission');
  if (card) card.hidden = !perm || perm === 'granted';
  fitWindow();
}

document.getElementById('open-settings')?.addEventListener('click', () => api?.openSettings());

document.getElementById('enable-access')?.addEventListener('click', async () => {
  const sub = document.getElementById('perm-sub');
  const status = await api?.requestAccess();
  if (status === 'granted') {
    void checkPermission();
    return;
  }
  // Registered with macOS; now guide them to the (now-populated) settings list.
  if (sub) sub.textContent = 'Shotr is now in the list — toggle it on, then relaunch.';
  api?.openSettings();
});

// Re-check when returning to the window (e.g. after granting in System Settings).
window.addEventListener('focus', () => void checkPermission());

window.addEventListener('load', fitWindow);
void loadHotkeys();
void checkPermission();
export {};
