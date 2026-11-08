// Matching imported cards against what's already there, and adding them.
// Ordinary imports fill missing details. Explicit source snapshots can refresh unchanged imported fields.
import { addCard, correctValue, removeCard, setField } from '../cards';
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
      && (p.kind !== 'Book' || (!!c.fields?.author && !!p.fields?.author && c.fields.author.toLowerCase() === p.fields.author.toLowerCase()))
      && (p.kind !== 'Book' || (c.fields?.edition ?? '') === (p.fields?.edition ?? '')));
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  const key = matchKey(p);
  return profile.cards.find(c => (c.area === p.area || p.area === 'people') && matchKey(c) === key && (p.kind !== 'Book' || (c.fields?.author ?? '').toLowerCase() === (p.fields?.author ?? '').toLowerCase()) && (p.kind !== 'Book' || (c.fields?.edition ?? '') === (p.fields?.edition ?? '')));
}

export type Plan = 'new' | 'fill' | 'update' | 'have';

/**
 * Cards from an earlier import that this proposal replaces (see Proposal.absorbs). Only cards still
 * exactly as imported qualify: no corrections, links, or details changed by hand.
 */
export function absorbable(profile: Profile, p: Proposal): Card[] {
  if (!p.absorbs?.ids.length) return [];
  const ids = new Set(p.absorbs.ids);
  return profile.cards.filter(c => {
    const snap = c.imports?.[p.absorbs!.source];
    if (!snap || !ids.has(snap.id) || c.area !== p.area || c.kind !== p.kind) return false;
    const fields = c.fields ?? {};
    const same = Object.keys({ ...fields, ...snap.fields }).filter(k => k !== '$value').every(k => (fields[k] ?? '') === (snap.fields[k] ?? ''));
    return same && !c.revisions?.length && !profile.links.some(l => l.a === c.id || l.b === c.id);
  });
}

export function fieldChanges(m: Card, p: Proposal): [string, string][] {
  const previous = p.sync ? m.imports?.[p.sync.source] : undefined;
  if (previous && p.sync!.at <= previous.at) return [];
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
  if (previous && p.sync!.at <= previous.at) return 'have';
  const changes = fieldChanges(m, p);
  // A newer snapshot that changes nothing is "already there": syncing again shouldn't flag every card.
  if ((previous?.fields.$value === m.value && p.value !== m.value) || changes.some(([k]) => m.fields?.[k])) return 'update';
  const missing = changes.length > 0 || (!!p.sync && !previous)
    || (!!p.since && !m.since) || (!!p.tag && !m.tag);
  return missing ? 'fill' : 'have';
}

/** Adds or fills in cards. Returns counts for the summary. */
export function applyProposals(profile: Profile, proposals: Proposal[], from: string, now = new Date().toISOString()) {
  let added = 0, filled = 0, updated = 0, merged = 0;
  for (const p of proposals) {
    for (const c of absorbable(profile, p)) { removeCard(profile, c.id); merged++; }
    const m = findMatch(profile, p);
    if (m) {
      const plan = planFor(profile, p);
      if (plan === 'have') { if (p.sync && (!m.imports?.[p.sync.source] || p.sync.at > m.imports[p.sync.source].at)) rememberSync(m, p); continue; }
      let changed = false;
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
  c.imports = { ...c.imports, [p.sync.source]: { id: p.sync.id, at: p.sync.at, fields: { ...p.fields, $value: p.value } } };
}
