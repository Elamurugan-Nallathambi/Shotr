// Annotation editor built on Fabric.js. Captured image is the canvas
// background; tools add pencil strokes, text, and shapes — all selectable,
// movable, and resizable. Copy/Save export the flattened canvas.
import {
  Canvas,
  Rect,
  Ellipse,
  Line,
  Polygon,
  Group,
  IText,
  PencilBrush,
  FabricImage,
  type FabricObject,
} from 'fabric';
import {
  arrowHead,
  isDrawingTool,
  isShapeTool,
  shapeFromDrag,
  textSpecAt,
  type ToolId,
  type Vec,
} from './editor-tools.js';

declare global {
  interface Window {
    shotrEditor?: {
      image: () => Promise<string>;
      copy: (dataUrl: string) => void;
      save: (dataUrl: string) => Promise<{ saved: boolean }>;
    };
  }
}

const api = window.shotrEditor;
const canvasEl = document.getElementById('canvas') as HTMLCanvasElement;
const canvas = new Canvas(canvasEl, { backgroundColor: '#ffffff', preserveObjectStacking: true });

const style = { color: '#ef4444', size: 4 };
let tool: ToolId = 'select';

// --- history (undo/redo) -------------------------------------------------
const undoStack: string[] = [];
const redoStack: string[] = [];
let restoring = false;

function snapshot(): void {
  if (restoring) return;
  undoStack.push(JSON.stringify(canvas.toJSON()));
  redoStack.length = 0;
}

async function restore(json: string): Promise<void> {
  restoring = true;
  await canvas.loadFromJSON(json);
  canvas.requestRenderAll();
  restoring = false;
}

async function undo(): Promise<void> {
  if (undoStack.length < 2) return;
  redoStack.push(undoStack.pop() as string);
  await restore(undoStack[undoStack.length - 1] as string);
}

async function redo(): Promise<void> {
  const json = redoStack.pop();
  if (!json) return;
  undoStack.push(json);
  await restore(json);
}

// --- toolbar -------------------------------------------------------------
function setTool(next: ToolId): void {
  tool = next;
  canvas.isDrawingMode = isDrawingTool(next);
  canvas.selection = next === 'select';
  if (canvas.isDrawingMode) {
    const brush = new PencilBrush(canvas);
    brush.color = style.color;
    brush.width = style.size;
    canvas.freeDrawingBrush = brush;
  }
  canvas.forEachObject((o) => {
    o.selectable = next === 'select';
    o.evented = next === 'select';
  });
  document.querySelectorAll('#toolbar button[data-tool]').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.tool === next);
  });
  canvas.requestRenderAll();
}

document.querySelectorAll('#toolbar button[data-tool]').forEach((b) => {
  b.addEventListener('click', () => setTool((b as HTMLElement).dataset.tool as ToolId));
});
(document.getElementById('color') as HTMLInputElement).addEventListener('input', (e) => {
  style.color = (e.target as HTMLInputElement).value;
  if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.color = style.color;
});
(document.getElementById('size') as HTMLInputElement).addEventListener('input', (e) => {
  style.size = Number((e.target as HTMLInputElement).value);
  if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.width = style.size;
});
document.getElementById('undo')?.addEventListener('click', () => void undo());
document.getElementById('redo')?.addEventListener('click', () => void redo());
document.getElementById('delete')?.addEventListener('click', deleteActive);

const copyBtn = document.getElementById('copy') as HTMLButtonElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;

/** Briefly show a confirmation label on a button, then restore it. */
function confirm(btn: HTMLButtonElement, label: string): void {
  const original = btn.dataset.label ?? btn.textContent ?? '';
  btn.dataset.label = original;
  btn.textContent = label;
  btn.classList.add('flash');
  window.setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('flash');
  }, 1100);
}

copyBtn?.addEventListener('click', () => {
  api?.copy(exportPng());
  confirm(copyBtn, 'Copied ✓');
});

saveBtn?.addEventListener('click', async () => {
  const res = await api?.save(exportPng());
  if (res?.saved) confirm(saveBtn, 'Saved ✓');
});

