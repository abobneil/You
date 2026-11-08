import { expect, it } from 'vitest';
import { createVault, toB64 } from '../core/crypto';
import { sealBytes, sha256Hex, type Keepsake, type SealedBytes } from '../core/keepsakes';
import { emptyProfile } from '../core/profile';
import { stageKeepsakes } from './keepsakeImport';
import { memoryKeepsakeStore } from './keepsakeStore';

it('batches only verified ciphertext and cleans up an interrupted batch', async () => {
  const vault = await createVault('synthetic test only', 100_000);
  const bytes = new Uint8Array([1, 2, 3]);
  const k: Keepsake = { id: 'photo', name: 'photo', type: 'image/jpeg', size: 3, sha256: await sha256Hex(bytes), addedAt: '' };
  const p = emptyProfile();
  p.cards.push({ id: 'card', area: 'home', kind: 'Address', value: 'Home', since: '', status: 'active', recordedAt: '', revisions: [], keepsakes: [k] });
  const s = await sealBytes(vault, k.id, bytes);
  const entries = async function* () { yield { id: k.id, iv: toB64(s.iv), data: toB64(s.data) }; };
  const store = memoryKeepsakeStore();
  const batches: Array<Array<[string, SealedBytes]>> = [];
  const batched = { ...store, putMany: async (rows: Array<[string, SealedBytes]>) => {
    batches.push(rows);
    for (const [key, value] of rows) await store.put(key, value);
  } };
  const staged = await stageKeepsakes(batched, vault, p, entries());
  expect(staged.problems).toEqual([]);
  expect(batches).toHaveLength(1);
  expect(batches[0][0][1]).toEqual(s);
  const controller = new AbortController();
  const interrupted = { ...batched, putMany: async (rows: Array<[string, SealedBytes]>) => {
    await batched.putMany(rows); controller.abort();
  } };
  await expect(stageKeepsakes(interrupted, vault, p, entries(), { signal: controller.signal, prefix: 'interrupted' })).rejects.toMatchObject({ name: 'AbortError' });
  expect(await store.keys('interrupted/')).toEqual([]);
  expect(await store.keys(staged.prefix + '/')).toHaveLength(1);
});
