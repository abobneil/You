import { cleanLinks } from '../core/relations';
import { occupiedFileNames } from './profiles';
import { closeSheet } from '../ui/sheet';
import { compare, combine } from '../core/compare';
import { openWith } from '../core/crypto';
import { normalize } from '../core/profile';
import { readFile } from './fileFormat';
import { save, onLeaveFailure } from '../state';
import { fileWriter, FileChanged, fingerprintOf } from './fileWriter';
import { openSheet, sheetTop } from '../ui/sheet';
import { shownValue } from '../ui/sensitive';
// Where the person's data is kept, and the status pill in the top bar.
//   'browser'  – default; only in this browser
//   'file'     – a real file on this device; every change saves into it (Chrome, Edge)
//   'download' – browsers that can't write files (Safari, Firefox): download a fresh copy when asked
import { browserSaveState, onBrowserSave, persist, profile, vault, registerFlush, onTabConflict, useNewer, editMark, keepThisTab, otherTabVersion, isLockedInPlace, keepAfterRemoval, storedEnvelope, browserCopyIsCurrent, hasUnsavedEdits } from '../state';
import { $, ICON, esc } from '../ui/dom';
import { encodeBlob, encodeFile, fileNameFor } from './fileFormat';
import { sealedFor } from './keepsakeAccess';
import { idb } from './idb';
import { local } from './local';
import { currentId, keyFor, wantsNew } from './profiles';

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

// Each You has its own save location, keyed by the You open in THIS tab. The browser-wide "current You"
// moves whenever any tab saves, so it must never decide where this tab's work goes. A tab opens one You
// (switching reloads), so the id at load stands in until the open You has its own id.
const tabYouAtLoad = currentId() || 'new';
const me = () => profile.id || (wantsNew() ? 'new' : tabYouAtLoad);
const tk = (k: 'target' | 'targetName') => keyFor(me(), k);
const handleKey = () => `handle.${me()}`;

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
/** Why the last file write failed, in plain words, when it's something the person should know. */
let lastFailure = '';
let timer: ReturnType<typeof setTimeout> | undefined;
const changeListeners: (() => void)[] = [];
export const onTargetChange = (fn: () => void) => { changeListeners.push(fn); };

export function setTarget(kind: TargetKind, name = '') {
  target.kind = kind;
  target.name = name;
  local.set(tk('target'), kind);
  local.set(tk('targetName'), name);
  if (kind !== 'file') { handle = null; idb.del(handleKey()); }
  local.remove(behindKey());
  dirty = false; failed = false; needsPermission = false;
  renderPill();
  changeListeners.forEach(fn => fn());
}

/**
 * After an earlier version is put back, the file `id` was saving into holds newer work than what's now
 * here. Stop saving into it, for that You whether or not it's the one open (the damaged-copy screen has none
 * open), and in every other tab (they hear it through the storage event below). The person chooses again.
 */
/**
 * The person started a new You in this tab without reloading (from the "can't be read" screen). Whatever
 * this tab loaded for the earlier You (its save file, its handle) must not become the new You's.
 */
export function startFreshTarget() {
  handle = null; conflict = false; dirty = false; failed = false; needsPermission = false;
  target.kind = 'browser'; target.name = '';
  renderPill();
  changeListeners.forEach(fn => fn());
}

export async function forgetFileTarget(id: string) {
  if (me() === id) setTarget('browser');
  local.set(keyFor(id, 'target'), 'browser');
  local.set(keyFor(id, 'targetName'), '');
  local.remove('you.fileFingerprint.' + id);
  local.remove('you.fileBehind.' + id);
  await idb.del(`handle.${id}`);
}
window.addEventListener('storage', e => {
  if (e.key !== tk('target') && e.key !== tk('targetName')) return;
  const kind = (local.get(tk('target')) as TargetKind) || 'browser', name = local.get(tk('targetName')) || '';
  if (kind === target.kind && name === target.name) return;
  if (kind === 'file') void followFile(name);
  else if (target.kind === 'file') setTarget('browser');
});
/** Another tab chose a different save file for this You: save into that one here too, never the old one. */
async function followFile(name: string) {
  const h = canWriteFiles ? (await idb.get<FileHandle>(handleKey())) ?? null : null;
  target.kind = 'file'; target.name = name;
  handle = h; conflict = false; failed = false;
  if (h) {
    await writer.load(h, local.get('you.fileFingerprint.' + me()) || undefined);
    needsPermission = (await h.queryPermission({ mode: 'readwrite' })) !== 'granted';
  }
  dirty = fileIsBehind(me());
  renderPill();
  changeListeners.forEach(fn => fn());
}

