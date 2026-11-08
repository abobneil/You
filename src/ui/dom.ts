const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escapes text for safe use inside HTML templates. Use it on everything the person typed. */
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

/** querySelector that assumes the element exists (it's in index.html or was just rendered). */
export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

/** How a link reads on a card: "provided through · Job · Acme Corp". The kind makes unlabeled links clear too. */
export const linkText = (label: string, kind: string, value: string) =>
  `${label ? `<em>${esc(label)}</em> ` : ''}<i class="lk">${esc(kind)}</i> ${esc(value)}`;

export const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg class="ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  addCorner: '<svg class="add" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};

/**
 * Says something to screen readers without moving focus: "Saved", "Added 12 cards".
 * `urgent` uses the assertive region, for failures that need attention now.
 */
export function announce(text: string, urgent = false) {
  const el = document.getElementById(urgent ? 'announce-urgent' : 'announce');
  if (!el || !text) return;
  // Clearing first lets the same words ("Saved") be announced again.
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 60);
}

let errCount = 0;
/**
 * An error shown right under the field it's about, read out when the field is focused.
 * `field` gets aria-invalid; `after` (default: the field) is where the message goes.
 * The message clears itself as soon as the person changes anything in `after`.
 */
export function showFieldError(field: HTMLElement, message: string, after: Element = field) {
  const id = field.dataset.err || (field.dataset.err = `field-err-${++errCount}`);
  let p = document.getElementById(id);
  if (!p) {
    p = document.createElement('p');
    p.id = id;
    p.className = 'field-err';
    after.insertAdjacentElement('afterend', p);
  }
  p.textContent = message;
  field.setAttribute('aria-invalid', 'true');
  const ids = (field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
  if (!ids.includes(id)) field.setAttribute('aria-describedby', [...ids, id].join(' '));
  const clear = () => clearFieldError(field);
  after.addEventListener('input', clear, { once: true });
  after.addEventListener('change', clear, { once: true });
  field.focus();
}

export function clearFieldError(field: HTMLElement) {
  const id = field.dataset.err;
  if (!id) return;
  document.getElementById(id)?.remove();
  field.removeAttribute('aria-invalid');
  const rest = (field.getAttribute('aria-describedby') || '').split(' ').filter(x => x && x !== id);
  if (rest.length) field.setAttribute('aria-describedby', rest.join(' ')); else field.removeAttribute('aria-describedby');
  delete field.dataset.err;
}
