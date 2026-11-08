// Keepsakes: photos and documents attached to cards. The original bytes are encrypted with the You's key,
// each with its own random IV and its id as additional data, so one can't be swapped onto another entry.
// The type comes from the file's own bytes, never its name: an HTML page renamed .jpg is refused.
// Only raster images are ever shown in the page (through <img>, which never runs script);
// everything else is offered back as the original file.
import type { Vault } from './crypto';

export interface Keepsake {
  id: string;
  /** The original file name. */
  name: string;
  /** MIME type detected from the bytes. */
  type: KeepsakeType;
  size: number;
  /** Hex SHA-256 of the original bytes, to prove they come back unchanged. */
  sha256: string;
  /** A description for screen readers. */
  alt?: string;
  addedAt: string;
  /** Removed keepsakes stay in the record as history. */
  removedAt?: string;
  /** The keepsake that took over from this one, when it was replaced. */
  replacedBy?: string;
}

export type KeepsakeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/heic' | 'application/pdf';

/** Per file. Stated in the picker before anyone runs into it. */
export const MAX_KEEPSAKE_BYTES = 25 * 1024 * 1024;
export const LIMIT_TEXT = 'Photos (JPEG, PNG, HEIC, WebP, GIF) and PDFs, up to 25 MB each.';

/** Types the browser can show inline as a picture. HEIC usually can't be shown outside Safari. */
export const isViewableImage = (t: string) => t === 'image/jpeg' || t === 'image/png' || t === 'image/gif' || t === 'image/webp';

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** Works out what a file really is from its first bytes. Returns null for anything not allowed. */
export function sniff(b: Uint8Array): KeepsakeType | null {
  if (b.length < 12) return null;
  if (starts(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(b, 4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(b, 8, 12))) return 'image/heic';
  if (ascii(b, 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export type CheckResult = { ok: true; type: KeepsakeType } | { ok: false; reason: string };

/** Refuses empty and oversized files before their bytes are even read. */
export function checkSize(name: string, size: number): { ok: false; reason: string } | null {
  if (!size) return { ok: false, reason: `“${name}” is empty, so there's nothing to keep.` };
  if (size > MAX_KEEPSAKE_BYTES) return { ok: false, reason: `“${name}” is ${Math.ceil(size / 1048576)} MB. Files can be up to 25 MB.` };
  return null;
}

/** Plain-language verdict on a chosen file, before anything is stored. */
export function checkFile(name: string, bytes: Uint8Array): CheckResult {
  const size = checkSize(name, bytes.length);
  if (size) return size;
  const type = sniff(bytes);
  if (!type) return { ok: false, reason: `“${name}” isn't a photo or PDF You can keep. ${LIMIT_TEXT}` };
  return { ok: true, type };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return Array.from(d, x => x.toString(16).padStart(2, '0')).join('');
}

export interface SealedBytes { iv: Uint8Array; data: Uint8Array }

const aad = (id: string) => new TextEncoder().encode(id);

/** Encrypts a keepsake's bytes. Every call uses a fresh random 96-bit IV. */
export async function sealBytes(vault: Vault, id: string, bytes: Uint8Array): Promise<SealedBytes> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(id) }, vault.key, bytes as BufferSource));
  return { iv, data };
}

/** Decrypts a keepsake. Throws if the bytes, IV or id were altered. */
export async function openBytes(vault: Vault, id: string, s: SealedBytes): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: s.iv as BufferSource, additionalData: aad(id) }, vault.key, s.data as BufferSource));
}

const isKeepsake = (k: any): k is Keepsake => !!k && typeof k.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(k.id) && typeof k.name === 'string'
  && typeof k.type === 'string' && typeof k.size === 'number' && typeof k.sha256 === 'string' && typeof k.addedAt === 'string';

/** Splits saved keepsake entries into well-formed ones and ones that can't be used (kept elsewhere, never dropped). */
export function splitKeepsakes(raw: unknown): { ok: Keepsake[] | undefined; bad: unknown[] } {
  if (raw === undefined || raw === null) return { ok: undefined, bad: [] };
  if (!Array.isArray(raw)) return { ok: undefined, bad: [raw] };
  const ok = raw.filter(isKeepsake);
  return { ok: ok.length ? ok : undefined, bad: raw.filter(k => !isKeepsake(k)) };
}

/** Keeps only well-formed keepsake entries from saved data. */
export const normalizeKeepsakes = (raw: unknown): Keepsake[] | undefined => splitKeepsakes(raw).ok;
