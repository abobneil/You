// Reading an Audible library into You's import format. A faithful port of the Python adapter's
// conservative rules: being in the library is not proof of ownership, and a saved position is not
// proof of reading. Network access is injected (`Client`), so all of this is unit tested.

/** Response groups that carry completion, ownership and series evidence. */
export const GROUPS = [
  'product_desc', 'product_attrs', 'contributors', 'media', 'series',
  'is_finished', 'listening_status', 'percent_complete', 'is_archived',
  'origin', 'customer_rights', 'order_details', 'product_plans',
].join(',');

export type Json = Record<string, any>;
export type Params = Record<string, string | number>;

/** Anything that can GET an Audible API path ("1.0/library") and return parsed JSON. */
export interface Client { get(path: string, params?: Params): Promise<unknown> }

/** An unexpected response must not silently become an empty library. */
export class ShapeError extends Error { override name = 'ShapeError'; }

/** An HTTP failure, carrying only the status (never the response body, which may echo tokens). */
export class HttpError extends Error {
  override name = 'HttpError';
  status: number;
  constructor(status: number) { super(`Audible answered ${status}`); this.status = status; }
}

/** The connection failed before any HTTP response. */
export class NetworkError extends Error { override name = 'NetworkError'; }

const RETRY = new Set([429, 500, 502, 503, 504]);
const obj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const realSleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** GET with up to three retries for rate limits, server errors and dropped connections. */
export async function get(client: Client, path: string, params: Params = {}, sleep = realSleep): Promise<Json> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await client.get(path, params);
      if (!obj(result)) throw new ShapeError(`Expected an object from ${path}`);
      return result;
    } catch (e) {
      const transient = (e instanceof HttpError && RETRY.has(e.status)) || e instanceof NetworkError;
      if (attempt === 3 || !transient) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

export async function libraryItems(client: Client, { status = 'Active', pageSize = 250 } = {}, sleep = realSleep): Promise<Json[]> {
  if (!(pageSize >= 1 && pageSize <= 1000)) throw new RangeError('Page size must be between 1 and 1000');
  const items: Json[] = [];
  const seen = new Set<string>();
  // Continue until an empty page, even when Audible caps a page below pageSize.
  for (let page = 1; page <= 10000; page++) {
    const response = await get(client, '1.0/library',
      { page, num_results: pageSize, response_groups: GROUPS, sort_by: 'Title', status }, sleep);
    const batch = response.items;
    if (!Array.isArray(batch)) throw new ShapeError('Library response lacks an items array');
    if (!batch.length) return items;
    let added = 0;
    for (const item of batch) {
      if (!obj(item) || typeof item.asin !== 'string' || !item.asin) throw new ShapeError('Library item lacks an ASIN');
      if (!seen.has(item.asin)) {
        seen.add(item.asin);
        items.push({ ...item, _requested_status: status });
        added++;
      }
    }
    if (!added) throw new ShapeError('Pagination repeated a page; export stopped to avoid an incomplete snapshot');
  }
  throw new ShapeError('Pagination exceeded its safety limit');
}

export async function lastPositions(client: Client, asins: string[], sleep = realSleep): Promise<Record<string, Json>> {
  const positions: Record<string, Json> = {};
  for (let start = 0; start < asins.length; start += 25) {
    const batch = asins.slice(start, start + 25);
    const response = await get(client, '1.0/annotations/lastpositions', { asins: batch.join(',') }, sleep);
    const annots = response.asin_last_position_heard_annots;
    if (!Array.isArray(annots)) throw new ShapeError('Last-position response lacks its annotations array');
    for (const annot of annots) {
      if (!obj(annot) || !batch.includes(annot.asin)) throw new ShapeError('Unexpected last-position annotation');
      const position = annot.last_position_heard;
      if (!obj(position)) throw new ShapeError('Last-position annotation lacks a position object');
      positions[annot.asin] = position;
    }
  }
  return positions;
}

/** A finite, non-negative number, or null. Booleans, blanks, NaN and infinities are not evidence. */
export function number(value: unknown): number | null {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim()) n = Number(value);
  else return null;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const boolean = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

export function listening(item: Json, position: Json | null | undefined) {
  const nested: Json = obj(item.listening_status) ? item.listening_status : {};
  let flag = boolean(nested.is_finished);
  let flagSource = 'listening_status.is_finished';
  if (flag === null) { flag = boolean(item.is_finished); flagSource = 'is_finished'; }
  const timestamp = typeof nested.finished_at_timestamp === 'string' && nested.finished_at_timestamp.trim() ? nested.finished_at_timestamp : null;
  let pct = number(nested.percent_complete);
  let pctSource = 'listening_status.percent_complete';
  if (pct === null) { pct = number(item.percent_complete); pctSource = 'percent_complete'; }
  if (pct !== null && pct > 100) pct = null;
  const pos: Json = position ?? {};
  const ms = pos.status === 'Exists' ? number(pos.position_ms) : null;
  const warnings: string[] = [];
  const top = boolean(item.is_finished);
  if (top !== null && boolean(nested.is_finished) !== null && top !== flag) {
    warnings.push('Conflicting completion flags; preferred listening_status.is_finished');
  }
  let state: string, evidence: string, read: boolean | null;
  if (flag === true || (flag === null && timestamp)) {
    state = 'finished'; evidence = flag === true ? flagSource : 'listening_status.finished_at_timestamp'; read = true;
  } else if ((ms !== null && ms > 0) || (pct !== null && pct > 0)) {
    state = 'in_progress'; evidence = ms ? 'last_position_heard' : pctSource; read = flag;
  } else if (ms === 0 || pos.status === 'DoesNotExist' || pct === 0) {
    state = 'not_started'; evidence = 'no_saved_progress'; read = flag;
  } else {
    state = 'unknown'; evidence = flag === false ? flagSource : 'missing_evidence'; read = flag;
  }
  // False means Audible says unfinished. An absent flag stays null even with a saved position.
  return { state, is_read: read, is_finished: flag, finished_at: timestamp, percent_complete: pct,
    position_ms: ms, position_updated_at: pos.last_updated ?? null, position_status: pos.status ?? null,
    time_remaining_seconds: number(nested.time_remaining_seconds), evidence, warnings };
}

export function ownership(item: Json) {
  const evidence: Json = {};
  for (const k of ['is_ayce', 'origin_type', 'origin_id', 'origin_marketplace', 'purchase_date', 'customer_rights', 'order_details']) {
    if (k in item) evidence[k] = item[k];
  }
  const rights: Json = obj(item.customer_rights) ? item.customer_rights : {};
  const listed = '_requested_status' in item ? item._requested_status : item.status;
  let status: string, basis: string;
  if (listed === 'Revoked') { status = 'revoked'; basis = 'library_status'; }
  else if (item.origin_type === 'Purchase' && rights.is_consumable_indefinitely === true) { status = 'owned'; basis = 'Purchase origin and indefinite consumption rights'; }
  else if (item.origin_type === 'Subscription' || item.is_ayce === true) { status = 'subscription'; basis = 'Subscription origin or is_ayce'; }
  else if (item.origin_type === 'Purchase') { status = 'likely_owned'; basis = 'Purchase origin without confirmed indefinite rights'; }
  else if (item.is_ayce === false) { status = 'unknown'; basis = 'is_ayce=false does not prove purchase'; }
  else { status = 'unknown'; basis = 'missing acquisition evidence'; }
  // Purchase dates exist on subscription entries too. They are not receipts.
  return { status, basis, evidence };
}

export function normalize(item: Json, position: Json | null | undefined, marketplace: string) {
  const people = (key: string) => (Array.isArray(item[key]) ? item[key] : [])
    .filter((p: unknown) => obj(p) && typeof p.name === 'string').map((p: Json) => p.name as string);
  return {
    id: `audible:${marketplace}:${item.asin}`, asin: item.asin,
    marketplace, title: item.title ?? null, subtitle: item.subtitle ?? null,
    authors: people('authors'), narrators: people('narrators'),
    content_type: item.content_type ?? null, content_delivery_type: item.content_delivery_type ?? null,
    runtime_length_min: number(item.runtime_length_min),
    purchase_date: item.purchase_date ?? null, series: 'series' in item ? item.series : [],
    library_status: '_requested_status' in item ? item._requested_status : (item.status ?? 'Active'),
    is_archived: boolean(item.is_archived),
    ownership: ownership(item), listening: listening(item, position),
    url: `https://www.audible.com/pd/${item.asin}`,
  };
}

export type Snapshot = ReturnType<typeof buildSnapshot>;

function buildSnapshot(items: ReturnType<typeof normalize>[], marketplace: string, includeRevoked: boolean, now: Date) {
  return {
    schema: 'you.audible.library' as const, version: 1 as const, source: 'Audible', marketplace,
    exported_at: now.toISOString(), scope: includeRevoked ? 'active_and_revoked' : 'active', items,
    notes: ['Owned means Audible reports Purchase origin plus indefinite consumption rights; is_ayce alone is insufficient.',
      'Finished means Audible marks it finished, not proof of every minute listened.',
      'Missing saved progress does not prove a book was never read elsewhere.'],
  };
}

/** The whole library: active and (optionally) returned titles, with saved positions. No credentials. */
export async function snapshot(client: Client, { marketplace = 'us', includeRevoked = true, pageSize = 250, now = new Date(), sleep = realSleep } = {}) {
  const active = await libraryItems(client, { pageSize }, sleep);
  const revoked = includeRevoked ? await libraryItems(client, { status: 'Revoked', pageSize }, sleep) : [];
  // If a concurrent account change puts the same ASIN in both lists, Active wins.
  const byAsin = new Map<string, Json>();
  for (const x of revoked) byAsin.set(x.asin, x);
  for (const x of active) byAsin.set(x.asin, x);
  const positions = await lastPositions(client, [...byAsin.keys()], sleep);
  const result = buildSnapshot([...byAsin.values()].map(x => normalize(x, positions[x.asin], marketplace)), marketplace, includeRevoked, now);
  // Provider evidence can carry arbitrary nested fields. Credentials are never library data.
  return JSON.parse(JSON.stringify(result, (key, value) => /token|cookie|private.?key|authorization|password|verifier/i.test(key) ? undefined : value)) as typeof result;
}
