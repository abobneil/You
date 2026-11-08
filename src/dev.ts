// Development-only tools. main.ts loads this only when import.meta.env.DEV is true,
// so none of it ships in the built site.
//   ?reset in the address  → wipe everything and start at the name screen
//   "dev" button (corner)  → Clear cards (keeps your You and passphrase) or Reset everything
import { profile, save, vault } from './state';
import { vaultStore } from './storage/vaultStore';
import { flushPending } from './state';
import { idb } from './storage/idb';

/** Removes every You, setting and saved-file link in this browser. Keeps the light/dark choice. */
export async function resetEverything() {
  await flushPending();
  await vaultStore.clear();
  const keep = new Set(['you.theme']);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('you.') && !keep.has(k)) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch { /* storage unavailable */ }
  await idb.clear();
  location.replace(location.pathname);
}

/** Deletes all cards and links in the open You. The You, its passphrase and save location stay. */
export function clearCards() {
  profile.cards = [];
  profile.links = [];
  save();
}

/** Returns true if the page is resetting (so the app shouldn't start). */
export async function init(): Promise<boolean> {
  if (new URLSearchParams(location.search).has('reset')) { await resetEverything(); return true; }
  mountPanel();
  return false;
}

function mountPanel() {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50;font:12px ui-monospace,monospace;display:flex;flex-direction:column-reverse;align-items:flex-start;gap:6px';
  const btn = (label: string, css = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'font:inherit;padding:5px 10px;border-radius:8px;cursor:pointer;border:1px dashed #FF5A36;background:var(--card,#fff);color:var(--ink,#141414);' + css;
    return b;
  };
  const toggle = btn('dev', 'opacity:.55');
  const menu = document.createElement('div');
  menu.style.cssText = 'display:none;flex-direction:column;gap:6px';
  const clear = btn('Clear cards');
  const reset = btn('Reset everything', 'color:#FF5A36');
  menu.append(clear, reset);
  wrap.append(toggle, menu);
  document.body.append(wrap);

  toggle.addEventListener('click', () => {
    const open = menu.style.display === 'none';
    menu.style.display = open ? 'flex' : 'none';
    const canClear = !!vault && document.body.classList.contains('home');
    clear.disabled = !canClear;
    clear.title = canClear ? `Delete all ${profile.cards.length} cards in ${profile.name}` : 'Unlock a You first';
    clear.style.opacity = canClear ? '1' : '.4';
  });
  clear.addEventListener('click', () => { clearCards(); menu.style.display = 'none'; });
  reset.addEventListener('click', () => { resetEverything(); });
}
