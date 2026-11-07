// The "Details" section of a card: one row per Field (a vehicle's Year, Make, Model, VIN…),
// each with its own formatting, quick picks and hiding, plus the short summary shown on the card.
import type { Field, KindInfo } from '../core/areas';
import { fmtDate } from '../core/dates';
import { maskValue } from '../core/formats';
import type { Card } from '../core/types';
import { dateInputs, readDate } from './dateInput';
import { esc } from './dom';
import { attachValueField, valueFieldHtml } from './valueField';

/** Lets a Field reuse the value-field behaviour (formatting, quick picks, hiding). */
const asKind = (f: Field): KindInfo =>
  ({ name: f.label, many: false, dated: true, value: 'text', format: f.format, choices: f.choices, sensitive: f.sensitive });

const key = (prefix: string, f: Field) => `${prefix}-${f.id}`;

/**
 * When adding a card every detail shows, with examples as placeholders.
 * On a saved card (`saved`), only filled-in details show, plus "Show all details" for the rest,
 * and there are no example placeholders that could be mistaken for real values.
 */
export function detailsHtml(kind: KindInfo, values: Record<string, string> = {}, prefix = 'fd', saved = false): string {
  if (!kind.fields?.length) return '';
  const filled = kind.fields.filter(f => values[f.id]).length;
  const collapse = saved && filled > 0 && filled < kind.fields.length;
  const rows = kind.fields.map(f => `<div class="fx"${collapse && !values[f.id] ? ' data-empty hidden' : ''}>
      <label for="${key(prefix, f)}">${esc(f.label)}</label>
      ${f.type === 'date'
        ? dateInputs(values[f.id], key(prefix, f))
        : valueFieldHtml(key(prefix, f), values[f.id] ?? '', asKind(f), saved ? 'Add' : f.placeholder ?? '')}
    </div>`).join('');
  const more = collapse
    ? `<button type="button" class="link-btn more-details" data-more>Show all ${kind.fields.length} details</button>` : '';
  return `<div class="details"><h5>Details</h5>${rows}${more}</div>`;
}

// "Show all details" reveals the empty rows on a saved card.
document.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.details [data-more]');
  if (!b) return;
  b.closest('.details')!.querySelectorAll<HTMLElement>('[data-empty]').forEach(r => { r.hidden = false; });
  b.remove();
});

/**
 * Wires the rows. `onInput` runs while typing (to build the name live);
 * `onCommit` runs when a detail is finished (on change), with its id and value.
 */
export function attachDetails(root: ParentNode, kind: KindInfo, prefix = 'fd',
  on: { input?: () => void; commit?: (id: string, value: string) => void } = {}) {
  for (const f of kind.fields ?? []) {
    const k = key(prefix, f);
    if (f.type === 'date') {
      root.querySelector(`[data-date="${k}"]`)?.addEventListener('change', () => {
        on.input?.();
        on.commit?.(f.id, readDate(root, k));
      });
      continue;
    }
    attachValueField(root, k, asKind(f));
    const input = root.querySelector<HTMLInputElement>('#' + k);
    input?.addEventListener('input', () => on.input?.());
    input?.addEventListener('change', () => on.commit?.(f.id, input.value));
  }
}

export function readDetails(root: ParentNode, kind: KindInfo, prefix = 'fd'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of kind.fields ?? []) {
    const k = key(prefix, f);
    const v = f.type === 'date' ? readDate(root, k) : (root.querySelector<HTMLInputElement>('#' + k)?.value ?? '');
    if (v.trim()) out[f.id] = v.trim();
  }
  return out;
}

/** A detail as it should be shown: dates formatted, sensitive values masked. */
export function shownField(f: Field, v: string): string {
  if (f.type === 'date') return fmtDate(v);
  return f.sensitive ? maskValue(v) : v;
}

/** The short line under a card's value, from the kind's summary details ("NC · ABC1234"). */
export function summaryText(c: Card, kind: KindInfo): string {
  if (!kind.summary?.length || !c.fields) return '';
  return kind.summary
    .map(id => { const f = kind.fields?.find(x => x.id === id); const v = c.fields?.[id]; return f && v ? shownField(f, v) : ''; })
    .filter(Boolean).join(' · ');
}

/** Non-sensitive details as plain text, for searching. */
export const searchableDetails = (c: Card, kind: KindInfo) =>
  (kind.fields ?? []).filter(f => !f.sensitive && c.fields?.[f.id]).map(f => c.fields![f.id]).join(' ');
