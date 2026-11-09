// Two tabs of the same You: conflict choices never appear on a locked tab, and "Keep this tab's
// version" never overwrites a save the other tab made after its copy was downloaded.
import { beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ stored: new Map<string, string>(), archived: [] as { id: string; envelope: string }[] }));
vi.mock('./storage/vaultStore', () => ({
  vaultStore: { get: async (id: string) => h.stored.get(id) ?? null, set: async (id: string, v: string) => { h.stored.set(id, v); }, del: async () => {}, clear: async () => {} },
  migrateVault: async () => null,
}));
vi.mock('./storage/fileFormat', () => ({ encode: async (_v: unknown, p: unknown) => JSON.stringify(p) }));
vi.mock('./core/crypto', () => ({ openWith: async (_v: unknown, env: unknown) => JSON.stringify(env) }));
vi.mock('./storage/profiles', () => ({ currentId: () => 'you', removeProfile: async () => {}, setCurrent: () => {}, upsertProfile: () => {} }));
// Earlier versions: record what gets kept, so the test can check the other tab's version is never just overwritten.
vi.mock('./storage/archive', () => ({
  archiveVersion: async (id: string, envelope: string) => { h.archived.push({ id, envelope }); return 'archive/' + id + '/k'; },
  deleteArchived: async () => {}, getArchived: async () => null,
}));

import * as state from './state';
import { emptyProfile } from './core/profile';

state.onReplaced(() => {});
const otherTabSaves = (name: string) => h.stored.set('you', JSON.stringify({ ...emptyProfile(), id: 'you', name }));

beforeEach(async () => {
  h.stored.clear();
  otherTabSaves('start');
  await state.setSession({ ...emptyProfile(), id: 'you', name: 'start' }, {} as never, h.stored.get('you')!);
  await state.flushPending();
});

it('a save refused because of another tab is reported as that, not as storage trouble (item 10)', async () => {
  const seen: number[] = [];
  state.onTabConflict(() => seen.push(1));
  otherTabSaves('other tab');
  state.profile.name = 'this tab'; state.save();
  await state.flushPending();
  expect(state.browserSaveState()).toEqual({ status: 'failed', reason: 'other tab' });
  expect(seen.length).toBeGreaterThan(0);
});

it('keep this tab’s version only overwrites the exact copy that was downloaded (CAP3 path 5)', async () => {
  otherTabSaves('B1');
  state.profile.name = 'A'; state.save();
  await state.flushPending();
  const downloaded = (await state.otherTabVersion())!;
  expect(downloaded.profile.name).toBe('B1');
  otherTabSaves('B2'); // the other tab saves again while the download is being made
  expect(await state.keepThisTab(downloaded.envelope)).toBe(false);
  await state.flushPending();
  expect(JSON.parse(h.stored.get('you')!).name).toBe('B2'); // nothing overwritten
  const again = (await state.otherTabVersion())!;
  expect(await state.keepThisTab(again.envelope)).toBe(true);
  await state.flushPending();
  expect(JSON.parse(h.stored.get('you')!).name).toBe('A');
  // The other tab's version that was written over is kept as an earlier version, not just lost.
  expect(h.archived.some(a => a.id === 'you' && a.envelope === again.envelope)).toBe(true);
});

it('never offers conflict choices while locked; asks after unlock (item 6)', async () => {
  let asked = 0;
  state.onTabConflict(() => { asked++; });
  state.setLockedInPlace(true);
  state.profile.name = 'mine'; state.save();
  otherTabSaves('theirs');
  state.save();
  await state.flushPending();
  expect(asked).toBe(0);
  await state.settleAfterUnlock();
  expect(asked).toBe(1);
  expect(state.isLockedInPlace()).toBe(false);
});

it('after unlock, newer work from another tab simply loads when this tab has nothing unsaved', async () => {
  let asked = 0;
  state.onTabConflict(() => { asked++; });
  state.setLockedInPlace(true);
  otherTabSaves('newer');
  await state.settleAfterUnlock();
  expect(asked).toBe(0);
  expect(state.profile.name).toBe('newer');
});
