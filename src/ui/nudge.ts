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
  if (target.kind !== 'browser' || local.get(keyFor(currentId(), 'nudged')) || profile.cards.length < NUDGE_AT || !nudge.hidden) return;
  setTimeout(() => {
    if (target.kind !== 'browser' || local.get(keyFor(currentId(), 'nudged'))) return;
    $('#nudge-name').textContent = profile.name ? `, ${profile.name}` : '';
    nudge.hidden = false;
  }, 700);
}

nudge.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-n]');
  if (!b) return;
  local.set(keyFor(currentId(), 'nudged'), new Date().toISOString());
  nudge.hidden = true;
  if (b.dataset.n === 'safe') openSafety();
  if (b.dataset.n === 'choose') openStoragePicker('save');
});

on('card-added', maybeNudge);
onTargetChange(() => { if (target.kind !== 'browser') nudge.hidden = true; });
