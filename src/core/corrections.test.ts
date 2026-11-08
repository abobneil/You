import { describe, expect, it } from 'vitest';
import { addCard, addLink, byId, correctMeta, correctValue, endCard, removeCard, setField, setNote, undoRemove } from './cards';
import { dateProblem, rangeProblem } from './dates';
import { emptyProfile } from './profile';

const T1 = '2026-11-08T10:00:00.000Z';
const T2 = '2026-11-08T11:00:00.000Z';

const seed = () => { const p = emptyProfile(); p.name = 'Alex'; return p; };

describe('correcting a card keeps what it meant before', () => {
  it('a corrected start date is kept, with when it changed', () => {
    const p = seed();
    const c = addCard(p, { area: 'home', kind: 'Address', value: '12 Elm St', since: '2000' });
    expect(correctMeta(p, c.id, 'since', '2001', T1)).toBe(true);
    expect(c.since).toBe('2001');
    expect(c.revisions).toEqual([{ field: 'since', value: '2000', at: T1 }]);
  });

  it('an unknown date that becomes known is recorded as having been unknown', () => {
    const p = seed();
    const c = addCard(p, { area: 'work', kind: 'Job', value: 'Designer', since: '' });
    correctMeta(p, c.id, 'since', '2005-03', T1);
    expect(c.revisions).toEqual([{ field: 'since', value: '', at: T1 }]);
  });

  it('corrects the end date of a card in history, but never sets one on a current card', () => {
    const p = seed();
    const c = addCard(p, { area: 'work', kind: 'Job', value: 'Designer', since: '2005' });
    expect(correctMeta(p, c.id, 'until', '2010', T1)).toBe(false);
    expect(c.until).toBeUndefined();
    endCard(p, c.id, '2010', T1);
    expect(correctMeta(p, c.id, 'until', '2011-06', T2)).toBe(true);
    expect(c.until).toBe('2011-06');
    expect(c.revisions).toEqual([{ field: 'until', value: '2010', at: T2 }]);
  });

  it('a changed tag and kind are kept; details stay when the kind changes', () => {
    const p = seed();
    const phone = addCard(p, { area: 'about', kind: 'Phone', value: '(555) 123-4567', since: '', tag: 'cell' });
    correctMeta(p, phone.id, 'tag', 'home', T1);
    expect(phone.tag).toBe('home');
    correctMeta(p, phone.id, 'tag', '', T2);
    expect(phone.tag).toBeUndefined();
    expect(phone.revisions).toEqual([{ field: 'tag', value: 'cell', at: T1 }, { field: 'tag', value: 'home', at: T2 }]);

    const job = addCard(p, { area: 'work', kind: 'Job', value: 'Volunteer', since: '2010', fields: { employer: 'Food bank' } });
    expect(correctMeta(p, job.id, 'kind', 'Volunteering', T1)).toBe(true);
    expect(job.kind).toBe('Volunteering');
    expect(job.fields).toEqual({ employer: 'Food bank' });
    expect(job.revisions).toEqual([{ field: 'kind', value: 'Job', at: T1 }]);
    expect(correctMeta(p, job.id, 'kind', '  ', T2)).toBe(false);
  });

  it('saving with nothing changed records nothing', () => {
    const p = seed();
    const c = addCard(p, { area: 'home', kind: 'Address', value: '12 Elm St', since: '2000', fields: { city: 'Springfield' }, note: 'Blue door' });
    expect(correctMeta(p, c.id, 'since', '2000', T1)).toBe(false);
    expect(correctMeta(p, c.id, 'kind', 'Address', T1)).toBe(false);
    expect(correctMeta(p, c.id, 'tag', '', T1)).toBe(false);
    expect(correctValue(p, c.id, '12 Elm St', T1)).toBe(false);
    expect(setField(p, c.id, 'city', 'Springfield', T1)).toBe(false);
    expect(setNote(p, c.id, 'Blue door', T1)).toBe(false);
    expect(c.revisions).toEqual([]);
  });

  it('two real corrections keep their order', () => {
    const p = seed();
    const c = addCard(p, { area: 'home', kind: 'Address', value: '12 Elm St', since: '2000' });
    correctValue(p, c.id, '12 Elm Street', T1);
    correctMeta(p, c.id, 'since', '1999', T2);
    expect(c.revisions.map(r => [r.field ?? 'value', r.value])).toEqual([['value', '12 Elm St'], ['since', '2000']]);
  });
});

describe('Remove can be undone exactly', () => {
  it('restores a removed card and its links', () => {
    const p = seed();
    const a = addCard(p, { area: 'work', kind: 'Job', value: 'Designer', since: '2005' }, undefined, T1);
    const b = addCard(p, { area: 'people', kind: 'Friend', value: 'Sam', since: '2006' }, undefined, T1);
    const c = addCard(p, { area: 'people', kind: 'Friend', value: 'Robin', since: '2007' }, undefined, T1);
    addLink(p, b.id, c.id, 'met through');
    addLink(p, a.id, b.id, 'coworker');
    addLink(p, a.id, c.id);
    const before = structuredClone(p);
    const r = removeCard(p, b.id)!;
    expect(byId(p, b.id)).toBeUndefined();
    expect(p.links).toHaveLength(1);
    expect(undoRemove(p, r)).toBe(true);
    expect(p).toEqual(before);
    expect(undoRemove(p, r)).toBe(false); // twice is harmless
    expect(p).toEqual(before);
  });

  it('restores a mistaken replacement and the chain it changed', () => {
    const p = seed();
    const old = addCard(p, { area: 'home', kind: 'Address', value: '12 Elm St', since: '2000' }, undefined, T1);
    const mid = addCard(p, { area: 'home', kind: 'Address', value: '9 Oak Ave', since: '2010' }, old.id, T1);
    const now = addCard(p, { area: 'home', kind: 'Address', value: '3 Pine Rd', since: '2020' }, mid.id, T1);
    const before = structuredClone(p);
    const r = removeCard(p, mid.id)!;
    expect(byId(p, old.id)!.status).toBe('past');
    expect(byId(p, old.id)!.until).toBe('2010');
    expect(byId(p, now.id)!.replaces).toBe(old.id);
    undoRemove(p, r);
    expect(p).toEqual(before);
  });
});

describe('date checks', () => {
  it('accepts a year, a month or a real day, and nothing at all', () => {
    expect(dateProblem('2000', '', '')).toBe('');
    expect(dateProblem('2000', '02', '')).toBe('');
    expect(dateProblem('2000', '02', '29')).toBe('');
    expect(dateProblem('', '', '')).toBe('');
  });

  it('explains impossible or half-typed dates instead of changing them', () => {
    expect(dateProblem('2001', '02', '30')).toMatch(/February 2001 has no day 30/);
    expect(dateProblem('2001', '02', '29')).toMatch(/no day 29/);
    expect(dateProblem('2001', '13', '')).toMatch(/month/);
    expect(dateProblem('200', '', '')).toMatch(/four digits/);
    expect(dateProblem('', '03', '')).toMatch(/year/);
    expect(dateProblem('2001', '', '12')).toMatch(/month/);
  });

  it('flags an end before its start, allowing the same fuzzy period', () => {
    expect(rangeProblem('2005', '2004')).toMatch(/before it starts/);
    expect(rangeProblem('2005', '2005-01')).toBe('');
    expect(rangeProblem('2005-06', '2005')).toBe('');
    expect(rangeProblem('2005-06-10', '2005-06-09')).not.toBe('');
    expect(rangeProblem('', '2004')).toBe('');
  });
});
