import { describe, it, expect } from 'vitest';
import { overlap, lifeIn, yearIndex, foldCards, foldSource } from './life';
import { isValidDate, fuzzyFromParts, endKey } from './dates';
import type { Card, Profile } from './types';
const card = (id: string, since: string, until?: string, area: Card['area'] = 'home'): Card => ({ id, area, kind: 'Address', value: id, since, until, status: until === undefined ? 'active' : 'past', recordedAt: '2026-11-08T12:00:00Z', revisions: [] });
const profile = (cards: Card[]): Profile => ({ name: 'Alex', cards, links: [] });
describe('life chronology', () => {
  it('answers the exact F2 as-of-2007 fixture using life dates', () => {
    const p = profile([card('A', '2000', '2010-06'), card('B', '2010-06', '2020-03-14'), card('C', '2020-03-14'), card('J', '2005', '2012', 'work'), card('K', '2010-01', '2010-02', 'interests'), card('unknown', '', undefined, 'people')]);
    const found = lifeIn(p, '2007').flatMap(g => g.cards).map(i => [i.card.id, i.overlap]);
    expect(found).toEqual([['J', 'definite'], ['A', 'definite'], ['unknown', 'possible']]);
    expect(overlap(p.cards[0], '2010-06', '2010-06')).toBe('possible');
    expect(overlap(p.cards[1], '2010-06', '2010-06')).toBe('possible');
  });
  it('handles leap days, exact endpoints and real month ends', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2023-02-30')).toBe(false);
    expect(fuzzyFromParts('2023', '02', '30')).toBe('');
    expect(endKey('2024-02')).toBe('2024-02-29');
    expect(overlap(card('leap', '2024-02-29', '2024-03-01'), '2024-02-29', '2024-02-29')).toBe('definite');
    expect(overlap(card('x', '2024-03-01'), '2024-02', '2024-02')).toBe('none');
    expect(overlap(card('x', '2020'), '2024', '2000')).toBe('none');
  });
  it('keeps unknown dates uncertain and never indexes recordedAt', () => {
    expect(overlap(card('u', '', ''), '1900', '1900')).toBe('possible');
    expect(overlap(card('u', '2000', ''), '2007', '2007')).toBe('possible');
    expect(yearIndex(profile([card('u', '')]))).toEqual([]);
    expect(overlap(card('future', '2030'), '2026', '2026', '2026-11-08')).toBe('none');
  });
  it('indexes starts, endings and ongoing cards per area', () => {
    const rows = yearIndex(profile([card('a', '2000', '2002'), card('b', '2001', undefined, 'work')]), 2003);
    expect(rows.map(r => r.year)).toEqual([2000, 2001, 2002, 2003]);
    expect(rows[2].areas.home).toEqual({ starting: 0, ending: 1, ongoing: 1 });
    expect(rows[3].areas.home.ongoing).toBe(0);
    expect(rows[3].areas.work.ongoing).toBe(1);
  });
  it('folds only media sources and retains every accepted card', () => {
    const cards = ['Spotify', 'Netflix', 'Apple Music', 'YouTube Music', 'Audible', 'Goodreads', 'Letterboxd', 'IMDb', 'Contacts', 'LinkedIn', 'health', 'licence', ''].map((s, i) => ({ ...card(String(i), '2000'), ...(s ? { source: { from: s, at: '' } } : {}) }));
    const folded = foldCards(cards.map(card => ({ card, overlap: 'definite' })));
    expect(folded.personal).toHaveLength(5);
    expect(folded.sources.size).toBe(8);
    expect(foldSource(cards[8])).toBe('');
  });
  it('queries and indexes 10,000 cards in under 200ms', () => {
    const p = profile(Array.from({ length: 10000 }, (_, i) => card(String(i), String(1970 + i % 50), i % 5 === 0 ? String(1971 + i % 50) : undefined)));
    const start = performance.now();
    expect(lifeIn(p, '2007').flatMap(g => g.cards).length).toBeGreaterThan(0);
    expect(yearIndex(p).length).toBeGreaterThan(50);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
