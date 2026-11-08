// Ways to browse an area once it holds hundreds of cards: grouped by kind, by where each card came
// from (your own words first, imported history after), sorted, and folded by year. No screen code.
import type { Area } from './areas';
import { cardStart } from './cards';
import type { Card } from './types';

/** Where a card came from: '' for cards you added yourself, otherwise the import ("Netflix"). */
export function originOf(c: Card): string {
  const synced = c.imports && Object.keys(c.imports)[0];
  return synced || c.source?.from || '';
}

/** The label for cards with no life date. They are never placed by when they were recorded. */
export const UNKNOWN_YEAR = 'Date unknown';
export const yearOf = (c: Card) => (c.since ? cardStart(c).slice(0, 4) : UNKNOWN_YEAR);

/** How much a card was played: plays for music, episodes for shows and podcasts. */
export const playsOf = (c: Card) => Number((c.fields?.plays ?? c.fields?.episodes ?? '').replace(/\D/g, '')) || 0;

export type Sort = 'recent' | 'oldest' | 'az' | 'plays';

export function sortCards(cards: Card[], sort: Sort): Card[] {
  // Unknown life dates go last in both date orders; recorded time only breaks ties.
  const unknown = (a: Card, b: Card) => Number(!a.since) - Number(!b.since);
  const by: Record<Sort, (a: Card, b: Card) => number> = {
    recent: (a, b) => unknown(a, b) || (a.since && b.since ? cardStart(b).localeCompare(cardStart(a)) : 0) || b.recordedAt.localeCompare(a.recordedAt),
    oldest: (a, b) => unknown(a, b) || (a.since && b.since ? cardStart(a).localeCompare(cardStart(b)) : 0) || a.recordedAt.localeCompare(b.recordedAt),
    az: (a, b) => a.value.localeCompare(b.value, undefined, { sensitivity: 'base', numeric: true }),
    plays: (a, b) => playsOf(b) - playsOf(a) || by.recent(a, b),
  };
  return [...cards].sort(by[sort]);
}

export interface KindGroup { kind: string; cards: Card[] }

/** An area's cards by kind, in the area's suggested order, with kinds the person made up last. */
export function groupByKind(area: Area, cards: Card[]): KindGroup[] {
  const order = (kind: string) => { const i = area.kinds.findIndex(k => k.name === kind); return i < 0 ? area.kinds.length : i; };
  const kinds = [...new Set(cards.map(c => c.kind))].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  return kinds.map(kind => ({ kind, cards: cards.filter(c => c.kind === kind) }));
}

/** Cards split by origin: your own first, then each import, biggest first. */
export function groupByOrigin(cards: Card[]): { origin: string; cards: Card[] }[] {
  const by = new Map<string, Card[]>();
  for (const c of cards) { const o = originOf(c); by.set(o, [...(by.get(o) ?? []), c]); }
  return [...by].map(([origin, list]) => ({ origin, cards: list }))
    .sort((a, b) => (a.origin === '' ? -1 : b.origin === '' ? 1 : b.cards.length - a.cards.length));
}

/** Cards folded by year, keeping the order they came in. Cards with no life date get their own group, last. */
export function groupByYear(cards: Card[]): { year: string; cards: Card[] }[] {
  const by = new Map<string, Card[]>();
  for (const c of cards) { const y = yearOf(c); by.set(y, [...(by.get(y) ?? []), c]); }
  return [...by].map(([year, list]) => ({ year, cards: list }))
    .sort((a, b) => Number(a.year === UNKNOWN_YEAR) - Number(b.year === UNKNOWN_YEAR));
}

/**
 * The few cards that stand for a kind when it's folded: the ones you added yourself first, then the
 * most played (if the kind counts plays) or the most recent.
 */
export function previewOf(cards: Card[], n = 3): { label: string; cards: Card[] } {
  const yours = sortCards(cards.filter(c => !originOf(c)), 'recent');
  const played = cards.some(c => playsOf(c) > 0);
  const rest = sortCards(cards.filter(c => originOf(c)), played ? 'plays' : 'recent');
  return { label: yours.length ? 'Yours' : played ? 'Most played' : 'Recently', cards: [...yours, ...rest].slice(0, n) };
}

/** "1,240 · 1,200 from Netflix": the count, and where most of it came from. */
export function countText(cards: Card[]): string {
  const total = cards.length.toLocaleString('en-US');
  const imports = groupByOrigin(cards).filter(g => g.origin);
  if (!imports.length) return total;
  const top = imports[0];
  return top.cards.length === cards.length
    ? `${total} from ${top.origin}`
    : `${total} · ${top.cards.length.toLocaleString('en-US')} from ${top.origin}`;
}

/** Own words and earlier wording remain findable. */
export const noteSearchText = (c: Card) => [c.note ?? '', ...c.revisions.map(r => r.value)].join(' ');
