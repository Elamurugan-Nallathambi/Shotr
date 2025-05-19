import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  clipboard,
  nativeImage,
  dialog,
  systemPreferences,
  Menu,
  shell,
  safeStorage,
  type NativeImage,
  type Tray,
} from 'electron';
import { createTray, rebuildTrayMenu, type TrayHandlers } from './tray.js';
import { join } from 'node:path';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import sharp from 'sharp';
import { captureLoginSession, validateConfig, resolveConfig, interpolateEnv } from 'shotr/engine';
import type { ConfigInput } from 'shotr/engine';
import { ProjectStore } from './projects.js';
import { runWebCapture } from './webcapture-run.js';
import {
  ENV_PASS,
  ENV_USER,
  formToConfigInput,
  fromYaml,
  toYaml,
  type WebCaptureForm,
} from './webconfig.js';
import { loadConfig, saveConfig, type CaptureMode, type DesktopConfig } from './config.js';
import { registerHotkeys, validateAccelerator } from './hotkey.js';
import { IPC } from './ipc.js';
import {
  captureScreen,
  captureWindowById,
  listWindows,
  triggerScreenAccess,
  type ScreenGrab,
} from './capture.js';
import { createPickerWindow, createRegionOverlay } from './region-overlay.js';
import { isUsableRect, toDeviceRect, type Rect } from './crop.js';
import { resolveCapturePath } from './naming.js';
import { saveImage as writeImageFile } from './save.js';

let config: DesktopConfig;
let controlWindow: BrowserWindow | null = null;
let webWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let projectStore: ProjectStore;

function webBaseDir(projectId: string): string {
  return join(app.getPath('userData'), 'web', projectId);
}
function webPaths(projectId: string): { shots: string; reports: string; session: string } {
  const base = webBaseDir(projectId);
  return { shots: join(base, 'shots'), reports: join(base, 'reports'), session: join(base, 'session.json') };
}

// Consistent app name across dev (`electron .`) and packaged builds.
app.setName('Shotr');

// In a packaged build the Chromium used for web capture is bundled inside the
// app (installed with PLAYWRIGHT_BROWSERS_PATH=0); point Playwright at it.
if (app.isPackaged) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

function rendererEntry(page: string): { url?: string; file?: string } {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) return { url: `${devUrl}/${page}` };
  return { file: join(__dirname, `../renderer/${page}`) };
}

function loadPage(win: BrowserWindow, page: string): void {
  const entry = rendererEntry(page);
  if (entry.url) void win.loadURL(entry.url);
  else void win.loadFile(entry.file as string);
}

// --- capture sessions ----------------------------------------------------
let regionSession: { grab: ScreenGrab; win: BrowserWindow; resolve: (img: NativeImage | null) => void } | null = null;
let pickerSession: { win: BrowserWindow; resolve: (img: NativeImage | null) => void } | null = null;
const editorImages = new Map<number, string>();

async function runCapture(mode: CaptureMode): Promise<void> {
  if (regionSession || pickerSession) return;
  const wasVisible = controlWindow?.isVisible() ?? false;
  controlWindow?.hide();
  await delay(160); // let our own window disappear before grabbing

  try {
    let image: NativeImage | null = null;
    if (mode === 'screen') image = (await captureScreen()).image;
    else if (mode === 'region') image = await captureRegion();
    else image = await captureWindow();

    if (image && !image.isEmpty()) {
      if (config.copyOnCapture) clipboard.writeImage(image);
      openEditor(image);
    }
  } catch (err) {
    dialog.showErrorBox('Capture failed', (err as Error).message);
  } finally {
    if (wasVisible) controlWindow?.show();
  }
}

function captureRegion(): Promise<NativeImage | null> {
  return captureScreen().then(
    (grab) =>
      new Promise<NativeImage | null>((resolve) => {
        const win = createRegionOverlay(grab.display);
        regionSession = { grab, win, resolve };
        // Fallback: show even if the renderer never signals ready.
        setTimeout(() => showOverlay(), 1200);
        win.on('closed', () => {
          if (regionSession) {
            regionSession.resolve(null);
            regionSession = null;
          }
        });
      }),
  );
}

/** Reveal the region overlay once its screenshot is loaded, and focus it. */
function showOverlay(): void {
  const win = regionSession?.win;
  if (win && !win.isDestroyed() && !win.isVisible()) {
    win.show();
    win.focus();
  }
}

function captureWindow(): Promise<NativeImage | null> {
  return new Promise<NativeImage | null>((resolve) => {
    const win = createPickerWindow();
    pickerSession = { win, resolve };
    win.on('closed', () => {
      if (pickerSession) {
        pickerSession.resolve(null);
        pickerSession = null;
      }
    });
  });
}

