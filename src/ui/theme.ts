// Light / dark toggle. Follows the system until the person picks one, then remembers it.
// index.html applies the saved theme before first paint; this file handles the button.
import { KEYS, local } from '../storage/local';
import { $ } from './dom';

const root = document.documentElement;
const btn = $('#theme');
const label = () => btn.setAttribute('aria-label', root.dataset.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');

label();
btn.addEventListener('mousedown', e => e.preventDefault()); // don't steal focus from the name field
btn.addEventListener('click', () => {
  const next = root.dataset.mode === 'dark' ? 'light' : 'dark';
  root.dataset.theme = root.dataset.mode = next;
  local.set(KEYS.theme, next);
  label();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (root.dataset.theme) return; // the person already chose
  root.dataset.mode = e.matches ? 'dark' : 'light';
  label();
});
