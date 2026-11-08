import { describe, it, expect, vi } from 'vitest';
import { buildPlan, checkFile } from './safety';
import { createVault } from './crypto';
import { encode } from '../storage/fileFormat';
const plan = { recipient: '<script>alert("x")</script>', fileName: '<file>', location: '&private', origin: 'https://example.test', passphrase: 'secret' };
describe('private plan', () => {
  it('excludes a supplied passphrase unless opted in and typed', () => {
    expect(buildPlan(plan)).not.toContain('secret');
    expect(buildPlan({ ...plan, printPassphrase: true })).toContain('secret');
    expect(buildPlan({ ...plan, printPassphrase: true, passphrase: '' })).toContain('________________________________');
  });
  it('escapes every input and contains no scripts', () => {
    const html = buildPlan({ ...plan, printPassphrase: true, passphrase: '<script>' });
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;file&gt;');
    expect(html).toContain('&amp;private');
    expect(html).toContain('/FORMAT.md');
  });
});
describe('read-only file check', () => {
  it('summarizes without persisting or changing the source', async () => {
    const storage = { setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    const p = { name: 'Pat', cards: [], links: [], updatedAt: '2026-11-08T12:00:00Z' };
    const text = await encode(await createVault('right', 100_000), p);
    expect(await checkFile(text, 'right')).toEqual({ ok: true, cards: 0, lastSaved: p.updatedAt });
    expect(await checkFile(text, 'wrong')).toEqual({ ok: false, message: 'That passphrase didn’t work. Try again.' });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(p.name).toBe('Pat');
    vi.unstubAllGlobals();
  });
});
