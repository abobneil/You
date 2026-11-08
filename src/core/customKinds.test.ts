import { describe, expect, it } from 'vitest';
import { addCard } from './cards';
import { mergeCustomKind, newFieldId, repairCustomKinds } from './customKinds';
import { emptyProfile, normalize } from './profile';

describe('custom kinds only grow (CAP3 path 3)', () => {
  it('a second card of the same kind keeps the first card’s details and labels', () => {
    const p = { ...emptyProfile(), name: 'A' };
    const serial = newFieldId();
    mergeCustomKind(p, 'home', 'Gizmo', [{ id: serial, label: 'Serial number', type: 'text' }]);
    const first = addCard(p, { area: 'home', kind: 'Gizmo', value: 'One', since: '', fields: { [serial]: 'SN-12345' } });
    const colour = newFieldId();
    expect(mergeCustomKind(p, 'home', 'gizmo', [{ id: colour, label: 'Colour', type: 'text' }])).toEqual({});
    expect(mergeCustomKind(p, 'home', 'Gizmo', [])).toEqual({});
    expect(p.kinds).toEqual([{ area: 'home', name: 'Gizmo', fields: [
      { id: serial, label: 'Serial number', type: 'text' }, { id: colour, label: 'Colour', type: 'text' }] }]);
    expect(p.kinds![0].fields.find(f => f.id === Object.keys(first.fields!)[0])!.label).toBe('Serial number');
  });
  it('reuses a detail with the same label and renames a clashing id', () => {
    const p = { ...emptyProfile(), name: 'A' };
    mergeCustomKind(p, 'home', 'Gizmo', [{ id: 'detail1', label: 'Serial number', type: 'text' }]);
    expect(mergeCustomKind(p, 'home', 'Gizmo', [{ id: 'x', label: 'serial number', type: 'text' }])).toEqual({ x: 'detail1' });
    const remap = mergeCustomKind(p, 'home', 'Gizmo', [{ id: 'detail1', label: 'Colour', type: 'text' }]);
    expect(remap.detail1).toMatch(/^f-/);
    expect(p.kinds![0].fields.map(f => f.label)).toEqual(['Serial number', 'Colour']);
  });
  it('on load, adds back details a card uses but its kind lost, with readable labels', () => {
    const p = normalize({ name: 'A', kinds: [{ area: 'home', name: 'Gizmo', fields: [{ id: 'detail1', label: 'Colour', type: 'text' }] }],
      cards: [{ id: 'c', area: 'home', kind: 'Gizmo', value: 'One', since: '', status: 'active', recordedAt: '2026', revisions: [], fields: { detail1: 'SN-1', detail2: 'Red', serialNumber: 'x' } },
        { id: 'd', area: 'health', kind: 'Doctor', value: 'Dr', since: '', status: 'active', recordedAt: '2026', revisions: [], fields: { odd: 'kept' } }] });
    expect(p.kinds![0].fields.map(f => f.label)).toEqual(['Colour', 'Detail 2', 'Serial number']);
    expect(p.kinds).toHaveLength(1); // built-in kinds aren't touched
    expect(repairCustomKinds(p)).toBe(false);
  });
});
