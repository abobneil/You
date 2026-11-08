// The "Details" section of a card: one row per Field (a vehicle's Year, Make, Model, VIN…),
// each with its own formatting, quick picks and hiding, plus the short summary shown on the card.
import type { Field, KindInfo } from '../core/areas';
import { fmtDate } from '../core/dates';
import { maskValue } from '../core/formats';
import type { Card } from '../core/types';
import { dateInputs, readDate } from './dateInput';
import { esc } from './dom';
import { attachValueField, valueFieldHtml } from './valueField';
import { lookupVin, VIN_SERVICE } from '../core/import/vin';
import { local } from '../storage/local';

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
  const rows = kind.fields.map(f => `<div class="fx${f.choices ? ' has-choices' : ''}"${collapse && !values[f.id] ? ' data-empty hidden' : ''}>
      <label for="${key(prefix, f)}">${esc(f.label)}</label>
      ${f.type === 'date'
        ? dateInputs(values[f.id], key(prefix, f))
        : valueFieldHtml(key(prefix, f), values[f.id] ?? '', asKind(f),
            saved ? 'Add' : f.placeholder ?? (f.choices ? 'Pick one, or type your own' : ''))}
      ${f.lookup === 'vin' ? `<span></span><div class="lookup">
        <button type="button" class="chip" data-vin-lookup="${key(prefix, f)}">Look up details</button>
        <button type="button" class="link-btn" data-vin-photo="${key(prefix, f)}">Use a photo of the VIN barcode</button>
        <span class="hint" data-vin-status="${key(prefix, f)}"></span></div>` : ''}
    </div>`).join('');
  const more = collapse
    ? `<button type="button" class="link-btn more-details" data-more>Show all ${kind.fields.length} details</button>` : '';
  return `<div class="details"><h5>Details</h5>${rows}${more}</div>`;
}

// ---------- VIN: look up details (asks first, since it uses the network), or read a barcode photo ----------
local.remove('you.vinConsent'); // older versions remembered one yes for every later lookup
/** Vehicle details the lookup can fill (same names as the Vehicle fields). */
const VIN_FILL = ['year', 'make', 'model', 'trim', 'fuel'] as const;

async function vinLookup(input: HTMLInputElement, prefix: string, status: HTMLElement) {
  const vin = input.value.trim().toUpperCase();
  if (vin.length !== 17) { status.textContent = 'Enter all 17 characters of the VIN first.'; return; }
  // Asked every time, naming the service and the exact VIN: consent to one lookup never covers another.
  if (!confirm(`Send this VIN to ${VIN_SERVICE}?

${vin}

Only this VIN is sent, to the US government’s free vehicle database. Nothing else about you leaves this device. The details it finds are filled in for you to check before you save.`)) { status.textContent = 'Nothing was sent.'; return; }
  status.textContent = 'Looking it up…';
  try {
    const info = await lookupVin(vin);
    if (!info) { status.textContent = 'No details were found for that VIN. Check it for typos.'; return; }
    let filled = 0;
    const scope = input.closest('.details') ?? document;
    for (const field of VIN_FILL) {
      const el = scope.querySelector<HTMLInputElement>(`#${prefix}-${field}`);
      const v = info[field];
      if (!el || !v || el.value.trim()) continue;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.closest<HTMLElement>('[data-empty]')?.removeAttribute('hidden');
      filled++;
    }
    status.textContent = filled ? `Filled in ${filled} detail${filled === 1 ? '' : 's'} from NHTSA. Check them, then save.` : 'Those details are already filled in.';
  } catch {
    status.textContent = 'The lookup didn’t work. Check your connection and try again.';
  }
}

document.addEventListener('click', async e => {
  const t = e.target as HTMLElement;
  const look = t.closest<HTMLElement>('[data-vin-lookup]');
  const photo = t.closest<HTMLElement>('[data-vin-photo]');
  const id = look?.dataset.vinLookup ?? photo?.dataset.vinPhoto;
  if (!id) return;
  const input = document.getElementById(id) as HTMLInputElement | null;
  const status = document.querySelector<HTMLElement>(`[data-vin-status="${id}"]`);
  if (!input || !status) return;
  const prefix = id.replace(/-vin$/, '');
  if (look) return vinLookup(input, prefix, status);
  const pickFile = document.createElement('input');
  pickFile.type = 'file';
  pickFile.accept = 'image/*';
  pickFile.addEventListener('change', async () => {
    const f = pickFile.files?.[0];
    if (!f) return;
    status.textContent = 'Reading the barcode…';
    try {
      const { readPhoto } = await import('./import/scan');
      const texts = await readPhoto(f, ['Code39', 'Code128', 'DataMatrix', 'QRCode', 'PDF417']);
      const vin = texts.map(x => x.trim().toUpperCase().replace(/^I(?=[A-HJ-NPR-Z0-9]{17}$)/, '')).find(x => /^[A-HJ-NPR-Z0-9]{17}$/.test(x));
      if (!vin) { status.textContent = 'No VIN barcode was found in that photo.'; return; }
      input.value = vin;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      status.textContent = 'VIN read from the barcode.';
      vinLookup(input, prefix, status);
    } catch { status.textContent = 'That photo couldn’t be read.'; }
  });
  pickFile.click();
});

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
