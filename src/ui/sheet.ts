// One dialog that shows whichever panel is open: add a card, a card, the link picker, storage…
import { $, ICON } from './dom';

type Handler = (el: HTMLElement, e: MouseEvent) => void;

const sheet = $<HTMLDialogElement>('#sheet');
export const sheetBody = $('#sheet-body');
let returnFocus: HTMLElement | null = null;
let handlers: Record<string, Handler> = {};
const closeListeners: (() => void)[] = [];

/** Shows `html` in the dialog. Clicks on elements with data-act="name" call handlers[name]. */
export function openSheet(html: string, h: Record<string, Handler> = {}) {
  if (!sheet.open) returnFocus = document.activeElement as HTMLElement;
  sheetBody.innerHTML = html;
  handlers = h;
  if (!sheet.open) sheet.showModal();
}

export const closeSheet = () => { if (sheet.open) sheet.close(); };
export const onSheetClose = (fn: () => void) => { closeListeners.push(fn); };
/** Calls one of the current panel's handlers directly, e.g. from an Enter key. */
export const act = (name: string) => handlers[name]?.(sheetBody, new MouseEvent('click'));

sheet.addEventListener('click', e => {
  if (e.target === sheet) return closeSheet(); // clicked the backdrop
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'close') return closeSheet();
  handlers[b.dataset.act!]?.(b, e);
});
sheet.addEventListener('close', () => { sheetBody.innerHTML = ''; handlers = {}; closeListeners.forEach(fn => fn()); returnFocus?.focus(); });

/** Small heading row with a close button. `kicker` may contain trusted markup. */
export const sheetTop = (kicker: string) => `<div class="sh-top"><span class="sh-kicker">${kicker}</span>
  <button class="sh-close" type="button" data-act="close" aria-label="Close">${ICON.close}</button></div>`;
