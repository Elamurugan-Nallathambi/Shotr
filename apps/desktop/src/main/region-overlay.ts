import { BrowserWindow, type Display } from 'electron';
import { join } from 'node:path';

function pageEntry(page: string): { url?: string; file?: string } {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) return { url: `${devUrl}/${page}` };
  return { file: join(__dirname, `../renderer/${page}`) };
}

/**
 * Create a frameless, always-on-top window covering the given display, used to
 * draw the frozen screenshot and capture a drag-selected region.
 */
export function createRegionOverlay(display: Display): BrowserWindow {
  const { x, y, width, height } = display.bounds;
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false, // shown only once the frozen screenshot has loaded (no black flash)
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  const entry = pageEntry('overlay.html');
  if (entry.url) void win.loadURL(entry.url);
  else void win.loadFile(entry.file as string);
  return win;
}

/** Create a centered window-picker window. */
export function createPickerWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 760,
    height: 520,
    title: 'shotr — pick a window',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  const entry = pageEntry('picker.html');
  if (entry.url) void win.loadURL(entry.url);
  else void win.loadFile(entry.file as string);
  return win;
}
