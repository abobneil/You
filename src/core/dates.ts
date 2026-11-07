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
export const endKey = (d: FuzzyDate) => (d.length === 4 ? d + '-12-31' : d.length === 7 ? d + '-31' : d);

/** Builds a fuzzy date from form parts. Returns '' if there is no valid year. */
export function fuzzyFromParts(year: string, month: string, day: string): FuzzyDate {
  const y = year.trim(), m = month.trim(), d = day.trim();
  if (!/^\d{4}$/.test(y)) return '';
  if (!/^(0[1-9]|1[0-2])$/.test(m)) return y;
  if (!/^\d{1,2}$/.test(d) || +d < 1 || +d > 31) return `${y}-${m}`;
  return `${y}-${m}-${d.padStart(2, '0')}`;
}
