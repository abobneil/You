import { lifeDateProblem } from '../core/dates';
// "Add a card", kept light: pick what it is, type one line, say when (a year is enough), Add.
// Everything else (details, a note, photos and files, links) waits behind quiet toggles, and
// whether it replaces the current card is one plain sentence with a "Change" link.
import { noteInput, autosizeNote } from './note';
import { areaById, kindLabel, kindOf, tagOf, type KindInfo } from '../core/areas';
import { activeOf, addCard, addCardBefore, addKeepsake, addLink, byId, defaultMode } from '../core/cards';
import type { Keepsake } from '../core/keepsakes';
import { fmtDate, isValidDate, startKey, endKey } from '../core/dates';
import type { AreaId, Card, FuzzyDate } from '../core/types';
import { profile, save } from '../state';
import { checkDates, dateError, dateInputs, readDate } from './dateInput';
import { esc, linkText, showFieldError } from './dom';
import { emit } from './events';
import { openLinkPicker } from './linkPicker';
import { attachValueField, valueFieldHtml } from './valueField';
import { shownValue } from './sensitive';
import { tagRowHtml } from './tags';
import { maskValue } from '../core/formats';
import { draftUndoPending, act, closeSheet, onSheetClose, openSheet, sheetBody, sheetTop } from './sheet';
import { attachHtml, busy, draftThumbs, keepFiles, pickFiles, showPictures } from './keepsakes';
import { dropRows } from '../storage/keepsakeAccess';
import { attachDetails, detailDates, detailsHtml, readDetails } from './details';

const OTHER = '__other';
/** How many of an area's kinds show before "More…". */
const SUGGEST = matchMedia('(max-width: 560px)').matches ? 3 : 6;

type Section = 'details' | 'note' | 'files' | 'links';

interface Draft {
  note: string;
  area: AreaId;
  kind: string;
  custom: string;
  /** Details the person named for a kind of their own ("Something else…"). */
  customFields: { id: string; label: string; type: 'text' | 'date' }[];
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
  /** The replace / alongside / came-before options are showing. */
  modeOpen: boolean;
  replaceId?: string;
  links: { id: string; fwd: string; back: string }[];
  /** Files attached before the card exists. Their encrypted bytes are already stored. */
  keepsakes: Keepsake[];
  keepsakeMsg: string;
  /** Optional sections the person opened. */
  open: Set<Section>;
  /** Every kind chip is showing, not just the first few. */
  moreKinds: boolean;
  /** A plain message under the value, e.g. when it's empty. */
  valueMsg: string;
  /** Whose rows the drafted files are in, so they can be cleared if the card is never added. */
  youId: string;
  saved: boolean;
}
let draft: Draft | undefined;
/** What was typed, as it was when the composer opened, to tell whether backing out loses anything. */
let typedAtStart = '';
const typed = () => { const d = draft!; return JSON.stringify([d.note, d.custom, d.customFields, d.value, d.valueDate, d.since, d.fields, d.links, d.keepsakes.map(k => k.id)]); };
/** Lets the sheet offer "Draft discarded · Undo" when the composer is dismissed with typing in it. */
const draftHook = {
  // A date that can't be read yet still counts as typed.
  dirty: () => { try { read(); } catch { return true; } return typed() !== typedAtStart; },
  snapshot: () => structuredClone(draft),
  restore: (snap: unknown) => { clearTimeout(dropTimer); draft = structuredClone(snap as Draft); render(true); },
  stash: () => {
    try { read(); } catch { /* a half-typed date: keep the rest */ }
    const d = draft!;
    d.saved = true; // its stored files now belong to the kept draft
    clearTimeout(dropTimer);
    return { kind: 'card', data: JSON.parse(JSON.stringify({ ...d, open: [...d.open], saved: false })) };
  },
};

/** Reopens a card draft that was kept when the screen locked. */
export function resumeDraft(data: unknown) {
  const d = data as Draft & { open: Section[] };
  draft = { ...d, open: new Set(d.open || []), youId: profile.id ?? '', saved: false, keepsakes: d.keepsakes || [], links: d.links || [],
    fields: d.fields || {}, fieldsByKind: d.fieldsByKind || {}, customFields: d.customFields || [] };
  typedAtStart = ''; // it came back with typing in it
  render(true);
}

