// Custom kinds ("Something else…"): their details are defined once and only ever grow.
// Adding another card of the same kind never removes or relabels a detail an earlier card uses.
import { areaById } from './areas';
import { newId } from './cards';
import type { AreaId, CustomKind, Profile } from './types';

type Field = CustomKind['fields'][number];

/** A new, stable detail id. Never positional, so it can't shift onto another detail. */
export const newFieldId = () => 'f-' + newId().slice(0, 8);

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const findCustomKind = (p: Profile, area: AreaId, name: string) =>
  p.kinds?.find(k => k.area === area && sameName(k.name, name));

/**
 * Adds `fields` to the custom kind (creating it if needed): existing details stay exactly as they
 * are; a new detail with the same label as an existing one reuses that one; a new detail whose id is
 * taken by a different detail gets a fresh id. Returns how to remap the new card's field ids.
 */
export function mergeCustomKind(p: Profile, area: AreaId, name: string, fields: Field[]): Record<string, string> {
  p.kinds ??= [];
  let kind = findCustomKind(p, area, name);
  if (!kind) { kind = { area, name, fields: [] }; p.kinds.push(kind); }
  const remap: Record<string, string> = {};
  for (const f of fields) {
    if (!f.label.trim()) continue;
    const byId = kind.fields.find(x => x.id === f.id);
    if (byId && sameName(byId.label, f.label)) continue;
    const byLabel = kind.fields.find(x => sameName(x.label, f.label));
    if (byLabel) { remap[f.id] = byLabel.id; continue; }
    const id = byId ? newFieldId() : f.id;
    if (id !== f.id) remap[f.id] = id;
    kind.fields.push({ id, label: f.label.trim(), type: f.type });
  }
  return remap;
}

/** "detail3" → "Detail 3", "serialNumber" → "Serial number". */
function labelFor(id: string): string {
  const words = id.replace(/^f-[0-9a-f]+$/i, 'Detail').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Detail';
}

/**
 * On load: a card of a custom kind whose detail id isn't in the kind's definition (an older version
 * replaced the definition) gets that detail added back with a readable label, never a raw id.
 */
export function repairCustomKinds(p: Profile): boolean {
  let changed = false;
  for (const c of p.cards) {
    if (!c.fields || areaById(c.area)?.kinds.some(k => k.name === c.kind)) continue;
    const ids = Object.keys(c.fields).filter(k => !k.startsWith('$'));
    if (!ids.length) continue;
    p.kinds ??= [];
    let kind = p.kinds.find(k => k.area === c.area && sameName(k.name, c.kind));
    if (!kind) { kind = { area: c.area, name: c.kind, fields: [] }; p.kinds.push(kind); }
    for (const id of ids) {
      if (kind.fields.some(f => f.id === id)) continue;
      kind.fields.push({ id, label: labelFor(id), type: /^\d{4}(-\d{2}(-\d{2})?)?$/.test(c.fields[id]) ? 'date' : 'text' });
      changed = true;
    }
  }
  return changed;
}
