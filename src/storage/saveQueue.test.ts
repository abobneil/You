import { it, expect } from 'vitest';
import { saveQueue } from './saveQueue';
import type { VaultStore } from './vaultStore';
it('retains the last good browser copy when storage is full and retries the latest snapshot', async () => {
  let value = 'good', denied = true;
  const store: VaultStore = { get: async () => value, set: async (_, v) => { if (denied) throw new DOMException('full', 'QuotaExceededError'); value = v; }, del: async () => {}, clear: async () => {} };
  const q = saveQueue(async (v: string) => store.set('you', v));
  await q.enqueue('latest'); await q.flush();
  expect(q.state()).toEqual({ status: 'failed', reason: 'storage full' });
  expect(await store.get('you')).toBe('good');
  denied = false; await q.enqueue('latest'); expect(value).toBe('latest'); expect(q.state().status).toBe('saved');
});
