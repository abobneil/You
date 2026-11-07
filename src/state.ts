// The one copy of the person's data in memory, plus "something changed" notifications.
import { normalize } from './core/profile';
import type { Profile } from './core/types';
import { KEYS, local } from './storage/local';

function loadLocal(): Profile {
  try { return normalize(JSON.parse(local.get(KEYS.profile) || 'null')); } catch { return normalize(null); }
}

export let profile: Profile = loadLocal();

const listeners: (() => void)[] = [];
/** Runs after every save: flashes "Saved", writes the chosen file, etc. */
export const onSave = (fn: () => void) => { listeners.push(fn); };

/** Saves to browser storage (always, as a working copy) and tells listeners. */
export function save() {
  profile.updatedAt = new Date().toISOString();
  local.set(KEYS.profile, JSON.stringify(profile));
  listeners.forEach(fn => fn());
}

/** Replaces everything, e.g. after loading a file. Does not notify listeners. */
export function replaceProfile(p: Profile) {
  profile = p;
  profile.updatedAt = profile.updatedAt || new Date().toISOString();
  local.set(KEYS.profile, JSON.stringify(profile));
}
