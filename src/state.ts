// The open You's data in memory, the unlocked key, and "something changed" notifications.
// Nothing is written anywhere until there is a key: the browser copy is encrypted too.
import { newId } from './core/cards';
import type { Vault } from './core/crypto';
import { emptyProfile, normalize } from './core/profile';
import type { Profile } from './core/types';
import { encode } from './storage/fileFormat';
import { KEYS, local } from './storage/local';
import { currentId, keyFor, removeProfile, setCurrent, upsertProfile } from './storage/profiles';

export let profile: Profile = emptyProfile();
export let vault: Vault | null = null;

const listeners: (() => void)[] = [];
/** Runs after every save: flashes "Saved", writes the chosen file, redraws. */
export const onSave = (fn: () => void) => { listeners.push(fn); };

let chain: Promise<void> = Promise.resolve();
/** Encrypts and stores the browser copy. Writes run in order so an older copy never wins. */
export function persist(): Promise<void> {
  chain = chain.then(async () => {
    if (!vault || !profile.id) return;
    local.set(keyFor(profile.id, 'vault'), await encode(vault, profile));
    upsertProfile(profile.id, profile.name);
    setCurrent(profile.id);
    local.remove(KEYS.profile); // never leave an unencrypted copy behind
  }).catch(() => {});
  return chain;
}

export function save() {
  profile.updatedAt = new Date().toISOString();
  persist();
  listeners.forEach(fn => fn());
}

/** Starts a session: the data and the key that protects it. */
export function setSession(p: Profile, v: Vault | null) {
  profile = p;
  profile.id = profile.id || currentId() || newId();
  profile.updatedAt = profile.updatedAt || new Date().toISOString();
  if (v) vault = v;
  return persist();
}

/** The open You's encrypted browser copy, if there is one. */
export const storedEnvelope = () => { const id = currentId(); return id ? local.get(keyFor(id, 'vault')) : null; };

/** Data saved by earlier, unencrypted versions of You, waiting to be protected. */
export function legacyProfile(): Profile | null {
  try {
    const p = normalize(JSON.parse(local.get(KEYS.profile) || 'null'));
    return p.name ? p : null;
  } catch { return null; }
}

/** "Start over" / "Remove from this browser": erases this You's browser copy. Saved files are untouched. */
export function eraseBrowserCopy(id = currentId()) {
  if (id) removeProfile(id);
}
