import { cleanLinks } from '../core/relations';
import { occupiedFileNames } from './profiles';
import { closeSheet } from '../ui/sheet';
import { compare, combine } from '../core/compare';
import { openWith } from '../core/crypto';
import { normalize } from '../core/profile';
import { readFile } from './fileFormat';
import { save, onLeaveFailure } from '../state';
import { fileWriter, FileChanged } from './fileWriter';
import { openSheet, sheetTop } from '../ui/sheet';
import { shownValue } from '../ui/sensitive';
// Where the person's data is kept, and the status pill in the top bar.
//   'browser'  – default; only in this browser
//   'file'     – a real file on this device; every change saves into it (Chrome, Edge)
//   'download' – browsers that can't write files (Safari, Firefox): download a fresh copy when asked
import { browserSaveState, onBrowserSave, persist, profile, vault, registerFlush, onTabConflict, useNewer, editMark, keepThisTab, otherTabVersion, isLockedInPlace } from '../state';
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
        const other = read.kind === 'plain' ? read.profile : cleanLinks(normalize(JSON.parse(await openWith(vault, read.env))));
        if (other.id !== profile.id) throw new Error();
        const diff = compare(profile, other);
        openSheet(`${sheetTop('Compare versions')}<p>${diff.onlyA.length} cards only in this browser · ${diff.onlyB.length} only in the file · ${diff.changed.length} changed in both${diff.other.length ? ` · ${diff.other.length} other differences` : ''}</p>${diff.changed.map(([a,b]) => `<div><p>This browser: ${esc(shownValue(a))}</p><p>Other file: ${esc(shownValue(b))}</p></div>`).join('')}${diff.other.map(x => `<p>${esc(x.replace('the first copy', 'this browser').replace('the second copy', 'the file'))}</p>`).join('')}<div class="menu"><button data-act="both">Keep both as separate files</button><button data-act="combine">Combine</button></div>`, {
          both: () => downloadCopy(true),
          combine: async () => {
            try {
              const merged = combine(profile, other); const { stageKeepsakes, commitStaged } = await import('./keepsakeImport');
              JSON.stringify(merged); // must be saveable before it replaces anything
              if (read.kind === 'locked') {
                const staged = await stageKeepsakes((await import('./keepsakeAccess')).keepsakeStore, vault!, other, read.keepsakes());
                if (staged.problems.length) throw new Error('Keep both copies: some attachments could not be read');
                await commitStaged((await import('./keepsakeAccess')).keepsakeStore, staged, merged.id!, merged);
              }
              Object.assign(profile, merged); setTarget('browser'); save();
            } catch (e) {
              console.error(e);
              openSheet(`${sheetTop('Compare versions')}<h3 class="sh-title">These versions couldn’t be combined</h3><p>Nothing was changed. Keep both as separate files instead.</p><div class="menu"><button data-act="both">Keep both as separate files</button></div>`, { both: () => downloadCopy(true) });
            }
          },
        });
      } catch {
        openSheet(`${sheetTop('Compare versions')}<h3 class="sh-title">This version couldn’t be compared</h3><p>Nothing was changed. Download your copy first, then open the other file.</p><div class="menu"><button type="button" data-act="download">Download your copy</button><button type="button" data-act="close">Close</button></div>`, { download: () => downloadCopy(true) });
      }
    },
    both: () => downloadCopy(true),
    other: async () => {
      if (!await keepVerifiedCopy()) return;
      const { importText } = await import('../ui/session');
      const h = handle;
      if (!h || !await importText(await h.getFile())) return;
      // This tab now holds the file's version, so the file is up to date again: keep saving into it.
      if (handle === h) { conflict = false; failed = false; dirty = false; await writer.load(h); local.set('you.fileFingerprint.' + profile.id, writer.fingerprint()!); renderPill(); }
    },
  });
}

/**
 * Some browsers (embedded previews, locked-down setups) hand out a file but then refuse to write into it,
 * which leaves an empty file behind. Clean that up and keep the data as downloads instead.
 */
async function fallBackToDownload(h: FileHandle) {
  // Never delete a chosen file, including when write or close failed.
  const dated = h.name.replace(/\.you\.json$/, '') + ` (${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}).you.json`;
  openSheet(`${sheetTop('Keep your latest copy')}<h3 class="sh-title">${esc(h.name)} isn't up to date</h3><p>Your latest changes are here in this browser. The file could not be updated and stays untouched. Download a dated copy to keep these changes.</p><div class="btns"><button class="btn quiet" data-act="close">Later</button><button class="btn primary" data-act="download">Download latest copy</button></div>`, {
    download: async () => { setTarget('download', dated); await downloadCopy(); closeSheet(); },
  });
}

