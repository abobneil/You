// "Add a card": kind, value, since-date, replace-or-alongside, and links.
import { areaById } from '../core/areas';
import { activeOf, addCard, addLink, byId, defaultMode } from '../core/cards';
import type { AreaId, FuzzyDate } from '../core/types';
import { profile, save } from '../state';
import { dateInputs, readDate } from './dateInput';
import { $, esc } from './dom';
import { emit } from './events';
import { openLinkPicker } from './linkPicker';
import { act, closeSheet, openSheet, sheetBody, sheetTop } from './sheet';

const OTHER = '__other';

interface Draft {
  area: AreaId;
  kind: string;
  custom: string;
  value: string;
  since: FuzzyDate;
  mode: string | null;
  replaceId?: string;
  links: { id: string; fwd: string; back: string }[];
}
let draft: Draft;

export function openComposer(area: AreaId, preset: { kind?: string; replaceId?: string } = {}) {
  draft = { area, kind: preset.kind || areaById(area)!.kinds[0].name, custom: '', value: '', since: '',
    mode: null, replaceId: preset.replaceId, links: [] };
  render(true);
}

function read() {
  draft.kind = $<HTMLSelectElement>('#c-kind', sheetBody).value;
  draft.custom = sheetBody.querySelector<HTMLInputElement>('#c-custom')?.value.trim() ?? '';
  draft.value = $<HTMLInputElement>('#c-value', sheetBody).value;
  draft.since = readDate(sheetBody, 'since');
}

function render(focus = false) {
  const a = areaById(draft.area)!;
  const custom = draft.kind === OTHER;
  const actives = custom ? [] : activeOf(profile, draft.area, draft.kind);
  if (draft.mode && draft.mode !== 'add' && !actives.some(c => 'r:' + c.id === draft.mode)) draft.mode = null;
  if (!draft.mode) draft.mode = custom ? 'add' : defaultMode(profile, draft.area, draft.kind, draft.replaceId);

  const kindOpts = a.kinds.map(k => `<option${k.name === draft.kind ? ' selected' : ''}>${esc(k.name)}</option>`).join('')
    + `<option value="${OTHER}"${custom ? ' selected' : ''}>Something else…</option>`;
  const modeRow = actives.length ? `<div class="fx"><span class="lab">Current ${esc(draft.kind.toLowerCase())}</span>
    <div class="seg">${actives.map(c =>
      `<button type="button" data-act="mode" data-mode="r:${c.id}" class="${draft.mode === 'r:' + c.id ? 'on' : ''}">Replaces ${esc(c.value)}</button>`).join('')}
      <button type="button" data-act="mode" data-mode="add" class="${draft.mode === 'add' ? 'on' : ''}">Add alongside</button></div></div>` : '';
  const linkChips = draft.links.map((l, i) =>
    `<span class="chip">${l.fwd ? `<em>${esc(l.fwd)}</em> ` : ''}${esc(byId(profile, l.id)?.value)}<span class="x" data-act="drop-link" data-i="${i}" role="button" title="Remove">×</span></span>`).join('');

  openSheet(`${sheetTop(`${esc(a.title)} · new card`)}
    <h3 class="sh-title">Add a card</h3>
    <div class="fx"><label for="c-kind">Card</label><select id="c-kind">${kindOpts}</select></div>
    ${custom ? `<div class="fx"><label for="c-custom">Name it</label><input id="c-custom" value="${esc(draft.custom)}" placeholder="e.g. Eye doctor"></div>` : ''}
    <div class="fx"><label for="c-value">Value</label><input id="c-value" class="big" value="${esc(draft.value)}" placeholder="${custom ? '' : 'e.g. ' + esc(example(draft.kind))}" autocomplete="off"></div>
    <div class="fx"><span class="lab">Since</span><div>${dateInputs(draft.since, 'since')}<div class="hint">When this became true. A year is enough.</div></div></div>
    ${modeRow}
    <div class="fx"><span class="lab">Linked to</span><div class="chips">${linkChips}<button class="chip" type="button" data-act="add-link">+ Link a card</button></div></div>
    <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" data-act="save">Add card</button></div>`,
  {
    mode: b => { read(); draft.mode = b.dataset.mode!; render(); },
    'drop-link': b => { read(); draft.links.splice(+b.dataset.i!, 1); render(); },
    'add-link': () => {
      read();
      openLinkPicker({
        selfLabel: draft.value.trim() || 'This card',
        exclude: draft.links.map(l => l.id),
        onPick: (id, fwd, back) => { draft.links.push({ id, fwd, back }); render(); },
        onBack: () => render(),
      });
    },
    save: () => {
      read();
      const kind = draft.kind === OTHER ? draft.custom : draft.kind;
      if (!kind) return sheetBody.querySelector<HTMLInputElement>('#c-custom')?.focus();
      if (!draft.value.trim()) return $<HTMLInputElement>('#c-value', sheetBody).focus();
      const replaceId = draft.mode?.startsWith('r:') ? draft.mode.slice(2) : undefined;
      const c = addCard(profile, { area: draft.area, kind, value: draft.value, since: draft.since }, replaceId);
      for (const l of draft.links) addLink(profile, c.id, l.id, l.fwd, l.back);
      save();
      closeSheet();
      emit('card-added');
    },
  });

  $('#c-kind', sheetBody).addEventListener('change', () => {
    read(); draft.mode = null; render();
    $<HTMLInputElement>(draft.kind === OTHER ? '#c-custom' : '#c-value', sheetBody).focus();
  });
  $('#c-value', sheetBody).addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') act('save'); });
  if (focus) $<HTMLInputElement>('#c-value', sheetBody).focus();
}

const EXAMPLES: Record<string, string> = {
  Doctor: 'Dr. Maya Lee', Allergy: 'Penicillin', Address: '12 Elm St, Springfield', Job: 'Designer at Acme Corp',
  'Health insurance': 'Aetna PPO', Book: 'East of Eden', Friend: 'Sam Rivera', Goal: 'Run a marathon', Phone: '(555) 123-4567',
};
const example = (kind: string) => EXAMPLES[kind] || kind;
