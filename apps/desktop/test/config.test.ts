import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultConfig,
  loadConfig,
  mergeConfig,
  parseConfig,
  saveConfig,
} from '../src/main/config.js';

describe('defaultConfig', () => {
  it('uses sensible defaults and a home-relative saveDir', () => {
    const c = defaultConfig('/home/me');
    expect(c.hotkeys.region).toBe('CommandOrControl+Shift+4');
    expect(c.saveDir).toBe('/home/me/Pictures/shotr');
    expect(c.format).toBe('png');
    expect(c.copyOnCapture).toBe(true);
  });
});

describe('mergeConfig', () => {
  const base = defaultConfig('/home/me');

  it('overrides provided fields and keeps the rest', () => {
    const c = mergeConfig({ format: 'jpeg', hotkeys: { region: 'Alt+1' } as never }, base);
    expect(c.format).toBe('jpeg');
    expect(c.hotkeys.region).toBe('Alt+1');
    expect(c.hotkeys.window).toBe(base.hotkeys.window); // untouched
  });

  it('rejects invalid values and falls back', () => {
    const c = mergeConfig(
      { format: 'gif' as never, jpegQuality: 999, saveDir: '   ', copyOnCapture: 'yes' as never },
      base,
    );
    expect(c.format).toBe('png');
    expect(c.jpegQuality).toBe(90);
    expect(c.saveDir).toBe(base.saveDir);
    expect(c.copyOnCapture).toBe(true);
  });

  it('clamps and rounds jpegQuality', () => {
    expect(mergeConfig({ jpegQuality: 55.6 }, base).jpegQuality).toBe(56);
    expect(mergeConfig({ jpegQuality: 0 }, base).jpegQuality).toBe(base.jpegQuality);
  });
});

describe('parseConfig', () => {
  it('parses valid JSON over defaults', () => {
    expect(parseConfig('{"format":"jpeg"}', defaultConfig('/h')).format).toBe('jpeg');
  });
  it('falls back to defaults on invalid JSON', () => {
    const base = defaultConfig('/h');
    expect(parseConfig('not json', base)).toEqual(base);
  });
});

describe('loadConfig / saveConfig', () => {
  it('round-trips through disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shotr-cfg-'));
    try {
      const file = join(dir, 'nested', 'config.json');
      const cfg = mergeConfig({ format: 'jpeg', copyOnCapture: false });
      saveConfig(file, cfg);
      expect(loadConfig(file)).toEqual(cfg);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns defaults for a missing file', () => {
    expect(loadConfig('/no/such/config.json')).toEqual(defaultConfig());
  });

  it('returns defaults for corrupt file content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shotr-cfg-'));
    try {
      const file = join(dir, 'config.json');
      writeFileSync(file, '{bad json');
      expect(loadConfig(file)).toEqual(defaultConfig());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
