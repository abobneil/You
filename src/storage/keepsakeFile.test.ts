import { describe, expect, it } from 'vitest';
import { addCard, addKeepsake, altField, keepsakeOf, removedKeepsakes, removeKeepsake, replaceKeepsake, restoreKeepsake, setKeepsakeAlt, shownKeepsakes } from '../core/cards';
import { createVault, type Vault } from '../core/crypto';
import { checkSize, MAX_KEEPSAKE_BYTES, sha256Hex, type Keepsake } from '../core/keepsakes';
import { emptyProfile, normalize } from '../core/profile';
import type { Profile } from '../core/types';
import { decode, DamagedFile, encodeBlob, encodeFile, readFile, readText, UnsupportedVersion, type RawKeepsake } from './fileFormat';
import { commitStaged, stageKeepsakes } from './keepsakeImport';
import { deleteYouKeepsakes, loadKeepsake, memoryKeepsakeStore, rowKey, storeKeepsake, type KeepsakeStore } from './keepsakeStore';

const PASS = 'a long passphrase';
const jpeg = (n: number, seed = 1) => {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + seed * 7) & 0xff;
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
};
const pdf = (n: number) => { const b = jpeg(n, 3); b.set(Array.from('%PDF-1.7', c => c.charCodeAt(0))); return b; };
const meta = (id: string, over: Partial<Keepsake> = {}): Keepsake =>
  ({ id, name: `${id}.jpg`, type: 'image/jpeg', size: 10, sha256: 'ab', addedAt: '2026-01-01T00:00:00Z', ...over });

async function collect(it: AsyncIterable<RawKeepsake>) { const out: RawKeepsake[] = []; for await (const x of it) out.push(x); return out; }
async function text(blob: Blob) { return blob.text(); }

/** A You with three keepsakes over two cards, stored (encrypted) in a memory store. */
async function setup(sizes = [5000, 7000, 3000]) {
  const vault = await createVault(PASS, 100_000);
  const store = memoryKeepsakeStore();
  const p: Profile = { ...emptyProfile(), id: 'you-1', name: 'Alex' };
  const home = addCard(p, { area: 'home', kind: 'Address', value: '12 Elm St', since: '2000' });
  const work = addCard(p, { area: 'work', kind: 'Job', value: 'Designer', since: '2010' });
  const originals = [jpeg(sizes[0], 1), pdf(sizes[1]), jpeg(sizes[2], 2)];
  const ks: Keepsake[] = [];
  for (const [i, b] of originals.entries()) {
    const r = await storeKeepsake(store, vault, p.id!, `file${i}`, b);
    if (!r.ok) throw new Error(r.reason);
    ks.push(r.keepsake);
    addKeepsake(p, i === 1 ? work.id : home.id, r.keepsake);
  }
  return { vault, store, p, ks, originals, getSealed: (id: string) => store.get(rowKey(p.id!, id)) };
}

describe('card keepsake helpers', () => {
  const k = (id: string) => meta(id);
  it('adds, describes (keeping earlier wording), removes, restores and replaces with history', () => {
    const p = emptyProfile();
    const c = addCard(p, { area: 'home', kind: 'Address', value: 'Home', since: '' });
    expect(addKeepsake(p, c.id, k('a'))).toBe(true);
    expect(addKeepsake(p, c.id, k('a'))).toBe(false);
    expect(setKeepsakeAlt(p, c.id, 'a', 'Front door', 't1')).toBe(true);
    expect(setKeepsakeAlt(p, c.id, 'a', 'Front door')).toBe(false);
    setKeepsakeAlt(p, c.id, 'a', 'Blue front door', 't2');
    expect(keepsakeOf(c, 'a')!.alt).toBe('Blue front door');
    expect(c.revisions).toEqual([{ field: altField('a'), value: 'Front door', at: 't2' }]);
    expect(altField('a')).toBe('keepsake:a:alt');

    expect(removeKeepsake(p, c.id, 'a', 't3')).toBe(true);
    expect(c.keepsakes).toHaveLength(1); // never deleted
    expect(shownKeepsakes(c)).toEqual([]);
    expect(removedKeepsakes(c).map(x => x.id)).toEqual(['a']);
    expect(restoreKeepsake(p, c.id, 'a')).toBe(true);
    expect(shownKeepsakes(c).map(x => x.id)).toEqual(['a']);

    expect(replaceKeepsake(p, c.id, 'a', k('b'), 't4')).toBe(true);
    expect(keepsakeOf(c, 'a')).toMatchObject({ removedAt: 't4', replacedBy: 'b' });
    expect(shownKeepsakes(c).map(x => x.id)).toEqual(['b']);
    expect(replaceKeepsake(p, c.id, 'a', k('c'))).toBe(false); // already replaced
    restoreKeepsake(p, c.id, 'a');
    expect(keepsakeOf(c, 'a')!.replacedBy).toBeUndefined();
  });
  it('normalize keeps valid keepsakes and drops malformed ones', () => {
    const p = emptyProfile();
    const c = addCard(p, { area: 'home', kind: 'Address', value: 'Home', since: '' });
    c.keepsakes = [k('a'), { id: 'bad' } as Keepsake];
    expect(normalize(p).cards[0].keepsakes).toEqual([k('a')]);
    c.keepsakes = [{ id: 'bad' } as Keepsake];
    expect('keepsakes' in normalize(p).cards[0]).toBe(false);
  });
});