// Closing without adding the card: its drafted files go too, once the Undo window has passed.
let dropTimer: ReturnType<typeof setTimeout> | undefined;
onSheetClose(() => {
  if (!draft || draft.saved || !draft.keepsakes.length) return;
  const youId = draft.youId, ids = draft.keepsakes.map(k => k.id);
  clearTimeout(dropTimer);
  const clean = () => { if (draftUndoPending()) { dropTimer = setTimeout(clean, 1000); return; } void dropRows(youId, ids); };
  dropTimer = setTimeout(clean, 16_000);
});

export function openComposer(area: AreaId, preset: { kind?: string; replaceId?: string; beforeId?: string; since?: string } = {}) {
  draft = { note: '', area, kind: preset.kind || firstOpenKind(area), custom: '', customFields: [], value: '', valueDate: '', since: preset.since || '',
    fields: {}, fieldsByKind: {}, nameTyped: false, mode: preset.beforeId ? 'b:' + preset.beforeId : null, modeOpen: false, replaceId: preset.replaceId, links: [],
    keepsakes: [], keepsakeMsg: '', open: new Set(), moreKinds: false, valueMsg: '', youId: profile.id ?? '', saved: false };
  typedAtStart = typed();
  render(true);
}

/** Starts on the first suggested kind that has nothing yet, so "Add" doesn't default to replacing. */
function firstOpenKind(area: AreaId): string {
  const kinds = areaById(area)!.kinds;
  return (kinds.find(k => !activeOf(profile, area, k.name).length) ?? kinds[0]).name;
}

const current = () => draft!;
const currentKind = (d = current()): KindInfo => d.kind === OTHER
  ? { ...kindOf(d.area, d.custom || 'Note', profile), fields: d.customFields }
  : kindOf(d.area, d.kind, profile);

/** Copies whatever is on screen into the draft. Sections that are closed keep what they had. */
function read() {
  const d = current();
  d.note = sheetBody.querySelector<HTMLTextAreaElement>('#c-note')?.value ?? d.note;
  d.custom = sheetBody.querySelector<HTMLInputElement>('#c-custom')?.value.trim() ?? d.custom;
  sheetBody.querySelectorAll<HTMLInputElement>('[data-custom-label]').forEach(el => { d.customFields[Number(el.dataset.customLabel)].label = el.value.trim(); });
  const v = sheetBody.querySelector<HTMLInputElement>('#c-value');
  if (v) d.value = v.value;
  if (d.value.trim()) d.valueMsg = '';
  if (sheetBody.querySelector('[data-date="vdate"]')) d.valueDate = readDate(sheetBody, 'vdate');
  if (sheetBody.querySelector('[data-date="since"]')) d.since = readDate(sheetBody, 'since');
  if (sheetBody.querySelector('.details')) d.fields = readDetails(sheetBody, currentKind(), 'cf');
}

/** "Address" → "address"; keeps names like "Driver's license" readable mid-sentence. */
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const named = (c: Card) => `${(t => (t ? esc(t.label) + ' ' : ''))(tagOf(c))}<b>${esc(shownValue(c))}</b>`;

/** The one sentence that says what adding this card will do to the cards already there. */
function modeSentence(d: Draft, actives: Card[]): string {
  const target = byId(profile, d.mode?.slice(2));
  const k = lower(d.kind);
  if (d.mode?.startsWith('r:') && target) return `This replaces your current ${esc(k)}, ${named(target)} (it moves to your history).`;
  if (d.mode?.startsWith('b:') && target) return `This goes into your history, before ${named(target)} (it ends when that started).`;
  return actives.length === 1
    ? `This is added alongside ${named(actives[0])}; both stay current.`
    : `This is added alongside the ${actives.length} you already have; they all stay current.`;
}

