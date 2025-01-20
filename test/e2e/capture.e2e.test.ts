import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { resolveConfig, validateConfig } from '../../src/config/loader.js';
import { runCapture } from '../../src/core/runner.js';
import { generateReports } from '../../src/report/index.js';
import { silentLogger } from '../../src/core/logger.js';
import { runScriptedLogin } from '../../src/auth/setup.js';
import { openLoginContext } from '../../src/auth/session.js';

function html(title: string): string {
  return `<!doctype html><html><head><title>${title}</title></head>
  <body style="font-family:sans-serif;padding:24px">
  <h1 id="heading">${title}</h1>
  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
  <div style="height:1200px;background:linear-gradient(#eef,#fee)"></div>
  </body></html>`;
}

let server: Server;
let port: number;
let outDir: string;
let reportsDir: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(html(req.url === '/about' ? 'About Page' : 'Home Page'));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
  outDir = await mkdtemp(join(tmpdir(), 'shotr-shots-'));
  reportsDir = await mkdtemp(join(tmpdir(), 'shotr-reports-'));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(outDir, { recursive: true, force: true });
  await rm(reportsDir, { recursive: true, force: true });
});

describe('end-to-end capture + reports', () => {
  it('captures real pages with a header and produces html/pdf/word/json reports', async () => {
    const config = resolveConfig(
      validateConfig({
        projectName: 'E2E',
        environment: 'test',
        baseUrl: `http://localhost:${port}`,
        profiles: { laptop: { width: 800, height: 600 } },
        defaults: { profile: 'laptop', waitUntil: 'load', capture: { mode: 'fullPage' } },
        pages: [
          { id: 'home', title: 'Home', path: '/', actions: [{ waitForSelector: '#heading' }] },
          { id: 'about', title: 'About', path: '/about' },
        ],
      }),
    );

    const manifest = await runCapture(config, { outputDir: outDir }, { logger: silentLogger });
    expect(manifest.total).toBe(2);
    expect(manifest.successful).toBe(2);
    expect(manifest.failed).toBe(0);

    for (const r of manifest.results) {
      expect(r.filePath).toBeDefined();
      expect(existsSync(r.filePath!)).toBe(true);
      // Full-page capture is tall; header band makes it taller still.
      const meta = await sharp(await readFile(r.filePath!)).metadata();
      expect(meta.width).toBe(800);
      expect(meta.height!).toBeGreaterThan(600);
    }

    const paths = await generateReports(manifest, {
      formats: ['html', 'pdf', 'word', 'json'],
      reportsDir,
      baseName: 'e2e',
    });
    expect(paths).toHaveLength(4);
    expect(existsSync(join(reportsDir, 'e2e.html'))).toBe(true);
    expect(existsSync(join(reportsDir, 'e2e.pdf'))).toBe(true);
    expect(existsSync(join(reportsDir, 'e2e.docx'))).toBe(true);
    expect(existsSync(join(reportsDir, 'e2e.json'))).toBe(true);

    const pdf = await readFile(join(reportsDir, 'e2e.pdf'));
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  }, 120_000);
});

describe('scripted login + authenticated capture', () => {
  let authServer: Server;
  let authPort: number;
  let authOut: string;
  let statePath: string;

  beforeAll(async () => {
    // A cookie-gated app: /login sets `shotr_auth=ok` on submit and redirects to
    // /secret, which only renders #ok when that cookie is present.
    authServer = createServer((req, res) => {
      const cookie = req.headers.cookie ?? '';
      res.setHeader('content-type', 'text/html');
      if (req.url?.startsWith('/secret')) {
        res.end(
          cookie.includes('shotr_auth=ok')
            ? '<h1 id="ok">Secret Dashboard</h1>'
            : '<h1 id="denied">Login required</h1>',
        );
        return;
      }
      res.end(`<!doctype html><html><body>
        <input id="username"/><input id="password" type="password"/>
        <button id="submit" onclick="document.cookie='shotr_auth=ok;path=/';location.href='/secret'">Sign in</button>
      </body></html>`);
    });
    await new Promise<void>((resolve) => authServer.listen(0, resolve));
    authPort = (authServer.address() as AddressInfo).port;
    authOut = await mkdtemp(join(tmpdir(), 'shotr-auth-'));
    statePath = join(authOut, 'session.json');
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => authServer.close(() => resolve()));
    await rm(authOut, { recursive: true, force: true });
  });

  it('logs in once via loginScript, then reuses the session to reach a gated page', async () => {
    const config = resolveConfig(
      validateConfig({
        projectName: 'Auth E2E',
        environment: 'test',
        baseUrl: `http://localhost:${authPort}`,
        profiles: { laptop: { width: 800, height: 600 } },
        defaults: { profile: 'laptop' },
        auth: {
          enabled: true,
          storageState: statePath,
          loginUrl: '/login',
          loginScript: [
            { fill: { selector: '#username', value: 'alice' } },
            { fill: { selector: '#password', value: 'secret' } },
            { click: '#submit' },
            { waitForSelector: '#ok' },
          ],
        },
        pages: [
          // Capture only succeeds if the session cookie was reused (#ok present).
          { id: 'secret', title: 'Secret', path: '/secret', capture: { waitForSelector: '#ok' } },
        ],
      }),
    );

    const saved = await runScriptedLogin(config, { open: openLoginContext, logger: silentLogger });
    expect(existsSync(saved)).toBe(true);

    const manifest = await runCapture(config, { outputDir: authOut }, { logger: silentLogger });
    expect(manifest.successful).toBe(1);
    expect(manifest.results[0]!.status).toBe('success');
    expect(existsSync(manifest.results[0]!.filePath!)).toBe(true);
  }, 120_000);
});
