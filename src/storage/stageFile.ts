import type { Vault } from '../core/crypto';
import type { Profile } from '../core/types';
import type { Staged, StagingOptions } from './keepsakeImport';
import { discardStaged } from './keepsakeImport';
import { idbKeepsakeStore } from './keepsakeStore';

/** File decoding, verification and staging run off the UI thread. */
export function stageFile(file: Blob, vault: Vault, profile: Profile, options: StagingOptions): Promise<Staged> {
  return new Promise((resolve, reject) => {
    const prefix = `import-${crypto.randomUUID()}`;
    const worker = new Worker(new URL('./keepsake.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = () => { worker.terminate(); options.signal?.removeEventListener('abort', abort); };
    const fail = (error: Error) => { if (settled) return; settled = true; finish(); void discardStaged(idbKeepsakeStore, { prefix }).then(() => reject(error), () => reject(error)); };
    const abort = () => fail(new DOMException('Cancelled', 'AbortError'));
    if (options.signal?.aborted) { abort(); return; }
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = e => fail(new Error(e.message));
    worker.onmessage = ({ data }) => {
      if (data.error) fail(new Error(data.error));
      else if (data.staged) { if (settled) return; settled = true; finish(); resolve(data.staged); }
      else options.onProgress?.(data.checked, data.total);
    };
    worker.postMessage({ file, vault, profile, prefix });
  });
}

/** Promotion also copies hundreds of megabytes; keep its cursor callbacks off the UI thread. */
export function commitFile(staged: Staged, profile: Profile, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./keepsake.worker.ts', import.meta.url), { type: 'module' });
    const abort = () => worker.postMessage({ abort: true });
    const finish = () => { worker.terminate(); signal.removeEventListener('abort', abort); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = e => { finish(); reject(new Error(e.message)); };
    worker.onmessage = ({ data }) => {
      finish();
      if (data.committed) resolve();
      else reject(signal.reason || new Error(data.error));
    };
    worker.postMessage({ commit: staged, profile });
  });
}