describe('hostile and unsuitable files', () => {
  it('are refused with a plain reason and change nothing', async () => {
    const vault = await createVault(PASS, 100_000);
    const store = memoryKeepsakeStore();
    const enc = (s: string) => new TextEncoder().encode(s);
    const big = new Uint8Array(MAX_KEEPSAKE_BYTES + 1); big.set([0xff, 0xd8, 0xff]);
    const cases: [string, Uint8Array][] = [
      ['evil.svg', enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
      ['page.jpg', enc('<!doctype html><html><script>alert(1)</script></html>')],
      ['empty.jpg', new Uint8Array()],
      ['huge.jpg', big],
    ];
    for (const [name, bytes] of cases) {
      const r = await storeKeepsake(store, vault, 'you', name, bytes);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.reason).toContain(name);
    }
    expect(store.rows.size).toBe(0);
    expect(checkSize('huge.jpg', MAX_KEEPSAKE_BYTES + 1)?.reason).toContain('25 MB');
    expect(checkSize('none.jpg', 0)?.reason).toContain('empty');
  });
  it('a failed write attaches nothing', async () => {
    const vault = await createVault(PASS, 100_000);
    const store: KeepsakeStore = { ...memoryKeepsakeStore(), put: async () => { throw new DOMException('full', 'QuotaExceededError'); } };
    const r = await storeKeepsake(store, vault, 'you', 'a.jpg', jpeg(100));
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('storage is full') });
  });
});

describe('keepsake rows', () => {
  it('decrypt on demand, prove their hash, and go when their You is removed', async () => {
    const { vault, store, p, ks, originals } = await setup();
    for (const [i, k] of ks.entries()) expect(await sha256Hex(await loadKeepsake(store, vault, p.id!, k))).toBe(await sha256Hex(originals[i]));
    await expect(loadKeepsake(store, vault, p.id!, { ...ks[0], sha256: '00' })).rejects.toThrow('couldn');
    await store.put('other-you/x', { iv: new Uint8Array(12), data: new Uint8Array(20) });
    await deleteYouKeepsakes(store, p.id!);
    expect([...store.rows.keys()]).toEqual(['other-you/x']);
  });
});

