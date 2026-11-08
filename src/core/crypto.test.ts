import { describe, expect, it } from 'vitest';
import { toB64, fromB64, validateEnvelope, MAX_ENVELOPE_DATA_LENGTH, WrongPassphrase, createVault, isEnvelope, seal, unlock } from './crypto';

// Few rounds keeps the tests fast; the app uses DEFAULT_ITERATIONS.
const FAST = 100_000;

describe('passphrase encryption', () => {
  it('round-trips with the right passphrase', async () => {
    const v = await createVault('correct horse battery staple', FAST);
    const sealed = await seal(v, '{"name":"Alex"}');
    const env = JSON.parse(sealed);
    expect(isEnvelope(env)).toBe(true);
    expect(sealed).not.toContain('Alex');
    const { plaintext, vault } = await unlock('correct horse battery staple', env);
    expect(plaintext).toBe('{"name":"Alex"}');
    expect(vault.iterations).toBe(FAST);
  });

  it('rejects a wrong passphrase', async () => {
    const v = await createVault('right one here', FAST);
    const env = JSON.parse(await seal(v, 'secret'));
    await expect(unlock('wrong one here', env)).rejects.toBeInstanceOf(WrongPassphrase);
  });

  it('detects tampering', async () => {
    const v = await createVault('right one here', FAST);
    const env = JSON.parse(await seal(v, 'secret data'));
    const bytes = atob(env.data).split('');
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 1);
    env.data = btoa(bytes.join(''));
    await expect(unlock('right one here', env)).rejects.toBeInstanceOf(WrongPassphrase);
  });

  it('uses a fresh IV every time, with the same salt', async () => {
    const v = await createVault('right one here', FAST);
    const a = JSON.parse(await seal(v, 'same'));
    const b = JSON.parse(await seal(v, 'same'));
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.data).not.toBe(b.data);
    expect(a.kdf.salt).toBe(b.kdf.salt);
  });

  it('treats the same passphrase in different Unicode forms as equal', async () => {
    const v = await createVault('café au lait', FAST); // é as one character
    const env = JSON.parse(await seal(v, 'ok'));
    expect((await unlock('café au lait', env)).plaintext).toBe('ok'); // e + combining accent
  });
});

describe('hostile envelope bounds', () => {
 const valid = () => ({ app: 'you', version: 2, kdf: {name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:btoa('s'.repeat(16))},cipher:{name:'AES-GCM',iv:btoa('i'.repeat(12))},data:btoa('d'.repeat(16)) }) as any;
 it.each([99999,10000001,1.5,NaN,Infinity])('rejects iterations %s before deriving', async iterations => {
 const e = valid(); e.kdf.iterations = iterations;
 await expect(unlock('pass', e)).rejects.toThrow('Invalid encrypted record');
 });
 it.each(['salt','iv','data','oversize','hash'])('rejects malformed %s', async field => {
 const e = valid();
 if(field==='salt') e.kdf.salt=btoa('short');
 if(field==='iv') e.cipher.iv=btoa('short');
 if(field==='data') e.data='!!!!';
 if(field==='oversize') e.data='A'.repeat(MAX_ENVELOPE_DATA_LENGTH+4);
 if(field==='hash') e.kdf.hash='SHA-1';
 await expect(unlock('pass',e)).rejects.toThrow('Invalid encrypted record');
 });
 it('accepts boundary iteration counts', () => {
 for(const n of [100000,10000000]) { const e=valid();e.kdf.iterations=n; expect(()=>validateEnvelope(e)).not.toThrow(); }
 });
});


describe('large base64 buffers', () => {
  it.each([0, 1, 2, 3, 24575, 24576, 24577, 98307])('round-trips %i bytes including subarray offsets', size => {
    const backing = Uint8Array.from({ length: size + 4 }, (_, i) => i % 256);
    const bytes = backing.subarray(2, size + 2);
    const expected = btoa(Array.from(bytes, x => String.fromCharCode(x)).join(''));
    expect(toB64(bytes)).toBe(expected);
    expect(fromB64(expected)).toEqual(bytes);
  });
  it('rejects malformed base64', () => {
    for (const text of ['!', 'a', 'aaaa=a', 'abcd====', 'YQ==' + 'abcd'.repeat(8192)]) expect(() => fromB64(text)).toThrow();
  });
});
