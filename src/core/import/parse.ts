// Small parsing helpers shared by the importers: CSV and the many ways files write dates.
import type { FuzzyDate } from '../types';

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, a BOM at the start. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

/**
 * Rows as objects keyed by header. The header is the first row containing all of `needs`,
 * so notes some exports put above the table (LinkedIn does) are skipped.
 */
export function csvObjects(text: string, needs: string[] = []): Record<string, string>[] {
  const rows = parseCsv(text);
  const norm = (h: string) => h.trim().toLowerCase();
  const at = rows.findIndex(r => needs.every(n => r.map(norm).includes(n.toLowerCase())));
  if (at < 0) return [];
  const head = rows[at].map(h => h.trim());
  return rows.slice(at + 1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** Case-insensitive column lookup. */
export const col = (row: Record<string, string>, ...names: string[]) => {
  for (const n of names) {
    const k = Object.keys(row).find(x => x.toLowerCase() === n.toLowerCase());
    if (k && row[k]) return row[k];
  }
  return '';
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number | string) => String(n).padStart(2, '0');
const validMonth = (m: number) => m >= 1 && m <= 12;
const validDay = (d: number) => d >= 1 && d <= 31;

/**
 * Turns the date styles exports use into a fuzzy date ("2018", "2018-03", "2018-03-14"):
 * 2018 · 2018-03-14 · 2018/03/14 · 20180314 · Jan 2018 · Mar 15, 2021 · 15 Mar 2021 · 3/15/2021 · 3/15/21 · 2018-03-14T10:00Z.
 * Unknown formats give ''.
 */
export function looseDate(input: string): FuzzyDate {
  const s = input.trim();
  if (!s) return '';
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})$/))) return m[1];
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/))) {
    const [y, mo, d] = [m[1], +m[2], m[3] ? +m[3] : 0];
    if (!validMonth(mo)) return y;
    return d && validDay(d) ? `${y}-${pad(mo)}-${pad(d)}` : `${y}-${pad(mo)}`;
  }
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/)) && validMonth(+m[2]) && validDay(+m[3])) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})$/))) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    if (!mo) return m[3];
    return m[2] ? `${m[3]}-${pad(mo)}-${pad(m[2])}` : `${m[3]}-${pad(mo)}`;
  }
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/))) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    return mo ? `${m[3]}-${pad(mo)}-${pad(m[1])}` : m[3];
  }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
    let y = +m[3];
    if (m[3].length === 2) y += y > 40 ? 1900 : 2000;
    if (validMonth(+m[1]) && validDay(+m[2])) return `${y}-${pad(m[1])}-${pad(m[2])}`;
    return String(y);
  }
  return '';
}

/** Title-cases ALL-CAPS text from forms and barcodes ("KIA" → "Kia", "FOX RUN DR" → "Fox Run Dr"). */
export function tidyCase(s: string): string {
  const t = s.trim();
  if (!t || t !== t.toUpperCase() || !/[A-Z]/.test(t)) return t;
  return t.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
}

let n = 0;
export const rowId = (prefix: string) => `${prefix}-${++n}`;
