// "Link a card": search all cards, pick one, then optionally choose how they're connected.
import { AREAS, kindLabel, kindOf } from '../core/areas';
import { byId, rangeText } from '../core/cards';
import { pointlessLink, suggestLabels } from '../core/relations';
import type { AreaId } from '../core/types';
import { profile } from '../state';
import { $, esc } from './dom';
import { act, openSheet, sheetBody, sheetTop } from './sheet';
import { shownValue } from './sensitive';
import { searchableDetails } from './details';

interface Options {
  /** The card being linked from: its area, kind and how to describe it (its value). */
  self: { area: AreaId; kind: string; label: string };
  exclude: string[];
  onPick: (id: string, fwd: string, back: string) => void;
  onBack: () => void;
}

export function openLinkPicker(o: Options) {
  const pool = profile.cards.filter(c => !o.exclude.includes(c.id));
  // Facts about you are already connected through you, so they go last when linking from About.
  const order = AREAS.filter(a => !pointlessLink(o.self.area, a.id)).concat(AREAS.filter(a => pointlessLink(o.self.area, a.id)));

  const list = (q: string) => {
    const t = q.trim().toLowerCase();
    const hits = pool.filter(c => !t || `${c.value} ${kindLabel(c)} ${searchableDetails(c, kindOf(c.area, c.kind, profile))}`.toLowerCase().includes(t));
    if (!hits.length) return `<li class="grp">${pool.length ? 'No matches' : 'No other cards yet. Add some first.'}</li>`;
    return order.map(a => {
      const cs = hits.filter(c => c.area === a.id);
      if (!cs.length) return '';
      const late = pointlessLink(o.self.area, a.id);
      return `<li class="grp">${esc(a.title)}${late ? '<span class="grp-note"> · already connected through you, so linking these isn’t needed</span>' : ''}</li>`
        + cs.map(c => `<li${late ? ' class="late"' : ''}><button type="button" data-act="pick" data-id="${esc(c.id)}">
          <span><i class="lk">${esc(kindLabel(c))}</i> ${esc(shownValue(c))}</span><span class="meta">${esc(c.status === 'active' ? 'now' : rangeText(c))}</span></button></li>`).join('');
    }).join('');
  };

  openSheet(`${sheetTop('Link a card')}
    <label class="pick-lab" for="p-q">Find the card to link</label>
    <input class="search" id="p-q" placeholder="Type a name, kind or detail" autocomplete="off">
    <ul class="pick" id="p-list">${list('')}</ul>
    <div class="btns"><button class="btn quiet" type="button" data-act="back">Back</button></div>`,
  {
    back: () => o.onBack(),
    escape: () => o.onBack(),
    pick: b => labelStep(b.dataset.id!),
  });
  const q = $<HTMLInputElement>('#p-q', sheetBody);
  q.addEventListener('input', () => { $('#p-list', sheetBody).innerHTML = list(q.value); });
  q.focus();

  function labelStep(otherId: string) {
    const other = byId(profile, otherId)!;
    const labels = suggestLabels(o.self.area, o.self.kind, other.area, other.kind);
    const sentence = (fwd: string) =>
      `<span>${esc(o.self.label)}</span> <b>${esc(fwd)}</b> <span><i class="lk">${esc(kindLabel(other))}</i> ${esc(shownValue(other))}</span>`;
    openSheet(`${sheetTop('How are they connected?')}
      <p class="hint">Optional. Pick the one that reads right, write your own, or skip it.</p>
      <div class="labels">${labels.map(([fwd], i) => `<button type="button" data-act="label" data-i="${i}">${sentence(fwd)}</button>`).join('')}</div>
      <div class="fx"><label for="p-own">Your own</label><input id="p-own" autocomplete="off" placeholder="e.g. recommended by"></div>
      <div class="btns"><button class="btn quiet" type="button" data-act="back">Back</button><span class="spacer"></span>
        <button class="btn" type="button" data-act="none">Link without a label</button>
        <button class="btn primary" type="button" data-act="own">Link</button></div>`,
    {
      back: () => openLinkPicker(o),
      escape: () => o.onBack(),
      label: b => { const [fwd, back] = labels[+b.dataset.i!]; o.onPick(otherId, fwd, back); },
      none: () => o.onPick(otherId, '', ''),
      own: () => { const t = $<HTMLInputElement>('#p-own', sheetBody).value.trim(); o.onPick(otherId, t, t); },
    });
    $('#p-own', sheetBody).addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') act('own'); });
  }
}
