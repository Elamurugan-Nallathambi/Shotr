# Web App Screenshot Capture Tool — Idea Specification

## Objective

Build a configurable screenshot capture tool for web applications.

The tool should work like a test runner, but instead of validating page behavior, it will only open configured pages, capture screenshots in defined browser/system sizes, and save them with a generated header containing evidence details such as timestamp, URL, page title, environment, and optional browser-style URL bar.

## Core Use Case

As a developer or support engineer, I want to capture screenshots of multiple web app pages in a repeatable way, using predefined viewport sizes and system specifications, so that screenshots are consistent and can be used for documentation, QA evidence, release notes, issue reporting, and production support.

## Key Requirement

The tool should accept a template/config file where I can define:

* Domain or base URL
* Page path or full URL
* Page title or friendly name
* Viewport size
* Device/system profile
* Capture mode
* Output folder
* Header format
* Whether to include URL bar
* Whether to include timestamp
* Whether to capture full-page scroll length
* Optional login/session setup

## Functional Requirements

### 1. Config-Driven Capture

The tool should run based on a configuration file, similar to test cases.

Each capture entry should define the page to open and the screenshot settings.

Example:

```yaml
projectName: My Web App
environment: QA
baseUrl: https://qa.example.com

defaults:
  viewport:
    width: 1440
    height: 900
  fullPage: true
  includeHeader: true
  includeUrlBar: true
  timestampFormat: "YYYY-MM-DD HH:mm:ss"
  outputDir: "./screenshots"

pages:
  - id: homepage
    title: Home Page
    path: /
    fileName: home-page

  - id: product-list
    title: Product Listing Page
    path: /products
    fileName: product-listing

  - id: checkout
    title: Checkout Page
    path: /checkout
    fileName: checkout-page
```

## 2. Browser/System Profiles

The tool should support predefined system profiles.

Example profiles:

```yaml
profiles:
  desktopLarge:
    width: 1920
    height: 1080
    deviceScaleFactor: 1

  laptop:
    width: 1440
    height: 900
    deviceScaleFactor: 1

  tablet:
    width: 768
    height: 1024
    deviceScaleFactor: 2

  mobile:
    width: 390
    height: 844
    deviceScaleFactor: 3
```

The user should be able to run the same page set across one or more profiles.

## 3. Screenshot Modes

The tool should support:

* Visible viewport screenshot
* Full-page screenshot
* Specific element screenshot
* Screenshot after scroll
* Screenshot after wait
* Screenshot after clicking or navigating

Example:

```yaml
pages:
  - id: dashboard
    title: Dashboard
    path: /dashboard
    capture:
      fullPage: true
      waitForSelector: "#dashboard-loaded"
```

## 4. Header and URL Bar Overlay

After capturing the screenshot, the tool should generate a final image with a configurable header.

The header can include:

* Project name
* Environment
* Page title
* Full URL
* Browser URL bar style
* Timestamp from system time
* Browser name
* Viewport size
* Logged-in user, if available
* Custom notes

Example header content:

```text
Project: My Web App | Env: QA | Page: Checkout Page
URL: https://qa.example.com/checkout
Captured: 2026-06-15 10:25:43 | Browser: Chromium | Viewport: 1440x900
```

Header should be configurable:

```yaml
header:
  enabled: true
  height: 90
  includeUrl: true
  includePageTitle: true
  includeTimestamp: true
  includeViewport: true
  includeBrowser: true
  includeEnvironment: true
  includeUrlBar: true
```

## 5. Output File Naming

The tool should save screenshots using consistent naming.

Example pattern:

```text
{projectName}_{environment}_{profile}_{pageId}_{timestamp}.png
```

Example output:

```text
my-web-app_QA_laptop_checkout_2026-06-15_10-25-43.png
```

The file naming should be configurable.

## 6. Runner Behavior

The tool should run like this:

