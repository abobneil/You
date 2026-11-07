// "What is your name?" — the first screen.
import { profile, save } from '../state';
import { loadText, setTarget } from '../storage/target';
import { $ } from './dom';
import { emit } from './events';
import { showHome } from './router';
import { openStoragePicker } from './storagePicker';

const nameInput = $<HTMLInputElement>('#name');
const enterBtn = $('#enter');
const hello = $('.hello');

// Keep focus on the field so the person can just start typing.
nameInput.focus();
document.addEventListener('keydown', e => {
  if (document.body.classList.contains('home') || document.querySelector('dialog[open]')) return;
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
  profile.name = v;
  save();
  hello.innerHTML = 'Nice to meet you, <span></span>.';
  hello.querySelector('span')!.textContent = v;
  document.body.classList.add('done');
  setTimeout(showHome, 1600);
}

// "or load your data" opens the storage picker in open mode.
$('#load').addEventListener('click', () => openStoragePicker('open'));

// Fallback for browsers without file access: a plain file input. The data loads into this browser.
$<HTMLInputElement>('#file').addEventListener('change', async e => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (f && loadText(await f.text())) { setTarget('browser'); emit('data-loaded'); }
});
