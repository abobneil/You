# Threat model

You protects a local life record: cards, notes, keepsakes and history. Other assets
are the passphrase, the in-memory encryption key, the readable name label, and
Audible device credentials. It has no hosted record account or recovery service.

| Threat / boundary | Mitigation and check |
|---|---|
| Someone reads browser IndexedDB/localStorage or saved record files, including files in a sync folder | Encrypt the record with PBKDF2-SHA-256 and AES-256-GCM. Name labels remain readable. crypto.test.ts and profile.test.ts check encrypted round trips and tampering; manually inspect storage and a saved file. Sync providers can see filenames, sizes and timing. |
| Someone guesses a passphrase or changes an envelope | 600,000 rounds on new records; random salt and IV, authenticated encryption. Bound imported work before deriving a key. crypto.test.ts checks wrong passphrases, tampering and malformed envelopes. Weak passphrases remain guessable offline. |
| Hostile import text runs code in the browser origin | Escape text and attribute quotes, insert names as text, enforce production CSP. dom.test.ts and SECURITY.md sink audit; manually import HTML-like card values and paste rich text into the name. |
| Hostile archives exhaust memory or CPU (decompression bombs) | Treat import files as untrusted. Review before accepting data. Envelope bounds do not bound archive expansion. Streaming expansion is bounded to 200 MB per entry, 500 MB total and 10,000 entries, including nested archives. history-security.test.ts exercises compressible zeros and ordinary archives. |
| Hostile keepsake: SVG with script, HTML renamed .jpg, PDF with JavaScript | Handling: show only validated raster images through img, never HTML/SVG, iframe, object or embed. Other files are downloads with their original bytes. Do not trust a filename or MIME label alone. Manually attach each hostile fixture, inspect the rendered element and verify downloaded bytes; 2026-11-08 adversarial Chromium checks in P.md p8/p9 refused SVG and HTML renamed .jpg; PDFs were downloads, never embedded. Opening a downloaded file in another app crosses this boundary. |
| NHTSA receives a VIN | Ask specific consent before sending only the displayed VIN to vpic.nhtsa.dot.gov. Check src/ui/details.ts and vin.ts; manually decline and inspect network requests. NHTSA sees the VIN and IP address if accepted. |
| Local Audible helper exposes credentials | server/audible runs only on the person's computer, checks origin and local requests, uses OS credential storage or restricted private files. server tests check helper behavior. Explicit connection and sync are required. Amazon receives its normal authentication/library traffic; credentials are not in the record. |
| Static host or updates inject malicious code | CSP limits unexpected sources and framing (headers). Check built HTML and _headers. A malicious same-origin update can read an unlocked record or passphrase; CSP and encryption cannot protect against the code that handles the key. Trust the host and reviewed updates. |
| Compromised OS, browser or extension | Outside this protection. They may read keys, keystrokes and unlocked content. Use a trusted device/browser. No app test can establish their safety. |
| Shoulder-surfing or an unlocked device | Sensitive fields mask by default; lock or leave the app when finished. Manually check masking and lock. Visible unlocked content can be read or photographed. |
| Forgotten passphrase | Unrecoverable. Encourage a password manager and a deliberately chosen private access plan. Manually check passphrase guidance. There is no reset that recovers encrypted content. |
| Browser data erasure, disk loss or sync deletion | Keep separate encrypted backups and test reopening them. profile.test.ts checks file round trips; manually reopen a backup after clearing browser data. Encryption alone does not provide durability. |

Browser origin, browser storage, saved files and their sync apps, import and
keepsake files, NHTSA, the local Audible helper, and the static host are separate
trust boundaries. Deliberately readable exports and downloaded attachments leave
the encrypted record boundary and need protection wherever they are kept.

| npm dependency, static host or service worker update compromise | Commit and review the lockfile, run npm audit, keep dependencies minimal, enforce CSP. The service worker caches only same-origin build files. A malicious trusted build can still read unlocked data. |

Adversarial evidence reviewed 2026-11-08: `You-grading/caps-b88d333/CAP-LOG.md` reports 22 altered envelope variants rejected and 17 script payloads inert in desktop Chromium. `regrade-b88d333/P.md` p4/p4b/p6 covers envelope bounds and tampering, p8/p9 attachments, and helper-tests.txt origin/Host/preflight checks. These are scoped observations, not a security guarantee. Regression files: `src/core/crypto.test.ts`, `src/core/history-security.test.ts`, storage keepsake tests, and server Audible tests. The previously demonstrated archive bomb is addressed by streaming limits; physical Safari and Firefox adversarial testing remains outstanding.
