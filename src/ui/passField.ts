// A passphrase field with the same Show/Hide button as the passphrase screen. Paste always works.
import { backToField } from './keyboard';
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';

export const passField = (id: string, autocomplete: 'current-password' | 'off', required = true) =>
  `<div class="pass-field"><input id="${id}" type="password" autocomplete="${autocomplete}" spellcheck="false" autocapitalize="off"${required ? ' required' : ''}><button class="peek" type="button" data-peek="${id}" aria-controls="${id}" aria-label="Show passphrase" aria-pressed="false">${EYE}</button></div>`;

/** Wires every Show/Hide button inside `root`. */
export function wirePeek(root: ParentNode) {
  root.querySelectorAll<HTMLButtonElement>('[data-peek]').forEach(b => {
    const input = root.querySelector<HTMLInputElement>(`#${b.dataset.peek}`);
    if (!input) return;
    b.onclick = e => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.setAttribute('aria-pressed', String(show));
      b.setAttribute('aria-label', show ? 'Hide passphrase' : 'Show passphrase');
      if (backToField(e)) input.focus();
    };
  });
}
