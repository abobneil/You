import { lifeDateProblem } from '../core/dates';
// One card, opened. It reads first: what it says, when it was true, its details, note, files, links
// and history. Changing it is a deliberate step, each explained before it happens:
//   Fix a mistake     correct it in place; the earlier wording is kept (nothing saves until Save)
//   Something changed add the new one; this one moves to history
//   This ended        asks when; moves to history; Reopen puts it back
//   Remove            only for mistakes; "Undo" brings back the card, its links and its chain
import { noteInput, autosizeNote } from './note';
import { areaById, kindLabel, kindOf, type KindInfo } from '../core/areas';
import {
  atTheTime, contextOverlap, byId, correctMeta, correctValue, endCard, linksOf, removeCard, removeLink, reopenCard, addLink, setField, setNote,
  undoRemove, type Removal,
} from '../core/cards';
import { fmtDate, fmtISO, nowISO, rangeProblem } from '../core/dates';
import type { Card } from '../core/types';
import { profile, save } from '../state';
import { checkDates, dateError, dateInputs, readDate } from './dateInput';
import { esc, linkText } from './dom';
import { openComposer } from './composer';
import { openLinkPicker } from './linkPicker';
import { attachValueField, valueFieldHtml } from './valueField';
import { isSensitive, shownValue, valueHtml, sensitiveDetail, secretHtml } from './sensitive';
import { tagRowHtml } from './tags';
import { attachDetails, detailDates, detailsHtml, readDetails, shownField } from './details';
import { maskValue } from '../core/formats';
import { closeSheet, offerUndo, openSheet, sheetBody, sheetTop } from './sheet';
import { altRevisionLabel, cardKeepsakeHandlers, cardKeepsakesHtml, removedKeepsakesHtml, showPictures, type CardKsState } from './keepsakes';

type Mode = 'read' | 'fix' | 'end';
interface Opts { mode?: Mode; keepsakes?: CardKsState; focus?: string; msg?: string; reopen?: boolean }

/** What "Fix a mistake" has typed so far. Nothing reaches the card until Save. */
interface Edit {
  id: string; kind: string; value: string; note: string; since: string; until: string; tag?: string;
  fields: Record<string, string>; unlink: string[];
  /** Show the kind's details even though none are filled in yet. */
  allDetails?: boolean;
}
let edit: Edit | undefined;

/** Opens a card, switching to its area first if needed. */
export function openCard(id: string, opts: Opts = {}) {
  if ((!opts.mode || opts.mode === 'read') && !sheetBody.closest<HTMLDialogElement>('dialog')?.open) {
    if (!byId(profile, id)) return;
    openSheet(`${sheetTop('Your card')}<h3 class="sh-title">Opening card…</h3><p role="status" id="card-opening">Getting your card ready…</p>`);
    const placeholder = sheetBody.querySelector('#card-opening');
    requestAnimationFrame(() => setTimeout(() => {
      if (placeholder?.isConnected && sheetBody.closest<HTMLDialogElement>('dialog')?.open) renderCard(id, opts);
    }, 0));
    return;
  }
  renderCard(id, opts);
}

