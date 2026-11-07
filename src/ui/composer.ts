// "Add a card": kind, value, since-date, replace-or-alongside, and links.
import { areaById, kindLabel, kindOf, tagOf } from '../core/areas';
import { activeOf, addCard, addLink, byId, defaultMode } from '../core/cards';
import { fmtDate } from '../core/dates';
import type { AreaId, FuzzyDate } from '../core/types';
import { profile, save } from '../state';
import { dateInputs, readDate } from './dateInput';
import { $, esc, linkText } from './dom';
import { emit } from './events';
import { openLinkPicker } from './linkPicker';
import { attachValueField, valueFieldHtml } from './valueField';
import { shownValue } from './sensitive';
import { tagRowHtml } from './tags';
import { maskValue } from '../core/formats';
import { act, closeSheet, openSheet, sheetBody, sheetTop } from './sheet';

const OTHER = '__other';

interface Draft {
  area: AreaId;
  kind: string;
  custom: string;
  value: string;
  /** For kinds whose value is a date (Birthday). */
  valueDate: FuzzyDate;
  since: FuzzyDate;
  /** Sub-type for kinds with tags (a phone's Cell, Home…). */
  tag?: string;
  mode: string | null;
  replaceId?: string;
  links: { id: string; fwd: string; back: string }[];
}
let draft: Draft;

export function openComposer(area: AreaId, preset: { kind?: string; replaceId?: string } = {}) {
  draft = { area, kind: preset.kind || firstOpenKind(area), custom: '', value: '', valueDate: '', since: '',
    mode: null, replaceId: preset.replaceId, links: [] };
  render(true);
}

/** Starts on the first suggested kind that has nothing yet, so "New card" doesn't default to replacing. */
function firstOpenKind(area: AreaId): string {
  const kinds = areaById(area)!.kinds;
  return (kinds.find(k => !activeOf(profile, area, k.name).length) ?? kinds[0]).name;
}

function read() {
  draft.custom = sheetBody.querySelector<HTMLInputElement>('#c-custom')?.value.trim() ?? draft.custom;
  const v = sheetBody.querySelector<HTMLInputElement>('#c-value');
  if (v) draft.value = v.value;
  if (sheetBody.querySelector('[data-date="vdate"]')) draft.valueDate = readDate(sheetBody, 'vdate');
  if (sheetBody.querySelector('[data-date="since"]')) draft.since = readDate(sheetBody, 'since');
}

