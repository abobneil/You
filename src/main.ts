import './styles/app.css';
import { browserSaveState, onBrowserSave, onReplaced, onSave, profile, save } from './state';
import { initTarget, renderPill, scheduleWrite } from './storage/target';
import { $, announce } from './ui/dom';
import { on } from './ui/events';
import { hideGate } from './ui/gate';
import './ui/landing';
import './ui/nudge';
import { refresh, showHome } from './ui/router';
import { lockNewData, resumeOpenFile, start } from './ui/session';
import { offerKeptDrafts } from './ui/drafts';
import { onSheetClose } from './ui/sheet';
import { renderWhoButton } from './ui/switcher';
import './ui/sensitive';
import './ui/theme';
import { openImport } from './ui/import/sources';

// After every change: show "Saved" briefly, write to the chosen file (if any), and redraw.
let savedTimer: ReturnType<typeof setTimeout> | undefined;
// "Saved" is only said once the browser copy is really written (not when the edit is made),
// and only for the person's own edits, not the save that happens on unlock.
let editPending = false;
let lastStatus = browserSaveState().status;
onBrowserSave(() => {
  const mark = $('#d-saved');
  const state = browserSaveState();
  const was = lastStatus;
  lastStatus = state.status;
  if (state.status === 'failed' && was !== 'failed') {
    announce(`Couldn't save in this browser${state.reason ? ` (${state.reason})` : ''}. Your changes are still on screen. Use the button at the top to download a copy or try again.`, true);
  }
  if (state.status !== 'saved') { mark.classList.remove('show'); return; }
  if (editPending || was === 'failed') announce('Saved');
  editPending = false;
  mark.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => mark.classList.remove('show'), 1400);
});
onSave(() => {
  editPending = true;
  scheduleWrite();
  refresh();
});
onSheetClose(refresh);
// Another tab saved newer work and this tab had nothing unsaved: show it.
onReplaced(() => { if (document.body.classList.contains('home')) { showHome(); renderPill(); } });

// New visitor: name → passphrase → home.
on('named', async () => { await lockNewData(); showHome(); });
// A file was loaded (and unlocked) from the name screen, the unlock screen, or the storage picker.
on('data-loaded', () => { hideGate(); showHome(); });

// Personal text never goes into the browser's autofill store (which isn't encrypted). Only the name
// and passphrase fields keep autofill, for password managers. This catches any field that forgot.
document.addEventListener('focusin', e => {
  const t = e.target;
  if ((t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) && !t.hasAttribute('autocomplete')
    && !t.closest('#gate-form') && t.id !== 'name') t.setAttribute('autocomplete', 'off');
});

$('#import-open').addEventListener('click', () => openImport());

// Click your name on the home screen to edit it.
const heading = $('#you-name');
heading.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); heading.blur(); } });
heading.addEventListener('paste', e => {
  e.preventDefault();
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!heading.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const node = document.createTextNode(e.clipboardData?.getData('text/plain') ?? '');
  range.insertNode(node); range.setStartAfter(node); range.collapse(true);
  selection.removeAllRanges(); selection.addRange(range);
});
heading.addEventListener('blur', () => {
  const v = heading.textContent?.trim() ?? '';
  if (!v) { heading.textContent = profile.name; return; }
  if (v === profile.name) return;
  profile.name = v;
  $('#back-name').textContent = v;
  renderWhoButton();
  save();
});

// Development-only tools (?reset, the "dev" button). Left out of production builds entirely.
const resetting = import.meta.env.DEV && (await (await import('./dev')).init());

if (!resetting) {
  initTarget();
  start().then(where => {
    if (where !== 'home') return;
    showHome();
    // Picks up where things were left: a file being opened, or a card kept when the screen locked.
    if (!resumeOpenFile()) offerKeptDrafts();
  });
}

// Keep the production app shell available without a network. Updates wait for all windows to close.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Installation can be retried on the next launch; local recording remains available.
    });
  });
}
