import { compare, combine } from '../core/compare';
import { openWith } from '../core/crypto';
import { normalize } from '../core/profile';
import { readFile } from './fileFormat';
import { save, onLeaveFailure } from '../state';
import { fileWriter, FileChanged } from './fileWriter';
import { openSheet, sheetTop } from '../ui/sheet';
// Where the person's data is kept, and the status pill in the top bar.
//   'browser'  – default; only in this browser
//   'file'     – a real file on this device; every change saves into it (Chrome, Edge)
//   'download' – browsers that can't write files (Safari, Firefox): download a fresh copy when asked
import { browserSaveState, onBrowserSave, persist, profile, vault, registerFlush, onTabConflict, useNewer, keepThisTab } from '../state';
import { $, ICON, esc } from '../ui/dom';
import { encodeBlob, encodeFile, fileNameFor } from './fileFormat';
import { sealedFor } from './keepsakeAccess';
import { idb } from './idb';
import { local } from './local';
import { currentId, keyFor } from './profiles';

export type TargetKind = 'browser' | 'file' | 'download';

// File System Access API types aren't in TypeScript's DOM library yet.
type Perm = 'granted' | 'denied' | 'prompt';
export interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
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
const writer = fileWriter();
let generation = 0;
let inFlight: Promise<boolean> | undefined;
let conflict = false;
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
  if (handle) await writer.load(handle, local.get('you.fileFingerprint.' + currentId()) || undefined);
  renderPill();
}

/** Call after every change. */
export function scheduleWrite() {
  if (target.kind === 'browser') return;
  generation++; dirty = true;
  if (target.kind === 'file' && handle && !needsPermission) {
    clearTimeout(timer);
    timer = setTimeout(writeFile, 600);
  }
  renderPill();
}

/** Writes the open You into the chosen file. Returns false if it couldn't. */
export function writeFile(): Promise<boolean> {
  clearTimeout(timer);
  if (inFlight) return inFlight.then(ok => ok && dirty ? writeFile() : ok);
  if (!handle || !vault || conflict) return Promise.resolve(false);
  const h = handle, v = vault, p = structuredClone(profile), gen = generation;
  saving = true; failed = false; renderPill();
  inFlight = (async () => {
    try {
      await writer.write(h, encodeFile(v, p, sealedFor(p.id!)));
      local.set('you.fileFingerprint.' + p.id, writer.fingerprint()!);
      if (gen === generation) dirty = false;
    } catch (e) {
      failed = true;
      if (e instanceof FileChanged) { conflict = true; showFileConflict(); }
      if ((e as Error)?.name === 'NotAllowedError') needsPermission = true;
    }
    saving = false; renderPill(); return !failed;
  })().finally(() => { inFlight = undefined; });
  return inFlight;
}
registerFlush(async () => { while (target.kind === 'file' && dirty) { if (!await writeFile()) return false; } return true; });
function showFileConflict() {
  openSheet(`${sheetTop('Your file changed somewhere else')}<p>Your work is still here. Keep a separate copy before opening the other version.</p><div class="menu"><button data-act="both">Keep both</button><button data-act="other">Open the other version</button><button data-act="compare">Compare</button></div>`, {
    compare: async () => {
      if (!handle || !vault) return;
      try {
        const read = await readFile(await handle.getFile());
        const other = read.kind === 'plain' ? read.profile : normalize(JSON.parse(await openWith(vault, read.env)));
        if (other.id !== profile.id) throw new Error();
        const diff = compare(profile, other);
        openSheet(`${sheetTop('Compare versions')}<p>${diff.onlyA.length} cards only in this browser � ${diff.onlyB.length} only in the file � ${diff.changed.length} changed in both</p>${diff.changed.map(([a,b]) => `<div><p>This browser: ${esc(a.value)}</p><p>Other file: ${esc(b.value)}</p></div>`).join('')}<div class="menu"><button data-act="both">Keep both as separate files</button><button data-act="combine">Combine</button></div>`, {
          both: () => downloadCopy(true),
          combine: async () => { const merged = combine(profile, other); const { stageKeepsakes, commitStaged } = await import('./keepsakeImport');
            if (read.kind === 'locked') {
              const staged = await stageKeepsakes((await import('./keepsakeAccess')).keepsakeStore, vault!, other, read.keepsakes());
              if (staged.problems.length) throw new Error('Keep both copies: some attachments could not be read');
              await commitStaged((await import('./keepsakeAccess')).keepsakeStore, staged, merged.id!, merged);
            }
            Object.assign(profile, merged); setTarget('browser'); save(); },
        });
      } catch { alert('This version could not be compared. Download your copy first, then open the other file.'); }
    },
    both: () => downloadCopy(true),
    other: async () => { await downloadCopy(true); const { importText } = await import('../ui/session'); if (handle) await importText(await handle.getFile()); },
  });
}

/**
 * Some browsers (embedded previews, locked-down setups) hand out a file but then refuse to write into it,
 * which leaves an empty file behind. Clean that up and keep the data as downloads instead.
 */
