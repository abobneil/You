import { cleanLinks } from './core/relations';
// The open You's data in memory, the unlocked key, and "something changed" notifications.
// Nothing is written anywhere until there is a key: the browser copy is encrypted too.
import { newId } from './core/cards';
import { openWith } from './core/crypto';
import type { Vault } from './core/crypto';
import { emptyProfile, normalize } from './core/profile';
import type { Profile } from './core/types';
import { encode } from './storage/fileFormat';
import { archiveVersion, deleteArchived, getArchived } from './storage/archive';
import { KEYS, local } from './storage/local';
import { currentId, removeProfile, setCurrent, upsertProfile } from './storage/profiles';

import { migrateVault, vaultStore } from './storage/vaultStore';
import { saveQueue, type SaveState } from './storage/saveQueue';
import { staleGuard } from './storage/staleGuard';

export let profile: Profile = emptyProfile();
export let vault: Vault | null = null;

const listeners: (() => void)[] = [];
/** Runs after each edit so the screen and chosen file follow immediately. */
export const onSave = (fn: () => void) => { listeners.push(fn); };

const saveListeners: (() => void)[] = [];
export const onBrowserSave = (fn: () => void) => { saveListeners.push(fn); };
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('you') : null;
const withLock = <T,>(name: string, fn: () => Promise<T>): Promise<T> =>
  typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(name, fn) as Promise<T> : fn();
const guard = staleGuard(vaultStore, withLock);
/** Counts edits; `committedEdit` is the last one known to be in the stored copy. */
let editCount = 0, committedEdit = 0;
const conflictListeners: (() => void)[] = [];
export const onTabConflict = (fn: () => void) => { conflictListeners.push(fn); };
/**
 * True while the open You is hidden behind the lock screen (locked in place, key still in memory).
 * Conflict choices are never offered then: they wait until the person unlocks.
 */
let lockedInPlace = false, conflictWaiting = false;
export const isLockedInPlace = () => lockedInPlace;
function tabConflict() {
  if (lockedInPlace) { conflictWaiting = true; return; }
  conflictListeners.forEach(fn => fn());
}
export function setLockedInPlace(locked: boolean) { lockedInPlace = locked; }
/**
 * After unlocking in place: re-read storage (the stale guard) and settle anything another tab did
 * while this one was locked. Newer work with no edits here simply loads; with edits on both sides,
 * the person is asked now.
 */
export async function settleAfterUnlock() {
  lockedInPlace = false;
  const waiting = conflictWaiting; conflictWaiting = false;
  if (!vault || !profile.id) return;
  const stored = await vaultStore.get(profile.id);
  const changed = guard.baseline() !== undefined && stored !== guard.baseline();
  if (!changed && !waiting) return;
  if (!changed) { if (browserSaveState().status === 'failed') void persist(); return; }
  if (editCount === committedEdit && browserSaveState().status !== 'failed') { await useNewer(); return; }
  conflictListeners.forEach(fn => fn());
}
/** True while a panel with unsaved typing is open (set by the sheet), so another tab's save never reloads it away. */
let draftOpen: () => boolean = () => false;
export const setDraftCheck = (fn: () => boolean) => { draftOpen = fn; };
const replacedListeners: (() => void)[] = [];
/** Runs after the open record was swapped for the newer copy another tab saved, so the screen can redraw. */
export const onReplaced = (fn: () => void) => { replacedListeners.push(fn); };
/** The current edit count, so a caller can tell later whether anything was typed in between. */
export const editMark = () => editCount;
/**
 * Loads the newer copy another tab saved, in place (or by reloading if nothing can redraw).
 * If anything was typed here since `since` (by default, since this call began), nothing is replaced:
 * the person is asked again, so an edit made while the other copy was loading is never dropped.
 * Returns whether the newer copy was loaded.
 */