/** Starts a download of `blob` as `name`. */
function startDownload(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Says plainly that a copy couldn't be made. Nothing was changed, and the work is still open. */
function cannotDownload(e: unknown) {
  console.error(e);
  openSheet(`${sheetTop("Couldn't make a copy")}<h3 class="sh-title">The copy couldn’t be made</h3><p>Nothing was changed and your work is still open here. Try again in a moment. If it keeps happening, keep this tab open.</p><div class="menu"><button data-act="close">OK</button></div>`);
}

// The person's own calendar date (not UTC), so a copy made at 7 pm on 8 Nov isn't named 9 Nov.
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** "alex-kim (this browser 2026-11-08).you.json": a copy kept beside the main file. */
// The time to the second makes every copy's name unique, so an older copy from the same day can't be mistaken for it.
const stamp = () => { const d = new Date(); return `${today()} ${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`; };
const separateName = (what: string) => fileNameFor(profile.name).replace('.you.json', ` (${what} ${stamp()}).you.json`);

/** Downloads an encrypted copy of the open You. Returns false (after saying why) if it couldn't. */
export async function downloadCopy(separate = false): Promise<boolean> {
  if (!vault) return false;
  const controller = new AbortController();
  openSheet(`${sheetTop('Making your encrypted copy…')}<p role="status">Keeping your record, photos and files together…</p><button class="btn" data-act="cancel">Cancel</button>`, {
    cancel: () => { controller.abort(); closeSheet(); },
  }, { onDismiss: () => controller.abort() });
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    controller.signal.throwIfAborted();
    const blob = await encodeBlob(vault, profile, sealedFor(profile.id!), controller.signal);
    controller.signal.throwIfAborted();
    closeSheet();
    startDownload(blob, separate ? separateName('this browser') : target.kind === 'download' && target.name ? target.name : fileNameFor(profile.name, occupiedFileNames(profile.id ?? '')));
  } catch (e) {
    if (target.kind === 'download') { dirty = true; renderPill(); }
    if (!controller.signal.aborted) { closeSheet(); cannotDownload(e); }
    return false;
  }
  if (target.kind === 'download') { dirty = false; renderPill(); }
  return true;
}

/**
 * Saves a copy and only answers yes once it really exists. In Chrome and Edge it's written into a file the
 * person picks and read back; elsewhere a page can't tell when a download has finished, so the person
 * checks their Downloads and says so. Cancel counts right up to the end: a cancelled copy is never "kept".
 */
async function saveVerifiedBlob(make: (signal: AbortSignal) => Promise<Blob>, name: string, what: string): Promise<boolean> {
  const controller = new AbortController();
  const busy = () => openSheet(`${sheetTop('Making your encrypted copy…')}<p role="status">Saving a copy of ${what}…</p><button class="btn" data-act="cancel">Cancel</button>`, {
    cancel: () => { controller.abort(); closeSheet(); },
  }, { onDismiss: () => controller.abort() });
  if (canWriteFiles) {
    let h: FileHandle;
    try { h = await w.showSaveFilePicker!({ suggestedName: name, types: FILE_TYPES }); }
    catch { return false; } // the person closed the picker: nothing is kept, nothing is replaced
    busy();
    try {
      const blob = await make(controller.signal);
      controller.signal.throwIfAborted();
      const out = await h.createWritable();
      await (out as unknown as { write(b: Blob): Promise<void> }).write(blob);
      controller.signal.throwIfAborted(); // a cancelled writer is discarded, leaving the chosen file as it was
      await out.close();
      if ((await h.getFile()).size !== blob.size) throw new Error('The copy wasn’t written completely.');
      controller.signal.throwIfAborted();
      closeSheet();
      return true;
    } catch (e) {
      closeSheet();
      if (!controller.signal.aborted) cannotDownload(e);
      return false;
    }
  }
  busy();
  try {
    const blob = await make(controller.signal);
    controller.signal.throwIfAborted();
    closeSheet();
    startDownload(blob, name);
  } catch (e) {
    closeSheet();
    if (!controller.signal.aborted) cannotDownload(e);
    return false;
  }
  return new Promise<boolean>(resolve => openSheet(`${sheetTop('Check your copy')}<h3 class="sh-title">Did the copy finish downloading?</h3>
    <p>Look in your Downloads for <b>${esc(name)}</b>. Continue only once it’s there; until then, nothing here is replaced.</p>
    <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel, change nothing</button><button class="btn primary" type="button" data-act="yes">It’s there, continue</button></div>`, {
    yes: () => { closeSheet(); resolve(true); },
    close: () => resolve(false),
  }));
}

