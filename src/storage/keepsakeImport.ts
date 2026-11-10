// Opening a version 3 file: every keepsake is decrypted and checked against the record's own SHA-256
// before anything in this browser changes. Checked bytes wait under a temporary prefix; only after the
// person confirms are they moved under the opening You's id. Problems are reported, never silently dropped.
import { draftKeepsakes } from '../core/cards';
import type { Vault } from '../core/crypto';
import { openBytes, sealBytes, sha256Hex, type Keepsake, type SealedBytes } from '../core/keepsakes';
import type { Profile } from '../core/types';
import { checkRawKeepsake, DamagedFile, type RawKeepsake } from './fileFormat';
import { rowKey, setAsideKey, type KeepsakeStore } from './keepsakeStore';

export interface KeepsakeProblem { id: string; name: string; problem: 'damaged' | 'changed' | 'missing' }

export interface Staged {
  prefix: string;
  ids: string[];
  problems: KeepsakeProblem[];
}

const metaById = (p: Profile) => {
  const m = new Map<string, Keepsake>();
  for (const c of p.cards) for (const k of c.keepsakes ?? []) m.set(k.id, k);
  for (const k of draftKeepsakes(p)) if (!m.has(k.id)) m.set(k.id, k); // a kept unfinished card's photos
  return m;
};

/**
 * Checks each keepsake entry and writes the good ones under a temporary prefix.
 * Throws DamagedFile (after cleaning up) if the file's structure is wrong: a malformed entry, a bad IV,
 * an id no card mentions, or the same id twice. Content problems are returned for the person to review.
 */
export interface StagingOptions {
  prefix?: string;
  signal?: AbortSignal;
  onProgress?: (checked: number, total: number) => void;
  /**
   * The key the staged bytes must open with. When combining a copy saved with a different passphrase,
   * each checked keepsake is encrypted again with this key, so it stays readable in the open You.
   */
  rekeyTo?: Vault;
}

export async function stageKeepsakes(store: KeepsakeStore, vault: Vault, p: Profile, entries: AsyncIterable<RawKeepsake>, options: StagingOptions = {}): Promise<Staged> {
  const staged: Staged = { prefix: options.prefix ?? `import-${Date.now()}-${crypto.randomUUID()}`, ids: [], problems: [] };
  const meta = metaById(p);
  const seen = new Set<string>();
  let pending: Array<[string, SealedBytes]> = [], pendingBytes = 0;
  const flush = async () => {
    options.signal?.throwIfAborted();
    if (store.putMany) await store.putMany(pending);
    else for (const [key, value] of pending) await store.put(key, value);
    pending = []; pendingBytes = 0;
  };
  try {
    let checked = 0;
    for await (const raw of entries) {
      options.signal?.throwIfAborted();
      options.onProgress?.(checked++, meta.size);
      const { id, sealed } = checkRawKeepsake(raw);
      const k = meta.get(id);
      if (!k) throw new DamagedFile('it holds a keepsake no card mentions');
      if (seen.has(id)) throw new DamagedFile('it holds the same keepsake twice');
      seen.add(id);
      let bytes: Uint8Array;
      try { bytes = await openBytes(vault, id, sealed); }
      catch { staged.problems.push({ id, name: k.name, problem: 'damaged' }); continue; }
      if (bytes.length !== k.size || (await sha256Hex(bytes)) !== k.sha256) {
        staged.problems.push({ id, name: k.name, problem: 'changed' });
        continue;
      }
      options.signal?.throwIfAborted();
      const rekey = options.rekeyTo && options.rekeyTo.key !== vault.key;
      const value = rekey ? await sealBytes(options.rekeyTo!, id, bytes) : sealed;
      pending.push([rowKey(staged.prefix, id), value]);
      pendingBytes += value.data.byteLength;
      staged.ids.push(id);
      if (pendingBytes >= 32 * 1024 * 1024) await flush();
    }
    if (pending.length) await flush();
    options.signal?.throwIfAborted();
  } catch (e) {
    await discardStaged(store, staged);
    throw e;
  }
  options.onProgress?.(meta.size, meta.size);
  for (const [id, k] of meta) if (!seen.has(id)) staged.problems.push({ id, name: k.name, problem: 'missing' });
  return staged;
}

/** Moves checked keepsakes under the You's id, and clears that You's rows the record no longer mentions. */
export async function commitStaged(store: KeepsakeStore, staged: Staged, youId: string, p: Profile, signal?: AbortSignal) {
  signal?.throwIfAborted();
  // Additive only: rows this You already has are never deleted here. Another tab may have just attached a
  // photo to a card it hasn't saved yet, and a draft may still point at its own rows.
  if (store.promote) return store.promote(staged.prefix, youId, staged.ids, null, signal);
  for (const id of staged.ids) {
    const s = await store.get(rowKey(staged.prefix, id));
    if (!s) throw new Error('Staged keepsake disappeared');
    const old = await store.get(rowKey(youId, id));
    if (old && (old.iv.length !== s.iv.length || old.iv.some((v, i) => v !== s.iv[i]))) await store.put(setAsideKey(rowKey(youId, id)), old);
    await store.put(rowKey(youId, id), s);
  }
  await discardStaged(store, staged);
  void p; // the record is only needed by stores that check what it mentions
}

/**
 * Removes photo copies staged for a file open that never finished (the tab closed mid-way). Staging
 * prefixes carry their start time; only ones older than `maxAgeMs` go, so an open running in another tab
 * right now is never touched. Older prefixes without a time are from before this was added and are removed.
 */
export async function clearAbandonedStaging(store: KeepsakeStore, now = Date.now(), maxAgeMs = 6 * 60 * 60 * 1000) {
  const prefixes = new Set((await store.keys('import-')).map(k => k.slice(0, k.indexOf('/'))));
  for (const prefix of prefixes) {
    const started = Number(/^import-(\d{13})-/.exec(prefix)?.[1]);
    // A time in the future (a wrong clock, or a crafted file) is treated as stale too.
    if (!started || now - started > maxAgeMs || started - now > maxAgeMs) await discardStaged(store, { prefix });
  }
}

export async function discardStaged(store: KeepsakeStore, staged: Pick<Staged, 'prefix'>) {
  for (const key of await store.keys(staged.prefix + '/')) await store.del(key);
}

/** A plain list of what couldn't be read, for the person to decide. */
export function describeProblems(problems: KeepsakeProblem[]): string {
  const why = { damaged: 'damaged', changed: 'altered since it was attached', missing: 'missing from the file' };
  return problems.map(x => `• ${x.name} (${why[x.problem]})`).join('\n');
}
