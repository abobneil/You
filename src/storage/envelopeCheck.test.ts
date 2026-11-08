// P4b: malformed envelopes are refused as soon as the file is read, before a passphrase is asked for.
import { describe, expect, it } from 'vitest';
import { createVault } from '../core/crypto';
import { emptyProfile } from '../core/profile';
import { encode, NotAYouFile, readText } from './fileFormat';

describe('envelope checks on read', async () => {
  const vault = await createVault('synthetic grading sentence one', 100_000);
  const good = JSON.parse(await encode(vault, { ...emptyProfile(), name: 'A', id: 'a' }));
  const variants: Record<string, (e: any) => void> = {
    iterHuge: e => { e.kdf.iterations = 2_000_000_000; },
    iterTiny: e => { e.kdf.iterations = 1; },
    iterString: e => { e.kdf.iterations = '600000'; },
    sha1: e => { e.kdf.hash = 'SHA-1'; },
    shortSalt: e => { e.kdf.salt = 'AAAAAAAAAAA='; },
    longIv: e => { e.cipher.iv = 'AAAAAAAAAAAAAAAAAAAAAA=='; },
  };
  it('accepts a good envelope', () => { expect(readText(JSON.stringify(good)).kind).toBe('locked'); });
  for (const [name, change] of Object.entries(variants)) {
    it(`refuses ${name} with a plain message`, () => {
      const e = structuredClone(good); change(e);
      expect(() => readText(JSON.stringify(e))).toThrow(NotAYouFile);
      expect(() => readText(JSON.stringify(e))).toThrow('This file is damaged or not a You file. Nothing was changed.');
    });
  }
});
