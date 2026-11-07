// "What is your name?" — the first screen.
import { profile } from '../state';
import { setTarget } from '../storage/target';
import { $ } from './dom';
import { emit } from './events';
import { listProfiles } from '../storage/profiles';
import { importText } from './session';
import { openSwitcher } from './switcher';
import { openStoragePicker } from './storagePicker';

const nameInput = $<HTMLInputElement>('#name');
const enterBtn = $('#enter');
const hello = $('.hello');

// Keep focus on the field so the person can just start typing.
nameInput.focus();
document.addEventListener('keydown', e => {
  const b = document.body.classList;
  if (b.contains('home') || b.contains('gated') || document.querySelector('dialog[open]')) return;
  if (document.activeElement !== nameInput && e.key.length === 1 && !e.metaKey && !e.ctrlKey) nameInput.focus();
});

nameInput.addEventListener('input', () => nameInput.classList.toggle('filled', nameInput.value.trim().length > 0));

enterBtn.addEventListener('mousedown', e => e.preventDefault()); // keep the cursor in the field
enterBtn.addEventListener('click', submit);
nameInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  enterBtn.classList.add('pressed'); // the arrow nudges as if pressed
  setTimeout(submit, 120);
});

function submit() {
  enterBtn.classList.remove('pressed');
  const v = nameInput.value.trim();
  if (!v) return;
  profile.name = v; // kept in memory only until a passphrase exists
  hello.innerHTML = 'Nice to meet you, <span></span>.';
  hello.querySelector('span')!.textContent = v;
  document.body.classList.add('done');
  setTimeout(() => emit('named'), 1600);
}

// When other Yous live in this browser, offer a way back to them.
const others = $('#other-yous');
others.hidden = listProfiles().length === 0;
others.addEventListener('click', openSwitcher);

// "or load your data" opens the storage picker in open mode.
$('#load').addEventListener('click', () => openStoragePicker('open'));

// Fallback for browsers without file access: a plain file input. The data loads into this browser.
$<HTMLInputElement>('#file').addEventListener('change', async e => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (f && (await importText(await f.text()))) { setTarget('browser'); emit('data-loaded'); }
});
