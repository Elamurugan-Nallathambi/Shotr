// Web-page capture builder. Drives the shared engine via window.shotrWeb.
// Form types mirror src/main/webconfig.ts (kept local so the engine isn't
// pulled into the renderer bundle).

interface WebPageForm {
  id?: string;
  title: string;
  path: string;
  fullPage: boolean;
  waitForSelector?: string;
}
interface WebAuthForm {
  enabled: boolean;
  mode?: 'scripted' | 'manual';
  loginUrl?: string;
  usernameSelector?: string;
  username?: string;
  passwordSelector?: string;
  password?: string;
  submitSelector?: string;
  successSelector?: string;
}
interface WebSettingsForm {
  width: number;
  height: number;
  browser: string;
  header: boolean;
  os: string;
  frame: boolean;
}
interface WebCaptureForm {
  id: string;
  name: string;
  baseUrl: string;
  environment: string;
  auth: WebAuthForm;
  pages: WebPageForm[];
  settings: WebSettingsForm;
}

interface ProjectSummary { id: string; name: string; baseUrl: string; pageCount: number }
interface PageResult { pageId: string; title: string; url: string; viewport: string; status: string; error?: string; filePath?: string; thumb?: string }
interface RunResult {
  ok: boolean;
  error?: string;
  reportPath?: string;
  outputDir?: string;
  summary?: { total: number; successful: number; failed: number };
  results?: PageResult[];
}

interface ShotrWebApi {
  listProjects: () => Promise<ProjectSummary[]>;
  getProject: (id: string) => Promise<WebCaptureForm | null>;
  saveProject: (f: WebCaptureForm) => Promise<{ ok: boolean }>;
  deleteProject: (id: string) => Promise<{ ok: boolean }>;
  run: (f: WebCaptureForm) => Promise<RunResult>;
  manualLoginStart: (f: WebCaptureForm) => Promise<{ ok: boolean; error?: string }>;
  manualLoginSave: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  manualLoginCancel: () => void;
  sessionStatus: (id: string) => Promise<{ exists: boolean }>;
  clearSession: (id: string) => Promise<{ ok: boolean }>;
  exportYaml: (f: WebCaptureForm) => Promise<{ ok: boolean; filePath?: string }>;
  importYaml: (id: string) => Promise<{ ok: boolean; form?: WebCaptureForm; error?: string }>;
  openReport: (p: string) => void;
  openFolder: (d: string) => void;
  onProgress: (cb: (p: { level: string; text: string }) => void) => () => void;
}

const web = (window as unknown as { shotrWeb: ShotrWebApi }).shotrWeb;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const newId = () => `p${Date.now().toString(36)}${Math.floor(performance.now()).toString(36)}`;

function blankForm(): WebCaptureForm {
  return {
    id: newId(),
    name: 'My Web App',
    baseUrl: 'https://example.com',
    environment: 'QA',
    auth: { enabled: false, mode: 'scripted' },
    pages: [{ title: 'Home', path: '/', fullPage: true }],
    settings: { width: 1440, height: 900, browser: 'chromium', header: true, os: 'auto', frame: false },
  };
}

let form: WebCaptureForm = blankForm();

// ---- rendering ----------------------------------------------------------
function setVal(id: string, v: string | number | undefined): void {
  ($(id) as HTMLInputElement).value = v === undefined ? '' : String(v);
}
function setChk(id: string, v: boolean): void {
  ($(id) as HTMLInputElement).checked = v;
}

function renderForm(): void {
  setVal('name', form.name);
  setVal('environment', form.environment);
  setVal('baseUrl', form.baseUrl);
  setChk('authEnabled', form.auth.enabled);
  $('authFields').classList.toggle('hidden', !form.auth.enabled);
  setAuthMode(form.auth.mode === 'manual' ? 'manual' : 'scripted');
  setVal('loginUrl', form.auth.loginUrl);
  setVal('usernameSelector', form.auth.usernameSelector);
  setVal('username', form.auth.username);
  setVal('passwordSelector', form.auth.passwordSelector);
  setVal('password', form.auth.password);
  setVal('submitSelector', form.auth.submitSelector);
  setVal('successSelector', form.auth.successSelector);
  setVal('width', form.settings.width);
  setVal('height', form.settings.height);
  setVal('browser', form.settings.browser);
  setVal('os', form.settings.os);
  setChk('header', form.settings.header);
  setChk('frame', form.settings.frame);
  renderPages();
}

