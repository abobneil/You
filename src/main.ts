import './styles/app.css';
import { onSave, profile, save } from './state';
import { initTarget, scheduleWrite } from './storage/target';
import { $ } from './ui/dom';
import { on } from './ui/events';
import './ui/landing';
import './ui/nudge';
import { refresh, showHome } from './ui/router';
import { onSheetClose } from './ui/sheet';
import './ui/theme';

// After every change: show "Saved" briefly and write to the chosen file, if any.
let savedTimer: ReturnType<typeof setTimeout> | undefined;
onSave(() => {
  const mark = $('#d-saved');
  mark.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => mark.classList.remove('show'), 1400);
  scheduleWrite();
  refresh(); // redraw the page behind any open dialog right away
});

onSheetClose(refresh);
on('data-loaded', showHome);

// Click your name on the home screen to edit it.
const heading = $('#you-name');
heading.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); heading.blur(); } });
heading.addEventListener('blur', () => {
  const v = heading.textContent?.trim() ?? '';
  if (!v) { heading.textContent = profile.name; return; }
  if (v === profile.name) return;
  profile.name = v;
  $('#back-name').textContent = v;
  save();
});

initTarget();

// Returning visitor: go straight to their space. Add ?new to the URL to see the name screen again.
if (profile.name && !new URLSearchParams(location.search).has('new')) showHome();
