// A tiny key-value store in IndexedDB. Used for things localStorage can't hold, like file handles.
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('you', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const t = db.transaction('kv', mode);
      const req = fn(t.objectStore('kv'));
      t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      t.onerror = () => reject(t.error);
    });
  } catch {
    return undefined;
  }
}

export const idb = {
  get: <T>(key: string) => run<T>('readonly', s => s.get(key)),
  set: (key: string, value: unknown) => run('readwrite', s => s.put(value, key)),
  del: (key: string) => run('readwrite', s => s.delete(key)),
  clear: () => run('readwrite', s => s.clear()),
};