export async function useNewer(since = editCount): Promise<boolean> {
  const text = await vaultStore.get(profile.id!);
  if (!text || !vault) return false;
  const id = profile.id;
  const newer = cleanLinks(normalize(JSON.parse(await openWith(vault, JSON.parse(text)))));
  if (editCount !== since) { tabConflict(); return false; }
  newer.id = id; // the browser slot decides which You this is
  profile = newer;
  guard.begin(text);
  committedEdit = editCount;
  // A save refused because of the other tab is now settled: clear the "couldn't save" state.
  if (browserSaveState().status === 'failed') void persist();
  if (replacedListeners.length) replacedListeners.forEach(fn => fn());
  else location.reload();
  return true;
}
/** The other tab's version, as stored now (decrypted with this tab's key) with its exact stored text, or null. */
export async function otherTabVersion(): Promise<{ profile: Profile; envelope: string } | null> {
  const text = await vaultStore.get(profile.id!);
  if (!text || !vault) return null;
  return { profile: normalize(JSON.parse(await openWith(vault, JSON.parse(text)))), envelope: text };
}
/**
 * Overwrites the other tab's version, but only if what's stored is still exactly `downloaded` (the
 * copy the caller just kept as a file). Returns false, changing nothing, if another save landed since.
 */
export async function keepThisTab(downloaded: string): Promise<boolean> {
  if (!await guard.adoptStored(profile.id!, downloaded)) return false;
  // The other tab's version is about to be written over: keep it here as an earlier version too.
  await archiveVersion(profile.id!, downloaded, 'from another tab, before this tab’s version was kept');
  await persist();
  return true;
}
channel?.addEventListener('message', async e => {
  if (e.data?.id !== profile.id || !vault) return;
  guard.markStale();
  if (lockedInPlace) { conflictWaiting = true; return; } // settled on unlock (settleAfterUnlock)
  // Nothing unsaved here: simply show the newer copy. Otherwise the next save asks what to keep.
  if (browserSaveState().status === 'saved' && editCount === committedEdit && !draftOpen()) await useNewer();
  else if (editCount !== committedEdit) tabConflict();
});
const queue = saveQueue(async ({ p, v, edit }: { p: Profile; v: Vault; edit: number }) => {
  const envelope = await encode(v, p);
  const result = await guard.write(p.id!, envelope, edit !== committedEdit);
  if (result === 'newer') { await useNewer(); return; }
  if (result === 'conflict') {
    tabConflict();
    throw Object.assign(new Error('This You was changed in another tab'), { name: 'TabConflict' });
  }
  committedEdit = Math.max(committedEdit, edit);
  channel?.postMessage({ id: p.id, rev: p.rev });
  if (await vaultStore.get(p.id!) !== envelope) throw new Error('Could not verify browser copy');
  const old = local.get(`you.vault.${p.id}`);
  local.remove(`you.vault.${p.id}`);
  if (old && local.get(KEYS.vault) === old) local.remove(KEYS.vault);
  upsertProfile(p.id!, p.name);
  setCurrent(p.id!);
  local.remove(KEYS.profile);
}, () => saveListeners.forEach(fn => fn()));
export const browserSaveState = (): SaveState => queue.state();
const flushers: (() => Promise<boolean>)[] = [];
export const registerFlush = (fn: () => Promise<boolean>) => { flushers.push(fn); };
export const flushPending = async () => { await queue.flush(); return (await Promise.all(flushers.map(fn => fn()))).every(Boolean); };
let recoverBeforeLeave: (() => Promise<boolean>) | undefined;
export const onLeaveFailure = (fn: () => Promise<boolean>) => { recoverBeforeLeave = fn; };
export async function canLeave() {
  const filesOK = await flushPending();
  if (filesOK && browserSaveState().status !== 'failed') return true;
  return recoverBeforeLeave ? recoverBeforeLeave() : false;
}
if (typeof window !== 'undefined') window.addEventListener('beforeunload', e => {
  if (browserSaveState().status !== 'saved') { e.preventDefault(); e.returnValue = ''; }
});
export function persist(): Promise<void> {
  if (!vault || !profile.id) return Promise.resolve();
  return queue.enqueue({ p: structuredClone(profile), v: vault, edit: editCount });
}
/** True when this tab has edits that aren't in the stored copy yet. */
export const hasUnsavedEdits = () => editCount !== committedEdit || browserSaveState().status !== 'saved';

export function save() {
  editCount++;
  profile.rev = (profile.rev || 0) + 1;
  profile.updatedAt = new Date().toISOString();
  persist();
  listeners.forEach(fn => fn());
}

/**
 * Starts a session: the data and the key that protects it. `from` is the stored envelope that was
 * decrypted to get `p`; later saves only go ahead while storage still holds exactly that copy.
 * Leave it out when the person chose to replace the stored copy (a new You, a file they opened).
 */
