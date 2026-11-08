import './styles/app.css';
import { browserSaveState, onBrowserSave, onSave, profile, save } from './state';
import { initTarget, scheduleWrite } from './storage/target';
import { $ } from './ui/dom';
import { on } from './ui/events';
import { hideGate } from './ui/gate';
import './ui/landing';
import './ui/nudge';
import { refresh, showHome } from './ui/router';
import { lockNewData, start } from './ui/session';
import { onSheetClose } from './ui/sheet';
import { renderWhoButton } from './ui/switcher';
import './ui/sensitive';
import './ui/theme';
import { openImport } from './ui/import/sources';

// After every change: show "Saved" briefly, write to the chosen file (if any), and redraw.
let savedTimer: ReturnType<typeof setTimeout> | undefined;
onBrowserSave(() => {
  const mark = $('#d-saved');
  if (browserSaveState().status !== 'saved') { mark.classList.remove('show'); return; }
  mark.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => mark.classList.remove('show'), 1400);
});
onSave(() => {
  scheduleWrite();
  refresh();
});
onSheetClose(refresh);

// New visitor: name → passphrase → home.
on('named', async () => { await lockNewData(); showHome(); });
// A file was loaded (and unlocked) from the name screen, the unlock screen, or the storage picker.
on('data-loaded', () => { hideGate(); showHome(); });

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
  start().then(where => { if (where === 'home') showHome(); });
}
