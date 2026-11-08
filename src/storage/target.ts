// Where the person's data is kept, and the status pill in the top bar.
//   'browser'  – default; only in this browser
//   'file'     – a real file on this device; every change saves into it (Chrome, Edge)
//   'download' – browsers that can't write files (Safari, Firefox): download a fresh copy when asked
import { browserSaveState, onBrowserSave, persist, profile, vault } from '../state';
import { $, ICON, esc } from '../ui/dom';
import { encode, fileNameFor } from './fileFormat';
import { idb } from './idb';
import { local } from './local';
import { currentId, keyFor } from './profiles';

export type TargetKind = 'browser' | 'file' | 'download';

// File System Access API types aren't in TypeScript's DOM library yet.
type Perm = 'granted' | 'denied' | 'prompt';
export interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission(o: { mode: 'readwrite' }): Promise<Perm>;
  requestPermission(o: { mode: 'readwrite' }): Promise<Perm>;
}
const w = window as unknown as {
  showSaveFilePicker?: (o: object) => Promise<FileHandle>;
  showOpenFilePicker?: (o: object) => Promise<FileHandle[]>;
};
export const canWriteFiles = typeof w.showSaveFilePicker === 'function';
const FILE_TYPES = [{ description: 'You data', accept: { 'application/json': ['.json'] } }];

// Each You has its own save location. Keys use the open You's id ('new' before it's first saved).
const tk = (k: 'target' | 'targetName') => keyFor(currentId() || 'new', k);
const handleKey = () => `handle.${currentId() || 'new'}`;

export const target = {
  kind: (local.get(tk('target')) as TargetKind) || 'browser',
  name: local.get(tk('targetName')) || '',
};
let handle: FileHandle | null = null;
let dirty = false, saving = false, needsPermission = false, failed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const changeListeners: (() => void)[] = [];
export const onTargetChange = (fn: () => void) => { changeListeners.push(fn); };

export function setTarget(kind: TargetKind, name = '') {
  target.kind = kind;
  target.name = name;
  local.set(tk('target'), kind);
  local.set(tk('targetName'), name);
  if (kind !== 'file') { handle = null; idb.del(handleKey()); }
  dirty = false; failed = false; needsPermission = false;
  renderPill();
  changeListeners.forEach(fn => fn());
}

/** On startup: find the file we were saving to. Browsers ask for permission again after a reload. */
export async function initTarget() {
  // Before Yous could be switched, the file handle was stored under one shared key.
  if (local.get('you.migrateHandle') === currentId()) {
    const old = await idb.get<FileHandle>('handle');
    if (old) { await idb.set(handleKey(), old); await idb.del('handle'); }
    local.remove('you.migrateHandle');
  }
  if (target.kind === 'file') {
    handle = canWriteFiles ? (await idb.get<FileHandle>(handleKey())) ?? null : null;
    if (!handle) setTarget('browser');
    else needsPermission = (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted';
  }
  renderPill();
}

/** Call after every change. */
export function scheduleWrite() {
  if (target.kind === 'browser') return;
  dirty = true;
  if (target.kind === 'file' && handle && !needsPermission) {
    clearTimeout(timer);
    timer = setTimeout(writeFile, 600);
  }
  renderPill();
}

/** Writes the open You into the chosen file. Returns false if it couldn't. */
export async function writeFile(): Promise<boolean> {
  if (!handle || !vault) return false;
  saving = true; failed = false; renderPill();
  try {
    const out = await handle.createWritable();
    await out.write(await encode(vault, profile));
    await out.close();
    dirty = false;
  } catch (e) {
    failed = true;
    if ((e as Error)?.name === 'NotAllowedError') needsPermission = true;
  }
  saving = false;
  renderPill();
  return !failed;
}

/**
 * Some browsers (embedded previews, locked-down setups) hand out a file but then refuse to write into it,
 * which leaves an empty file behind. Clean that up and keep the data as downloads instead.
 */
async function fallBackToDownload(h: FileHandle) {
  try { await (h as FileHandle & { remove?: () => Promise<void> }).remove?.(); } catch { /* leave it */ }
  alert('This browser won’t let You save into files on your device, so you’ll get a downloaded copy instead.\n\n'
    + 'After you make changes, download a fresh copy from the bar at the top. In Chrome or Edge, You can save straight into the file.');
  setTarget('download', h.name);
  await downloadCopy();
}

export async function downloadCopy() {
  if (!vault) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([await encode(vault, profile)], { type: 'application/json' }));
  a.download = target.kind === 'download' && target.name ? target.name : fileNameFor(profile.name);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  if (target.kind === 'download') { dirty = false; renderPill(); }
}

