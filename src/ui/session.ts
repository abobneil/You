import { closeSheet, focusFallbackSoon, offerUndo, openSheet, sheetTop } from './sheet';
import { esc } from './dom';
import { commitFile, stageFile } from '../storage/stageFile';
// Getting into your data: first visit, returning visit, upgrading old data, and loading a file.
import { newId } from '../core/cards';
import { toB64, WrongPassphrase, type Vault } from '../core/crypto';
import type { Profile } from '../core/types';
import { canLeave, eraseBrowserCopy, flushPending, legacyProfile, lastOpened, lastReplaced, openInPlace, profile, restoreArchived, setSession, storedEnvelope } from '../state';
import { decode, readFile, readText, UnsupportedVersion, DamagedFile } from '../storage/fileFormat';
import { keepsakeStore } from '../storage/keepsakeAccess';
import { clearAbandonedStaging, commitStaged, describeProblems, discardStaged, stageKeepsakes, type Staged } from '../storage/keepsakeImport';
import { byRecent, currentId, hasVault, listProfiles, placeLabel, setCurrent, startNew } from '../storage/profiles';
import { canWriteFiles, keepVerifiedCopy, setTarget, type FileHandle } from '../storage/target';
import { askNewPassphrase, askPassphrase, backToPrevious, hideGate, type WhoRow } from './gate';
import { openStoragePicker } from './storagePicker';
import { addNewYou, openEarlier, switchTo, reloadClean } from './switcher';
import { listArchived } from '../storage/archive';

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
async function damagedBrowserCopy(slot: string, stored: string) {
  startNew();
  const label = listProfiles().find(e => e.id === slot)?.label || 'This You';
  // Earlier versions of it may still be good: offer them here, since the menu only lists them once unlocked.
  const earlier = (await listArchived(slot).catch(() => [])).length;
  openSheet(`${sheetTop('Couldn’t open')}<h3 class="sh-title">${esc(label)}’s copy in this browser can’t be read</h3>
    <p>It may be damaged. It has been kept exactly as it is, and nothing will be saved over it.</p>
    <p class="hint">If you have a saved file, open that instead. You can also save this copy as a file to keep it, or start a new You.</p>
    <div class="menu">${earlier ? `<button data-act="earlier">Earlier versions (${earlier})</button>` : ''}<button data-act="open">Open a saved file</button><button data-act="keep">Save this copy as a file</button><button data-act="close">Start a new You</button></div>`, {
    earlier: () => { void openEarlier(slot); },
    open: () => { closeSheet(); openStoragePicker('open'); },
    keep: () => { void keepUnreadable(slot, stored, `${label} (copy that couldn't be read).you.json`); },
  });
}

/** Hands the person a file with exactly these bytes. */
/**
 * Saves a blob as a file and answers true only once it surely exists: written and read back through the
 * save picker in Chrome and Edge, or a download the person confirms has finished elsewhere.
 */
async function saveBlob(blob: Blob, name: string): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileHandle> }).showSaveFilePicker;
  if (canWriteFiles && picker) {
    let h: FileHandle;
    try { h = await picker({ suggestedName: name }); } catch { return false; }
    const out = await h.createWritable();
    await (out as unknown as { write(b: Blob): Promise<void> }).write(blob);
    await out.close();
    if ((await h.getFile()).size !== blob.size) throw new Error('The copy wasn’t written completely.');
    return true;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return new Promise<boolean>(resolve => openSheet(`${sheetTop('Check your copy')}<h3 class="sh-title">Did the copy finish downloading?</h3>
    <p>Look in your Downloads for <b>${esc(name)}</b>. Continue only once it’s there; until then, nothing here is replaced.</p>
    <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel, change nothing</button><button class="btn primary" type="button" data-act="yes">It’s there, continue</button></div>`, {
    yes: () => { closeSheet(); resolve(true); },
    close: () => resolve(false),
  }));
}

/**
 * Saves an unreadable browser copy as a file before it's replaced: the record exactly as stored, plus every
 * photo and file this browser holds for that You, still encrypted (they open with the same passphrase if
 * the record is ever repaired). Returns false, so nothing is replaced, if the copy couldn't be made.
 */
