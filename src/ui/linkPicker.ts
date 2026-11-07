// "Link a card": search all cards, pick one, then optionally choose how they're connected.
import { AREAS, LINK_LABELS } from '../core/areas';
import { byId, rangeText } from '../core/cards';
import { profile } from '../state';
import { $, esc } from './dom';
import { act, openSheet, sheetBody, sheetTop } from './sheet';

interface Options {
  /** How the card being linked from is described, e.g. its value. */
  selfLabel: string;
  exclude: string[];
  onPick: (id: string, fwd: string, back: string) => void;
  onBack: () => void;
}

export function openLinkPicker(o: Options) {
  const pool = profile.cards.filter(c => !o.exclude.includes(c.id));
  const list = (q: string) => {
    const t = q.trim().toLowerCase();
    const hits = pool.filter(c => !t || `${c.value} ${c.kind}`.toLowerCase().includes(t));
    if (!hits.length) return `<li class="grp">${pool.length ? 'No matches' : 'No other cards yet. Add some first.'}</li>`;
    return AREAS.map(a => {
      const cs = hits.filter(c => c.area === a.id);
      if (!cs.length) return '';
      return `<li class="grp">${esc(a.title)}</li>` + cs.map(c => `<li><button type="button" data-act="pick" data-id="${c.id}">
        <span>${esc(c.value)}</span><span class="meta">${esc(c.kind)} · ${esc(c.status === 'active' ? 'now' : rangeText(c))}</span></button></li>`).join('');
    }).join('');
  };

  openSheet(`${sheetTop('Link a card')}
    <input class="search" id="p-q" placeholder="Search your cards" autocomplete="off">
    <ul class="pick" id="p-list">${list('')}</ul>
    <div class="btns"><button class="btn quiet" type="button" data-act="back">Back</button></div>`,
  {
    back: () => o.onBack(),
    pick: b => labelStep(b.dataset.id!),
  });
  const q = $<HTMLInputElement>('#p-q', sheetBody);
  q.addEventListener('input', () => { $('#p-list', sheetBody).innerHTML = list(q.value); });
  q.focus();

  function labelStep(otherId: string) {
    const other = byId(profile, otherId)!;
    openSheet(`${sheetTop('How are they connected?')}
      <p class="hint">Optional. Pick one that reads right, write your own, or skip it.</p>
      <div class="labels">${LINK_LABELS.map(([fwd], i) => `<button type="button" data-act="label" data-i="${i}">
        <span>${esc(o.selfLabel)}</span> <b>${esc(fwd)}</b> <span>${esc(other.value)}</span></button>`).join('')}</div>
      <div class="fx"><label for="p-own">Your own</label><input id="p-own" placeholder="e.g. recommended by"></div>
      <div class="btns"><button class="btn quiet" type="button" data-act="back">Back</button><span class="spacer"></span>
        <button class="btn" type="button" data-act="none">Link without a label</button>
        <button class="btn primary" type="button" data-act="own">Link</button></div>`,
    {
      back: () => openLinkPicker(o),
      label: b => { const [fwd, back] = LINK_LABELS[+b.dataset.i!]; o.onPick(otherId, fwd, back); },
      none: () => o.onPick(otherId, '', ''),
      own: () => { const t = $<HTMLInputElement>('#p-own', sheetBody).value.trim(); o.onPick(otherId, t, t); },
    });
    $('#p-own', sheetBody).addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') act('own'); });
  }
}
