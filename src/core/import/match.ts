// Matching imported cards against what's already there, and adding them.
// Ordinary imports fill missing details. Explicit source snapshots can refresh unchanged imported fields.
import { addCard, correctValue, correctMeta, endCard, reopenCard, setField } from '../cards';
import type { Card, Profile } from '../types';
import type { Proposal } from './types';

export const phoneKey = (s: string) => {
  const d = s.replace(/\D/g, '');
  return s.trim().startsWith('+') ? '+' + d : d.startsWith('00') ? '+' + d.slice(2) : d.length === 10 ? '+1' + d : '+' + d;
};

/** A comparison key, so "(919) 449-8524" matches "919.449.8524" and emails ignore case. */
export function matchKey(p: { area: string; kind: string; value: string }): string {
  const v = p.value.trim();
  if (p.kind === 'Phone' || /phone/i.test(p.kind)) return 'tel:' + phoneKey(v);
  if (p.kind === 'Email') return 'mail:' + v.toLowerCase();
  // People can be filed under different kinds (Friend vs Family member); match on the name alone.
  const scope = p.area === 'people' ? 'people' : `${p.area}/${p.kind}`;
  return scope + ':' + v.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function findMatch(profile: Profile, p: Proposal): Card | undefined {
  if (p.matchId) return profile.cards.find(c => c.id === p.matchId && c.area === p.area);
  if (p.area === 'people') {
    const exact = p.sync && profile.cards.find(c => c.area === 'people' && c.imports?.[p.sync!.source]?.id === p.sync!.id);
    if (exact) return exact;
    // A card imported from this source before, whose email or phone (as imported, before any hand edits) matches.
    const email = p.fields?.email?.trim().toLowerCase(), phone = p.fields?.phone ? phoneKey(p.fields.phone) : '';
    const before = p.sync && profile.cards.find(c => {
      const snap = c.area === 'people' ? c.imports?.[p.sync!.source]?.fields : undefined;
      return !!snap && ((!!email && snap.email?.trim().toLowerCase() === email) || (!!phone && !!snap.phone && phoneKey(snap.phone) === phone));
    });
    if (before) return before;
    return profile.cards.find(c => c.area === 'people' && (
      (!!p.fields?.email && c.fields?.email?.trim().toLowerCase() === p.fields.email.trim().toLowerCase()) ||
      (!!p.fields?.phone && !!c.fields?.phone && phoneKey(c.fields.phone) === phoneKey(p.fields.phone))));
  }
  if (p.sync) {
    const { source, id } = p.sync;
    const exact = profile.cards.find(c => c.area === p.area && c.kind === p.kind && c.imports?.[source]?.id === id);
    if (exact) return exact;
    const title = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const candidates = profile.cards.filter(c => c.area === p.area && c.kind === p.kind && title(c.value) === title(p.value)
      && !c.imports?.[source]
      && (!/^(Netflix|Spotify|Apple Music|YouTube Music)$/.test(source) || !Object.keys(c.imports ?? {}).some(k => /^(Netflix|Spotify|Apple Music|YouTube Music)$/.test(k)))
      && (p.kind !== 'Movie or show' || (!!p.fields?.year && c.fields?.year === p.fields.year))
      && (!['Job', 'Education'].includes(p.kind) || (!!p.since && c.since === p.since))
      && (p.kind !== 'Book' || (!!c.fields?.author && !!p.fields?.author && c.fields.author.toLowerCase() === p.fields.author.toLowerCase()))
      && (p.kind !== 'Book' || (c.fields?.edition ?? '') === (p.fields?.edition ?? '')));
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  const key = matchKey(p);
  return profile.cards.find(c => (c.area === p.area || p.area === 'people') && matchKey(c) === key && (p.kind !== 'Movie or show' || (!!p.fields?.year && c.fields?.year === p.fields.year)) && (!['Job', 'Education'].includes(p.kind) || c.since === p.since) && (p.kind !== 'Book' || (c.fields?.author ?? '').toLowerCase() === (p.fields?.author ?? '').toLowerCase()) && (p.kind !== 'Book' || (c.fields?.edition ?? '') === (p.fields?.edition ?? '')));
}

export type Plan = 'new' | 'fill' | 'update' | 'have';

/**
 * Cards from an earlier import that this proposal replaces (see Proposal.absorbs). Only cards still
 * exactly as imported qualify: the person hasn't touched them in any way (no corrections, links,
 * notes, keepsakes, tags, ended dates or details changed by hand). Touched cards are left alone.
 */
export function absorbable(profile: Profile, p: Proposal): Card[] {
  if (!p.absorbs?.ids.length) return [];
  const ids = new Set(p.absorbs.ids);
  return profile.cards.filter(c => {
    const snap = c.imports?.[p.absorbs!.source];
    if (!snap || !ids.has(snap.id) || c.area !== p.area || c.kind !== p.kind) return false;
    if (c.status !== 'active' || c.replaces || c.replacedBy) return false;
    if (c.note || c.keepsakes?.length || (c.tag && c.tag !== p.tag) || c.revisions?.length) return false;
    if (snap.fields.$value !== undefined && snap.fields.$value !== c.value) return false;
    if (Object.keys(c.imports ?? {}).length > 1) return false;
    const fields = c.fields ?? {};
    const same = Object.keys({ ...fields, ...snap.fields }).filter(k => !k.startsWith('$')).every(k => (fields[k] ?? '') === (snap.fields[k] ?? ''));
    return same && !profile.links.some(l => l.a === c.id || l.b === c.id);
  });
}

export function needsTimeReview(m: Card, p: Proposal): boolean {
  const old = p.sync && m.imports?.[p.sync.source];
  return !!old && (!p.sync!.at || p.sync!.at === old.at) && (p.value !== old.fields.$value || (p.until ?? '') !== (old.fields.$until ?? '') || (p.past ? 'past' : 'active') !== (old.fields.$status === 'current' ? 'active' : old.fields.$status) || Object.entries(p.fields ?? {}).some(([k,v]) => (old.fields[k] ?? '') !== v));
}

const blocked = (m: Card, p: Proposal) => {
  const old = p.sync && m.imports?.[p.sync.source];
  return !!old && (!p.sync!.at ? !p.useIncoming : !!old.at && (p.sync!.at < old.at || (p.sync!.at === old.at && !p.useIncoming)));
};

/**
 * Folds an untouched earlier-import card into the card that replaces it. The card isn't deleted:
 * it moves to history with a note saying where it went, so it can still be found and recovered.
 */
export function foldInto(profile: Profile, c: Card, into: string, now = new Date().toISOString()) {
  const card = profile.cards.find(x => x.id === c.id);
  if (!card) return;
  endCard(profile, card.id, '', now);
  card.note = `Folded into ${into}`;
  // Forget the source id so a later import doesn't treat it as the same item again.
  if (card.imports) {
    card.imports = Object.fromEntries(Object.entries(card.imports).map(([k, v]) => [k, { ...v, id: `folded:${v.id}` }]));
  }
}

export function fieldChanges(m: Card, p: Proposal): [string, string][] {
  const previous = p.sync ? m.imports?.[p.sync.source] : undefined;
  if (blocked(m, p)) return [];
  return Object.entries(p.fields ?? {}).filter(([k, v]) => {
    const current = m.fields?.[k] ?? '';
    if (previous && Object.hasOwn(previous.fields, k)) {
      // A changed or deliberately cleared field belongs to the person now.
      return current === previous.fields[k] && current !== v;
    }
    return !!v && !current;
  });
}

/** What adding this proposal would do. */
export function planFor(profile: Profile, p: Proposal): Plan {
  const plan = basePlan(profile, p);
  return plan === 'have' && absorbable(profile, p).length ? 'update' : plan;
}

function basePlan(profile: Profile, p: Proposal): Plan {
  const m = findMatch(profile, p);
  if (!m) return 'new';
  const previous = p.sync ? m.imports?.[p.sync.source] : undefined;
  if (blocked(m, p)) return needsTimeReview(m, p) ? 'update' : 'have';
  const changes = fieldChanges(m, p);
  // A newer snapshot that changes nothing is "already there": syncing again shouldn't flag every card.
  if ((previous && ((previous.fields.$until ?? '') !== (p.until ?? '') || previous.fields.$status !== (p.past ? 'past' : 'active'))) || (previous?.fields.$value === m.value && p.value !== m.value) || changes.some(([k]) => m.fields?.[k])) return 'update';
  const missing = changes.length > 0 || (!!p.sync && !previous)
    || (!!p.since && !m.since) || (!!p.tag && !m.tag);
  return missing ? 'fill' : 'have';
}

/** Adds or fills in cards. Returns counts for the summary. */
export function applyProposals(profile: Profile, proposals: Proposal[], from: string, now = new Date().toISOString()) {
  let added = 0, filled = 0, updated = 0, merged = 0;
  for (const p of proposals) {
    for (const c of absorbable(profile, p)) { foldInto(profile, c, p.value, now); merged++; }
    const m = findMatch(profile, p);
    if (m) {
      if (blocked(m, p)) continue;
      const plan = planFor(profile, p);
      if (plan === 'have') { if (p.sync && (!m.imports?.[p.sync.source] || p.sync.at > m.imports[p.sync.source].at)) rememberSync(m, p); continue; }
      let changed = false;
      const previous = p.sync ? m.imports?.[p.sync.source] : undefined;
      if (previous) {
        const oldStatus = previous.fields.$status === 'current' ? 'active' : previous.fields.$status;
        const status = p.past ? 'past' : 'active';
        if (m.status === oldStatus && (m.until ?? '') === (previous.fields.$until ?? '')) {
          if (m.status !== status) {
            m.revisions.push({ field: 'status', value: m.status, at: now });
            m.revisions.push({ field: 'until', value: m.until ?? '', at: now });
            if (p.past) { endCard(profile, m.id, p.until ?? '', now); m.until = p.until ?? ''; }
            else reopenCard(profile, m.id);
            changed = true;
          } else if (m.status === 'past') changed = correctMeta(profile, m.id, 'until', p.until ?? '', now) || changed;
        }
        if (m.since === previous.fields.$since && p.since !== undefined) changed = correctMeta(profile, m.id, 'since', p.since, now) || changed;
      }
      if (p.sync && m.imports?.[p.sync.source]?.fields.$value === m.value && p.value !== m.value) changed = correctValue(profile, m.id, p.value, now);
      for (const [k, v] of fieldChanges(m, p)) changed = setField(profile, m.id, k, v, now) || changed;
      if (p.since && !m.since) { m.since = p.since; changed = true; }
      if (p.tag && !m.tag) { m.tag = p.tag; changed = true; }
      if (p.sync) { rememberSync(m, p); changed = true; }
      if (changed) { if (plan === 'update') updated++; else filled++; }
      continue;
    }
    if (!p.value.trim()) continue;
    const c = addCard(profile, { area: p.area, kind: p.kind, value: p.value, since: p.since ?? '', tag: p.tag, fields: p.fields }, undefined, now);
    if (p.past) { c.status = 'past'; c.until = p.until ?? ''; }
    c.source = { from, at: now };
    if (p.sync) rememberSync(c, p);
    added++;
  }
  return { added, filled, updated, merged };
}

function rememberSync(c: Card, p: Proposal) {
  if (!p.sync) return;
  const old = c.imports?.[p.sync.source];
  if (old && (!p.sync.at || (old.at && old.at >= p.sync.at))) return;
  c.imports = { ...c.imports, [p.sync.source]: { id: p.sync.id, at: p.sync.at, fields: { ...p.fields, $value: p.value, $since: p.since ?? '', $until: p.until ?? '', $status: p.past ? 'past' : 'active' } } };
}
