// Two offline copies of the same You (say, one from the laptop and one from the phone): open each in
// memory with its own passphrase, compare them, then keep both as separate files or combine them.
// Nothing here writes anywhere; the screen in src/ui/comparePair.ts decides what happens next.
import { compare } from '../core/compare';
import { WrongPassphrase, type Vault } from '../core/crypto';
import type { Profile } from '../core/types';
import { decode, readText, UnsupportedVersion, DamagedFile, FILE_EXT, fileNameFor, type ReadResult } from './fileFormat';

/** One copy, opened in memory only. `text` is the file exactly as chosen, so "Keep both" can save it untouched. */
export interface OpenedCopy {
  fileName: string;
  text: string;
  profile: Profile;
  /** The copy's own key, for its keepsakes. Absent for an old unencrypted file. */
  vault?: Vault;
  read: ReadResult;
}

/** Opens a chosen file with its passphrase. Returns a plain message instead of throwing. */
export async function openCopy(fileName: string, text: string, passphrase: string): Promise<OpenedCopy | { error: string }> {
  let read: ReadResult;
  try { read = readText(text); }
  catch (e) {
    if (e instanceof UnsupportedVersion || e instanceof DamagedFile) return { error: `${fileName}: ${e.message}` };
    return { error: `${fileName} doesn’t look like a You file. Choose a .you.json file.` };
  }
  if (read.kind === 'plain') return { fileName, text, profile: read.profile, read };
  try {
    const { profile, vault } = await decode(passphrase, read.env);
    return { fileName, text, profile, vault, read };
  } catch (e) {
    return { error: e instanceof WrongPassphrase ? `That passphrase didn’t open ${fileName}. Each copy needs the passphrase it was saved with.` : `${fileName} could not be opened. Nothing was changed.` };
  }
}

/** Why two copies can't be compared, in plain words, or null when they can. */
export function pairProblem(a: Profile, b: Profile): string | null {
  if (!a.id || !b.id || a.id !== b.id) return 'These are two different Yous, not two copies of the same one. Nothing was changed.';
  return null;
}

/** Plain-words summary of what differs, with "first" and "second" named by the caller. */
export function pairSummary(a: Profile, b: Profile, first: string, second: string) {
  const d = compare(a, b);
  const same = !d.onlyA.length && !d.onlyB.length && !d.changed.length && !d.other.length;
  const n = (k: number) => `${k} ${k === 1 ? 'card' : 'cards'}`;
  return {
    ...d,
    same,
    text: same ? 'These copies hold the same cards.' : `${n(d.onlyA.length)} only in ${first} · ${n(d.onlyB.length)} only in ${second} · ${n(d.changed.length)} changed in both${d.other.length ? ` · ${d.other.length} other ${d.other.length === 1 ? 'difference' : 'differences'} (name or kinds)` : ''}`,
  };
}

const day = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '');

/**
 * Names for "Keep both as separate files": each says which copy it is and when it was last saved, and
 * the two are never the same. "alex-kim (newer copy, saved 2026-11-03).you.json".
 */
export function keepBothNames(a: Profile, b: Profile): [string, string] {
  const base = (p: Profile) => fileNameFor(p.name).slice(0, -FILE_EXT.length);
  const ta = a.updatedAt || '', tb = b.updatedAt || '';
  const label = (p: Profile, which: string) => `${base(p)} (${which}${day(p.updatedAt) ? `, saved ${day(p.updatedAt)}` : ''})${FILE_EXT}`;
  if (ta === tb) return [label(a, 'copy 1'), label(b, 'copy 2')];
  return ta > tb ? [label(a, 'newer copy'), label(b, 'older copy')] : [label(a, 'older copy'), label(b, 'newer copy')];
}
