// CAP3: a tab must never overwrite newer work another tab saved.
import { describe, expect, it } from 'vitest';
import { staleGuard } from './staleGuard';

function memory(initial: string | null) {
  let value = initial;
  return { get: async () => value, set: async (_: string, v: string) => { value = v; }, now: () => value, put: (v: string) => { value = v; } };
}

describe('stale-write guard', () => {
  it('a tab that unlocks the copy stored at unlock time writes normally', async () => {
    const store = memory('v1');
    const tab = staleGuard(store);
    store.put('v2'); // another tab saved while this one sat on the unlock screen
    tab.begin(await store.get()); // unlock re-reads storage right before decrypting
    expect(await tab.write('a', 'v2-resaved', false)).toBe('written');
    expect(store.now()).toBe('v2-resaved');
  });

  it('a tab holding an older copy never overwrites newer work it has no edits for', async () => {
    const store = memory('v1');
    const tab = staleGuard(store);
    tab.begin('v1'); // decrypted v1 (e.g. read at page load)
    store.put('v2'); // newer work from another tab
    expect(await tab.write('a', 'v1-resaved', false)).toBe('newer');
    expect(store.now()).toBe('v2');
  });

  it('with edits on both sides it stops and asks, writing nothing', async () => {
    const store = memory('v1');
    const tab = staleGuard(store);
    tab.begin('v1');
    store.put('v2');
    expect(await tab.write('a', 'v1+edit', true)).toBe('conflict');
    expect(store.now()).toBe('v2');
    // Still refused on retry until the person chooses.
    expect(await tab.write('a', 'v1+edit', true)).toBe('conflict');
    await tab.adoptStored('a'); // "Keep this tab's version" (after the other is downloaded)
    expect(await tab.write('a', 'v1+edit', true)).toBe('written');
    expect(store.now()).toBe('v1+edit');
  });

  it('runs the check and the write under one lock', async () => {
    const store = memory(null);
    const names: string[] = [];
    const tab = staleGuard(store, async (name, fn) => { names.push(name); return fn(); });
    tab.begin(null);
    expect(await tab.write('you-1', 'first', true)).toBe('written');
    expect(names).toEqual(['you-you-1']);
  });

  it('a stale signal with storage unchanged does not block saving', async () => {
    const store = memory('v1');
    const tab = staleGuard(store);
    tab.begin('v1');
    tab.markStale();
    expect(await tab.write('a', 'v1+edit', true)).toBe('written');
  });
});
