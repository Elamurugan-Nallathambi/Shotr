# shotr

> Config-driven, cross-platform web screenshot capture tool with evidence headers and HTML/PDF/Word reports.

**shotr** runs like a test runner — but instead of asserting behavior, it opens each
configured page at a defined viewport/device profile, runs optional setup actions,
captures the page, and stamps an **evidence header + fake browser URL bar** onto the
image. Captures are saved under `shots/` and a run can be exported as **HTML, PDF, and
Word** reports for QA evidence, release notes, audits, and support.

Works on **macOS, Windows, and Linux** (Node + Playwright + Sharp).

## Quick start

```bash
git clone <repo> shotr && cd shotr
./setup.sh setup            # installs deps + Playwright Chromium + builds

# edit configs/example.config.yaml, then:
shotr capture -c configs/example.config.yaml --profile laptop
```

> No global install? Use `./setup.sh capture -c configs/example.config.yaml`
> or `pnpm shotr capture -c ...` during development.

## Commands

| Command | Purpose |
| --- | --- |
| `shotr init [-o config.yaml]` | Write a starter config file |
| `shotr capture -c <config> [opts]` | Capture screenshots for every page × profile |
| `shotr report -c <config> --from <run.json>` | Regenerate reports from a saved run manifest |
| `shotr auth setup -c <config>` | Run the declarative `loginScript` once and save the session |
| `shotr auth login -c <config>` | Open a headed browser, log in manually, save the session |

### `capture` options

| Flag | Description |
| --- | --- |
| `-c, --config <path>` | Config file (YAML or JSON) — required |
| `--profile <name...>` | One or more profiles to run (default: `defaults.profile`) |
| `--page <id...>` | Only capture these page ids |
| `--tag <tag...>` | Only capture pages with these tags |
| `--browser <name>` | `chromium` (default), `chrome`, `edge`, `firefox`, `webkit`, `safari` — see [Browsers](#browsers) |
| `--full-page` | Force full-page (scrolled) capture for every page, with auto-scroll |
| `--frame` | Wrap each screenshot in a floating gradient backdrop (shadow + rounded corners) |
| `--os <name>` | URL-bar window-control style: `macos`, `windows`, `linux`, `auto` |
| `--headed` | Run with a visible browser window |
| `--out <dir>` | Override output directory |
| `--report <list>` | Comma list of `html,pdf,word` (default: `html`) |

## Configuration

See [`configs/example.config.yaml`](configs/example.config.yaml). Highlights:

- **profiles** — named viewport/device specs; run a page set across many with `--profile`.
- **defaults** — applied to every page; merge precedence is `defaults < profile < page < CLI`.
- **header** — toggle each field (project, env, title, url, timestamp, viewport, browser) and the fake URL bar.
- **fileNamePattern** — tokens: `{projectName} {environment} {profile} {pageId} {title} {date} {timestamp} {counter} {browser}`. Default: `{date}/{pageId}_{counter}.png` under `shots/`.
- **auth** — reuse a saved Playwright `storageState` for authenticated apps.

## Browsers

Pick the browser per run with `--browser <name>`, or set `defaults.browser` in the
config. shotr drives Playwright's three engines and maps friendly names onto them:

| Name | Engine | Notes |
| --- | --- | --- |
| `chromium` | Chromium | Playwright's bundled Chromium (default; no extra install). |
| `chrome` | Chromium | Your installed **Google Chrome** (channel). Requires Chrome on the machine. |
| `edge` / `msedge` | Chromium | Your installed **Microsoft Edge** (channel). Requires Edge on the machine. |
| `firefox` | Firefox | Playwright's bundled Firefox. |
| `webkit` | WebKit | Playwright's bundled WebKit (Safari's engine). |
| `safari` | WebKit | Alias for `webkit`. Playwright can't drive Safari.app directly, but WebKit is the same engine Safari ships. |

```bash
shotr capture -c shotr.config.yaml --browser chrome
shotr capture -c shotr.config.yaml --browser edge
shotr capture -c shotr.config.yaml --browser safari   # WebKit engine
```

```yaml
defaults:
  browser: chrome
```

- **Bundled engines** (`chromium`, `firefox`, `webkit`/`safari`) are installed by
  `./setup.sh setup`. Add Firefox/WebKit with `pnpm exec playwright install firefox webkit`.
- **Channel browsers** (`chrome`, `edge`) launch the app already installed on your OS —
  nothing is downloaded, but the browser must be present.

## Floating frame (gradient backdrop)

Make screenshots look like a floating card on a gradient — padding, rounded
corners, and a soft drop shadow (CleanShot / ray.so style). Toggle per run with
`--frame`, or configure it under a top-level `frame` block:

```yaml
frame:
  enabled: true
  padding: 64          # space around the card, px
  radius: 12           # card corner radius, px
  shadow: true
  shadowBlur: 28
  shadowOpacity: 0.35
  background:
    type: gradient     # gradient | solid
    from: '#6366f1'
    to: '#a855f7'
    angle: 135         # gradient direction, degrees
```

```bash
shotr capture -c shotr.config.yaml --frame            # quick on
```

## Full-page (scrolled) capture

To capture the **entire scrolled page**, set `fullPage: true` (per page or in
`defaults.capture`), or pass `--full-page` on the CLI to force it for a whole run:

```yaml
defaults:
  capture:
    fullPage: true     # → mode: fullPage
    autoScroll: true   # (default when fullPage) scroll through the page first
```

## Pre-capture actions

Each page may run a sequence of actions before the screenshot is taken:

```yaml
pages:
  - id: order
    title: Order Details
    path: /orders/12345
    actions:
      - waitForSelector: '#order-summary'
      - click: '#expand-items'
      - fill: { selector: '#note', value: 'QA evidence' }
      - wait: 500
```

## Authentication

For apps behind a login, shotr logs in **once**, saves the browser session to
`storageState`, then reuses it for every page in the run.

### Scripted login (CI-friendly)

```yaml
auth:
  enabled: true
  loginUrl: /login
  storageState: ./auth/session.json
  loginScript:
    - fill: { selector: '#username', value: '${SHOTR_USER}' }
    - fill: { selector: '#password', value: '${SHOTR_PASS}' }
    - click: 'button[type=submit]'
    - waitForSelector: '#dashboard'
```

```bash
export SHOTR_USER='alice'
export SHOTR_PASS='…'
shotr auth setup -c shotr.config.yaml
shotr capture   -c shotr.config.yaml
```

### Manual login (SSO, captcha, MFA)

```bash
shotr auth login -c shotr.config.yaml
```

## Reports

`--report html,pdf,word` writes to `./reports`. Each report embeds a thumbnail,
page title, URL, profile, viewport, browser, timestamp, and status per capture.

## Development

```bash
pnpm install
pnpm test
pnpm lint
pnpm build
pnpm test:e2e    # requires Playwright browsers
```

## License

MIT
