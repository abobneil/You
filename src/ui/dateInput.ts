import { MONTHS, fuzzyFromParts } from '../core/dates';
import type { FuzzyDate } from '../core/types';
import { $, esc } from './dom';

/** Month / Day / Year inputs. Only the year is needed; people rarely remember exact dates. */
export function dateInputs(value: FuzzyDate | undefined, key: string): string {
  const [y = '', m = '', d = ''] = (value || '').split('-');
  const opts = MONTHS.map((n, i) => {
    const v = String(i + 1).padStart(2, '0');
    return `<option value="${v}"${m === v ? ' selected' : ''}>${n}</option>`;
  }).join('');
  return `<span class="date" data-date="${key}">
    <select data-d="m" aria-label="Month"><option value="">Month</option>${opts}</select>
    <input data-d="d" inputmode="numeric" maxlength="2" placeholder="Day" value="${esc(d ? +d : '')}" aria-label="Day">
    <input data-d="y" inputmode="numeric" maxlength="4" placeholder="Year" value="${esc(y)}" aria-label="Year">
  </span>`;
}

export function readDate(root: ParentNode, key: string): FuzzyDate {
  const el = root.querySelector(`[data-date="${key}"]`);
  if (!el) return '';
  return fuzzyFromParts(
    $<HTMLInputElement>('[data-d="y"]', el).value,
    $<HTMLSelectElement>('[data-d="m"]', el).value,
    $<HTMLInputElement>('[data-d="d"]', el).value,
  );
}
