import { overlap } from './life';
// All the rules for cards live here, free of any screen code, so they can be tested.
import { isMany, kindOf } from './areas';
import { endKey, fmtDate, startKey, thisMonth } from './dates';
import type { Keepsake } from './keepsakes';
import type { AreaId, Card, FuzzyDate, Link, Profile } from './types';

export const newId = () => crypto.randomUUID();

export const byId = (p: Profile, id: string | undefined) => (id ? p.cards.find(c => c.id === id) : undefined);

export const activeOf = (p: Profile, area: AreaId, kind: string) =>
  p.cards.filter(c => c.area === area && c.kind === kind && c.status === 'active');

/** First and last day a card was true, as YYYY-MM-DD strings that sort correctly. */
export const cardStart = (c: Card) => (c.since ? startKey(c.since) : '');
export const cardEnd = (c: Card) =>
  c.status === 'active' ? '9999-12-31' : c.until ? endKey(c.until) : cardStart(c);

export function rangeText(c: Card): string {
  const k = kindOf(c.area, c.kind);
  if (c.status === 'active') {
    if (k.value === 'date') return ''; // the value already is the date
    if (c.since) return `${k.dated || !c.replaces ? 'Since' : 'Changed'} ${fmtDate(c.since)}`;
    return 'Date unknown';
  }
  if (!c.since) return c.until ? `Until ${fmtDate(c.until)}` : 'Ended (date unknown)';
  return `${fmtDate(c.since)} – ${fmtDate(c.until) || '?'}`;
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
  note?: string;
  area: AreaId;
  kind: string;
  value: string;
  since: FuzzyDate;
  tag?: string;
  fields?: Record<string, string>;
}

