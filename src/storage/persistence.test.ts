import { describe, expect, it } from 'vitest';
import { addCard, setNote } from '../core/cards';
import { emptyProfile, normalize } from '../core/profile';
import { noteSearchText } from '../core/browse';
import { saveQueue } from './saveQueue';
import { migrateVault, type VaultStore } from './vaultStore';

describe('notes', () => {
  it('keeps corrected and cleared wording, but ignores unchanged saves', () => {
    const p = emptyProfile();
    const c = addCard(p, { area: 'home', kind: 'Address', value: 'Home', since: '', note: 'First\nwords' });
    expect(setNote(p, c.id, c.note!)).toBe(false);
    setNote(p, c.id, 'Next words');
    setNote(p, c.id, '');
    expect(c.note).toBeUndefined();
    expect(c.revisions.map(r => [r.field, r.value])).toEqual([['note', 'First\nwords'], ['note', 'Next words']]);
    expect(noteSearchText(c)).toContain('First\nwords');
  });
  it('normalizes string notes and keeps unknown future card fields', () => {
    const p = emptyProfile();
    const c = addCard(p, { area: 'home', kind: 'Address', value: 'Home', since: '', note: '<hello>\nworld' });
    const raw = { ...p, cards: [{ ...c, future: { keep: true } }] };
    expect(normalize(raw).cards[0]).toMatchObject({ note: c.note, future: { keep: true } });
    expect(normalize({ ...p, cards: [{ ...c, note: 123 }] }).cards[0].note).toBeUndefined();
  });
});
describe('save queue', () => {
  it('reports quota failure and can retry the latest copy', async () => {
    let fail = true;
    const writes: number[] = [];
    const q = saveQueue<number>(async n => { if (fail) throw new DOMException('Full', 'QuotaExceededError'); writes.push(n); });
    const pending = q.enqueue(1);
    expect(q.state().status).toBe('saving');
    await pending;
    expect(q.state()).toEqual({ status: 'failed', reason: 'storage full' });
    fail = false;
    await q.enqueue(2);
    expect(q.state().status).toBe('saved');
    expect(writes).toEqual([2]);
  });
  it('coalesces rapid edits and orders writes made during a pending write', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const writes: number[] = [];
    const q = saveQueue<number>(async n => { writes.push(n); if (n === 2) await gate; });
    q.enqueue(1); q.enqueue(2);
    await Promise.resolve();
    q.enqueue(3); q.enqueue(4);
    release(); await q.flush();
    expect(writes).toEqual([2, 4]);
    expect(q.state().status).toBe('saved');
  });
});
describe('vault migration', () => {
  function setup() {
    const data = new Map([['you.vault.a', 'encrypted']]);
    let value: string | null = null;
    const legacy = { get: (k: string) => data.get(k) ?? null, remove: (k: string) => { data.delete(k); } };
    const store: VaultStore = { get: async () => value, set: async (_, v) => { value = v; }, del: async () => {}, clear: async () => {} };
    return { data, legacy, store };
  }
  it('removes the old copy only after reading back the same bytes', async () => {
    const { data, legacy, store } = setup();
    expect(await migrateVault('a', legacy, store)).toBe('encrypted');
    expect(data.size).toBe(0);
    expect(await store.get('a')).toBe('encrypted');
  });
  it('retains the only copy on write or verification failure', async () => {
    for (const failure of ['write', 'verify']) {
      const { data, legacy, store } = setup();
      if (failure === 'write') store.set = async () => { throw new Error('blocked'); };
      else store.get = async () => null;
      await expect(migrateVault('a', legacy, store)).rejects.toThrow();
      expect(data.get('you.vault.a')).toBe('encrypted');
    }
  });
  it('never overwrites an existing IndexedDB record', async () => {
    const { legacy, store } = setup();
    await store.set('a', 'newer');
    expect(await migrateVault('a', legacy, store)).toBe('newer');
  });
});
