// Ported from the Python adapter's tests (tests/test_library.py), plus a few for the TypeScript port.
import { describe, expect, it } from 'vitest';
import { get, HttpError, lastPositions, libraryItems, listening, normalize, ownership, ShapeError, snapshot, type Client, type Params } from './library.ts';

class Fake implements Client {
  calls: [string, Params][] = [];
  private responses: unknown[];
  constructor(responses: unknown[]) { this.responses = [...responses]; }
  async get(path: string, params: Params = {}) {
    this.calls.push([path, params]);
    const v = this.responses.shift();
    if (v instanceof Error) throw v;
    return v;
  }
}
const noSleep = async () => {};

describe('listening status', () => {
  it('finished beats a restarted position', () => {
    const s = listening({ is_finished: true, percent_complete: 0 }, { status: 'Exists', position_ms: 0 });
    expect(s.state).toBe('finished');
    expect(s.is_read).toBe(true);
  });
  it('a stale zero percentage doesn’t hide progress', () => {
    const s = listening({ is_finished: false, percent_complete: 0 }, { status: 'Exists', position_ms: 7200000 });
    expect(s.state).toBe('in_progress');
    expect(s.is_read).toBe(false);
  });
  it('absence is not unread', () => {
    expect(listening({}, null).state).toBe('unknown');
    expect(listening({}, null).is_read).toBeNull();
    expect(listening({ percent_complete: 100 }, null).is_read).toBeNull();
  });
  it('an explicit “unfinished” wins over an old finished timestamp', () => {
    const s = listening({ listening_status: { is_finished: false, finished_at_timestamp: '2020-01-01' } }, null);
    expect(s.is_read).toBe(false);
    expect(s.state).not.toBe('finished');
  });
  it('the nested completion flag wins, and the conflict is recorded', () => {
    const s = listening({ is_finished: true, listening_status: { is_finished: false } }, null);
    expect(s.is_read).toBe(false);
    expect(s.warnings).toHaveLength(1);
  });
  it('timestamp fallback, and an explicitly missing position', () => {
    expect(listening({ listening_status: { finished_at_timestamp: '2020-01-01' } }, null).state).toBe('finished');
    expect(listening({}, { status: 'DoesNotExist' }).state).toBe('not_started');
  });
  it('malformed values are not reading evidence', () => {
    for (const v of [true, -1, 'NaN', 'inf', 101, {}, '']) expect(listening({ percent_complete: v }, null).state, String(v)).toBe('unknown');
  });
});

describe('ownership', () => {
  it('a purchase date is not a receipt', () => {
    expect(ownership({ purchase_date: '2020-01-01' }).status).toBe('unknown');
    expect(ownership({ is_ayce: true }).status).toBe('subscription');
    expect(ownership({ is_ayce: false }).status).toBe('unknown');
    expect(ownership({ is_ayce: false, _requested_status: 'Revoked' }).status).toBe('revoked');
  });
  it('purchase rights and subscription origin as seen on the live account', () => {
    expect(ownership({ origin_type: 'Purchase', customer_rights: { is_consumable_indefinitely: true } }).status).toBe('owned');
    expect(ownership({ origin_type: 'Purchase' }).status).toBe('likely_owned');
    expect(ownership({ origin_type: 'Subscription', is_ayce: false }).status).toBe('subscription');
    expect(ownership({ origin_type: 'Purchase', is_ayce: true, customer_rights: { is_consumable_indefinitely: true } }).status).toBe('owned');
  });
  it('null contributors seen in a live library', () => {
    const item = normalize({ asin: 'B000000001', authors: null, narrators: null }, null, 'us');
    expect(item.authors).toEqual([]);
    expect(item.narrators).toEqual([]);
  });
});

describe('fetching', () => {
  it('follows short pages and removes overlap', async () => {
    const c = new Fake([{ items: [{ asin: 'A' }] }, { items: [{ asin: 'A' }, { asin: 'B' }] }, { items: [] }]);
    expect((await libraryItems(c, {}, noSleep)).map(x => x.asin)).toEqual(['A', 'B']);
    expect(c.calls.map(x => x[1].page)).toEqual([1, 2, 3]);
  });
  it('a repeated page fails instead of publishing partial data', async () => {
    await expect(libraryItems(new Fake([{ items: [{ asin: 'A' }] }, { items: [{ asin: 'A' }] }]), {}, noSleep)).rejects.toBeInstanceOf(ShapeError);
  });
  it('missing items is not an empty library', async () => {
    await expect(libraryItems(new Fake([{ error: 'no data' }]), {}, noSleep)).rejects.toBeInstanceOf(ShapeError);
  });
  it('asks for saved positions 25 at a time', async () => {
    const asins = Array.from({ length: 51 }, (_, i) => `B${String(i).padStart(9, '0')}`);
    const c = new Fake(Array(3).fill({ asin_last_position_heard_annots: [] }));
    expect(await lastPositions(c, asins, noSleep)).toEqual({});
    expect(c.calls.map(x => String(x[1].asins).split(',').length)).toEqual([25, 25, 1]);
  });
  it('an unknown position shape aborts', async () => {
    await expect(lastPositions(new Fake([{}]), ['A'], noSleep)).rejects.toBeInstanceOf(ShapeError);
  });
  it('retries a rate limit but not an auth error', async () => {
    const waits: number[] = [];
    expect(await get(new Fake([new HttpError(429), { items: [] }]), '1.0/library', {}, async ms => { waits.push(ms); })).toEqual({ items: [] });
    expect(waits).toEqual([1000]);
    await expect(get(new Fake([new HttpError(401)]), '1.0/library', {}, noSleep)).rejects.toMatchObject({ status: 401 });
  });
  it('a full snapshot has no credentials and prefers Active over Revoked', async () => {
    const book = { asin: 'B000000001', title: 'A book', is_finished: true };
    const c = new Fake([{ items: [book] }, { items: [] }, { items: [book] }, { items: [] }, { asin_last_position_heard_annots: [] }]);
    const r = await snapshot(c, { sleep: noSleep, now: new Date('2026-11-07T12:00:00Z') });
    expect(r).toMatchObject({ schema: 'you.audible.library', version: 1, marketplace: 'us', scope: 'active_and_revoked', exported_at: '2026-11-07T12:00:00.000Z' });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ library_status: 'Active', id: 'audible:us:B000000001', listening: { state: 'finished' } });
    expect(JSON.stringify(r)).not.toMatch(/access_token|adp_token|private_key/);
    expect(c.calls[0]).toEqual(['1.0/library', expect.objectContaining({ status: 'Active', sort_by: 'Title', num_results: 250 })]);
  });
});
