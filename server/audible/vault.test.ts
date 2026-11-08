import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { escapeControlsInStrings, fileStore, outline, seal, unseal } from './vault.ts';

const secret = JSON.stringify({ adp_token: '{enc:abc}', device_private_key: '-----BEGIN RSA PRIVATE KEY-----\nxyz\n-----END RSA PRIVATE KEY-----' });

afterEach(() => { delete process.env.YOU_AUDIBLE_PASSPHRASE; });

describe('the private-file store (Linux servers, anywhere without a keyring)', () => {
  it('saves, reads and removes, readable only by the owner', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'you-audible-')), 'you-audible');
    const s = fileStore(dir);
    expect(await s.has('us')).toBe(false);
    expect(await s.read('us')).toBeNull();
    await s.write('us', secret);
    expect(await s.has('us')).toBe(true);
    expect(await s.read('us')).toBe(secret);
    if (process.platform !== 'win32') {
      expect(statSync(join(dir, 'us.json')).mode & 0o777).toBe(0o600);
      expect(statSync(dir).mode & 0o777).toBe(0o700);
    }
    await s.remove('us');
    expect(await s.has('us')).toBe(false);
  });

  it('encrypts the file when YOU_AUDIBLE_PASSPHRASE is set, and needs it to read back', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'you-audible-')), 'you-audible');
    process.env.YOU_AUDIBLE_PASSPHRASE = 'correct horse';
    const s = fileStore(dir);
    expect(s.describe).toMatch(/encrypted/);
    await s.write('us', secret);
    const onDisk = readFileSync(join(dir, 'us.json'), 'utf8');
    expect(onDisk).not.toContain('PRIVATE KEY');
    expect(await s.read('us')).toBe(secret);
    process.env.YOU_AUDIBLE_PASSPHRASE = 'wrong';
    await expect(s.read('us')).rejects.toThrow(/doesn’t match/);
    delete process.env.YOU_AUDIBLE_PASSPHRASE;
    await expect(s.read('us')).rejects.toThrow(/Set YOU_AUDIBLE_PASSPHRASE/);
  });

  it('seals with a fresh salt and IV every time; plain files pass through', () => {
    const a = seal('hello', 'pw'), b = seal('hello', 'pw');
    expect(a).not.toBe(b);
    expect(unseal(a, 'pw')).toBe('hello');
    expect(unseal('{"plain":true}', undefined)).toBe('{"plain":true}');
  });
});

describe('outline', () => {
  it('describes a saved value without repeating any of it', () => {
    const o = outline('{"adp_token":"secret-ish"');
    expect(o).toBe('25 chars, 0 newlines, starts with \'{\', ends with \'"\'');
    expect(o).not.toContain('secret');
  });
});

describe('escapeControlsInStrings', () => {
  it('repairs a saved connection whose key lost its line-break escapes, leaving the rest alone', () => {
    const value = { adp_token: '{enc:a"b}', device_private_key: '-----BEGIN RSA PRIVATE KEY-----\nxyz\n-----END RSA PRIVATE KEY-----', n: 1 };
    const broken = JSON.stringify(value).replace(/\\n/g, '\n');
    expect(() => JSON.parse(broken)).toThrow();
    expect(JSON.parse(escapeControlsInStrings(broken))).toEqual(value);
    const pretty = JSON.stringify(value, null, 2);
    expect(escapeControlsInStrings(pretty)).toBe(pretty);
  });
});