export async function setSession(p: Profile, v: Vault | null, from?: string | null) {
  await flushPending();
  guard.begin(from !== undefined ? from : await vaultStore.get(p.id || currentId()));
  committedEdit = editCount;
  profile = p;
  profile.id = profile.id || currentId() || newId();
  profile.updatedAt = profile.updatedAt || new Date().toISOString();
  vault = v;
  return persist();
}

/** The earlier version the last open-in-place kept, so its Undo restores exactly that one. */
export let lastReplaced: string | null = null;
/** What the last open-in-place wrote, so its Undo only goes back while nothing has been saved since. */
export let lastOpened: string | null = null;

/**
 * Opens a file's record in place of what this browser holds for that You, but only if the stored copy is
 * still exactly `expected` (what the person agreed to replace, null when nothing was stored). The check,
 * `commit` (moving the file's checked photos into place) and writing the record all happen under the
 * same per-You lock saves use, so another tab's save either lands first (and nothing here is replaced)
 * or waits and then finds this record changed (and asks instead of overwriting).
 * Returns false, having changed nothing, when the stored copy moved on.
 */
export async function openInPlace(p: Profile, v: Vault, expected: string | null, commit: () => Promise<void>, signal?: AbortSignal, reason = 'before opening a file in its place', pointOfNoReturn?: () => void): Promise<boolean> {
  await flushPending();
  const id = p.id!;
  const written = await withLock('you-' + id, async () => {
    if ((await vaultStore.get(id)) !== expected) return null;
    await commit();
    signal?.throwIfAborted(); // Cancel still counts until the record itself is written
    // Whatever is stored is kept as an earlier version first, so this replace can't lose it, whatever
    // this tab knew and whether or not an outside copy was made.
    if (expected !== null) lastReplaced = await archiveVersion(id, expected, reason);
    const envelope = await encode(v, p);
    // From here the record is written, so Cancel is no longer offered; until here it still counts.
    signal?.throwIfAborted();
    pointOfNoReturn?.();
    await vaultStore.set(id, envelope);
    if (await vaultStore.get(id) !== envelope) throw new Error('Could not verify browser copy');
    return envelope;
  });
  if (written === null) return false;
  await setSession(p, v, written);
  // Starting the session saves once more (fresh encryption), so what Undo compares against is what's
  // stored once that has settled, not the bytes written above.
  await flushPending();
  lastOpened = await vaultStore.get(id);
  channel?.postMessage({ id, rev: p.rev });
  return true;
}

/**
 * Puts an earlier version back as this browser's copy of `id`. What's stored now is kept as an earlier
 * version first, so restoring is itself reversible. The caller reloads afterwards: the restored version
 * unlocks with the passphrase it was saved with.
 */
export async function restoreArchived(id: string, key: string, onlyIf?: string): Promise<boolean | 'changed'> {
  await flushPending();
  const earlier = await getArchived(key);
  if (!earlier) return false;
  const changed = await withLock('you-' + id, async () => {
    const now = await vaultStore.get(id);
    // Undo after an open: if anything was saved since (here or in another tab), don't quietly set it aside.
    if (onlyIf !== undefined && now !== onlyIf) return true;
    if (now !== null) await archiveVersion(id, now, 'before restoring an earlier version');
    await vaultStore.set(id, earlier.envelope);
    if (await vaultStore.get(id) !== earlier.envelope) throw new Error('Could not verify browser copy');
    await deleteArchived(key);
    return false;
  });
  if (changed) return 'changed';
  channel?.postMessage({ id });
  return true;
}

/** The open You's encrypted browser copy, if there is one. */
export const storedEnvelope = async (id = currentId()) => { if (!id) return null;
  try { return await migrateVault(id, local); }
  catch (e) { const old = local.get(`you.vault.${id}`); if (old !== null) return old; throw e; } };

/** Data saved by earlier, unencrypted versions of You, waiting to be protected. */
export function legacyProfile(): Profile | null {
  try {
    const p = cleanLinks(normalize(JSON.parse(local.get(KEYS.profile) || 'null')));
    return p.name ? p : null;
  } catch { return null; }
}

/** "Start over" / "Remove from this browser": erases this You's browser copy. Saved files are untouched. */
export async function eraseBrowserCopy(id = currentId()) {
  if (id) { await flushPending(); await removeProfile(id); }
}
