import { isAreaId } from './areas';
import { newId } from './cards';
import { splitKeepsakes } from './keepsakes';
import { repairCustomKinds } from './customKinds';
import type { Card, Link, Profile } from './types';

export const emptyProfile = (): Profile => ({ name: '', cards: [], links: [] });

/**
 * Accepts anything that might be a profile (from storage or a file) and returns a valid one.
 * Also upgrades the very first prototype's format, which stored simple fields per area.
 */
export function normalize(raw: unknown): Profile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const { areas: legacyAreas, ...future } = r;
  // Anything that can't be understood is moved here, encrypted with the rest, never dropped.
  const unreadable: unknown[] = [...(Array.isArray(r.unreadable) ? r.unreadable : [])];
  const cards: Card[] = [];
  for (const c of Array.isArray(r.cards) ? r.cards : []) {
    if (isCard(c)) cards.push(normalizeCard(c, unreadable)); else unreadable.push(c);
  }
  let kinds: unknown[] | undefined;
  if ('kinds' in r && r.kinds !== undefined) {
    const list = Array.isArray(r.kinds) ? r.kinds : [r.kinds];
    kinds = list.filter(isKind);
    for (const k of list) if (!isKind(k)) unreadable.push({ from: 'kinds', value: k });
  }
  const links: Link[] = [];
  if ('links' in r && r.links !== undefined) {
    for (const l of Array.isArray(r.links) ? r.links : [r.links]) {
      if (isLink(l)) links.push(l); else unreadable.push({ from: 'links', value: l });
    }
  }
  const p: Profile = {
    ...future,
    ...(kinds ? { kinds: kinds as Profile['kinds'] } : {}),
    unreadable,
    ...(typeof r.id === 'string' && r.id ? { id: r.id } : {}),
    name: typeof r.name === 'string' ? r.name : '',
    cards,
    links,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
  };
  if (!p.unreadable?.length) delete p.unreadable;
  delete (p as any).areas;
  // A detail whose definition an older version dropped is added back with a readable label.
  repairCustomKinds(p);
  if (r.areas && typeof r.areas === 'object') {
    for (const [area, rows] of Object.entries(r.areas as Record<string, { label?: string; value?: string }[]>)) {
      if (!isAreaId(area) || !Array.isArray(rows)) continue;
      for (const row of rows) {
        const value = (row?.value ?? '').trim();
        if (!value) continue;
        p.cards.push({ id: newId(), area, kind: row.label || 'Note', value, since: '', status: 'active',
          recordedAt: p.updatedAt || new Date().toISOString(), revisions: [] });
      }
    }
  }
  return p;
}

function normalizeCard(c: Card, unreadable: unknown[]): Card {
  const out: Card = { ...c, note: typeof c.note === 'string' ? c.note : undefined, revisions: Array.isArray(c.revisions) ? c.revisions : [] };
  if (c.note !== undefined && c.note !== null && typeof c.note !== 'string') unreadable.push({ from: 'note', card: c.id, value: c.note });
  if (c.revisions !== undefined && c.revisions !== null && !Array.isArray(c.revisions)) unreadable.push({ from: 'revisions', card: c.id, value: c.revisions });
  const ks = splitKeepsakes(c.keepsakes);
  for (const k of ks.bad) unreadable.push({ from: 'keepsakes', card: c.id, value: k });
  if (ks.ok) out.keepsakes = ks.ok; else delete out.keepsakes;
  if (out.note === undefined) delete out.note;
  return out;
}

const isKind = (k: any) => !!k && isAreaId(k.area) && typeof k.name === 'string' && Array.isArray(k.fields);
const isLink = (l: any): l is Link => !!l && typeof l.id === 'string' && !!l.id && typeof l.a === 'string' && !!l.a && typeof l.b === 'string' && !!l.b;

function isCard(c: any): c is Card {
  return c && typeof c.id === 'string' && isAreaId(c.area) && typeof c.kind === 'string'
    && typeof c.value === 'string' && (c.status === 'active' || c.status === 'past');
}
