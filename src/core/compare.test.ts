import { it, expect } from 'vitest';
import { combine, compare } from './compare';
import { normalize } from './profile';
it('keeps both conflicting values and complete original snapshots', () => {
  const card = { id: 'c', area: 'about', kind: 'Note', value: 'earlier', status: 'active', revisions: [] };
  const a = normalize({ id: 'you', name: 'A', updatedAt: '2026-01', cards: [card] });
  const b = normalize({ id: 'you', name: 'A', updatedAt: '2026-02', cards: [{ ...card, value: 'later' }, { ...card, id: 'extra', value: 'extra' }] });
  const merged = combine(a,b);
  expect(compare(a,b).changed).toHaveLength(1);
  expect(merged.cards).toHaveLength(2);
  expect(merged.cards[0].value).toBe('later');
  expect(merged.cards[0].revisions.some(r => r.value === 'earlier')).toBe(true);
  expect(JSON.stringify(merged)).toContain('extra');
});
it('preserves unknown fields and malformed cards across repeated normalization', () => {
  const raw = { name: 'A', future: { detail: 'keep' }, cards: [{ strange: 'keep me' }, null] };
  const p = normalize(normalize(raw));
  expect(p.unreadable).toEqual(raw.cards); expect(p.future).toEqual(raw.future);
});
it('never makes the live record contain itself, so it still saves and round-trips', () => {
  const card = { id: 'c', area: 'about', kind: 'Note', value: 'earlier', status: 'active', revisions: [] };
  const live = normalize({ id: 'you', name: 'A', updatedAt: '2026-01', cards: [card], unreadable: [{ odd: 1 }] });
  const other = normalize({ id: 'you', name: 'A', updatedAt: '2026-02', cards: [{ ...card, value: 'later' }] });
  // What the "Combine" button does: the result is assigned onto the open record.
  Object.assign(live, combine(live, other));
  const text = JSON.stringify(live);
  expect(normalize(JSON.parse(text))).toEqual(normalize(live));
  expect(live.unreadable).toContainEqual({ odd: 1 });
  // Combining again keeps working and doesn't nest earlier originals inside new ones.
  Object.assign(live, combine(live, other));
  expect(() => JSON.stringify(live)).not.toThrow();
  const originals = live.unreadable!.filter(u => (u as any).combinedOriginal);
  expect(originals.every(o => !(o as any).combinedOriginal.unreadable)).toBe(true);
});
it('combine keeps the open You’s name, both custom kinds and every detail label (CAP3 path 2)', () => {
  const at = '2026-01-01T00:00:00.000Z';
  const laptop = normalize({ id: 'you', name: 'Alexander', updatedAt: '2026-01', future: 'mine', cards: [
    { id: 'g', area: 'home', kind: 'Gadget', value: 'Laptop', status: 'active', recordedAt: at, revisions: [], fields: { detail1: 'GX-900' } },
    { id: 's', area: 'home', kind: 'Gizmo', value: 'One', status: 'active', recordedAt: at, revisions: [], fields: { serial: 'SN-1' } }],
    kinds: [{ area: 'home', name: 'Gadget', fields: [{ id: 'detail1', label: 'Model number', type: 'text' }] },
      { area: 'home', name: 'Gizmo', fields: [{ id: 'serial', label: 'Serial number', type: 'text' }] }] });
  const phone = normalize({ id: 'you', name: 'Alex', updatedAt: '2026-02', future: 'theirs', cards: [
    { id: 'w', area: 'home', kind: 'Widget', value: 'Phone', status: 'active', recordedAt: at, revisions: [], fields: { detail1: 'Large' } },
    { id: 't', area: 'home', kind: 'Gizmo', value: 'Two', status: 'active', recordedAt: at, revisions: [], fields: { serial: 'Red' } }],
    kinds: [{ area: 'home', name: 'Widget', fields: [{ id: 'detail1', label: 'Size', type: 'text' }] },
      { area: 'home', name: 'Gizmo', fields: [{ id: 'serial', label: 'Colour', type: 'text' }] }] });
  const d = compare(laptop, phone);
  expect(d.other).toEqual(expect.arrayContaining(['Name: Alexander / Alex', 'Kind “Gadget” only in the first copy', 'Kind “Widget” only in the second copy', 'Kind “Gizmo” has different details']));
  const m = normalize(JSON.parse(JSON.stringify(combine(laptop, phone))));
  expect(m.name).toBe('Alexander');
  expect(m.unreadable).toContainEqual(expect.objectContaining({ keptFromOtherCopy: 'name', value: 'Alex' }));
  expect(m.future).toBe('mine');
  expect(m.unreadable).toContainEqual({ keptFromOtherCopy: 'future', value: 'theirs' });
  const label = (cardId: string) => {
    const c = m.cards.find(x => x.id === cardId)!, k = m.kinds!.find(x => x.area === c.area && x.name === c.kind)!;
    return Object.entries(c.fields!).map(([id, v]) => `${k.fields.find(f => f.id === id)?.label}: ${v}`);
  };
  expect(label('g')).toEqual(['Model number: GX-900']);
  expect(label('w')).toEqual(['Size: Large']);
  expect(label('s')).toEqual(['Serial number: SN-1']);
  expect(label('t')).toEqual(['Colour: Red']);
});
