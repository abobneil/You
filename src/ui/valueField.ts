// The value box on a card, with its kind's formatting (Phone → (919) 449-8524),
// a gentle warning when it looks wrong, and quick picks (Blood type, Pronouns).
import type { KindInfo } from '../core/areas';
import { FORMATS, reformat } from '../core/formats';
import { esc } from './dom';
import { revealButton } from './sensitive';

export function valueFieldHtml(id: string, value: string, kind: KindInfo, placeholder = ''): string {
  const f = kind.format ? FORMATS[kind.format] : null;
  const attrs = [
    f?.inputMode ? `inputmode="${f.inputMode}"` : '',
    // Always off: card values are personal, and browsers keep autofill entries unencrypted.
    'autocomplete="off"',
    f ? 'spellcheck="false"' : '',
  ].join(' ');
  const choices = kind.choices?.length
    ? `<div class="vf-choices">${kind.choices.map(c =>
        `<button type="button" data-choice="${esc(c)}" class="${c === value ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>`
    : '';
  const secret = !!kind.sensitive;
  return `<div class="vf${secret ? ' secret-field' : ''}">
    <input id="${id}" class="big${secret ? ' masked' : ''}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${attrs}>
    ${secret ? revealButton(`data-input="${id}"`) : ''}
    <div class="hint vf-hint" id="${id}-hint" aria-live="polite"></div>
    ${choices}
  </div>`;
}

/** Wires up formatting, warnings and quick picks for a field made by valueFieldHtml. */
export function attachValueField(root: ParentNode, id: string, kind: KindInfo) {
  const input = root.querySelector<HTMLInputElement>('#' + id);
  if (!input) return;
  const hint = root.querySelector<HTMLElement>(`#${id}-hint`)!;
  const f = kind.format ? FORMATS[kind.format] : null;
  const showCheck = () => { hint.textContent = f ? f.check(input.value) : ''; };

  if (f) {
    input.addEventListener('input', () => {
      const r = reformat(f, input.value, input.selectionStart ?? input.value.length);
      if (r.value !== input.value) {
        input.value = r.value;
        input.setSelectionRange(r.caret, r.caret);
      }
      if (hint.textContent) showCheck(); // clear the warning as soon as it's fixed
    });
    input.addEventListener('blur', showCheck);
  }

  // Only this field's own quick picks. (Every field's picks share the same markup, so looking them up
  // from `root` would make one click write into every field on the sheet.)
  const picks = [...(input.closest('.vf')?.querySelectorAll<HTMLElement>(':scope > .vf-choices [data-choice]') ?? [])];
  const mark = () => picks.forEach(x => x.classList.toggle('on', x.dataset.choice === input.value.trim()));
  input.addEventListener('input', mark);
  picks.forEach(b =>
    b.addEventListener('click', () => {
      input.value = b.dataset.choice!;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true })); // saves, on an existing card
      input.focus();
      if (b.dataset.choice === 'Other') input.select(); // so typing the real answer replaces "Other"
    }));
}
