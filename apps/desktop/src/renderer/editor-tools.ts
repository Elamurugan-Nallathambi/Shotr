// Pure tool/geometry helpers for the annotation editor. Kept free of Fabric so
// the math (shape geometry, arrowheads, tool classification) is unit-testable.

export type ToolId = 'select' | 'pencil' | 'text' | 'rect' | 'ellipse' | 'arrow' | 'line';

export const TOOLS: ToolId[] = ['select', 'pencil', 'text', 'rect', 'ellipse', 'arrow', 'line'];

export interface ToolStyle {
  color: string;
  size: number;
}

export interface Vec {
  x: number;
  y: number;
}

export function isDrawingTool(tool: ToolId): boolean {
  return tool === 'pencil';
}

export function isShapeTool(tool: ToolId): boolean {
  return tool === 'rect' || tool === 'ellipse' || tool === 'arrow' || tool === 'line';
}

export interface RectSpec {
  kind: 'rect' | 'ellipse';
  left: number;
  top: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
}

export interface LineSpec {
  kind: 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

export interface TextSpec {
  kind: 'text';
  left: number;
  top: number;
  fill: string;
  fontSize: number;
}

export type ObjectSpec = RectSpec | LineSpec | TextSpec;

/** Geometry for a shape created by dragging from `a` to `b`. */
export function shapeFromDrag(
  tool: ToolId,
  a: Vec,
  b: Vec,
  style: ToolStyle,
): ObjectSpec | null {
  if (tool === 'rect' || tool === 'ellipse') {
    return {
      kind: tool,
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
      stroke: style.color,
      strokeWidth: style.size,
      fill: 'transparent',
    };
  }
  if (tool === 'line' || tool === 'arrow') {
    return { kind: tool, x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: style.color, strokeWidth: style.size };
  }
  return null;
}

/** Text object placed at a click point; font scales with the size slider. */
export function textSpecAt(point: Vec, style: ToolStyle): TextSpec {
  return { kind: 'text', left: point.x, top: point.y, fill: style.color, fontSize: Math.max(12, style.size * 4) };
}

/** Triangle points for an arrowhead at (x2,y2) pointing away from (x1,y1). */
export function arrowHead(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
): Vec[] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.max(8, size * 3);
  const spread = Math.PI / 7;
  return [
    { x: x2, y: y2 },
    { x: x2 - len * Math.cos(angle - spread), y: y2 - len * Math.sin(angle - spread) },
    { x: x2 - len * Math.cos(angle + spread), y: y2 - len * Math.sin(angle + spread) },
  ];
}
