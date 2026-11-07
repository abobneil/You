import { describe, expect, it } from 'vitest';
import { fileNameFor, parse, serialize } from '../storage/fileFormat';
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
  it('round-trips through a file', () => {
    const p = emptyProfile();
    p.name = 'Alex';
    const a = addCard(p, { area: 'health', kind: 'Doctor', value: 'Dr. Lee', since: '2021' });
    const b = addCard(p, { area: 'work', kind: 'Job', value: 'Acme', since: '2022' });
    addLink(p, a.id, b.id, 'through', 'provides');
    const back = parse(serialize(p));
    expect(back.name).toBe('Alex');
    expect(back.cards).toEqual(p.cards);
    expect(back.links).toEqual(p.links);
  });

  it('accepts a bare profile and rejects other JSON', () => {
    expect(parse(JSON.stringify({ name: 'Bo', cards: [], links: [] })).name).toBe('Bo');
    expect(() => parse('{"hello":"world"}')).toThrow();
    expect(() => parse('not json')).toThrow();
  });

  it('names files after the person', () => {
    expect(fileNameFor('Alex Kim')).toBe('alex-kim.you.json');
    expect(fileNameFor('  ')).toBe('you.you.json');
  });
});