/** Keeps a verified copy of the open You before something replaces it. */
export async function keepVerifiedCopy(): Promise<boolean> {
  if (!vault) return false;
  const v = vault;
  return saveVerifiedBlob(signal => encodeBlob(v, profile, sealedFor(profile.id!), signal), separateName('this browser'), 'this browser’s version');
}

/** Keeps a verified copy of the version another tab saved (same key). Returns its file name and the exact stored copy, or null. */
async function downloadOtherTab(): Promise<{ name: string; envelope: string } | null> {
  try {
    const other = await otherTabVersion();
    if (!other || !vault) return null;
    const v = vault;
    const name = separateName('other tab');
    if (!await saveVerifiedBlob(signal => encodeBlob(v, other.profile, sealedFor(profile.id!), signal), name, 'the other tab’s version')) return null;
    return { name, envelope: other.envelope };
  } catch (e) { cannotDownload(e); return null; }
}

/** Asks where to save, then starts saving there. Returns false if the person cancelled. */
export async function chooseSaveFile(): Promise<boolean> {
  if (!canWriteFiles) { setTarget('download', fileNameFor(profile.name, occupiedFileNames(profile.id ?? ''))); return downloadCopy(); }
  try {
    const h = await w.showSaveFilePicker!({ suggestedName: fileNameFor(profile.name, occupiedFileNames(profile.id ?? '')), types: FILE_TYPES });
    await idb.set(handleKey(), h);
    setTarget('file', h.name);
    handle = h; conflict = false; await writer.load(h);
    dirty = true;
    if (!(await writeFile())) { await fallBackToDownload(h); return false; }
    return true;
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') openSheet(`${sheetTop('Save to a file')}<h3 class="sh-title">That file couldn’t be used</h3><p>Nothing was saved there, and your work is still here. Try another location.</p><div class="menu"><button type="button" data-act="again">Choose another location</button><button type="button" data-act="close">Close</button></div>`, { again: () => { void chooseSaveFile(); } });
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
    if ((e as Error)?.name !== 'AbortError') openSheet(`${sheetTop('Open a file')}<h3 class="sh-title">That file couldn’t be opened</h3><p>Nothing was changed. If you have another saved copy, you can try that one.</p><div class="menu"><button type="button" data-act="again">Choose another file</button><button type="button" data-act="close">Close</button></div>`, { again: () => { void chooseOpenFile(importFile); } });
    else openSheet(`${sheetTop('Open a file')}<p>Nothing was opened.</p>`);
    return false;
  }
}

// ---------- Status pill ----------
const pill = $<HTMLButtonElement>('#saved');

export function renderPill() {
  const n = esc(target.name);
  let html: string, state = 'warn';
  const browser = browserSaveState();
  if (browser.status === 'failed' && browser.reason === 'other tab') state = 'warn fail', html = `<span class="dot"></span><span>Another tab saved newer changes · <b>Choose what to keep</b></span>`;
  else if (browser.status === 'failed') state = 'warn fail', html = `<span class="dot"></span><span>Couldn't save in this browser (${browser.reason}) · <b>Download a copy / Retry</b></span>`;
  else if (browser.status === 'saving') { state = ''; html = '<span class="spin"></span><span>Saving in this browser…</span>'; }
  else if (target.kind === 'browser') html = `<span class="dot"></span><span>Only in this browser · <b>Choose where to keep it</b></span>`;
  else if (needsPermission) state = 'warn fail', html = `<span class="dot"></span><span>${n} isn't up to date · <b>Fix</b></span>`;
  else if (failed) state = 'warn fail', html = `<span class="dot"></span><span>${n} isn't up to date · <b>Fix</b></span>`;
  else if (target.kind === 'download' && dirty) html = `<span class="dot"></span><span>Unsaved changes · <b>Download ${n}</b></span>`;
  else if (saving || dirty) { state = ''; html = `<span class="spin"></span><span>Saving to ${n}…</span>`; }
  // A started download isn't a verified save, so this stays neutral rather than showing a check.
  else if (target.kind === 'download') { state = 'started'; html = `<span>Download started — check it finished in your Downloads (<b>${n}</b>)</span>`; }
  else { state = 'ok'; html = `${ICON.check}<span>Saved to <b>${n}</b></span>`; }
  pill.className = 'saved ' + state;
  pill.innerHTML = html;
  pill.title = pill.textContent || '';
  pill.setAttribute('aria-label', pill.title);
}

