#!/usr/bin/env node
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Command } from 'commander';
import { loadConfig, ConfigError } from '../config/loader.js';
import { runCapture } from '../core/runner.js';
import { createLogger } from '../core/logger.js';
import { formatSummary } from '../report/summary.js';
import { generateReports, type ReportFormat } from '../report/index.js';
import { slugify, formatDate } from '../naming/file-namer.js';
import { resolvePlatform } from '../overlay/urlbar-renderer.js';
import { captureLoginSession, openLoginContext } from '../auth/session.js';
import { runScriptedLogin } from '../auth/setup.js';
import { STARTER_CONFIG } from './template.js';
import type { BrowserName, OsInput } from '../config/schema.js';
import type { RunManifest } from '../core/types.js';

const program = new Command();
program.name('shotr').description('Config-driven web screenshot capture tool').version('0.1.0');

function parseFormats(value: string): ReportFormat[] {
  const valid: ReportFormat[] = ['html', 'pdf', 'word', 'json'];
  const list = value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as ReportFormat[];
  const bad = list.filter((f) => !valid.includes(f));
  if (bad.length) throw new Error(`Unknown report format(s): ${bad.join(', ')}. Valid: ${valid.join(', ')}`);
  return list;
}

function reportBaseName(projectName: string, environment: string): string {
  return `${slugify(projectName)}_${slugify(environment)}_${formatDate(new Date())}`;
}

program
  .command('init')
  .description('Write a starter config file')
  .option('-o, --out <path>', 'output path', 'shotr.config.yaml')
  .action(async (opts: { out: string }) => {
    if (existsSync(opts.out)) {
      console.error(`Refusing to overwrite existing file: ${opts.out}`);
      process.exitCode = 1;
      return;
    }
    await writeFile(opts.out, STARTER_CONFIG);
    console.log(`Wrote starter config to ${opts.out}`);
  });

program
  .command('capture')
  .description('Capture screenshots for every page × profile')
  .requiredOption('-c, --config <path>', 'config file (YAML or JSON)')
  .option('--profile <name...>', 'profile(s) to run')
  .option('--page <id...>', 'only capture these page ids')
  .option('--tag <tag...>', 'only capture pages with these tags')
  .option('--browser <name>', 'chromium | chrome | edge | firefox | webkit | safari')
  .option('--os <name>', 'URL-bar window-control style: macos | windows | linux | auto')
  .option('--full-page', 'force full-page (scrolled) capture for every page')
  .option('--frame', 'wrap each screenshot in a floating gradient backdrop')
  .option('--login', 'run the login setup before capturing (re-auth even if a session exists)')
  .option('--headed', 'run with a visible browser window')
  .option('--out <dir>', 'override output directory')
  .option('--report <list>', 'comma list of html,pdf,word,json')
  .option('--reports-dir <dir>', 'report output directory', './reports')
  .option('--quiet', 'suppress progress output')
  .action(async (opts) => {
    const logger = createLogger({ quiet: opts.quiet });
    try {
      const config = await loadConfig(opts.config);
      if (opts.os) config.header.os = resolvePlatform(opts.os as OsInput);
      if (opts.frame) config.frame.enabled = true;

      // Log in once, up front, then capture every page reusing that session.
      if (config.auth.enabled && config.auth.loginScript.length > 0) {
        const haveSession = Boolean(
          config.auth.storageState && existsSync(config.auth.storageState),
        );
        if (opts.login || !haveSession) {
          await runScriptedLogin(config, { open: openLoginContext, logger });
        } else {
          logger.log(`Reusing saved session (${config.auth.storageState}); pass --login to refresh.`);
        }
      }

      const manifest = await runCapture(
        config,
        {
          profiles: opts.profile,
          pageIds: opts.page,
          tags: opts.tag,
          browser: opts.browser as BrowserName | undefined,
          headed: opts.headed,
          outputDir: opts.out,
          fullPage: opts.fullPage,
        },
        { logger },
      );

      const formats = opts.report ? parseFormats(opts.report) : (['html'] as ReportFormat[]);
      const base = reportBaseName(config.projectName, config.environment);
      formats.push('json');
      const paths = await generateReports(manifest, {
        formats,
        reportsDir: opts.reportsDir,
        baseName: base,
      });

      console.log('\n' + formatSummary(manifest));
      if (paths.length) console.log(`\nReports:\n${paths.map((p) => `  ${p}`).join('\n')}`);
      process.exitCode = manifest.failed > 0 ? 1 : 0;
    } catch (err) {
      handleError(err, logger);
    }
  });

program
  .command('report')
  .description('Regenerate reports from a saved run manifest')
  .requiredOption('-c, --config <path>', 'config file (for naming)')
  .requiredOption('--from <manifest.json>', 'run manifest produced by a capture')
  .option('--report <list>', 'comma list of html,pdf,word,json', 'html')
  .option('--reports-dir <dir>', 'report output directory', './reports')
  .action(async (opts) => {
    const logger = createLogger();
    try {
      const config = await loadConfig(opts.config);
      const manifest = JSON.parse(await readFile(opts.from, 'utf8')) as RunManifest;
      const paths = await generateReports(manifest, {
        formats: parseFormats(opts.report),
        reportsDir: opts.reportsDir,
        baseName: reportBaseName(config.projectName, config.environment),
      });
      console.log(`Reports:\n${paths.map((p) => `  ${p}`).join('\n')}`);
    } catch (err) {
      handleError(err, logger);
    }
  });

const auth = program.command('auth').description('Authentication helpers');
auth
  .command('login')
  .description('Open a headed browser, log in manually, and save the session')
  .requiredOption('-c, --config <path>', 'config file')
  .action(async (opts) => {
    const logger = createLogger();
    try {
      const config = await loadConfig(opts.config);
      const path = await captureLoginSession(config);
      console.log(`Saved session to ${path}`);
    } catch (err) {
      handleError(err, logger);
    }
  });

auth
  .command('setup')
  .description('Run the declarative auth.loginScript once and save the session')
  .requiredOption('-c, --config <path>', 'config file')
  .action(async (opts) => {
    const logger = createLogger();
    try {
      const config = await loadConfig(opts.config);
      const path = await runScriptedLogin(config, { open: openLoginContext, logger });
      console.log(`Saved session to ${path}`);
    } catch (err) {
      handleError(err, logger);
    }
  });

function handleError(err: unknown, logger: ReturnType<typeof createLogger>): void {
  if (err instanceof ConfigError) {
    logger.err(err.message);
  } else {
    logger.err((err as Error).message ?? String(err));
  }
  process.exitCode = 1;
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
