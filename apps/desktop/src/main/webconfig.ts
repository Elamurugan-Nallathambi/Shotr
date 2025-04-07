import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { BrowserName, ConfigInput, OsInput } from 'shotr/engine';

// Env var names the engine interpolates for credentials (kept out of YAML).
export const ENV_USER = 'LOGIN_USER';
export const ENV_PASS = 'LOGIN_PASS';

export interface WebPageForm {
  id?: string;
  title: string;
  /** A path (resolved against baseUrl) or an absolute URL. */
  path: string;
  fullPage: boolean;
  waitForSelector?: string;
}

export interface WebAuthForm {
  enabled: boolean;
  /** 'scripted' fills username/password; 'manual' opens a browser for SSO. */
  mode?: 'scripted' | 'manual';
  loginUrl?: string;
  usernameSelector?: string;
  username?: string;
  passwordSelector?: string;
  password?: string;
  submitSelector?: string;
  successSelector?: string;
}

export interface WebSettingsForm {
  width: number;
  height: number;
  browser: BrowserName;
  header: boolean;
  os: OsInput;
  frame: boolean;
}

export interface WebCaptureForm {
  id: string;
  name: string;
  baseUrl: string;
  environment: string;
  auth: WebAuthForm;
  pages: WebPageForm[];
  settings: WebSettingsForm;
}

export function defaultForm(id: string): WebCaptureForm {
  return {
    id,
    name: 'My Web App',
    baseUrl: 'https://example.com',
    environment: 'QA',
    auth: { enabled: false },
    pages: [{ title: 'Home', path: '/', fullPage: true }],
    settings: { width: 1440, height: 900, browser: 'chromium', header: true, os: 'auto', frame: false },
  };
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+)|(-+$)/g, '') || 'page'
  );
}

function isAbsoluteUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

type LoginScript = NonNullable<NonNullable<ConfigInput['auth']>['loginScript']>;

/** Build the generated login steps (credentials referenced via env placeholders). */
export function buildLoginScript(auth: WebAuthForm): LoginScript {
  const steps: LoginScript = [];
  if (auth.usernameSelector) {
    steps.push({ fill: { selector: auth.usernameSelector, value: `\${${ENV_USER}}` } });
  }
  if (auth.passwordSelector) {
    steps.push({ fill: { selector: auth.passwordSelector, value: `\${${ENV_PASS}}` } });
  }
  steps.push(auth.submitSelector ? { click: auth.submitSelector } : { press: 'Enter' });
  if (auth.successSelector) steps.push({ waitForSelector: auth.successSelector });
  return steps;
}

/** Map the UI form to the engine's ConfigInput (no plaintext secrets). */
export function formToConfigInput(form: WebCaptureForm): ConfigInput {
  const usedIds = new Set<string>();
  const pages = form.pages.map((p) => {
    let id = p.id || slugify(p.title);
    let n = 2;
    while (usedIds.has(id)) id = `${slugify(p.title)}-${n++}`;
    usedIds.add(id);
    const capture = { fullPage: p.fullPage, ...(p.waitForSelector ? { waitForSelector: p.waitForSelector } : {}) };
    return {
      id,
      title: p.title,
      ...(isAbsoluteUrl(p.path) ? { url: p.path } : { path: p.path }),
      capture,
    };
  });

  const config: ConfigInput = {
    projectName: form.name,
    environment: form.environment,
    baseUrl: form.baseUrl,
    profiles: {
      custom: { width: form.settings.width, height: form.settings.height },
    },
    defaults: { profile: 'custom', browser: form.settings.browser, waitUntil: 'networkidle' },
    header: { enabled: form.settings.header, os: form.settings.os },
    frame: { enabled: form.settings.frame },
    fileNamePattern: '{date}/{pageId}_{counter}.png',
    pages,
  };

  if (form.auth.enabled) {
    config.auth = {
      enabled: true,
      storageState: `./auth/${form.id}.json`,
      ...(form.auth.loginUrl ? { loginUrl: form.auth.loginUrl } : {}),
      // Manual/SSO mode relies on a saved browser session (no scripted steps).
      ...(form.auth.mode === 'manual' ? {} : { loginScript: buildLoginScript(form.auth) }),
    };
  }

  return config;
}

/** Serialize a form to CLI-compatible YAML (credentials as ${ENV} placeholders). */
export function toYaml(form: WebCaptureForm): string {
  return stringifyYaml(formToConfigInput(form));
}

/** Best-effort import: parse CLI YAML back into the form shape. */
export function fromYaml(text: string, id: string): WebCaptureForm {
  const cfg = parseYaml(text) as ConfigInput;
  const profile = Object.values(cfg.profiles ?? {})[0];
  const auth = cfg.auth;
  const findSel = (kind: 'user' | 'pass'): string | undefined => {
    const env = kind === 'user' ? ENV_USER : ENV_PASS;
    for (const step of auth?.loginScript ?? []) {
      if ('fill' in step && step.fill.value.includes(env)) return step.fill.selector;
    }
    return undefined;
  };
  const submit = (auth?.loginScript ?? []).find((s) => 'click' in s) as { click: string } | undefined;
  const success = (auth?.loginScript ?? []).find((s) => 'waitForSelector' in s) as
    | { waitForSelector: string }
    | undefined;

  return {
    id,
    name: cfg.projectName ?? 'Imported',
    baseUrl: cfg.baseUrl ?? '',
    environment: cfg.environment ?? 'QA',
    auth: {
      enabled: Boolean(auth?.enabled),
      // No loginScript on an enabled auth → it's a manual/SSO session.
      mode: auth?.enabled && !(auth?.loginScript?.length) ? 'manual' : 'scripted',
      loginUrl: auth?.loginUrl,
      usernameSelector: findSel('user'),
      passwordSelector: findSel('pass'),
      submitSelector: submit?.click,
      successSelector: success?.waitForSelector,
    },
    pages: (cfg.pages ?? []).map((p) => ({
      id: p.id,
      title: p.title ?? p.id,
      path: p.url ?? p.path ?? '/',
      fullPage: p.capture?.fullPage ?? p.capture?.mode === 'fullPage',
      waitForSelector: p.capture?.waitForSelector,
    })),
    settings: {
      width: profile?.width ?? 1440,
      height: profile?.height ?? 900,
      browser: cfg.defaults?.browser ?? 'chromium',
      header: cfg.header?.enabled ?? true,
      os: cfg.header?.os ?? 'auto',
      frame: cfg.frame?.enabled ?? false,
    },
  };
}
