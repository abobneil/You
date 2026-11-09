import { local } from '../storage/local';
import { openHelp } from './help';
import { openSafety } from './safety';
import { downloadCopy } from '../storage/target';
// Switching between Yous on this browser. Switching, adding and locking reload the page,
// so the previous You's data and key are gone from memory.
import { browserSaveState, canLeave, eraseBrowserCopy, flushPending, persist, profile, setLockedInPlace, settleAfterUnlock, vault } from '../state';
import { deriveVault, openWith, seal, WrongPassphrase, type Envelope, type Vault } from '../core/crypto';
import { askPassphrase, hideGate } from './gate';
import { keepOpenDraft, offerKeptDrafts } from './drafts';
import { emit } from './events';
import { byRecent, currentId, placeLabel, setCurrent, startNew } from '../storage/profiles';
import { $, esc } from './dom';
import { closeSheet, openSheet, sheetTop } from './sheet';
import { isKeptFromOtherCopy } from '../core/compare';
import { listArchived } from '../storage/archive';
import { restoreArchived } from '../state';

/** What the preservation bucket holds, in words: copies kept from a combine vs things that couldn't be read. */
export function unreadableText(items: unknown[] | undefined): string {
  const list = items ?? [];
  const kept = list.filter(isKeptFromOtherCopy).length, bad = list.length - kept;
  return [kept ? `${kept} item(s) kept from another copy when two were combined, saved in this You.` : '',
    bad ? `${bad} item(s) couldn't be read and are kept as-is.` : ''].filter(Boolean).join(' ');
}

// Drops any history entry an open sheet added, so the fresh page starts on home rather than a stale sheet marker.
export const reloadClean = () => { try { history.replaceState(null, ''); } catch { /* not allowed */ } location.replace(location.pathname); };

export async function switchTo(id: string) { if (!await canLeave()) return; setCurrent(id); reloadClean(); }
export async function addNewYou() { if (!await canLeave()) return; startNew(); reloadClean(); }
export const lockNow = async () => { if (await canLeave()) reloadClean(); };

/** "A" for Alex; "?" if the name isn't known yet. */
export const initial = (label: string) => (label.trim()[0] || '?').toUpperCase();

export async function openSwitcher() {
  const list = byRecent();
  const cur = currentId();
  const unlocked = !!vault && profile.id === cur;
  // Only offered when there is something to go back to, so the menu stays short.
  const earlier = unlocked ? (await listArchived(cur).catch(() => [])).length : 0;
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
    ${unlocked ? `<p class="hint">${unreadableText(profile.unreadable)}</p><label class="sel-lab">Lock after no interaction <select class="fsel" id="lock-time">${[5,15,60,0].map(n => `<option value="${n}" ${n === timeoutMinutes() ? 'selected' : ''}>${n ? n + ' minutes' : 'Never'}</option>`).join('')}</select></label>` : ''}
    <div class="menu"><button type="button" data-act="help">Help</button><button type="button" data-act="safe">Keep it safe</button>
      <button type="button" data-act="new">+ Add a new You</button>
      ${earlier ? `<button type="button" data-act="earlier">Earlier versions (${earlier})</button>` : ''}
      ${unlocked ? `<button type="button" data-act="open">Open a file…</button>
        <button type="button" data-act="lock">Lock ${name}</button>
        <button type="button" data-act="remove" class="soft">Remove ${name} from this browser…</button>` : ''}
    </div>
    <p class="hint">Each You has its own passphrase. Only names are shown here; everything else stays encrypted.</p>`,
  {
    pick: b => { if (b.dataset.id === cur && unlocked) return closeSheet(); switchTo(b.dataset.id!); },
    new: addNewYou,
    lock: lockNow,
    open: async () => (await import('./storagePicker')).openStoragePicker('open'),
    help: openHelp,
    safe: openSafety,
    earlier: () => { void openEarlier(cur); },
    remove: () => {
      openSheet(`${sheetTop('Remove from this browser')}<h3 class="sh-title">Remove ${name}?</h3>
        <p>This removes only this browser’s copy of this You, with its earlier versions. Other Yous and saved files stay.</p>
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
  if (!vault || !minutes || locking || inPlace || Date.now() - lastInteraction < minutes * 60000) return;
  locking = true;
  try { await autoLock(); }
  catch (e) { console.error(e); await lockInPlace(); }
  finally { locking = false; lastInteraction = Date.now(); }
}

