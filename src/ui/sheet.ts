// One dialog that shows whichever panel is open: add a card, a card, the link picker, storage…
// It also looks after focus (redraws keep your place; closing returns you where you were) and
// never throws away something typed without a way back.
import { $, ICON, announce } from './dom';
import { canFocus, findByKey, keyOf, type FocusKey } from './focusMemory';
import { InvalidDate } from './dateInput';
import { setDraftCheck } from '../state';

type Handler = (el: HTMLElement, e: MouseEvent) => void;

/** A panel with typed input can offer this, so dismissing it can be undone. */
export interface DraftHook {
  /** True when something has been typed that isn't saved. */
  dirty(): boolean;
  /** A copy of what was typed. */
  snapshot(): unknown;
  /** Reopens the panel with that copy. */
  restore(snapshot: unknown): void;
  /**
   * A plain-JSON copy of what was typed, for keeping it (encrypted, in the record) when the
   * screen locks by itself. Marks the draft as kept, so anything it already stored isn't cleared.
   */
  stash?(): { kind: string; data: unknown };
}

interface Opener { el: HTMLElement | null; key: FocusKey | null }

const sheet = $<HTMLDialogElement>('#sheet');
export const sheetBody = $('#sheet-body');
let opener: Opener = { el: null, key: null };
let nextOpener: Opener | null = null;
let handlers: Record<string, Handler> = {};
let draft: DraftHook | null = null;
/** Set by closeSheet(): the panel finished its job (saved), so there's nothing to undo. */
let finishing = false;
/** Controls that led to the current panel, newest last, so "Back" can land on the one that left. */
const trail: FocusKey[] = [];
const closeListeners: (() => void)[] = [];

/**
 * Shows `html` in the dialog. Clicks on elements with data-act="name" call handlers[name].
 * Pass `draft` from a panel with typed input; panels opened from it (the link picker) keep it.
 */
export function openSheet(html: string, h: Record<string, Handler> = {}, opts: { draft?: DraftHook } = {}) {
  const wasOpen = sheet.open;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const had = wasOpen && active && sheetBody.contains(active) ? keyOf(active) : null;
  if (!wasOpen) {
    opener = nextOpener ?? { el: active, key: active ? keyOf(active) : null };
    nextOpener = null;
    trail.length = 0;
    draft = null;
    if (!pendingBack) history.pushState({ ...history.state, youSheet: true }, '');
  }
  if (opts.draft) draft = opts.draft;
  sheetBody.innerHTML = html;
  handlers = h;
  const title = titleEl();
  if (title) {
    title.id ||= 'sheet-title';
    title.tabIndex = -1;
    sheet.setAttribute('aria-labelledby', title.id);
  }
  if (!wasOpen) sheet.showModal();
  else restoreFocus(had, title);
  const news = [...sheetBody.querySelectorAll<HTMLElement>('[data-announce]')].map(e => e.textContent?.trim()).filter(Boolean).join(' ');
  if (news) announce(news);
}

/** The panel's visible title: its heading, or the small kicker when there's no heading. */
const titleEl = () => sheetBody.querySelector<HTMLElement>('.sh-title') ?? sheetBody.querySelector<HTMLElement>('h2, h3, .sh-kicker');

/** After a redraw: the same control if it's still there, else the one that led here, else the title. */
function restoreFocus(had: FocusKey | null, title: HTMLElement | null) {
  if (sheetBody.contains(document.activeElement) && document.activeElement !== sheetBody) return;
  for (const k of [had, ...[...trail].reverse()]) {
    const el = k && findByKey(sheetBody, k);
    if (el && canFocus(el)) { el.focus(); return; }
  }
  title?.focus();
}

/** Closes the sheet because its job is done (saved, chosen). Nothing to undo. */
export const closeSheet = () => { if (sheet.open) { finishing = true; sheet.close(); afterClose(); } };
/** Closes it because the person backed out (Cancel, ×, Escape, the backdrop). */
function dismiss() { commitField(); if (sheet.open) { sheet.close(); afterClose(); } }
/** Lets a half-typed correction save the way leaving the field would ("change" fires on blur). */
const commitField = () => { const a = document.activeElement; if (a instanceof HTMLElement && sheetBody.contains(a)) a.blur(); };

export const onSheetClose = (fn: () => void) => { closeListeners.push(fn); };
/** Typing that isn't saved yet in the open panel, if any. */
export function openDraft(): DraftHook | null {
  if (!sheet.open || !draft) return null;
  try { return draft.dirty() ? draft : null; } catch { return draft; }
}
/** Saves a half-typed field the way leaving it would. */
export const commitOpenField = () => commitField();
setDraftCheck(() => !!openDraft());
/** Calls one of the current panel's handlers directly, e.g. from an Enter key. */
export const act = (name: string) => run(name, sheetBody, new MouseEvent('click'));
/** Runs a handler. A date that can't be read has already been flagged next to its field, so that just stops it. */
function run(name: string, el: HTMLElement, e: MouseEvent) {
  try { handlers[name]?.(el, e); }
  catch (err) { if (!(err instanceof InvalidDate)) throw err; }
}

