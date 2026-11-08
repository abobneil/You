import { MONTHS, dateProblem, fuzzyFromParts } from '../core/dates';
import type { FuzzyDate } from '../core/types';
import { $, esc } from './dom';

// Year, then Month, then Day. Only the year is needed; people rarely remember exact dates,
// so the day box only appears once a month is picked.
// The month is our own button + grid rather than a native <select>: on Windows dark mode the
// native list rendered white-on-white, so months couldn't be picked.

const monthOptions = (m: string) => MONTHS.map((n, i) => {
  const v = String(i + 1).padStart(2, '0');
  return `<button type="button" data-m="${v}" class="${m === v ? 'on' : ''}">${n}</button>`;
}).join('');

export function dateInputs(value: FuzzyDate | undefined, key: string): string {
  const [y = '', m = '', d = ''] = (value || '').split('-');
  return `<span class="date" data-date="${key}">
    <input data-d="y" autocomplete="off" inputmode="numeric" maxlength="4" placeholder="Year" value="${esc(y)}" aria-label="Year">
    <button type="button" class="mbtn${m ? '' : ' empty'}" data-d="m" data-value="${esc(m)}" aria-haspopup="true" aria-expanded="false" aria-label="Month (optional)">${m ? MONTHS[+m - 1] : 'Month'}</button>
    <input data-d="d" autocomplete="off" inputmode="numeric" maxlength="2" placeholder="Day" value="${esc(d ? +d : '')}" aria-label="Day (optional)"${m ? '' : ' hidden'}>
    <span class="mgrid" role="group" aria-label="Choose a month" hidden>${monthOptions(m)}<button type="button" data-m="" class="clear">No month</button></span>
  </span>`;
}

/** For a caller that stops a save by throwing after it has shown the person what to fix (the sheet swallows it). */
export class InvalidDate extends Error { constructor() { super('Invalid calendar date'); } }

/** Marks a date field as wrong, with the message under it (aria-invalid, aria-describedby). Focuses its year. */
export function dateError(root: ParentNode, key: string, message: string) {
  showDateIssue(root, key, message);
  root.querySelector<HTMLElement>(`[data-date="${key}"] [data-d="y"]`)?.focus();
}

function parts(root: ParentNode, key: string) {
  const el = root.querySelector(`[data-date="${key}"]`);
  if (!el) return null;
  return {
    el,
    year: $<HTMLInputElement>('[data-d="y"]', el).value.trim(),
    month: $<HTMLElement>('[data-d="m"]', el).dataset.value || '',
    day: $<HTMLInputElement>('[data-d="d"]', el).value.trim(),
  };
}

/**
 * The date as typed. A date that isn't real (30 February, a two-digit year) comes back exactly as typed,
 * so it fails `isValidDate` rather than being quietly changed. Use `dateIssue` to explain the problem.
 */
export function readDate(root: ParentNode, key: string): FuzzyDate {
  const x = parts(root, key);
  if (!x) return '';
  if (dateProblem(x.year, x.month, x.day)) return x.year + (x.month ? '-' + x.month : '') + (x.day ? '-' + x.day.padStart(2, '0') : '');
  return fuzzyFromParts(x.year, x.month, x.day);
}

/** What's wrong with the date in this field, in plain words, or ''. */
export function dateIssue(root: ParentNode, key: string): string {
  const x = parts(root, key);
  return x ? dateProblem(x.year, x.month, x.day) : '';
}

/** Shows (or clears, with '') a message right under a date field, naming the field and the fix. */
export function showDateIssue(root: ParentNode, key: string, msg: string) {
  const el = root.querySelector<HTMLElement>(`[data-date="${key}"]`);
  if (!el) return;
  let p = el.nextElementSibling?.classList.contains('date-err') ? el.nextElementSibling as HTMLElement : null;
  el.querySelectorAll('input, .mbtn').forEach(i => (msg ? i.setAttribute('aria-invalid', 'true') : i.removeAttribute('aria-invalid')));
  if (!msg) { p?.remove(); return; }
  if (!p) { p = Object.assign(document.createElement('p'), { className: 'date-err' }); p.setAttribute('role', 'alert'); el.after(p); }
  p.id = `${key}-err`;
  el.querySelector('[data-d="y"]')?.setAttribute('aria-describedby', p.id);
  p.textContent = msg;
}

/**
 * Checks each named date field and shows a message under every one that isn't a real date.
 * Returns true when they're all fine; otherwise focuses the first problem.
 */
export function checkDates(root: ParentNode, fields: { key: string; label: string }[]): boolean {
  let first: HTMLElement | null = null;
  for (const f of fields) {
    const issue = dateIssue(root, f.key);
    showDateIssue(root, f.key, issue ? `${f.label}: ${issue}` : '');
    if (issue && !first) first = root.querySelector<HTMLElement>(`[data-date="${f.key}"] [data-d="y"]`);
  }
  first?.focus();
  return !first;
}

function closeAll(except?: Element) {
  document.querySelectorAll('.date .mgrid:not([hidden])').forEach(g => {
    if (g === except) return;
    (g as HTMLElement).hidden = true;
    g.parentElement?.querySelector('.mbtn')?.setAttribute('aria-expanded', 'false');
  });
}

// One listener for every date field on the page, including ones rendered later.
document.addEventListener('click', e => {
  const t = e.target as HTMLElement;
  const btn = t.closest<HTMLElement>('.date .mbtn');
  if (btn) {
    const grid = btn.parentElement!.querySelector<HTMLElement>('.mgrid')!;
    closeAll(grid);
    grid.hidden = !grid.hidden;
    btn.setAttribute('aria-expanded', String(!grid.hidden));
    if (!grid.hidden) grid.querySelector<HTMLElement>('.on, [data-m]')?.focus();
    return;
  }
  const opt = t.closest<HTMLElement>('.date .mgrid [data-m]');
  if (opt) {
    const date = opt.closest('.date')!;
    const mbtn = $<HTMLElement>('.mbtn', date);
    const v = opt.dataset.m!;
    mbtn.dataset.value = v;
    mbtn.textContent = v ? MONTHS[+v - 1] : 'Month';
    mbtn.classList.toggle('empty', !v);
    date.querySelectorAll('.mgrid [data-m]').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.m === v && !!v));
    closeAll();
    mbtn.focus();
    // Let existing "change" listeners (which save) react, as they did for the old <select>.
    const day = $<HTMLInputElement>('[data-d="d"]', date);
    day.hidden = !v;
    if (!v) day.value = ''; // a day means nothing without its month
    mbtn.dispatchEvent(new Event('change', { bubbles: true }));
    // Typing order: year, month, then day.
    if (v) day.focus();
    return;
  }
  if (!t.closest('.date')) closeAll();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.querySelector('.date .mgrid:not([hidden])')) {
    e.preventDefault(); // close the month grid, not the whole dialog
    e.stopPropagation();
    closeAll();
  }
}, true);

// A message under a date goes away as soon as the date is touched again.
document.addEventListener('input', e => {
  const date = (e.target as HTMLElement).closest?.<HTMLElement>('.date[data-date]');
  if (date && date.nextElementSibling?.classList.contains('date-err')) showDateIssue(date.parentElement!, date.dataset.date!, '');
});
