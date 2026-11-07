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

export const KEYS = {
  /** The encrypted browser copy. */
  vault: 'you.vault',
  /** Unencrypted data from before encryption; upgraded and removed on first unlock. */
  profile: 'you.profile',
  theme: 'you.theme',
  target: 'you.target',
  targetName: 'you.targetName',
  nudged: 'you.nudged',
} as const;
