import { AREAS } from './areas';
import { startKey, endKey, isValidDate, localDay } from './dates';
import type { Card, Profile, AreaId } from './types';
export type Overlap = 'definite' | 'possible' | 'none';
/** Inclusive possible bounds; strict certainty at fuzzy boundaries avoids invented handover days. */
export function overlap(c: Card, from: string, to: string, now = localDay(new Date().toISOString())): Overlap {
  if (!isValidDate(from) || !isValidDate(to) || startKey(from) > endKey(to)) return 'none';
  const lo = startKey(from), hi = endKey(to);
  const s0 = c.since ? startKey(c.since) : '0000-01-01';
  const s1 = c.since ? endKey(c.since) : '9999-12-31';
  const e0 = c.status === 'active' ? now : c.until ? startKey(c.until) : '0000-01-01';
  const e1 = c.status === 'active' ? now : c.until ? endKey(c.until) : '9999-12-31';
  if (s0 > hi || e1 < lo) return 'none';
  if (!c.since || (c.status === 'past' && !c.until)) return 'possible';
  // An uncertain endpoint wholly inside the query is a boundary, rather than a certain tenure.
  if ((c.since.length < 10 && s0 >= lo && s1 <= hi) || (c.status === 'past' && c.until && c.until.length < 10 && e0 >= lo && e1 <= hi)) return 'possible';
  return s1 <= hi && e0 >= lo && s1 <= e0 ? 'definite' : 'possible';
}
export interface LifeCard { card: Card; overlap: Exclude<Overlap, 'none'> }
export function lifeIn(p: Profile, from: string, to = from) {
  const groups = AREAS.map(a => ({ area: a.id, cards: [] as LifeCard[] }));
  const by = new Map(groups.map(g => [g.area, g]));
  for (const card of p.cards) { const status = overlap(card, from, to); if (status !== 'none') by.get(card.area)!.cards.push({ card, overlap: status }); }
  return groups;
}
export interface YearEntry { year: number; areas: Record<AreaId, { starting: number; ending: number; ongoing: number }> }
export function yearIndex(p: Profile, now = new Date().getFullYear()): YearEntry[] {
  const known = p.cards.flatMap(c => [c.since, c.until].filter(Boolean).map(d => +d!.slice(0, 4)));
  if (!known.length) return [];
  const first = Math.min(now, ...known);
  const rows: YearEntry[] = Array.from({ length: now - first + 1 }, (_, i) => ({ year: first + i, areas: Object.fromEntries(AREAS.map(a => [a.id, { starting: 0, ending: 0, ongoing: 0 }])) as YearEntry['areas'] }));
  for (const c of p.cards) {
    const s = c.since ? +c.since.slice(0, 4) : undefined, e = c.status === 'past' && c.until ? +c.until.slice(0, 4) : undefined;
    if (s !== undefined && rows[s - first]) rows[s - first].areas[c.area].starting++;
    if (e !== undefined && rows[e - first]) rows[e - first].areas[c.area].ending++;
    if (s !== undefined) for (let y = Math.max(first, s); y <= Math.min(now, e ?? now); y++) rows[y - first].areas[c.area].ongoing++;
  }
  return rows;
}
const MEDIA = new Set(['spotify', 'netflix', 'apple music', 'youtube music', 'audible', 'goodreads', 'letterboxd', 'imdb']);
export function foldSource(c: Card): string { return c.source && MEDIA.has(c.source.from.toLowerCase()) ? c.source.from : ''; }
export function foldCards(cards: LifeCard[]) {
  const personal: LifeCard[] = [], sources = new Map<string, LifeCard[]>();
  for (const item of cards) { const source = foldSource(item.card); if (!source) personal.push(item); else { if (!sources.has(source)) sources.set(source, []); sources.get(source)!.push(item); } }
  return { personal, sources };
}
