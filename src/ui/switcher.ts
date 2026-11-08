import { local } from '../storage/local';
import { openHelp } from './help';
import { openSafety } from './safety';
import { downloadCopy } from '../storage/target';
// Switching between Yous on this browser. Switching, adding and locking reload the page,
// so the previous You's data and key are gone from memory.
import { canLeave, eraseBrowserCopy, profile, vault } from '../state';
import { byRecent, currentId, placeLabel, setCurrent, startNew } from '../storage/profiles';
import { $, esc } from './dom';
import { closeSheet, openSheet, sheetTop } from './sheet';

const reloadClean = () => location.replace(location.pathname);

export async function switchTo(id: string) { if (!await canLeave()) return; setCurrent(id); reloadClean(); }
export async function addNewYou() { if (!await canLeave()) return; startNew(); reloadClean(); }
export const lockNow = async () => { if (await canLeave()) reloadClean(); };

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
      return `<li><button type="button" data-act="pick" data-id="${esc(e.id)}" class="${isCur ? 'on' : ''}">
        <span class="av">${esc(initial(e.label))}</span>
        <span class="yn"><b>${esc(placeLabel(e))}</b><small>${isCur ? (unlocked ? 'Open now' : 'Selected') : 'Switch'}</small></span>
      </button></li>`;
    }).join('')}</ul>
    ${unlocked ? `<p class="hint">${profile.unreadable?.length ? `${profile.unreadable.length} item(s) couldn't be read and are kept as-is.` : ''}</p><label>Lock after no interaction <select id="lock-time">${[5,15,60,0].map(n => `<option value="${n}" ${n === timeoutMinutes() ? 'selected' : ''}>${n ? n + ' minutes' : 'Never'}</option>`).join('')}</select></label>` : ''}
    <div class="menu"><button type="button" data-act="help">Help</button><button type="button" data-act="safe">Keep it safe</button>
      <button type="button" data-act="new">+ Add a new You</button>
      ${unlocked ? `<button type="button" data-act="lock">Lock ${name}</button>
        <button type="button" data-act="remove" class="soft">Remove ${name} from this browser…</button>` : ''}
    </div>
    <p class="hint">Each You has its own passphrase. Only names are shown here; everything else stays encrypted.</p>`,
  {
    pick: b => { if (b.dataset.id === cur && unlocked) return closeSheet(); switchTo(b.dataset.id!); },
    new: addNewYou,
    lock: lockNow,
    help: openHelp,
    safe: openSafety,
    remove: () => {
      openSheet(`${sheetTop('Remove from this browser')}<h3 class="sh-title">Remove ${name}?</h3>
        <p>This removes only this browser’s copy of this You. Other Yous and saved files stay.</p>
        <p>If you have no saved file, this copy will be gone for good.</p>
        <div class="menu"><button data-act="copy">Download a copy first</button><button data-act="remove">Remove this browser’s copy</button><button data-act="close">Cancel</button></div>`, {
        copy: async () => { await downloadCopy(); },
        remove: async () => { await eraseBrowserCopy(cur); reloadClean(); },
      });
    },
  });
}

function timeoutMinutes() { return Number(local.get('you.timeout.' + profile.id) ?? 15); }
let lastInteraction = Date.now(), hiddenAt = 0, locking = false;
async function checkLock() {
  const minutes = timeoutMinutes();
  if (!vault || !minutes || locking || Date.now() - lastInteraction < minutes * 60000) return;
  locking = true; await lockNow(); locking = false; lastInteraction = Date.now();
}
for (const event of ['pointerdown', 'keydown', 'input']) document.addEventListener(event, () => { lastInteraction = Date.now(); }, { passive: true });
document.addEventListener('change', e => { const el = e.target as HTMLSelectElement; if (el.id === 'lock-time') local.set('you.timeout.' + profile.id, el.value); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && timeoutMinutes() && Date.now() - hiddenAt >= timeoutMinutes() * 60000) { lastInteraction = hiddenAt; void checkLock(); }
});
setInterval(() => { void checkLock(); }, 15000);

// The round initial button in the home screen's top bar.
const btn = $('#who-btn');
export function renderWhoButton() {
  btn.textContent = `${profile.name.split(' ')[0] || 'You'} · Menu`;
  btn.setAttribute('aria-label', `${profile.name || 'You'}: switch or lock`);
}
btn.addEventListener('click', openSwitcher);
