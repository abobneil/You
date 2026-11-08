import { cleanLinks } from '../core/relations';
// The .you.json file. docs/FORMAT.md is the contract; this module writes and reads it.
//   version 1 – plain JSON from before encryption (read only; encrypted on the next save)
//   version 2 – one encrypted envelope; also the browser copy's format
//   version 3 – the envelope plus a `keepsakes` array, written one keepsake per line so a big file can be
//               written and read in pieces without ever becoming one giant string.
import { fromB64, isEnvelope, validateEnvelope, seal, sealEnvelope, toB64, unlock, type Envelope, type Vault } from '../core/crypto';
import { keepsakeIds } from '../core/cards';
import type { SealedBytes } from '../core/keepsakes';
import { normalize } from '../core/profile';
import type { Profile } from '../core/types';
import { MAX_SEALED_B64 } from './keepsakeStore';

export const FILE_EXT = '.you.json';
/** Files larger than this are read line by line instead of with one JSON.parse. */
export const STREAM_THRESHOLD = 50 * 1024 * 1024;
/** No single line may be longer than this (the record itself, or one keepsake). */
const MAX_LINE = 128 * 1024 * 1024;
const KNOWN_VERSIONS = [1, 2, 3];

/** The browser copy: the record alone, as a version 2 envelope. Its keepsakes live in their own rows. */
export const encode = (vault: Vault, p: Profile) => seal(vault, JSON.stringify(p));

export class UnsupportedVersion extends Error {
  constructor(public version: unknown) {
    super(`This file was made by a newer version of You (format ${String(version)}), so it can't be opened here. Nothing was changed.`);
    this.name = 'UnsupportedVersion';
  }
}
export class DamagedFile extends Error {
  constructor(detail = '') {
    super(`This file is damaged or incomplete${detail ? ` (${detail})` : ''}. Nothing was changed.`);
    this.name = 'DamagedFile';
  }
}

/** The envelope's encryption details are out of bounds or malformed. Caught before any passphrase is asked for. */
export class NotAYouFile extends DamagedFile {
  constructor() {
    super();
    this.message = 'This file is damaged or not a You file. Nothing was changed.';
    this.name = 'NotAYouFile';
  }
}

/** One entry of a version 3 file's `keepsakes` array, still base64. */
export interface RawKeepsake { id: string; iv: string; data: string }

export type ReadResult =
  | { kind: 'locked'; env: Envelope; /** The file's keepsake entries, read on demand (in pieces for big files). */ keepsakes: () => AsyncIterable<RawKeepsake> }
  | { kind: 'plain'; profile: Profile };

const noKeepsakes = async function* (): AsyncGenerator<RawKeepsake> { /* none */ };

function classify(data: any, keepsakes: () => AsyncIterable<RawKeepsake>): ReadResult {
  if (data && data.app === 'you' && 'version' in data && !KNOWN_VERSIONS.includes(data.version)) throw new UnsupportedVersion(data.version);
  if (isEnvelope(data)) {
    const { version, kdf, cipher, data: d } = data;
    // Bounds-check the encryption details now, before anyone types a passphrase or any key is derived.
    try { validateEnvelope({ app: 'you', version, kdf, cipher, data: d }); } catch { throw new NotAYouFile(); }
    return { kind: 'locked', env: { app: 'you', version, kdf, cipher, data: d }, keepsakes: version === 3 ? keepsakes : noKeepsakes };
  }
  if (data && data.app === 'you' && (data.version === 2 || data.version === 3)) throw new DamagedFile('its encryption details are missing');
  const raw = data && data.app === 'you' ? data.profile : data;
  if (!raw || typeof raw.name !== 'string' || !raw.name) throw new Error('Not You data');
  return { kind: 'plain', profile: cleanLinks(normalize(raw)) };
}

/** Works out what a file contains. Throws if it isn't You data, or is a version this app doesn't know. */
export function readText(text: string): ReadResult {
  const data = JSON.parse(text);
  if (data && data.version === 3 && isEnvelope(data) && !Array.isArray((data as any).keepsakes)) throw new DamagedFile('its keepsakes are missing');
  const list: RawKeepsake[] = Array.isArray(data?.keepsakes) ? data.keepsakes : [];
  return classify(data, async function* () { yield* list; });
}

/** Reads a chosen file. Small files are parsed whole; big ones line by line, so they never become one string. */
export async function readFile(file: Blob, threshold = STREAM_THRESHOLD, signal?: AbortSignal): Promise<ReadResult> {
  signal?.throwIfAborted();
  if (file.size <= threshold) {
    const text = await file.text();
    signal?.throwIfAborted();
    return readText(text);
  }
  let head = '';
  let found = false;
  for await (const line of lines(file, signal)) {
    if (line.trim() === '"keepsakes":[') { found = true; break; }
    head += line + '\n';
    if (head.length > MAX_LINE) throw new DamagedFile('it is laid out in a way You can’t read in pieces');
  }
  if (!found) return readText(head);
  let data: any;
  try { data = JSON.parse(head + '"keepsakes":[]}'); } catch { throw new DamagedFile('its first lines can’t be read'); }
  return classify(data, () => streamKeepsakes(file, signal));
}

