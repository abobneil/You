import type { FuzzyDate } from './types';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2009" → "2009", "2021-03" → "Mar 2021", "2021-03-14" → "Mar 14, 2021". */
export function fmtDate(d: FuzzyDate | undefined): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  if (!m) return y;
  if (!day) return `${MONTHS[+m - 1]} ${y}`;
  return `${MONTHS[+m - 1]} ${+day}, ${y}`;
}

/** Timestamps are stored in UTC but shown and compared in the person's local date. */
export function localDay(iso: string): string {
  const t = new Date(iso);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export const fmtISO = (iso: string) => fmtDate(localDay(iso));
export const nowISO = () => new Date().toISOString();
export const thisMonth = (now = nowISO()) => localDay(now).slice(0, 7);

/** Earliest day a fuzzy date could mean: "2021" → "2021-01-01". */
export const startKey = (d: FuzzyDate) => (d + '-01-01').slice(0, 10);
/** Latest day a fuzzy date could mean: "2021" → "2021-12-31". Good enough for comparing. */
export const endKey = (d: FuzzyDate) => (d.length === 4 ? d + '-12-31' : d.length === 7 ? d + '-' + String(new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate()).padStart(2, '0') : d);

/** Builds a fuzzy date from form parts. Returns '' if there is no valid year. */
export function fuzzyFromParts(year: string, month: string, day: string): FuzzyDate {
  const y = year.trim(), m = month.trim(), d = day.trim();
  if (!/^\d{4}$/.test(y)) return '';
  if (!/^(0[1-9]|1[0-2])$/.test(m)) return y;
  if (!/^\d{1,2}$/.test(d) || +d < 1 || +d > 31) return `${y}-${m}`;
  const result = `${y}-${m}-${d.padStart(2, '0')}`;
  return isValidDate(result) ? result : ''; 
}

/** Validate real calendar dates without timezone conversion. Empty means unknown. */
export function isValidDate(d: string): boolean {
  if (!d) return true;
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(d) || +d.slice(0, 4) < 1) return false;
  const [y, m, day] = d.split('-').map(Number);
  if (!m) return d.length === 4;
  if (m < 1 || m > 12) return false;
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  return d.length === 7 || (day >= 1 && day <= days[m - 1]);
}
