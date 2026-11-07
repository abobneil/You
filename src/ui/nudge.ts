// A gentle, one-time suggestion to choose where to keep data, after the first few cards.
// "Not now" or choosing a place means we never ask again; the status pill stays available.
import { profile } from '../state';
import { KEYS, local } from '../storage/local';
import { onTargetChange, target } from '../storage/target';
import { $ } from './dom';
import { on } from './events';
import { openStoragePicker } from './storagePicker';

export const NUDGE_AT = 3;
const nudge = $('#nudge');

function maybeNudge() {
  if (target.kind !== 'browser' || local.get(KEYS.nudged) || profile.cards.length < NUDGE_AT || !nudge.hidden) return;
  setTimeout(() => {
    $('#nudge-name').textContent = profile.name ? `, ${profile.name}` : '';
    nudge.hidden = false;
  }, 700);
}

nudge.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-n]');
  if (!b) return;
  local.set(KEYS.nudged, new Date().toISOString());
  nudge.hidden = true;
  if (b.dataset.n === 'choose') openStoragePicker('save');
});

on('card-added', maybeNudge);
onTargetChange(() => { if (target.kind !== 'browser') nudge.hidden = true; });
