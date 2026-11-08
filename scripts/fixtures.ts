// Builds the rubric's synthetic fixtures (grading.md section 4) as plain, unencrypted profile JSON,
// so graders and speed tests use the same bytes. Never real people: every name here is invented.
//   node scripts/fixtures.ts <out-dir>
// Writes f1-alex.json, f1-robin.json, f2-dates.json, f5-lifetime.json and manifest.json (SHA-256 of each).
// Keepsake bytes for F1/F5 are added by the keepsake fixtures once keepsakes exist.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Area = 'about' | 'health' | 'work' | 'money' | 'home' | 'people' | 'interests' | 'goals';
interface Card {
  id: string; area: Area; kind: string; value: string; since: string; until?: string;
  status: 'active' | 'past'; recordedAt: string; replaces?: string; replacedBy?: string;
  fields?: Record<string, string>; tag?: string; note?: string;
  source?: { from: string; at: string };
  revisions: { field?: string; value: string; at: string }[];
}
interface Link { id: string; a: string; b: string; fwd: string; back: string }
interface Profile { id: string; name: string; updatedAt: string; cards: Card[]; links: Link[] }

// Deterministic ids and randomness, so every run writes identical bytes.
let seq = 0;
const id = (p: string) => `${p}-${String(++seq).padStart(6, '0')}`;
function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}
const AT = '2026-11-01T15:00:00.000Z';
const card = (area: Area, kind: string, value: string, since: string, extra: Partial<Card> = {}): Card =>
  ({ id: id('c'), area, kind, value, since, status: 'active', recordedAt: AT, revisions: [], ...extra });
function replace(cards: Card[], old: Card, next: Card) {
  old.status = 'past'; old.until = next.since; old.replacedBy = next.id; next.replaces = old.id; cards.push(next);
}
const link = (a: Card, b: Card, fwd: string, back: string): Link => ({ id: id('l'), a: a.id, b: b.id, fwd, back });

/** F2: the date and overlap cases. "As of 2007" must find A and J only (plus the unknown start as possible). */
export function f2(): Profile {
  seq = 0;
  const cards: Card[] = [];
  const a = card('home', 'Address', 'A: 1 First St', '2000');
  const b = card('home', 'Address', 'B: 2 Second Ave', '2010-06');
  const c = card('home', 'Address', 'C: 3 Third Rd', '2020-03-14');
  cards.push(a); replace(cards, a, b); replace(cards, b, c);
  cards.push(card('work', 'Job', 'J: Analyst at Northwind', '2005', { status: 'past', until: '2012' }));
  cards.push(card('interests', 'Hobby', 'K: Pottery class', '2010-01', { status: 'past', until: '2010-02' }));
  cards.push(card('interests', 'Hobby', 'Unknown start: Birdwatching', ''));
  cards.push(card('people', 'Important date', 'Leap-day wedding', '2024-02-29'));
  // Recorded near midnight in two time zones; recordedAt must never be read as a life date.
  cards.push(card('goals', 'Goal', 'Recorded late in New York', '', { recordedAt: '2026-01-01T04:30:00.000Z' }));
  cards.push(card('goals', 'Goal', 'Recorded early in Auckland', '', { recordedAt: '2025-12-31T11:30:00.000Z' }));
  return { id: 'you-f2', name: 'Date Test', updatedAt: AT, cards, links: [] };
}