async function fallBackToDownload(h: FileHandle) {
  // Never delete a chosen file, including when write or close failed.
  alert('This browser won’t let You save into files on your device, so you’ll get a downloaded copy instead.\n\n'
    + 'After you make changes, download a fresh copy from the bar at the top. In Chrome or Edge, You can save straight into the file.');
  setTarget('download', h.name);
  await downloadCopy();
}

export async function downloadCopy(separate = false) {
  if (!vault) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await encodeBlob(vault, profile, sealedFor(profile.id!)));
  a.download = separate ? fileNameFor(profile.name).replace('.you.json', ` (this browser ${new Date().toISOString().slice(0, 10)}).you.json`) : target.kind === 'download' && target.name ? target.name : fileNameFor(profile.name);
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
    handle = h; conflict = false; await writer.load(h);
    dirty = true;
    if (!(await writeFile())) await fallBackToDownload(h);
    return true;
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') alert('That file could not be used. Try another location.');
    return false;
  }
}

/**
 * Asks for an existing file and hands it to `importFile` (which may ask for the passphrase).
 * If that succeeds, keeps saving back into the same file. Returns false if cancelled.
 */
export async function chooseOpenFile(importFile: (file: Blob) => Promise<boolean>): Promise<boolean> {
  try {
    const [h] = await w.showOpenFilePicker!({ types: FILE_TYPES });
    const original = await h.getFile();
    const legacy = (await readFile(original)).kind === 'plain';
    if (!(await importFile(original))) return false;
    if (legacy) { setTarget('browser'); return true; }
    await idb.set(handleKey(), h);
    setTarget('file', h.name);
    handle = h; conflict = false; await writer.load(h); local.set('you.fileFingerprint.' + profile.id, writer.fingerprint()!);
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
  if (browser.status === 'failed') html = `<span class="dot"></span><span>Couldn't save in this browser (${browser.reason}) · <b>Download a copy / Retry</b></span>`;
  else if (browser.status === 'saving') { state = ''; html = '<span class="spin"></span><span>Saving in this browser…</span>'; }
  else if (target.kind === 'browser') html = `<span class="dot"></span><span>Only in this browser · <b>Choose where to keep it</b></span>`;
  else if (needsPermission) html = `<span class="dot"></span><span>Reconnect <b>${n}</b></span>`;
  else if (failed) html = `<span class="dot"></span><span>Couldn't save · <b>Try again</b></span>`;
  else if (target.kind === 'download' && dirty) html = `<span class="dot"></span><span>Unsaved changes · <b>Download ${n}</b></span>`;
  else if (saving || dirty) { state = ''; html = `<span class="spin"></span><span>Saving to ${n}…</span>`; }
  else { state = 'ok'; html = `${ICON.check}<span>${target.kind === 'download' ? 'Downloaded (check your Downloads)' : 'Saved to'} <b>${n}</b></span>`; }
  pill.className = 'saved ' + state;
  pill.innerHTML = html;
}

/**
 * What a click on the pill should do. Returns 'menu' or 'picker' when the caller should open one;
 * otherwise it has already handled the click (reconnect, retry, download).
 */
export async function pillClick(): Promise<'menu' | 'picker' | 'done'> {
  if (browserSaveState().status === 'failed') {
    openSheet(`${sheetTop("This browser didn't save your latest change")}<p>This browser didn't save your latest change (storage is full / blocked). Your work is still here. Download a copy to keep it safe.</p><div class="menu"><button data-act="download">Download a copy</button><button data-act="retry">Retry</button></div>`, { download: () => downloadCopy(), retry: () => persist() });
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
  if (failed) {
    if (conflict) { showFileConflict(); return 'done'; }
    openSheet(`${sheetTop("Your file couldn't be saved")}<p>Your work is still here. Keep a copy somewhere safe.</p><div class="menu"><button data-act="retry">Retry</button><button data-act="elsewhere">Save elsewhere</button><button data-act="download">Download a copy</button></div>`, { retry: () => writeFile(), elsewhere: () => chooseSaveFile(), download: () => downloadCopy(true) });
    return 'done';
  }
  if (target.kind === 'download' && dirty) { downloadCopy(); return 'done'; }
  return 'menu';
}

onBrowserSave(renderPill);

onTabConflict(() => openSheet(`${sheetTop('This You was changed in another tab')}<p>Keep a copy of this tab before choosing the newer version.</p><div class="menu"><button data-act="newer">Use the newer version</button><button data-act="ours">Keep this tab�s version</button></div>`, {
  newer: async () => { await downloadCopy(true); await useNewer(); },
  ours: async () => { await keepThisTab(); },
}));

onLeaveFailure(() => new Promise(resolve => openSheet(`${sheetTop("Your latest changes couldn't be saved")}<p>Your work is still here. Download a copy before locking or switching.</p><div class="menu"><button data-act="download">Download before leaving</button><button data-act="stay">Stay here</button></div>`, {
  download: async () => { await downloadCopy(true); resolve(true); }, stay: () => resolve(false), close: () => resolve(false),
})));
