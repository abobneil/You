import { passphraseStrength } from '../core/passphrase';
// The passphrase screens. One form, three jobs:
//   create – choose a passphrase for new (or not-yet-encrypted) data
//   unlock – returning visitor unlocks the browser copy
//   file   – unlock a locked file being loaded
import { createVault, type Vault } from '../core/crypto';
import { $, disableKeepingFocus } from './dom';
import { DamagedFile, UnsupportedVersion } from '../storage/fileFormat';
import { backToField } from './keyboard';
import { focusFallbackSoon } from './sheet';

let weakConfirmed = '';

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
  who?: WhoRow;
  submit: (passphrase: string) => Promise<boolean>;
}

/** The Yous on this browser, shown under the unlock form so you can switch before unlocking. */
export interface WhoRow {
  items: { id: string; label: string; current: boolean }[];
  pick: (id: string) => void;
  add: () => void;
}
let current: Screen | null = null;
let previous: Screen | null = null;
const strength = document.createElement('p');
strength.className = 'hint'; strength.setAttribute('aria-live', 'polite');
pass.parentElement!.append(strength);
pass.addEventListener('input', () => {
 weakConfirmed = ''; go.textContent = current?.button ?? '';
 const level = passphraseStrength(pass.value);
 strength.textContent = current?.create && pass.value ? level === 'Weak' ? 'Weak — try a few unrelated words' : level : '';
});

function render(s: Screen) {
  current = s; strength.textContent = ''; weakConfirmed = '';
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
  renderWho(s.who);
  pass.focus();
}

function renderWho(w?: WhoRow) {
  const row = $('#gate-who');
  row.innerHTML = '';
  row.hidden = !w;
  if (!w) return;
  const others = w.items.filter(i => !i.current);
  const label = document.createElement('span');
  label.className = 'gate-who-label';
  label.textContent = others.length ? 'Not you?' : 'Someone else?';
  row.append(label);
  for (const i of others) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'you-chip';
    b.innerHTML = '<span class="av"></span><span class="nm"></span>';
    b.querySelector('.av')!.textContent = (i.label.trim()[0] || '?').toUpperCase();
    b.querySelector('.nm')!.textContent = i.label || 'Locked You';
    b.addEventListener('click', () => w.pick(i.id));
    row.append(b);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'you-chip add';
  add.textContent = '+ New You';
  add.addEventListener('click', w.add);
  row.append(add);
}

/** Goes back to the screen that was showing before a file's passphrase was asked for (or hides the gate). */
export function backToPrevious() {
  const back = previous;
  if (back) { previous = null; render(back); } else hideGate();
}

export function hideGate() {
  gate.hidden = true;
  document.body.classList.remove('gated');
  current = previous = null;
  // Focus was in the gate, which is now hidden: land it on the screen that's showing.
  focusFallbackSoon();
}

function setMessage(text: string, isHint = false, field: HTMLInputElement = pass) {
  msg.textContent = text;
  msg.classList.toggle('hint', isHint);
  // The message sits under both fields and is read with them; only the field at fault is marked.
  pass.setAttribute('aria-invalid', String(!!text && !isHint && field === pass));
  again.setAttribute('aria-invalid', String(!!text && !isHint && field === again));
}

function setPeek(show: boolean) {
  pass.type = again.type = show ? 'text' : 'password';
  peek.setAttribute('aria-pressed', String(show));
  peek.setAttribute('aria-label', show ? 'Hide passphrase' : 'Show passphrase');
}
peek.addEventListener('click', e => { setPeek(pass.type === 'password'); if (backToField(e)) pass.focus(); });

form.addEventListener('submit', async e => {
  e.preventDefault();
  const s = current;
  if (!s || go.disabled) return;
  const p = pass.value;
  if (s.create) {
    if (!p) { setMessage('Choose a passphrase first.'); return pass.focus(); }
    if (passphraseStrength(p) === 'Weak' && weakConfirmed !== p) { weakConfirmed = p; setMessage('This may be easy to guess. Try a few unrelated words, or use it anyway.', true); go.textContent = 'Use it anyway'; return; }
    if (p !== again.value) { setMessage('The second passphrase doesn’t match the first. Type it again.', false, again); again.value = ''; return again.focus(); }
  } else if (!p) { setMessage('Type your passphrase first.'); return pass.focus(); }
  disableKeepingFocus(go, pass);
  go.textContent = s.busy;
  setMessage('');
  let ok = false, problem = '';
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (current !== s) return;
      ok = await s.submit(p);
    }
  catch (e) {
    // Never leave the screen stuck on "Unlocking…": say what happened in plain words.
    console.error(e);
    problem = e instanceof DamagedFile || e instanceof UnsupportedVersion ? e.message : 'This couldn’t be opened. Nothing was changed. Try again.';
  }
  if (current !== s) return; // the screen moved on
  go.disabled = false;
  go.textContent = s.button;
  if (problem) setMessage(problem);
  else if (!ok) { setMessage('That passphrase didn’t work. Check for typos or Caps Lock.'); pass.select(); }
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
    hint: 'A few unrelated words work well. A password manager can help.',
    submit: async p => { resolve(await createVault(p)); return true; },
  }));
}

/**
 * Asks for an existing passphrase. `tryIt` returns true if it unlocked.
 * Resolves true once unlocked, or false if the person cancelled (file mode only).
 */
export function askPassphrase(mode: 'unlock' | 'file', tryIt: (p: string) => Promise<boolean>,
  opts: { name?: string; who?: WhoRow; note?: string; links?: { label: string; run: () => void }[] } = {}): Promise<boolean> {
  return new Promise(resolve => {
    if (mode === 'file') previous = current;
    const back = previous;
    render({
      title: mode === 'unlock' ? (opts.name ? `Welcome back, ${opts.name}` : 'Welcome back') : 'This file is locked',
      name: opts.name,
      sub: mode === 'unlock' ? 'Enter your passphrase to unlock your data.' : 'Enter the passphrase you used when you saved it.',
      create: false, button: 'Unlock', busy: 'Unlocking…', note: opts.note,
      links: mode === 'file'
        ? [...(opts.links ?? []), { label: 'Cancel', run: () => { back ? render(back) : hideGate(); resolve(false); } }]
        : opts.links,
      who: mode === 'unlock' ? opts.who : undefined,
      submit: async p => { const ok = await tryIt(p); if (ok) resolve(true); return ok; },
    });
  });
}
