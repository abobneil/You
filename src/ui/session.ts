import { closeSheet, openSheet, sheetTop } from './sheet';
import { esc } from './dom';
// Getting into your data: first visit, returning visit, upgrading old data, and loading a file.
import { newId } from '../core/cards';
import { WrongPassphrase, type Vault } from '../core/crypto';
import type { Profile } from '../core/types';
import { canLeave, eraseBrowserCopy, legacyProfile, profile, setSession, storedEnvelope } from '../state';
import { decode, readFile, readText, UnsupportedVersion, DamagedFile } from '../storage/fileFormat';
import { keepsakeStore } from '../storage/keepsakeAccess';
import { commitStaged, describeProblems, discardStaged, stageKeepsakes, type Staged } from '../storage/keepsakeImport';
import { byRecent, currentId, hasVault, listProfiles, placeLabel, setCurrent, startNew } from '../storage/profiles';
import { downloadCopy, setTarget } from '../storage/target';
import { askNewPassphrase, askPassphrase, backToPrevious, hideGate, type WhoRow } from './gate';
import { openStoragePicker } from './storagePicker';
import { addNewYou, switchTo, reloadClean } from './switcher';

/** After the name screen: choose a passphrase, then save for the first time. */
export async function lockNewData() {
  const v = await askNewPassphrase(profile.name, 'new');
  await setSession(profile, v);
  hideGate();
}

/** The other Yous on this browser, for the unlock screen. */
function whoRow(): WhoRow {
  const cur = currentId();
  return {
    items: byRecent().map(e => ({ id: e.id, label: placeLabel(e), current: e.id === cur })),
    pick: id => { if (id !== cur) switchTo(id); },
    add: addNewYou,
  };
}

/** Explains that this browser's copy can't be read, keeps it, and offers it as a file for safekeeping. */
function damagedBrowserCopy(slot: string, stored: string) {
  startNew();
  const label = listProfiles().find(e => e.id === slot)?.label || 'This You';
  openSheet(`${sheetTop('Couldn’t open')}<h3 class="sh-title">${esc(label)}’s copy in this browser can’t be read</h3>
    <p>It may be damaged. It has been kept exactly as it is, and nothing will be saved over it.</p>
    <p class="hint">If you have a saved file, open that instead. You can also save this copy as a file to keep it, or start a new You.</p>
    <div class="menu"><button data-act="open">Open a saved file</button><button data-act="keep">Save this copy as a file</button><button data-act="close">Start a new You</button></div>`, {
    open: () => { closeSheet(); openStoragePicker('open'); },
    keep: () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([stored], { type: 'application/json' }));
      a.download = `${label} (copy that couldn't be read).you.json`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
  });
}

/**
 * On page load. Resolves 'home' once the open You is unlocked,
 * or 'landing' if there's nothing to unlock (show the name screen).
 */
export async function start(): Promise<'home' | 'landing'> {
  const slot = currentId();
  const stored = await storedEnvelope(slot);
  if (stored) {
    let r: ReturnType<typeof readText> | null = null;
    try { r = readText(stored); } catch { /* unreadable: fall through */ }
    if (r?.kind === 'locked') {
      const all = listProfiles();
      const own = all.find(e => e.id === slot)?.label ?? '';
      // Two Yous with the same name get the same numbers the switcher shows, so "Welcome back" is never ambiguous.
      const same = all.filter(e => e.label.trim().toLowerCase() === own.trim().toLowerCase());
      const label = same.length > 1 ? `${own} (${same.findIndex(e => e.id === slot) + 1})` : own;
      await askPassphrase('unlock', async p => {
        // Decrypt the copy as it is now, not as it was when this page loaded: another tab may have saved since.
        const now = await storedEnvelope(slot);
        const fresh = now ? readText(now) : null;
        if (!now || fresh?.kind !== 'locked') throw new DamagedFile('this browser’s copy can’t be read');
        try {
          const d = await decode(p, fresh.env);
          // The browser slot decides which You this is, so its save location and settings stay attached.
          d.profile.id = slot || d.profile.id;
          await setSession(d.profile, d.vault, now);
          return true;
        }
        catch (e) { if (e instanceof WrongPassphrase) return false; throw e; }
      }, {
        name: label,
        who: whoRow(),
        links: [
          { label: 'Load a different file', run: () => openStoragePicker('open') },
          { label: 'Forgot it?', run: forgot },
        ],
      });
      hideGate();
      return 'home';
    }
    // A copy is here but can't be read (damaged, or changed outside You). Keep it untouched under its own id,
    // and make sure anything started now gets a new id so it can never be written over that copy.
    damagedBrowserCopy(slot, stored);
    return 'landing';
  }
  const legacy = legacyProfile();
  if (legacy) {
    legacy.id = legacy.id || newId();
    await setSession(legacy, null);
    const v = await askNewPassphrase(legacy.name, 'upgrade');
    await setSession(legacy, v);
    hideGate();
    return 'home';
  }
  return 'landing';
}