function renderCard(id: string, opts: Opts = {}) {
  const c = byId(profile, id);
  if (!c) return;
  if (!/^#\/?life(?:\/|$)/.test(location.hash) && location.hash.slice(1).split('/')[0] !== c.area) location.hash = '#' + c.area;
  const mode = opts.mode ?? 'read';
  if (mode === 'fix') return openFix(c, opts);
  edit = undefined;
  const a = areaById(c.area)!;
  const kind = kindOf(c.area, c.kind, profile);
  const on = c.status === 'active';
  const links = linksOf(profile, c.id);
  const near = atTheTime(profile, c);
  const prev = byId(profile, c.replaces), next = byId(profile, c.replacedBy);
  const cardChip = (cid: string, text: string) => `<button class="chip" type="button" data-act="open" data-id="${esc(cid)}">${text}</button>`;
  const details = (kind.fields ?? []).filter(f => c.fields?.[f.id]);
  const extra = Object.keys(c.fields ?? {}).filter(k => !kind.fields?.some(f => f.id === k)); // kept from an earlier kind
  const when = whenText(c, kind);
  const statusLine = on ? (when ? '' : 'Current') : c.until ? `In your history since ${fmtDate(c.until)}` : 'Ended (date unknown)';

  const action = (act: string, label: string, explain: string, primary = false) =>
    `<div class="cv-act"><button class="btn${primary ? ' primary' : ''}" type="button" data-act="${act}" aria-describedby="cv-${act}-why">${label}</button>
      <span class="hint" id="cv-${act}-why">${explain}</span></div>`;

  const ending = mode === 'end'
    ? `<div class="block cv-end"><h5 id="cv-end-lab">When did it end?</h5>
        <div role="group" aria-labelledby="cv-end-lab">${dateInputs('', 'end')}</div>
        <p class="hint">A year is enough. It moves to your history, and you can reopen it.</p>
        <div class="btns"><button class="btn quiet" type="button" data-act="end-cancel">Cancel</button><button class="btn primary" type="button" data-act="end-confirm">Move to history</button></div></div>`
    : '';
  const actions = mode === 'end' ? '' : `<div class="block cv-actions">
      ${!on ? action('before', 'Add what came before', 'Add an earlier card to this history.') : ''}
      ${on ? action('change', 'Something changed', `Moved, a new job, a new number? Add the new one; this one moves to your history.`, true) : ''}
      ${action('fix', 'Fix a mistake', 'Correct a typo or a wrong date. The earlier wording is kept.')}
      ${on ? action('end', 'This ended', 'It’s no longer true. It moves to your history; you can reopen it.') : ''}
      ${!on && !c.replacedBy ? action('reopen', 'It’s still true', 'Puts it back as current, as if it never ended.') : ''}
      <div class="cv-remove"><button class="link-btn" type="button" data-act="remove" aria-describedby="cv-remove-why">Remove (added by mistake)</button>
        <span class="hint" id="cv-remove-why">Takes the card out as if it was never added. You can undo it for a few seconds.</span></div>
    </div>`;

  openSheet(`${sheetTop(`${esc(a.title)} · ${esc(kindLabel(c))} <span class="status ${on ? 'on' : ''}">${on ? 'Current' : 'History'}</span>`)}
    <h3 class="sh-title cv-value">${kind.value === 'date' ? esc(fmtDate(c.since) || c.value) : valueHtml(c)}</h3>
    <p class="cv-when">${esc([when, statusLine].filter(Boolean).join(' · '))}</p>
    ${opts.msg ? `<p class="cv-msg" role="status">${esc(opts.msg)}${opts.reopen ? ' <button class="link-btn" type="button" data-act="reopen">Reopen</button>' : ''}</p>` : ''}
    ${details.length || extra.length ? `<div class="block"><h5>Details</h5><dl class="cv-details">${details.map(f =>
      `<dt>${esc(f.label)}</dt><dd>${sensitiveDetail(c, f.id) ? secretHtml(c.fields![f.id]) : esc(shownField(f, c.fields![f.id]))}</dd>`).join('')}${extra.map(k =>
      `<dt>${esc(fieldLabel(c, k))}</dt><dd>${sensitiveDetail(c, k) ? secretHtml(c.fields![k]) : esc(c.fields![k])}</dd>`).join('')}</dl></div>` : ''}
    ${c.note ? `<div class="block"><h5>Note</h5><p class="note-text">${esc(c.note)}</p></div>` : ''}
    ${cardKeepsakesHtml(c, opts.keepsakes)}
    <div class="block"><h5>Linked</h5><div class="chips">${links.map(x =>
      cardChip(x.other.id, linkText(x.label, kindLabel(x.other), shownValue(x.other)))).join('')}
      <button class="chip" type="button" data-act="add-link">+ Link a card</button></div></div>
    ${prev || next ? `<div class="block"><h5>Changes</h5><div class="chips">${[
      prev ? `<span class="hint">Replaced</span> ${cardChip(prev.id, esc(shownValue(prev)))}` : '',
      next ? `<span class="hint">Replaced by</span> ${cardChip(next.id, esc(shownValue(next)))}` : ''].join(' ')}</div></div>` : ''}
    ${near.length ? `<div class="block"><h5>At the time</h5><div class="chips">${near.map(o =>
      cardChip(o.id, (contextOverlap(c, o) === 'possible' ? 'possibly · ' : '') + linkText('', kindLabel(o), shownValue(o)))).join('')}</div></div>` : ''}
    ${revisionsHtml(c, kind)}
    ${removedKeepsakesHtml(c)}
    <p class="hint cv-recorded">Recorded in You on ${esc(fmtISO(c.recordedAt))}${c.source ? ` · from ${esc(c.source.from)}${c.source.at ? `, ${esc(fmtISO(c.source.at))}` : ''}` : ''}. This is when it was written down, not a date in your life.</p>
    ${ending}
    ${actions}`,
  {
    ...cardKeepsakeHandlers(c, st => openCard(id, { keepsakes: st, focus: st?.focus })),
    open: b => openCard(b.dataset.id!),
    'add-link': () => openLinkPicker({
      self: { area: c.area, kind: c.kind, label: shownValue(c) },
      exclude: [c.id, ...links.map(x => x.other.id)],
      onPick: (other, fwd, back) => { addLink(profile, c.id, other, fwd, back); save(); openCard(id, { focus: '[data-act="add-link"]' }); },
      onBack: () => openCard(id, { focus: '[data-act="add-link"]' }),
    }),
    fix: () => openCard(id, { mode: 'fix' }),
    before: () => openComposer(c.area, { kind: c.kind, beforeId: c.id }),
    change: () => openComposer(c.area, { kind: c.kind, replaceId: c.id }),
    end: () => openCard(id, { mode: 'end', focus: '[data-date="end"] [data-d="y"]' }),
    'end-cancel': () => openCard(id, { focus: '[data-act="end"]' }),
    'end-confirm': () => {
      if (!checkDates(sheetBody, [{ key: 'end', label: 'When it ended' }])) return;
      const end = readDate(sheetBody, 'end');
      const bad = lifeDateProblem(end) || rangeProblem(c.since, end);
      if (bad) return dateError(sheetBody, 'end', `When it ended: ${bad}`);
      endCard(profile, id, end);
      save();
      openCard(id, { msg: 'Moved to your history.', reopen: true, focus: '.cv-msg [data-act="reopen"]' });
    },
    reopen: () => { reopenCard(profile, id); save(); openCard(id, { msg: 'Back to current.', focus: '[data-act="fix"]' }); },
    remove: () => {
      const effect = prev ? next ? `${shownValue(prev)} stays in your history.` : `${shownValue(prev)} becomes current again.` : 'The other cards stay as they are.';
      openSheet(`${sheetTop('Remove this card?')}<p>It was added by mistake. ${esc(effect)} You can undo this for a few seconds.</p><div class="btns"><button class="btn quiet" data-act="cancel">Cancel</button><button class="btn" data-act="confirm">Remove</button></div>`, { cancel: () => openCard(id), confirm: () => {
      const r = removeCard(profile, id);
      if (!r) return;
      save();
      closeSheet();
      offerRemoveUndo(r);
      }});
      sheetBody.querySelector<HTMLElement>('[data-act="cancel"]')?.focus();
    },
  });

  showPictures(sheetBody, c.keepsakes ?? []);
  if (opts.focus) sheetBody.querySelector<HTMLElement>(opts.focus)?.focus();
  if (mode === 'end') sheetBody.querySelectorAll<HTMLElement>('[data-date="end"] input').forEach(el =>
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sheetBody.querySelector<HTMLElement>('[data-act="end-confirm"]')?.click(); } }));
}

