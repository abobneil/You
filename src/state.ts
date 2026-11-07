// The person's data in memory, the unlocked key, and "something changed" notifications.
// Nothing is written anywhere until there is a key: the browser copy is encrypted too.
import type { Vault } from './core/crypto';
import { emptyProfile, normalize } from './core/profile';
import type { Profile } from './core/types';
import { encode } from './storage/fileFormat';
import { KEYS, local } from './storage/local';

export let profile: Profile = emptyProfile();
export let vault: Vault | null = null;

const listeners: (() => void)[] = [];
/** Runs after every save: flashes "Saved", writes the chosen file, redraws. */
export const onSave = (fn: () => void) => { listeners.push(fn); };

let chain: Promise<void> = Promise.resolve();
/** Encrypts and stores the browser copy. Writes run in order so an older copy never wins. */
export function persist(): Promise<void> {
  chain = chain.then(async () => {
    if (!vault) return;
    local.set(KEYS.vault, await encode(vault, profile));
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
  profile.updatedAt = profile.updatedAt || new Date().toISOString();
  if (v) vault = v;
  return persist();
}

/** The encrypted browser copy, if there is one. */
export const storedEnvelope = () => local.get(KEYS.vault);

/** Data saved by earlier, unencrypted versions of You, waiting to be protected. */
export function legacyProfile(): Profile | null {
  try {
    const p = normalize(JSON.parse(local.get(KEYS.profile) || 'null'));
    return p.name ? p : null;
  } catch { return null; }
}

/** "Start over": removes everything You keeps in this browser. Saved files elsewhere are untouched. */
export function eraseBrowserCopy() {
  for (const k of Object.values(KEYS)) if (k !== KEYS.theme) local.remove(k);
}
