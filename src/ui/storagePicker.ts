import { openSafety } from './safety';
// "Where should we keep your data?" — modeled on draw.io's "Save to…" picker.
import { canWriteFiles, chooseOpenFile, chooseSaveFile, downloadCopy, pillClick, setTarget, target, writeFile } from '../storage/target';
import { $, esc } from './dom';
import { emit } from './events';
import { importText } from './session';
import { closeSheet, openSheet, sheetTop } from './sheet';

interface Store { id: string; title: string; desc: string; icon: string; soon?: boolean }

const STORES: Store[] = [
  { id: 'device', title: 'This device', desc: 'A file on your computer or phone. Works offline.',
    icon: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>' },
  { id: 'gdrive', title: 'Google Drive', desc: 'Soon', soon: true,
    icon: '<path d="M8 4h8l5 9-4 7H7l-4-7z"/><path d="M8 4l4 7M16 4l-4 7M3 13h18"/>' },
  { id: 'onedrive', title: 'OneDrive', desc: 'Soon', soon: true,
    icon: '<path d="M7 18h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.3-1.5A4.5 4.5 0 0 0 7 18z"/>' },
  { id: 'dropbox', title: 'Dropbox', desc: 'Soon', soon: true,
    icon: '<path d="M7 4l5 3-5 3-5-3zM17 4l5 3-5 3-5-3zM7 10l5 3-5 3-5-3zM17 10l5 3-5 3-5-3zM7 17.5l5 3 5-3"/>' },
  { id: 'browser', title: 'Browser only', desc: 'Stays in this browser. Clearing site data erases it.',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>' },
];

/** mode 'save' = choose where to keep it; 'open' = load data saved before. */
export function openStoragePicker(mode: 'save' | 'open') {
  const open = mode === 'open';
  const list = STORES.filter(s => !(open && s.id === 'browser'));
  const current = (s: Store) => !open && target.kind === (s.id === 'device' ? 'file' : s.id);
  openSheet(`${sheetTop(open ? 'Load your data' : 'Save your data')}
    <h3 class="sh-title">${open ? 'Where is your data?' : 'Where should we keep your data?'}</h3>
    <p class="hint">${open ? 'Open the file you saved before.' : 'It never touches our servers. You can change this any time.'}</p>
    <div class="stores">${list.map(s => `<button type="button" class="store${s.soon ? ' soon' : ''}${current(s) ? ' on' : ''}"
        data-act="${s.soon ? 'soon' : s.id}"${s.soon ? ' aria-disabled="true"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true">${s.icon}</svg>
        <span><b>${esc(s.title)}</b><small>${esc(s.desc)}</small></span>
      </button>`).join('')}</div>
    <div class="menu"><button type="button" data-act="safe">Keep it safe</button></div><div class="btns"><button class="btn quiet" type="button" data-act="close">${open ? 'Cancel' : 'Decide later'}</button></div>`,
  {
    safe: openSafety,
    soon: () => {},
    browser: () => { setTarget('browser'); closeSheet(); },
    device: async () => {
      if (!open) { if (await chooseSaveFile()) closeSheet(); return; }
      if (!canWriteFiles) { closeSheet(); $<HTMLInputElement>('#file').click(); return; }
      closeSheet();
      if (await chooseOpenFile(importText)) emit('data-loaded');
    },
  });
}

function openStorageMenu() {
  const isFile = target.kind === 'file';
  openSheet(`${sheetTop('Where your data is kept')}
    <h3 class="sh-title">${esc(target.name)}</h3>
    <p class="hint">${isFile ? 'A file on this device. Changes save to it automatically.'
      : 'A downloaded file. This browser can’t save into files directly, so download a fresh copy after changes.'}</p>
    <div class="menu">
      ${isFile ? `<button type="button" data-act="now">Save now</button><button type="button" data-act="dl">Download a copy</button>`
               : `<button type="button" data-act="dl">Download latest</button>`}
      <button type="button" data-act="change">Keep it somewhere else…</button>
      <button type="button" data-act="forget" class="soft">Stop using this file</button>
    </div>`,
  {
    now: () => { writeFile(); closeSheet(); },
    dl: async () => { await downloadCopy(); closeSheet(); },
    safe: openSafety,
    change: () => openStoragePicker('save'),
    forget: () => {
      if (!confirm(`Stop saving to ${target.name}?\n\nThe file stays where it is. Your data stays in this browser.`)) return;
      setTarget('browser');
      closeSheet();
    },
  });
}

$('#saved').addEventListener('click', async () => {
  const next = await pillClick();
  if (next === 'picker') openStoragePicker('save');
  if (next === 'menu') openStorageMenu();
});
