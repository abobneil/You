// Matching imported cards against what's already there, and adding them.
// Same card already present → fill in only the details it's missing (never overwrite).
import { addCard, setField } from '../cards';
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
  const key = matchKey(p);
  return profile.cards.find(c => (c.area === p.area || p.area === 'people') && matchKey(c) === key);
}

export type Plan = 'new' | 'fill' | 'have';

/** What adding this proposal would do. */
export function planFor(profile: Profile, p: Proposal): Plan {
  const m = findMatch(profile, p);
  if (!m) return 'new';
  const missing = Object.entries(p.fields ?? {}).some(([k, v]) => v && !m.fields?.[k])
    || (!!p.since && !m.since) || (!!p.tag && !m.tag);
  return missing ? 'fill' : 'have';
}

/** Adds or fills in cards. Returns counts for the summary. */
export function applyProposals(profile: Profile, proposals: Proposal[], from: string, now = new Date().toISOString()) {
  let added = 0, filled = 0;
  for (const p of proposals) {
    const m = findMatch(profile, p);
    if (m) {
      let changed = false;
      for (const [k, v] of Object.entries(p.fields ?? {})) if (v && !m.fields?.[k]) changed = setField(profile, m.id, k, v, now) || changed;
      if (p.since && !m.since) { m.since = p.since; changed = true; }
      if (p.tag && !m.tag) { m.tag = p.tag; changed = true; }
      if (changed) filled++;
      continue;
    }
    if (!p.value.trim()) continue;
    const c = addCard(profile, { area: p.area, kind: p.kind, value: p.value, since: p.since ?? '', tag: p.tag, fields: p.fields }, undefined, now);
    if (p.past) { c.status = 'past'; c.until = p.until ?? ''; }
    c.source = { from, at: now };
    added++;
  }
  return { added, filled };
}
