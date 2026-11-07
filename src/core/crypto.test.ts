import { describe, expect, it } from 'vitest';
import { WrongPassphrase, createVault, isEnvelope, seal, unlock } from './crypto';

// Few rounds keeps the tests fast; the app uses DEFAULT_ITERATIONS.
const FAST = 1000;

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
