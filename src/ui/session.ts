import { openSheet, sheetTop } from './sheet';
import { esc } from './dom';
// Getting into your data: first visit, returning visit, upgrading old data, and loading a file.
import { newId } from '../core/cards';
import { WrongPassphrase, type Vault } from '../core/crypto';
import type { Profile } from '../core/types';
import { canLeave, eraseBrowserCopy, legacyProfile, profile, setSession, storedEnvelope } from '../state';
import { decode, readFile, readText, UnsupportedVersion, DamagedFile } from '../storage/fileFormat';
import { keepsakeStore } from '../storage/keepsakeAccess';
import { commitStaged, describeProblems, discardStaged, stageKeepsakes, type Staged } from '../storage/keepsakeImport';
import { byRecent, currentId, hasVault, listProfiles, placeLabel } from '../storage/profiles';
import { downloadCopy, setTarget } from '../storage/target';
import { askNewPassphrase, askPassphrase, hideGate, type WhoRow } from './gate';
import { openStoragePicker } from './storagePicker';
import { addNewYou, switchTo } from './switcher';

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

/**
 * On page load. Resolves 'home' once the open You is unlocked,
 * or 'landing' if there's nothing to unlock (show the name screen).
 */
export async function start(): Promise<'home' | 'landing'> {
  const stored = await storedEnvelope();
  if (stored) {
    let r: ReturnType<typeof readText> | null = null;
    try { r = readText(stored); } catch { /* unreadable: fall through */ }
    if (r?.kind === 'locked') {
      const env = r.env;
      const label = listProfiles().find(e => e.id === currentId())?.label ?? '';
      await askPassphrase('unlock', async p => {
        try {
          const d = await decode(p, env);
          // The browser slot decides which You this is, so its save location and settings stay attached.
          d.profile.id = currentId() || d.profile.id;
          await setSession(d.profile, d.vault);
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

const cannotOpen = (e: unknown) => alert(e instanceof UnsupportedVersion || e instanceof DamagedFile ? e.message : 'That file doesn’t look like your You data.');

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
  const give = async () => { if (staged) await discardStaged(keepsakeStore, staged); hideGate(); return false; };
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
    } else { alert('Open this You from the switcher first, then open the file so its browser version can be kept safely.'); return give(); }
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

async function forgot() {
  const sure = confirm(
    'There’s no way to recover a lost passphrase. That’s what keeps your data private.\n\n' +
    'If it’s saved in a password manager, look for this site there.\n\n' +
    'Otherwise you can start over on this browser. That permanently erases this You’s copy here. ' +
    'Files you saved elsewhere are not touched.\n\nStart over?');
  if (!sure) return;
  setTarget('browser');
  await eraseBrowserCopy();
  location.replace(location.pathname);
}
