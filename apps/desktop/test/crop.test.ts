import { describe, it, expect } from 'vitest';
import { clamp, isUsableRect, rectFromPoints, toDeviceRect } from '../src/main/crop.js';

describe('clamp', () => {
  it('bounds a value', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('rectFromPoints', () => {
  it('normalizes any drag direction to a positive rect', () => {
    expect(rectFromPoints({ x: 10, y: 10 }, { x: 40, y: 30 })).toEqual({ x: 10, y: 10, width: 30, height: 20 });
    // dragged up-left
    expect(rectFromPoints({ x: 40, y: 30 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10, width: 30, height: 20 });
  });
});

describe('toDeviceRect', () => {
  it('scales CSS px to device px by scaleFactor', () => {
    const r = toDeviceRect({ x: 10, y: 20, width: 100, height: 50 }, 2, 4000, 3000);
    expect(r).toEqual({ x: 20, y: 40, width: 200, height: 100 });
  });

  it('clamps a selection that runs past the image edge', () => {
    // image 800x600 device px; selection (in CSS px at sf=1) overflows right/bottom
    const r = toDeviceRect({ x: 700, y: 500, width: 400, height: 400 }, 1, 800, 600);
    expect(r).toEqual({ x: 700, y: 500, width: 100, height: 100 });
  });

  it('handles scaleFactor 1 (no scaling)', () => {
    expect(toDeviceRect({ x: 0, y: 0, width: 50, height: 50 }, 1, 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    });
  });
});

describe('isUsableRect', () => {
  it('rejects tiny / zero-area selections', () => {
    expect(isUsableRect({ x: 0, y: 0, width: 1, height: 1 })).toBe(false);
    expect(isUsableRect({ x: 0, y: 0, width: 0, height: 100 })).toBe(false);
  });
  it('accepts a real selection', () => {
    expect(isUsableRect({ x: 0, y: 0, width: 50, height: 30 })).toBe(true);
  });
});
