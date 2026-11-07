import './styles/app.css';
import { onSave, profile, save } from './state';
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
import './ui/theme';

// After every change: show "Saved" briefly, write to the chosen file (if any), and redraw.
let savedTimer: ReturnType<typeof setTimeout> | undefined;
onSave(() => {
  const mark = $('#d-saved');
  mark.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => mark.classList.remove('show'), 1400);
  scheduleWrite();
  refresh();
});
onSheetClose(refresh);

// New visitor: name → passphrase → home.
on('named', async () => { await lockNewData(); showHome(); });
// A file was loaded (and unlocked) from the name screen, the unlock screen, or the storage picker.
on('data-loaded', () => { hideGate(); showHome(); });

// Click your name on the home screen to edit it.
const heading = $('#you-name');
heading.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); heading.blur(); } });
heading.addEventListener('blur', () => {
  const v = heading.textContent?.trim() ?? '';
  if (!v) { heading.textContent = profile.name; return; }
  if (v === profile.name) return;
  profile.name = v;
  $('#back-name').textContent = v;
  renderWhoButton();
  save();
});

initTarget();
start().then(where => { if (where === 'home') showHome(); });
