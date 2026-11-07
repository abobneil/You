// The passphrase screens. One form, three jobs:
//   create – choose a passphrase for new (or not-yet-encrypted) data
//   unlock – returning visitor unlocks the browser copy
//   file   – unlock a locked file being loaded
import { createVault, type Vault } from '../core/crypto';
import { $ } from './dom';

export const MIN_LENGTH = 10;

const gate = $('#gate');
const form = $<HTMLFormElement>('#gate-form');
const pass = $<HTMLInputElement>('#gate-pass');
const again = $<HTMLInputElement>('#gate-again');
const againRow = $('#gate-again-row');
const user = $<HTMLInputElement>('#gate-user');
const msg = $('#gate-msg');
const go = $<HTMLButtonElement>('#gate-go');
const peek = $<HTMLButtonElement>('#gate-peek');

interface Screen {
  title: string;
  sub: string;
  button: string;
  busy: string;
  create: boolean;
  name?: string;
  note?: string;
  hint?: string;
  links?: { label: string; run: () => void }[];
  submit: (passphrase: string) => Promise<boolean>;
}
let current: Screen | null = null;
let previous: Screen | null = null;

function render(s: Screen) {
  current = s;
  document.body.classList.add('gated');
  gate.hidden = false;
  $('#gate-title').textContent = s.title;
  $('#gate-sub').textContent = s.sub;
  $('#gate-note').innerHTML = s.note ?? '';
  go.textContent = s.button;
  go.disabled = false;
  user.value = s.name ?? '';
  pass.value = again.value = '';
  pass.autocomplete = s.create ? 'new-password' : 'current-password';
  againRow.hidden = !s.create;
  setMessage(s.hint ?? '', true);
  setPeek(false);
  const links = $('#gate-links');
  links.innerHTML = '';
  for (const l of s.links ?? []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l.label;
    b.addEventListener('click', l.run);
    links.append(b);
  }
  pass.focus();
}

export function hideGate() {
  gate.hidden = true;
  document.body.classList.remove('gated');
  current = previous = null;
}

function setMessage(text: string, isHint = false) {
  msg.textContent = text;
  msg.classList.toggle('hint', isHint);
  pass.setAttribute('aria-invalid', String(!!text && !isHint));
}

function setPeek(show: boolean) {
  pass.type = again.type = show ? 'text' : 'password';
  peek.setAttribute('aria-pressed', String(show));
  peek.setAttribute('aria-label', show ? 'Hide passphrase' : 'Show passphrase');
}
peek.addEventListener('click', () => { setPeek(pass.type === 'password'); pass.focus(); });

form.addEventListener('submit', async e => {
  e.preventDefault();
  const s = current;
  if (!s || go.disabled) return;
  const p = pass.value;
  if (s.create) {
    if (p.length < MIN_LENGTH) { setMessage(`Use at least ${MIN_LENGTH} characters. A short sentence works well.`); return pass.focus(); }
    if (p !== again.value) { setMessage('Those two don’t match. Try typing it again.'); again.value = ''; return again.focus(); }
  } else if (!p) return pass.focus();
  go.disabled = true;
  go.textContent = s.busy;
  setMessage('');
  const ok = await s.submit(p);
  if (current !== s) return; // the screen moved on
  go.disabled = false;
  go.textContent = s.button;
  if (!ok) { setMessage('That passphrase didn’t work. Check for typos or Caps Lock.'); pass.select(); }
});

const KEEP_IT_SAFE = '<b>Save it in your password manager.</b> If it’s lost, no one can unlock your data, not even us. Your browser may offer to suggest one and save it for you.';

/** Asks for a new passphrase and returns the key made from it. */
export function askNewPassphrase(name: string, why: 'new' | 'upgrade' | 'import'): Promise<Vault> {
  const text = {
    new: { title: 'Lock it with a passphrase', sub: 'Everything you add is encrypted with this before it’s saved anywhere, even in this browser.' },
    upgrade: { title: 'Protect what you’ve added', sub: 'From now on, everything is encrypted with a passphrase before it’s saved, even in this browser.' },
    import: { title: 'Choose a passphrase for this data', sub: 'This file was saved before You encrypted data. From now on it will be locked.' },
  }[why];
  return new Promise(resolve => render({
    ...text, name, create: true, button: 'Lock and continue', busy: 'Locking…', note: KEEP_IT_SAFE,
    hint: `At least ${MIN_LENGTH} characters. A short sentence works well.`,
    submit: async p => { resolve(await createVault(p)); return true; },
  }));
}

/**
 * Asks for an existing passphrase. `tryIt` returns true if it unlocked.
 * Resolves true once unlocked, or false if the person cancelled (file mode only).
 */
export function askPassphrase(mode: 'unlock' | 'file', tryIt: (p: string) => Promise<boolean>,
  links: { label: string; run: () => void }[] = []): Promise<boolean> {
  return new Promise(resolve => {
    if (mode === 'file') previous = current;
    const back = previous;
    render({
      title: mode === 'unlock' ? 'Welcome back' : 'This file is locked',
      sub: mode === 'unlock' ? 'Enter your passphrase to unlock your data.' : 'Enter the passphrase you used when you saved it.',
      create: false, button: 'Unlock', busy: 'Unlocking…',
      links: mode === 'file'
        ? [{ label: 'Cancel', run: () => { back ? render(back) : hideGate(); resolve(false); } }]
        : links,
      submit: async p => { const ok = await tryIt(p); if (ok) resolve(true); return ok; },
    });
  });
}
