// Getting into your data: first visit, returning visit, upgrading old data, and loading a file.
import { WrongPassphrase } from '../core/crypto';
import { legacyProfile, profile, setSession, storedEnvelope, eraseBrowserCopy } from '../state';
import { decode, readText } from '../storage/fileFormat';
import { setTarget } from '../storage/target';
import { askNewPassphrase, askPassphrase, hideGate } from './gate';
import { openStoragePicker } from './storagePicker';

/** After the name screen: choose a passphrase, then save for the first time. */
export async function lockNewData() {
  const v = await askNewPassphrase(profile.name, 'new');
  await setSession(profile, v);
  hideGate();
}

/**
 * On page load. Resolves 'home' once the person's data is unlocked,
 * or 'landing' if there's nothing here yet (show the name screen).
 */
export async function start(): Promise<'home' | 'landing'> {
  const stored = storedEnvelope();
  if (stored) {
    let env: ReturnType<typeof readText>;
    try { env = readText(stored); } catch { env = { kind: 'plain', profile }; }
    if (env.kind === 'locked') {
      const envelope = env.env;
      await askPassphrase('unlock', async p => {
        try { const r = await decode(p, envelope); await setSession(r.profile, r.vault); return true; }
        catch (e) { if (e instanceof WrongPassphrase) return false; throw e; }
      }, [
        { label: 'Load a different file', run: () => openStoragePicker('open') },
        { label: 'Forgot it?', run: forgot },
      ]);
      hideGate();
      return 'home';
    }
  }
  const legacy = legacyProfile();
  if (legacy) {
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
  if (r.kind === 'locked') {
    const env = r.env;
    const ok = await askPassphrase('file', async p => {
      try { const d = await decode(p, env); await setSession(d.profile, d.vault); return true; }
      catch (e) { if (e instanceof WrongPassphrase) return false; throw e; }
    });
    if (ok) hideGate();
    return ok;
  }
  // An unencrypted file from before encryption: lock it with a new passphrase.
  await setSession(r.profile, null);
  const v = await askNewPassphrase(r.profile.name, 'import');
  await setSession(r.profile, v);
  hideGate();
  return true;
}

function forgot() {
  const sure = confirm(
    'There’s no way to recover a lost passphrase. That’s what keeps your data private.\n\n' +
    'If it’s saved in a password manager, look for this site there.\n\n' +
    'Otherwise you can start over on this browser. That permanently erases the copy kept here. ' +
    'Files you saved elsewhere are not touched.\n\nStart over?');
  if (!sure) return;
  setTarget('browser');
  eraseBrowserCopy();
  location.reload();
}
