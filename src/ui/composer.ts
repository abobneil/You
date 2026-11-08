import { noteInput, autosizeNote } from './note';
// "Add a card": kind, value, since-date, replace-or-alongside, and links.
import { areaById, kindLabel, kindOf, tagOf } from '../core/areas';
import { activeOf, addCard, addCardBefore, addKeepsake, addLink, byId, defaultMode } from '../core/cards';
import type { Keepsake } from '../core/keepsakes';
import { startKey, endKey, fmtDate } from '../core/dates';
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
import { act, closeSheet, onSheetClose, openSheet, sheetBody, sheetTop } from './sheet';
import { attachHtml, busy, draftThumbs, keepFiles, pickFiles, showPictures } from './keepsakes';
import { dropRows } from '../storage/keepsakeAccess';
import { attachDetails, detailsHtml, readDetails } from './details';

const OTHER = '__other';

interface Draft {
  note: string;
  noteOpen: boolean;
  area: AreaId;
  kind: string;
  custom: string;
  value: string;
  /** For kinds whose value is a date (Birthday). */
  valueDate: FuzzyDate;
  since: FuzzyDate;
  /** Sub-type for kinds with tags (a phone's Cell, Home…). */
  tag?: string;
  /** Structured details (a vehicle's Year, Make…). */
  fields: Record<string, string>;
  /** Details typed under other types, kept in case the person switches back. */
  fieldsByKind: Record<string, Record<string, string>>;
  /** True once the name was typed by hand, so details stop filling it in. */
  nameTyped: boolean;
  mode: string | null;
  replaceId?: string;
  links: { id: string; fwd: string; back: string }[];
  /** Files attached before the card exists. Their encrypted bytes are already stored. */
  keepsakes: Keepsake[];
  keepsakeMsg: string;
  /** Whose rows the drafted files are in, so they can be cleared if the card is never added. */
  youId: string;
  saved: boolean;
}
let draft: Draft | undefined;

// Closing without adding the card: its drafted files go too.
onSheetClose(() => {
  if (!draft || draft.saved || !draft.keepsakes.length) return;
  dropRows(draft.youId, draft.keepsakes.map(k => k.id));
  draft.keepsakes = [];
});

export function openComposer(area: AreaId, preset: { kind?: string; replaceId?: string; since?: string } = {}) {
  draft = { note: '', noteOpen: false, area, kind: preset.kind || firstOpenKind(area), custom: '', value: '', valueDate: '', since: preset.since || '',
    fields: {}, fieldsByKind: {}, nameTyped: false, mode: null, replaceId: preset.replaceId, links: [],
    keepsakes: [], keepsakeMsg: '', youId: profile.id ?? '', saved: false };
  render(true);
}

/** Starts on the first suggested kind that has nothing yet, so "New card" doesn't default to replacing. */
function firstOpenKind(area: AreaId): string {
  const kinds = areaById(area)!.kinds;
  return (kinds.find(k => !activeOf(profile, area, k.name).length) ?? kinds[0]).name;
}

function read() {
  const draft = current();
  draft.note = sheetBody.querySelector<HTMLTextAreaElement>('#c-note')?.value ?? draft.note;
  draft.custom = sheetBody.querySelector<HTMLInputElement>('#c-custom')?.value.trim() ?? draft.custom;
  const v = sheetBody.querySelector<HTMLInputElement>('#c-value');
  if (v) draft.value = v.value;
  if (sheetBody.querySelector('[data-date="vdate"]')) draft.valueDate = readDate(sheetBody, 'vdate');
  if (sheetBody.querySelector('[data-date="since"]')) draft.since = readDate(sheetBody, 'since');
  if (sheetBody.querySelector('.details')) draft.fields = readDetails(sheetBody, currentKind(), 'cf');
}

const current = () => draft!;
const currentKind = (d = current()) => kindOf(d.area, d.kind === OTHER ? (d.custom || 'Note') : d.kind);

