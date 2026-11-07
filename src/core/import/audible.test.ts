import { describe, expect, it } from 'vitest';
import { addCard, setField } from '../cards';
import { emptyProfile, normalize } from '../profile';
import { audibleRows } from './audible';
import { applyProposals, planFor } from './match';

const book = (asin = 'B000000001', state = 'not_started') => ({ id: `audible:us:${asin}`, asin, marketplace: 'us',
  title: 'A book', authors: ['An author'], content_type: 'Product', purchase_date: '2020-01-01',
  ownership: { status: 'likely_owned' }, listening: { state, position_ms: 0 } });
function proposals(items = [book()], at = '2026-11-07T12:00:00Z') {
  return audibleRows(JSON.stringify({ schema: 'you.audible.library', version: 1, marketplace: 'us', exported_at: at, items }))
    .rows.flatMap(r => r.build());
}

describe('Audible reviewed sync', () => {
  it('imports separate Audible status and ownership without inventing a general reading status', () => {
    const p = proposals()[0];
    expect(p.fields).toMatchObject({ author: 'An author', audibleStatus: 'Not started', audibleOwnership: 'Likely owned' });
    expect(p.fields?.status).toBeUndefined();
  });

  it('is idempotent and refreshes newer listening status with revision history', () => {
    const profile = emptyProfile();
    applyProposals(profile, proposals(), 'Audible');
    expect(planFor(profile, proposals()[0])).toBe('have');
    const newer = proposals([book(undefined, 'finished')], '2026-11-08T12:00:00Z');
    expect(planFor(profile, newer[0])).toBe('update');
    expect(applyProposals(profile, newer, 'Audible').updated).toBe(1);
    expect(profile.cards).toHaveLength(1);
    expect(profile.cards[0].fields?.audibleStatus).toBe('Read');
    expect(profile.cards[0].revisions).toContainEqual(expect.objectContaining({ field: 'audibleStatus', value: 'Not started' }));
    expect(planFor(profile, proposals()[0])).toBe('have');
    expect(normalize(JSON.parse(JSON.stringify(profile))).cards[0].imports?.Audible.id).toBe('audible:us:B000000001');
  });

  it('a newer sync with nothing changed is already there, so syncing again flags nothing', () => {
    const profile = emptyProfile();
    applyProposals(profile, proposals(), 'Audible');
    const later = proposals([book()], '2026-11-09T12:00:00Z');
    expect(planFor(profile, later[0])).toBe('have');
    expect(applyProposals(profile, later, 'Audible')).toMatchObject({ added: 0, filled: 0, updated: 0 });
    // A real change after that is still picked up.
    expect(planFor(profile, proposals([book(undefined, 'finished')], '2026-11-10T12:00:00Z')[0])).toBe('update');
  });

  it('preserves manual edits and deliberate clears on refresh', () => {
    const profile = emptyProfile();
    applyProposals(profile, proposals(), 'Audible');
    const c = profile.cards[0];
    setField(profile, c.id, 'audibleStatus', 'Read elsewhere');
    setField(profile, c.id, 'author', '');
    applyProposals(profile, proposals([book(undefined, 'finished')], '2026-11-08T12:00:00Z'), 'Audible');
    expect(c.fields?.audibleStatus).toBe('Read elsewhere');
    expect(c.fields?.author).toBeUndefined();
  });

  it('matches stable ASINs after renaming, but keeps two editions with the same title', () => {
    const profile = emptyProfile();
    applyProposals(profile, proposals(), 'Audible');
    profile.cards[0].value = 'My renamed book';
    applyProposals(profile, proposals([book(undefined, 'finished')], '2026-11-08T12:00:00Z'), 'Audible');
    expect(profile.cards).toHaveLength(1);
    applyProposals(profile, proposals([book('B000000002')]), 'Audible');
    expect(profile.cards).toHaveLength(2);
  });

  it('fills a matching Goodreads book, preserving its source and general reading status', () => {
    const profile = emptyProfile();
    const c = addCard(profile, { area: 'interests', kind: 'Book', value: 'A book', since: '', fields: { author: 'An author', status: 'Read' } });
    c.source = { from: 'Goodreads', at: '2020-01-01' };
    applyProposals(profile, proposals(), 'Audible');
    expect(profile.cards).toHaveLength(1);
    expect(c.source.from).toBe('Goodreads');
    expect(c.fields?.status).toBe('Read');
    expect(c.imports?.Audible.id).toBe('audible:us:B000000001');
  });

  it('does not merge same-title books by different authors', () => {
    const profile = emptyProfile();
    addCard(profile, { area: 'interests', kind: 'Book', value: 'A book', since: '', fields: { author: 'Someone else' } });
    applyProposals(profile, proposals(), 'Audible');
    expect(profile.cards).toHaveLength(2);
  });

  it('does not collapse different non-Latin titles into the same match', () => {
    const profile = emptyProfile();
    addCard(profile, { area: 'interests', kind: 'Book', value: '三体', since: '', fields: { author: 'An author' } });
    applyProposals(profile, proposals([{ ...book(), title: '活着' }]), 'Audible');
    expect(profile.cards).toHaveLength(2);
  });

  it('rejects auth files, invalid dates and unsupported schema versions', () => {
    expect(audibleRows('{"access_token":"private"}').rows).toEqual([]);
    expect(audibleRows('null').rows).toEqual([]);
    expect(audibleRows('oops').rows).toEqual([]);
    expect(audibleRows(JSON.stringify({ schema: 'you.audible.library', version: 2, items: [] })).rows).toEqual([]);
  });

  it('leaves missing statuses unknown and skips podcast episodes and duplicate entries', () => {
    const b = { ...book(), listening: {}, ownership: {} };
    expect(proposals([b as ReturnType<typeof book>])[0].fields?.audibleStatus).toBe('Unknown');
    expect(proposals([book(), book(), { ...book('B000000003'), content_type: 'PodcastEpisode' }])).toHaveLength(1);
  });
});