function renderPages(): void {
  const tbody = $('pages');
  tbody.innerHTML = '';
  form.pages.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" data-k="title" data-i="${i}" value="${escapeAttr(p.title)}" /></td>
      <td><input type="text" data-k="path" data-i="${i}" value="${escapeAttr(p.path)}" /></td>
      <td style="text-align:center"><input type="checkbox" data-k="fullPage" data-i="${i}" ${p.fullPage ? 'checked' : ''} /></td>
      <td><input type="text" data-k="waitForSelector" data-i="${i}" value="${escapeAttr(p.waitForSelector ?? '')}" /></td>
      <td><button class="iconbtn" data-del="${i}">✕</button></td>`;
    tbody.appendChild(tr);
  });
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ---- form ↔ state -------------------------------------------------------
function readForm(): void {
  form.name = ($('name') as HTMLInputElement).value;
  form.environment = ($('environment') as HTMLInputElement).value;
  form.baseUrl = ($('baseUrl') as HTMLInputElement).value;
  form.auth.enabled = ($('authEnabled') as HTMLInputElement).checked;
  form.auth.mode = authMode();
  form.auth.loginUrl = val('loginUrl');
  form.auth.usernameSelector = val('usernameSelector');
  form.auth.username = val('username');
  form.auth.passwordSelector = val('passwordSelector');
  form.auth.password = val('password');
  form.auth.submitSelector = val('submitSelector');
  form.auth.successSelector = val('successSelector');
  form.settings.width = Number(($('width') as HTMLInputElement).value) || 1440;
  form.settings.height = Number(($('height') as HTMLInputElement).value) || 900;
  form.settings.browser = ($('browser') as HTMLSelectElement).value;
  form.settings.os = ($('os') as HTMLSelectElement).value;
  form.settings.header = ($('header') as HTMLInputElement).checked;
  form.settings.frame = ($('frame') as HTMLInputElement).checked;
}
function val(id: string): string | undefined {
  const v = ($(id) as HTMLInputElement).value.trim();
  return v || undefined;
}

// ---- sidebar ------------------------------------------------------------
async function refreshProjects(): Promise<void> {
  const list = await web.listProjects();
  const box = $('projects');
  box.innerHTML = '';
  for (const p of list) {
    const el = document.createElement('div');
    el.className = 'proj' + (p.id === form.id ? ' active' : '');
    el.innerHTML = `<div>${escapeAttr(p.name)}</div><div class="u">${escapeAttr(p.baseUrl)} · ${p.pageCount} page(s)</div>`;
    el.addEventListener('click', () => void loadProject(p.id));
    box.appendChild(el);
  }
}

async function loadProject(id: string): Promise<void> {
  const loaded = await web.getProject(id);
  if (loaded) {
    form = loaded;
    renderForm();
    void refreshProjects();
  }
}

// ---- events -------------------------------------------------------------
$('authEnabled').addEventListener('change', () => {
  form.auth.enabled = ($('authEnabled') as HTMLInputElement).checked;
  $('authFields').classList.toggle('hidden', !form.auth.enabled);
});

function setAuthMode(mode: 'scripted' | 'manual'): void {
  document.querySelectorAll('#authModeSeg .segbtn').forEach((b) =>
    b.classList.toggle('active', (b as HTMLElement).dataset.mode === mode),
  );
  show('scriptedFields', mode === 'scripted');
  show('manualFields', mode === 'manual');
  show('manualActive', false);
  show('manualIdle', true);
  if (mode === 'manual') void refreshSession();
}

function authMode(): 'scripted' | 'manual' {
  return document.querySelector('#authModeSeg .segbtn.active')?.getAttribute('data-mode') === 'manual'
    ? 'manual'
    : 'scripted';
}

async function refreshSession(): Promise<void> {
  const el = $('sessionStatus');
  const s = await web.sessionStatus(form.id);
  if (s.exists) {
    el.textContent = 'Session saved ✓ — runs reuse it';
    el.className = 'sess ok';
  } else {
    el.textContent = 'No saved session';
    el.className = 'sess';
  }
}

document.querySelectorAll('#authModeSeg .segbtn').forEach((b) => {
  b.addEventListener('click', () => {
    const m = (b as HTMLElement).dataset.mode === 'manual' ? 'manual' : 'scripted';
    form.auth.mode = m;
    setAuthMode(m);
  });
});

$('manualLogin').addEventListener('click', async () => {
  readForm();
  if (!form.baseUrl && !form.auth.loginUrl) {
    toast('Set a base URL or login URL first.');
    return;
  }
  const res = await web.manualLoginStart(form);
  if (!res.ok) {
    toast(res.error ?? 'Could not open the login browser.');
    return;
  }
  show('manualIdle', false);
  show('manualActive', true);
});

$('saveSession').addEventListener('click', async () => {
  const res = await web.manualLoginSave();
  show('manualActive', false);
  show('manualIdle', true);
  toast(res.ok ? 'Session saved ✓' : (res.error ?? 'Could not save session.'));
  void refreshSession();
});

$('cancelSession').addEventListener('click', () => {
  web.manualLoginCancel();
  show('manualActive', false);
  show('manualIdle', true);
});

$('clearSession').addEventListener('click', async () => {
  await web.clearSession(form.id);
  toast('Session cleared.');
  void refreshSession();
});

$('pages').addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  const i = Number(t.dataset.i);
  const k = t.dataset.k as keyof WebPageForm;
  if (Number.isNaN(i) || !k) return;
  const page = form.pages[i];
  if (!page) return;
  if (k === 'fullPage') page.fullPage = t.checked;
  else (page[k] as string) = t.value;
});
$('pages').addEventListener('click', (e) => {
  const del = (e.target as HTMLElement).dataset.del;
  if (del !== undefined) {
    form.pages.splice(Number(del), 1);
    renderPages();
  }
});
$('addPage').addEventListener('click', () => {
  form.pages.push({ title: 'New page', path: '/', fullPage: true });
  renderPages();
});

$('new').addEventListener('click', () => {
  form = blankForm();
  renderForm();
  void refreshProjects();
});

$('save').addEventListener('click', async () => {
  readForm();
  await web.saveProject(form);
  void refreshProjects();
  flash($('save') as HTMLButtonElement, 'Saved ✓');
});

$('delete').addEventListener('click', async () => {
  await web.deleteProject(form.id);
  form = blankForm();
  renderForm();
  void refreshProjects();
});

$('export').addEventListener('click', async () => {
  readForm();
  const res = await web.exportYaml(form);
  if (res.ok) flash($('export') as HTMLButtonElement, 'Exported ✓');
});

$('import').addEventListener('click', async () => {
  const res = await web.importYaml(newId());
  if (res.ok && res.form) {
    form = res.form;
    renderForm();
  }
});

function flash(btn: HTMLButtonElement, label: string): void {
  const orig = btn.textContent;
  btn.textContent = label;
  window.setTimeout(() => (btn.textContent = orig), 1100);
}

// ---- run ----------------------------------------------------------------
function cleanProgressLine(level: string, text: string): string {
  // Turn engine log lines into friendly ticks, hiding raw file paths.
  if (level === 'ok' && text.includes('→')) return `✓ ${text.split('→')[0]!.trim()}`;
  if (level === 'err') return `✕ ${text}`;
  return text;
}

function renderGallery(results: PageResult[]): void {
  const g = $('gallery');
  g.innerHTML = '';
  for (const r of results) {
    const ok = r.status === 'success';
    const card = document.createElement('div');
    card.className = 'gcard';
    const media = ok && r.thumb
      ? `<img src="${r.thumb}" alt="${escapeAttr(r.title)}" data-file="${escapeAttr(r.filePath ?? '')}" />`
      : `<div class="noimg">no image</div>`;
    card.innerHTML = `${media}
      <div class="cap">
        <div class="t"><span class="dot ${ok ? 'ok' : 'err'}"></span>${escapeAttr(r.title)}</div>
        <div class="u">${escapeAttr(r.url)}</div>
        ${r.error ? `<div class="err">${escapeAttr(r.error)}</div>` : ''}
      </div>`;
    g.appendChild(card);
  }
  g.querySelectorAll('img[data-file]').forEach((img) => {
    img.addEventListener('click', () => {
      const f = (img as HTMLElement).dataset.file;
      if (f) web.openReport(f); // shell.openPath opens the image file
    });
  });
}

function show(id: string, visible: boolean): void {
  $(id).classList.toggle('hidden', !visible);
}

let toastTimer = 0;
function toast(msg: string): void {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 3000);
}

function markInvalid(id: string): void {
  const el = $(id) as HTMLInputElement;
  el.classList.add('invalid');
  el.focus();
  window.setTimeout(() => el.classList.remove('invalid'), 2500);
}

/** Friendly, user-facing message for common run errors. */
function friendlyError(error?: string): string {
  if (!error) return 'Something went wrong.';
  if (/LOGIN_PASS/.test(error)) return 'Enter the login password, then run again.';
  if (/LOGIN_USER/.test(error)) return 'Enter the login username, then run again.';
  if (/Executable doesn't exist|browserType\.launch/.test(error)) return 'Browser engine unavailable — please reinstall Shotr.';
  return error;
}

$('run').addEventListener('click', async () => {
  readForm();

  // Guard authenticated runs so they never fail on a cryptic error.
  if (form.auth.enabled) {
    if (form.auth.mode === 'manual') {
      const s = await web.sessionStatus(form.id);
      if (!s.exists) {
        toast('Log in in the browser and save a session before running.');
        setAuthMode('manual');
        return;
      }
    } else {
      if (!form.auth.password) {
        markInvalid('password');
        toast('Enter the login password to run this authenticated capture.');
        return;
      }
      if (!form.auth.username) {
        markInvalid('username');
        toast('Enter the login username for this authenticated capture.');
        return;
      }
    }
  }
  if (!form.pages.length) {
    toast('Add at least one page to capture.');
    return;
  }

  await web.saveProject(form);
  void refreshProjects();

  const live = $('live');
  live.innerHTML = '';
  $('gallery').innerHTML = '';
  show('live', true);
  show('gallery', false);
  show('spin', true);
  show('progressBadge', false);
  show('openReport', false);
  show('openFolder', false);
  $('progressTitle').textContent = 'Capturing…';
  $('resultSum').textContent = 'Working…';
  $('progress').classList.add('show');

  const off = web.onProgress((p) => {
    const line = document.createElement('div');
    line.className = p.level;
    line.textContent = cleanProgressLine(p.level, p.text);
    live.appendChild(line);
    live.scrollTop = live.scrollHeight;
  });

  const res = await web.run(form);
  off();
  show('spin', false);

  if (res.ok && res.summary) {
    $('progressTitle').textContent = res.summary.failed ? 'Capture finished' : 'Capture complete';
    const badge = $('progressBadge');
    badge.textContent = `${res.summary.successful}/${res.summary.total}`;
    show('progressBadge', true);
    $('resultSum').textContent =
      `${res.summary.successful} of ${res.summary.total} page(s) captured` +
      (res.summary.failed ? ` · ${res.summary.failed} failed` : '');
    renderGallery(res.results ?? []);
    show('live', false);
    show('gallery', true);
    if (res.reportPath) {
      show('openReport', true);
      ($('openReport') as HTMLButtonElement).onclick = () => web.openReport(res.reportPath as string);
    }
    if (res.outputDir) {
      show('openFolder', true);
      ($('openFolder') as HTMLButtonElement).onclick = () => web.openFolder(res.outputDir as string);
    }
  } else {
    $('progressTitle').textContent = 'Capture failed';
    const msg = friendlyError(res.error);
    $('resultSum').textContent = msg;
    const errLine = document.createElement('div');
    errLine.className = 'err';
    errLine.textContent = msg;
    live.appendChild(errLine);
  }
});

$('closeProgress').addEventListener('click', () => $('progress').classList.remove('show'));

// ---- init ---------------------------------------------------------------
renderForm();
void refreshProjects();
export {};
