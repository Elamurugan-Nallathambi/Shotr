import { Tray, Menu, nativeImage } from 'electron';
import type { CaptureMode } from './config.js';

// Embedded so the icon is available with no file path (works in dev + packaged).
const TRAY_ICON_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAABR0lEQVR4nO2XQU7DMBBFX7KlWZR9VrQ9BAi4E80eOEK7i1QBPQaUI1Cx4RCUM0CDLH1LEWQgba0Eon5ppMiezHx7fsYO7PHHEAF9w6Im4iRAYdgLENdIHsvXipP8GwJpwBKk2xBICIekcwRGQAbkMvc8DEEgloAswbmX58BHhbjc2C3Q2yLuNwFFRvJnJVsD98Cl7EFjbm5pkLDi1sZcCV6B44r5E2AlnxsCY6QtXhvJPU7l43wHIQlkWpnbdo9DYCpz37rHQr7jkARyBXX19piWBDgpjV9pLO8UgayiBH0lnhgluAhJYFgSoVO7hTP5vANHBMadVraS2r/iHHiTz2yXRNEPjWhZakQL1fsaeCw1oifgYIO4G7XMnpqM1Ypnu7bipOahMdB37g+j8S81795x3AiBtO0rWdH2pbRog0DU9o/JHjSNT8a9s8RBoswZAAAAAElFTkSuQmCC';

export interface TrayHandlers {
  capture: (mode: CaptureMode) => void;
  openWeb: () => void;
  showControl: () => void;
  isBackground: () => boolean;
  setBackground: (on: boolean) => void;
}

/** Create the menu-bar / system-tray icon with its menu. */
export function createTray(handlers: TrayHandlers): Tray {
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_PNG}`);
  icon.setTemplateImage(true); // adapts to light/dark menu bar on macOS
  const tray = new Tray(icon);
  tray.setToolTip('Shotr — screen capture');
  rebuildTrayMenu(tray, handlers);
  return tray;
}

/** (Re)build the tray menu — call after the background toggle changes. */
export function rebuildTrayMenu(tray: Tray, h: TrayHandlers): void {
  const menu = Menu.buildFromTemplate([
    { label: 'Capture Region', click: () => h.capture('region') },
    { label: 'Capture Window', click: () => h.capture('window') },
    { label: 'Capture Screen', click: () => h.capture('screen') },
    { type: 'separator' },
    { label: 'Web Pages…', click: () => h.openWeb() },
    { type: 'separator' },
    { label: 'Show Control Window', click: () => h.showControl() },
    {
      label: 'Run in Background',
      type: 'checkbox',
      checked: h.isBackground(),
      click: (item) => {
        h.setBackground(item.checked);
        rebuildTrayMenu(tray, h);
      },
    },
    { type: 'separator' },
    { label: 'Quit Shotr', role: 'quit' },
  ]);
  tray.setContextMenu(menu);
}
