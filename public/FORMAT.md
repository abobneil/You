# The You record file (`<name>.you.json`)

This document lets a technical helper read a You record **without the You app**, using only the
passphrase and standard tools. It is the contract the app writes and reads.

## Versions

| Version | Status | Shape |
|---|---|---|
| 1 | legacy, read-only | Plain JSON `{ app: 'you', version: 1, savedAt, profile }` (unencrypted, from before encryption). Opened and re-saved as the current version. |
| 2 | read and written when no card has a keepsake | One encrypted envelope (below), no keepsakes. |
| 3 | written once any card has a keepsake (removed ones included) | Envelope plus a `keepsakes` array of separately encrypted files. |

A reader must reject versions it doesn't know rather than guess. The app never overwrites a file it
can't fully read.

The app's own browser copy (IndexedDB database `you-data`) is not a file: its `records` store holds
the record as a version 2 envelope, and its `keepsakes` store holds each keepsake's encrypted bytes as
`{ iv, data }` raw bytes under the key `<you id>/<keepsake id>`, encrypted exactly as in a version 3
file. Keepsake bytes are written before the record that mentions them.

**Earlier versions.** Whenever something replaces a You's browser copy wholesale (opening a file in its
place, or restoring an earlier version), the copy being replaced is first kept in the same `records`
store under `archive/<you id>/<ISO time>-<random>`, as JSON `{ at, reason, envelope }` where `envelope`
is the replaced record exactly as stored (still encrypted). Photo rows are never deleted by a replace,
so an earlier version's photos are still in the `keepsakes` store when it's restored. If an opened file brings
the same photo encrypted with a different key, the stored row is kept beside it as `<You id>/<photo id>~<time>`
rather than overwritten; whichever copy the current key opens is used. Menu → Earlier
versions lists and restores them; removing the You from the browser removes them.

**Unreadable-copy files.** When a browser copy can't be read (or unlocked) and is replaced, You first
saves it as a file shaped `{ "app": "you", "unreadableBrowserCopy": true, "record": "<the stored
envelope text, unchanged>", "keepsakes": [ { "id", "iv", "data" }, … ] }` with one keepsake per line,
each encrypted exactly as in a version 3 file. You recognises this file and explains it rather than
opening it; a helper with the passphrase can decrypt `record` (if it isn't damaged) and each keepsake
as described below. An `id` of the form `<photo id>~<time>` is a set-aside copy of that photo (see
above); try each copy of a photo and use the one the key opens.

## Envelope (versions 2 and 3)

The file is UTF-8 JSON. Version 3 is written one keepsake per line so it can be read in pieces, but
it is also a single valid JSON document: `json.load` in Python reads it whole. The app writes exactly
the line layout below (the `"keepsakes":[` line on its own, then one entry per line, then `]}`) and
reads files over 50 MB line by line on that layout; smaller files are parsed whole, so any valid JSON
layout opens.

```json
{"app":"you","version":3,
 "kdf":{"name":"PBKDF2","hash":"SHA-256","iterations":600000,"salt":"<base64, 16 bytes>"},
 "cipher":{"name":"AES-GCM","iv":"<base64, 12 bytes>"},
 "data":"<base64 ciphertext of the record JSON>",
 "keepsakes":[
{"id":"<uuid>","iv":"<base64, 12 bytes>","data":"<base64 ciphertext of the original file bytes>"},
{"id":"<uuid>","iv":"...","data":"..."}
]}
```

- **Key:** `PBKDF2-HMAC-SHA-256(passphrase normalized to Unicode NFC, salt, iterations)` → 32 bytes,
  used as an AES-256-GCM key. One key per You; the salt is random per You.
- **Record:** `AES-256-GCM(key, iv, UTF-8 JSON of the record)`; `data` is ciphertext followed by the
  16-byte tag (Web Crypto layout). No additional authenticated data.
- **Keepsakes:** each is `AES-256-GCM(key, its own random iv, original file bytes)` with additional
  authenticated data = the UTF-8 bytes of its `id`, so a keepsake can't be swapped onto another entry.
- Every save of the record uses a fresh random IV. A keepsake keeps the IV it was sealed with when it
  was attached; a replaced file is a new keepsake with a new id and a new IV.
- Keepsakes belong to cards, or to a kept unfinished card in the record's `drafts` (`drafts[].data.keepsakes`,
  same metadata shape), which is written the same way so it can be finished on another device.
- When writing over an existing save file, a keepsake the record lists but this browser doesn't have
  stops the write (the file is left as it was), except ones that were already unreadable when that
  record was opened. A new copy simply leaves missing ones out.
- Only keepsakes whose bytes are present are written. An entry whose id no card (or kept draft) mentions, a repeated
  id or an IV that isn't 12 bytes makes the file unreadable; a keepsake that fails to decrypt, whose
  SHA-256 doesn't match its card's metadata, or that is missing is reported by name before anything
  is replaced.
- Limits a reader should enforce before work: iterations between 100,000 and 10,000,000; salt 16
  bytes; IVs 12 bytes.

## The record (decrypted `data`)

