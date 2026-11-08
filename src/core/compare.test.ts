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
