# shotr

> Config-driven, cross-platform web screenshot capture tool with evidence headers.

**shotr** runs like a test runner — but instead of asserting behavior, it opens each
configured page at a defined viewport/device profile, runs optional setup actions,
captures the page, and stamps an **evidence header + fake browser URL bar** onto the
image. Captures are saved under `shots/` for QA evidence, release notes, audits, and
support.

Works on **macOS, Windows, and Linux** (Node + Playwright + Sharp).

## Quick start

```bash
git clone <repo> shotr && cd shotr
pnpm install
pnpm exec playwright install chromium

# edit configs/example.config.yaml, then:
pnpm shotr capture -c configs/example.config.yaml --profile laptop
```

## Commands

| Command | Purpose |
| --- | --- |
| `shotr init [-o config.yaml]` | Write a starter config file |
| `shotr capture -c <config> [opts]` | Capture screenshots for every page × profile |
| `shotr auth setup -c <config>` | Run the declarative `loginScript` once and save the session |
| `shotr auth login -c <config>` | Open a headed browser, log in manually, save the session |

## License

MIT
