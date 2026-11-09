// Keeps one tab from overwriting newer work saved by another tab.
// The baseline is the exact encrypted copy this tab decrypted (or last wrote). A write only goes
// ahead if the stored copy is still that baseline; the check and the write run under one lock.
import type { VaultStore } from './vaultStore';

export type WriteResult =
  /** Written; the new copy is now the baseline. */
  | 'written'
  /** Another tab saved newer work and this tab has no edits of its own: nothing was written. Load the newer copy. */
  | 'newer'
  /** Another tab saved newer work and this tab has edits too: nothing was written. Ask the person. */
  | 'conflict';

type Lock = <T>(name: string, fn: () => Promise<T>) => Promise<T>;
const noLock: Lock = (_name, fn) => fn();

export function staleGuard(store: Pick<VaultStore, 'get' | 'set'>, lock: Lock = noLock) {
  /** undefined: no session yet (nothing to compare against). null: there was no stored copy. */
  let baseline: string | null | undefined;
  let stale = false;
  return {
    /** Starts a session from the envelope that was actually decrypted (null for a brand-new You). */
    begin(envelope: string | null | undefined) { baseline = envelope; stale = false; },
    /** Another tab announced a save; the next write will be checked against storage anyway. */
    markStale() { stale = true; },
    isStale: () => stale,
    baseline: () => baseline,
    /**
     * Called after the person chose to keep this tab's version and a copy of the other one was
     * downloaded. Compare-and-swap under the lock: that downloaded copy becomes the baseline only if
     * it's still exactly what's stored. Returns false (changing nothing) if another save landed since.
     */
    adoptStored(id: string, expected: string | null): Promise<boolean> {
      return lock('you-' + id, async () => {
        if (await store.get(id) !== expected) return false;
        baseline = expected; stale = false;
        return true;
      });
    },
    /**
     * Writes `envelope` unless storage changed since the baseline. `edited` says whether this tab
     * holds changes that aren't in the baseline; without them, a newer stored copy simply wins.
     */
    write(id: string, envelope: string, edited: boolean): Promise<WriteResult> {
      return lock('you-' + id, async () => {
        const current = await store.get(id);
        const changed = baseline !== undefined && current !== baseline;
        if (changed || stale) {
          if (changed && !edited) return 'newer';
          if (!changed && stale) { stale = false; }
          else { stale = true; return 'conflict'; }
        }
        await store.set(id, envelope);
        baseline = envelope;
        return 'written';
      });
    },
  };
}