/** When it was true, with the precision it was entered with ("2000", "Mar 2021", "Mar 4, 2021"). */
function whenText(c: Card, kind: KindInfo): string {
  if (kind.value === 'date') return '';
  if (c.status === 'active') return c.since ? `${kind.dated || !c.replaces ? 'Since' : 'Changed'} ${fmtDate(c.since)}` : 'Start date not known';
  return `${c.since ? fmtDate(c.since) : 'Start not known'} – ${c.until ? fmtDate(c.until) : 'end not known'}`;
}

/** A detail's label, even if it belongs to the kind the card used to be. */
function fieldLabel(c: Card, id: string): string {
  const own = kindOf(c.area, c.kind, profile).fields?.find(f => f.id === id);
  if (own) return own.label;
  for (const k of [...areaById(c.area)?.kinds ?? [], ...(profile.kinds ?? []).filter(x => x.area === c.area)]) { const f = k.fields?.find(x => x.id === id); if (f) return f.label; }
  return id;
}

const META: Record<string, string> = { since: 'Date', until: 'End date', tag: 'Type', kind: 'Kind' };

/** "Earlier wording": every correction, newest first. Settings show what they changed from and to. */
function revisionsHtml(c: Card, kind: KindInfo): string {
  if (!c.revisions.length) return '';
  const revs = c.revisions.map((r, i) => ({ r, i }));
  const metaText = (field: string, v: string) => {
    if (field === 'since' || field === 'until') return v ? fmtDate(v) : 'not known';
    if (field === 'tag') return v ? (kindOf(c.area, c.kind, profile).tags?.find(t => t.id === v)?.label
      ?? areaById(c.area)?.kinds.flatMap(k => k.tags ?? []).find(t => t.id === v)?.label ?? v) : 'none';
    return v || 'none';
  };
  const items = revs.reverse().map(({ r, i }) => {
    const when = ` · changed ${esc(fmtISO(r.at))}`;
    if (r.field && META[r.field]) {
      // What it became: the next correction of the same setting, or what the card says now.
      const later = c.revisions.slice(i + 1).find(x => x.field === r.field);
      const now = later ? later.value : ((c as unknown as Record<string, string | undefined>)[r.field] ?? '');
      return `<li>${META[r.field]}: ${esc(metaText(r.field, r.value))} → ${esc(metaText(r.field, now))}${when}</li>`;
    }
    const fd = r.field && r.field !== 'note' && !r.field.startsWith('keepsake:') ? r.field : undefined;
    const ks = r.field?.startsWith('keepsake:');
    const fdInfo = fd ? (kind.fields?.find(x => x.id === fd) ?? areaById(c.area)?.kinds.flatMap(k => k.fields ?? []).find(x => x.id === fd)) : undefined;
    const hide = r.field === 'note' || ks ? false : fd ? sensitiveDetail(c, fd) : isSensitive(c);
    const label = r.field === 'note' ? 'Note: ' : ks ? altRevisionLabel(c, r.field!) : fd ? `${esc(fieldLabel(c, fd))}: ` : '';
    const shown = fdInfo?.type === 'date' ? fmtDate(r.value) : r.value;
    return `<li class="note-text">${label}“${hide ? secretHtml(shown) : esc(shown)}”${when}</li>`;
  }).join('');
  return `<div class="block"><h5>Earlier wording</h5><ul class="revs">${items}</ul></div>`;
}

