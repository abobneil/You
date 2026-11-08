export type SaveState = { status: 'saved' | 'saving' | 'failed'; reason?: 'storage full' | 'blocked' | 'other tab' };
/** One active write and one latest snapshot; failed writes remain retryable. */
export function saveQueue<T>(write: (value: T) => Promise<void>, changed: (s: SaveState) => void = () => {}) {
  let state: SaveState = { status: 'saved' };
  let pending: { value: T } | undefined;
  let running: Promise<void> | undefined;
  const update = (s: SaveState) => { state = s; changed(s); };
  const enqueue = (value: T): Promise<void> => {
    pending = { value };
    update({ status: 'saving' });
    if (!running) running = Promise.resolve().then(async () => {
      while (pending) {
        const next = pending; pending = undefined;
        try { await write(next.value); }
        catch (e) {
          pending ??= next;
          update({ status: 'failed', reason: (e as Error)?.name === 'QuotaExceededError' ? 'storage full' : (e as Error)?.name === 'TabConflict' ? 'other tab' : 'blocked' });
          return;
        }
      }
      update({ status: 'saved' });
    }).finally(() => { running = undefined; });
    return running;
  };
  return { enqueue, state: () => state, flush: () => running ?? Promise.resolve() };
}
