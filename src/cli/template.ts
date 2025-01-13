/** Starter config written by `shotr init`. */
export const STARTER_CONFIG = `# shotr capture configuration
# Run: shotr capture -c shotr.config.yaml

projectName: My Web App
environment: QA
baseUrl: https://example.com

profiles:
  laptop:
    width: 1440
    height: 900
  mobile:
    width: 390
    height: 844
    deviceScaleFactor: 3
    isMobile: true

defaults:
  profile: laptop
  waitUntil: networkidle
  capture:
    fullPage: true   # capture the whole scrolled page (auto-scrolls to load lazy content)

header:
  enabled: true
  includeUrlBar: true
  includeTimestamp: true

# shots/<date>/<pageId>_<counter>.png
fileNamePattern: '{date}/{pageId}_{counter}.png'

# Authentication (optional). Logs in once, then reuses the session for all pages.
# Keep credentials out of this file via \${ENV_VAR}. Run \`shotr auth setup\` (scripted)
# or \`shotr auth login\` (manual) to create the session; \`capture\` auto-logs in too.
# auth:
#   enabled: true
#   loginUrl: /login
#   storageState: ./auth/session.json
#   loginScript:
#     - fill: { selector: '#username', value: '\${SHOTR_USER}' }
#     - fill: { selector: '#password', value: '\${SHOTR_PASS}' }
#     - click: 'button[type=submit]'
#     - waitForSelector: '#dashboard'

pages:
  - id: home
    title: Home Page
    path: /
  - id: about
    title: About Page
    path: /about
`;
