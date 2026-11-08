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
