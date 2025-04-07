import { describe, it, expect, vi } from 'vitest';
import {
  registerHotkeys,
  validateAccelerator,
  type GlobalShortcutLike,
} from '../src/main/hotkey.js';
import { defaultConfig } from '../src/main/config.js';

describe('validateAccelerator', () => {
  it('accepts modifier + key combos', () => {
    expect(validateAccelerator('CommandOrControl+Shift+4')).toBe(true);
    expect(validateAccelerator('Alt+A')).toBe(true);
    expect(validateAccelerator('Ctrl+Shift+PrintScreen')).toBe(true);
  });

  it('rejects bare keys, empty, and modifier-only strings', () => {
    expect(validateAccelerator('A')).toBe(false);
    expect(validateAccelerator('')).toBe(false);
    expect(validateAccelerator('Shift+Ctrl')).toBe(false); // last token is a modifier
    expect(validateAccelerator('Foo+4')).toBe(false); // unknown modifier
  });
});

function mockGS(overrides: Partial<GlobalShortcutLike> = {}): GlobalShortcutLike & {
  registered: string[];
} {
  const registered: string[] = [];
  return {
    registered,
    register: (acc) => {
      registered.push(acc);
      return true;
    },
    unregisterAll: () => {},
    ...overrides,
  };
}

describe('registerHotkeys', () => {
  it('registers all valid hotkeys and fires the right mode', () => {
    const onTrigger = vi.fn();
    let captured: (() => void) | undefined;
    const gs = mockGS({
      register: (_acc, cb) => {
        if (!captured) captured = cb; // capture the region callback
        return true;
      },
    });
    const res = registerHotkeys(gs, defaultConfig('/h').hotkeys, onTrigger);
    expect(res.registered).toHaveLength(3);
    expect(res.failed).toHaveLength(0);
    captured?.();
    expect(onTrigger).toHaveBeenCalledWith('region');
  });

  it('reports invalid accelerators without calling register', () => {
    const gs = mockGS();
    const res = registerHotkeys(
      gs,
      { region: 'nope', window: 'Alt+W', screen: 'Ctrl+Shift+S' },
      () => {},
    );
    expect(res.failed).toContainEqual({ mode: 'region', accelerator: 'nope', reason: 'invalid' });
    expect(res.registered.map((r) => r.mode)).toEqual(['window', 'screen']);
    expect(gs.registered).toEqual(['Alt+W', 'Ctrl+Shift+S']);
  });

  it('reports OS register failures', () => {
    const gs = mockGS({ register: () => false });
    const res = registerHotkeys(gs, defaultConfig('/h').hotkeys, () => {});
    expect(res.registered).toHaveLength(0);
    expect(res.failed.every((f) => f.reason === 'register-failed')).toBe(true);
  });
});
