import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'node:http';
vi.mock('./vault.ts', () => ({ remove: vi.fn(), load: vi.fn(), has: vi.fn(), store: vi.fn() }));
import { allowed } from './plugin.ts';
import { disconnect, safeMessage } from './service.ts';
import * as vault from './vault.ts';
import { snapshot } from './library.ts';
const request = (headers: Record<string, string | undefined>, method = 'POST') => ({ method, headers: { host: '127.0.0.1:49631', origin: 'http://127.0.0.1:49631', 'sec-fetch-site': 'same-origin', 'x-you-local': '1', ...headers }, socket: { localPort: 49631 } }) as unknown as IncomingMessage;
describe('Audible helper boundary', () => {
  it('rejects cross-site, missing Origin, missing metadata and rebinding hosts', () => {
    expect(allowed(request({}))).toBe(true);
    for (const headers of [{ origin: 'https://evil.test' }, { origin: '' }, { 'sec-fetch-site': '' }, { 'sec-fetch-site': 'cross-site' }, { host: 'evil.test:49631' }, { host: 'localhost:80' }, { host: '[::1]:49631' }]) expect(allowed(request(headers))).toBe(false);
  });
  it('only permits the configured static app exception', () => {
    const p = { port: 49631, origins: ['https://you.example'] };
    expect(allowed(request({ origin: 'https://you.example', 'sec-fetch-site': 'cross-site' }), p)).toBe(true);
    expect(allowed(request({ origin: 'https://evil.test', 'sec-fetch-site': 'cross-site' }), p)).toBe(false);
    expect(allowed(request({ origin: 'https://you.example', 'sec-fetch-site': '' }), p)).toBe(false);
  });
  it('disconnect removes both stored credentials and unfinished authorization', async () => {
    await disconnect();
    expect(vault.remove).toHaveBeenCalledWith('us');
    expect(vault.remove).toHaveBeenCalledWith('pending');
  });
  it('does not echo arbitrary diagnostic errors', () => {
    expect(safeMessage(new Error('Windows secret cookie=SECRET'))).not.toContain('SECRET');
  });
  it('library/sync output contains no token or cookie fields', async () => {
    const result = await snapshot({ async get(path, params) {
      if (path.includes('lastpositions')) return { asin_last_position_heard_annots: [] };
      return { items: params?.page === 1 && params.status === 'Active' ? [{ asin: 'B000000001', title: 'Book', adp_token: 'SECRET', website_cookies: { x: 'SECRET' }, series: [{ title: 'Series', access_token: 'SECRET' }], customer_rights: { is_consumable_indefinitely: true, cookie: 'SECRET' } }] : [] };
    } });
    expect(JSON.stringify(result)).not.toMatch(/token|cookie|SECRET/i);
  });
});
