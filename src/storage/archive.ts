// Earlier versions kept in this browser. Whenever something replaces a You's browser copy wholesale
// (opening a file in its place, restoring an earlier version), the copy being replaced is kept here first,
// exactly as stored and still encrypted. So a replace can never lose what was stored, whatever the tab knew
// and whether or not an outside copy was made. Photos aren't duplicated: photo rows are never deleted by a
// replace, so an earlier version's photos are still there when it's restored.
import { runIn } from './vaultStore';

export interface ArchivedVersion {
  key: string;
  /** When it was kept (ISO). */
  at: string;
  /** Why, in plain words: "before opening alex-kim.you.json". */
  reason: string;
  /** The record exactly as it was stored (an encrypted envelope). */
  envelope: string;
}

const prefix = (id: string) => `archive/${id}/`;
const range = (id: string) => IDBKeyRange.bound(prefix(id), prefix(id) + '￿');

/** Keeps `envelope` as an earlier version of `id`. Resolves once it's stored and read back. */
export async function archiveVersion(id: string, envelope: string, reason: string, at = new Date().toISOString()): Promise<void> {
  const key = `${prefix(id)}${at}-${crypto.randomUUID().slice(0, 8)}`;
  const value = JSON.stringify({ at, reason, envelope });
  await runIn('records', 'readwrite', s => s.put(value, key));
  if (await runIn<string | undefined>('records', 'readonly', s => s.get(key)) !== value) throw new Error('Could not keep the earlier version');
}

/** Earlier versions of `id`, newest first (without their envelopes). */
export async function listArchived(id: string): Promise<Omit<ArchivedVersion, 'envelope'>[]> {
  const keys = (await runIn<IDBValidKey[]>('records', 'readonly', s => s.getAllKeys(range(id)))).map(String);
  const out: Omit<ArchivedVersion, 'envelope'>[] = [];
  for (const key of keys) {
    const v = await getArchived(key);
    if (v) out.push({ key, at: v.at, reason: v.reason });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export async function getArchived(key: string): Promise<ArchivedVersion | null> {
  const raw = await runIn<string | undefined>('records', 'readonly', s => s.get(key));
  if (typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw);
    return typeof v.envelope === 'string' ? { key, at: String(v.at), reason: String(v.reason ?? ''), envelope: v.envelope } : null;
  } catch { return null; }
}

export async function deleteArchived(key: string): Promise<void> {
  await runIn('records', 'readwrite', s => s.delete(key));
}

/** Removing a You from this browser removes its earlier versions too. */
export async function deleteAllArchived(id: string): Promise<void> {
  await runIn('records', 'readwrite', s => s.delete(range(id)));
}
