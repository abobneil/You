import { describe, expect, it } from 'vitest';
import { endKey, fmtDate, fuzzyFromParts, startKey } from './dates';

describe('fuzzy dates', () => {
  it('formats a year, a month, or a full date', () => {
    expect(fmtDate('2009')).toBe('2009');
    expect(fmtDate('2021-03')).toBe('Mar 2021');
    expect(fmtDate('2021-03-04')).toBe('Mar 4, 2021');
    expect(fmtDate('')).toBe('');
  });

  it('builds from form parts, dropping what is incomplete', () => {
    expect(fuzzyFromParts('2021', '03', '14')).toBe('2021-03-14');
    expect(fuzzyFromParts('2021', '03', '')).toBe('2021-03');
    expect(fuzzyFromParts('2021', '', '14')).toBe('2021');
    expect(fuzzyFromParts('21', '03', '14')).toBe('');
    expect(fuzzyFromParts('2021', '03', '40')).toBe('2021-03');
    expect(fuzzyFromParts('2021', '03', '7')).toBe('2021-03-07');
  });

  it('compares as the widest range the date could mean', () => {
    expect(startKey('2021')).toBe('2021-01-01');
    expect(startKey('2021-03')).toBe('2021-03-01');
    expect(endKey('2021')).toBe('2021-12-31');
    expect(endKey('2021-03')).toBe('2021-03-31');
    expect(endKey('2021-03-14')).toBe('2021-03-14');
  });
});
