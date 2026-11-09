// The open You's keepsakes, for screens and exports. Bytes are decrypted on demand and never cached.
import type { Keepsake, SealedBytes } from '../core/keepsakes';
import { profile, vault } from '../state';
import { idbKeepsakeStore, loadKeepsake, rowKey, sealedRow, storeKeepsake, type KeepsakeStore, type StoreResult } from './keepsakeStore';

export let keepsakeStore: KeepsakeStore = idbKeepsakeStore;
/** For tests. */
export const useKeepsakeStore = (s: KeepsakeStore) => { keepsakeStore = s; };

/** The original bytes of one keepsake, checked against its SHA-256. For viewing and readable exports. */
export function readKeepsake(youId: string, keepsake: Keepsake): Promise<Uint8Array> {
  if (!vault) return Promise.reject(new Error('Locked'));
  return loadKeepsake(keepsakeStore, vault, youId, keepsake);
}

/** Encrypts and stores a chosen file for the open You. */
export function keepFile(name: string, bytes: Uint8Array): Promise<StoreResult> {
  if (!vault || !profile.id) return Promise.resolve({ ok: false, reason: 'Unlock first, then try again.' });
  return storeKeepsake(keepsakeStore, vault, profile.id, name, bytes);
}

/** Deletes rows only a draft referred to (a card that was never added). */
export async function dropRows(youId: string, ids: string[]) {
  for (const id of ids) {
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