/** Splits a file into lines without holding more than one line in memory. */
export async function* lines(file: Blob, signal?: AbortSignal): AsyncGenerator<string> {
  // File streams can deliver 64 KiB chunks. Decode larger pieces to avoid thousands
  // of stream/decoder promises for a lifetime record, while bounding memory.
  const decoder = new TextDecoder();
  let parts: string[] = [];
  let size = 0;
  try {
    for (let offset = 0; offset < file.size; offset += 4 * 1024 * 1024) {
      signal?.throwIfAborted();
      const end = Math.min(file.size, offset + 4 * 1024 * 1024);
      const value = decoder.decode(await file.slice(offset, end).arrayBuffer(), { stream: end < file.size });
      signal?.throwIfAborted();
      let start = 0, i: number;
      while ((i = value.indexOf('\n', start)) !== -1) {
        signal?.throwIfAborted();
        parts.push(value.slice(start, i));
        yield parts.join('');
        parts = []; size = 0; start = i + 1;
      }
      if (start < value.length) {
        parts.push(value.slice(start));
        size += value.length - start;
        if (size > MAX_LINE) throw new DamagedFile('one of its lines is far too long');
      }
    }
    if (parts.length) yield parts.join('');
  } finally {
    // No stream reader to retain when the consumer stops after the header.
  }
}

async function* streamKeepsakes(file: Blob, signal?: AbortSignal): AsyncGenerator<RawKeepsake> {
  let inside = false, ended = false;
  for await (const raw of lines(file, signal)) {
    const line = raw.trim();
    if (!inside) { if (line === '"keepsakes":[') inside = true; continue; }
    if (ended) { if (line) throw new DamagedFile('there is extra text after the end'); continue; }
    if (line === ']}') { ended = true; continue; }
    if (!line) continue;
    try { yield JSON.parse(line.endsWith(',') ? line.slice(0, -1) : line); }
    catch (e) { if (e instanceof SyntaxError) throw new DamagedFile('a keepsake can’t be read'); throw e; }
  }
  if (!ended) throw new DamagedFile('it ends too early');
}

/** Checks one keepsake entry's shape before any decryption, and turns it back into bytes. */
export function checkRawKeepsake(k: unknown): { id: string; sealed: SealedBytes } {
  const r = k as RawKeepsake;
  if (!r || typeof r.id !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(r.id)) throw new DamagedFile('a keepsake has a bad id');
  if (typeof r.iv !== 'string' || typeof r.data !== 'string' || r.data.length > MAX_SEALED_B64) throw new DamagedFile('a keepsake is malformed');
  let iv: Uint8Array, data: Uint8Array;
  try { iv = fromB64(r.iv); data = fromB64(r.data); } catch { throw new DamagedFile('a keepsake is malformed'); }
  if (iv.length !== 12) throw new DamagedFile('a keepsake has a bad IV');
  if (data.length < 16) throw new DamagedFile('a keepsake is too short');
  return { id: r.id, sealed: { iv, data } };
}

/** Bytes per base64 piece when writing; a multiple of 3 so the pieces join into valid base64. */
const B64_CHUNK = 3 * 1024 * 1024;

/**
 * The file, as a series of pieces to write one after another. Without keepsakes it is a version 2
 * envelope; with them, version 3 with one keepsake per line (rows without bytes in this browser are left out).
 */
export async function* encodeFile(vault: Vault, p: Profile, getSealed: (id: string) => Promise<SealedBytes | null>): AsyncGenerator<string> {
  const ids = [...keepsakeIds(p)];
  if (!ids.length) { yield await encode(vault, p); return; }
  const env = await sealEnvelope(vault, JSON.stringify(p));
  yield `{"app":"you","version":3,\n "kdf":${JSON.stringify(env.kdf)},\n "cipher":${JSON.stringify(env.cipher)},\n "data":"`;
  yield env.data;
  yield '",\n "keepsakes":[\n';
  let first = true;
  for (const id of ids) {
    const s = await getSealed(id);
    if (!s) continue;
    yield `${first ? '' : ',\n'}{"id":${JSON.stringify(id)},"iv":"${toB64(s.iv)}","data":"`;
    for (let i = 0; i < s.data.length; i += B64_CHUNK) yield toB64(s.data.subarray(i, i + B64_CHUNK));
    yield '"}';
    first = false;
  }
  yield '\n]}\n';
}

/** The whole file as a Blob built from parts (for download and share). */
export async function encodeBlob(vault: Vault, p: Profile, getSealed: (id: string) => Promise<SealedBytes | null>, signal?: AbortSignal): Promise<Blob> {
  const parts: Blob[] = [];
  for await (const part of encodeFile(vault, p, getSealed)) {
    signal?.throwIfAborted();
    parts.push(new Blob([part]));
  }
  signal?.throwIfAborted();
  return new Blob(parts, { type: 'application/json' });
}

/** Unlocks an envelope. Throws WrongPassphrase if the passphrase doesn't fit. */
export async function decode(passphrase: string, env: Envelope): Promise<{ profile: Profile; vault: Vault }> {
  const { plaintext, vault } = await unlock(passphrase, env);
  return { profile: cleanLinks(normalize(JSON.parse(plaintext))), vault };
}

/** "Alex Kim" → "alex-kim.you.json" */
export function fileNameFor(name: string, occupied: string[] = []): string {
  const slug = name.trim().normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  const base = slug || 'you';
  let candidate = base + FILE_EXT, n = 2;
  while (occupied.includes(candidate)) candidate = `${base}-${n++}${FILE_EXT}`;
  return candidate;
}