/** On startup: find the file we were saving to. Browsers ask for permission again after a reload. */
export async function initTarget() {
  // Before Yous could be switched, the file handle was stored under one shared key.
  if (local.get('you.migrateHandle') === me()) {
    const old = await idb.get<FileHandle>('handle');
    if (old) { await idb.set(handleKey(), old); await idb.del('handle'); }
    local.remove('you.migrateHandle');
  }
  if (target.kind === 'file') {
    handle = canWriteFiles ? (await idb.get<FileHandle>(handleKey())) ?? null : null;
    if (!handle) setTarget('browser');
    else needsPermission = (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted';
  }
  if (handle) await writer.load(handle, local.get('you.fileFingerprint.' + me()) || undefined);
  // The file was left behind last time (a failed write, or the page closed before it ran): say so, and
  // catch it up now if this browser may write to it.
  if (handle && fileIsBehind(me())) { dirty = true; if (!needsPermission) timer = setTimeout(writeFile, 600); }
  if (target.kind === 'download' && fileIsBehind(me())) dirty = true;
  renderPill();
}

/**
 * "The file is behind what's in this browser", remembered outside this tab's memory, so a reload or
 * another tab never shows "Saved to <file>" while the file is missing work (and Remove can warn).
 */
const behindKey = () => 'you.fileBehind.' + me();
/** Each save that hasn't reached the file yet gets a new value, so a write of an older snapshot can tell. */
const behindToken = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
export const fileIsBehind = (id: string) => !!local.get('you.fileBehind.' + id) || (me() === id && (target.kind === 'file' || target.kind === 'download') && (dirty || failed));
window.addEventListener('storage', e => {
  if (target.kind === 'file' && handle && e.key === 'you.fileFingerprint.' + me() && e.newValue) void writer.load(handle, e.newValue); // another tab of this You wrote it
  if ((target.kind === 'file' || target.kind === 'download') && e.key === behindKey()) {
    // Another tab's work isn't in the file yet: if this tab holds the stored copy, it can bring the file up to date too.
    if (e.newValue && !dirty) {
      dirty = true; renderPill();
      // Normally the tab that saved writes the file within moments. Only if it's still behind well after
      // that (that tab failed or closed) does this tab, holding the same stored copy, write it instead.
      if (handle && !needsPermission) { clearTimeout(timer); timer = setTimeout(() => { if (local.get(behindKey()) && browserCopyIsCurrent()) void writeFile(); }, 15000); }
    }
    // Another tab brought it up to date: only true for this tab if it holds exactly what was stored.
    else if (!e.newValue && dirty && !saving && !failed && browserCopyIsCurrent() && !hasUnsavedEdits()) { dirty = false; renderPill(); }
  }
});
// Leaving while the file hasn't caught up: the browser asks first (the next visit catches the file up).
// Not after the person already kept a verified copy to leave (the leave prompt), so they aren't asked twice.
let copyKeptToLeave = false;
window.addEventListener('beforeunload', e => { if ((target.kind === 'file' || target.kind === 'download') && (dirty || failed) && !copyKeptToLeave) e.preventDefault(); });

onBrowserSave(() => { if (target.kind === 'file' && dirty && handle && browserSaveState().status === 'saved' && !needsPermission) { clearTimeout(timer); timer = setTimeout(writeFile, 600); } });

/** Call after every change. */
export function scheduleWrite() {
  if (target.kind === 'browser') return;
  generation++; dirty = true;
  local.set(behindKey(), behindToken()); // a file or a download: behind until the latest is really in it
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
  if (handle && !vault && dirty && !conflict) { clearTimeout(timer); timer = setTimeout(writeFile, 1000); return Promise.resolve(false); } // not unlocked yet: try again
  // The file only ever gets what this browser has stored: while this tab's own save is pending, refused
  // (another tab saved newer changes) or failed, writing its record into the file could replace newer work.
  if (handle && vault && !browserCopyIsCurrent()) {
    if (browserSaveState().status === 'saving') { clearTimeout(timer); timer = setTimeout(writeFile, 300); }
    return Promise.resolve(false);
  }
  if (!handle || !vault || conflict) return Promise.resolve(false);
  // What this write will contain, and which "behind" mark it answers: a newer save (any tab) changes the mark.
  const h = handle, v = vault, p = structuredClone(profile), gen = generation, answers = local.get(behindKey());
  saving = true; failed = false; renderPill();
  inFlight = (async () => {
    try {
      // Never replace the file with fewer photos than it had; photos that were already unreadable when this
      // record was opened ("Open the rest") weren't in it to begin with, so they don't block the write.
      const known = new Set<string>(JSON.parse(local.get('you.missingPhotos.' + p.id) || '[]'));
      // One tab at a time writes a given You's file, so the fingerprint check and the swap can't interleave.
      const write = () => writer.write(h, encodeFile(v, p, sealedFor(p.id!), id => !known.has(id)));
      await (navigator.locks ? navigator.locks.request('you-file-' + p.id, write) : write());
      local.set('you.fileFingerprint.' + p.id, writer.fingerprint()!);
      // Clear the shared mark only if nothing newer was saved since this snapshot was taken.
      const now = local.get(behindKey());
      if (now === answers) local.remove(behindKey());
      if (gen === generation && now === answers) dirty = false;
      else if (now !== answers) { clearTimeout(timer); timer = setTimeout(() => { if (local.get(behindKey()) && browserCopyIsCurrent()) void writeFile(); }, 1000); } // catch up with the newer save
    } catch (e) {
      failed = true;
      if (!local.get('you.fileBehind.' + p.id)) local.set('you.fileBehind.' + p.id, behindToken());
      lastFailure = (e as Error)?.name === 'MissingKeepsake' ? (e as Error).message : '';
      if (e instanceof FileChanged) { conflict = true; showFileConflict(); }
      if ((e as Error)?.name === 'NotAllowedError') needsPermission = true;
    }
    saving = false; renderPill(); return !failed;
  })().finally(() => { inFlight = undefined; });
  return inFlight;
}
registerFlush(async () => {
  if (!vault) return true; // locked: the work is in the browser copy, and the file stays marked as behind
  while (target.kind === 'file' && dirty) { if (!await writeFile()) return false; }
  return true;
});
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
      if (!h) return;
      // What is opened is exactly these bytes; if the file changes again while this opens, the next save must notice.
      let read: Awaited<ReturnType<typeof h.getFile>>, fp: string;
      try { read = await h.getFile(); fp = await fingerprintOf(read); }
      catch { showFileConflict(); return; } // it changed again while being read: ask again rather than do nothing
      if (!await importText(read)) return;
      // This tab now holds the file's version, so the file is up to date again: keep saving into it.
      if (handle === h) { conflict = false; failed = false; dirty = false; await writer.load(h, fp); local.set('you.fileFingerprint.' + profile.id, writer.fingerprint()!); renderPill(); }
    },
  });
}