/**
 * What a click on the pill should do. Returns 'menu' or 'picker' when the caller should open one;
 * otherwise it has already handled the click (reconnect, retry, download).
 */
export async function pillClick(): Promise<'menu' | 'picker' | 'done'> {
  if (browserSaveState().status === 'failed' && browserSaveState().reason === 'other tab') { showTabConflict(); return 'done'; }
  if (browserSaveState().status === 'failed') {
    openSheet(`${sheetTop("This browser didn't save your latest change")}<p>This browser didn't save your latest change (${browserSaveState().reason === 'storage full' ? 'its storage is full' : 'its storage is blocked'}). Your work is still here. Download a copy to keep it safe.</p><div class="menu"><button data-act="download">Download a copy</button><button data-act="retry">Retry</button></div>`, { download: () => downloadCopy(), retry: () => persist() });
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

/**
 * Another tab saved newer changes and this tab has its own. Never offered while locked (state.ts
 * waits until unlock). `again` says the other tab saved once more while the first choice was made.
 */
function showTabConflict(again = false) {
  if (isLockedInPlace()) return;
  openSheet(`${sheetTop('This You was changed in another tab')}<h3 class="sh-title">Another tab saved newer changes</h3>${again ? '<p><b>The other tab saved again while its copy was downloading, so nothing was overwritten.</b> Choose again; its newest version will be downloaded.</p>' : ''}<p>Both versions can be kept. Whichever you choose, the other one is downloaded first as its own file.</p><div class="menu"><button data-act="newer">Use the other tab’s version (download this tab’s first)</button><button data-act="ours">Keep this tab’s version (download the other tab’s first)</button></div>`, {
  newer: async () => {
    const mark = editMark(); // anything typed after this isn't in the download, so it must not be replaced
    if (!await keepVerifiedCopy()) return; // this tab's version wasn't surely kept: change nothing
    const name = separateName('this browser');
    if (!await useNewer(mark)) return; // something was typed meanwhile: the choice is offered again
    openSheet(`${sheetTop('Using the other tab’s version')}<h3 class="sh-title">Both versions are kept</h3><p>This tab now shows the other tab’s version. This tab’s version was saved as <b>${esc(name)}</b>; you can open it any time with “Load a different file”.</p><div class="menu"><button data-act="close">OK</button></div>`);
  },
  ours: async () => {
    const got = await downloadOtherTab();
    if (!got) return; // couldn't keep the other version: change nothing
    const { name } = got;
    // The other tab saved again during the download: what was downloaded isn't the newest. Ask again.
    if (!await keepThisTab(got.envelope)) { showTabConflict(true); return; }
    openSheet(`${sheetTop('Kept this tab’s version')}<h3 class="sh-title">Both versions are kept</h3><p>This tab’s version is saved in this browser. The other tab’s version was saved as <b>${esc(name)}</b>; you can open it any time with “Load a different file”.</p><div class="menu"><button data-act="close">OK</button></div>`);
  },
  });
}
onTabConflict(() => showTabConflict());

onLeaveFailure(() => new Promise(resolve => openSheet(`${sheetTop("Your latest changes couldn't be saved")}<p>Your work is still here. Download a copy before locking or switching.</p><div class="menu"><button data-act="download">Download before leaving</button><button data-act="stay">Stay here</button></div>`, {
  // If the copy can't be made, say so and stay unlocked: never lock away the only copy.
  // Leaving is allowed only once this tab's work is surely kept somewhere.
  download: async () => { if (await keepVerifiedCopy()) resolve(true); else if (!document.querySelector('#sheet-body [data-act=download]')) resolve(false); }, stay: () => { closeSheet(); resolve(false); }, close: () => resolve(false),
})));
