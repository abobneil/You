import { describe, expect, it } from 'vitest';
import { areaById } from './areas';
import { countText, groupByKind, groupByOrigin, groupByYear, originOf, previewOf, sortCards } from './browse';
import { addCard } from './cards';
import { emptyProfile } from './profile';
import type { Card } from './types';

const NOW = '2026-11-07T12:00:00.000Z';

function setup() {
  const p = emptyProfile();
  const add = (kind: string, value: string, since: string, from?: string, fields?: Record<string, string>): Card => {
    const c = addCard(p, { area: 'interests', kind, value, since, fields }, undefined, NOW);
    if (from) { c.source = { from, at: NOW }; c.imports = { [from]: { id: value, at: NOW, fields: { ...fields } } }; }
    return c;
  };
  add('Movie or show', 'The Crown', '2021-03-02', 'Netflix', { episodes: '12' });
  add('Movie or show', 'Roma', '2019-01-05', 'Netflix');
  add('Movie or show', 'Alien', '1995', undefined);
  add('Music', 'Radiohead', '2015-06-01', 'Spotify', { plays: '1,204' });
  add('Music', 'Pixies', '2016-01-01', 'Spotify', { plays: '88' });
  add('Woodworking hobby', 'Chairs', '2020');
  add('Book', 'East of Eden', '2019-07-04');
  return p;
}

describe('browsing an area', () => {
  it('groups by kind in the area’s order, made-up kinds last', () => {
    const p = setup();
    expect(groupByKind(areaById('interests')!, p.cards).map(g => [g.kind, g.cards.length]))
      .toEqual([['Book', 1], ['Music', 2], ['Movie or show', 3], ['Woodworking hobby', 1]]);
  });

  it('puts your own cards before imported ones, and says where cards came from', () => {
    const movies = setup().cards.filter(c => c.kind === 'Movie or show');
    expect(groupByOrigin(movies).map(g => [g.origin, g.cards.length])).toEqual([['', 1], ['Netflix', 2]]);
    expect(originOf(movies[2])).toBe('');
    expect(countText(movies)).toBe('3 · 2 from Netflix');
    expect(countText(movies.filter(c => originOf(c)))).toBe('2 from Netflix');
    expect(previewOf(movies)).toMatchObject({ label: 'Yours', cards: [{ value: 'Alien' }, { value: 'The Crown' }, { value: 'Roma' }] });
  });

  it('previews the most played music, and sorts several ways', () => {
    const p = setup();
    const music = p.cards.filter(c => c.kind === 'Music');
    expect(previewOf(music)).toMatchObject({ label: 'Most played', cards: [{ value: 'Radiohead' }, { value: 'Pixies' }] });
    expect(sortCards(p.cards, 'az').map(c => c.value).slice(0, 3)).toEqual(['Alien', 'Chairs', 'East of Eden']);
    expect(sortCards(p.cards, 'oldest')[0].value).toBe('Alien');
    expect(sortCards(p.cards, 'recent')[0].value).toBe('The Crown');
  });

  it('folds by year', () => {
    const p = setup();
    expect(groupByYear(sortCards(p.cards, 'recent')).map(g => g.year)).toEqual(['2021', '2020', '2019', '2016', '2015', '1995']);
  });
});
