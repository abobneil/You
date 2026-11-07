import { describe, expect, it } from 'vitest';
import { FALLBACK, pointlessLink, suggestLabels } from './relations';

describe('link label suggestions', () => {
  it('fits the pair, read from the first card', () => {
    expect(suggestLabels('health', 'Health insurance', 'work', 'Job')[0]).toEqual(['provided through', 'provides']);
  });

  it('flips when the cards are the other way round', () => {
    expect(suggestLabels('work', 'Job', 'health', 'Health insurance')[0]).toEqual(['provides', 'provided through']);
  });

  it('matches whole areas, like any person', () => {
    expect(suggestLabels('people', 'Friend', 'interests', 'Place visited')[0]).toEqual(['went to', 'with']);
    expect(suggestLabels('interests', 'Place visited', 'people', 'Partner')[0]).toEqual(['with', 'went to']);
  });

  it('always offers "related to" last, and only that for unknown pairs', () => {
    const s = suggestLabels('health', 'Doctor', 'health', 'Health insurance');
    expect(s.at(-1)).toEqual(FALLBACK);
    expect(suggestLabels('about', 'Full name', 'about', 'Birthday')).toEqual([FALLBACK]);
  });

  it('flags links between two About facts', () => {
    expect(pointlessLink('about', 'about')).toBe(true);
    expect(pointlessLink('about', 'interests')).toBe(false);
  });
});