```ts
{
  id: string;            // stable id of this You
  name: string;
  updatedAt: string;     // ISO timestamp of the last change
  cards: Card[];
  links: Link[];
}
Card = {
  id: string;            // stable uuid
  area: 'about'|'health'|'work'|'money'|'home'|'people'|'interests'|'goals';
  kind: string;          // "Address", "Job", or a custom kind the person named
  value: string;         // the main value, as shown
  tag?: string;          // a sub-type, e.g. a phone's "cell"
  fields?: { [detailId: string]: string };   // structured details
  note?: string;         // the person's own words, multi-line
  since: string;         // when it became true: "" (unknown), "YYYY", "YYYY-MM" or "YYYY-MM-DD"
  until?: string;        // when it stopped being true, same precision rules
  status: 'active'|'past';
  recordedAt: string;    // ISO timestamp of when it was entered (NOT a life date)
  replaces?: string;     // card id this one took over from
  replacedBy?: string;   // card id that took over from this one
  source?: { from: string; at: string };     // where an imported card came from, and when
  imports?: { [source: string]: { id: string; at: string; fields: {[k: string]: string} } };
  revisions: { field?: string; value: string; at: string }[];  // earlier wording; field absent = main value, 'note' = note,
                                                                 // 'keepsake:<id>:alt' = a keepsake's earlier description
  keepsakes?: Keepsake[];
}
Keepsake = {
  id: string;            // matches an entry in the file's keepsakes array
  name: string;          // original file name
  type: string;          // MIME type detected from the file's bytes
  size: number;          // bytes
  sha256: string;        // hex digest of the original bytes
  alt?: string;          // description for screen readers
  addedAt: string;
  removedAt?: string;    // removed keepsakes stay in the file as history
  replacedBy?: string;   // id of the keepsake that replaced this one
}
Link = { id: string; a: string; b: string; fwd: string; back: string }  // fwd reads from a, back from b
```

Dates are life dates with the precision the person gave. `"2007"` means "some time in 2007", never
1 January. `recordedAt` is when it was typed and must never be read as a life date.

## Reading a file with standard tools

```python
# pip install cryptography
import json, base64, hashlib, getpass, unicodedata
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

f = json.load(open('alex-kim.you.json', encoding='utf-8'))
assert f['app'] == 'you' and f['version'] in (2, 3)
pw = unicodedata.normalize('NFC', getpass.getpass()).encode()
key = hashlib.pbkdf2_hmac('sha256', pw, base64.b64decode(f['kdf']['salt']), f['kdf']['iterations'], 32)
aes = AESGCM(key)
record = json.loads(aes.decrypt(base64.b64decode(f['cipher']['iv']), base64.b64decode(f['data']), None))
print(record['name'], len(record['cards']), 'cards')
for k in f.get('keepsakes', []):
    raw = aes.decrypt(base64.b64decode(k['iv']), base64.b64decode(k['data']), k['id'].encode())
    meta = next(m for c in record['cards'] for m in c.get('keepsakes', []) if m['id'] == k['id'])
    open(meta['name'], 'wb').write(raw)
```

## Readable export

A deliberately chosen plaintext copy is a ZIP named `<name> <period> (readable).zip`.
It contains a printable, script-free `index.html`, original keepsake bytes under
`files/<card-value-slug>-<ordinal>/<original-name>` (unsafe path characters are replaced),
and UTF-8 `record.json`. Files with duplicate names receive an ordinal prefix.

The JSON shape is `{format:"you-readable", version:1, name, period:{label,from,to},
sensitiveIncluded, filesIncluded, cards, links}`. Null period bounds mean Everything;
`unknown` means cards without a start date. Cards retain the inner card format,
including exact date strings, notes, revisions and provenance, and add `overlap`
(`definite` or `possible`), `readableLinks` (other card ID, kind, value and label read
from this card's side), and a nullable relative `path` on each keepsake. Only links
whose two endpoints are in the period appear in the top-level links array.
Removed keepsakes remain included as history. Excluded files have null paths.
Sensitive values, details, revisions and source snapshots are masked unless expressly
included; this copy is not a lossless backup. The normal encrypted record remains
the backup format. No passphrase or encryption keys are included.

## Preservation and concurrent writers

Unknown record fields are retained. Cards that cannot be interpreted are retained verbatim in the
encrypted `unreadable` array and counted in the who menu. Other entries that can't be used are kept
there too, wrapped with where they came from: `{ "from": "note" | "revisions" | "keepsakes", "card": <card id>, "value": … }`
and `{ "from": "kinds" | "links", "value": … }`. Nothing is dropped on load or save.

An optional `drafts` array holds unfinished cards kept when the screen locked by itself
(`{ "id", "kind": "card", "at", "data" }`); You offers each back after unlocking. Legacy plaintext files are opened into the
browser; automatic writing back into their original file is never enabled. Choose a new save place
explicitly to create an encrypted file.

The encrypted record may contain a technical `rev` counter. Browser writers remember the exact
encrypted envelope they decrypted (read again at unlock time) and compare it under a per-You Web Lock
before replacing it (if another tab saved since, nothing is overwritten), and announce changes on the `you`
BroadcastChannel. File writers serialize snapshots and check modification time, size and SHA-256
before opening an atomic swap-file writer. A download is reported as started, not verified durable.

Combined records retain conflicting wording as revisions and complete input snapshots in the
preservation bucket, including unknown properties. Attachments must be checked before combining.