function modeOptions(d: Draft, actives: Card[], kind: KindInfo): string {
  const opt = (mode: string, label: string, effect: string) =>
    `<button type="button" class="c-opt${d.mode === mode ? ' on' : ''}" data-act="mode" data-mode="${esc(mode)}" aria-pressed="${d.mode === mode}">
      <span>${label}</span><small>${effect}</small></button>`;
  return `<div class="c-opts" role="group" aria-label="What this card does">${[
    ...actives.map(c => opt('r:' + c.id, `Replaces ${named(c)}`, `${esc(shownValue(c))} moves to your history, ending when this starts.`)),
    opt('add', 'Alongside it', actives.length === 1 ? `${esc(shownValue(actives[0]))} stays current too.` : 'The ones you have stay current too.'),
    ...profile.cards.filter(c => c.area === d.area && c.kind === d.kind && !kind.many).map(c =>
      opt('b:' + c.id, `Came before ${named(c)}`, `This goes into your history, ending when ${esc(shownValue(c))} started.`)),
  ].join('')}</div>`;
}

/** A quiet "+ Details" style toggle that shows a count once its section has something in it. */
function toggle(s: Section, label: string, count: number, open: boolean) {
  return `<button type="button" class="c-tog${count ? ' has' : ''}" data-act="sec" data-sec="${s}" aria-expanded="${open}">${
    count ? `${label} · ${count}` : `+ ${label}`}</button>`;
}

