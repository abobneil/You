// One area of life: active cards under "Now", empty kinds as suggestions, and "Over time".
import type { Area } from '../core/areas';
import { byId, byStartDesc, cardStart, linksOf, rangeText } from '../core/cards';
import { fmtDate, fmtISO } from '../core/dates';
import { profile } from '../state';
import { openCard } from './cardView';
import { openComposer } from './composer';
import { $, ICON, esc } from './dom';

const detail = $('#detail');
let shown: Area | undefined;

export function renderArea(a: Area) {
  shown = a;
  $('#d-icon').innerHTML = a.icon;
  $('#d-title').textContent = a.title;

  const cards = profile.cards.filter(c => c.area === a.id);
  const order = (kind: string) => { const i = a.kinds.findIndex(k => k.name === kind); return i < 0 ? 99 : i; };
  const active = cards.filter(c => c.status === 'active')
    .sort((x, y) => order(x.kind) - order(y.kind) || cardStart(y).localeCompare(cardStart(x)));

  $('#now-count').textContent = active.length ? `${active.length} active` : '';
  $('#now').innerHTML = active.map(c => {
    const ls = linksOf(profile, c.id).slice(0, 3);
    const chips = ls.map(x => `<span class="chip">${x.label ? `<em>${esc(x.label)}</em> ` : ''}${esc(x.other.value)}</span>`).join('');
    return `<button class="tile" type="button" data-act="card" data-id="${c.id}">
      <span class="k"><i></i>${esc(c.kind)}</span>
      <span class="v">${esc(c.value)}</span>
      <span class="d">${esc(rangeText(c))}</span>
      ${chips ? `<span class="chips">${chips}</span>` : ''}
    </button>`;
  }).join('') + `<button class="tile new" type="button" data-act="new">${ICON.plus}New card</button>`;

  $('#ghosts').innerHTML = a.kinds.filter(k => !active.some(c => c.kind === k.name))
    .map(k => `<button class="ghost" type="button" data-act="new" data-kind="${esc(k.name)}">+ ${esc(k.name)}</button>`).join('');

  const timeline = [...cards].sort(byStartDesc);
  $('#timeline').innerHTML = timeline.length ? timeline.map(c => {
    const prev = byId(profile, c.replaces);
    const next = byId(profile, c.replacedBy);
    const note = c.status === 'active'
      ? (prev ? `replaced ${esc(prev.value)}` : 'added')
      : (next ? `replaced by ${esc(next.value)}` : 'ended');
    const when = c.status === 'active' ? (fmtDate(c.since) || `Added ${fmtISO(c.recordedAt)}`) : rangeText(c);
    return `<li class="ev ${c.status === 'active' ? 'on' : 'past'}"><button type="button" data-act="card" data-id="${c.id}">
      <div class="when">${esc(when)}</div>
      <div class="what">${esc(c.kind)}: ${esc(c.value)} <span class="note">· ${note}</span></div>
    </button></li>`;
  }).join('') : `<li class="ev"><p class="empty">Your cards will show up here, in order, as you add them.</p></li>`;
}

detail.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!b || !shown) return;
  if (b.dataset.act === 'card') openCard(b.dataset.id!);
  if (b.dataset.act === 'new') openComposer(shown.id, { kind: b.dataset.kind });
});
