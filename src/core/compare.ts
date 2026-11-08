import type { Profile, Card } from './types';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function compare(a: Profile, b: Profile) {
  const aa = new Map(a.cards.map(c => [c.id, c])), bb = new Map(b.cards.map(c => [c.id, c]));
  return { onlyA: a.cards.filter(c => !bb.has(c.id)), onlyB: b.cards.filter(c => !aa.has(c.id)), changed: a.cards.filter(c => bb.has(c.id) && !same(c, bb.get(c.id))).map(c => [c, bb.get(c.id)!] as const) };
}
/** Keep complete conflicting snapshots as well as earlier wording, including unknown fields. */
export function combine(a: Profile, b: Profile): Profile {
  if (a.id !== b.id) throw new Error('Choose two versions of the same You');
  const newerB = (b.updatedAt || '') > (a.updatedAt || '');
  const cards = new Map(a.cards.map(c => [c.id, structuredClone(c)]));
  for (const c of b.cards) {
    const old = cards.get(c.id);
    if (!old) { cards.set(c.id, structuredClone(c)); continue; }
    if (same(old, c)) continue;
    const current: Card = structuredClone(newerB ? c : old), other = newerB ? old : c;
    current.revisions = [...current.revisions, ...other.revisions,
      { value: other.value, at: new Date().toISOString() },
      { field: 'combined-copy', value: JSON.stringify(other), at: new Date().toISOString() }];
    current.keepsakes = [...new Map([...(old.keepsakes || []), ...(c.keepsakes || [])].map(k => [k.id, k])).values()];
    cards.set(c.id, current);
  }
  return { ...a, ...b, cards: [...cards.values()], links: [...new Map([...a.links, ...b.links].map(l => [l.id, l])).values()],
    unreadable: [...(a.unreadable || []), ...(b.unreadable || []), { combinedOriginal: a }, { combinedOriginal: b }],
    updatedAt: new Date().toISOString(), rev: Math.max(a.rev || 0, b.rev || 0) + 1 };
}
