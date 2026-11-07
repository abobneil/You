import { describe, expect, it } from 'vitest';
import { AREAS, kindOf } from './areas';
import { FORMATS } from './formats';

const every = AREAS.flatMap(a => a.kinds.map(k => ({ area: a.id, k })));

describe('card kinds', () => {
  it('kind names are unique within an area', () => {
    for (const a of AREAS) expect(new Set(a.kinds.map(k => k.name)).size).toBe(a.kinds.length);
  });

  it('detail ids are unique within a kind, and labels are filled in', () => {
    for (const { k } of every) {
      const ids = (k.fields ?? []).map(f => f.id);
      expect(new Set(ids).size, k.name).toBe(ids.length);
      for (const f of k.fields ?? []) expect(f.label.trim(), `${k.name}.${f.id}`).not.toBe('');
    }
  });

  it('summaries only point at details that exist', () => {
    for (const { k } of every) for (const id of k.summary ?? [])
      expect(k.fields?.some(f => f.id === id), `${k.name} summary ${id}`).toBe(true);
  });

  it('formats are real', () => {
    for (const { k } of every) {
      if (k.format) expect(FORMATS[k.format], k.name).toBeDefined();
      for (const f of k.fields ?? []) if (f.format) expect(FORMATS[f.format], `${k.name}.${f.id}`).toBeDefined();
    }
  });

  it('names built from details cope with nothing filled in', () => {
    for (const { k } of every) if (k.titleFrom) expect(k.titleFrom({}), k.name).toBe('');
  });

  it('a few names read naturally', () => {
    expect(kindOf('about', 'Full name').titleFrom!({ first: 'Neil', middle: 'Alexander', last: 'Chester' })).toBe('Neil Alexander Chester');
    expect(kindOf('about', 'Birthplace').titleFrom!({ city: 'Raleigh', state: 'NC', country: 'United States' })).toBe('Raleigh, NC, United States');
    expect(kindOf('health', 'Health insurance').titleFrom!({ insurer: 'Aetna', plan: 'PPO' })).toBe('Aetna PPO');
  });

  it('every area has at least five kinds, and every kind but simple facts has details', () => {
    const simple = new Set(['Preferred name', 'Pronouns', 'Blood type', 'Phone', 'Social Security number']);
    for (const a of AREAS) expect(a.kinds.length, a.title).toBeGreaterThanOrEqual(5);
    for (const { k } of every) if (!simple.has(k.name)) expect(k.fields?.length ?? 0, k.name).toBeGreaterThan(0);
  });
});
