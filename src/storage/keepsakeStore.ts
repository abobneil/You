// Encrypted keepsake bytes in this browser: IndexedDB store `keepsakes`, one row per file,
// keyed "<youId>/<keepsakeId>" and holding { iv, data } as raw bytes (never base64, never plaintext).
// Bytes are written before the record that mentions them, and decrypted only when someone looks.
import type { Vault } from '../core/crypto';
import { checkFile, MAX_KEEPSAKE_BYTES, openBytes, sealBytes, sha256Hex, type Keepsake, type SealedBytes } from '../core/keepsakes';
import { openYouData, runIn } from './vaultStore';

export interface KeepsakeStore {
  putMany?(rows: Array<[string, SealedBytes]>): Promise<void>;
  /** Atomic promotion: missing staged rows abort without changing the destination. */
  promote?(from: string, to: string, ids: string[], keep: Set<string>, signal?: AbortSignal): Promise<void>;
  get(key: string): Promise<SealedBytes | null>;
  /** Resolves only once the write has committed. */
  put(key: string, value: SealedBytes): Promise<void>;
  del(key: string): Promise<void>;
  /** Keys starting with `prefix`. */
  keys(prefix: string): Promise<string[]>;
}

export const rowKey = (youId: string, keepsakeId: string) => `${youId}/${keepsakeId}`;
const range = (prefix: string) => IDBKeyRange.bound(prefix, prefix + '￿');
const asBytes = (x: unknown) => (x instanceof Uint8Array ? x : new Uint8Array(x as ArrayBuffer));
// IndexedDB can clone an immutable Blob by reference when promoting staged rows. Typed arrays
// require another full byte copy for every cursor read and put. Existing byte-array rows still read.
const stored = (value: SealedBytes) => ({ iv: value.iv, data: new Blob([value.data as BlobPart]) });

export const idbKeepsakeStore: KeepsakeStore = {
  putMany: rows => transaction(s => { for (const [key, value] of rows) s.put(stored(value), key); }),
  promote: (from, to, ids, keep, signal) => transaction((s, tx) => {
    const expected = new Set(ids);
    const request = s.openCursor(range(from + '/'));
    request.onsuccess = () => {
      const c = request.result;
      if (!c) { if (expected.size) tx.abort(); return; }
      const id = String(c.key).slice(from.length + 1);
      if (!expected.delete(id)) { tx.abort(); return; }
      s.put(c.value, rowKey(to, id));
      c.delete();
      c.continue();
    };
    const obsolete = s.openKeyCursor(range(to + '/'));
    obsolete.onsuccess = () => {
      const c = obsolete.result;
      if (!c) return;
      if (!keep.has(String(c.key).slice(to.length + 1))) s.delete(c.key);
      c.continue();
    };
  }, signal),
  get: async key => {
    const v = await runIn<{ iv: unknown; data: unknown } | undefined>('keepsakes', 'readonly', s => s.get(key));
    return v ? { iv: asBytes(v.iv), data: v.data instanceof Blob ? new Uint8Array(await v.data.arrayBuffer()) : asBytes(v.data) } : null;
  },
  put: async (key, value) => { await runIn('keepsakes', 'readwrite', s => s.put(stored(value), key)); },
  del: async key => { await runIn('keepsakes', 'readwrite', s => s.delete(key)); },
  keys: async prefix => (await runIn('keepsakes', 'readonly', s => s.getAllKeys(range(prefix)))).map(String),
};

async function transaction(action: (s: IDBObjectStore, tx: IDBTransaction) => void, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const db = await openYouData();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('keepsakes', 'readwrite');
      const abort = () => tx.abort();
      const finish = () => signal?.removeEventListener('abort', abort);
      tx.oncomplete = () => { finish(); resolve(); };
      tx.onabort = tx.onerror = () => { finish(); reject(signal?.reason || tx.error || new Error('Keepsake transaction aborted')); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { tx.abort(); return; }
      try { action(tx.objectStore('keepsakes'), tx); }
      catch (e) { tx.abort(); reject(e); }
    });
  } finally { db.close(); }
}

/** An in-memory store, for tests. */
export function memoryKeepsakeStore(): KeepsakeStore & { rows: Map<string, SealedBytes> } {
  const rows = new Map<string, SealedBytes>();
  return {
    rows,
    get: async k => rows.get(k) ?? null,
    put: async (k, v) => { rows.set(k, { iv: v.iv.slice(), data: v.data.slice() }); },
    del: async k => { rows.delete(k); },
    keys: async prefix => [...rows.keys()].filter(k => k.startsWith(prefix)),
  };
}

export type StoreResult = { ok: true; keepsake: Keepsake } | { ok: false; reason: string };

/**
 * Checks a chosen file, encrypts it and writes it durably. Only then is a Keepsake returned for the
 * record to mention. On refusal or a failed write nothing is attached.
 */
export async function storeKeepsake(store: KeepsakeStore, vault: Vault, youId: string, name: string, bytes: Uint8Array,
  now = new Date().toISOString()): Promise<StoreResult> {
  const check = checkFile(name, bytes);
  if (!check.ok) return check;
  const id = crypto.randomUUID();
  const sealed = await sealBytes(vault, id, bytes);
  try {
    await store.put(rowKey(youId, id), sealed);
    const back = await store.get(rowKey(youId, id));
    if (!back || back.data.length !== sealed.data.length) throw new Error('not written');
  } catch (e) {
    const full = (e as Error)?.name === 'QuotaExceededError';
    return { ok: false, reason: `“${name}” couldn't be kept in this browser${full ? ' because its storage is full' : ''}. Nothing was attached.` };
  }
  return { ok: true, keepsake: { id, name, type: check.type, size: bytes.length, sha256: await sha256Hex(bytes), addedAt: now } };
}

export class KeepsakeUnreadable extends Error {
  constructor(name: string) { super(`“${name}” couldn't be read. It may be missing or damaged.`); this.name = 'KeepsakeUnreadable'; }
}

/** Decrypts one keepsake and proves it is the original file. Nothing is kept afterwards. */
export async function loadKeepsake(store: KeepsakeStore, vault: Vault, youId: string, k: Keepsake): Promise<Uint8Array> {
  const sealed = await store.get(rowKey(youId, k.id));
  if (!sealed) throw new KeepsakeUnreadable(k.name);
  let bytes: Uint8Array;
  try { bytes = await openBytes(vault, k.id, sealed); } catch { throw new KeepsakeUnreadable(k.name); }
  if (bytes.length !== k.size || (await sha256Hex(bytes)) !== k.sha256) throw new KeepsakeUnreadable(k.name);
  return bytes;
}

/** Removes all of one You's keepsake rows (when that You is removed from this browser). */
export async function deleteYouKeepsakes(store: KeepsakeStore, youId: string) {
  for (const k of await store.keys(youId + '/')) await store.del(k);
}

/** Largest base64 text a keepsake entry may hold: the size limit plus the 16-byte tag. */
export const MAX_SEALED_B64 = Math.ceil((MAX_KEEPSAKE_BYTES + 16) / 3) * 4;
