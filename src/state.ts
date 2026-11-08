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

export let profile: Profile = emptyProfile();
export let vault: Vault | null = null;

const listeners: (() => void)[] = [];
/** Runs after each edit so the screen and chosen file follow immediately. */
export const onSave = (fn: () => void) => { listeners.push(fn); };

const saveListeners: (() => void)[] = [];
export const onBrowserSave = (fn: () => void) => { saveListeners.push(fn); };
let baseline: string | null | undefined;
let stale = false;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('you') : null;
const conflictListeners: (() => void)[] = [];
export const onTabConflict = (fn: () => void) => { conflictListeners.push(fn); };
export async function useNewer() {
  const text = await vaultStore.get(profile.id!);
  if (!text || !vault) return;
  profile = cleanLinks(normalize(JSON.parse(await openWith(vault, JSON.parse(text)))));
  baseline = text; stale = false;
  location.reload();
}
export async function keepThisTab() {
  baseline = await vaultStore.get(profile.id!); stale = false;
  await persist();
}
channel?.addEventListener('message', async e => {
  if (e.data?.id !== profile.id || !vault) return;
  if (browserSaveState().status === 'saved') await useNewer();
  else { stale = true; conflictListeners.forEach(fn => fn()); }
});
const queue = saveQueue(async ({ p, v }: { p: Profile; v: Vault }) => {
  const envelope = await encode(v, p);
  const commit = async () => {
    const current = await vaultStore.get(p.id!);
    if (stale || (baseline !== undefined && current !== baseline)) {
      stale = true; conflictListeners.forEach(fn => fn());
      throw new Error('This You was changed in another tab');
    }
    await vaultStore.set(p.id!, envelope);
    baseline = envelope;
  };
  if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request('you-' + p.id, commit);
  else await commit();
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
  return queue.enqueue({ p: structuredClone(profile), v: vault });
}

export function save() {
  profile.rev = (profile.rev || 0) + 1;
  profile.updatedAt = new Date().toISOString();
  persist();
  listeners.forEach(fn => fn());
}

/** Starts a session: the data and the key that protects it. */
export async function setSession(p: Profile, v: Vault | null) {
  await flushPending();
  baseline = await vaultStore.get(p.id || currentId());
  stale = false;
  profile = p;
  profile.id = profile.id || currentId() || newId();
  profile.updatedAt = profile.updatedAt || new Date().toISOString();
  vault = v;
  return persist();
}

/** The open You's encrypted browser copy, if there is one. */
export const storedEnvelope = async () => { const id = currentId(); if (!id) return null;
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