```bash
npm run capture -- --config screenshot.config.yaml
```

Or:

```bash
node capture.js --config screenshot.config.yaml --profile laptop
```

It should process each page in sequence:

* Load browser
* Apply system/browser profile
* Open page URL
* Wait for page load
* Optionally wait for selector/network idle
* Capture screenshot
* Add header and URL bar
* Save output
* Move to next page

## 7. Login and Session Handling

The tool should support authenticated web apps.

Possible options:

* Reuse saved browser storage state
* Run a login setup script
* Accept cookies/session file
* Support manual login once and save session

Example:

```yaml
auth:
  enabled: true
  storageState: "./auth/session.json"
  loginUrl: "/login"
```

## 8. Page Actions Before Capture

Some pages may need simple actions before capturing.

Supported actions:

* wait
* click
* fill
* select
* scroll
* hover
* press key
* wait for selector

Example:

```yaml
pages:
  - id: order-details
    title: Order Details
    path: /orders/12345
    actions:
      - waitForSelector: "#order-summary"
      - click: "#expand-items"
      - wait: 1000
    capture:
      fullPage: true
```

## 9. Technical Stack

Recommended stack:

* Node.js
* Playwright for browser automation
* Sharp for image processing and header generation
* YAML or JSON config parser
* Optional HTML report generator

## 10. Output Report

After the run, the tool should generate a summary report.

Example:

```text
Screenshot Capture Completed

Project: My Web App
Environment: QA
Total Pages: 12
Successful Captures: 12
Failed Captures: 0
Output Folder: ./screenshots/2026-06-15
```

Optional HTML report:

* Thumbnail preview
* Page title
* URL
* Timestamp
* Profile
* Screenshot file link
* Status

## 11. Folder Structure

Suggested project structure:

```text
web-screenshot-capturer/
  configs/
    screenshot.config.yaml
  auth/
    session.json
  screenshots/
  reports/
  src/
    runner.js
    config-loader.js
    screenshot-service.js
    header-renderer.js
    file-namer.js
    auth-service.js
  package.json
```

## 12. Example Final Config

```yaml
projectName: Customer Portal
environment: QA
baseUrl: https://qa.customer-portal.com

profiles:
  laptop:
    width: 1440
    height: 900
    deviceScaleFactor: 1

  desktop:
    width: 1920
    height: 1080
    deviceScaleFactor: 1

defaults:
  profile: laptop
  fullPage: true
  waitUntil: networkidle
  outputDir: ./screenshots

header:
  enabled: true
  height: 100
  includeUrlBar: true
  includeTimestamp: true
  includePageTitle: true
  includeViewport: true
  includeEnvironment: true

fileNamePattern: "{environment}_{profile}_{pageId}_{timestamp}.png"

auth:
  enabled: true
  storageState: ./auth/session.json

pages:
  - id: home
    title: Home Page
    path: /

  - id: login
    title: Login Page
    path: /login

  - id: dashboard
    title: Dashboard
    path: /dashboard
    actions:
      - waitForSelector: "#dashboard-container"

  - id: orders
    title: Orders Page
    path: /orders
    actions:
      - waitForSelector: ".orders-table"
    capture:
      fullPage: true
```

## 13. Expected Benefits

* Consistent screenshots across pages and environments
* Evidence-style screenshots with timestamp and URL
* Full-page scroll capture support
* Repeatable capture flow like test cases
* Useful for QA, release documentation, audits, support, and defect reporting
* Configurable for multiple domains, page groups, browser sizes, and environments

## 14. Future Enhancements

* Compare screenshots with previous run
* Generate PDF report
* Add annotations
* Add screenshot grouping by module
* Support multiple browsers: Chromium, Firefox, WebKit
* Mask sensitive fields before capture
* Capture console errors and network failures
* Upload screenshots to S3, SharePoint, or Jira
* Add CLI filters such as `--page checkout` or `--tag regression`
