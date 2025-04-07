import { describe, it, expect } from 'vitest';
import { IPC } from '../src/main/ipc.js';

describe('IPC channels', () => {
  it('are all namespaced under shotr:', () => {
    for (const v of Object.values(IPC)) expect(v.startsWith('shotr:')).toBe(true);
  });
  it('are unique', () => {
    const values = Object.values(IPC);
    expect(new Set(values).size).toBe(values.length);
  });
  it('cover the capture → editor flow', () => {
    expect(IPC).toMatchObject({
      capture: expect.any(String),
      regionComplete: expect.any(String),
      editorImage: expect.any(String),
      copyImage: expect.any(String),
      saveImage: expect.any(String),
    });
  });
});
