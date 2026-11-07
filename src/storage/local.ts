// Browser storage. Every read and write is guarded: private windows and blocked storage throw.
export const local = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  },
};

/**
 * Settings shared by every You in this browser. Per-You settings (the encrypted copy, where it's
 * saved, whether we've suggested saving) use keyFor() in profiles.ts.
 */
export const KEYS = {
  theme: 'you.theme',
  /** Unencrypted data from before encryption; upgraded and removed on first unlock. */
  profile: 'you.profile',
  /** Single-You keys from before Yous could be switched; moved by profiles.ts. */
  vault: 'you.vault',
  target: 'you.target',
  targetName: 'you.targetName',
  nudged: 'you.nudged',
} as const;
