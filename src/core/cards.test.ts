import { describe, expect, it } from 'vitest';
import {
  activeOf, addCard, addLink, atTheTime, byId, correctValue, defaultMode, endCard, linksOf, removeCard, reopenCard,
} from './cards';
import { emptyProfile } from './profile';
import type { Profile } from './types';

const NOW = '2026-11-06T12:00:00.000Z';

function seed(): Profile {
  const p = emptyProfile();
  p.name = 'Alex';
  return p;
}

describe('adding and replacing', () => {
  it('a new card is active and dated', () => {
    const p = seed();
    const c = addCard(p, { area: 'health', kind: 'Doctor', value: '  Dr. Maya Lee ', since: '2021-03' }, undefined, NOW);
    expect(c.status).toBe('active');
    expect(c.value).toBe('Dr. Maya Lee');
    expect(c.recordedAt).toBe(NOW);
  });

  it('replacing moves the old card to history, ending when the new one starts', () => {
    const p = seed();
    const lee = addCard(p, { area: 'health', kind: 'Doctor', value: 'Dr. Lee', since: '2021-03' });
    const ortiz = addCard(p, { area: 'health', kind: 'Doctor', value: 'Dr. Ortiz', since: '2026-11' }, lee.id);
    expect(lee.status).toBe('past');
    expect(lee.until).toBe('2026-11');
    expect(lee.replacedBy).toBe(ortiz.id);
    expect(ortiz.replaces).toBe(lee.id);
    expect(activeOf(p, 'health', 'Doctor')).toEqual([ortiz]);
  });

  it('replacing without a date ends the old card this month', () => {
    const p = seed();
    const a = addCard(p, { area: 'home', kind: 'Address', value: '12 Elm St', since: '2019' });
    addCard(p, { area: 'home', kind: 'Address', value: '4 Oak Ave', since: '' }, a.id, NOW);
    expect(a.until).toMatch(/^2026-11$/);
  });

  it('suggests replace for one-at-a-time kinds and alongside for many', () => {
    const p = seed();
    const doc = addCard(p, { area: 'health', kind: 'Doctor', value: 'Dr. Lee', since: '' });
    addCard(p, { area: 'health', kind: 'Allergy', value: 'Penicillin', since: '' });
    expect(defaultMode(p, 'health', 'Doctor')).toBe(`r:${doc.id}`);
    expect(defaultMode(p, 'health', 'Allergy')).toBe('add');
    expect(defaultMode(p, 'health', 'Dentist')).toBe('add');
    expect(defaultMode(p, 'health', 'Eye doctor')).toBe('add'); // invented kinds add alongside
  });
});

describe('corrections, endings and removal', () => {
  it('correcting keeps the old wording', () => {
    const p = seed();
    const c = addCard(p, { area: 'health', kind: 'Doctor', value: 'Dr Maya Le', since: '' });
    expect(correctValue(p, c.id, 'Dr. Maya Lee', NOW)).toBe(true);
    expect(c.value).toBe('Dr. Maya Lee');
    expect(c.revisions).toEqual([{ value: 'Dr Maya Le', at: NOW }]);
    expect(correctValue(p, c.id, '  ')).toBe(false);
    expect(correctValue(p, c.id, 'Dr. Maya Lee')).toBe(false);
  });

  it('ending and reopening', () => {
    const p = seed();
    const c = addCard(p, { area: 'health', kind: 'Medication', value: 'Lisinopril', since: '2022' });
    endCard(p, c.id, '2025-06');
    expect(c).toMatchObject({ status: 'past', until: '2025-06' });
    reopenCard(p, c.id);
    expect(c.status).toBe('active');
    expect(c.until).toBeUndefined();
  });

  it('a replaced card cannot be reopened', () => {
    const p = seed();
    const a = addCard(p, { area: 'work', kind: 'Job', value: 'Intern', since: '2018' });
    addCard(p, { area: 'work', kind: 'Job', value: 'Designer', since: '2020' }, a.id);
    reopenCard(p, a.id);
    expect(a.status).toBe('past');
  });

  it('removing a mistaken replacement restores the card it replaced', () => {
    const p = seed();
    const lee = addCard(p, { area: 'health', kind: 'Doctor', value: 'Dr. Lee', since: '2021' });
    const oops = addCard(p, { area: 'health', kind: 'Doctor', value: 'Dr. Typo', since: '2026' }, lee.id);
    addLink(p, oops.id, lee.id);
    removeCard(p, oops.id);
    expect(byId(p, oops.id)).toBeUndefined();
    expect(lee).toMatchObject({ status: 'active' });
    expect(lee.until).toBeUndefined();
    expect(lee.replacedBy).toBeUndefined();
    expect(p.links).toEqual([]);
  });
});

describe('links', () => {
  it('reads from each side', () => {
    const p = seed();
    const ins = addCard(p, { area: 'health', kind: 'Health insurance', value: 'Aetna PPO', since: '2023' });
    const job = addCard(p, { area: 'work', kind: 'Job', value: 'Acme Corp', since: '2022' });
    addLink(p, ins.id, job.id, 'through', 'provides');
    expect(linksOf(p, ins.id).map(x => `${x.label} ${x.other.value}`)).toEqual(['through Acme Corp']);
    expect(linksOf(p, job.id).map(x => `${x.label} ${x.other.value}`)).toEqual(['provides Aetna PPO']);
  });

  it('refuses duplicates and self-links', () => {
    const p = seed();
    const a = addCard(p, { area: 'people', kind: 'Friend', value: 'Sam', since: '' });
    const b = addCard(p, { area: 'interests', kind: 'Place visited', value: 'Japan', since: '2019' });
    expect(addLink(p, a.id, b.id, 'with')).toBeDefined();
    expect(addLink(p, b.id, a.id)).toBeUndefined();
    expect(addLink(p, a.id, a.id)).toBeUndefined();
  });
});

describe('at the time', () => {
  it('lists overlapping cards, but not linked ones or the card it replaced', () => {
    const p = seed();
    const blue = addCard(p, { area: 'health', kind: 'Health insurance', value: 'Blue Cross', since: '2018' });
    const aetna = addCard(p, { area: 'health', kind: 'Health insurance', value: 'Aetna', since: '2023-01' }, blue.id);
    const home = addCard(p, { area: 'home', kind: 'Address', value: '12 Elm St', since: '2019-05' });
    const job = addCard(p, { area: 'work', kind: 'Job', value: 'Acme', since: '2022-09' });
    const old = addCard(p, { area: 'home', kind: 'Address', value: 'Dorm', since: '2010' });
    endCard(p, old.id, '2014');
    addLink(p, aetna.id, job.id, 'through', 'provides');
    expect(atTheTime(p, aetna).map(c => c.value)).toEqual([home.value]);
  });
});
