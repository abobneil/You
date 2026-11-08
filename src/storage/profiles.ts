import { deleteYouKeepsakes, idbKeepsakeStore } from './keepsakeStore';
import { migrateVault, vaultStore } from './vaultStore';
// Several Yous can live in one browser, each with its own passphrase, data and save location.
// The list keeps only an id and a label (the person's name) so the right one can be picked
// before unlocking. Everything else about each You stays encrypted.
import { KEYS, local } from './local';

export interface ProfileEntry {
  id: string;
  /** Shown on the unlock screen and the switcher. Not encrypted. */
  label: string;
  lastOpened?: string;
}

const INDEX = 'you.index';
const CURRENT = 'you.current';
type PerYou = 'vault' | 'target' | 'targetName' | 'nudged';

/** Storage key for one You's setting, e.g. "you.vault.<id>". */
export const keyFor = (id: string, k: PerYou) => `you.${k}.${id}`;

export function listProfiles(): ProfileEntry[] {
  try {
    const list = JSON.parse(local.get(INDEX) || '[]');
    return Array.isArray(list) ? list.filter(e => e && typeof e.id === 'string') : [];
  } catch { return []; }
}
const saveIndex = (list: ProfileEntry[]) => local.set(INDEX, JSON.stringify(list));

// "Add a new You" lasts only for this tab, so closing it without finishing goes back to the last You.
const NEW = 'you.new';
const session = {
  get: () => { try { return sessionStorage.getItem(NEW) === '1'; } catch { return false; } },
  set: (on: boolean) => { try { on ? sessionStorage.setItem(NEW, '1') : sessionStorage.removeItem(NEW); } catch { /* unavailable */ } },
};
export const wantsNew = () => session.get();
export const startNew = () => session.set(true);

/** The You being used. '' means a brand-new You that hasn't been saved yet. */
export const currentId = () => (wantsNew() ? '' : local.get(CURRENT) ?? '');
export function setCurrent(id: string) { local.set(CURRENT, id); session.set(false); }

/** Adds or updates a You in the list and marks it as just opened. */
export function upsertProfile(id: string, label: string) {
  const list = listProfiles();
  const e = list.find(x => x.id === id);
  if (e) { e.label = label; delete e.lastOpened; } else list.push({ id, label });
  saveIndex(list);
}

/** Removes a You from this browser: its encrypted copy, keepsakes and settings. Saved files are untouched. */
export async function removeProfile(id: string) {
  await vaultStore.del(id);
  await deleteYouKeepsakes(idbKeepsakeStore, id);
  saveIndex(listProfiles().filter(e => e.id !== id));
  for (const k of ['vault', 'target', 'targetName', 'nudged'] as PerYou[]) local.remove(keyFor(id, k));
  if (currentId() === id) setCurrent(listProfiles()[0]?.id ?? '');
}

export const hasVault = async (id: string) => !!await migrateVault(id, local);

/** Most recently opened first. */
export const byRecent = (list = listProfiles()) =>
  [...list].sort((a, b) => (b.lastOpened ?? '').localeCompare(a.lastOpened ?? ''));

// One-time move from the single-You layout (you.vault, you.target…) to per-You keys.
// Runs when this module first loads, before anything reads the old keys.
(function migrate() {
  const old = local.get(KEYS.vault);
  if (!old || listProfiles().length) return;
  const id = crypto.randomUUID();
  local.set(keyFor(id, 'vault'), old);
  for (const [k, legacy] of [['target', KEYS.target], ['targetName', KEYS.targetName], ['nudged', KEYS.nudged]] as const) {
    const v = local.get(legacy);
    if (v !== null) local.set(keyFor(id, k), v);
    local.remove(legacy);
  }
  // The single-You source stays until its per-You copy is verified in IndexedDB.
  if (local.get(keyFor(id, 'vault')) !== old) return;
  saveIndex([{ id, label: '' }]); // the name is filled in after the first unlock
  setCurrent(id);
  local.set('you.migrateHandle', id); // the saved-file handle moves on first use (it's in IndexedDB)
})();

// With no You chosen yet (e.g. the last one was removed), open the most recent.
if (!local.get(CURRENT) && listProfiles().length) local.set(CURRENT, byRecent()[0].id);
