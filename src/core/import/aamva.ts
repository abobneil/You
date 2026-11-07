// The barcode on the back of every US and Canadian driver's license (AAMVA standard, PDF417).
// Decoding happens on the device; this turns the barcode's text into cards.
import { fmtDate } from '../dates';
import { FORMATS } from '../formats';
import type { FuzzyDate } from '../types';
import { rowId, tidyCase } from './parse';
import type { ImportResult, ImportRow } from './types';

export interface License {
  first: string; middle: string; last: string; suffix: string;
  birthday: FuzzyDate; issued: FuzzyDate; expires: FuzzyDate;
  number: string; state: string; licenseClass: string; restrictions: string; endorsements: string;
  street: string; unit: string; city: string; zip: string; country: string;
}

/** AAMVA dates are MMDDYYYY in the US and YYYYMMDD in Canada. */
function aamvaDate(s: string, country: string): FuzzyDate {
  const d = s.replace(/\D/g, '');
  if (d.length !== 8) return '';
  const yearFirst = country === 'CAN' || (+d.slice(0, 4) >= 1900 && +d.slice(0, 4) <= 2100);
  const [y, m, day] = yearFirst ? [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)] : [d.slice(4, 8), d.slice(0, 2), d.slice(2, 4)];
  return +m >= 1 && +m <= 12 && +day >= 1 && +day <= 31 ? `${y}-${m}-${day}` : '';
}

export function isAamva(text: string) { return /ANSI |AAMVA/.test(text.slice(0, 40)) || /\nDAQ/.test(text); }

export function parseAamva(text: string): License | null {
  if (!isAamva(text)) return null;
  const el: Record<string, string> = {};
  // Elements are 3-letter codes at the start of a line (some states separate with \r, \x1e or \x1d).
  for (const line of text.split(/[\n\r\x1e\x1d]+/)) {
    const m = line.match(/(?:^|DL|ID)(D[A-Z]{2}|Z[A-Z]{2})(.*)$/);
    if (m && !(m[1] in el)) el[m[1]] = m[2].trim();
  }
  const country = (el.DCG || 'USA').toUpperCase();
  // Older cards put the whole name in DAA: "LAST,FIRST,MIDDLE".
  let [last, first, middle] = [el.DCS || '', el.DAC || el.DCT || '', el.DAD || ''];
  if (!last && el.DAA) [last = '', first = '', middle = ''] = el.DAA.split(/[,$]/).map(s => s.trim());
  const none = (s = '') => (/^(NONE|N\/?A|unavl)$/i.test(s) ? '' : s);
  return {
    first: tidyCase(none(first)), middle: tidyCase(none(middle)), last: tidyCase(none(last)), suffix: tidyCase(none(el.DCU)),
    birthday: aamvaDate(el.DBB || '', country), issued: aamvaDate(el.DBD || '', country), expires: aamvaDate(el.DBA || '', country),
    number: (el.DAQ || '').toUpperCase(), state: (el.DAJ || '').toUpperCase(),
    licenseClass: none(el.DCA).toUpperCase(), restrictions: none(el.DCB), endorsements: none(el.DCD),
    street: tidyCase(el.DAG || ''), unit: tidyCase(el.DAH || ''), city: tidyCase(el.DAI || ''),
    zip: FORMATS.zip.apply((el.DAK || '').replace(/0000$/, '')), country,
  };
}

export function licenseRows(l: License): ImportResult {
  const full = [l.first, l.middle, l.last, l.suffix].filter(Boolean).join(' ');
  const keep = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
  const rows: ImportRow[] = [];
  if (full) rows.push({ id: rowId('dl'), group: 'From your license', label: full, sub: 'Full name',
    build: () => [{ area: 'about', kind: 'Full name', value: full, fields: keep({ first: l.first, middle: l.middle, last: l.last, suffix: l.suffix }) }] });
  if (l.birthday) rows.push({ id: rowId('dl'), group: 'From your license', label: fmtDate(l.birthday), sub: 'Birthday',
    build: () => [{ area: 'about', kind: 'Birthday', value: fmtDate(l.birthday), since: l.birthday }] });
  if (l.number) rows.push({ id: rowId('dl'), group: 'From your license', label: `${l.state} license`, sub: [l.licenseClass && `Class ${l.licenseClass}`, l.expires && `expires ${fmtDate(l.expires)}`].filter(Boolean).join(' · '),
    build: () => [{ area: 'about', kind: "Driver's license", value: l.number, since: l.issued,
      fields: keep({ state: l.state, class: l.licenseClass, restrictions: [l.restrictions, l.endorsements].filter(Boolean).join(', '), issued: l.issued, expires: l.expires }) }] });
  if (l.street) rows.push({ id: rowId('dl'), group: 'From your license', label: [l.street, l.unit].filter(Boolean).join(' '), sub: `Address · ${l.city}, ${l.state}`,
    build: () => [{ area: 'home', kind: 'Address', value: [l.street, l.unit].filter(Boolean).join(' '),
      fields: keep({ street: l.street, unit: l.unit, city: l.city, state: l.state, zip: l.zip }) }] });
  return { rows, notes: rows.length ? ['The address on a license can be out of date. Untick it if you’ve moved since.'] : ['That barcode didn’t have license details in it.'] };
}