// Quick press flash on every toolbar button so a click is always visible.
document.querySelectorAll('#toolbar button').forEach((b) => {
  b.addEventListener('pointerdown', () => {
    b.classList.add('clicked');
    window.setTimeout(() => b.classList.remove('clicked'), 160);
  });
});

function deleteActive(): void {
  const active = canvas.getActiveObjects();
  if (!active.length) return;
  active.forEach((o) => canvas.remove(o));
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  snapshot();
}

function exportPng(): string {
  return canvas.toDataURL({ format: 'png', multiplier: 1 });
}

// --- shape drawing -------------------------------------------------------
let dragStart: Vec | null = null;
let draft: FabricObject | null = null;

function buildObject(a: Vec, b: Vec): FabricObject | null {
  const spec = shapeFromDrag(tool, a, b, style);
  if (!spec) return null;
  if (spec.kind === 'rect') {
    return new Rect({ left: spec.left, top: spec.top, width: spec.width, height: spec.height, stroke: spec.stroke, strokeWidth: spec.strokeWidth, fill: 'transparent' });
  }
  if (spec.kind === 'ellipse') {
    return new Ellipse({ left: spec.left, top: spec.top, rx: spec.width / 2, ry: spec.height / 2, stroke: spec.stroke, strokeWidth: spec.strokeWidth, fill: 'transparent' });
  }
  if (spec.kind === 'line' || spec.kind === 'arrow') {
    const line = new Line([spec.x1, spec.y1, spec.x2, spec.y2], { stroke: spec.stroke, strokeWidth: spec.strokeWidth });
    if (spec.kind === 'line') return line;
    const head = new Polygon(arrowHead(spec.x1, spec.y1, spec.x2, spec.y2, spec.strokeWidth), { fill: spec.stroke });
    return new Group([line, head]);
  }
  return null;
}

canvas.on('mouse:down', (opt) => {
  if (tool === 'text') {
    const p = canvas.getScenePoint(opt.e);
    const t = textSpecAt({ x: p.x, y: p.y }, style);
    const text = new IText('Text', { left: t.left, top: t.top, fill: t.fill, fontSize: t.fontSize });
    canvas.add(text);
    canvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    snapshot();
    setTool('select');
    return;
  }
  if (!isShapeTool(tool)) return;
  const p = canvas.getScenePoint(opt.e);
  dragStart = { x: p.x, y: p.y };
});

canvas.on('mouse:move', (opt) => {
  if (!dragStart || !isShapeTool(tool)) return;
  const p = canvas.getScenePoint(opt.e);
  if (draft) canvas.remove(draft);
  draft = buildObject(dragStart, { x: p.x, y: p.y });
  if (draft) {
    draft.selectable = false;
    canvas.add(draft);
    canvas.requestRenderAll();
  }
});

canvas.on('mouse:up', () => {
  if (dragStart && draft) {
    draft.selectable = true;
    draft.setCoords();
    canvas.setActiveObject(draft);
    snapshot();
  }
  dragStart = null;
  draft = null;
});

canvas.on('path:created', snapshot);
canvas.on('object:modified', snapshot);

// --- keyboard shortcuts --------------------------------------------------
window.addEventListener('keydown', (e) => {
  const editingText = canvas.getActiveObject()?.type === 'i-text' && (canvas.getActiveObject() as IText).isEditing;
  if (editingText) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && canvas.getActiveObjects().length) {
    e.preventDefault();
    deleteActive();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    void (e.shiftKey ? redo() : undo());
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
    api?.copy(exportPng());
    confirm(copyBtn, 'Copied ✓');
  }
});

// --- init ----------------------------------------------------------------
async function init(): Promise<void> {
  const dataUrl = await api?.image();
  if (!dataUrl) return;
  const img = await FabricImage.fromURL(dataUrl);
  canvas.setDimensions({ width: img.width, height: img.height });
  canvas.backgroundImage = img;
  canvas.requestRenderAll();
  snapshot();
}

void init();
setTool('select');
export {};
