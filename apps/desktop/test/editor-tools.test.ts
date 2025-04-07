import { describe, it, expect } from 'vitest';
import {
  arrowHead,
  isDrawingTool,
  isShapeTool,
  shapeFromDrag,
  textSpecAt,
  TOOLS,
  type RectSpec,
  type LineSpec,
} from '../src/renderer/editor-tools.js';

const style = { color: '#ef4444', size: 4 };

describe('tool classification', () => {
  it('lists all tools', () => {
    expect(TOOLS).toContain('pencil');
    expect(TOOLS).toContain('text');
    expect(TOOLS).toHaveLength(7);
  });
  it('classifies drawing vs shape tools', () => {
    expect(isDrawingTool('pencil')).toBe(true);
    expect(isDrawingTool('rect')).toBe(false);
    expect(isShapeTool('rect')).toBe(true);
    expect(isShapeTool('arrow')).toBe(true);
    expect(isShapeTool('text')).toBe(false);
  });
});

describe('shapeFromDrag', () => {
  it('builds a normalized rect regardless of drag direction', () => {
    const r = shapeFromDrag('rect', { x: 50, y: 40 }, { x: 10, y: 10 }, style) as RectSpec;
    expect(r).toMatchObject({ kind: 'rect', left: 10, top: 10, width: 40, height: 30, stroke: '#ef4444', strokeWidth: 4 });
  });

  it('builds an ellipse with the same geometry', () => {
    const e = shapeFromDrag('ellipse', { x: 0, y: 0 }, { x: 20, y: 10 }, style) as RectSpec;
    expect(e.kind).toBe('ellipse');
    expect(e.width).toBe(20);
    expect(e.height).toBe(10);
  });

  it('builds a line/arrow with endpoints', () => {
    const l = shapeFromDrag('line', { x: 1, y: 2 }, { x: 3, y: 4 }, style) as LineSpec;
    expect(l).toMatchObject({ kind: 'line', x1: 1, y1: 2, x2: 3, y2: 4 });
    expect((shapeFromDrag('arrow', { x: 0, y: 0 }, { x: 5, y: 0 }, style) as LineSpec).kind).toBe('arrow');
  });

  it('returns null for non-shape tools', () => {
    expect(shapeFromDrag('select', { x: 0, y: 0 }, { x: 1, y: 1 }, style)).toBeNull();
    expect(shapeFromDrag('pencil', { x: 0, y: 0 }, { x: 1, y: 1 }, style)).toBeNull();
  });
});

describe('textSpecAt', () => {
  it('places text and scales the font with size', () => {
    expect(textSpecAt({ x: 12, y: 34 }, { color: '#fff', size: 5 })).toEqual({
      kind: 'text',
      left: 12,
      top: 34,
      fill: '#fff',
      fontSize: 20,
    });
  });
  it('keeps a minimum font size', () => {
    expect(textSpecAt({ x: 0, y: 0 }, { color: '#fff', size: 1 }).fontSize).toBe(12);
  });
});

describe('arrowHead', () => {
  it('returns a 3-point triangle with the tip at the end point', () => {
    const pts = arrowHead(0, 0, 100, 0, 4);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 100, y: 0 }); // tip
    // base points are behind the tip (smaller x) and symmetric in y
    expect(pts[1]!.x).toBeLessThan(100);
    expect(pts[2]!.x).toBeLessThan(100);
    expect(pts[1]!.y).toBeCloseTo(-pts[2]!.y, 5);
  });
});