/** F1: a small lifetime for Alex Kim (keepsakes added separately). */
export function f1Alex(): Profile {
  seq = 100;
  const cards: Card[] = [];
  const push = (c: Card) => (cards.push(c), c);
  const name = push(card('about', 'Full name', 'Alex Morgan Kim', '', { revisions: [{ value: 'Alex Morgen Kim', at: '2026-10-02T10:00:00.000Z' }] }));
  push(card('about', 'Birthday', 'Mar 3, 1964', '1964-03-03'));
  push(card('about', 'Birthplace', 'Séoul → Raleigh, NC', ''));
  push(card('about', 'Language', '한국어', '', { fields: { ability: 'Fluent' } }));
  push(card('about', 'Passport', 'X12345678', '2019-05', { fields: { number: 'X12345678', issuer: 'United States' } }));
  push(card('about', 'Social Security number', '123-45-6789', ''));
  const a1 = push(card('home', 'Address', '12 Elm St, Springfield', '1990'));
  const a2 = card('home', 'Address', '48 Oak Ave, Raleigh', '2004-08');
  const a3 = card('home', 'Address', '7 Birch Ln, Durham 🏡', '2016-03-14');
  replace(cards, a1, a2); replace(cards, a2, a3);
  push(card('home', 'Vehicle', '2012 Honda Fit', '2012', { status: 'past', until: '2020', fields: { year: '2012', make: 'Honda', model: 'Fit', vin: '1HGBH41JXMN109186' } }));
  push(card('home', 'Pet', 'Mochi', '2015', { fields: { species: 'Cat' }, note: 'Found her under the porch.\nShe hated the vacuum.' }));
  const j1 = push(card('work', 'Job', 'Teacher at Lincoln High', '1988', { status: 'past', until: '2004' }));
  const j2 = push(card('work', 'Job', 'Counselor at Wake County Schools', '2004-09'));
  const j3 = push(card('work', 'Job', 'Weekend tutor at Kumon', '2006'));
  push(card('work', 'Education', 'BA Education, NC State', '1982', { status: 'past', until: '1986' }));
  push(card('work', 'Skill', 'Sign language', ''));
  push(card('health', 'Medication', 'Lisinopril 10 mg', '2015-02', { status: 'past', until: '2021-06', fields: { dose: '10 mg', often: 'Daily' } }));
  push(card('health', 'Allergy', 'Penicillin', '', { fields: { reaction: 'Hives', severity: 'Moderate' } }));
  push(card('health', 'Condition', 'Asthma', '1970'));
  const doc = push(card('health', 'Doctor', 'Dr. Maya Lee', '2010', { fields: { specialty: 'Primary care' } }));
  push(card('health', 'Health insurance', 'Aetna PPO', '2004-09', { fields: { member: 'W123456789' } }));
  push(card('money', 'Bank account', 'First Citizens checking ••6789', '1995'));
  push(card('money', 'Retirement account', 'TIAA 403(b)', '1988'));
  push(card('money', 'Mortgage', 'Wells Fargo 30-yr fixed', '2016-03', { fields: { amount: '$240,000' } }));
  const sam = push(card('people', 'Partner', 'Sam Rivera', '1992', { note: 'Met at a friend’s barbecue.' }));
  const kid = push(card('people', 'Child', 'Jordan Kim-Rivera', '1996-07-21'));
  const mom = push(card('people', 'Parent', 'Grace Kim', ''));
  push(card('people', 'Friend', 'Ana Gómez', '1985', { fields: { met: 'College' } }));
  push(card('people', 'Friend', '田中 ゆき', '2008'));
  push(card('interests', 'Hobby', 'Pottery', '2010-01', { status: 'past', until: '2010-02' }));
  push(card('interests', 'Book', 'East of Eden', '2019', { source: { from: 'Goodreads', at: AT } }));
  push(card('interests', 'Travel', 'Lisbon', '2018-05', { note: 'First trip abroad together.', revisions: [{ field: 'note', value: 'First trip abroad.', at: '2026-10-05T10:00:00.000Z' }] }));
  const g = push(card('goals', 'Goal', 'Run a half marathon', '2022', { revisions: [{ value: 'Run a 10k', at: '2026-09-01T10:00:00.000Z' }] }));
  push(card('goals', 'Goal', 'Learn to sail', '2012', { status: 'past', until: '2014', fields: { status: 'Dropped' } }));
  push(card('goals', 'Wish', 'Ashes scattered at Wrightsville Beach', '', { note: 'Will is in the fire safe.' }));
  push(card('interests', 'Custom: Choir', 'Durham Community Choir', '2017'));
  push(card('people', 'Friend', 'Unknown-date friend', ''));
  // More history, so F1 has 12 past cards.
  push(card('work', 'Volunteering', 'Food bank shifts', '1999', { status: 'past', until: '2003' }));
  push(card('home', 'Pet', 'Biscuit', '1994', { status: 'past', until: '2009', fields: { species: 'Dog' } }));
  push(card('interests', 'Hobby', 'Bowling league', '', { status: 'past', until: '2001' }));
  push(card('money', 'Credit card', 'Discover ••1111', '1998-04', { status: 'past', until: '2015-11' }));
  const links = [
    link(sam, kid, 'parent of', 'child of'),
    link(name, mom, 'child of', 'parent of'),
    link(doc, cards.find(c => c.kind === 'Condition')!, 'treats', ''),
    link(j2, a2, '', ''),
    link(j3, j2, 'alongside', 'alongside'),
    link(g, sam, 'with', ''),
  ];
  void j1;
  return { id: 'you-f1-alex', name: 'Alex Kim', updatedAt: AT, cards, links };
}

