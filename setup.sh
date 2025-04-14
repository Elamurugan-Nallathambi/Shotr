#!/usr/bin/env bash
#
# shotr — project control script
# Cross-platform (macOS / Linux / Windows-via-Git-Bash) helper for setup and dev tasks.
#
# Usage: ./setup.sh <command>
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Colored output helpers
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  C_RESET="$(printf '\033[0m')"; C_BLUE="$(printf '\033[34m')"
  C_GREEN="$(printf '\033[32m')"; C_YELLOW="$(printf '\033[33m')"; C_RED="$(printf '\033[31m')"
else
  C_RESET=""; C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi
log()  { printf '%s[shotr]%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok()   { printf '%s[ ok ]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
err()  { printf '%s[fail]%s %s\n' "$C_RED" "$C_RESET" "$*" 1>&2; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# Prerequisite + package-manager detection
# ---------------------------------------------------------------------------
PM=""
detect_pm() {
  if command -v pnpm >/dev/null 2>&1; then PM="pnpm";
  elif command -v npm >/dev/null 2>&1; then PM="npm";
  else err "Neither pnpm nor npm found. Install Node.js 20+ first."; exit 1; fi
}

check_prereqs() {
  if ! command -v node >/dev/null 2>&1; then
    err "Node.js not found. Install Node.js 20+ (https://nodejs.org)."; exit 1
  fi
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -lt 20 ]; then
    err "Node.js >=20 required (found $(node --version))."; exit 1
  fi
  detect_pm
  ok "Node $(node --version), using $PM"
}

run_pm() { if [ "$PM" = "pnpm" ]; then pnpm "$@"; else npm run "$@"; fi; }
pm_install() { if [ "$PM" = "pnpm" ]; then pnpm install; else npm install; fi; }
pm_exec() { if [ "$PM" = "pnpm" ]; then pnpm exec "$@"; else npx "$@"; fi; }

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
cmd_setup() {
  check_prereqs
  log "Installing dependencies…"
  pm_install
  log "Installing Playwright Chromium browser…"
  pm_exec playwright install chromium
  log "Building TypeScript…"
  run_pm build || warn "Build failed — run after sources are present."
  ok "Setup complete. Try: ./setup.sh capture -- -c configs/example.config.yaml"
}

cmd_build()   { check_prereqs; run_pm build; ok "Built to dist/"; }
cmd_test()    { check_prereqs; run_pm test; }
cmd_lint()    { check_prereqs; run_pm lint; }
cmd_clean()   { log "Removing dist/ coverage/ shots/ reports/"; rm -rf dist coverage shots reports; ok "Cleaned"; }

cmd_capture() {
  check_prereqs
  shift || true            # drop the literal "capture"
  [ "${1:-}" = "--" ] && shift  # tolerate an optional "--" separator
  if [ -d dist ] && [ -f dist/cli/index.js ]; then
    node dist/cli/index.js capture "$@"
  else
    pm_exec tsx src/cli/index.ts capture "$@"
  fi
}

cmd_desktop() {
  check_prereqs
  if [ "$PM" != "pnpm" ]; then
    err "The desktop app uses pnpm workspaces. Install pnpm first."; exit 1
  fi
  log "Launching the shotr desktop capture app (dev)…"
  pnpm --filter shotr-desktop dev
}

# Service-style verbs are informational: shotr is a one-shot CLI, not a daemon.
cmd_start()   { warn "shotr is a one-shot CLI, not a service. Use: ./setup.sh capture -- -c <config>"; }
cmd_stop()    { warn "Nothing to stop — shotr runs to completion and exits."; }
cmd_restart() { cmd_start; }
cmd_status()  {
  check_prereqs
  [ -d node_modules ] && ok "deps installed" || warn "deps missing (run setup)"
  [ -d dist ] && ok "build present" || warn "not built (run build)"
}
cmd_logs()    { warn "No background logs — shotr prints its run summary to stdout."; }

cmd_help() {
  cat <<EOF
${C_BLUE}shotr${C_RESET} — config-driven web screenshot capture tool

Usage: ./setup.sh <command> [-- <args passed to the CLI>]

  setup            First-time setup: install deps + Playwright Chromium + build
  build            Compile TypeScript to dist/
  test             Run the unit test suite
  lint             Run ESLint
  clean            Remove dist/, coverage/, shots/, reports/
  capture ...      Run a capture, e.g.  ./setup.sh capture -c configs/example.config.yaml
  desktop          Launch the desktop screen-capture app (apps/desktop, dev mode)
  status           Show install/build status
  help             Show this help

Service verbs (start/stop/restart/logs) are no-ops: shotr is a one-shot CLI.
EOF
}

main() {
  local cmd="${1:-help}"
  case "$cmd" in
    setup)   cmd_setup ;;
    build)   cmd_build ;;
    test)    cmd_test ;;
    lint)    cmd_lint ;;
    clean)   cmd_clean ;;
    capture) cmd_capture "$@" ;;
    desktop) cmd_desktop ;;
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    restart) cmd_restart ;;
    status)  cmd_status ;;
    logs)    cmd_logs ;;
    help|-h|--help) cmd_help ;;
    *) err "Unknown command: $cmd"; echo; cmd_help; exit 1 ;;
  esac
}
main "$@"
