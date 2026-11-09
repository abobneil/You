import { openSafety } from './safety';
// A gentle, one-time suggestion to choose where to keep data, after the first few cards.
// "Not now" or choosing a place means we never ask again; the status pill stays available.
import { profile } from '../state';
import { local } from '../storage/local';
import { currentId, keyFor } from '../storage/profiles';
import { onTargetChange, target } from '../storage/target';
import { $ } from './dom';
import { on } from './events';
import { openStoragePicker } from './storagePicker';

export const NUDGE_AT = 3;
const nudge = $('#nudge');

function maybeNudge() {
  if (target.kind !== 'browser' || local.get(keyFor(profile.id || currentId(), 'nudged')) || profile.cards.length < NUDGE_AT || !nudge.hidden) return;
  setTimeout(() => {
    if (target.kind !== 'browser' || local.get(keyFor(profile.id || currentId(), 'nudged'))) return;
    $('#nudge-name').textContent = profile.name ? `, ${profile.name}` : '';
    nudge.hidden = false;
  }, 700);
}

nudge.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-n]');
  if (!b) return;
  local.set(keyFor(profile.id || currentId(), 'nudged'), new Date().toISOString());
  nudge.hidden = true;
  if (b.dataset.n === 'safe') openSafety();
  if (b.dataset.n === 'choose') openStoragePicker('save');
});

// While any sheet is open the hint steps aside, so it never competes with the sheet's own action.
const sheet = document.getElementById('sheet');
if (sheet) new MutationObserver(() => nudge.classList.toggle('behind', sheet.hasAttribute('open'))).observe(sheet, { attributes: true, attributeFilter: ['open'] });

on('card-added', maybeNudge);
onTargetChange(() => { if (target.kind !== 'browser') nudge.hidden = true; });

// The hint and the Undo toast are fixed to the bottom of the screen, where on a phone they cover the
// last rows of a page. Keep room under the page while the hint shows, and when keyboard focus is behind
// either of them (moved there, or the hint appeared over it), scroll it clear.
const toast = $('#toast');
const space = $('#space');
function keepFocusClear() {
  const t = document.activeElement;
  if (!(t instanceof HTMLElement) || t === document.body || t.closest('dialog')) return;
  for (const box of [nudge, toast]) {
    if (box.hidden || box.classList.contains('behind') || box.contains(t)) continue;
    const b = box.getBoundingClientRect(), r = t.getBoundingClientRect();
    if (r.bottom > b.top - 8 && r.top < b.bottom && r.right > b.left && r.left < b.right) window.scrollBy(0, r.bottom - b.top + 16);
  }
}
new MutationObserver(() => {
  space.style.paddingBottom = nudge.hidden ? '' : `${nudge.offsetHeight + 40}px`;
  requestAnimationFrame(keepFocusClear);
}).observe(nudge, { attributes: true, attributeFilter: ['hidden'] });
// After the browser's own scroll-into-view, and after closing a sheet (its history step restores the old scroll).
document.addEventListener('focusin', () => requestAnimationFrame(keepFocusClear));
window.addEventListener('popstate', () => requestAnimationFrame(keepFocusClear));
