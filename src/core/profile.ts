import { isAreaId } from './areas';
import { newId } from './cards';
import type { Card, Profile } from './types';

export const emptyProfile = (): Profile => ({ name: '', cards: [], links: [] });

/**
 * Accepts anything that might be a profile (from storage or a file) and returns a valid one.
 * Also upgrades the very first prototype's format, which stored simple fields per area.
 */
export function normalize(raw: unknown): Profile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const p: Profile = {
    ...(typeof r.id === 'string' && r.id ? { id: r.id } : {}),
    name: typeof r.name === 'string' ? r.name : '',
    cards: Array.isArray(r.cards) ? r.cards.filter(isCard).map(c => ({ ...c, note: typeof c.note === 'string' ? c.note : undefined, revisions: c.revisions ?? [] })) : [],
    links: Array.isArray(r.links) ? r.links.filter((l: any) => l && l.id && l.a && l.b) : [],
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
  };
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

function isCard(c: any): c is Card {
  return c && typeof c.id === 'string' && isAreaId(c.area) && typeof c.kind === 'string'
    && typeof c.value === 'string' && (c.status === 'active' || c.status === 'past');
}
