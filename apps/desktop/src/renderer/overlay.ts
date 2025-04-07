// Region-selection overlay. Shows the frozen screenshot full-screen with a
// crosshair and dimmed backdrop; dragging cuts out a bright selection and shows
// live output dimensions. Reports the CSS-pixel rect back to the main process.
import { rectFromPoints, type Point, type Rect } from '../main/crop.js';

declare global {
  interface Window {
    shotrRegion?: {
      image: () => Promise<{ dataUrl: string; scaleFactor: number }>;
      ready: () => void;
      complete: (rect: Rect) => void;
      cancel: () => void;
    };
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const shot = $<HTMLImageElement>('shot');
const sel = $<HTMLDivElement>('sel');
const size = $<HTMLDivElement>('size');
const predim = $<HTMLDivElement>('predim');
const vline = $<HTMLDivElement>('vline');
const hline = $<HTMLDivElement>('hline');
const api = window.shotrRegion;

let start: Point | null = null;
let scaleFactor = 1;

async function init(): Promise<void> {
  const data = await api?.image();
  if (!data) {
    api?.ready();
    return;
  }
  scaleFactor = data.scaleFactor || 1;
  shot.onload = () => api?.ready(); // reveal the overlay only once the image is painted
  shot.onerror = () => api?.ready();
  shot.src = data.dataUrl;
}

function showGuides(x: number, y: number): void {
  vline.style.left = `${x}px`;
  hline.style.top = `${y}px`;
}

function setGuidesVisible(visible: boolean): void {
  vline.style.display = visible ? 'block' : 'none';
  hline.style.display = visible ? 'block' : 'none';
}

function drawSelection(rect: Rect): void {
  sel.style.display = 'block';
  sel.style.left = `${rect.x}px`;
  sel.style.top = `${rect.y}px`;
  sel.style.width = `${rect.width}px`;
  sel.style.height = `${rect.height}px`;

  // Output pixel size (CSS px × device scale factor).
  const w = Math.round(rect.width * scaleFactor);
  const h = Math.round(rect.height * scaleFactor);
  size.style.display = 'block';
  size.textContent = `${w} × ${h}`;
  const top = rect.y > 28 ? rect.y - 24 : rect.y + rect.height + 8;
  size.style.left = `${rect.x}px`;
  size.style.top = `${top}px`;
}

window.addEventListener('mousemove', (e) => {
  if (start) {
    drawSelection(rectFromPoints(start, { x: e.clientX, y: e.clientY }));
  } else {
    showGuides(e.clientX, e.clientY);
  }
});

window.addEventListener('mousedown', (e) => {
  start = { x: e.clientX, y: e.clientY };
  setGuidesVisible(false);
  predim.style.display = 'none'; // the selection's box-shadow now provides the dim
  drawSelection({ x: start.x, y: start.y, width: 0, height: 0 });
});

window.addEventListener('mouseup', (e) => {
  if (!start) return;
  const rect = rectFromPoints(start, { x: e.clientX, y: e.clientY });
  start = null;
  api?.complete(rect);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api?.cancel();
});

void init();
export {};
