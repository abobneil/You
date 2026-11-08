import { cleanLinks } from './core/relations';
// The open You's data in memory, the unlocked key, and "something changed" notifications.
// Nothing is written anywhere until there is a key: the browser copy is encrypted too.
import { newId } from './core/cards';
import { openWith } from './core/crypto';
import type { Vault } from './core/crypto';
import { emptyProfile, normalize } from './core/profile';
import type { Profile } from './core/types';
import { encode } from './storage/fileFormat';
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
/** True while a panel with unsaved typing is open (set by the sheet), so another tab's save never reloads it away. */
let draftOpen: () => boolean = () => false;
export const setDraftCheck = (fn: () => boolean) => { draftOpen = fn; };
const replacedListeners: (() => void)[] = [];
/** Runs after the open record was swapped for the newer copy another tab saved, so the screen can redraw. */
export const onReplaced = (fn: () => void) => { replacedListeners.push(fn); };
/** Loads the newer copy another tab saved, in place (or by reloading if nothing can redraw). */
export async function useNewer() {
  const text = await vaultStore.get(profile.id!);
  if (!text || !vault) return;
  const id = profile.id;
  const newer = cleanLinks(normalize(JSON.parse(await openWith(vault, JSON.parse(text)))));
  newer.id = id; // the browser slot decides which You this is
  profile = newer;
  guard.begin(text);
  committedEdit = editCount;
  // A save refused because of the other tab is now settled: clear the "couldn't save" state.
  if (browserSaveState().status === 'failed') void persist();
  if (replacedListeners.length) replacedListeners.forEach(fn => fn());
  else location.reload();
}
/** The other tab's version, as stored now (decrypted with this tab's key), or null if there's none. */
export async function otherTabVersion(): Promise<Profile | null> {
  const text = await vaultStore.get(profile.id!);
  if (!text || !vault) return null;
  return normalize(JSON.parse(await openWith(vault, JSON.parse(text))));
}
/** Overwrites the other tab's version. Callers keep a copy of it first (see target.ts). */
export async function keepThisTab() {
  await guard.adoptStored(profile.id!);
  await persist();
}
channel?.addEventListener('message', async e => {
  if (e.data?.id !== profile.id || !vault) return;
  guard.markStale();
  // Nothing unsaved here: simply show the newer copy. Otherwise the next save asks what to keep.
  if (browserSaveState().status === 'saved' && editCount === committedEdit && !draftOpen()) await useNewer();
  else if (editCount !== committedEdit) conflictListeners.forEach(fn => fn());
});
const queue = saveQueue(async ({ p, v, edit }: { p: Profile; v: Vault; edit: number }) => {
  const envelope = await encode(v, p);
  const result = await guard.write(p.id!, envelope, edit !== committedEdit);
  if (result === 'newer') { await useNewer(); return; }
  if (result === 'conflict') {
    conflictListeners.forEach(fn => fn());
    throw new Error('This You was changed in another tab');
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
