# shotr

> Capture screenshots — **web pages** (headless, config-driven) and your **screen** (native desktop app) — annotate, and export evidence reports. Cross-platform (macOS / Windows / Linux).

shotr is two things that share one engine:

1. **`shotr` CLI** — a config-driven web-page screenshot tool. Point it at a list of URLs (with optional login), and it captures consistent, headered screenshots across device profiles and exports **HTML / PDF / Word** reports. Runs like a test suite.
2. **shotr Desktop** — a native app (`apps/desktop`) for **region / window / full-screen** capture with an annotation editor, plus a UI front-end for the web-capture engine (no YAML, no terminal) and a menu-bar **background mode**.

---

## Contents

- [Install](#install)
- [CLI — web-page screenshots](#cli--web-page-screenshots)
  - [Config](#config) · [Profiles](#profiles) · [Browsers](#browsers) · [Full-page](#full-page-scrolled-capture) · [Header & OS bar](#header--url-bar) · [Floating frame](#floating-frame) · [Authentication](#authentication) · [Reports](#reports) · [Commands](#cli-commands)
- [Desktop app](#desktop-app)
  - [Screen capture & editor](#screen-capture--editor) · [Background / menu-bar mode](#background--menu-bar-mode) · [Web-capture UI](#web-capture-ui) · [Packaging](#packaging)
- [Development](#development)

---

## Install

```bash
git clone https://github.com/Elamurugan-Nallathambi/Shotr.git shotr && cd shotr
./setup.sh setup            # installs deps + Playwright Chromium + builds the CLI
```

> Uses **pnpm** (falls back to npm). Node 20+. The repo is a pnpm workspace: the
> root is the CLI, `apps/desktop` is the Electron app.

Run the CLI:

```bash
shotr capture -c configs/example.config.yaml --profile laptop
# or, without a global install:
node dist/cli/index.js capture -c configs/example.config.yaml
pnpm shotr capture -c configs/example.config.yaml     # dev (tsx)
```

---

## CLI — web-page screenshots

shotr opens each configured page at a device profile, runs optional setup
actions, captures the page, and stamps an **evidence header + fake browser URL
bar** onto the image. It doesn't assert behaviour — it captures, like a test
runner, for QA evidence, release notes, audits, and support.

### Config

A single YAML/JSON file (see [`configs/example.config.yaml`](configs/example.config.yaml)). Merge precedence: `defaults < profile < page < CLI flags`.

```yaml
projectName: Customer Portal
environment: QA
baseUrl: https://app.example.com

profiles:
  laptop:  { width: 1440, height: 900 }
  mobile:  { width: 390,  height: 844, deviceScaleFactor: 3, isMobile: true }

defaults:
  profile: laptop
  waitUntil: networkidle
  capture: { fullPage: true }

header:
  enabled: true
  os: macos            # URL-bar style: macos | windows | linux | auto

frame:
  enabled: false       # floating gradient backdrop

fileNamePattern: '{date}/{pageId}_{counter}.png'   # → shots/2026-01-02/home_001.png

pages:
  - id: home
    title: Home
    path: /
  - id: dashboard
    title: Dashboard
    path: /dashboard
    actions:
      - waitForSelector: '#ready'
      - click: '#expand'
      - wait: 500
    capture: { mode: fullPage }
```

### Profiles

Named viewport/device specs. Run a page set across several with `--profile laptop --profile mobile`. Fields: `width`, `height`, `deviceScaleFactor`, `isMobile`, `userAgent`.

### Browsers

`--browser <name>` (or `defaults.browser`) maps friendly names onto Playwright engines:

| Name | Engine | Notes |
| --- | --- | --- |
| `chromium` | Chromium | bundled (default) |
| `chrome` / `edge` | Chromium | your installed Chrome / Edge (channel) |
| `firefox` | Firefox | bundled (`pnpm exec playwright install firefox`) |
| `webkit` / `safari` | WebKit | bundled — Safari's engine |

### Full-page (scrolled) capture

`capture.fullPage: true` (or `--full-page`) captures the entire scrolled page and **auto-scrolls** first so lazy-loaded content renders. Disable auto-scroll with `autoScroll: false`.

### Header & URL bar

A header band + a fake browser address bar are composited on top of each shot. Toggle every field (`header.include*`), set `header.os` for the window-control style (macOS dots / Windows / Linux controls), add `notes`, etc.

### Floating frame

`frame.enabled: true` (or `--frame`) places the card on a gradient (or solid) backdrop with padding, rounded corners, and a soft shadow — the "beautiful screenshot" look. Configure `padding`, `radius`, `shadow*`, and `background` (gradient `from`/`to`/`angle` or `colors[]`, or `type: solid`).

### Authentication

For apps behind a login. shotr logs in **once**, saves the browser session
(`storageState`), then reuses it for every page.

**Scripted** (CI-friendly) — keep secrets in env vars:

```yaml
auth:
  enabled: true
  loginUrl: /login
  storageState: ./auth/session.json
  loginScript:
    - fill: { selector: '#user', value: '${LOGIN_USER}' }
    - fill: { selector: '#pass', value: '${LOGIN_PASS}' }
    - press: 'Enter'
    - waitForSelector: '#dashboard'
```

```bash
export LOGIN_USER=… LOGIN_PASS=…
shotr auth setup -c config.yaml     # log in once
shotr capture    -c config.yaml     # reuses the session (auto-logs in if missing)
```

**Manual / SSO** — `shotr auth login -c config.yaml` opens a real browser; sign in by hand (SSO/MFA), and the session is saved. `${VAR}` interpolation works anywhere in the config; secrets never live in the YAML.

### Reports

`--report html,pdf,word` writes to `./reports` (a JSON manifest is always written). Each report embeds a thumbnail, title, URL, profile, viewport, browser, timestamp, and status per capture. Regenerate without re-capturing: `shotr report -c config.yaml --from reports/<run>.json`.

### CLI commands

| Command | Purpose |
| --- | --- |
| `shotr init [-o config.yaml]` | Write a starter config |
| `shotr capture -c <config> [opts]` | Capture every page × profile |
| `shotr report -c <config> --from <run.json>` | Regenerate reports |
| `shotr auth setup -c <config>` | Scripted login → save session |
| `shotr auth login -c <config>` | Manual / SSO login → save session |

Capture flags: `--profile <name…>`, `--page <id…>`, `--tag <tag…>`, `--browser <name>`, `--full-page`, `--frame`, `--os <macos\|windows\|linux>`, `--headed`, `--out <dir>`, `--report <list>`, `--login`.

---

## Desktop app

A native capture + annotation app, companion to the CLI. Built with Electron + TypeScript.

```bash
pnpm --filter shotr-desktop dev        # or: ./setup.sh desktop
pnpm --filter shotr-desktop package    # build a standalone Shotr.app / installer
```

### Screen capture & editor

A frameless control window (and a menu-bar icon) with three modes:

| Mode | Default hotkey |
| --- | --- |
| Region (drag-select) | `Cmd/Ctrl + Shift + 4` |
| Window (pick) | `Cmd/Ctrl + Shift + 5` |
| Full screen | `Cmd/Ctrl + Shift + 3` |

Hotkeys are **editable** in the control window (click a shortcut chip). Each capture is **copied to the clipboard** and opens the **annotation editor** (Fabric.js): pencil, text, rectangle, ellipse, line, arrow — every object is selectable, movable, resizable. **Copy** or **Save** from the toolbar (`Cmd/Ctrl+Z` undo, `Delete`, `Cmd/Ctrl+C`).

> **macOS:** screen capture needs **Screen Recording** permission. The control window has a one-click guide that deep-links to the right Settings pane and registers the app in the list; toggle Shotr on and relaunch.

### Background / menu-bar mode

shotr lives in the **menu bar / system tray**. Right-click the tray icon for
Capture Region/Window/Screen, **Web Pages…**, **Show Control Window**, a **Run
in Background** toggle, and **Quit**. Closing the control window keeps the app
running in the tray with hotkeys active. Enable **Run in Background** to launch
straight into the tray with no window (and no dock icon on macOS) — a true
background capture tool.

### Web-capture UI

**Capture web pages** opens a builder that drives the CLI engine **in-process** — no YAML, no terminal:

- **Project**: name, base URL, environment — saved as **named projects** (passwords encrypted via the OS keychain).
- **Authentication**: *Username & password* (scripted) **or** *SSO / manual* — click **Log in in browser**, sign in via any SSO, then **Save session** (cookies + storage are stored and reused).
- **Pages**: add rows — title, path/URL, full-page, wait-for selector.
- **Settings**: viewport, browser, evidence header + OS bar, floating frame.
- **Run** → live per-page progress → a **thumbnail gallery** of results → **Open report** / **Open folder**.
- **Export / Import YAML** — fully interoperable with `shotr capture`.

### Packaging

The standalone build **bundles Chromium + Playwright + Sharp**, so web capture works with no terminal or dev environment:

```bash
pnpm --filter shotr-desktop package        # → apps/desktop/release/…/Shotr.app
```

Produces a `.dmg` (mac), `.exe` (win, nsis), or `.AppImage` (linux). Build on the target OS for that OS's installer. (The installer is large — ~800 MB — because Chromium is bundled.)

---

## Development

```bash
pnpm install
pnpm build && pnpm test          # root CLI: build + unit tests (+ coverage gate)
pnpm test:e2e                    # CLI end-to-end (real Chromium)
pnpm --filter shotr-desktop test # desktop unit tests
pnpm lint
```

- **CLI** (`src/`): config (`zod`) → capture (Playwright) → overlay (Sharp) → reports (HTML/PDF via Playwright, Word via `docx`). Engine is re-exported from `src/engine.ts` for embedding.
- **Desktop** (`apps/desktop/`): Electron main + preload + renderer (electron-vite), Fabric editor, reuses the CLI engine in-process. Pure logic is unit-tested; Electron/GUI code is verified by running.

## License

MIT
