import { describe, expect, it } from 'vitest';
import { createVault } from './crypto';
import { checkFile, MAX_KEEPSAKE_BYTES, normalizeKeepsakes, openBytes, sealBytes, sha256Hex, sniff } from './keepsakes';

const bytes = (...parts: (number[] | string)[]) => {
  const out: number[] = [];
  for (const p of parts) out.push(...(typeof p === 'string' ? Array.from(p, c => c.charCodeAt(0)) : p));
  while (out.length < 16) out.push(0);
  return new Uint8Array(out);
};

describe('sniff', () => {
  it('recognizes allowed types by their bytes', () => {
    expect(sniff(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniff(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniff(bytes('GIF89a'))).toBe('image/gif');
    expect(sniff(bytes('RIFF', [0, 0, 0, 0], 'WEBP'))).toBe('image/webp');
    expect(sniff(bytes([0, 0, 0, 0x18], 'ftypheic'))).toBe('image/heic');
    expect(sniff(bytes('%PDF-1.7'))).toBe('application/pdf');
  });
  it('refuses SVG, HTML renamed .jpg and unknown bytes', () => {
    expect(sniff(bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>'))).toBeNull();
    expect(sniff(bytes('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(sniff(bytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });
});

describe('checkFile', () => {
  it('explains empty, oversized and unsupported files', () => {
    expect(checkFile('a.jpg', new Uint8Array())).toMatchObject({ ok: false });
    const big = new Uint8Array(MAX_KEEPSAKE_BYTES + 1); big.set([0xff, 0xd8, 0xff]);
    expect(checkFile('big.jpg', big)).toMatchObject({ ok: false, reason: expect.stringContaining('25 MB') });
    expect(checkFile('page.jpg', bytes('<html>'))).toMatchObject({ ok: false });
    expect(checkFile('scan.pdf', bytes('%PDF-1.4'))).toEqual({ ok: true, type: 'application/pdf' });
  });
});

describe('sealBytes / openBytes', () => {
  it('round-trips bytes exactly, with fresh IVs, bound to the keepsake id', async () => {
    const v = await createVault('correct horse', 1000);
    const original = crypto.getRandomValues(new Uint8Array(5000));
    const a = await sealBytes(v, 'k1', original);
    const b = await sealBytes(v, 'k1', original);
    expect(a.iv).not.toEqual(b.iv);
    const back = await openBytes(v, 'k1', a);
    expect(await sha256Hex(back)).toBe(await sha256Hex(original));
    await expect(openBytes(v, 'k2', a)).rejects.toThrow();
    const tampered = { iv: a.iv, data: a.data.slice() }; tampered.data[10] ^= 1;
    await expect(openBytes(v, 'k1', tampered)).rejects.toThrow();
  });
});

describe('normalizeKeepsakes', () => {
  it('drops malformed entries', () => {
    expect(normalizeKeepsakes([{ id: 'x' }, { id: 'k', name: 'a.jpg', type: 'image/jpeg', size: 3, sha256: 'ab', addedAt: 't' }]))
      .toHaveLength(1);
    expect(normalizeKeepsakes('nope')).toBeUndefined();
  });
});
