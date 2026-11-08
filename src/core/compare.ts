import type { Profile, Card, CustomKind } from './types';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Top-level fields combine() handles itself; anything else is an unknown (future) field. */
const KNOWN = new Set(['id', 'name', 'cards', 'links', 'kinds', 'unreadable', 'rev', 'updatedAt']);
const kindKey = (k: { area: string; name: string }) => `${k.area}/${k.name.trim().toLowerCase()}`;

/** A preserved item that came from the other copy when two were combined (not something unreadable). */
export const isKeptFromOtherCopy = (u: unknown) =>
  !!u && typeof u === 'object' && ('combinedOriginal' in u || 'keptFromOtherCopy' in u);

export function compare(a: Profile, b: Profile) {
  const aa = new Map(a.cards.map(c => [c.id, c])), bb = new Map(b.cards.map(c => [c.id, c]));
  // Differences outside the cards: the You's name and its custom kinds.
  const other: string[] = [];
  if ((a.name ?? '') !== (b.name ?? '')) other.push(`Name: ${a.name || '(none)'} / ${b.name || '(none)'}`);
  const ka = new Map((a.kinds ?? []).map(k => [kindKey(k), k])), kb = new Map((b.kinds ?? []).map(k => [kindKey(k), k]));
  for (const [key, k] of ka) {
    const o = kb.get(key);
    if (!o) other.push(`Kind “${k.name}” only in the first copy`);
    else if (!same(k.fields, o.fields)) other.push(`Kind “${k.name}” has different details`);
  }
  for (const [key, k] of kb) if (!ka.has(key)) other.push(`Kind “${k.name}” only in the second copy`);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!KNOWN.has(key) && !same(a[key], b[key])) other.push(`Other saved information (“${key}”) differs`);
  }
  return { onlyA: a.cards.filter(c => !bb.has(c.id)), onlyB: b.cards.filter(c => !aa.has(c.id)), changed: a.cards.filter(c => bb.has(c.id) && !same(c, bb.get(c.id))).map(c => [c, bb.get(c.id)!] as const), other };
}

/**
 * Custom kinds from both copies, joined by area and name. When the same kind has different details,
 * the field lists are joined by id; an id that means something different in `b` is renamed, and the
 * returned map says how to remap `b`'s cards of that kind so no card's detail is relabeled.
 */
function combineKinds(a: CustomKind[], b: CustomKind[]) {
  const out = a.map(k => structuredClone(k));
  const remap = new Map<string, Record<string, string>>();
  for (const k of b) {
    const mine = out.find(x => kindKey(x) === kindKey(k));
    if (!mine) { out.push(structuredClone(k)); continue; }
    const ids = new Set(mine.fields.map(f => f.id));
    for (const f of k.fields) {
      const existing = mine.fields.find(x => x.id === f.id);
      if (existing && existing.label === f.label && existing.type === f.type) continue;
      if (!existing) { mine.fields.push({ ...f }); ids.add(f.id); continue; }
      // Same id, different meaning: keep both labels by giving b's field a new id.
      let n = 2, id = `${f.id}-${n}`;
      while (ids.has(id)) id = `${f.id}-${++n}`;
      ids.add(id);
      mine.fields.push({ ...f, id });
      (remap.get(kindKey(k)) ?? remap.set(kindKey(k), {}).get(kindKey(k))!)[f.id] = id;
    }
  }
  return { kinds: out, remap };
}

function remapCard(c: Card, ids: Record<string, string>) {
  if (c.fields) c.fields = Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [ids[k] ?? k, v]));
  c.revisions = c.revisions.map(r => (r.field && ids[r.field] ? { ...r, field: ids[r.field] } : r));
}

/**
 * Keep complete conflicting snapshots as well as earlier wording, including unknown fields.
 * `liveA` is the open You: its name is kept, and a different name in `liveB` is preserved, not lost.
 */
export function combine(liveA: Profile, liveB: Profile): Profile {
  if (liveA.id !== liveB.id) throw new Error('Choose two versions of the same You');
  // Work on copies: the result is assigned onto the live record, so it must never contain it.
  const a = structuredClone(liveA), b = structuredClone(liveB);
  // Each kept original leaves out its own preserved items; those are carried over once, below.
  const original = ({ unreadable: _u, ...rest }: Profile) => structuredClone(rest);
  const kept: unknown[] = [];
  const { kinds, remap } = combineKinds(a.kinds ?? [], b.kinds ?? []);
  for (const c of b.cards) { const ids = remap.get(kindKey({ area: c.area, name: c.kind })); if (ids) remapCard(c, ids); }
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
  // Unknown top-level fields: keep the open You's value, and the other copy's too when it differs.
  const extra: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (KNOWN.has(key)) continue;
    if (!(key in a)) extra[key] = b[key];
    else { extra[key] = a[key]; if (key in b && !same(a[key], b[key])) kept.push({ keptFromOtherCopy: key, value: b[key] }); }
  }
  if ((b.name ?? '') !== (a.name ?? '') && b.name) kept.push({ keptFromOtherCopy: 'name', value: b.name, at: b.updatedAt });
  return { ...extra, id: a.id, name: a.name || b.name, ...(kinds.length ? { kinds } : {}),
    cards: [...cards.values()], links: [...new Map([...a.links, ...b.links].map(l => [l.id, l])).values()],
    unreadable: [...(a.unreadable || []), ...(b.unreadable || []), ...kept, { combinedOriginal: original(a) }, { combinedOriginal: original(b) }],
    updatedAt: new Date().toISOString(), rev: Math.max(a.rev || 0, b.rev || 0) + 1 };
}