/** A file that can't be opened: says why in the app's own sheet, and offers another file. Nothing has changed. */
function cannotOpen(e: unknown) {
  const why = e instanceof UnsupportedVersion || e instanceof DamagedFile ? e.message : 'That file doesn’t look like your You data.';
  openSheet(`${sheetTop('Couldn’t open')}<h3 class="sh-title">This file couldn’t be opened</h3>
    <p>${esc(why)}</p>
    <p class="hint">Nothing was changed. If you have another saved copy, you can try that one.</p>
    <div class="menu"><button type="button" data-act="other">Choose another file</button><button type="button" data-act="close">OK</button></div>`, {
    other: () => openStoragePicker('open'),
  });
}

/** Loads a file, asking for its passphrase (or a new one) as needed. False if cancelled or invalid. */
export async function importText(source: Blob | string): Promise<boolean> {
  let r: ReturnType<typeof readText>;
  try { r = typeof source === 'string' ? readText(source) : await readFile(source); } catch (e) { cannotOpen(e); return false; }

  let loaded: Profile;
  let key: Vault | null = null;
  if (r.kind === 'locked') {
    const env = r.env;
    let got: { profile: Profile; vault: Vault } | null = null;
    const ok = await askPassphrase('file', async p => {
      try { got = await decode(p, env); return true; }
      catch (e) { if (e instanceof WrongPassphrase) return false; throw e; }
    }, { links: [{ label: 'Forgot it?', run: () => openSheet(`${sheetTop('Forgotten passphrase')}<h3 class="sh-title">Your file stays untouched</h3><p>Nobody can recover this passphrase. Check your password manager or where you wrote it down. You can try again when you find it.</p>`) }] });
    if (!ok || !got) return false;
    ({ profile: loaded, vault: key } = got as { profile: Profile; vault: Vault });
  } else {
    loaded = r.profile;
  }

  // Every attached file is decrypted and checked before anything here changes.
  let staged: Staged | null = null;
  const give = async () => { if (staged) await discardStaged(keepsakeStore, staged); backToPrevious(); return false; };
  if (r.kind === 'locked' && key) {
    try { staged = await stageKeepsakes(keepsakeStore, key, loaded, r.keepsakes()); }
    catch (e) { cannotOpen(e); hideGate(); return false; }
    const n = staged.problems.length;
    if (n && !confirm(`${n === 1 ? 'One attached file' : `${n} attached files`} in this record couldn’t be read:\n\n`
      + `${describeProblems(staged.problems)}\n\nOpen the rest anyway? Those files will show as unreadable. Choose Cancel to change nothing.`)) return give();
  }

  if (!await canLeave()) return give();

  // Files from before Yous had ids become a new You, never a silent overwrite of the open one.
  loaded.id = loaded.id || newId();

  // The same You may already be on this browser, possibly with newer changes.
  if (await hasVault(loaded.id)) {
    if (loaded.id === profile.id) {
      const older = (loaded.updatedAt || '') < (profile.updatedAt || '') || (loaded.rev || 0) < (profile.rev || 0);
      const proceed = await new Promise<boolean>(resolve => openSheet(`${sheetTop(older ? "This file is older than what's in this browser" : 'Open this version?')}<p>File saved ${esc(loaded.updatedAt || 'unknown')}, browser ${esc(profile.updatedAt || 'unknown')}.</p><div class="menu"><button data-act="keep">Keep the browser version</button><button data-act="first">Download the browser version first, then open the file</button><button data-act="anyway">Open the file anyway (the browser version is kept as a download)</button></div>`, {
        keep: () => resolve(false), close: () => resolve(false),
        first: async () => { await downloadCopy(true); resolve(true); },
        anyway: async () => { await downloadCopy(true); resolve(true); },
      }));
      if (!proceed) return give();
    } else {
      // This browser already has this You, locked. Unlock that copy first so the two can be compared.
      const label = listProfiles().find(e => e.id === loaded.id)?.label || loaded.name || 'this You';
      const unlockFirst = await new Promise<boolean>(resolve => openSheet(`${sheetTop('Already in this browser')}<h3 class="sh-title">${esc(label)} is already in this browser</h3>
        <p>The copy in this browser may have newer changes than this file. Nothing has been changed.</p>
        <p>Unlock the browser copy first. Then You will ask for this file again and show you which is newer, so you can keep both.</p>
        <div class="menu"><button data-act="unlock">Unlock the browser copy first</button><button data-act="close">Cancel</button></div>`, {
        unlock: () => resolve(true), close: () => resolve(false),
      }));
      if (staged) await discardStaged(keepsakeStore, staged);
      closeSheet();
      if (!unlockFirst) { backToPrevious(); return false; }
      thenOpenFile(loaded.id);
      return false;
    }
  }

  // The keepsake bytes go in first, so the record never mentions a file that isn't here.
  if (staged) {
    try { await commitStaged(keepsakeStore, staged, loaded.id, loaded); }
    catch { alert('This browser couldn’t store the attached files (its storage may be full). Nothing was opened.'); return give(); }
  }

  if (key) {
    await setSession(loaded, key);
  } else {
    // An unencrypted file from before encryption: lock it with a new passphrase.
    await setSession(loaded, null);
    key = await askNewPassphrase(loaded.name, 'import');
    await setSession(loaded, key);
  }
  hideGate();
  return true;
}

