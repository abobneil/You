// Switching between Yous on this browser. Switching, adding and locking reload the page,
// so the previous You's data and key are gone from memory.
import { eraseBrowserCopy, profile, vault } from '../state';
import { byRecent, currentId, setCurrent, startNew } from '../storage/profiles';
import { target } from '../storage/target';
import { $, esc } from './dom';
import { closeSheet, openSheet, sheetTop } from './sheet';

const reloadClean = () => location.replace(location.pathname);

export function switchTo(id: string) { setCurrent(id); reloadClean(); }
export function addNewYou() { startNew(); reloadClean(); }
export const lockNow = reloadClean;

/** "A" for Alex; "?" if the name isn't known yet. */
export const initial = (label: string) => (label.trim()[0] || '?').toUpperCase();

export function openSwitcher() {
  const list = byRecent();
  const cur = currentId();
  const unlocked = !!vault && profile.id === cur;
  const name = esc(profile.name || 'this You');
  openSheet(`${sheetTop('Yous on this browser')}
    <h3 class="sh-title">Switch You</h3>
    <ul class="yous">${list.map(e => {
      const isCur = e.id === cur;
      return `<li><button type="button" data-act="pick" data-id="${e.id}" class="${isCur ? 'on' : ''}">
        <span class="av">${esc(initial(e.label))}</span>
        <span class="yn"><b>${esc(e.label || 'Locked You')}</b><small>${isCur ? (unlocked ? 'Open now' : 'Selected') : 'Switch'}</small></span>
      </button></li>`;
    }).join('')}</ul>
    <div class="menu">
      <button type="button" data-act="new">+ Add a new You</button>
      ${unlocked ? `<button type="button" data-act="lock">Lock ${name}</button>
        <button type="button" data-act="remove" class="soft">Remove ${name} from this browser…</button>` : ''}
    </div>
    <p class="hint">Each You has its own passphrase. Only names are shown here; everything else stays encrypted.</p>`,
  {
    pick: b => { if (b.dataset.id === cur && unlocked) return closeSheet(); switchTo(b.dataset.id!); },
    new: addNewYou,
    lock: lockNow,
    remove: () => {
      const elsewhere = target.kind !== 'browser'
        ? `Your file ${target.name} stays where it is, so you can load it again later.`
        : 'This is the only copy. Unless you’ve saved it somewhere, it will be gone for good.';
      if (!confirm(`Remove ${profile.name || 'this You'} from this browser?\n\n${elsewhere}`)) return;
      eraseBrowserCopy(cur);
      reloadClean();
    },
  });
}

// The round initial button in the home screen's top bar.
const btn = $('#who-btn');
export function renderWhoButton() {
  btn.textContent = initial(profile.name);
  btn.setAttribute('aria-label', `${profile.name || 'You'}: switch or lock`);
}
btn.addEventListener('click', openSwitcher);
