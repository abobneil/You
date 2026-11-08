import { describe, expect, it } from 'vitest';
import { keyOf, sameKey } from './focusMemory';

type Fake = { tagName: string; id: string; dataset: Record<string, string>; parentElement: ReturnType<typeof parent> | null };
const parent = (date?: string) => ({
  tagName: 'SPAN', id: '', dataset: {}, parentElement: null,
  closest: (sel: string) => (date && sel === '[data-date]' ? { tagName: 'SPAN', id: '', dataset: { date }, parentElement: null } : null),
});
const el = (tagName: string, dataset: Record<string, string> = {}, id = '', date?: string): Fake =>
  ({ tagName, id, dataset, parentElement: parent(date) });

describe('focus memory across redraws', () => {
  it('matches an element by id', () => {
    expect(sameKey(keyOf(el('INPUT', {}, 'c-value')), keyOf(el('INPUT', { act: 'x' }, 'c-value')))).toBe(true);
  });

  it('matches a redrawn control by its data-act and data-* values', () => {
    const before = keyOf(el('BUTTON', { act: 'mode', mode: 'r:abc' }));
    expect(sameKey(before, keyOf(el('BUTTON', { mode: 'r:abc', act: 'mode' })))).toBe(true);
    expect(sameKey(before, keyOf(el('BUTTON', { act: 'mode', mode: 'add' })))).toBe(false);
  });

  it('ignores values that change while it stays the same control (a month button\'s chosen month)', () => {
    expect(sameKey(keyOf(el('BUTTON', { d: 'm', value: '03' }, '', 'since')), keyOf(el('BUTTON', { d: 'm', value: '' }, '', 'since')))).toBe(true);
  });

  it('tells apart the same part of two different date fields', () => {
    expect(sameKey(keyOf(el('INPUT', { d: 'y' }, '', 'since')), keyOf(el('INPUT', { d: 'y' }, '', 'until')))).toBe(false);
  });

  it('has no key for an element with nothing stable to recognise it by', () => {
    expect(keyOf(el('BUTTON'))).toBeNull();
    expect(sameKey(null, null)).toBe(false);
  });

  it('never confuses a tag with another tag carrying the same data', () => {
    expect(sameKey(keyOf(el('BUTTON', { act: 'card', id: '1' })), keyOf(el('A', { act: 'card', id: '1' })))).toBe(false);
  });
});
