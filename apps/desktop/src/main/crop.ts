export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Normalize two drag points into a positive-area rect (CSS pixels). */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Convert a CSS-pixel selection rect to a device-pixel crop rect on the
 * full-resolution screenshot, scaling by the display's scaleFactor and clamping
 * to the image bounds (so a drag past the edge never crops out of range).
 */
export function toDeviceRect(
  cssRect: Rect,
  scaleFactor: number,
  imageWidth: number,
  imageHeight: number,
): Rect {
  const x = clamp(Math.round(cssRect.x * scaleFactor), 0, imageWidth);
  const y = clamp(Math.round(cssRect.y * scaleFactor), 0, imageHeight);
  const width = clamp(Math.round(cssRect.width * scaleFactor), 0, imageWidth - x);
  const height = clamp(Math.round(cssRect.height * scaleFactor), 0, imageHeight - y);
  return { x, y, width, height };
}

/** A crop rect is usable only if it has a meaningful area. */
export function isUsableRect(rect: Rect, minSize = 2): boolean {
  return rect.width >= minSize && rect.height >= minSize;
}