/**
 * Locking by itself, with nobody there to answer questions: keep any unfinished typing (encrypted,
 * in the record), then lock. If saving didn't work, the content is hidden behind the lock screen
 * anyway, and the unsaved work stays in this tab until it's unlocked or downloaded.
 */
async function autoLock() {
  keepOpenDraft();
  if (await flushPending() && browserSaveState().status === 'saved') { reloadClean(); return; }
  await lockInPlace();
}

let inPlace = false;
/** Hides everything behind the unlock screen without leaving the page, so unsaved work isn't lost. */
async function lockInPlace() {
  if (inPlace || !vault) return;
  inPlace = true;
  try {
    try { keepOpenDraft(); } catch { closeSheet(); }
    if ((document.querySelector('#sheet') as HTMLDialogElement | null)?.open) closeSheet();
    hideContent();
    setLockedInPlace(true);
    const v = vault, check = await sealCheck(v);
    await askPassphrase('unlock', async p => {
      try { await openWith(await deriveVault(p, v.salt, v.iterations), check); return true; }
      catch (e) { if (e instanceof WrongPassphrase) return false; throw e; }
    }, {
      name: profile.name,
      links: [
        { label: 'Download your unsaved changes', run: () => { void downloadCopy(true); } },
        { label: 'Try saving again', run: () => { void persist(); } },
      ],
      note: '<b>Some changes weren’t saved yet.</b> They’re kept in this tab. Unlock to keep working, or download them now (the file opens with the same passphrase).',
    });
    hideGate();
    setLockedInPlace(false);
    emit('data-loaded');
    offerKeptDrafts();
    // Anything another tab saved while this one was locked is settled now: newer work loads, or the person is asked.
    await settleAfterUnlock();
  } finally { inPlace = false; setLockedInPlace(false); lastInteraction = Date.now(); }
}
/** Something small sealed with the key, so the passphrase can be checked without keeping it. */
const sealCheck = async (v: Vault) => JSON.parse(await seal(v, 'you-lock-check')) as Envelope;
function hideContent() {
  document.body.classList.remove('home');
  for (const id of ['#areas', '#a-body', '#timeline', '#life']) { const el = document.querySelector(id); if (el) el.innerHTML = ''; }
  const space = document.querySelector<HTMLElement>('#space'); if (space) space.hidden = true;
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
  // The spoken name starts with the words on the button (WCAG 2.5.3), then says what the menu holds.
  btn.setAttribute('aria-label', `${btn.textContent}: switch, lock or open a file`);
}
btn.addEventListener('click', openSwitcher);

/**
 * Earlier versions of this You kept in this browser (each time opening a file replaced it). Restoring one
 * keeps what's here now as an earlier version too, so nothing is lost either way.
 */
export async function openEarlier(id: string) {
  const list = await listArchived(id);
  const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  openSheet(`${sheetTop('Earlier versions')}<h3 class="sh-title">Earlier versions kept in this browser</h3>
    <p class="hint">When opening a file replaced what was here, the version it replaced was kept, still encrypted.</p>
    <ul class="yous">${list.map(v => `<li><button type="button" data-act="restore" data-key="${esc(v.key)}"><span class="yn"><b>${esc(when(v.at))}</b><small>Kept ${esc(v.reason)} · Restore this version</small></span></button></li>`).join('') || '<li class="hint">None yet.</li>'}</ul>
    <div class="btns"><button class="btn quiet" type="button" data-act="close">Close</button></div>`, {
    restore: b => {
      const key = b.dataset.key!;
      const v = list.find(x => x.key === key);
      openSheet(`${sheetTop('Earlier versions')}<h3 class="sh-title">Go back to the version from ${esc(v ? when(v.at) : 'earlier')}?</h3>
        <p>What’s in this browser now is kept as an earlier version first, so you can come back to it.</p>
        <p class="hint">You’ll unlock it with the passphrase it was saved with.</p>
        <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" data-act="go">Restore this version</button></div>`, {
        go: async () => { if (!await canLeave()) return; if (await restoreArchived(id, key)) { setCurrent(id); reloadClean(); } },
      });
    },
  });
}
