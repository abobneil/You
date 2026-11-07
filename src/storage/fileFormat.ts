// The .you.json file and the browser copy share one format: an encrypted envelope (version 2).
// Version 1 files (plain JSON from before encryption) can still be loaded; they're encrypted on the next save.
import { isEnvelope, seal, unlock, type Envelope, type Vault } from '../core/crypto';
import { normalize } from '../core/profile';
import type { Profile } from '../core/types';

export const FILE_EXT = '.you.json';

export const encode = (vault: Vault, p: Profile) => seal(vault, JSON.stringify(p));

export type ReadResult = { kind: 'locked'; env: Envelope } | { kind: 'plain'; profile: Profile };

/** Works out what a file contains. Throws if it isn't You data at all. */
export function readText(text: string): ReadResult {
  const data = JSON.parse(text);
  if (isEnvelope(data)) return { kind: 'locked', env: data };
  const raw = data && data.app === 'you' ? data.profile : data;
  if (!raw || typeof raw.name !== 'string' || !raw.name) throw new Error('Not You data');
  return { kind: 'plain', profile: normalize(raw) };
}

/** Unlocks an envelope. Throws WrongPassphrase if the passphrase doesn't fit. */
export async function decode(passphrase: string, env: Envelope): Promise<{ profile: Profile; vault: Vault }> {
  const { plaintext, vault } = await unlock(passphrase, env);
  return { profile: normalize(JSON.parse(plaintext)), vault };
}

/** "Alex Kim" → "alex-kim.you.json" */
export function fileNameFor(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (slug || 'you') + FILE_EXT;
}