export function f1Robin(): Profile {
  seq = 900;
  return { id: 'you-f1-robin', name: 'Robin Lee', updatedAt: AT,
    cards: [card('about', 'Full name', 'Robin Lee', ''), card('home', 'Address', '99 Pine Ct, Cary', '2015')], links: [] };
}

/** F5: 50 years, 10,000 cards (2,000 history), 1,000 links, 2,000 revisions, several sources. */
export function f5(): Profile {
  seq = 10_000;
  const r = rng(5);
  const areas: Area[] = ['about', 'health', 'work', 'money', 'home', 'people', 'interests', 'goals'];
  const sources = ['', '', '', 'Spotify', 'Netflix', 'Goodreads', 'Contacts', 'LinkedIn'];
  const cards: Card[] = [];
  for (let i = 0; i < 10_000; i++) {
    const area = areas[i % 8];
    const y = 1976 + Math.floor(r() * 50);
    const prec = i % 3;
    const since = prec === 0 ? `${y}` : prec === 1 ? `${y}-${String(1 + (i % 12)).padStart(2, '0')}` : `${y}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
    const src = sources[i % sources.length];
    const c = card(area, `${area} kind ${i % 5}`, `${area} item ${i} — ünïcødé ${i % 7 === 0 ? '日本' : ''}`.trim(), i % 97 === 0 ? '' : since,
      src ? { source: { from: src, at: AT } } : {});
    if (i < 2000) { c.status = 'past'; c.until = `${Math.min(y + 1 + (i % 5), 2026)}`; }
    if (i >= 2000 && i < 4000) c.revisions.push({ value: `earlier wording ${i}`, at: AT });
    cards.push(c);
  }
  const links: Link[] = [];
  for (let i = 0; i < 1000; i++) links.push(link(cards[i * 7], cards[i * 7 + 3], i % 2 ? 'with' : '', i % 3 ? 'with' : ''));
  return { id: 'you-f5', name: 'Lifetime Scale', updatedAt: AT, cards, links };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('fixtures.ts')) {
  const out = process.argv[2];
  if (!out) { console.error('usage: node scripts/fixtures.ts <out-dir>'); process.exit(1); }
  mkdirSync(out, { recursive: true });
  const files: Record<string, Profile> = {
    'f1-alex.json': f1Alex(), 'f1-robin.json': f1Robin(), 'f2-dates.json': f2(), 'f5-lifetime.json': f5(),
  };
  const manifest: Record<string, { sha256: string; bytes: number; cards: number }> = {};
  for (const [name, p] of Object.entries(files)) {
    const text = JSON.stringify({ app: 'you', version: 1, savedAt: AT, profile: p });
    writeFileSync(join(out, name), text);
    manifest[name] = { sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text), cards: p.cards.length };
  }
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(manifest);
}