describe('file format version 3', () => {
  it('writes one keepsake per line, valid as one JSON document', async () => {
    const { vault, p, getSealed } = await setup();
    const t = await text(await encodeBlob(vault, p, getSealed));
    const lines = t.trim().split('\n');
    expect(lines[0]).toBe('{"app":"you","version":3,');
    expect(lines[4]).toBe(' "keepsakes":[');
    expect(lines.slice(5, 8).every(l => l.startsWith('{"id":'))).toBe(true);
    expect(lines[8]).toBe(']}');
    const j = JSON.parse(t);
    expect(j.keepsakes).toHaveLength(3);
  });

  it('round-trips three keepsakes into a fresh browser, byte-identical by SHA-256', async () => {
    const { vault, p, originals, getSealed } = await setup();
    const blob = await encodeBlob(vault, p, getSealed);
    const r = await readFile(blob);
    if (r.kind !== 'locked') throw new Error('expected locked');
    expect(r.env.version).toBe(3);
    const { profile, vault: v2 } = await decode(PASS, r.env);
    const fresh = memoryKeepsakeStore();
    const staged = await stageKeepsakes(fresh, v2, profile, r.keepsakes());
    expect(staged.problems).toEqual([]);
    expect(staged.ids).toHaveLength(3);
    await commitStaged(fresh, staged, 'opened-you', profile);
    expect([...fresh.rows.keys()].every(k => k.startsWith('opened-you/'))).toBe(true);
    const all = profile.cards.flatMap(c => c.keepsakes ?? []);
    expect(all).toHaveLength(3);
    for (const k of all)
      expect(await sha256Hex(await loadKeepsake(fresh, v2, 'opened-you', k))).toBe(await sha256Hex(originals[+k.name.slice(4)]));
  });

  it('keeps writing version 2 when there are no keepsakes, and reads both', async () => {
    const vault = await createVault(PASS, 100_000);
    const p: Profile = { ...emptyProfile(), id: 'x', name: 'Bo' };
    const parts: string[] = [];
    for await (const s of encodeFile(vault, p, async () => null)) parts.push(s);
    expect(parts).toHaveLength(1);
    const r = readText(parts[0]);
    expect(r.kind === 'locked' && r.env.version).toBe(2);
    if (r.kind === 'locked') expect(await collect(r.keepsakes())).toEqual([]);
  });

  it('rejects unknown versions, so nothing is replaced', async () => {
    const { vault, p, getSealed } = await setup();
    const t = (await text(await encodeBlob(vault, p, getSealed))).replace('"version":3', '"version":4');
    expect(() => readText(t)).toThrow(UnsupportedVersion);
    await expect(readFile(new Blob([t]), 100)).rejects.toThrow(UnsupportedVersion);
    expect(() => readText(JSON.stringify({ app: 'you', version: 9, data: 'x' }))).toThrow(/newer version/);
  });

  it('reads a big file line by line with the same result as JSON.parse', async () => {
    const mb = 1024 * 1024;
    const { vault, p, getSealed } = await setup([3 * mb, 2 * mb, 3 * mb]);
    const blob = await encodeBlob(vault, p, getSealed);
    expect(blob.size).toBeGreaterThan(10 * mb);
    const whole = await readFile(blob);
    const streamed = await readFile(blob, 1024); // force the incremental reader
    if (whole.kind !== 'locked' || streamed.kind !== 'locked') throw new Error('expected locked');
    expect(streamed.env).toEqual(whole.env);
    const a = await collect(whole.keepsakes()), b = await collect(streamed.keepsakes());
    expect(b.length).toBe(3);
    expect(b).toEqual(a);
    // A truncated big file is caught rather than half-read.
    const cut = blob.slice(0, blob.size - 4);
    const r = await readFile(cut, 1024);
    if (r.kind !== 'locked') throw new Error('expected locked');
    await expect(collect(r.keepsakes())).rejects.toThrow(DamagedFile);
  });
});

