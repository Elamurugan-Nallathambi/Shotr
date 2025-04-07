import { describe, it, expect } from 'vitest';
import {
  buildLoginScript,
  defaultForm,
  ENV_PASS,
  ENV_USER,
  formToConfigInput,
  fromYaml,
  toYaml,
  type WebCaptureForm,
} from '../src/main/webconfig.js';
import { validateConfig } from 'shotr/engine';

function form(over: Partial<WebCaptureForm> = {}): WebCaptureForm {
  return { ...defaultForm('proj1'), ...over };
}

describe('formToConfigInput', () => {
  it('produces a config the engine accepts', () => {
    const cfg = formToConfigInput(form());
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it('maps project, profile, header, frame, browser', () => {
    const cfg = formToConfigInput(
      form({
        name: 'App',
        baseUrl: 'https://x.com',
        environment: 'prod',
        settings: { width: 1280, height: 720, browser: 'chrome', header: false, os: 'windows', frame: true },
      }),
    );
    expect(cfg.projectName).toBe('App');
    expect(cfg.profiles!.custom).toEqual({ width: 1280, height: 720 });
    expect(cfg.defaults!.browser).toBe('chrome');
    expect(cfg.header).toEqual({ enabled: false, os: 'windows' });
    expect(cfg.frame).toEqual({ enabled: true });
  });

  it('maps pages, detecting absolute URLs vs paths and dedup ids', () => {
    const cfg = formToConfigInput(
      form({
        pages: [
          { title: 'Home', path: '/', fullPage: true },
          { title: 'Home', path: 'https://other.com/x', fullPage: false, waitForSelector: '#r' },
        ],
      }),
    );
    expect(cfg.pages[0]).toMatchObject({ id: 'home', path: '/', capture: { fullPage: true } });
    expect(cfg.pages[1]).toMatchObject({ id: 'home-2', url: 'https://other.com/x', capture: { fullPage: false, waitForSelector: '#r' } });
  });

  it('omits auth when disabled', () => {
    expect(formToConfigInput(form()).auth).toBeUndefined();
  });

  it('builds an auth loginScript with env placeholders (no plaintext)', () => {
    const cfg = formToConfigInput(
      form({
        auth: {
          enabled: true,
          loginUrl: '/login',
          usernameSelector: '#u',
          username: 'alice',
          passwordSelector: '#p',
          password: 'secret',
          successSelector: '#dash',
        },
      }),
    );
    const yaml = toYaml(form({ auth: { enabled: true, usernameSelector: '#u', username: 'alice', passwordSelector: '#p', password: 'secret' } }));
    expect(cfg.auth!.loginUrl).toBe('/login');
    expect(cfg.auth!.storageState).toContain('proj1');
    expect(cfg.auth!.loginScript).toEqual([
      { fill: { selector: '#u', value: `\${${ENV_USER}}` } },
      { fill: { selector: '#p', value: `\${${ENV_PASS}}` } },
      { press: 'Enter' },
      { waitForSelector: '#dash' },
    ]);
    // YAML must never contain the plaintext secret.
    expect(yaml).not.toContain('alice');
    expect(yaml).not.toContain('secret');
    expect(yaml).toContain('${LOGIN_USER}');
  });
});

describe('manual / SSO auth mode', () => {
  it('omits loginScript and keeps storageState for manual mode', () => {
    const cfg = formToConfigInput(
      form({ auth: { enabled: true, mode: 'manual', loginUrl: '/sso' } }),
    );
    expect(cfg.auth!.enabled).toBe(true);
    expect(cfg.auth!.storageState).toContain('proj1');
    expect(cfg.auth!.loginUrl).toBe('/sso');
    expect(cfg.auth!.loginScript).toBeUndefined();
  });

  it('round-trips manual mode through YAML (no loginScript → manual)', () => {
    const original = form({ auth: { enabled: true, mode: 'manual', loginUrl: '/sso' } });
    const back = fromYaml(toYaml(original), 'proj1');
    expect(back.auth.enabled).toBe(true);
    expect(back.auth.mode).toBe('manual');
  });

  it('scripted mode still produces a loginScript', () => {
    const cfg = formToConfigInput(
      form({ auth: { enabled: true, mode: 'scripted', usernameSelector: '#u', passwordSelector: '#p' } }),
    );
    expect(cfg.auth!.loginScript?.length).toBeGreaterThan(0);
  });
});

describe('buildLoginScript', () => {
  it('uses a submit selector when provided', () => {
    const steps = buildLoginScript({ enabled: true, passwordSelector: '#p', submitSelector: '#go' });
    expect(steps).toContainEqual({ click: '#go' });
    expect(steps).not.toContainEqual({ press: 'Enter' });
  });
});

describe('YAML round-trip', () => {
  it('form → yaml → form preserves key fields', () => {
    const original = form({
      name: 'Portal',
      baseUrl: 'https://portal.test',
      environment: 'staging',
      auth: { enabled: true, loginUrl: '/signin', usernameSelector: '#user', passwordSelector: '#pass', successSelector: '#home' },
      pages: [
        { title: 'Dashboard', path: '/dash', fullPage: true, waitForSelector: '#ready' },
        { title: 'Reports', path: '/reports', fullPage: false },
      ],
      settings: { width: 1600, height: 1000, browser: 'firefox', header: true, os: 'macos', frame: true },
    });
    const back = fromYaml(toYaml(original), 'proj1');
    expect(back.name).toBe('Portal');
    expect(back.baseUrl).toBe('https://portal.test');
    expect(back.environment).toBe('staging');
    expect(back.settings).toEqual(original.settings);
    expect(back.auth.enabled).toBe(true);
    expect(back.auth.loginUrl).toBe('/signin');
    expect(back.auth.usernameSelector).toBe('#user');
    expect(back.auth.passwordSelector).toBe('#pass');
    expect(back.auth.successSelector).toBe('#home');
    expect(back.pages).toEqual([
      { id: 'dashboard', title: 'Dashboard', path: '/dash', fullPage: true, waitForSelector: '#ready' },
      { id: 'reports', title: 'Reports', path: '/reports', fullPage: false, waitForSelector: undefined },
    ]);
  });
});
