// All the rules for cards live here, free of any screen code, so they can be tested.
import { isMany } from './areas';
import { endKey, fmtDate, fmtISO, localDay, startKey, thisMonth } from './dates';
import type { AreaId, Card, FuzzyDate, Link, Profile } from './types';

export const newId = () => crypto.randomUUID();

export const byId = (p: Profile, id: string | undefined) => (id ? p.cards.find(c => c.id === id) : undefined);

export const activeOf = (p: Profile, area: AreaId, kind: string) =>
  p.cards.filter(c => c.area === area && c.kind === kind && c.status === 'active');

/** First and last day a card was true, as YYYY-MM-DD strings that sort correctly. */
export const cardStart = (c: Card) => (c.since ? startKey(c.since) : localDay(c.recordedAt));
export const cardEnd = (c: Card) =>
  c.status === 'active' ? '9999-12-31' : c.until ? endKey(c.until) : cardStart(c);

export function rangeText(c: Card): string {
  if (c.status === 'active') return c.since ? `Since ${fmtDate(c.since)}` : `Added ${fmtISO(c.recordedAt)}`;
  return `${fmtDate(c.since) || '?'} – ${fmtDate(c.until) || '?'}`;
}

/** Newest first; cards that started on the same day are ordered by when they were added. */
export const byStartDesc = (x: Card, y: Card) =>
  cardStart(y).localeCompare(cardStart(x)) || y.recordedAt.localeCompare(x.recordedAt);

/**
 * What the composer should suggest: replace the current card for one-at-a-time kinds,
 * add alongside for kinds you can have several of.
 */
export function defaultMode(p: Profile, area: AreaId, kind: string, replaceId?: string): 'add' | `r:${string}` {
  const actives = activeOf(p, area, kind);
  if (replaceId && actives.some(c => c.id === replaceId)) return `r:${replaceId}`;
  if (actives.length && !isMany(area, kind)) return `r:${actives[0].id}`;
  return 'add';
}

export interface NewCard {
  area: AreaId;
  kind: string;
  value: string;
  since: FuzzyDate;
}

/** Adds a card. If `replaceId` is given, that card moves to history and ends when this one starts. */
export function addCard(p: Profile, input: NewCard, replaceId?: string, now = new Date().toISOString()): Card {
  const c: Card = {
    id: newId(), area: input.area, kind: input.kind.trim(), value: input.value.trim(),
    since: input.since, status: 'active', recordedAt: now, revisions: [],
  };
  const old = byId(p, replaceId);
  if (old && old.status === 'active') {
    old.status = 'past';
    old.until = input.since || thisMonth(now);
    old.replacedBy = c.id;
    c.replaces = old.id;
  }
  p.cards.push(c);
  return c;
}

/** Fixes wording in place (a typo is not a life event) and keeps the old wording. */
export function correctValue(p: Profile, id: string, value: string, now = new Date().toISOString()): boolean {
  const c = byId(p, id);
  const v = value.trim();
  if (!c || !v || v === c.value) return false;
  c.revisions.push({ value: c.value, at: now });
  c.value = v;
  return true;
}

/** Moves a card to history without anything replacing it. */
export function endCard(p: Profile, id: string, until: FuzzyDate, now = new Date().toISOString()) {
  const c = byId(p, id);
  if (!c || c.status !== 'active') return;
  c.status = 'past';
  c.until = until || thisMonth(now);
}

/** Undo "This ended" for a card that wasn't replaced. */
export function reopenCard(p: Profile, id: string) {
  const c = byId(p, id);
  if (!c || c.status !== 'past' || c.replacedBy) return;
  c.status = 'active';
  delete c.until;
}

/**
 * Only for cards added by mistake. If the card had replaced another, that one becomes active again,
 * so removing a mistaken replacement leaves the history as it was.
 */
export function removeCard(p: Profile, id: string) {
  const c = byId(p, id);
  if (!c) return;
  const prev = byId(p, c.replaces);
  if (prev && prev.replacedBy === c.id) {
    prev.status = 'active';
    delete prev.until;
    delete prev.replacedBy;
  }
  const next = byId(p, c.replacedBy);
  if (next) delete next.replaces;
  p.cards = p.cards.filter(x => x.id !== id);
  p.links = p.links.filter(l => l.a !== id && l.b !== id);
}

export function addLink(p: Profile, a: string, b: string, fwd = '', back = fwd): Link | undefined {
  if (a === b || !byId(p, a) || !byId(p, b)) return;
  if (p.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return;
  const l: Link = { id: newId(), a, b, fwd: fwd.trim(), back: back.trim() };
  p.links.push(l);
  return l;
}

export const removeLink = (p: Profile, linkId: string) => { p.links = p.links.filter(l => l.id !== linkId); };

/** A card's links, each read from this card's side. */
export function linksOf(p: Profile, id: string) {
  return p.links
    .filter(l => l.a === id || l.b === id)
    .map(l => ({ link: l, other: byId(p, l.a === id ? l.b : l.a), label: l.a === id ? l.fwd : l.back }))
    .filter((x): x is { link: Link; other: Card; label: string } => !!x.other);
}

/**
 * Cards whose time overlapped this one's, worked out from dates and never stored.
 * Leaves out linked cards and the cards it replaced or was replaced by.
 * One-at-a-time kinds (where you lived, your job) come first.
 */
export function atTheTime(p: Profile, c: Card, limit = 6): Card[] {
  const s = cardStart(c), e = cardEnd(c);
  const linked = new Set(linksOf(p, c.id).map(x => x.other.id));
  return p.cards
    .filter(o => o.id !== c.id && !linked.has(o.id) && o.id !== c.replaces && o.id !== c.replacedBy)
    .filter(o => cardStart(o) <= e && s <= cardEnd(o))
    .sort((x, y) => Number(isMany(x.area, x.kind)) - Number(isMany(y.area, y.kind))
      || Number(x.area === c.area) - Number(y.area === c.area))
    .slice(0, limit);
}
