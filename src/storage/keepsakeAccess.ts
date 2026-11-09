// The open You's keepsakes, for screens and exports. Bytes are decrypted on demand and never cached.
import type { Keepsake, SealedBytes } from '../core/keepsakes';
import { browserSaveState, onBrowserSave, profile, vault } from '../state';
import { idbKeepsakeStore, loadKeepsake, rowKey, sealedRow, storeKeepsake, type KeepsakeStore, type StoreResult } from './keepsakeStore';

export let keepsakeStore: KeepsakeStore = idbKeepsakeStore;
/** For tests. */
export const useKeepsakeStore = (s: KeepsakeStore) => { keepsakeStore = s; };

/** The original bytes of one keepsake, checked against its SHA-256. For viewing and readable exports. */
export function readKeepsake(youId: string, keepsake: Keepsake): Promise<Uint8Array> {
  if (!vault) return Promise.reject(new Error('Locked'));
  return loadKeepsake(keepsakeStore, vault, youId, keepsake);
}

/**
 * Photos stored by THIS tab that no saved record has mentioned yet. Only these may be deleted when a draft
 * is dropped: once any saved record (a card, a kept draft, an earlier version, another tab's copy) has
 * mentioned a photo, something may depend on it, so it is kept.
 */
const unsaved = new Set<string>();
const mentioned = (id: string) => JSON.stringify(profile).includes(`"${id}"`);
onBrowserSave(() => { if (browserSaveState().status === 'saved') for (const id of [...unsaved]) if (mentioned(id)) unsaved.delete(id); });

/** Encrypts and stores a chosen file for the open You. */
export async function keepFile(name: string, bytes: Uint8Array): Promise<StoreResult> {
  if (!vault || !profile.id) return { ok: false, reason: 'Unlock first, then try again.' };
  const r = await storeKeepsake(keepsakeStore, vault, profile.id, name, bytes);
  if (r.ok) unsaved.add(r.keepsake.id);
  return r;
}

/** Deletes rows only an unsaved draft in this tab referred to (a card that was never added). */
export async function dropRows(youId: string, ids: string[]) {
  for (const id of ids) {
    if (!unsaved.has(id) || mentioned(id)) continue; // something saved may still need it: keep it
    unsaved.delete(id);
    try {
      await keepsakeStore.del(rowKey(youId, id));
      for (const k of await keepsakeStore.keys(rowKey(youId, id) + '~')) await keepsakeStore.del(k);
    } catch { /* left for later */ }
  }
}

/** The open You's sealed rows, for writing the file: for each photo, the copy the open You's key opens. */
export const sealedFor = (youId: string) => {
  let aside: Promise<string[]> | null = null;
  return async (id: string): Promise<SealedBytes | null> => {
    aside ??= keepsakeStore.keys(youId + '/').then(keys => keys.filter(k => k.includes('~')));
    return sealedRow(keepsakeStore, vault, youId, id, await aside);
  };
};
