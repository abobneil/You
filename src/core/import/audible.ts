// Only the credential-free, versioned export from the local You Audible adapter is accepted.
import { looseDate, rowId } from './parse';
import type { ImportResult, ImportRow } from './types';

const STATUS: Record<string, string> = {
  finished: 'Read', in_progress: 'Reading', not_started: 'Not started', unknown: 'Unknown',
};
const OWNERSHIP: Record<string, string> = {
  owned: 'Owned', likely_owned: 'Likely owned', subscription: 'Subscription', revoked: 'Revoked', unknown: 'Unknown',
};
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string' ? v : '';

export function audibleRows(input: string): ImportResult {
  let data: unknown;
  try { data = JSON.parse(input); } catch { return { rows: [], notes: ['That file is not valid JSON. Choose your Audible library export.'] }; }
  if (!obj(data) || data.schema !== 'you.audible.library' || data.version !== 1 || data.marketplace !== 'us'
      || !Array.isArray(data.items) || typeof data.exported_at !== 'string' || !Number.isFinite(Date.parse(data.exported_at))) {
    return { rows: [], notes: ['Choose the Audible US JSON export from the You Audible adapter, not an account credentials file.'] };
  }
  const at = new Date(data.exported_at).toISOString();
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const book of data.items) {
    if (!obj(book) || !/^[A-Z0-9]{10}$/.test(text(book.asin)) || !text(book.title).trim()
        || book.id !== `audible:us:${book.asin}` || book.marketplace !== 'us' || !obj(book.listening) || !obj(book.ownership)) {
      skipped++; continue;
    }
    // Preserve podcasts in the export, but do not turn their seasons/episodes into book cards.
    if (book.content_delivery_type === 'Podcast' || /podcast|episode|periodical/i.test(text(book.content_type))) { skipped++; continue; }
    if (seen.has(book.id)) { skipped++; continue; }
    seen.add(book.id);
    const author = Array.isArray(book.authors) ? book.authors.filter((v: unknown) => typeof v === 'string').join(', ') : '';
    const listening = STATUS[text(book.listening.state)] ?? 'Unknown';
    const ownership = OWNERSHIP[text(book.ownership.status)] ?? 'Unknown';
    // Keep Audible's state separate from the person's overall reading status. They may read elsewhere.
    const fields: Record<string, string> = { author, audibleStatus: listening, audibleOwnership: ownership,
      audibleAsin: book.asin, audibleFinished: looseDate(text(book.listening.finished_at)),
      audiblePosition: typeof book.listening.position_ms === 'number' && Number.isFinite(book.listening.position_ms) && book.listening.position_ms >= 0
        ? `${Math.floor(book.listening.position_ms / 60000)} min` : '' };
    const title = text(book.title).trim();
    rows.push({ id: rowId('audible'), group: `Audible · ${listening}`, label: title,
      sub: [author, ownership].filter(Boolean).join(' · '),
      build: () => [{ area: 'interests', kind: 'Book', value: title, since: looseDate(text(book.purchase_date)), fields,
        sync: { source: 'Audible', id: book.id, at } }],
    });
  }
  return { rows, notes: [
    'Audible reading status and ownership are shown separately. “Likely owned” needs purchase verification; subscription titles are not purchases.',
    'Reimport a newer export to refresh Audible details. Your own reading status and details you changed by hand are kept. Books missing from an export are kept.',
    ...(skipped ? [`Skipped ${skipped} duplicate, unsupported or incomplete entries.`] : []),
  ] };
}
