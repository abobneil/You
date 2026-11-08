/// <reference types="node" />
import { describe, it, expect, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { f1Alex, f2 } from '../../scripts/fixtures';
import { buildReadable } from './readableExport';
import { overlap } from './life';
import { sha256Hex } from './keepsakes';
import type { Profile } from './types';

describe('readable copies', () => {
  it.each([f1Alex, f2])('keeps every period card and its exact dates and notes', async fixture => {
    const p: Profile = fixture();
    const result = await buildReadable(p, { from: '2007' }, async () => { throw Error('unexpected'); });
    const files = unzipSync(result.bytes), html = strFromU8(files['index.html']);
    const record = JSON.parse(strFromU8(files['record.json']));
    const expected = p.cards.filter(c => overlap(c, '2007', '2007') !== 'none');
    expect(record.cards.map((c: { id: string }) => c.id).sort()).toEqual(expected.map(c => c.id).sort());
    for (const c of expected) {
      const saved = record.cards.find((x: { id: string }) => x.id === c.id);
      expect(saved.since).toBe(c.since); expect(saved.until).toBe(c.until);
      if (c.note) expect(html).toContain(c.note);
    }
  });
  it('escapes hostile content, masks all sensitive representations, preserves original bytes and writes no storage', async () => {
    const p: Profile = f1Alex();
    const hostile = '<img src=x onerror=alert(1)> </style><script>';
    p.cards[0].note = hostile;
    const secret = p.cards.find(c => c.kind === 'Passport')!;
    secret.revisions.push({ value: 'SECRET-OLD-12345', at: '2020' });
    secret.imports = { test: { id: 'one', at: '2020', fields: { number: 'X12345678' } } };
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    secret.keepsakes = [{ id: 'k', name: 'original.pdf', type: 'application/pdf', size: original.length, sha256: await sha256Hex(original), addedAt: '2020', alt: hostile }];
    const setItem = vi.fn(), open = vi.fn();
    vi.stubGlobal('localStorage', { setItem }); vi.stubGlobal('indexedDB', { open });
    try {
      const reader = vi.fn(async () => original);
      const result = await buildReadable(p, {}, reader);
      const files = unzipSync(result.bytes), html = strFromU8(files['index.html']);
      expect(html).not.toMatch(/<script|<[^>]+\son\w+\s*=/i);
      expect(html).toContain('&lt;img'); expect(html).toContain('&lt;/style&gt;');
      expect(strFromU8(files['record.json'])).not.toContain('X12345678');
      expect(strFromU8(files['record.json'])).not.toContain('SECRET-OLD-12345');
      const path = Object.keys(files).find(k => k.startsWith('files/'))!;
      expect(await sha256Hex(files[path])).toBe(await sha256Hex(original));
      const full = unzipSync((await buildReadable(p, { sensitive: true }, reader)).bytes);
      expect(strFromU8(full['index.html'])).toContain('X12345678');
      expect(setItem).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
      expect(p.cards.find(c => c.id === secret.id)?.value).toBe('X12345678');
    } finally { vi.unstubAllGlobals(); }
  });
  it('refuses corrupt files and cancels without a package', async () => {
    const p: Profile = f2();
    p.cards[0].keepsakes = [{ id: 'k', name: 'bad.pdf', type: 'application/pdf', size: 1, sha256: 'wrong', addedAt: '2020' }];
    await expect(buildReadable(p, {}, async () => new Uint8Array([1]))).rejects.toThrow('fingerprint');
    const controller = new AbortController(); controller.abort();
    await expect(buildReadable(p, { signal: controller.signal }, async () => new Uint8Array())).rejects.toThrow('Cancelled');
  });
  it('benchmarks 100 cards and three keepsakes', async () => {
    const p: Profile = f1Alex(); p.cards = Array.from({ length: 100 }, (_, i) => ({ ...p.cards[i % p.cards.length], id: `bench-${i}` }));
    const bytes = new Uint8Array(1024 * 1024); const hash = await sha256Hex(bytes);
    for (let i = 0; i < 3; i++) p.cards[i].keepsakes = [{ id: `k${i}`, name: `photo${i}.png`, type: 'image/png', size: bytes.length, sha256: hash, addedAt: '2020' }];
    const start = performance.now(); const result = await buildReadable(p, {}, async () => bytes);
    console.log(`Readable export benchmark: ${(performance.now() - start).toFixed(1)} ms; 100 cards, 3 x 1 MiB keepsakes; ${result.bytes.length} ZIP bytes`);
    expect(result.bytes.length).toBeGreaterThan(3 * bytes.length);
  });
});