async function keepUnreadable(id: string, record: string, name: string): Promise<boolean> {
  try {
    // Built from parts, one photo at a time, so a lifetime of photos never has to fit in one string.
    // Each keepsake line has the same shape as a version 3 file's, so a helper can read them the same way.
    const parts: BlobPart[] = [`{"app":"you","unreadableBrowserCopy":true,"record":${JSON.stringify(record)},\n"keepsakes":[\n`];
    let first = true;
    for (const key of await keepsakeStore.keys(id + '/')) {
      if (key.includes('~')) continue; // copies set aside by an open; the record names its photos plainly
      const sealed = await keepsakeStore.get(key);
      if (!sealed) continue;
      parts.push(`${first ? '' : ',\n'}{"id":${JSON.stringify(key.slice(id.length + 1))},"iv":"${toB64(sealed.iv)}","data":"${toB64(sealed.data)}"}`);
      first = false;
    }
    parts.push('\n]}');
    return await saveBlob(new Blob(parts, { type: 'application/json' }), name);
  } catch {
    openSheet(`${sheetTop('Couldn’t save')}<h3 class="sh-title">The unreadable copy couldn’t be saved</h3><p data-announce>Nothing was replaced and nothing here changed. Try again; if it keeps happening, this device may be short of space.</p><div class="btns"><button class="btn primary" type="button" data-act="close">OK</button></div>`);
    return false;
  }
}

/** True when this browser holds a copy of that You that can't be read (damaged, or changed outside You). */
async function unreadableHere(id: string): Promise<boolean> {
  const stored = await storedEnvelope(id);
  if (!stored) return false;
  try { return readText(stored).kind !== 'locked'; } catch { return true; }
}

/**
 * On page load. Resolves 'home' once the open You is unlocked,
 * or 'landing' if there's nothing to unlock (show the name screen).
 */