/** Adds a card. If `replaceId` is given, that card moves to history and ends when this one starts. */
export function addCard(p: Profile, input: NewCard, replaceId?: string, now = new Date().toISOString()): Card {
  const c: Card = {
    id: newId(), area: input.area, kind: input.kind.trim(), value: input.value.trim(),
    ...(input.note ? { note: input.note } : {}),
    since: input.since, status: 'active', recordedAt: now, revisions: [],
    ...(input.tag ? { tag: input.tag } : {}),
    ...(input.fields && Object.keys(cleanFields(input.fields)).length ? { fields: cleanFields(input.fields) } : {}),
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

/**
 * Adds a card that came *before* an existing one, e.g. an older address entered after the current one.
 * The new card goes straight into history, ending when the later card starts.
 * Existing neighbours are spliced around the inserted card.
 */
export function addCardBefore(p: Profile, input: NewCard, laterId: string, now = new Date().toISOString()): Card | undefined {
  const later = byId(p, laterId);
  if (!later) return;
  const prev = byId(p, later.replaces);
  const c = addCard(p, input, undefined, now);
  c.status = 'past';
  if (later.since) c.until = later.since; else delete c.until;
  c.replacedBy = later.id;
  later.replaces = c.id;
  if (prev) { prev.replacedBy = c.id; c.replaces = prev.id; correctMeta(p, prev.id, 'until', c.since, now); }
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

/** Drops empty details and trims the rest. */
export function cleanFields(f: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (v && v.trim()) out[k] = v.trim();
  return out;
}

/** Corrects one detail in place, keeping the old wording (empty clears it). */
export function setField(p: Profile, id: string, field: string, value: string, now = new Date().toISOString()): boolean {
  const c = byId(p, id);
  if (!c) return false;
  const v = value.trim();
  const old = c.fields?.[field] ?? '';
  if (v === old) return false;
  if (old) c.revisions.push({ field, value: old, at: now });
  c.fields = { ...c.fields };
  if (v) c.fields[field] = v; else delete c.fields[field];
  if (!Object.keys(c.fields).length) delete c.fields;
  return true;
}

/** Moves a card to history without anything replacing it. */
export function endCard(p: Profile, id: string, until: FuzzyDate, _now = new Date().toISOString()) {
  const c = byId(p, id);
  if (!c || c.status !== 'active') return;
  c.status = 'past';
  c.until = until;
}

/** Undo "This ended" for a card that wasn't replaced. */
export function reopenCard(p: Profile, id: string) {
  const c = byId(p, id);
  if (!c || c.status !== 'past' || c.replacedBy) return;
  c.status = 'active';
  delete c.until;
}

/** What `removeCard` took out, so "Undo" can put every piece back exactly where it was. */
export interface Removal {
  card: Card;
  index: number;
  links: { link: Link; index: number }[];
  /** The cards on either side of a replacement chain, as they were before the removal. */
  touched: Card[];
}

/**
 * Only for cards added by mistake. If the card had replaced another, that one becomes active again,
 * so removing a mistaken replacement leaves the history as it was. Returns what's needed to undo it.
 */
export function removeCard(p: Profile, id: string): Removal | undefined {
  const c = byId(p, id);
  if (!c) return;
  const prev = byId(p, c.replaces);
  const next = byId(p, c.replacedBy);
  const removal: Removal = {
    card: structuredClone(c),
    index: p.cards.indexOf(c),
    links: p.links.map((link, index) => ({ link: structuredClone(link), index })).filter(x => x.link.a === id || x.link.b === id),
    touched: [prev, next].filter((x): x is Card => !!x).map(x => structuredClone(x)),
  };
  if (prev && prev.replacedBy === c.id) {
    if (next) prev.replacedBy = next.id;
    else { if (c.status === 'active') { prev.status = 'active'; delete prev.until; } delete prev.replacedBy; }
  }
  if (next) { if (prev) next.replaces = prev.id; else delete next.replaces; }
  p.cards = p.cards.filter(x => x.id !== id);
  p.links = p.links.filter(l => l.a !== id && l.b !== id);
  return removal;
}

/** Puts a removed card back: the card, its links and the cards around it, exactly as they were. */
export function undoRemove(p: Profile, r: Removal): boolean {
  if (byId(p, r.card.id)) return false;
  for (const t of r.touched) {
    const i = p.cards.findIndex(x => x.id === t.id);
    if (i >= 0) p.cards[i] = structuredClone(t);
  }
  p.cards.splice(Math.min(r.index, p.cards.length), 0, structuredClone(r.card));
  for (const { link, index } of [...r.links].sort((a, b) => a.index - b.index)) {
    if (byId(p, link.a) && byId(p, link.b) && !p.links.some(l => l.id === link.id)) p.links.splice(Math.min(index, p.links.length), 0, structuredClone(link));
  }
  return true;
}

/** Card settings that can be corrected in place. Each correction keeps the earlier one in history. */
export type MetaField = 'since' | 'until' | 'tag' | 'kind';

/**
 * Corrects when a card started or ended, its sub-type or its kind ("I typed 2000, it was 2001").
 * The earlier setting is kept as a revision, so its meaning is never lost. Unchanged values record nothing.
 */
export function correctMeta(p: Profile, id: string, key: MetaField, value: string, now = new Date().toISOString()): boolean {
  const c = byId(p, id);
  if (!c) return false;
  const v = key === 'kind' ? value.trim() : value;
  const old = (c[key] ?? '') as string;
  if (v === old || (key === 'kind' && !v) || (key === 'until' && c.status === 'active')) return false;
  c.revisions.push({ field: key, value: old, at: now });
  if (v) c[key] = v; else if (key === 'since') c.since = ''; else if (key === 'until') delete c.until; else if (key === 'tag') delete c.tag;
  return true;
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
  const linked = new Set(linksOf(p, c.id).map(x => x.other.id));
  return p.cards
    .filter(o => o.id !== c.id && !linked.has(o.id) && o.id !== c.replaces && o.id !== c.replacedBy)
    .filter(o => contextOverlap(c, o) !== 'none')
    .sort((x, y) => Number(isMany(x.area, x.kind)) - Number(isMany(y.area, y.kind))
      || Number(x.area === c.area) - Number(y.area === c.area))
    .slice(0, limit);
}

/** Notes keep the person's line breaks and earlier wording. */
export function setNote(p: Profile, id: string, note: string, now = new Date().toISOString()): boolean {
  const c = byId(p, id);
  if (!c || (c.note ?? '') === note) return false;
  if (c.note) c.revisions.push({ field: 'note', value: c.note, at: now });
  if (note) c.note = note; else delete c.note;
  return true;
}

// ---------- Keepsakes (photos and documents on a card) ----------
// Keepsakes are never deleted: removing or replacing one only marks it, so it can be restored.

export const keepsakeOf = (c: Card | undefined, id: string) => c?.keepsakes?.find(k => k.id === id);
/** Keepsakes currently shown on a card, oldest first. */
export const shownKeepsakes = (c: Card) => (c.keepsakes ?? []).filter(k => !k.removedAt);
/** Removed or replaced keepsakes, newest removal first. */
export const removedKeepsakes = (c: Card) =>
  (c.keepsakes ?? []).filter(k => k.removedAt).sort((a, b) => b.removedAt!.localeCompare(a.removedAt!));

/** The revision field that keeps a keepsake's earlier description. */
export const altField = (keepsakeId: string) => `keepsake:${keepsakeId}:alt`;

export function addKeepsake(p: Profile, cardId: string, k: Keepsake): boolean {
  const c = byId(p, cardId);
  if (!c || keepsakeOf(c, k.id)) return false;
  c.keepsakes = [...(c.keepsakes ?? []), k];
  return true;
}

/** Changes a keepsake's description, keeping the earlier one in the card's history. */
export function setKeepsakeAlt(p: Profile, cardId: string, keepsakeId: string, alt: string, now = new Date().toISOString()): boolean {
  const c = byId(p, cardId);
  const k = keepsakeOf(c, keepsakeId);
  const v = alt.trim();
  if (!c || !k || v === (k.alt ?? '')) return false;
  if (k.alt) c.revisions.push({ field: altField(k.id), value: k.alt, at: now });
  if (v) k.alt = v; else delete k.alt;
  return true;
}

/** Takes a keepsake off the card. It stays in the record and can be restored. */
export function removeKeepsake(p: Profile, cardId: string, keepsakeId: string, now = new Date().toISOString()): boolean {
  const k = keepsakeOf(byId(p, cardId), keepsakeId);
  if (!k || k.removedAt) return false;
  k.removedAt = now;
  return true;
}

/** Puts a removed or replaced keepsake back on the card. */
export function restoreKeepsake(p: Profile, cardId: string, keepsakeId: string): boolean {
  const k = keepsakeOf(byId(p, cardId), keepsakeId);
  if (!k || !k.removedAt) return false;
  delete k.removedAt;
  delete k.replacedBy;
  return true;
}

/** Swaps in a new file. The old one moves to history, pointing at the one that replaced it. */
export function replaceKeepsake(p: Profile, cardId: string, oldId: string, next: Keepsake, now = new Date().toISOString()): boolean {
  const c = byId(p, cardId);
  const old = keepsakeOf(c, oldId);
  if (!c || !old || old.removedAt || keepsakeOf(c, next.id)) return false;
  old.removedAt = now;
  old.replacedBy = next.id;
  c.keepsakes = [...c.keepsakes!, next];
  return true;
}

/** Every keepsake id referenced by any card, removed ones included. */
export const keepsakeIds = (p: Profile) => new Set(p.cards.flatMap(c => (c.keepsakes ?? []).map(k => k.id)));

/** Unknown target endpoints can establish possibility, never certainty. */
export function contextOverlap(c: Card, other: Card) {
 const status = overlap(other, c.since || '0001', c.until || (c.status === 'active' ? new Date().toISOString().slice(0,10) : '9999'));
 return status === 'none' ? status : !c.since || (c.status === 'past' && !c.until) ? 'possible' : status;
}