/** Forgotten passphrase on the unlock screen: explains, and offers starting over as a separate, plainly named choice. */
function forgot() {
  const label = esc(listProfiles().find(e => e.id === currentId())?.label || 'this You');
  openSheet(`${sheetTop('Forgotten passphrase')}<h3 class="sh-title">Nobody can recover it</h3>
    <p>There’s no way to recover a lost passphrase. That’s what keeps your data private.</p>
    <p>If it’s saved in a password manager, look for this site there, or check where you wrote it down. You can try again any time.</p>
    <h4>Or start over in this browser</h4>
    <p>This permanently erases <b>${label}</b>’s encrypted copy in this browser. Files you saved elsewhere are not touched, and other Yous here stay.</p>
    <div class="btns"><button type="button" class="btn quiet" data-act="close">Cancel</button><button type="button" class="btn danger" data-act="erase">Erase this browser’s copy of ${label}</button></div>`, {
    erase: async () => {
      closeSheet();
      setTarget('browser');
      await eraseBrowserCopy();
      location.replace(location.pathname);
    },
  });
}

// "Unlock the browser copy first, then compare": remembered for this tab only (no personal data, just a flag).
const THEN_OPEN = 'you.thenOpenFile';
function thenOpenFile(id: string) {
  try { sessionStorage.setItem(THEN_OPEN, id); } catch { /* unavailable: the person can use "Open a file…" */ }
  void canLeave().then(ok => { if (ok) { setCurrent(id); reloadClean(); } });
}

/** After unlocking: if the person was opening a file of this You, ask for it again to compare. */
export function resumeOpenFile() {
  let id: string | null = null;
  try { id = sessionStorage.getItem(THEN_OPEN); sessionStorage.removeItem(THEN_OPEN); } catch { /* unavailable */ }
  if (!id || id !== profile.id) return false;
  openSheet(`${sheetTop('Open a file')}<h3 class="sh-title">Now choose the file again</h3><p>The browser copy is unlocked. Choose the file you were opening; You will show which is newer and keep a copy of the other.</p><div class="menu"><button data-act="pick">Choose the file…</button><button data-act="close">Not now</button></div>`, {
    pick: () => openStoragePicker('open'),
  });
  return true;
}