describe('tampered keepsakes', () => {
  async function opened() {
    const s = await setup();
    const t = await text(await encodeBlob(s.vault, s.p, s.getSealed));
    return { ...s, json: JSON.parse(t) as { keepsakes: RawKeepsake[] } & Record<string, unknown> };
  }
  const stage = (vault: Vault, p: Profile, list: RawKeepsake[], store = memoryKeepsakeStore()) =>
    ({ store, run: stageKeepsakes(store, vault, p, (async function* () { yield* list; })()) });
  const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

  it('rejects a bad IV length or an id no card mentions, leaving nothing behind', async () => {
    const { vault, p, json } = await opened();
    const shortIv = json.keepsakes.map((k, i) => (i === 1 ? { ...k, iv: b64(new Uint8Array(8)) } : k));
    const a = stage(vault, p, shortIv);
    await expect(a.run).rejects.toThrow(DamagedFile);
    expect(a.store.rows.size).toBe(0);
    const strangeId = json.keepsakes.map((k, i) => (i === 2 ? { ...k, id: crypto.randomUUID() } : k));
    const b = stage(vault, p, strangeId);
    await expect(b.run).rejects.toThrow(/no card mentions/);
    expect(b.store.rows.size).toBe(0);
    const twice = [...json.keepsakes, json.keepsakes[0]];
    await expect(stage(vault, p, twice).run).rejects.toThrow(/twice/);
  });

  it('reports altered bytes, IVs, swapped ids, changed hashes and missing files instead of dropping them', async () => {
    const { vault, p, json } = await opened();
    const [k0, k1, k2] = json.keepsakes;
    const flip = (s: string) => (s[5] === 'A' ? s.slice(0, 5) + 'B' + s.slice(6) : s.slice(0, 5) + 'A' + s.slice(6));
    const run = async (list: RawKeepsake[], prof = p) => (await stage(vault, prof, list).run).problems.map(x => [x.id, x.problem]);

    expect(await run([{ ...k0, data: flip(k0.data) }, k1, k2])).toEqual([[k0.id, 'damaged']]);
    expect(await run([{ ...k0, iv: b64(new Uint8Array(12)) }, k1, k2])).toEqual([[k0.id, 'damaged']]);
    // Moving one keepsake's bytes onto another entry fails: the id is bound into the encryption.
    expect(await run([{ ...k0, id: k1.id }, { ...k1, id: k0.id }, k2])).toEqual([[k1.id, 'damaged'], [k0.id, 'damaged']]);
    expect(await run([k0, k2])).toEqual([[k1.id, 'missing']]);
    const altered = structuredClone(p);
    altered.cards.flatMap(c => c.keepsakes ?? []).find(k => k.id === k2.id)!.sha256 = '0'.repeat(64);
    expect(await run([k0, k1, k2], altered)).toEqual([[k2.id, 'changed']]);
  });
});


it('aborts keepsake staging and removes only temporary rows', async () => {
  const { vault, store, p, getSealed } = await setup();
  const input = readText(await (await encodeBlob(vault, p, getSealed)).text());
  if (input.kind !== 'locked') throw new Error('expected envelope');
  const before = [...store.rows.keys()];
  const controller = new AbortController();
  await expect(stageKeepsakes(store, vault, p, input.keepsakes(), {
    signal: controller.signal,
    onProgress: checked => { if (checked === 1) controller.abort(); },
  })).rejects.toMatchObject({ name: 'AbortError' });
  expect([...store.rows.keys()]).toEqual(before);
});

it('stops file parsing when cancelled before reading', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(readFile(new Blob(['{}']), 0, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});

describe('combining a copy saved with a different passphrase', () => {
  it('re-encrypts staged keepsakes with the open You’s key so they stay readable', async () => {
    const s = await setup();
    const file = JSON.parse(await text(await encodeBlob(s.vault, s.p, s.getSealed))) as { keepsakes: RawKeepsake[] };
    const openYou = await createVault('a different long passphrase', 100_000);
    const store = memoryKeepsakeStore();
    const staged = await stageKeepsakes(store, s.vault, s.p, (async function* () { yield* file.keepsakes; })(), { rekeyTo: openYou });
    expect(staged.problems).toEqual([]);
    await commitStaged(store, staged, 'you-open', s.p);
    for (const [i, k] of s.ks.entries()) {
      const bytes = await loadKeepsake(store, openYou, 'you-open', k);
      expect(await sha256Hex(bytes)).toBe(await sha256Hex(s.originals[i]));
    }
  });
});

it('cancels copy creation between keepsakes without changing the stored originals', async () => {
  const s = await setup();
  const controller = new AbortController();
  const keys = await s.store.keys('');
  let requested = 0;
  await expect(encodeBlob(s.vault, s.p, async id => {
    requested++;
    controller.abort();
    return s.getSealed(id);
  }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(requested).toBe(1);
  expect(await s.store.keys('')).toEqual(keys);
  for (const [i, k] of s.ks.entries()) {
    expect(await loadKeepsake(s.store, s.vault, s.p.id!, k)).toEqual(s.originals[i]);
  }
});
