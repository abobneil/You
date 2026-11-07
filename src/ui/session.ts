// Getting into your data: first visit, returning visit, upgrading old data, and loading a file.
import { newId } from '../core/cards';
import { WrongPassphrase, type Vault } from '../core/crypto';
import type { Profile } from '../core/types';
import { eraseBrowserCopy, legacyProfile, profile, setSession, storedEnvelope } from '../state';
import { decode, readText } from '../storage/fileFormat';
import { byRecent, currentId, hasVault, listProfiles } from '../storage/profiles';
import { setTarget } from '../storage/target';
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
    items: byRecent().map(e => ({ id: e.id, label: e.label, current: e.id === cur })),
    pick: id => { if (id !== cur) switchTo(id); },
    add: addNewYou,
  };
}

/**
 * On page load. Resolves 'home' once the open You is unlocked,
 * or 'landing' if there's nothing to unlock (show the name screen).
 */
export async function start(): Promise<'home' | 'landing'> {
  const stored = storedEnvelope();
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

/** Loads a file's contents, asking for its passphrase (or a new one) as needed. False if cancelled or invalid. */
export async function importText(text: string): Promise<boolean> {
  let r: ReturnType<typeof readText>;
  try { r = readText(text); } catch { alert('That file doesn’t look like your You data.'); return false; }

  let loaded: Profile;
  let key: Vault | null = null;
  if (r.kind === 'locked') {
    const env = r.env;
    let got: { profile: Profile; vault: Vault } | null = null;
    const ok = await askPassphrase('file', async p => {
      try { got = await decode(p, env); return true; }
      catch (e) { if (e instanceof WrongPassphrase) return false; throw e; }
    });
    if (!ok || !got) return false;
    ({ profile: loaded, vault: key } = got as { profile: Profile; vault: Vault });
  } else {
    loaded = r.profile;
  }

  // Files from before Yous had ids become a new You, never a silent overwrite of the open one.
  loaded.id = loaded.id || newId();

  // The same You may already be on this browser, possibly with newer changes.
  if (hasVault(loaded.id)) {
    const label = listProfiles().find(e => e.id === loaded.id)?.label || loaded.name;
    if (!confirm(`${label} is already on this browser.\n\nReplace the copy here with this file? Choose Cancel to keep the copy here.`)) {
      hideGate();
      return false;
    }
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

function forgot() {
  const sure = confirm(
    'There’s no way to recover a lost passphrase. That’s what keeps your data private.\n\n' +
    'If it’s saved in a password manager, look for this site there.\n\n' +
    'Otherwise you can start over on this browser. That permanently erases this You’s copy here. ' +
    'Files you saved elsewhere are not touched.\n\nStart over?');
  if (!sure) return;
  setTarget('browser');
  eraseBrowserCopy();
  location.replace(location.pathname);
}