function render(focus = false) {
  const draft = current();
  const a = areaById(draft.area)!;
  const custom = draft.kind === OTHER;
  const kind = kindOf(draft.area, custom ? (draft.custom || 'Note') : draft.kind);
  const actives = custom ? [] : activeOf(profile, draft.area, draft.kind);
  if (draft.mode && draft.mode !== 'add' && !actives.some(c => 'r:' + c.id === draft.mode || 'b:' + c.id === draft.mode)) draft.mode = null;
  if (!draft.mode) draft.mode = custom ? 'add' : defaultMode(profile, draft.area, draft.kind, draft.replaceId);
  const replacing = draft.mode.startsWith('r:');
  const before = draft.mode.startsWith('b:');
  if (!kind.tags?.some(t => t.id === draft.tag)) draft.tag = kind.tags?.[0]?.id;
  const isDate = kind.value === 'date';
  // Facts (Full name) have no start date, but replacing one is a change worth dating.
  const showSince = !isDate && (kind.dated || replacing || before);

  const kindChips = a.kinds.map(k => {
    const has = activeOf(profile, draft.area, k.name).length > 0;
    return `<button type="button" data-act="kind" data-kind="${esc(k.name)}" class="${k.name === draft.kind ? 'on' : ''}${has ? ' has' : ''}"
      ${has ? `title="You have this one"` : ''}>${esc(k.name)}</button>`;
  }).join('') + `<button type="button" data-act="kind" data-kind="${OTHER}" class="${custom ? 'on' : ''}">Something else…</button>`;

  const modeRow = actives.length ? `<div class="fx"><span class="lab">Current ${esc(draft.kind.toLowerCase())}</span>
    <div class="seg">${actives.map(c =>
      `<button type="button" data-act="mode" data-mode="r:${esc(c.id)}" class="${draft.mode === 'r:' + c.id ? 'on' : ''}">Replaces ${(t => (t ? esc(t.label) + ' ' : ''))(tagOf(c))}${esc(shownValue(c))}</button>`).join('')}
      ${actives.filter(c => !c.replaces && !kind.many).map(c =>
        `<button type="button" data-act="mode" data-mode="b:${esc(c.id)}" class="${draft.mode === 'b:' + c.id ? 'on' : ''}">Came before ${(t => (t ? esc(t.label) + ' ' : ''))(tagOf(c))}${esc(shownValue(c))}</button>`).join('')}
      <button type="button" data-act="mode" data-mode="add" class="${draft.mode === 'add' ? 'on' : ''}">Add alongside</button></div>
      ${before ? `<div class="hint">This goes into your history, ending when ${esc(shownValue(actives.find(c => 'b:' + c.id === draft.mode)!))} started.</div>` : ''}</div>` : '';
  const linkChips = draft.links.map((l, i) =>
    `<span class="chip">${(() => { const o = byId(profile, l.id); return linkText(l.fwd, o ? kindLabel(o) : '', o ? shownValue(o) : ''); })()}<span class="x" data-act="drop-link" data-i="${i}" role="button" title="Remove">×</span></span>`).join('');

  const valueRow = isDate
    ? `<div class="fx"><span class="lab">${esc(kind.name)}</span>${dateInputs(draft.valueDate, 'vdate')}</div>`
    : `<div class="fx"><label for="c-value">${kind.titleFrom ? 'Name' : 'Value'}</label>${valueFieldHtml('c-value', draft.value, kind,
        kind.titleFrom ? 'Filled in from the details below' : custom ? '' : 'e.g. ' + example(draft.kind))}</div>`;
  const sinceRow = showSince
    ? `<div class="fx"><span class="lab">${kind.dated ? 'Since' : 'Changed'}</span><div>${dateInputs(draft.since, 'since')}<div class="hint">${
        kind.dated ? 'When this became true. A year is enough.' : 'When it changed. A year is enough.'}</div></div></div>`
    : '';

  openSheet(`${sheetTop(`${esc(a.title)} · new card`)}
    <h3 class="sh-title">Add a card</h3>
    <div class="fx kinds-row"><span class="lab">Card</span><div><div class="kinds">${kindChips}</div>${kind.hint ? `<div class="hint kind-hint">${esc(kind.hint)}</div>` : ''}</div></div>
    ${custom ? `<div class="fx"><label for="c-custom">Name it</label><input id="c-custom" value="${esc(draft.custom)}" placeholder="e.g. Eye doctor"></div>` : ''}
    ${valueRow}
    <div class="block">${draft.noteOpen ? noteInput('c-note', draft.note) : '<button class="chip" type="button" data-act="note">+ Add a note</button>'}</div>
    <div class="block">${attachHtml(draftThumbs(draft.keepsakes), draft.keepsakeMsg)}</div>
    ${tagRowHtml(kind, draft.tag)}
    ${detailsHtml(kind, draft.fields, 'cf')}
    ${modeRow}
    ${sinceRow}
    <div class="fx"><span class="lab">Linked to</span><div class="chips">${linkChips}<button class="chip" type="button" data-act="add-link">+ Link a card</button></div></div>
    <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" data-act="save">Add card</button></div>`,
  {
    note: () => { read(); draft.noteOpen = true; render(); sheetBody.querySelector<HTMLElement>('#c-note')?.focus(); },
    kind: b => {
      read();
      if (b.dataset.kind === draft.kind) return;
      // Switching type never throws away what was typed: each type keeps its own details for
      // switching back, details that mean the same thing (Street, City…) come along, and a name
      // typed by hand stays. Only a name that was built from the details is rebuilt.
      const from = currentKind();
      draft.fieldsByKind[draft.kind] = draft.fields;
      draft.kind = b.dataset.kind!;
      draft.mode = null;
      const to = currentKind();
      const carried: Record<string, string> = {};
      for (const f of to.fields ?? []) {
        const same = from.fields?.find(g => g.id === f.id && g.label === f.label && !g.choices && !f.choices && g.format === f.format);
        if (same && draft.fields[f.id]) carried[f.id] = draft.fields[f.id];
      }
      draft.fields = { ...carried, ...draft.fieldsByKind[draft.kind] };
      if (!draft.nameTyped) draft.value = to.titleFrom ? to.titleFrom(draft.fields) : '';
      render();
      (sheetBody.querySelector<HTMLElement>(draft.kind === OTHER ? '#c-custom' : '#c-value, [data-date="vdate"] .mbtn'))?.focus();
    },
    mode: b => { read(); draft.mode = b.dataset.mode!; render(); },
    'ks-add': async () => {
      read();
      const files = await pickFiles();
      if (!files.length) return;
      busy(sheetBody);
      const { added, reasons } = await keepFiles(files);
      if (draft !== current()) return dropRows(draft.youId, added.map(k => k.id)); // the sheet moved on meanwhile
      draft.keepsakes.push(...added);
      draft.keepsakeMsg = reasons.join(' ');
      render();
      sheetBody.querySelector<HTMLElement>('[data-act="ks-add"]')?.focus();
    },
    'ks-drop': b => {
      read();
      const i = draft.keepsakes.findIndex(k => k.id === b.dataset.ks);
      if (i < 0) return;
      const [gone] = draft.keepsakes.splice(i, 1);
      dropRows(draft.youId, [gone.id]);
      draft.keepsakeMsg = `Took out “${gone.name}”.`;
      render();
      sheetBody.querySelector<HTMLElement>('[data-act="ks-add"]')?.focus();
    },
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
      let value = draft.value.trim() || (kind.titleFrom ? kind.titleFrom(draft.fields) : '');
      let since = showSince ? draft.since : '';
      if (isDate) {
        if (!draft.valueDate) return sheetBody.querySelector<HTMLElement>('[data-date="vdate"] [data-d="y"]')?.focus();
        value = fmtDate(draft.valueDate);
        since = draft.valueDate; // a birthday sits at that date on the timeline
      }
      if (!value) return (sheetBody.querySelector<HTMLElement>('.details input') ?? $<HTMLInputElement>('#c-value', sheetBody)).focus();
      const related = byId(profile, draft.mode?.slice(2));
      if (since && related && ((replacing && related.since && endKey(since) < startKey(related.since)) || (before && related.since && endKey(related.since) < startKey(since)))) { alert('The end must be after the start. Check the dates before adding this card.'); return; }
      const input = { note: draft.note, area: draft.area, kind: name, value, since, tag: draft.tag, fields: draft.fields };
      const c = before
        ? addCardBefore(profile, input, draft.mode!.slice(2))
        : addCard(profile, input, replacing ? draft.mode!.slice(2) : undefined);
      if (!c) return;
      for (const l of draft.links) addLink(profile, c.id, l.id, l.fwd, l.back);
      for (const k of draft.keepsakes) addKeepsake(profile, c.id, k);
      draft.saved = true;
      save();
      closeSheet();
      emit('card-added');
    },
  });

  autosizeNote(sheetBody);
  showPictures(sheetBody, draft.keepsakes);
  attachValueField(sheetBody, 'c-value', kind);
  // The name builds itself from the details until it's typed by hand (clearing it hands it back).
  const nameInput = sheetBody.querySelector<HTMLInputElement>('#c-value');
  nameInput?.addEventListener('input', () => { draft.nameTyped = nameInput.value.trim() !== ''; });
  attachDetails(sheetBody, kind, 'cf', {
    input: () => {
      if (!kind.titleFrom || draft.nameTyped || !nameInput) return;
      nameInput.value = kind.titleFrom(readDetails(sheetBody, kind, 'cf'));
    },
  });
  sheetBody.querySelector('#c-value')?.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') act('save'); });
  if (focus) (sheetBody.querySelector<HTMLElement>('#c-value, [data-date="vdate"] .mbtn'))?.focus();
}

const EXAMPLES: Record<string, string> = {
  'Full name': 'Alex Morgan Kim', 'Preferred name': 'Alex', Pronouns: 'they/them', Birthplace: 'Raleigh, NC',
  Phone: '(555) 123-4567', Email: 'alex@example.com', Citizenship: 'United States', Language: 'Spanish',
  "Driver's license": 'NC 123456789', Passport: 'X12345678', 'Social Security number': '123-45-6789',
  Doctor: 'Dr. Maya Lee', Allergy: 'Penicillin', Address: '12 Elm St, Springfield', Property: '48 Oak Ave, Raleigh',
  Mortgage: 'Wells Fargo 30-yr fixed', Lease: '12-month lease, Greystar', Job: 'Designer at Acme Corp',
  'Health insurance': 'Aetna PPO', Book: 'East of Eden', Friend: 'Sam Rivera', Goal: 'Run a marathon',
};
const example = (kind: string) => EXAMPLES[kind] || kind;
