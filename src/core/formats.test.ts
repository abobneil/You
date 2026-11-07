import { describe, expect, it } from 'vitest';
import { FORMATS, reformat } from './formats';

const { phone, ssn, email, upper } = FORMATS;

describe('phone', () => {
  it('formats US numbers as they are typed', () => {
    expect(phone.apply('9')).toBe('(9');
    expect(phone.apply('9194')).toBe('(919) 4');
    expect(phone.apply('9194498')).toBe('(919) 449-8');
    expect(phone.apply('9194498524')).toBe('(919) 449-8524');
  });
  it('tidies pasted numbers', () => {
    expect(phone.apply('919.449.8524')).toBe('(919) 449-8524');
    expect(phone.apply('(919) 449 8524')).toBe('(919) 449-8524');
    expect(phone.apply('+1 919-449-8524')).toBe('+1 (919) 449-8524');
    expect(phone.apply('19194498524')).toBe('+1 (919) 449-8524');
  });
  it('keeps extensions and international numbers', () => {
    expect(phone.apply('9194498524123')).toBe('(919) 449-8524 x123');
    expect(phone.apply('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });
  it('is stable when applied twice', () => {
    for (const s of ['9194498524', '+1 919 449 8524', '+44 20 7946 0958', '91944985241']) expect(phone.apply(phone.apply(s))).toBe(phone.apply(s));
  });
  it('warns about short numbers, never blocks', () => {
    expect(phone.check('(919) 449-85')).toMatch(/10 digits/);
    expect(phone.check('(919) 449-8524')).toBe('');
    expect(phone.check('+1 (919) 449-8524')).toBe('');
    expect(phone.check('+44 20')).toMatch(/short/);
  });
});

describe('other formats', () => {
  it('Social Security numbers', () => {
    expect(ssn.apply('123456789')).toBe('123-45-6789');
    expect(ssn.apply('1234')).toBe('123-4');
    expect(ssn.apply('123-45-67899999')).toBe('123-45-6789');
    expect(ssn.check('123-45')).toMatch(/9 digits/);
  });
  it('email', () => {
    expect(email.apply(' neil @example.com ')).toBe('neil@example.com');
    expect(email.check('neil@example')).toMatch(/email/);
    expect(email.check('neil@example.com')).toBe('');
  });
  it('uppercase IDs', () => {
    expect(upper.apply('x12345678')).toBe('X12345678');
  });
});

describe('cursor', () => {
  it('stays after the same digit when punctuation is added', () => {
    // Typing the 4th digit at the end: cursor goes to the end.
    expect(reformat(phone, '9194', 4)).toEqual({ value: '(919) 4', caret: 7 });
    // Editing in the middle: cursor stays after the 2nd digit.
    const r = reformat(phone, '(919) 449-8524', 3);
    expect(r.value.slice(0, r.caret)).toBe('(91');
  });
});
