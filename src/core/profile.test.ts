import { describe, expect, it } from 'vitest';
import { decode, encode, fileNameFor, readText } from '../storage/fileFormat';
import { createVault } from './crypto';
import { addCard, addLink } from './cards';
import { emptyProfile, normalize } from './profile';

describe('profile', () => {
  it('normalizes junk into an empty profile', () => {
    expect(normalize(null)).toEqual({ name: '', cards: [], links: [], updatedAt: undefined });
    expect(normalize({ name: 'Alex', cards: [{ nope: 1 }] }).cards).toEqual([]);
  });

  it('upgrades the first prototype format (fields per area) into cards', () => {
    const p = normalize({
      name: 'Alex',
      updatedAt: '2026-11-01T00:00:00.000Z',
      areas: { health: [{ label: 'Doctor', value: 'Dr. Lee' }, { label: 'Dentist', value: '' }], nowhere: [{ label: 'x', value: 'y' }] },
    });
    expect(p.cards).toHaveLength(1);
    expect(p.cards[0]).toMatchObject({ area: 'health', kind: 'Doctor', value: 'Dr. Lee', status: 'active' });
  });
});

describe('file format', () => {
  it('round-trips through an encrypted file', async () => {
    const p = emptyProfile();
    p.name = 'Alex';
    const a = addCard(p, { area: 'health', kind: 'Doctor', value: 'Dr. Lee', since: '2021' });
    const b = addCard(p, { area: 'work', kind: 'Job', value: 'Acme', since: '2022' });
    addLink(p, a.id, b.id, 'through', 'provides');
    const text = await encode(await createVault('a long passphrase', 100_000), p);
    expect(text).not.toContain('Dr. Lee');
    const r = readText(text);
    expect(r.kind).toBe('locked');
    if (r.kind !== 'locked') return;
    const back = await decode('a long passphrase', r.env);
    expect(back.profile.name).toBe('Alex');
    expect(back.profile.cards).toEqual(p.cards);
    expect(back.profile.links).toEqual(p.links);
  });

  it('still reads unencrypted version 1 files and bare profiles', () => {
    const v1 = readText(JSON.stringify({ app: 'you', version: 1, profile: { name: 'Alex', cards: [], links: [] } }));
    expect(v1.kind === 'plain' && v1.profile.name).toBe('Alex');
    const bare = readText(JSON.stringify({ name: 'Bo', cards: [], links: [] }));
    expect(bare.kind === 'plain' && bare.profile.name).toBe('Bo');
  });

  it('rejects other JSON', () => {
    expect(() => readText('{"hello":"world"}')).toThrow();
    expect(() => readText('not json')).toThrow();
  });

  it('names files after the person', () => {
    expect(fileNameFor('Alex Kim')).toBe('alex-kim.you.json');
    expect(fileNameFor('  ')).toBe('you.you.json');
  });
});

describe('nothing is dropped on load-then-save (S4d)', () => {
  const src = {
    id: 'you-norm-1', name: 'Norm Test',
    kinds: [{ area: 'home', name: 'Boat slip', fields: [{ id: 'slip', label: 'Slip' }] }, { area: 'nowhere', name: 'Bad kind', fields: [] }, { area: 'home', name: 'No fields kind' }],
    cards: [
      { id: 'c1', area: 'home', kind: 'Address', value: 'Good card', since: '2000', status: 'active', recordedAt: '2026-01-01T00:00:00Z', revisions: [] },
      { id: 'c3', area: 'home', kind: 'Pet', value: 'Card with numeric note', since: '', status: 'active', recordedAt: '2026-01-01T00:00:00Z', revisions: [], note: 12345 },
      { id: 'c4', area: 'home', kind: 'Pet', value: 'Odd keepsake meta', since: '', status: 'active', recordedAt: '2026-01-01T00:00:00Z', revisions: [], keepsakes: [{ id: 'k1', name: 'photo.jpg', type: 'image/jpeg', size: 10, addedAt: '2026-01-01T00:00:00Z' }] },
    ],
    links: [{ id: 'l1', a: 'c1', b: 'c3', fwd: 'near', back: '' }, { a: 'c1', b: 'c4', fwd: 'link without id', back: '' }],
  };
  it('moves malformed notes, keepsakes, kinds and links to unreadable instead of dropping them', () => {
    const p = normalize(structuredClone(src));
    const saved = JSON.stringify(p);
    for (const text of ['12345', 'photo.jpg', 'Bad kind', 'No fields kind', 'link without id']) expect(saved).toContain(text);
    expect(p.kinds?.map(k => k.name)).toEqual(['Boat slip']);
    expect(p.links.map(l => l.id)).toEqual(['l1']);
    expect(p.unreadable).toHaveLength(5);
    expect(p.unreadable).toContainEqual({ from: 'note', card: 'c3', value: 12345 });
  });
  it('is stable when saved and loaded again', () => {
    const once = normalize(structuredClone(src));
    const twice = normalize(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });
});
