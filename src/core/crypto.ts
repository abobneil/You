// Passphrase encryption, using only the browser's built-in Web Crypto.
//   key  = PBKDF2-SHA-256(passphrase, random 16-byte salt, 600,000 rounds) → AES-256-GCM key
//   data = AES-GCM(key, random 12-byte IV, JSON)
// A wrong passphrase fails AES-GCM's built-in integrity check, so no separate "check value" is stored.
// There is no recovery: without the passphrase the data cannot be read by anyone.

export const DEFAULT_ITERATIONS = 600_000;

export interface Envelope {
  app: 'you';
  version: 2;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

/** An unlocked key. Kept in memory only, never stored. */
export interface Vault {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}

export class WrongPassphrase extends Error {
  constructor() { super('That passphrase didn’t work.'); this.name = 'WrongPassphrase'; }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function deriveVault(passphrase: string, salt: Uint8Array, iterations = DEFAULT_ITERATIONS): Promise<Vault> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
  return { key, salt, iterations };
}

/** A brand-new key with a fresh random salt, for a new passphrase. */
export const createVault = (passphrase: string, iterations = DEFAULT_ITERATIONS) =>
  deriveVault(passphrase, crypto.getRandomValues(new Uint8Array(16)), iterations);

/** Encrypts text into an envelope (as a JSON string). Every call uses a new random IV. */
export async function seal(vault: Vault, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vault.key, enc.encode(plaintext)));
  const env: Envelope = {
    app: 'you', version: 2,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: vault.iterations, salt: toB64(vault.salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(data),
  };
  return JSON.stringify(env);
}

export function isEnvelope(x: unknown): x is Envelope {
  const e = x as Envelope;
  return !!e && e.app === 'you' && e.version === 2 && e.kdf?.name === 'PBKDF2' && e.cipher?.name === 'AES-GCM' && typeof e.data === 'string';
}

/** Decrypts with an already-unlocked key (same salt). Throws WrongPassphrase if it doesn't fit. */
export async function openWith(vault: Vault, env: Envelope): Promise<string> {
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.cipher.iv) as BufferSource }, vault.key, fromB64(env.data) as BufferSource);
    return dec.decode(plain);
  } catch {
    throw new WrongPassphrase();
  }
}

/** Unlocks an envelope with a passphrase. Returns the text and the key, so later saves reuse it. */
export async function unlock(passphrase: string, env: Envelope): Promise<{ plaintext: string; vault: Vault }> {
  const vault = await deriveVault(passphrase, fromB64(env.kdf.salt), env.kdf.iterations);
  return { plaintext: await openWith(vault, env), vault };
}