/** Asks where to save, then starts saving there. Returns false if the person cancelled. */
export async function chooseSaveFile(): Promise<boolean> {
  if (!canWriteFiles) { setTarget('download', fileNameFor(profile.name)); downloadCopy(); return true; }
  try {
    const h = await w.showSaveFilePicker!({ suggestedName: fileNameFor(profile.name), types: FILE_TYPES });
    await idb.set(handleKey(), h);
    setTarget('file', h.name);
    handle = h;
    dirty = true;
    if (!(await writeFile())) await fallBackToDownload(h);
    return true;
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') alert('That file could not be used. Try another location.');
    return false;
  }
}

/**
 * Asks for an existing file and hands its text to `importText` (which may ask for the passphrase).
 * If that succeeds, keeps saving back into the same file. Returns false if cancelled.
 */
export async function chooseOpenFile(importText: (text: string) => Promise<boolean>): Promise<boolean> {
  try {
    const [h] = await w.showOpenFilePicker!({ types: FILE_TYPES });
    if (!(await importText(await (await h.getFile()).text()))) return false;
    await idb.set(handleKey(), h);
    setTarget('file', h.name);
    handle = h;
    needsPermission = (await h.requestPermission({ mode: 'readwrite' })) !== 'granted';
    renderPill();
    return true;
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') alert('That file could not be opened.');
    return false;
  }
}

// ---------- Status pill ----------
const pill = $<HTMLButtonElement>('#saved');

export function renderPill() {
  const n = esc(target.name);
  let html: string, state = 'warn';
  const browser = browserSaveState();
  if (browser.status === 'failed') html = `<span class="dot"></span><span>Couldn't save in this browser (${browser.reason}) � <b>Download a copy / Retry</b></span>`;
  else if (browser.status === 'saving') { state = ''; html = '<span class="spin"></span><span>Saving in this browser�</span>'; }
  else if (target.kind === 'browser') html = `<span class="dot"></span><span>Only in this browser · <b>Choose where to keep it</b></span>`;
  else if (needsPermission) html = `<span class="dot"></span><span>Reconnect <b>${n}</b></span>`;
  else if (failed) html = `<span class="dot"></span><span>Couldn't save · <b>Try again</b></span>`;
  else if (target.kind === 'download' && dirty) html = `<span class="dot"></span><span>Unsaved changes · <b>Download ${n}</b></span>`;
  else if (saving || dirty) { state = ''; html = `<span class="spin"></span><span>Saving to ${n}…</span>`; }
  else { state = 'ok'; html = `${ICON.check}<span>${target.kind === 'download' ? 'Downloaded' : 'Saved to'} <b>${n}</b></span>`; }
  pill.className = 'saved ' + state;
  pill.innerHTML = html;
}

/**
 * What a click on the pill should do. Returns 'menu' or 'picker' when the caller should open one;
 * otherwise it has already handled the click (reconnect, retry, download).
 */
export async function pillClick(): Promise<'menu' | 'picker' | 'done'> {
  if (browserSaveState().status === 'failed') {
    await downloadCopy();
    await persist();
    return 'done';
  }
  if (target.kind === 'browser') return 'picker';
  if (needsPermission && handle) {
    const h = handle;
    let ok = false;
    try {
      if ((await h.requestPermission({ mode: 'readwrite' })) === 'granted') { needsPermission = false; ok = await writeFile(); }
    } catch { /* treated as refused */ }
    if (!ok) await fallBackToDownload(h);
    return 'done';
  }
  if (failed) { await writeFile(); return 'done'; }
  if (target.kind === 'download' && dirty) { downloadCopy(); return 'done'; }
  return 'menu';
}

onBrowserSave(renderPill);
