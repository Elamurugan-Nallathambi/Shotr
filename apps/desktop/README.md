# shotr Desktop

A native screen-capture + annotation app (Shottr / CleanShot / Flameshot style),
companion to the `shotr` web-screenshot CLI. Built with Electron + TypeScript;
runs on macOS, Windows, and Linux.

- **Global hotkey** capture: region, window, or full screen.
- **Copied to the clipboard** automatically.
- Opens an **annotation editor** (Fabric.js): pencil, text, rectangle, ellipse,
  line, arrow — every object is selectable, movable, and resizable.
- **Copy** the annotated image or **Save** it (`<saveDir>/<date>/capture_NNN.png`).

It runs as a plain app — the hotkeys are active only while it's open.

## Run (development)

```bash
# from the repo root
pnpm install
pnpm --filter shotr-desktop dev
# or: ./setup.sh desktop
```

A small control window opens. Press a hotkey (defaults below) or click a button.

| Mode | Default hotkey |
| --- | --- |
| Region | `Cmd/Ctrl + Shift + 4` |
| Window | `Cmd/Ctrl + Shift + 5` |
| Screen | `Cmd/Ctrl + Shift + 3` |

## macOS permission

Screen capture requires **Screen Recording** permission:
**System Settings → Privacy & Security → Screen Recording → enable shotr**, then
**relaunch the app** (macOS requires a restart after granting). The control
window warns you if the permission is missing. (Windows/Linux need no special
permission.)

## Configuration

A JSON config is written to the app's userData dir on first launch
(`~/Library/Application Support/shotr/config.json` on macOS):

```json
{
  "hotkeys": {
    "region": "CommandOrControl+Shift+4",
    "window": "CommandOrControl+Shift+5",
    "screen": "CommandOrControl+Shift+3"
  },
  "saveDir": "~/Pictures/shotr",
  "format": "png",
  "jpegQuality": 90,
  "copyOnCapture": true
}
```

Hotkeys use Electron accelerator strings.

## Editor

| Tool | Notes |
| --- | --- |
| Select | Move / resize / rotate / delete objects |
| Pencil | Freehand draw |
| Text | Click to place; editable, movable, resizable |
| Rect / Ellipse / Line / Arrow | Drag to draw |

Color + size apply to new objects. Undo/redo, Delete, Copy, Save in the toolbar
(`Cmd/Ctrl+Z` undo, `Cmd/Ctrl+Shift+Z` redo, `Delete` removes selection,
`Cmd/Ctrl+C` copies).

## Build installers

```bash
pnpm --filter shotr-desktop package   # electron-vite build + electron-builder
```
Produces a `.dmg` (mac), `.exe` (win, nsis), or `.AppImage` (linux) in
`apps/desktop/release/`. Build on the target OS for that OS's installer.

## Tests

```bash
pnpm --filter shotr-desktop test       # unit tests (crop, naming, config, hotkey, editor-tools, ipc)
```
The Electron-touching code (main process, capture, overlay, Fabric wiring) is
verified by running the app; the pure logic is unit-tested with coverage gates.