function render(focus = false) {
  const d = current();
  const a = areaById(d.area)!;
  const custom = d.kind === OTHER;
  const kind = currentKind(d);
  const actives = custom ? [] : activeOf(profile, d.area, d.kind);
  if (d.mode && d.mode !== 'add' && !actives.some(c => 'r:' + c.id === d.mode || 'b:' + c.id === d.mode)) d.mode = null;
  if (!d.mode) d.mode = custom ? 'add' : defaultMode(profile, d.area, d.kind, d.replaceId);
  const replacing = d.mode.startsWith('r:');
  const before = d.mode.startsWith('b:');
  if (!kind.tags?.some(t => t.id === d.tag)) d.tag = kind.tags?.[0]?.id;
  const isDate = kind.value === 'date';
  // Facts (Full name) have no start date, but replacing one is a change worth dating.
  const showSince = !isDate && (kind.dated || replacing || before);
  const hasDetails = !!(kind.fields?.length || kind.tags?.length);
  const detailCount = Object.keys(d.fields).filter(id => kind.fields?.some(f => f.id === id)).length;

  // At most a few kinds at first, plus the one that's picked; "More…" shows the rest.
  const all = [...a.kinds, ...(profile.kinds ?? []).filter(k => k.area === d.area && !a.kinds.some(b => b.name === k.name))];
  const shown = d.moreKinds ? all : all.filter((k, i) => i < SUGGEST || k.name === d.kind);
  const kindChips = shown.map(k => {
    const has = activeOf(profile, d.area, k.name).length > 0;
    return `<button type="button" data-act="kind" data-kind="${esc(k.name)}" class="${k.name === d.kind ? 'on' : ''}${has ? ' has' : ''}"
      aria-pressed="${k.name === d.kind}">${esc(k.name)}${has ? '<span class="vh"> (you have one)</span>' : ''}</button>`;
  }).join('')
    + (shown.length < all.length ? `<button type="button" class="more-kinds" data-act="more-kinds">More…</button>` : '')
    + `<button ${!d.moreKinds && matchMedia('(max-width: 560px)').matches ? 'hidden' : ''} type="button" data-act="kind" data-kind="${OTHER}" class="${custom ? 'on' : ''}" aria-pressed="${custom}">Something else…</button>`;

  const linkChips = d.links.map((l, i) =>
    { const o = byId(profile, l.id);
      return `<span class="chip">${linkText(l.fwd, o ? kindLabel(o) : '', o ? shownValue(o) : '')}<button type="button" class="x" data-act="drop-link" data-i="${i}"
        aria-label="Remove link to ${esc(o ? `${kindLabel(o)} ${shownValue(o)}` : 'this card')}">×</button></span>`; }).join('');

  const valueLabel = custom ? 'What is it?' : kind.name;
  const valueRow = isDate
    ? `<div class="fx c-main"><span class="lab" id="c-vdate-lab">${esc(kind.name)}</span><div role="group" aria-labelledby="c-vdate-lab">${dateInputs(d.valueDate, 'vdate')}</div></div>`
    : `<div class="fx c-main"><label for="c-value">${esc(valueLabel)}</label><div>${valueFieldHtml('c-value', d.value, kind,
        custom ? 'e.g. Eye doctor: Dr. Patel' : 'e.g. ' + example(d.kind))}${d.valueMsg ? `<p class="date-err" role="alert">${esc(d.valueMsg)}</p>` : ''}</div></div>`;
  const whenLabel = replacing ? 'When did it change?' : before ? 'When did it start?' : 'When?';
  const sinceRow = showSince
    ? `<div class="fx c-when"><span class="lab" id="c-when-lab">${whenLabel}</span><div role="group" aria-labelledby="c-when-lab" aria-describedby="c-when-hint">${
        dateInputs(d.since, 'since')}<div class="hint" id="c-when-hint">A year is enough.</div></div></div>`
    : '';
  const modeRow = actives.length || d.mode?.startsWith('b:')
    ? `<div class="c-mode"><p>${modeSentence(d, actives)} <button ${d.kind === 'Job' ? 'hidden' : ''} type="button" class="link-btn" data-act="mode-open" aria-expanded="${d.modeOpen}">${d.modeOpen ? 'Done' : 'Change'}</button></p>
        ${d.modeOpen || d.kind === 'Job' ? modeOptions(d, actives, kind) : ''}</div>`
    : '';

  const sections = [
    d.open.has('details') && hasDetails ? `<div class="c-sec">${tagRowHtml(kind, d.tag)}${detailsHtml(kind, d.fields, 'cf')}</div>` : '',
    d.open.has('note') ? `<div class="c-sec block">${noteInput('c-note', d.note)}</div>` : '',
    d.open.has('files') || d.keepsakes.length ? `<div class="c-sec block">${attachHtml(draftThumbs(d.keepsakes), d.keepsakeMsg)}</div>` : '',
    d.links.length ? `<div class="c-sec block"><h5>Linked to</h5><div class="chips">${linkChips}</div></div>` : '',
  ].join('');

  openSheet(`${sheetTop(`${esc(a.title)} · new card`)}
    <h3 class="sh-title">Add to ${esc(a.title)}</h3>
    <div class="fx kinds-row"><span class="lab" id="c-kind-lab">What is it?</span><div><div class="kinds" role="group" aria-labelledby="c-kind-lab">${kindChips}</div>${kind.hint ? `<div class="hint kind-hint">${esc(kind.hint)}</div>` : ''}</div></div>
    ${custom ? `<div class="fx"><label for="c-custom">Name it</label><input id="c-custom" autocomplete="off" value="${esc(d.custom)}" placeholder="e.g. Eye doctor"></div>
      ${d.customFields.map((f, i) => `<div class="fx"><label for="custom-label-${i}">Detail label</label><div><input id="custom-label-${i}" autocomplete="off" data-custom-label="${i}" value="${esc(f.label)}" placeholder="e.g. Location"><select aria-label="Detail type" data-custom-type="${i}"><option value="text" ${f.type === 'text' ? 'selected' : ''}>Text</option><option value="date" ${f.type === 'date' ? 'selected' : ''}>Date</option></select></div></div>`).join('')}
      <div class="fx"><span class="lab"></span><div><button type="button" class="chip" data-act="custom-detail">+ Add a detail</button></div></div>` : ''}
    ${valueRow}
    ${sinceRow}
    ${modeRow}
    <div class="c-toggles" role="group" aria-label="Optional extras">
      ${hasDetails ? toggle('details', 'Details', detailCount, d.open.has('details')) : ''}
      ${toggle('note', 'Note', d.note.trim() ? 1 : 0, d.open.has('note')).replace(/Note · 1/, 'Note ✓')}
      ${toggle('files', 'Photo or file', d.keepsakes.length, d.open.has('files') || d.keepsakes.length > 0).replace(/Photo or file · (\d+)/, 'Files · $1')}
      ${toggle('links', 'Link', d.links.length, d.links.length > 0).replace(/Link · (\d+)/, 'Links · $1')}
    </div>
    ${sections}
    <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" data-act="save">Add</button></div>`,
  {
    // A detail of the person's own: name it here, fill it in under Details.
    'custom-detail': () => {
      read();
      d.customFields.push({ id: 'detail' + (d.customFields.length + 1), label: '', type: 'text' });
      d.open.add('details');
      render();
      sheetBody.querySelector<HTMLElement>(`#custom-label-${d.customFields.length - 1}`)?.focus();
    },
    sec: b => {
      read();
      const s = b.dataset.sec as Section;
      if (s === 'links') return startLink();
      if (s === 'files') {
        if (!d.keepsakes.length && !d.open.has('files')) { d.open.add('files'); render(); return addFiles(); }
        if (d.keepsakes.length) return addFiles(); // with files already there, the toggle adds another
        d.open.delete('files');
      } else if (d.open.has(s)) d.open.delete(s); else d.open.add(s);
      render();
      const focusSel = s === 'note' ? '#c-note' : s === 'details' ? '.c-sec input, .c-sec button' : '';
      if (d.open.has(s) && focusSel) sheetBody.querySelector<HTMLElement>(focusSel)?.focus();
      else sheetBody.querySelector<HTMLElement>(`[data-sec="${s}"]`)?.focus();
    },
    'more-kinds': () => { read(); d.moreKinds = true; render(); sheetBody.querySelector<HTMLElement>(`.kinds button:nth-child(${SUGGEST + 1})`)?.focus(); },
    kind: b => {
      read();
      if (b.dataset.kind === d.kind) return;
      // Switching type never throws away what was typed: each type keeps its own details for
      // switching back, details that mean the same thing (Street, City…) come along, and a name
      // typed by hand stays. Only a name that was built from the details is rebuilt.
      const from = currentKind();
      d.fieldsByKind[d.kind] = d.fields;
      d.kind = b.dataset.kind!;
      d.mode = null;
      d.modeOpen = false;
      d.valueMsg = '';
      const to = currentKind();
      const carried: Record<string, string> = {};
      for (const f of to.fields ?? []) {
        const same = from.fields?.find(g => g.id === f.id && g.label === f.label && !g.choices && !f.choices && g.format === f.format);
        if (same && d.fields[f.id]) carried[f.id] = d.fields[f.id];
      }
      d.fields = { ...carried, ...d.fieldsByKind[d.kind] };
      if (!d.nameTyped) d.value = to.titleFrom ? to.titleFrom(d.fields) : '';
      render();
      (sheetBody.querySelector<HTMLElement>(d.kind === OTHER ? '#c-custom' : '#c-value, [data-date="vdate"] [data-d="y"]'))?.focus();
    },
    'mode-open': () => { read(); d.modeOpen = !d.modeOpen; render(); sheetBody.querySelector<HTMLElement>(d.modeOpen ? '.c-opt.on' : '[data-act="mode-open"]')?.focus(); },
    mode: b => { read(); d.mode = b.dataset.mode!; d.modeOpen = false; render(); sheetBody.querySelector<HTMLElement>('[data-act="mode-open"]')?.focus(); },
    'ks-add': () => { read(); return addFiles(); },
    'ks-drop': b => {
      read();
      const i = d.keepsakes.findIndex(k => k.id === b.dataset.ks);
      if (i < 0) return;
      const [gone] = d.keepsakes.splice(i, 1);
      dropRows(d.youId, [gone.id]);
      d.keepsakeMsg = `Took out “${gone.name}”.`;
      render();
      sheetBody.querySelector<HTMLElement>('[data-act="ks-add"]')?.focus();
    },
    tag: b => { read(); d.tag = b.dataset.tag; render(); sheetBody.querySelector<HTMLElement>(`[data-tag="${b.dataset.tag}"]`)?.focus(); },
    'drop-link': b => { read(); d.links.splice(+b.dataset.i!, 1); render(); sheetBody.querySelector<HTMLElement>('[data-sec="links"]')?.focus(); },
    save: () => saveDraft(),
  }, { draft: draftHook });

  sheetBody.querySelectorAll<HTMLSelectElement>('[data-custom-type]').forEach(el => el.addEventListener('change', () => {
    read(); d.customFields[Number(el.dataset.customType)].type = el.value as 'text' | 'date'; render();
  }));
  autosizeNote(sheetBody);
  showPictures(sheetBody, d.keepsakes);
  attachValueField(sheetBody, 'c-value', kind);
  // The name builds itself from the details until it's typed by hand (clearing it hands it back).
  const nameInput = sheetBody.querySelector<HTMLInputElement>('#c-value');
  nameInput?.addEventListener('input', () => { d.nameTyped = nameInput.value.trim() !== ''; });
  attachDetails(sheetBody, kind, 'cf', {
    input: () => {
      if (!kind.titleFrom || d.nameTyped || !nameInput) return;
      nameInput.value = kind.titleFrom(readDetails(sheetBody, kind, 'cf'));
    },
  });
  // Enter adds the card from the main box, the date, or the custom name.
  sheetBody.querySelectorAll<HTMLElement>('#c-value, #c-custom, [data-date="since"] input, [data-date="vdate"] input').forEach(el =>
    el.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); act('save'); } }));
  if (focus) (sheetBody.querySelector<HTMLElement>('#c-value, [data-date="vdate"] [data-d="y"]'))?.focus();
}

