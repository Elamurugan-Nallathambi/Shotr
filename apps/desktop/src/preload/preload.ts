import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc.js';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Control window
contextBridge.exposeInMainWorld('shotr', {
  version: '0.1.0',
  capture: (mode: 'region' | 'window' | 'screen') => ipcRenderer.send(IPC.capture, mode),
  getHotkeys: () => ipcRenderer.invoke(IPC.getHotkeys),
  setHotkey: (mode: string, accelerator: string) =>
    ipcRenderer.invoke(IPC.setHotkey, mode, accelerator),
  getPermission: () => ipcRenderer.invoke(IPC.getPermission),
  requestAccess: () => ipcRenderer.invoke(IPC.requestAccess),
  getBackground: () => ipcRenderer.invoke(IPC.getBackground),
  setBackground: (on: boolean) => ipcRenderer.send(IPC.setBackground, on),
  openSettings: () => ipcRenderer.send(IPC.openSettings),
  close: () => ipcRenderer.send(IPC.closeControl),
  minimize: () => ipcRenderer.send(IPC.minimizeControl),
  resize: (height: number) => ipcRenderer.send(IPC.resizeControl, height),
});

// Region overlay
contextBridge.exposeInMainWorld('shotrRegion', {
  image: () => ipcRenderer.invoke(IPC.regionImage),
  ready: () => ipcRenderer.send(IPC.regionReady),
  complete: (rect: Rect) => ipcRenderer.send(IPC.regionComplete, rect),
  cancel: () => ipcRenderer.send(IPC.regionCancel),
});

// Window picker
contextBridge.exposeInMainWorld('shotrPicker', {
  list: () => ipcRenderer.invoke(IPC.listWindows),
  choose: (id: string) => ipcRenderer.send(IPC.captureWindow, id),
  cancel: () => ipcRenderer.send(IPC.pickerCancel),
});

// Editor
contextBridge.exposeInMainWorld('shotrEditor', {
  image: () => ipcRenderer.invoke(IPC.editorImage),
  copy: (dataUrl: string) => ipcRenderer.send(IPC.copyImage, dataUrl),
  save: (dataUrl: string) => ipcRenderer.invoke(IPC.saveImage, dataUrl),
});

// Web-page capture (builder window) + control-window opener
contextBridge.exposeInMainWorld('shotrWeb', {
  open: () => ipcRenderer.send(IPC.webOpen),
  listProjects: () => ipcRenderer.invoke(IPC.webListProjects),
  getProject: (id: string) => ipcRenderer.invoke(IPC.webGetProject, id),
  saveProject: (form: unknown) => ipcRenderer.invoke(IPC.webSaveProject, form),
  deleteProject: (id: string) => ipcRenderer.invoke(IPC.webDeleteProject, id),
  run: (form: unknown) => ipcRenderer.invoke(IPC.webRun, form),
  manualLoginStart: (form: unknown) => ipcRenderer.invoke(IPC.webManualStart, form),
  manualLoginSave: () => ipcRenderer.invoke(IPC.webManualSave),
  manualLoginCancel: () => ipcRenderer.send(IPC.webManualCancel),
  sessionStatus: (id: string) => ipcRenderer.invoke(IPC.webSessionStatus, id),
  clearSession: (id: string) => ipcRenderer.invoke(IPC.webClearSession, id),
  exportYaml: (form: unknown) => ipcRenderer.invoke(IPC.webExportYaml, form),
  importYaml: (id: string) => ipcRenderer.invoke(IPC.webImportYaml, id),
  openReport: (path: string) => ipcRenderer.send(IPC.webOpenReport, path),
  openFolder: (dir: string) => ipcRenderer.send(IPC.webOpenFolder, dir),
  onProgress: (cb: (p: { level: string; text: string }) => void) => {
    const handler = (_e: unknown, p: { level: string; text: string }) => cb(p);
    ipcRenderer.on(IPC.webProgress, handler);
    return () => ipcRenderer.removeListener(IPC.webProgress, handler);
  },
});