export async function start(): Promise<'home' | 'landing'> {
  // Photo copies left by a file open that never finished (the tab was closed) are cleared quietly.
  void clearAbandonedStaging(keepsakeStore).catch(() => { /* tried again next time */ });
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
  // Only call the file wrong when it really is; a browser problem while checking it is said as such.
  const notYou = e instanceof SyntaxError || (e instanceof Error && /not you data|not a you file/i.test(e.message));
  const why = e instanceof UnsupportedVersion || e instanceof DamagedFile ? e.message
    : notYou ? 'That file doesn’t look like your You data.'
    : 'This browser had a problem while checking the file. Nothing was changed; try opening it again.';
  openSheet(`${sheetTop('Couldn’t open')}<h3 class="sh-title">This file couldn’t be opened</h3>
    <p>${esc(why)}</p>
    <p class="hint">${/nothing was changed/i.test(why) ? '' : 'Nothing was changed. '}If you have another saved copy, you can try that one.</p>
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
  // Backing out of an open: clear what was staged, return to the previous screen and put focus somewhere sensible.
  const give = async () => { if (staged) await discardStaged(keepsakeStore, staged); backToPrevious(); focusFallbackSoon(); return false; };
  if (r.kind === 'locked' && key) {
    const controller = new AbortController();
    openSheet(`${sheetTop('Checking your photos and files…')}<p role="status" id="file-check-progress">Checking your photos and files…</p><button class="btn" data-act="cancel">Cancel</button>`, {
      cancel: () => { controller.abort(); closeSheet(); },
    }, { onDismiss: () => controller.abort() });
    const options = { signal: controller.signal, onProgress: (checked: number, total: number) => {
      const status = document.getElementById('file-check-progress');
      if (status) status.textContent = `Checking your photos and files… ${checked} of ${total}`;
    } };
    try {
      staged = source instanceof Blob
        ? await stageFile(source, key, loaded, options)
        : await stageKeepsakes(keepsakeStore, key, loaded, r.keepsakes(), options);
      controller.signal.throwIfAborted();
    } catch (e) {
      closeSheet();
      if (!controller.signal.aborted) cannotOpen(e);
      if (staged) await discardStaged(keepsakeStore, staged);
      backToPrevious(); return false;
    }
    closeSheet();
    const n = staged.problems.length;
    if (n) {
      const problems = staged.problems;
      const openRest = await new Promise<boolean>(resolve => openSheet(`${sheetTop('Some attached files couldn’t be read')}<h3 class="sh-title">${n === 1 ? 'One attached file' : `${n} attached files`} in this record couldn’t be read</h3>
        <p class="note-text">${esc(describeProblems(problems))}</p>
        <p>You can open the rest. Those files will show as unreadable, and the file itself isn’t changed.</p>
        <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel, change nothing</button><button class="btn primary" type="button" data-act="rest">Open the rest</button></div>`, {
        rest: () => { closeSheet(); resolve(true); },
        close: () => { closeSheet(); resolve(false); },
      }));
      if (!openRest) return give();
    }
  }

  if (!await canLeave()) return give();
  await flushPending(); // what's stored now is everything typed here, so it's exactly what may be replaced

  // Files from before Yous had ids become a new You, never a silent overwrite of the open one.
  // A You's id names its storage rows, so it must be plain and must never look like a staging prefix.
  if (!loaded.id || !/^[A-Za-z0-9_-]{1,64}$/.test(loaded.id) || loaded.id.startsWith('import-')) loaded.id = newId();

  // What this browser holds for that You right now. It's replaced only if it's still exactly this when the
  // file is written (another tab may save meanwhile); null means nothing is stored and nothing may appear.
  let expected: string | null = await storedEnvelope(loaded.id);

  // The same You may already be on this browser, possibly with newer changes.
  if (await hasVault(loaded.id)) {
    if (loaded.id === profile.id) {
      const older = (loaded.updatedAt || '') < (profile.updatedAt || '') || (loaded.rev || 0) < (profile.rev || 0);
      const when = (iso?: string) => { const d = iso ? new Date(iso) : null; return d && !isNaN(+d) ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'an unknown date'; };
      const proceed = await new Promise<boolean>(resolve => openSheet(`${sheetTop(older ? "This file is older than what's in this browser" : 'Open this version?')}<p>The file was saved ${esc(when(loaded.updatedAt))}. This browser’s version was saved ${esc(when(profile.updatedAt))}.</p><p>If you open the file, this browser’s version is kept in Menu → Earlier versions, so you can go back to it.</p><div class="menu"><button data-act="keep">Keep the browser version</button><button data-act="anyway">Open the file</button><button data-act="first">Also save the browser version as a file, then open</button></div>`, {
        keep: () => { closeSheet(); resolve(false); }, close: () => resolve(false),
        // Opening always keeps the browser version as an earlier version first (openInPlace), so a separate copy
        // is extra, never required. When asked for, the file is opened only once that copy has really been made.
        first: async () => { const ok = await keepVerifiedCopy(); if (!ok) closeSheet(); resolve(ok); },
        anyway: () => resolve(true),
      }));
      if (!proceed) return give();
      // `expected` stays what was stored when the person chose (this tab had nothing unsaved then), so a save
      // from another tab while the copy was being made means nothing here is replaced.
    } else if (await unreadableHere(loaded.id)) {
      // The browser copy of this You can't be read, so it can't be unlocked and compared. Offer to keep it
      // as a file, with its encrypted photos, then open this one in its place. Nothing is replaced without that choice.
      const label = listProfiles().find(e => e.id === loaded.id)?.label || loaded.name || 'this You';
      const damaged = expected!;
      const replace = await new Promise<boolean>(resolve => openSheet(`${sheetTop('Already in this browser')}<h3 class="sh-title">${esc(label)}’s copy in this browser can’t be read</h3>
        <p>You can open this file in its place. The unreadable copy, with its encrypted photos and files, is saved as a file first, so nothing is lost.</p>
        <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" data-act="open">Save the unreadable copy, then open this file</button></div>`, {
        open: () => { closeSheet(); resolve(true); }, close: () => resolve(false),
      }));
      if (!replace) return give();
      if (!await keepUnreadable(loaded.id, damaged, `${label} (copy that couldn't be read).you.json`)) return give();
    } else {
      // This browser already has this You, locked. Unlock that copy first so the two can be compared.
      const label = listProfiles().find(e => e.id === loaded.id)?.label || loaded.name || 'this You';
      const choice = await new Promise<'unlock' | 'cant' | null>(resolve => openSheet(`${sheetTop('Already in this browser')}<h3 class="sh-title">${esc(label)} is already in this browser</h3>
        <p>The copy in this browser may have newer changes than this file. Nothing has been changed.</p>
        <p>Unlock the browser copy first. Then You will ask for this file again and show you which is newer, so you can keep both.</p>
        <div class="menu"><button data-act="unlock">Unlock the browser copy first</button><button data-act="cant">I can’t unlock the browser copy: save it as a file, then open this one</button><button data-act="close">Cancel</button></div>`, {
        unlock: () => resolve('unlock'), cant: () => { closeSheet(); resolve('cant'); }, close: () => resolve(null),
      }));
      if (choice === 'cant') {
        // A browser copy that won't unlock (damaged inside, or its passphrase is lost) is kept whole, with its
        // encrypted photos, before this file takes its place. A cancelled or unfinished copy changes nothing.
        if (!await keepUnreadable(loaded.id, expected!, `${label} (browser copy that couldn't be unlocked).you.json`)) return give();
      } else {
        if (staged) await discardStaged(keepsakeStore, staged);
        closeSheet();
        if (!choice) { backToPrevious(); focusFallbackSoon(); return false; }
        thenOpenFile(loaded.id);
        return false;
      }
    }
  }

  // An unencrypted file from before encryption is locked with a new passphrase first.
  if (!key) key = await askNewPassphrase(loaded.name, 'import');

  // The photo bytes go in first, so the record never mentions a file that isn't here. Both happen under
  // the same lock saves use, and only if the stored copy is still `expected`.
  const controller = new AbortController();
  const busyActs: Record<string, () => void> = { cancel: () => { controller.abort(); closeSheet(); } };
  openSheet(`${sheetTop('Opening your record…')}<p role="status">${staged ? 'Your photos and files have been checked. ' : ''}Opening your record…</p><button class="btn" data-act="cancel">Cancel</button>`, busyActs, { onDismiss: () => controller.abort() });
  let opened: boolean;
  try {
    opened = await openInPlace(loaded, key, expected, async () => {
      if (!staged) return;
      if (source instanceof Blob) await commitFile(staged, loaded, controller.signal);
      else await commitStaged(keepsakeStore, staged, loaded.id!, loaded, controller.signal);
    }, controller.signal, `before opening ${source instanceof File ? source.name : 'a file'}`, () => {
      // The record is about to be written: take Cancel away rather than offer one that can't work.
      const status = document.querySelector<HTMLElement>('#sheet-body [role=status]');
      if (status) status.textContent = 'Opening your record… almost done.';
      const cancel = document.querySelector<HTMLElement>('#sheet-body [data-act=cancel]');
      const close = document.querySelector<HTMLElement>('#sheet-body .sh-close');
      if (document.activeElement && (document.activeElement === cancel || document.activeElement === close)) {
        const heading = document.querySelector<HTMLElement>('#sheet-body [tabindex="-1"]') ?? status;
        if (heading) { if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1; heading.focus(); }
      }
      cancel?.remove();
      // Nor a close button or Escape that would look like stopping it.
      close?.remove();
      busyActs.escape = () => {};
    });
    closeSheet();
  } catch {
    closeSheet();
    if (controller.signal.aborted) return give();
    openSheet(`${sheetTop('Couldn’t open')}<h3 class="sh-title">This browser couldn’t store the attached files</h3><p data-announce>Its storage may be full. Nothing was opened and nothing here changed.</p><div class="btns"><button class="btn primary" type="button" data-act="close">OK</button></div>`);
    return give();
  }
  if (!opened) {
    openSheet(`${sheetTop('Not opened')}<h3 class="sh-title">This You changed in another tab</h3><p data-announce>Another tab saved changes while this file was opening, so nothing was replaced. Open the file again to compare it with the newest version.</p><div class="btns"><button class="btn primary" type="button" data-act="close">OK</button></div>`);
    return give();
  }
  hideGate();
  if (expected !== null) {
    // Whatever was here was kept as an earlier version just before the file replaced it. Say so, quietly,
    // with a one-step way back.
    const id = loaded.id!;
    const kept = lastReplaced, wrote = lastOpened ?? undefined;
    offerUndo(`Opened ${source instanceof File ? source.name : 'the file'}. What was here is kept in Menu → Earlier versions.`, async () => {
      // Same care as the menu's restore: unsaved work here is saved or downloaded first.
      if (!kept || !await canLeave()) return;
      let done: boolean | 'changed' = false;
      try { done = await restoreArchived(id, kept, wrote); } catch { /* said below */ }
      // The file that was opened holds what was undone, so stop saving into it; the person chooses again.
      if (done === true) { setTarget('browser'); return reloadClean(); }
      // Something was saved since the open, or the version is no longer there: say so, never just do nothing.
      openSheet(`${sheetTop('Undo')}<h3 class="sh-title">${done === 'changed' ? 'Changes were saved since the file was opened' : 'That version couldn’t be put back'}</h3><p data-announce>${done === 'changed' ? 'So nothing was undone, and those changes stay. ' : 'Nothing was changed. '}Earlier versions in the menu lists what this You looked like before; you can restore any of them.</p><div class="btns"><button class="btn quiet" type="button" data-act="close">Close</button><button class="btn primary" type="button" data-act="earlier">Earlier versions</button></div>`, {
        earlier: () => { void openEarlier(id); },
      });
    });
  }
  return true;
}

/** Forgotten passphrase on the unlock screen: explains, and offers starting over as a separate, plainly named choice. */
function forgot() {
  const label = esc(listProfiles().find(e => e.id === currentId())?.label || 'this You');
  openSheet(`${sheetTop('Forgotten passphrase')}<h3 class="sh-title">Nobody can recover it</h3>
    <p>There’s no way to recover a lost passphrase. That’s what keeps your data private.</p>
    <p>If it’s saved in a password manager, look for this site there, or check where you wrote it down. You can try again any time.</p>
    <h4>Or start over in this browser</h4>
    <p>This permanently erases <b>${label}</b>’s encrypted copy in this browser, with its earlier versions. Files you saved elsewhere are not touched, and other Yous here stay.</p>
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