async function addFiles() {
  const d = current();
  const files = await pickFiles();
  if (!files.length) return;
  busy(sheetBody);
  const { added, reasons } = await keepFiles(files);
  if (d !== draft) return dropRows(d.youId, added.map(k => k.id)); // the sheet moved on meanwhile
  d.keepsakes.push(...added);
  d.keepsakeMsg = reasons.join(' ');
  d.open.add('files');
  render();
  sheetBody.querySelector<HTMLElement>('[data-act="ks-add"]')?.focus();
}

function startLink() {
  const d = current();
  const kind = currentKind(d);
  openLinkPicker({
    self: {
      area: d.area,
      kind: d.kind === OTHER ? (d.custom || 'Note') : d.kind,
      label: (kind.value === 'date' ? fmtDate(d.valueDate) : kind.sensitive ? maskValue(d.value.trim()) : d.value.trim()) || 'This card',
    },
    exclude: d.links.map(l => l.id),
    onPick: (id, fwd, back) => { d.links.push({ id, fwd, back }); render(); },
    onBack: () => { render(); sheetBody.querySelector<HTMLElement>('[data-sec="links"]')?.focus(); },
  });
}

function saveDraft() {
  read();
  const d = current();
  const kind = currentKind(d);
  const isDate = kind.value === 'date';
  const replacing = !!d.mode?.startsWith('r:');
  const before = !!d.mode?.startsWith('b:');
  const showSince = !isDate && (kind.dated || replacing || before);
  const name = d.kind === OTHER ? d.custom : d.kind;
  if (!name) { const f = sheetBody.querySelector<HTMLInputElement>('#c-custom'); if (f) showFieldError(f, 'Name this card, for example “Eye doctor”.'); return; }

  // A detail date that isn't real, typed in a section that's now closed: open it so the message shows.
  if ((kind.fields ?? []).some(f => f.type === 'date' && d.fields[f.id] && !isValidDate(d.fields[f.id])) && !d.open.has('details')) {
    d.open.add('details');
    render();
  }
  if (!checkDates(sheetBody, [
    ...(isDate ? [{ key: 'vdate', label: kind.name }] : []),
    ...(showSince ? [{ key: 'since', label: 'When' }] : []),
    ...(d.open.has('details') ? detailDates(kind, 'cf') : []),
  ])) return;
  const lifeProblem = lifeDateProblem(isDate ? d.valueDate : d.since, d.area === 'goals');
  if (lifeProblem) return dateError(sheetBody, isDate ? 'vdate' : 'since', lifeProblem);

  let value = d.value.trim() || (kind.titleFrom ? kind.titleFrom(d.fields) : '');
  let since = showSince ? d.since : '';
  if (isDate) {
    if (!d.valueDate) {
      return dateError(sheetBody, 'vdate', `${kind.name}: add at least the year.`);
    }
    value = fmtDate(d.valueDate);
    since = d.valueDate; // a birthday sits at that date on the timeline
  }
  if (!value) {
    d.valueMsg = `Type ${kind.titleFrom ? 'a short name or the ' + lower(kind.name) : 'what it is'} first, like “${d.kind === OTHER ? 'Dr. Patel' : example(d.kind)}”.`;
    render();
    return sheetBody.querySelector<HTMLElement>('#c-value')?.focus();
  }
  const related = byId(profile, d.mode?.slice(2));
  if (since && related?.since) {
    const what = shownValue(related);
    if (replacing && endKey(since) < startKey(related.since)) {
      return dateError(sheetBody, 'since', `When: ${fmtDate(since)} is before ${what} started (${fmtDate(related.since)}). Change the date, or choose “Came before” under Change.`);
    }
    if (before && endKey(related.since) < startKey(since)) {
      return dateError(sheetBody, 'since', `When: this would start after ${what} started (${fmtDate(related.since)}). Change the date, or choose another option under Change.`);
    }
  }
  if (d.kind === OTHER) {
    profile.kinds ??= [];
    const definition = { area: d.area, name, fields: d.customFields.filter(f => f.label) };
    const index = profile.kinds.findIndex(k => k.area === d.area && k.name === name);
    if (index < 0) profile.kinds.push(definition); else profile.kinds[index] = definition;
  }
  const input = { note: d.note.trim() ? d.note : '', area: d.area, kind: name, value, since, tag: d.tag, fields: d.fields };
  const c = before
    ? addCardBefore(profile, input, d.mode!.slice(2))
    : addCard(profile, input, replacing ? d.mode!.slice(2) : undefined);
  if (!c) return;
  for (const l of d.links) addLink(profile, c.id, l.id, l.fwd, l.back);
  for (const k of d.keepsakes) addKeepsake(profile, c.id, k);
  d.saved = true;
  save();
  closeSheet();
  emit('card-added');
}

