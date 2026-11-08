// Passphrase encryption, using only the browser's built-in Web Crypto.
//   key  = PBKDF2-SHA-256(passphrase, random 16-byte salt, 600,000 rounds) → AES-256-GCM key
//   data = AES-GCM(key, random 12-byte IV, JSON)
// A wrong passphrase fails AES-GCM's built-in integrity check, so no separate "check value" is stored.
// There is no recovery: without the passphrase the data cannot be read by anyone.

export const DEFAULT_ITERATIONS = 600_000;

export interface Envelope {
  app: 'you';
  /** 2: the record alone. 3: a file that also carries keepsakes (see docs/FORMAT.md). */
  version: 2 | 3;
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

// Native codecs avoid a second, binary-string copy of large attachments.
// Keep the fallback chunks divisible by three so padding only occurs at the end.
type Base64Array = Uint8Array & { toBase64?: () => string };
type Base64Constructor = typeof Uint8Array & { fromBase64?: (text: string) => Uint8Array };
export function toB64(bytes: Uint8Array): string {
  const native = (bytes as Base64Array).toBase64;
  if (native) return native.call(bytes);
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 24576) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 24576))));
  }
  return parts.join('');
}
export function fromB64(b64: string): Uint8Array {
  const native = (Uint8Array as Base64Constructor).fromBase64;
  if (native) return native.call(Uint8Array, b64);
  // atob retains its whitespace, padding and malformed-input validation semantics.
  const text = b64.replace(/[\t\n\f\r ]/g, '');
  const padding = text.indexOf('=');
  if (padding !== -1 && (padding < text.length - 2 || text.length % 4 !== 0
    || (padding === text.length - 2 && text[padding + 1] !== '='))) {
    throw new DOMException('Invalid base64 padding', 'InvalidCharacterError');
  }
  const out = new Uint8Array(Math.ceil(text.length / 4) * 3);
  let offset = 0;
  for (let i = 0; i < text.length; i += 32768) {
    const part = atob(text.slice(i, i + 32768));
    for (let j = 0; j < part.length; j++) out[offset++] = part.charCodeAt(j);
  }
  return out.subarray(0, offset);
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
export const seal = async (vault: Vault, plaintext: string): Promise<string> => JSON.stringify(await sealEnvelope(vault, plaintext));

/** Encrypts text into an envelope object. Every call uses a new random IV. */
export async function sealEnvelope(vault: Vault, plaintext: string): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vault.key, enc.encode(plaintext)));
  const env: Envelope = {
    app: 'you', version: 2,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: vault.iterations, salt: toB64(vault.salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(data),
  };
  return env;
}

export function isEnvelope(x: unknown): x is Envelope {
  const e = x as Envelope;
  return !!e && e.app === 'you' && (e.version === 2 || e.version === 3) && e.kdf?.name === 'PBKDF2' && e.cipher?.name === 'AES-GCM' && typeof e.data === 'string';
}

/** Limit hostile envelopes before key derivation or base64 allocation (192 MiB ciphertext). */
export const MAX_ENVELOPE_DATA_LENGTH = 256 * 1024 * 1024;
export function validateEnvelope(env: Envelope): void {
  const bad = () => { throw new Error('Invalid encrypted record: malformed envelope. Existing data is unchanged.'); };
  if (!isEnvelope(env) || env.kdf.hash !== 'SHA-256'
    || !Number.isInteger(env.kdf.iterations) || env.kdf.iterations < 100_000 || env.kdf.iterations > 10_000_000) bad();
  const base64 = (x: unknown, max: number): x is string => typeof x === 'string' && x.length > 0 && x.length <= max
    && x.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(x);
  if (!base64(env.kdf.salt, 24) || !base64(env.cipher.iv, 16) || !base64(env.data, MAX_ENVELOPE_DATA_LENGTH)) bad();
  if (fromB64(env.kdf.salt).length !== 16 || fromB64(env.cipher.iv).length !== 12 || env.data.length < 24) bad();
}

/** Decrypts with an already-unlocked key (same salt). Throws WrongPassphrase if it doesn't fit. */
export async function openWith(vault: Vault, env: Envelope): Promise<string> {
  validateEnvelope(env);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.cipher.iv) as BufferSource }, vault.key, fromB64(env.data) as BufferSource);
    return dec.decode(plain);
  } catch {
    throw new WrongPassphrase();
  }
}

/** Unlocks an envelope with a passphrase. Returns the text and the key, so later saves reuse it. */
export async function unlock(passphrase: string, env: Envelope): Promise<{ plaintext: string; vault: Vault }> {
  validateEnvelope(env);
  const vault = await deriveVault(passphrase, fromB64(env.kdf.salt), env.kdf.iterations);
  return { plaintext: await openWith(vault, env), vault };
}