function openEditor(image: NativeImage): void {
  const size = image.getSize();
  const win = new BrowserWindow({
    width: Math.min(1400, Math.max(640, size.width + 40)),
    height: Math.min(900, Math.max(480, size.height + 120)),
    title: 'shotr — editor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  const wcId = win.webContents.id; // capture now; webContents is gone after 'closed'
  editorImages.set(wcId, image.toDataURL());
  win.on('closed', () => editorImages.delete(wcId));
  loadPage(win, 'editor.html');
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function openWebWindow(): void {
  if (webWindow && !webWindow.isDestroyed()) {
    webWindow.focus();
    return;
  }
  webWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 820,
    minHeight: 600,
    title: 'Shotr — Web Pages',
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  loadPage(webWindow, 'webcapture.html');
  webWindow.on('closed', () => {
    webWindow = null;
  });
}

/** Small PNG thumbnail (data URI) of a captured screenshot for the results UI. */
async function thumbify(filePath?: string): Promise<string | undefined> {
  if (!filePath || !existsSync(filePath)) return undefined;
  try {
    const buf = await sharp(filePath).resize({ width: 360, withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  }
}

function registerWebIpc(): void {
  ipcMain.on(IPC.webOpen, () => openWebWindow());
  ipcMain.handle(IPC.webListProjects, () => projectStore.list());
  ipcMain.handle(IPC.webGetProject, (_e, id: string) => projectStore.get(id));
  ipcMain.handle(IPC.webSaveProject, (_e, form: WebCaptureForm) => {
    projectStore.save(form);
    return { ok: true };
  });
  ipcMain.handle(IPC.webDeleteProject, (_e, id: string) => {
    projectStore.delete(id);
    return { ok: true };
  });

  ipcMain.handle(IPC.webRun, async (e, form: WebCaptureForm) => {
    const paths = webPaths(form.id);
    const env: Record<string, string> = {};
    if (form.auth.enabled) {
      if (form.auth.username) env[ENV_USER] = form.auth.username;
      if (form.auth.password) env[ENV_PASS] = form.auth.password;
    }
    try {
      const result = await runWebCapture(formToConfigInput(form), {
        outputDir: paths.shots,
        reportsDir: paths.reports,
        baseName: `${form.id}_${new Date().toISOString().slice(0, 10)}`,
        storageStatePath: paths.session,
        env,
        onProgress: (p) => {
          if (!e.sender.isDestroyed()) e.sender.send(IPC.webProgress, p);
        },
      });
      const m = result.manifest;
      const results = await Promise.all(
        m.results.map(async (r) => ({
          pageId: r.pageId,
          title: r.title,
          url: r.url,
          viewport: r.viewport,
          status: r.status,
          error: r.error,
          filePath: r.filePath,
          thumb: r.status === 'success' ? await thumbify(r.filePath) : undefined,
        })),
      );
      return {
        ok: true,
        summary: { total: m.total, successful: m.successful, failed: m.failed },
        results,
        reportPath: result.reportPaths.find((p) => p.endsWith('.html')),
        outputDir: result.outputDir,
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.webExportYaml, async (_e, form: WebCaptureForm) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `${form.id}.yaml`,
      filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
    });
    if (canceled || !filePath) return { ok: false };
    writeImageFile(filePath, Buffer.from(toYaml(form), 'utf8'));
    return { ok: true, filePath };
  });

  ipcMain.handle(IPC.webImportYaml, async (_e, id: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
    });
    if (canceled || !filePaths[0]) return { ok: false };
    try {
      return { ok: true, form: fromYaml(readFileSync(filePaths[0], 'utf8'), id) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  // --- Manual / SSO login: open a real browser, save the session on demand ---
  ipcMain.handle(IPC.webManualStart, (_e, form: WebCaptureForm) => startManualLogin(form));
  ipcMain.handle(IPC.webManualSave, () => finishManualLogin());
  ipcMain.on(IPC.webManualCancel, () => cancelManualLogin());

  ipcMain.handle(IPC.webSessionStatus, (_e, id: string) => ({
    exists: existsSync(webPaths(id).session),
  }));
  ipcMain.handle(IPC.webClearSession, (_e, id: string) => {
    const p = webPaths(id).session;
    if (existsSync(p)) rmSync(p);
    return { ok: true };
  });

  ipcMain.on(IPC.webOpenReport, (_e, path: string) => void shell.openPath(path));
  ipcMain.on(IPC.webOpenFolder, (_e, dir: string) => void shell.openPath(dir));
}

// Pending headed-login session (one at a time).
let manualPromptResolve: (() => void) | null = null;
let manualLoginPromise: Promise<string> | null = null;

function startManualLogin(form: WebCaptureForm): { ok: boolean; error?: string } {
  if (manualLoginPromise) return { ok: false, error: 'A login is already in progress.' };
  try {
    const input = formToConfigInput(form) as ConfigInput;
    const config = resolveConfig(validateConfig(interpolateEnv(input, process.env) as ConfigInput));
    config.auth.enabled = true;
    config.auth.storageState = webPaths(form.id).session;
    // captureLoginSession opens a headed browser, navigates to the login URL,
    // and awaits this prompt before saving the session (cookies + storage).
    const prompt = (): Promise<void> =>
      new Promise<void>((resolve) => {
        manualPromptResolve = resolve;
      });
    manualLoginPromise = captureLoginSession(config, prompt);
    manualLoginPromise.catch(() => {}); // handled in finish/cancel
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function finishManualLogin(): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!manualPromptResolve || !manualLoginPromise) return { ok: false, error: 'No login in progress.' };
  manualPromptResolve();
  manualPromptResolve = null;
  try {
    const path = await manualLoginPromise;
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    manualLoginPromise = null;
  }
}

function cancelManualLogin(): void {
  // Resolving the prompt lets captureLoginSession finish (it closes the browser
  // in its finally); we then ignore the saved path.
  if (manualPromptResolve) {
    manualPromptResolve();
    manualPromptResolve = null;
  }
  manualLoginPromise = null;
}

// --- IPC -----------------------------------------------------------------
function registerIpc(): void {
  ipcMain.on(IPC.capture, (_e, mode: CaptureMode) => void runCapture(mode));
  ipcMain.handle(IPC.getHotkeys, () => config.hotkeys);
  ipcMain.handle(IPC.setHotkey, (_e, mode: CaptureMode, accelerator: string) =>
    setHotkey(mode, accelerator),
  );
  ipcMain.handle(IPC.getPermission, () =>
    process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted',
  );
  ipcMain.handle(IPC.requestAccess, async () => {
    if (process.platform !== 'darwin') return 'granted';
    await triggerScreenAccess(); // registers the app + shows the OS prompt
    return systemPreferences.getMediaAccessStatus('screen');
  });
  ipcMain.on(IPC.closeControl, () => controlWindow?.close());
  ipcMain.on(IPC.minimizeControl, () => controlWindow?.minimize());
  ipcMain.handle(IPC.getBackground, () => config.runInBackground);
  ipcMain.on(IPC.setBackground, (_e, on: boolean) => applyBackgroundMode(on));
  ipcMain.on(IPC.resizeControl, (_e, height: number) => {
    if (!controlWindow) return;
    const h = Math.max(420, Math.min(940, Math.round(height)));
    const w = controlWindow.getSize()[0] ?? 520;
    controlWindow.setSize(w, h, false);
  });
  ipcMain.on(IPC.openSettings, () => {
    // Deep-link straight to System Settings → Privacy & Security → Screen Recording.
    const url =
      process.platform === 'darwin'
        ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
        : '';
    if (url) void shell.openExternal(url);
  });

  ipcMain.handle(IPC.regionImage, () => ({
    dataUrl: regionSession?.grab.image.toDataURL() ?? '',
    scaleFactor: regionSession?.grab.scaleFactor ?? 1,
  }));
  ipcMain.on(IPC.regionReady, () => showOverlay());
  ipcMain.on(IPC.regionComplete, (_e, rect: Rect) => finishRegion(rect));
  ipcMain.on(IPC.regionCancel, () => regionSession?.win.close());

  ipcMain.handle(IPC.listWindows, () => listWindows());
  ipcMain.on(IPC.captureWindow, (_e, id: string) => void finishWindow(id));
  ipcMain.on(IPC.pickerCancel, () => pickerSession?.win.close());

  ipcMain.handle(IPC.editorImage, (e) => editorImages.get(e.sender.id) ?? '');
  ipcMain.on(IPC.copyImage, (_e, dataUrl: string) =>
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl)),
  );
  ipcMain.handle(IPC.saveImage, (_e, dataUrl: string) => saveFromEditor(dataUrl));
}

function finishRegion(rect: Rect): void {
  const session = regionSession;
  if (!session) return;
  const { image, scaleFactor } = session.grab;
  const size = image.getSize();
  const dev = toDeviceRect(rect, scaleFactor, size.width, size.height);
  const cropped = isUsableRect(dev) ? image.crop(dev) : null;
  regionSession = null;
  session.win.close();
  session.resolve(cropped);
}

async function finishWindow(id: string): Promise<void> {
  const session = pickerSession;
  if (!session) return;
  try {
    const image = await captureWindowById(id);
    pickerSession = null;
    session.win.close();
    session.resolve(image);
  } catch {
    session.win.close();
  }
}

async function saveFromEditor(dataUrl: string): Promise<{ saved: boolean; filePath?: string }> {
  const img = nativeImage.createFromDataURL(dataUrl);
  const suggested = resolveCapturePath({ saveDir: config.saveDir, date: new Date(), format: config.format });
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: suggested,
    filters: [
      { name: 'PNG', extensions: ['png'] },
      { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
    ],
  });
  if (canceled || !filePath) return { saved: false };
  const buffer = /\.jpe?g$/i.test(filePath) ? img.toJPEG(config.jpegQuality) : img.toPNG();
  writeImageFile(filePath, buffer);
  return { saved: true, filePath };
}

// --- lifecycle -----------------------------------------------------------
function createControlWindow(): void {
  controlWindow = new BrowserWindow({
    width: 520,
    height: 620,
    resizable: false,
    frame: false, // fully frameless — no native traffic lights; we draw our own controls
    transparent: false,
    backgroundColor: '#0b1220',
    title: 'Shotr',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  loadPage(controlWindow, 'control.html');
  controlWindow.on('closed', () => {
    controlWindow = null;
  });
}

/** Show (or create) the control window, restoring the dock icon on macOS. */
function showControlWindow(): void {
  if (process.platform === 'darwin') app.dock?.show();
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.show();
    controlWindow.focus();
  } else {
    createControlWindow();
  }
}

function trayHandlers(): TrayHandlers {
  return {
    capture: (mode) => void runCapture(mode),
    openWeb: () => openWebWindow(),
    showControl: () => showControlWindow(),
    isBackground: () => config.runInBackground,
    setBackground: (on) => applyBackgroundMode(on),
  };
}

/**
 * Switch between a background menu-bar app (hidden from the dock/taskbar) and a
 * normal windowed app. Persists the choice and applies it immediately.
 */
function applyBackgroundMode(on: boolean): void {
  config.runInBackground = on;
  saveConfig(configPath(), config);
  if (process.platform === 'darwin') {
    if (on) app.dock?.hide();
    else void app.dock?.show();
  } else {
    // Windows/Linux: drop from the taskbar when running in the background.
    for (const win of BrowserWindow.getAllWindows()) win.setSkipTaskbar(on);
  }
  if (tray) rebuildTrayMenu(tray, trayHandlers());
}

/** A minimal app menu so standard shortcuts (Cmd+Q, copy/paste, etc.) work. */
function buildAppMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function applyHotkeys(): void {
  globalShortcut.unregisterAll();
  registerHotkeys(globalShortcut, config.hotkeys, (mode) => void runCapture(mode));
}

/** Validate + register a new hotkey, persisting it; revert on conflict. */
function setHotkey(
  mode: CaptureMode,
  accelerator: string,
): { ok: boolean; accelerator: string; error?: string } {
  if (!validateAccelerator(accelerator)) {
    return { ok: false, accelerator: config.hotkeys[mode], error: 'invalid' };
  }
  const previous = config.hotkeys[mode];
  config.hotkeys[mode] = accelerator;
  applyHotkeys();
  const stillRegistered = globalShortcut.isRegistered(accelerator);
  if (!stillRegistered) {
    config.hotkeys[mode] = previous;
    applyHotkeys();
    return { ok: false, accelerator: previous, error: 'in-use' };
  }
  saveConfig(configPath(), config);
  return { ok: true, accelerator };
}

app.whenReady().then(() => {
  // Custom dock icon during development (packaged builds get it from the bundle).
  if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
    try {
      app.dock.setIcon(join(__dirname, '../../build/icon.png'));
    } catch {
      /* icon optional */
    }
  }
  config = loadConfig(configPath());
  // Persist (defaults on first launch) so users have a file to edit.
  saveConfig(configPath(), config);
  projectStore = new ProjectStore(join(app.getPath('userData'), 'web-projects'), safeStorage);
  buildAppMenu();
  registerIpc();
  registerWebIpc();
  tray = createTray(trayHandlers());
  // Background mode: live in the menu bar with no window (and no dock on macOS).
  if (config.runInBackground) {
    if (process.platform === 'darwin') app.dock?.hide();
  } else {
    createControlWindow();
  }
  applyHotkeys();
  app.on('activate', () => showControlWindow());
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  tray?.destroy();
});

// The menu-bar / tray icon is the persistent UI, so closing all windows never
// quits the app (on any platform) — global hotkeys stay live and the tray gives
// access. The user quits explicitly via the tray "Quit Shotr" item or Cmd/Ctrl+Q.
app.on('window-all-closed', () => {
  /* keep running in the tray */
});
