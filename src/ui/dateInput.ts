import { MONTHS, fuzzyFromParts, isValidDate } from '../core/dates';
import type { FuzzyDate } from '../core/types';
import { $, esc, showFieldError } from './dom';

// Month / Day / Year. Only the year is needed; people rarely remember exact dates.
// The month is our own button + grid rather than a native <select>: on Windows dark mode the
// native list rendered white-on-white, so months couldn't be picked.

const monthOptions = (m: string) => MONTHS.map((n, i) => {
  const v = String(i + 1).padStart(2, '0');
  return `<button type="button" data-m="${v}" class="${m === v ? 'on' : ''}">${n}</button>`;
}).join('');

export function dateInputs(value: FuzzyDate | undefined, key: string): string {
  const [y = '', m = '', d = ''] = (value || '').split('-');
  return `<span class="date" data-date="${key}">
    <button type="button" class="mbtn${m ? '' : ' empty'}" data-d="m" data-value="${esc(m)}" aria-haspopup="true" aria-expanded="false" aria-label="Month">${m ? MONTHS[+m - 1] : 'Month'}</button>
    <input data-d="d" inputmode="numeric" maxlength="2" placeholder="Day" value="${esc(d ? +d : '')}" aria-label="Day">
    <input data-d="y" inputmode="numeric" maxlength="4" placeholder="Year" value="${esc(y)}" aria-label="Year">
    <span class="mgrid" role="group" aria-label="Choose a month" hidden>${monthOptions(m)}<button type="button" data-m="" class="clear">No month</button></span>
  </span>`;
}

/** Thrown by readDate after it has shown the person what to fix; whoever was saving just stops. */
export class InvalidDate extends Error { constructor() { super('Invalid calendar date'); } }

/** Marks a date field as wrong, with the message under it. Focuses its year. */
export function dateError(root: ParentNode, key: string, message: string) {
  const el = root.querySelector(`[data-date="${key}"]`);
  if (el) showFieldError($<HTMLElement>('[data-d="y"]', el), message, el);
}

export function readDate(root: ParentNode, key: string): FuzzyDate {
  const el = root.querySelector(`[data-date="${key}"]`);
  if (!el) return '';
  const year = $<HTMLInputElement>('[data-d="y"]', el).value.trim();
  const month = $<HTMLElement>('[data-d="m"]', el).dataset.value || '';
  const day = $<HTMLInputElement>('[data-d="d"]', el).value.trim();
  const raw = year + (month ? '-' + month : '') + (day ? '-' + day.padStart(2, '0') : '');
  if (raw && !isValidDate(raw)) {
    const badYear = !/^\d{4}$/.test(year);
    showFieldError($<HTMLInputElement>(badYear ? '[data-d="y"]' : '[data-d="d"]', el), !year
      ? 'Add the year. A year alone is enough.'
      : badYear ? 'Type the year as four digits, like 1998.'
      : 'That day isn’t in that month. Change the day, or leave it empty: a year alone is enough.', el);
    throw new InvalidDate();
  }
  return fuzzyFromParts(
    $<HTMLInputElement>('[data-d="y"]', el).value,
    $<HTMLElement>('[data-d="m"]', el).dataset.value ?? '',
    $<HTMLInputElement>('[data-d="d"]', el).value,
  );
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
    mbtn.dispatchEvent(new Event('change', { bubbles: true }));
    // Typing order: month, then day.
    if (v) $<HTMLInputElement>('[data-d="d"]', date).focus();
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
