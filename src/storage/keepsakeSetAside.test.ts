// An opened file that brings the same photo encrypted with another passphrase never overwrites the copy an
// earlier version needs: that copy is set aside, and each key still finds the copy it opens.
import { expect, it } from 'vitest';
import { createVault } from '../core/crypto';
import { openBytes, sealBytes } from '../core/keepsakes';
import { commitStaged } from './keepsakeImport';
import { memoryKeepsakeStore, rowKey, sealedRow } from './keepsakeStore';
import { emptyProfile } from '../core/profile';

it('keeps a differently encrypted photo copy and reads the one each key opens', async () => {
  const store = memoryKeepsakeStore();
  const before = await createVault('old passphrase words', 1000), after = await createVault('new passphrase words', 1000);
  const bytes = new TextEncoder().encode('photo bytes');
  await store.put(rowKey('you', 'k1'), await sealBytes(before, 'k1', bytes));
  await store.put(rowKey('import-1', 'k1'), await sealBytes(after, 'k1', bytes));
  await commitStaged(store, { prefix: 'import-1', ids: ['k1'], problems: [] }, 'you', emptyProfile());
  for (const v of [before, after]) {
    const s = (await sealedRow(store, v, 'you', 'k1'))!;
    expect(new TextDecoder().decode(await openBytes(v, 'k1', s))).toBe('photo bytes');
  }
  expect((await store.keys('you/k1~')).length).toBe(1);
});
