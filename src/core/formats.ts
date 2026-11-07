// Formatting applied while a value is typed, chosen by the kind of card (see Kind.format in areas.ts).
// Each format cleans up what's typed and can return a gentle warning. Warnings never block saving.

export type FormatId = 'phone' | 'ssn' | 'email' | 'upper' | 'zip' | 'money' | 'year' | 'vin' | 'number';

export interface Format {
  /** Turns whatever was typed or pasted into the tidy form. Must be idempotent. */
  apply(raw: string): string;
  /** A friendly note if the value looks wrong, or '' if it's fine. */
  check(value: string): string;
  /** Characters that carry meaning, used to keep the cursor in place while reformatting. */
  significant: RegExp;
  inputMode?: 'tel' | 'email' | 'numeric' | 'decimal' | 'text';
  autocomplete?: string;
}

const digits = (s: string) => s.replace(/\D/g, '');

/**
 * US numbers: (919) 449-8524, +1 (919) 449-8524, (919) 449-8524 x12.
 * Numbers starting with + and another country code are kept as typed (digits and spaces only),
 * since grouping differs by country.
 */
function phone(raw: string): string {
  const t = raw.trimStart();
  if (t.startsWith('+') && !t.startsWith('+1')) return '+' + t.slice(1).replace(/[^\d ]/g, '').replace(/ {2,}/g, ' ');
  let d = digits(t);
  let cc = '';
  if (t.startsWith('+1') || (d.length > 10 && d[0] === '1')) { cc = '+1 '; d = d.slice(1); }
  const ext = d.slice(10);
  d = d.slice(0, 10);
  let out = '';
  if (d.length > 6) out = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  else if (d.length > 3) out = `(${d.slice(0, 3)}) ${d.slice(3)}`;
  else if (d.length) out = `(${d}`;
  if (ext) out += ` x${ext}`;
  return (cc + out).trimEnd();
}

export const FORMATS: Record<FormatId, Format> = {
  phone: {
    apply: phone,
    check: v => {
      if (!v) return '';
      if (v.startsWith('+') && !v.startsWith('+1')) return digits(v).length < 7 ? 'That looks a little short.' : '';
      return digits(v).replace(/^1(?=\d{10})/, '').length < 10 ? 'US numbers have 10 digits. Start with + for numbers outside the US.' : '';
    },
    significant: /\d/,
    inputMode: 'tel',
    autocomplete: 'tel',
  },
  ssn: {
    apply: raw => {
      const d = digits(raw).slice(0, 9);
      if (d.length > 5) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
      if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
      return d;
    },
    check: v => (v && digits(v).length !== 9 ? 'Social Security numbers have 9 digits.' : ''),
    significant: /\d/,
    inputMode: 'numeric',
    autocomplete: 'off',
  },
  email: {
    apply: raw => raw.replace(/\s+/g, ''),
    check: v => (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? 'That doesn’t look like an email address yet.' : ''),
    significant: /\S/,
    inputMode: 'email',
    autocomplete: 'email',
  },
  upper: {
    apply: raw => raw.toUpperCase(),
    check: () => '',
    significant: /[A-Za-z0-9]/,
    autocomplete: 'off',
  },
  zip: {
    apply: raw => { const d = digits(raw).slice(0, 9); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; },
    check: v => (v && ![5, 9].includes(digits(v).length) ? 'ZIP codes have 5 digits (or 9).' : ''),
    significant: /\d/,
    inputMode: 'numeric',
    autocomplete: 'postal-code',
  },
  /** $1,234.56 — digits and one decimal point, up to cents. */
  money: {
    apply: raw => {
      const clean = raw.replace(/[^\d.]/g, '');
      if (!clean) return '';
      const [whole, ...rest] = clean.split('.');
      const cents = rest.length ? '.' + rest.join('').slice(0, 2) : '';
      const w = (whole.replace(/^0+(?=\d)/, '') || (cents ? '0' : '')).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return '$' + w + cents;
    },
    check: () => '',
    significant: /[\d.]/,
    inputMode: 'decimal',
  },
  year: {
    apply: raw => digits(raw).slice(0, 4),
    check: v => (v && (v.length !== 4 || +v < 1800 || +v > 2200) ? 'Enter a 4-digit year.' : ''),
    significant: /\d/,
    inputMode: 'numeric',
  },
  /** Vehicle identification numbers: 17 letters and digits, never I, O or Q. */
  vin: {
    apply: raw => raw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17),
    check: v => (v && v.length !== 17 ? 'VINs have 17 letters and numbers.' : ''),
    significant: /[A-Za-z0-9]/,
    autocomplete: 'off',
  },
  number: {
    apply: raw => raw.replace(/[^\d.,]/g, ''),
    check: () => '',
    significant: /[\d.]/,
    inputMode: 'decimal',
  },
};

/**
 * Reformats while keeping the cursor after the same meaningful character it was after.
 * Returns the new text and where the cursor should go.
 */
export function reformat(f: Format, raw: string, caret: number): { value: string; caret: number } {
  const value = f.apply(raw);
  let want = 0;
  for (let i = 0; i < Math.min(caret, raw.length); i++) if (f.significant.test(raw[i])) want++;
  let pos = 0, seen = 0;
  while (pos < value.length && seen < want) { if (f.significant.test(value[pos])) seen++; pos++; }
  // If the cursor was at the very end, keep it at the end.
  if (caret >= raw.length) pos = value.length;
  return { value, caret: pos };
}

/**
 * Hides a sensitive value but keeps its shape and last 4 letters or digits, so you can tell
 * them apart: "123-45-6789" → "•••-••-6789". Values with 4 or fewer show only dots.
 */
export function maskValue(v: string, keep = 4): string {
  const total = (v.match(/[A-Za-z0-9]/g) ?? []).length;
  const show = total > keep ? keep : 0;
  let seen = 0;
  return v.replace(/[A-Za-z0-9]/g, ch => (++seen > total - show ? ch : '•'));
}