const EXAMPLES: Record<string, string> = {
  'Full name': 'Alex Morgan Kim', 'Preferred name': 'Alex', Pronouns: 'they/them', Birthplace: 'Raleigh, NC',
  Phone: '(555) 123-4567', Email: 'alex@example.com', Citizenship: 'United States', Language: 'Spanish',
  "Driver's license": 'NC 123456789', Passport: 'X12345678', 'Social Security number': '123-45-6789',
  Doctor: 'Dr. Maya Lee', Allergy: 'Penicillin', Address: '12 Elm St, Springfield', Property: '48 Oak Ave, Raleigh',
  Mortgage: 'Wells Fargo 30-yr fixed', Lease: '12-month lease, Greystar', Job: 'Designer at Acme Corp',
  'Health insurance': 'Aetna PPO', Book: 'East of Eden', Friend: 'Sam Rivera', Goal: 'Run a marathon',
  Vehicle: '2019 blue Honda Civic', Utility: 'Duke Energy', Internet: 'Spectrum 300 Mbps', Skill: 'Spanish',
  Education: 'BA, UNC Chapel Hill', Partner: 'Jordan Lee',
  Dentist: 'Dr. Priya Shah', Medication: 'Lisinopril 10 mg', Immunization: 'Flu vaccine', Condition: 'Asthma', 'Emergency contact': 'Sam Rivera', Certification: 'First aid certificate', Award: 'Volunteer of the year', 'Profile link': 'linkedin.com/in/alex', 'Home insurance': 'Allstate home policy', 'Family member': 'Aunt Rosa', Child: 'Jamie', Pet: 'Milo the cat', Mentor: 'Dr. Chen', Music: 'Nina Simone', 'Movie or show': 'The Good Place', Podcast: '99% Invisible', Food: 'Sunday lentil soup', Hobby: 'Watercolour painting', Sport: 'Weekend swimming', 'Place visited': 'Lisbon', 'Place to go': 'Kyoto', Habit: 'Walk after lunch', Learning: 'Conversational Italian', Someday: 'Live near the sea', 'Bucket list': 'See the northern lights', Value: 'Make time for family',
  'Bank account': 'Everyday checking at Chase', 'Credit card': 'Travel Visa', Bill: 'Monthly electricity', 'Retirement account': 'School district pension', Investment: 'Vanguard index fund', 'Insurance policy': 'State Farm auto policy', 'Tax preparer': 'Morgan at H&R Block', 'Saving for': 'A trip to Lisbon',
};
const example = (kind: string) => EXAMPLES[kind] || kind;
