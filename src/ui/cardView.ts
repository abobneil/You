// One card, opened: correct it, link it, replace it, end it, or (rarely) remove it.
import { areaById, kindLabel, kindOf } from '../core/areas';
import { atTheTime, byId, correctValue, endCard, linksOf, removeCard, removeLink, reopenCard, addLink, setField } from '../core/cards';
import { fmtDate, fmtISO, thisMonth } from '../core/dates';
import { profile, save } from '../state';
import { dateInputs, readDate } from './dateInput';
import { esc, linkText } from './dom';
import { openComposer } from './composer';
import { openLinkPicker } from './linkPicker';
import { attachValueField, valueFieldHtml } from './valueField';
import { isSensitive, shownValue } from './sensitive';
import { tagRowHtml } from './tags';
import { attachDetails, detailsHtml } from './details';
import { maskValue } from '../core/formats';
import { closeSheet, openSheet, sheetBody, sheetTop } from './sheet';

/** Opens a card, switching to its area first if needed. */
export function openCard(id: string, opts: { ending?: boolean } = {}) {
  const c = byId(profile, id);
  if (!c) return;
  if (location.hash !== '#' + c.area) location.hash = '#' + c.area;
  const a = areaById(c.area)!;
  const kind = kindOf(c.area, c.kind);
  const isDate = kind.value === 'date';
  const on = c.status === 'active';
  const links = linksOf(profile, c.id);
  const near = atTheTime(profile, c);
  const prev = byId(profile, c.replaces), next = byId(profile, c.replacedBy);
  const cardChip = (id: string, text: string) => `<button class="chip" type="button" data-act="open" data-id="${id}">${text}</button>`;
  const story = [
    prev ? `Replaced ${cardChip(prev.id, esc(shownValue(prev)))}` : '',
    next ? `Replaced by ${cardChip(next.id, esc(shownValue(next)))}` : '',
  ].filter(Boolean).join(' ');

  openSheet(`${sheetTop(`${esc(a.title)} · ${esc(kindLabel(c))} <span class="status ${on ? 'on' : ''}">${on ? 'Active' : 'History'}</span>`)}
    ${isDate
      ? `<div class="fx"><span class="lab">${esc(c.kind)}</span>${dateInputs(c.since, 'vdate')}</div>`
      : `<div class="fx"><label for="v-value">${kind.titleFrom ? 'Name' : 'Value'}</label>${valueFieldHtml('v-value', c.value, kind)}</div>`}
    ${tagRowHtml(kind, c.tag)}
    ${detailsHtml(kind, c.fields, 'vf', true)}
    ${!isDate && (kind.dated || c.since) ? `<div class="fx"><span class="lab">${kind.dated ? 'Since' : 'Changed'}</span>${dateInputs(c.since, 'since')}</div>` : ''}
    ${on ? '' : `<div class="fx"><span class="lab">Until</span>${dateInputs(c.until, 'until')}</div>`}
    <div class="fx"><span class="lab">Recorded</span><span class="hint">${esc(fmtISO(c.recordedAt))}${story ? ' · ' : ''}${story}</span></div>
    ${c.revisions.length ? `<div class="block"><h5>Earlier wording</h5><ul class="revs">${[...c.revisions].reverse()
      .map(r => { const fd = r.field ? kind.fields?.find(x => x.id === r.field) : undefined;
        const hide = fd ? fd.sensitive : isSensitive(c);
        return `<li>${fd ? `${esc(fd.label)}: ` : ''}“${esc(hide ? maskValue(r.value) : r.value)}” · changed ${esc(fmtISO(r.at))}</li>`; })
      .join('')}</ul></div>` : ''}
    <div class="block"><h5>Linked</h5><div class="chips">${links.map(x =>
      `<button class="chip" type="button" data-act="open" data-id="${x.other.id}">${linkText(x.label, kindLabel(x.other), shownValue(x.other))}<span class="x" data-act="unlink" data-link="${x.link.id}" title="Remove link">×</span></button>`).join('')}
      <button class="chip" type="button" data-act="add-link">+ Link a card</button></div></div>
    ${near.length ? `<div class="block"><h5>At the time</h5><div class="chips">${near.map(o =>
      cardChip(o.id, linkText('', kindLabel(o), shownValue(o)))).join('')}</div></div>` : ''}
    ${opts.ending
      ? `<div class="block"><h5>When did it end?</h5>${dateInputs(thisMonth(), 'end')}
          <div class="btns"><button class="btn quiet" type="button" data-act="end-cancel">Cancel</button><button class="btn primary" type="button" data-act="end-confirm">Mark as ended</button></div></div>`
      : `<div class="btns">
          <button class="link-btn" type="button" data-act="remove">Remove (added by mistake)</button><span class="spacer"></span>
          ${on ? `<button class="btn" type="button" data-act="end">This ended</button><button class="btn primary" type="button" data-act="replace">Replace</button>`
               : (!c.replacedBy ? `<button class="btn" type="button" data-act="reopen">It's still true</button>` : '')}
        </div>`}`,
  {
    open: b => openCard(b.dataset.id!),
    tag: b => { c.tag = b.dataset.tag!; save(); openCard(id); },
    unlink: (b, e) => { e.stopPropagation(); removeLink(profile, b.dataset.link!); save(); openCard(id); },
    'add-link': () => openLinkPicker({
      self: { area: c.area, kind: c.kind, label: shownValue(c) },
      exclude: [c.id, ...links.map(x => x.other.id)],
      onPick: (other, fwd, back) => { addLink(profile, c.id, other, fwd, back); save(); openCard(id); },
      onBack: () => openCard(id),
    }),
    replace: () => openComposer(c.area, { kind: c.kind, replaceId: c.id }),
    end: () => openCard(id, { ending: true }),
    'end-cancel': () => openCard(id),
    'end-confirm': () => { endCard(profile, id, readDate(sheetBody, 'end')); save(); openCard(id); },
    reopen: () => { reopenCard(profile, id); save(); openCard(id); },
    remove: () => {
      if (!confirm('Remove this card?\n\nOnly do this for a card added by mistake. To record a real change, use Replace or This ended so it stays in your history.')) return;
      removeCard(profile, id); save(); closeSheet();
    },
  });

  attachValueField(sheetBody, 'v-value', kind);
  // Details save as each one is finished. If the name was built from the details, it follows them.
  attachDetails(sheetBody, kind, 'vf', {
    commit: (field, value) => {
      const wasBuilt = !!kind.titleFrom && c.value === kind.titleFrom(c.fields ?? {});
      if (!setField(profile, id, field, value)) return;
      if (wasBuilt) {
        const name = kind.titleFrom!(c.fields ?? {});
        if (name && correctValue(profile, id, name)) {
          const v = sheetBody.querySelector<HTMLInputElement>('#v-value');
          if (v) v.value = name;
        }
      }
      save();
    },
  });
  // Corrections save in place; the old wording is kept quietly.
  const val = sheetBody.querySelector<HTMLInputElement>('#v-value');
  val?.addEventListener('change', () => {
    if (correctValue(profile, id, val.value)) { save(); openCard(id); }
    else val.value = c.value;
  });
  val?.addEventListener('keydown', e => { if (e.key === 'Enter') val.blur(); });
  // Date-valued cards (Birthday): the date is both the value and where it sits on the timeline.
  sheetBody.querySelector('[data-date="vdate"]')?.addEventListener('change', () => {
    const d = readDate(sheetBody, 'vdate');
    if (!d) return;
    correctValue(profile, id, fmtDate(d));
    c.since = d;
    save();
  });
  sheetBody.querySelectorAll<HTMLElement>('[data-date="since"], [data-date="until"]').forEach(el =>
    el.addEventListener('change', () => {
      const key = el.dataset.date as 'since' | 'until';
      c[key] = readDate(sheetBody, key);
      save();
    }));
}
