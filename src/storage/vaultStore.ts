// Resolve writes only after the transaction commits, including quota failures.
export interface VaultStore {
  get(id: string): Promise<string | null>;
  set(id: string, value: string): Promise<void>;
  del(id: string): Promise<void>;
  clear(): Promise<void>;
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('you-data', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('records');
      r.result.createObjectStore('keepsakes');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Storage blocked'));
  });
}
async function run<T>(mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', mode);
    const r = action(tx.objectStore('records'));
    tx.oncomplete = () => { db.close(); resolve(r.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || r.error || new Error('Storage blocked')); };
  });
}
export const vaultStore: VaultStore = {
  get: async id => (await run('readonly', s => s.get(id))) ?? null,
  set: async (id, value) => { await run('readwrite', s => s.put(value, id)); },
  del: async id => { await run('readwrite', s => s.delete(id)); },
  clear: async () => { await run('readwrite', s => s.clear()); },
};
/** Keep the old copy until the new copy has been read back intact. */
export async function migrateVault(id: string, legacy: { get(k: string): string | null; remove(k: string): void }, store = vaultStore) {
  const key = `you.vault.${id}`;
  const old = legacy.get(key);
  const current = await store.get(id);
  if (current !== null) return current;
  if (old === null) return null;
  await store.set(id, old);
  if (await store.get(id) !== old) throw new Error('Could not verify browser copy');
  legacy.remove(key);
  if (legacy.get('you.vault') === old) legacy.remove('you.vault');
  return old;
}