/**
 * Some browsers (embedded previews, locked-down setups) hand out a file but then refuse to write into it,
 * which leaves an empty file behind. Clean that up and keep the data as downloads instead.
 */
async function fallBackToDownload(h: FileHandle) {
  // Never delete a chosen file, including when write or close failed.
  const dated = h.name.replace(/\.you\.json$/, '') + ` (${today()}).you.json`;
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
  // The download answers the "behind" mark as it is now, and is of this tab's copy as it is now.
  const answers = local.get(behindKey()), currentAtStart = browserCopyIsCurrent();
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
  // Only a download of what this browser has stored counts as up to date for every tab.
  if (target.kind === 'download' && !separate) {
    // Only a download of the stored copy, with nothing newer saved meanwhile, brings every tab up to date.
    const caughtUp = currentAtStart && browserCopyIsCurrent() && local.get(behindKey()) === answers;
    if (caughtUp) { dirty = false; local.remove(behindKey()); }
    renderPill();
  }
  return true;
}

/** True when the file read back holds exactly the bytes that were written, compared a piece at a time. */
async function sameBytes(a: Blob, b: Blob, signal: AbortSignal): Promise<boolean> {
  if (a.size !== b.size) return false;
  const step = 8 * 1024 * 1024;
  for (let at = 0; at < a.size; at += step) {
    signal.throwIfAborted();
    const [x, y] = await Promise.all([a.slice(at, at + step).arrayBuffer(), b.slice(at, at + step).arrayBuffer()]);
    const u = new Uint8Array(x), v = new Uint8Array(y);
    for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
  }
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
      if (!await sameBytes(await h.getFile(), blob, controller.signal)) throw new Error('The copy wasn’t written completely.');
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
  const missing: string[] = JSON.parse(local.get('you.missingPhotos.' + me()) || '[]');
  if (missing.length && canWriteFiles) {
    // Choosing an existing file in the picker empties it straight away in some browsers, so say this first.
    const go = await new Promise<boolean>(resolve => openSheet(`${sheetTop('Save to a file')}<h3 class="sh-title">Save to a new file name</h3><p>${missing.length === 1 ? 'One photo or file' : `${missing.length} photos or files`} this record lists isn’t in this browser. Choose a new name rather than an existing copy, or that copy would lose ${missing.length === 1 ? 'it' : 'them'}.</p><div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" data-act="go">Choose a new file name</button></div>`, { go: () => { closeSheet(); resolve(true); }, close: () => resolve(false) }));
    if (!go) return false;
  }
  if (!canWriteFiles) { setTarget('download', fileNameFor(profile.name, occupiedFileNames(profile.id ?? ''))); return downloadCopy(); }
  try {
    const h = await w.showSaveFilePicker!({ suggestedName: fileNameFor(profile.name, occupiedFileNames(profile.id ?? '')), types: FILE_TYPES });
    await idb.set(handleKey(), h);
    setTarget('file', h.name);
    // A file that already has something in it isn't the one those photos were missing from: no allowance.
    if ((await h.getFile()).size > 0) local.remove('you.missingPhotos.' + me());
    handle = h; conflict = false; await writer.load(h);
    dirty = true; local.set(behindKey(), behindToken()); // behind until its first write has really landed
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
    const fp = await fingerprintOf(original); // later saves check the file is still exactly what was opened
    const legacy = (await readFile(original)).kind === 'plain';
    if (!(await importFile(original))) return false;
    if (legacy) { setTarget('browser'); return true; }
    await idb.set(handleKey(), h);
    setTarget('file', h.name);
    handle = h; conflict = false; await writer.load(h, fp); local.set('you.fileFingerprint.' + profile.id, writer.fingerprint()!);
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
  else if (needsPermission && (dirty || fileIsBehind(me()))) state = 'warn fail', html = `<span class="dot"></span><span>${n} isn't up to date · <b>Fix</b></span>`;
  else if (needsPermission) html = `<span class="dot"></span><span>Saved to ${n} · <b>Allow saving here</b></span>`; // current; the browser asks again after a restart
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
    openSheet(`${sheetTop("Your file couldn't be saved")}${lastFailure ? `<p>${esc(lastFailure)}</p>` : ''}<p>Your work is still here. Keep a copy somewhere safe.</p><div class="menu"><button data-act="retry">Retry</button><button data-act="elsewhere">Save elsewhere</button><button data-act="download">Download a copy</button></div>`, { retry: () => writeFile(), elsewhere: () => chooseSaveFile(), download: () => downloadCopy(true) });
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
async function showTabConflict(again = false) {
  if (isLockedInPlace()) return;
  // Not a newer version at all: another tab removed this You from the browser. Say that, and offer a way back.
  const removed = profile.id && await storedEnvelope(profile.id).catch(() => 'unknown') === null;
  if (isLockedInPlace()) return; // it locked while this was being checked: asked again after unlock
  if (removed) {
    const attached = profile.cards.reduce((n, c) => n + (c.keepsakes?.length ?? 0), 0);
    openSheet(`${sheetTop('Removed in another tab')}<h3 class="sh-title">${esc(profile.name || 'This You')} was removed from this browser in another tab</h3><p>Your writing is still open here. Keep it in this browser again, or save it as a file.</p>${attached ? `<p><b>The ${attached} photo${attached === 1 ? '' : 's'} and file${attached === 1 ? '' : 's'} attached here were removed with it.</b> If you saved a file before, it still has them.</p>` : ''}<div class="menu"><button data-act="keep">Keep it in this browser</button><button data-act="file">Save it as a file</button></div>`, {
      keep: async () => { if (await keepAfterRemoval()) closeSheet(); else void showTabConflict(); },
      file: async () => { if (await keepVerifiedCopy()) closeSheet(); },
    });
    return;
  }
  openSheet(`${sheetTop('This You was changed in another tab')}<h3 class="sh-title">Another tab saved newer changes</h3>${again ? '<p><b>The other tab saved again while its copy was downloading, so nothing was overwritten.</b> Choose again; its newest version will be downloaded.</p>' : ''}<p>Both versions can be kept. Whichever you choose, the other one is downloaded first as its own file.</p><div class="menu"><button data-act="newer">Use the other tab’s version (download this tab’s first)</button><button data-act="ours">Keep this tab’s version (download the other tab’s first)</button></div>`, {
  newer: async () => {
    const mark = editMark(); // anything typed after this isn't in the download, so it must not be replaced
    if (!await keepVerifiedCopy()) return; // this tab's version wasn't surely kept: change nothing
    const name = separateName('this browser');
    if (!await useNewer(mark)) return; // something was typed meanwhile: the choice is offered again
    scheduleWrite(); // the save file gets the version now kept here
    openSheet(`${sheetTop('Using the other tab’s version')}<h3 class="sh-title">Both versions are kept</h3><p>This tab now shows the other tab’s version. This tab’s version was saved as <b>${esc(name)}</b>; you can open it any time with “Load a different file”.</p><div class="menu"><button data-act="close">OK</button></div>`);
  },
  ours: async () => {
    const got = await downloadOtherTab();
    if (!got) return; // couldn't keep the other version: change nothing
    const { name } = got;
    // The other tab saved again during the download: what was downloaded isn't the newest. Ask again.
    if (!await keepThisTab(got.envelope)) { void showTabConflict(true); return; }
    scheduleWrite(); // the save file gets this tab's version, which is now the one kept
    openSheet(`${sheetTop('Kept this tab’s version')}<h3 class="sh-title">Both versions are kept</h3><p>This tab’s version is saved in this browser. The other tab’s version was saved as <b>${esc(name)}</b>; you can open it any time with “Load a different file”.</p><div class="menu"><button data-act="close">OK</button></div>`);
  },
  });
}
onTabConflict(() => { void showTabConflict(); });

onLeaveFailure(() => new Promise(resolve => openSheet(`${sheetTop("Your latest changes couldn't be saved")}<p>Your work is still here. Download a copy before locking or switching.</p><div class="menu"><button data-act="download">Download before leaving</button><button data-act="stay">Stay here</button></div>`, {
  // If the copy can't be made, say so and stay unlocked: never lock away the only copy.
  // Leaving is allowed only once this tab's work is surely kept somewhere.
  download: async () => { if (await keepVerifiedCopy()) { copyKeptToLeave = true; resolve(true); } else if (!document.querySelector('#sheet-body [data-act=download]')) resolve(false); }, stay: () => { closeSheet(); resolve(false); }, close: () => resolve(false),
})));