// ---------- Fix a mistake ----------

function openFix(c: Card, opts: Opts) {
  const id = c.id;
  if (!edit || edit.id !== id) {
    edit = { id, kind: c.kind, value: c.value, note: c.note ?? '', since: c.since, until: c.until ?? '', tag: c.tag,
      fields: { ...c.fields }, unlink: [] };
  }
  const e = edit;
  const a = areaById(c.area)!;
  const kind = kindOf(c.area, e.kind, profile);
  const isDate = kind.value === 'date';
  const on = c.status === 'active';
  const links = linksOf(profile, c.id);
  const kinds = [...new Set([...a.kinds.map(k => k.name), ...(profile.kinds ?? []).filter(k => k.area === c.area).map(k => k.name), c.kind, e.kind])];
  const dateRows: { key: string; label: string }[] = [];
  const showSince = !isDate && (kind.dated || !!c.since || !!e.since);
  if (isDate) dateRows.push({ key: 'vdate', label: kind.name });
  if (showSince) dateRows.push({ key: 'since', label: kind.dated ? 'Started' : 'Changed' });
  if (!on) dateRows.push({ key: 'until', label: 'Ended' });

  openSheet(`${sheetTop(`${esc(a.title)} · ${esc(kindLabel(c))} · fixing a mistake`)}
    <h3 class="sh-title">Fix a mistake</h3>
    <p class="hint">Change what’s wrong, then Save. The earlier wording stays in this card’s history, so nothing is lost. Cancel changes nothing.</p>

    ${isDate
      ? `<div class="fx"><span class="lab" id="e-vdate-lab">${esc(kind.name)}</span><div role="group" aria-labelledby="e-vdate-lab">${dateInputs(e.since, 'vdate')}</div></div>`
      : `<div class="fx"><label for="v-value">${esc(kind.name)}</label>${valueFieldHtml('v-value', e.value, kind)}</div>`}
    ${dateRows.filter(r => r.key !== 'vdate').map(r =>
      `<div class="fx"><span class="lab" id="e-${r.key}-lab">${r.label}</span><div role="group" aria-labelledby="e-${r.key}-lab">${dateInputs(r.key === 'since' ? e.since : e.until, r.key)}<div class="hint">A year is enough.</div></div></div>`).join('')}
    ${tagRowHtml(kind, e.tag)}
    ${kind.fields?.length && !e.allDetails && !kind.fields.some(f => e.fields[f.id])
      ? '<div class="block"><button class="c-tog" type="button" data-act="all-details">+ Details</button></div>'
      : detailsHtml(kind, e.fields, 'vf', true)}
    <details><summary>Change what kind of card this is</summary>    <div class="fx"><label for="e-kind">Kind</label><select id="e-kind">${kinds.map(k =>
      `<option value="${esc(k)}"${k === e.kind ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select></div></details>
    <div class="block">${noteInput('v-note', e.note)}</div>
    ${links.length ? `<div class="block"><h5>Linked</h5><div class="chips">${links.map(x => {
      const gone = e.unlink.includes(x.link.id);
      return `<span class="chip${gone ? ' gone' : ''}">${linkText(x.label, kindLabel(x.other), shownValue(x.other))}
        <button type="button" class="x" data-act="unlink" data-link="${esc(x.link.id)}" aria-pressed="${gone}" aria-label="${esc(`${gone ? 'Keep link to' : 'Remove link to'} ${kindLabel(x.other)} ${shownValue(x.other)}`)}">${gone ? '↺' : '×'}</button></span>`; }).join('')}</div>
      ${e.unlink.length ? '<p class="hint">Crossed-out links are removed when you save.</p>' : ''}</div>` : ''}
    <p class="date-err" id="e-err" role="alert" hidden></p>
    <div class="btns"><button class="btn quiet" type="button" data-act="fix-cancel">Cancel</button><button class="btn primary" type="button" data-act="fix-save">Save changes</button></div>`,
  {
    'fix-cancel': () => { edit = undefined; openCard(id, { focus: '[data-act="fix"]' }); },
    tag: b => { readEdit(c); e.tag = b.dataset.tag; openFix(c, opts); sheetBody.querySelector<HTMLElement>(`[data-tag="${b.dataset.tag}"]`)?.focus(); },
    unlink: b => {
      readEdit(c);
      const l = b.dataset.link!;
      e.unlink = e.unlink.includes(l) ? e.unlink.filter(x => x !== l) : [...e.unlink, l];
      openFix(c, opts);
      sheetBody.querySelector<HTMLElement>(`[data-link="${l}"]`)?.focus();
    },
    'fix-save': () => saveFix(c, dateRows),
    'all-details': () => { readEdit(c); e.allDetails = true; openFix(c, { ...opts, focus: '.details input' }); },
  });

  autosizeNote(sheetBody);
  attachValueField(sheetBody, 'v-value', kind);
  attachDetails(sheetBody, kind, 'vf');
  sheetBody.querySelector<HTMLSelectElement>('#e-kind')!.addEventListener('change', ev => {
    readEdit(c);
    e.kind = (ev.target as HTMLSelectElement).value;
    openFix(c, opts);
    sheetBody.querySelector<HTMLElement>('#e-kind')?.focus();
  });
  sheetBody.querySelector('#v-value')?.addEventListener('keydown', ev => {
    if ((ev as KeyboardEvent).key === 'Enter') { ev.preventDefault(); saveFix(c, dateRows); }
  });
  if (opts.focus) sheetBody.querySelector<HTMLElement>(opts.focus)?.focus();
  else sheetBody.querySelector<HTMLElement>('#v-value, [data-date="vdate"] [data-d="y"]')?.focus();
}

/** Copies the form into the edit. Details of the kind on screen are replaced; others are kept. */
function readEdit(c: Card) {
  const e = edit!;
  const kind = kindOf(c.area, e.kind, profile);
  const v = sheetBody.querySelector<HTMLInputElement>('#v-value');
  if (v) e.value = v.value;
  const n = sheetBody.querySelector<HTMLTextAreaElement>('#v-note');
  if (n) e.note = n.value;
  if (sheetBody.querySelector('[data-date="vdate"]')) e.since = readDate(sheetBody, 'vdate');
  if (sheetBody.querySelector('[data-date="since"]')) e.since = readDate(sheetBody, 'since');
  if (sheetBody.querySelector('[data-date="until"]')) e.until = readDate(sheetBody, 'until');
  if (sheetBody.querySelector('.details')) {
    const kept = Object.fromEntries(Object.entries(e.fields).filter(([k]) => !kind.fields?.some(f => f.id === k)));
    e.fields = { ...kept, ...readDetails(sheetBody, kind, 'vf') };
  }
}

function saveFix(c: Card, dateRows: { key: string; label: string }[]) {
  const id = c.id;
  readEdit(c);
  const e = edit!;
  const kind = kindOf(c.area, e.kind, profile);
  const isDate = kind.value === 'date';
  const err = sheetBody.querySelector<HTMLElement>('#e-err')!;
  err.hidden = true;
  if (!checkDates(sheetBody, [...dateRows, ...detailDates(kind, 'vf')])) return;
  if (isDate && !e.since) {
    return dateError(sheetBody, 'vdate', `${kind.name}: add at least the year.`);
  }
  const sinceProblem = lifeDateProblem(e.since, c.area === 'goals');
  if (sinceProblem) return dateError(sheetBody, isDate ? 'vdate' : 'since', sinceProblem);
  const bad = lifeDateProblem(e.until) || (c.status === 'active' ? '' : rangeProblem(e.since, e.until));
  if (bad) {
    return dateError(sheetBody, 'until', `Ended: ${bad}`);
  }
  const oldKind = kindOf(c.area, c.kind, profile);
  const wasBuilt = !!oldKind.titleFrom && c.value === oldKind.titleFrom(c.fields ?? {});
  let value = isDate ? fmtDate(e.since) : e.value.trim();
  if (!isDate && wasBuilt && value === c.value && kind.titleFrom) value = kind.titleFrom(e.fields) || value;
  if (!value) {
    err.textContent = `${kind.name}: it can’t be empty. To take the card out, use Remove instead.`;
    err.hidden = false;
    return sheetBody.querySelector<HTMLElement>('#v-value')?.focus();
  }

  // Everything is checked; now apply each correction, each one keeping what it replaced. Only what the person
  // changed in this form is applied (compared with what the form showed when it opened), so anything another
  // tab saved meanwhile to the parts they didn't touch stays as it is.
  const now = nowISO();
  let changed = 0;
  if (e.kind !== c.kind && correctMeta(profile, id, 'kind', e.kind, now)) changed++;
  for (const k of new Set([...Object.keys(c.fields ?? {}), ...Object.keys(e.fields)])) {
    if ((e.fields[k] ?? '') !== (c.fields?.[k] ?? '') && setField(profile, id, k, e.fields[k] ?? '', now)) changed++;
  }
  if (value !== c.value && correctValue(profile, id, value, now)) changed++;
  const note = e.note.trim() ? e.note : '';
  if (note !== (c.note ?? '') && setNote(profile, id, note, now)) changed++;
  if (e.since !== (c.since ?? '') && correctMeta(profile, id, 'since', e.since, now)) changed++;
  if (c.status !== 'active' && e.until !== (c.until ?? '') && correctMeta(profile, id, 'until', e.until, now)) changed++;
  if ((e.tag ?? '') !== (c.tag ?? '') && correctMeta(profile, id, 'tag', e.tag ?? '', now)) changed++;
  for (const l of e.unlink) { removeLink(profile, l); changed++; }
  edit = undefined;
  if (changed) save();
  openCard(id, { msg: changed ? 'Saved. What it said before is under Earlier wording.' : 'Nothing was changed.', focus: '[data-act="fix"]' });
}

// ---------- Undo for Remove ----------

/** "Removed · Undo" in the shared toast. Undo brings back the card, its links and the cards around it. */
function offerRemoveUndo(r: Removal) {
  offerUndo(`Removed “${isSensitive(r.card) ? maskValue(r.card.value) : r.card.value}”`, () => {
    const back = undoRemove(profile, r);
    if (back) { save(); openCard(r.card.id, { msg: back === 'separate' ? 'Brought back, with its links, as a separate history card: the cards around it changed since, so their history was left as it is now.' : 'Brought back, with its links.' }); }
  });
}