function render(focus = false) {
  const a = areaById(draft.area)!;
  const custom = draft.kind === OTHER;
  const kind = kindOf(draft.area, custom ? (draft.custom || 'Note') : draft.kind);
  const actives = custom ? [] : activeOf(profile, draft.area, draft.kind);
  if (draft.mode && draft.mode !== 'add' && !actives.some(c => 'r:' + c.id === draft.mode)) draft.mode = null;
  if (!draft.mode) draft.mode = custom ? 'add' : defaultMode(profile, draft.area, draft.kind, draft.replaceId);
  const replacing = draft.mode.startsWith('r:');
  if (!kind.tags?.some(t => t.id === draft.tag)) draft.tag = kind.tags?.[0]?.id;
  const isDate = kind.value === 'date';
  // Facts (Full name) have no start date, but replacing one is a change worth dating.
  const showSince = !isDate && (kind.dated || replacing);

  const kindChips = a.kinds.map(k => {
    const has = activeOf(profile, draft.area, k.name).length > 0;
    return `<button type="button" data-act="kind" data-kind="${esc(k.name)}" class="${k.name === draft.kind ? 'on' : ''}${has ? ' has' : ''}"
      ${has ? `title="You have this one"` : ''}>${esc(k.name)}</button>`;
  }).join('') + `<button type="button" data-act="kind" data-kind="${OTHER}" class="${custom ? 'on' : ''}">Something else…</button>`;

  const modeRow = actives.length ? `<div class="fx"><span class="lab">Current ${esc(draft.kind.toLowerCase())}</span>
    <div class="seg">${actives.map(c =>
      `<button type="button" data-act="mode" data-mode="r:${c.id}" class="${draft.mode === 'r:' + c.id ? 'on' : ''}">Replaces ${(t => (t ? esc(t.label) + ' ' : ''))(tagOf(c))}${esc(shownValue(c))}</button>`).join('')}
      <button type="button" data-act="mode" data-mode="add" class="${draft.mode === 'add' ? 'on' : ''}">Add alongside</button></div></div>` : '';
  const linkChips = draft.links.map((l, i) =>
    `<span class="chip">${(() => { const o = byId(profile, l.id); return linkText(l.fwd, o ? kindLabel(o) : '', o ? shownValue(o) : ''); })()}<span class="x" data-act="drop-link" data-i="${i}" role="button" title="Remove">×</span></span>`).join('');

  const valueRow = isDate
    ? `<div class="fx"><span class="lab">${esc(kind.name)}</span>${dateInputs(draft.valueDate, 'vdate')}</div>`
    : `<div class="fx"><label for="c-value">Value</label>${valueFieldHtml('c-value', draft.value, kind, custom ? '' : 'e.g. ' + example(draft.kind))}</div>`;
  const sinceRow = showSince
    ? `<div class="fx"><span class="lab">${kind.dated ? 'Since' : 'Changed'}</span><div>${dateInputs(draft.since, 'since')}<div class="hint">${
        kind.dated ? 'When this became true. A year is enough.' : 'When it changed. A year is enough.'}</div></div></div>`
    : '';

  openSheet(`${sheetTop(`${esc(a.title)} · new card`)}
    <h3 class="sh-title">Add a card</h3>
    <div class="fx kinds-row"><span class="lab">Card</span><div class="kinds">${kindChips}</div></div>
    ${custom ? `<div class="fx"><label for="c-custom">Name it</label><input id="c-custom" value="${esc(draft.custom)}" placeholder="e.g. Eye doctor"></div>` : ''}
    ${valueRow}
    ${tagRowHtml(kind, draft.tag)}
    ${modeRow}
    ${sinceRow}
    <div class="fx"><span class="lab">Linked to</span><div class="chips">${linkChips}<button class="chip" type="button" data-act="add-link">+ Link a card</button></div></div>
    <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" data-act="save">Add card</button></div>`,
  {
    kind: b => {
      read();
      if (b.dataset.kind === draft.kind) return;
      draft.kind = b.dataset.kind!;
      draft.mode = null;
      render();
      (sheetBody.querySelector<HTMLElement>(draft.kind === OTHER ? '#c-custom' : '#c-value, [data-date="vdate"] .mbtn'))?.focus();
    },
    mode: b => { read(); draft.mode = b.dataset.mode!; render(); },
    tag: b => { read(); draft.tag = b.dataset.tag; render(); },
    'drop-link': b => { read(); draft.links.splice(+b.dataset.i!, 1); render(); },
    'add-link': () => {
      read();
      openLinkPicker({
        self: {
          area: draft.area,
          kind: custom ? (draft.custom || 'Note') : draft.kind,
          label: (isDate ? fmtDate(draft.valueDate) : kind.sensitive ? maskValue(draft.value.trim()) : draft.value.trim()) || 'This card',
        },
        exclude: draft.links.map(l => l.id),
        onPick: (id, fwd, back) => { draft.links.push({ id, fwd, back }); render(); },
        onBack: () => render(),
      });
    },
    save: () => {
      read();
      const name = draft.kind === OTHER ? draft.custom : draft.kind;
      if (!name) return sheetBody.querySelector<HTMLInputElement>('#c-custom')?.focus();
      let value = draft.value.trim();
      let since = showSince ? draft.since : '';
      if (isDate) {
        if (!draft.valueDate) return sheetBody.querySelector<HTMLElement>('[data-date="vdate"] [data-d="y"]')?.focus();
        value = fmtDate(draft.valueDate);
        since = draft.valueDate; // a birthday sits at that date on the timeline
      }
      if (!value) return $<HTMLInputElement>('#c-value', sheetBody).focus();
      const replaceId = replacing ? draft.mode!.slice(2) : undefined;
      const c = addCard(profile, { area: draft.area, kind: name, value, since, tag: draft.tag }, replaceId);
      for (const l of draft.links) addLink(profile, c.id, l.id, l.fwd, l.back);
      save();
      closeSheet();
      emit('card-added');
    },
  });

  attachValueField(sheetBody, 'c-value', kind);
  sheetBody.querySelector('#c-value')?.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') act('save'); });
  if (focus) (sheetBody.querySelector<HTMLElement>('#c-value, [data-date="vdate"] .mbtn'))?.focus();
}

const EXAMPLES: Record<string, string> = {
  'Full name': 'Alex Morgan Kim', 'Preferred name': 'Alex', Pronouns: 'they/them', Birthplace: 'Raleigh, NC',
  Phone: '(555) 123-4567', Email: 'alex@example.com', Citizenship: 'United States', Language: 'Spanish',
  "Driver's license": 'NC 123456789', Passport: 'X12345678', 'Social Security number': '123-45-6789',
  Doctor: 'Dr. Maya Lee', Allergy: 'Penicillin', Address: '12 Elm St, Springfield', Job: 'Designer at Acme Corp',
  'Health insurance': 'Aetna PPO', Book: 'East of Eden', Friend: 'Sam Rivera', Goal: 'Run a marathon',
};
const example = (kind: string) => EXAMPLES[kind] || kind;
