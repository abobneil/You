// Sensitive values (Social Security number, Passport…) are hidden everywhere as •••-••-6789.
// Press and hold the eye icon to show one; it hides again the moment you let go.
// Works with a mouse, touch, and the keyboard (hold Space or Enter on the eye).
import { kindOf } from '../core/areas';
import { byId } from '../core/cards';
import { maskValue } from '../core/formats';
import type { AreaId, Card } from '../core/types';
import { profile } from '../state';
import { esc } from './dom';

export const isSensitive = (c: { area: AreaId; kind: string }) => !!kindOf(c.area, c.kind).sensitive;

/** The value to show in text (timeline, links, pickers). */
export const shownValue = (c: Card) => (isSensitive(c) ? maskValue(c.value) : c.value);

const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';

/** An eye button. `target` is data-card="<id>" for displayed values or data-input="<id>" for fields. */
export const revealButton = (target: string) =>
  `<button type="button" class="reveal" ${target} aria-label="Press and hold to show" title="Press and hold to show">${EYE}</button>`;

/** A card's value as HTML: plain, or masked with a hold-to-reveal eye. */
export function valueHtml(c: Card): string {
  if (!isSensitive(c)) return esc(c.value);
  return `<span class="secret-wrap"><span class="secret">${esc(maskValue(c.value))}</span>${revealButton(`data-card="${esc(c.id)}"`)}</span>`;
}

const showing = new Set<HTMLElement>();

function show(btn: HTMLElement) {
  if (btn.dataset.card) {
    const c = byId(profile, btn.dataset.card);
    const span = btn.parentElement?.querySelector('.secret');
    if (c && span) span.textContent = c.value;
  }
  if (btn.dataset.input) document.getElementById(btn.dataset.input)?.classList.add('show');
  btn.classList.add('on');
  showing.add(btn);
}

function hideAll() {
  for (const btn of showing) {
    if (btn.dataset.card) {
      const c = byId(profile, btn.dataset.card);
      const span = btn.parentElement?.querySelector('.secret');
      if (c && span) span.textContent = maskValue(c.value);
    }
    if (btn.dataset.input) document.getElementById(btn.dataset.input)?.classList.remove('show');
    btn.classList.remove('on');
  }
  showing.clear();
}

const revealFrom = (e: Event) => (e.target as HTMLElement | null)?.closest?.<HTMLElement>('.reveal') ?? null;

// Pointer: show while pressed. preventDefault keeps focus (and the cursor) in a field being typed in.
document.addEventListener('pointerdown', e => {
  const btn = revealFrom(e);
  if (!btn) return;
  e.preventDefault();
  show(btn);
}, true);
for (const type of ['pointerup', 'pointercancel', 'dragstart'] as const) document.addEventListener(type, hideAll, true);
window.addEventListener('blur', hideAll);
document.addEventListener('visibilitychange', hideAll);

// The eye never opens the card or triggers anything around it, and long-press shows no menu.
document.addEventListener('click', e => { if (revealFrom(e)) { e.preventDefault(); e.stopPropagation(); } }, true);
document.addEventListener('contextmenu', e => { if (revealFrom(e)) e.preventDefault(); }, true);

// Keyboard: hold Space or Enter on the eye.
document.addEventListener('keydown', e => {
  const btn = revealFrom(e);
  if (!btn || (e.key !== ' ' && e.key !== 'Enter')) return;
  e.preventDefault();
  e.stopPropagation();
  if (!e.repeat) show(btn);
}, true);
document.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hideAll(); }, true);