sheet.addEventListener('click', e => {
  if (e.target === sheet) {
    // The dialog's own padding is the dialog too; only a click outside its box is the backdrop.
    const r = sheet.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dismiss();
    return;
  }
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'close') return dismiss();
  const k = keyOf(b);
  if (k) { trail.push(k); if (trail.length > 20) trail.shift(); }
  run(b.dataset.act!, b, e);
});
// Escape: handled here, synchronously, like every other way out.
// A file input's `cancel` (the system picker was closed without choosing) bubbles up to here too:
// that isn't the person leaving the sheet, so only the dialog's own cancel closes it.
sheet.addEventListener('cancel', e => { if (e.target !== sheet) return; e.preventDefault(); dismiss(); });
// Enter in a text field (which saves in several panels) must not also "press" whatever button gets
// focus once the sheet closes, e.g. reopening Add a card straight after adding one.
sheet.addEventListener('keydown', e => {
  const t = e.target;
  if (e.key === 'Enter' && t instanceof HTMLInputElement && !t.form && !['file', 'checkbox', 'radio', 'submit'].includes(t.type)) e.preventDefault(); // forms still submit on Enter
});
// The "close" event arrives a moment later, after focus may already have moved on, so the work
// is done right away in afterClose(); the event only covers a close the browser forced itself.
let closedEarly = false;
sheet.addEventListener('close', () => { if (closedEarly) closedEarly = false; else afterClose(); closedEarly = false; });
let pendingBack = 0;
window.addEventListener('popstate', () => { if (pendingBack) { pendingBack--; if (sheet.open) history.pushState({ ...history.state, youSheet: true }, ''); return; } if (sheet.open) dismiss(); });
function afterClose() {
  if (history.state?.youSheet) { pendingBack++; history.back(); }
  closedEarly = true;
  const done = finishing;
  finishing = false;
  let undo: (() => void) | null = null;
  if (!done && draft) {
    try {
      if (draft.dirty()) {
        const hook = draft, snap = hook.snapshot(), back = opener;
        undo = () => { nextOpener = back; hook.restore(snap); };
      }
    } catch { /* a half-typed date can't be read; nothing safe to keep */ }
  }
  sheetBody.innerHTML = '';
  handlers = {};
  draft = null;
  trail.length = 0;
  closeListeners.forEach(fn => fn());
  // The opener may have been redrawn by the listeners above; find its replacement.
  const el = opener.el?.isConnected ? opener.el : opener.key ? findByKey(document, opener.key) : null;
  if (el && canFocus(el)) el.focus();
  if (undo) offerUndo('Draft discarded', undo);
}

// ---------- "Draft discarded · Undo" ----------
const toast = $('#toast');
const toastText = $('#toast-text');
let toastAction: (() => void) | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const UNDO_MS = 15000;

/** Shows "<text> · Undo" in the shared toast; Undo (or Ctrl+Z) runs `action`. */
export function offerUndo(text: string, action: () => void) {
  toastAction = action;
  toastText.textContent = text;
  toast.hidden = false;
  announce(`${text}. To bring it back, choose Undo or press Control Z.`);
  armToast();
}
function armToast() { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, UNDO_MS); }
function hideToast() { if (toast.matches(':hover') || toast.contains(document.activeElement)) { armToast(); return; } clearTimeout(toastTimer); toast.hidden = true; toastAction = null; }
function runUndo() { const a = toastAction; clearTimeout(toastTimer); toast.hidden = true; toastAction = null; a?.(); }

$('#toast-undo').addEventListener('click', runUndo);
// The timer waits while the toast is being pointed at or focused.
toast.addEventListener('pointerenter', () => clearTimeout(toastTimer));
toast.addEventListener('pointerleave', armToast);
toast.addEventListener('focusin', () => clearTimeout(toastTimer));
toast.addEventListener('focusout', armToast);
document.addEventListener('keydown', e => {
  if (!toastAction || sheet.open || e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey) return;
  if ((e.target as HTMLElement).closest?.('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
  e.preventDefault();
  runUndo();
});

/** Small heading row with a close button. `kicker` may contain trusted markup. */
export const sheetTop = (kicker: string) => `<div class="sh-top"><span class="sh-kicker">${kicker}</span>
  <button class="sh-close" type="button" data-act="close" aria-label="Close">${ICON.close}</button></div>`;

export const draftUndoPending = () => !!toastAction;
