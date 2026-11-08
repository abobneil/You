import { describe, expect, it } from 'vitest';
import { FORMATS, maskValue, reformat } from './formats';

const { phone, ssn, email, upper, zip, money, year, vin } = FORMATS;

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

describe('masking sensitive values', () => {
  it('keeps the shape and last 4', () => {
    expect(maskValue('123-45-6789')).toBe('•••-••-6789');
    expect(maskValue('X12345678')).toBe('•••••5678');
    expect(maskValue('NC 123456789')).toBe('•• •••••6789');
  });
  it('shows nothing of very short values', () => {
    expect(maskValue('1234')).toBe('••••');
    expect(maskValue('')).toBe('');
  });
});

describe('detail formats', () => {
  it('ZIP codes', () => {
    expect(zip.apply('27601')).toBe('27601');
    expect(zip.apply('276011234')).toBe('27601-1234');
    expect(zip.check('2760')).toMatch(/5 digits/);
  });
  it('money', () => {
    expect(money.apply('1234567')).toBe('$1,234,567');
    expect(money.apply('$1,234.567')).toBe('$1,234.56');
    expect(money.apply('.5')).toBe('$0.5');
    expect(money.apply('00012')).toBe('$12');
    expect(money.apply('')).toBe('');
    expect(money.apply(money.apply('98000.10'))).toBe('$98,000.10');
  });
  it('years and VINs', () => {
    expect(year.apply('2020abc')).toBe('2020');
    expect(year.check('202')).toMatch(/4-digit/);
    expect(vin.apply('kndcm3lc1l5 3i4oq')).toBe('KNDCM3LC1L534');
    expect(vin.check('KNDCM3LC1L5341234')).toBe('');
    expect(vin.check('KNDC')).toMatch(/17/);
  });
});

describe('whole phone numbers from imports', () => {
  it('tidies numbers whose digits fit and keeps others exactly as written', async () => {
    const { finishPhone } = await import('./formats');
    expect(finishPhone('+1 555 0100')).toBe('+1 555 0100');
    expect(finishPhone('555 0100')).toBe('555 0100');
    expect(finishPhone('919.449.8524')).toBe('(919) 449-8524');
    expect(finishPhone('+1 919 449 8524')).toBe('+1 (919) 449-8524');
    expect(finishPhone('919-449-8524 x12')).toBe('(919) 449-8524 x12');
    expect(finishPhone('9194498524123')).toBe('9194498524123');
    expect(finishPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });
});
