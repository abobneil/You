// Matching imported cards against what's already there, and adding them.
// Ordinary imports fill missing details. Explicit source snapshots can refresh unchanged imported fields.
import { addCard, removeCard, setField } from '../cards';
import type { Card, Profile } from '../types';
import type { Proposal } from './types';

const digits = (s: string) => s.replace(/\D/g, '');

/** A comparison key, so "(919) 449-8524" matches "919.449.8524" and emails ignore case. */
export function matchKey(p: { area: string; kind: string; value: string }): string {
  const v = p.value.trim();
  if (p.kind === 'Phone' || /phone/i.test(p.kind)) return 'tel:' + digits(v).slice(-10);
  if (p.kind === 'Email') return 'mail:' + v.toLowerCase();
  // People can be filed under different kinds (Friend vs Family member); match on the name alone.
  const scope = p.area === 'people' ? 'people' : `${p.area}/${p.kind}`;
  return scope + ':' + v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findMatch(profile: Profile, p: Proposal): Card | undefined {
  if (p.sync) {
    const { source, id } = p.sync;
    const exact = profile.cards.find(c => c.area === p.area && c.kind === p.kind && c.imports?.[source]?.id === id);
    if (exact) return exact;
    const title = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const candidates = profile.cards.filter(c => c.area === p.area && c.kind === p.kind && title(c.value) === title(p.value)
      && !c.imports?.[source]
      && (!c.fields?.author || !p.fields?.author || c.fields.author.toLowerCase() === p.fields.author.toLowerCase()));
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  const key = matchKey(p);
  return profile.cards.find(c => (c.area === p.area || p.area === 'people') && matchKey(c) === key);
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
    const same = Object.keys({ ...fields, ...snap.fields }).every(k => (fields[k] ?? '') === (snap.fields[k] ?? ''));
    return same && !c.revisions?.length && !profile.links.some(l => l.a === c.id || l.b === c.id);
  });
}

function fieldChanges(m: Card, p: Proposal): [string, string][] {
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
  if (changes.some(([k]) => m.fields?.[k])) return 'update';
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
      if (plan === 'have') continue;
      let changed = false;
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
  c.imports = { ...c.imports, [p.sync.source]: { id: p.sync.id, at: p.sync.at, fields: { ...p.fields } } };
}
