import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { emptyProfile } from '../profile';
import { applyProposals, planFor } from './match';
import { mediaRows } from './media';
import { linkedinRows } from './linkedin';
import { contactAsPerson, parseVcf } from './vcard';
import { healthRows, parseHealth } from './health';
import type { Proposal } from './types';
const read = (name: string) => readFileSync(new URL('./fixtures/area-c/' + name, import.meta.url), 'utf8');
const proposals = (r: {rows: {build: () => Proposal[]}[]}) => r.rows.flatMap(r => r.build());
const expected = (name: string) => JSON.parse(read(name + '.expected.json'));
const old = '2025-01-01T00:00:00Z', newer = '2026-01-01T00:00:00Z';
describe('area C ledger regressions', () => {
  it('retains both Dunes and assigns Lynch only to 1984', () => {
    const p = emptyProfile();
    expect(applyProposals(p, proposals(mediaRows(read('letterboxd-diary.csv'), old)), 'Letterboxd').added).toBe(expected('letterboxd-diary.csv').expectedRows);
    applyProposals(p, proposals(mediaRows(read('imdb.csv'), newer)), 'IMDb');
    expect(p.cards.find(c => c.value === 'Dune' && c.fields?.year === '2021')?.fields?.creator).not.toBe('David Lynch');
    expect(p.cards.find(c => c.value === 'Dune' && c.fields?.year === '1984')?.fields?.creator).toBe('David Lynch');
  });
  it('retains all four jobs including both Helper stints', () => {
    const p = emptyProfile();
    const ps = proposals(linkedinRows({'Positions.csv':read('li-Positions.csv')}, old));
    expect(applyProposals(p, ps, 'LinkedIn').added).toBe(expected('li-Positions.csv').expectedRows);
    expect(ps.every(row => planFor(p, row) === 'have')).toBe(true);
  });
  it('discloses blank titles and never imports not-taken medication as current', () => {
    expect(mediaRows(read('goodreads-v1.csv')).notes?.join()).toContain('1 rows skipped');
    const r = healthRows(parseHealth(read('health.fhir.json')));
    expect(proposals(r).some(p => /warfarin/i.test(p.value) && !p.past)).toBe(false);
    expect(r.notes?.join()).toContain('not-taken');
  });
  for (const source of ['contacts', 'linkedin', 'goodreads', 'imdb', 'letterboxd', 'health', 'Spotify', 'Apple Music']) {
    it(`${source}: repeat, older, newer, manual edit and deliberate clear`, () => {
      const p = emptyProfile();
      const row: Proposal = { area:'interests', kind:'Book', value:'Test', fields:{rating:'4', status:'Reading'}, sync:{source,id:'stable',at:old} };
      applyProposals(p,[row],source);
      expect(planFor(p,row)).toBe('have');
      const next = {...row,fields:{rating:'5',status:'Read'},sync:{...row.sync!,at:newer}};
      applyProposals(p,[next],source);
      expect(p.cards[0].fields?.rating).toBe('5');
      expect(p.cards[0].revisions?.length).toBeGreaterThan(0);
      applyProposals(p,[row],source);
      expect(p.cards[0].fields?.rating).toBe('5');
      p.cards[0].fields = {rating:'mine',status:''};
      applyProposals(p,[{...next,sync:{...next.sync,at:'2027-01-01T00:00:00Z'}}],source);
      expect(p.cards[0].fields).toEqual({rating:'mine',status:''});
      expect(p.cards).toHaveLength(1);
    });
  }
  it('keeps plays separate across services', () => {
    const p = emptyProfile();
    for (const source of ['Spotify','Apple Music','YouTube Music']) applyProposals(p,[{area:'interests',kind:'Music',value:'Same artist',fields:{plays:'8'},sync:{source,id:'artist:same',at:old}}],source);
    expect(p.cards).toHaveLength(3);
  });
});


it('refreshes actual Goodreads rows and preserves a clear on a later export', () => {
  const p = emptyProfile();
  const initial = proposals(mediaRows(read('goodreads-v1.csv'), old));
  const later = proposals(mediaRows(read('goodreads-v2.csv'), newer));
  applyProposals(p, initial, 'Goodreads');
  applyProposals(p, later, 'Goodreads');
  expect(p.cards).toHaveLength(5);
  expect(p.cards[0].fields?.rating).toBe('★★★★★');
  applyProposals(p, initial, 'Goodreads');
  expect(p.cards[0].fields?.rating).toBe('★★★★★');
  p.cards[0].fields!.rating = '';
  applyProposals(p, later.map(r => ({...r,sync:{...r.sync!,at:'2027-01-01T00:00:00Z'}})), 'Goodreads');
  expect(p.cards[0].fields?.rating).toBe('');
});
it('uses contact UID/REV for changed phone and title without refilling a clear', () => {
  const text = (rev: string, phone: string, title: string) => `BEGIN:VCARD
VERSION:4.0
UID:contact-1
REV:${rev}
FN:Pat Example
EMAIL:pat@example.invalid
TEL:${phone}
TITLE:${title}
ADR:;;1 Lane;Fable;;00000;GB
END:VCARD`;
  const first = contactAsPerson(parseVcf(text(old,'+1 202 555 0100','Maker'))[0],'Friend');
  const later = contactAsPerson(parseVcf(text(newer,'+1 202 555 0101','Teacher'))[0],'Friend');
  const p = emptyProfile(); applyProposals(p,first,'Contacts'); applyProposals(p,later,'Contacts');
  expect(p.cards).toHaveLength(1);
  expect(p.cards[0].fields?.title).toBe('Teacher');
  expect(p.cards[0].fields?.address).toContain('GB');
  applyProposals(p,first,'Contacts'); expect(p.cards[0].fields?.title).toBe('Teacher');
  p.cards[0].fields!.phone = '';
  const newest = contactAsPerson(parseVcf(text('2027-01-01T00:00:00Z','+1 202 555 0102','Teacher'))[0],'Friend');
  applyProposals(p,newest,'Contacts'); expect(p.cards[0].fields?.phone).toBe('');
});
