# Lifetime performance implementation and measurements

Reference baseline: `6052041576c9628906dbf9187ff2fa893e629788`, clean checkout before changes. Branch: `t3/optimize-keepsake-lifetime`. Measurements: 8 November 2026, Eastern time, on the same otherwise idle machine in one continuous session.

Windows 11 build 26200, VMware20,1, Intel Xeon Gold 6444Y, 32 GiB RAM; Node 24.16.0, npm 11.13.0; Chrome 157.0.8103.39. Production Vite preview at port 4298. Desktop viewport 1440×900. CPU slowdown 4; online setup uses 200000 bytes/s down, 93750 bytes/s up, 150 ms latency; F5 operations run offline. Five independent browser contexts per metric, fourth sorted result. The original `regrade-b88d333/R-performance-final` harness and frozen keepsake manifest were reused with output paths and port adjusted. CPU profiling was enabled for **both** baseline and candidate saved-file reopen runs. The candidate interaction harness additionally waits for `.cv-actions` so a skeleton cannot count as usable content.

Evidence (outside the checkout): `C:/Users/nchester/Documents/You-grading/lifetime-6052041/`. This contains the adapted scripts, environment, baseline/final raw measurements, CPU profiles, completed downloads, manifest, hash verification and cancellation/storage probes. The final external report records the implementation SHA.

## Implementation

The profile is still encrypted with PBKDF2-SHA-256, 600,000 iterations, and AES-256-GCM. Every keepsake is decrypted and checked against its original-byte SHA-256 and size before promotion. Verification problems still require the existing explicit “Open the rest” choice. No partially checked record replaces existing data.

File parsing, base64 decoding, decryption, hashing and staging run in a bundled worker. Verified ciphertext is staged in bounded batches targeting 32 MiB. IndexedDB stores new ciphertext as immutable Blobs; reads also accept older byte-array rows. This avoids cloning 500 MB of typed arrays during promotion. A separate worker promotes the verified rows in one transaction; a missing staged row aborts the entire transaction, including destination writes and cleanup. Cancellation aborts that transaction. The portable `.you.json` format is unchanged.

The opening panel reports verification progress and offers Cancel. Dismissal terminates verification and cleans up temporary rows. Download creation acknowledges before processing, checks cancellation between output pieces, and its caller waits for completion. Card opening paints a skeleton before rendering usable content. Streaming history parsing runs in a worker; row builders are converted into cloneable proposals and restored for review. Replacing or dismissing a busy panel stops its work.

The native codecs already present on main are retained. A worker pool and a custom streaming base64 parser were unnecessary to achieve the measured limits. The important observed costs were native crypto/decoding and repeated byte copies during IndexedDB promotion. Diagnostic candidates measured 11.42–12.08 s with worker verification and typed-array promotion; moving promotion into a worker yielded a 9.64 s reopen; immutable Blob rows yielded a 6.19 s diagnostic reopen. Those diagnostic samples are not the five-run grading results.

## Verification

Three consecutive default `npm test` runs must pass; no worker-count override is used. The previous chronology wall-clock assertion was replaced with exact results for the complete 10,000-card fixture. New tests cover verified batch staging, cleanup after cancellation and proposal preservation across structured cloning. Build and `check:dist` must pass.

Each of the five completed downloads is reopened and checked against the manifest: 10,000 cards, 1,000 links, 2,000 revisions, 300 keepsakes, 500,000,000 original bytes, every SHA-256 matching. The real IndexedDB worker probe checks rollback on a missing staged row, preservation of the existing destination, Blob promotion and temporary-row cleanup.

Card feedback uses EventTiming for the first card's scripted keydown, rather than automation round-trip time. Usable content uses the completed card selector. Session INP uses the original interaction-ID aggregation, including the prescribed one-worst-per-50-interactions exclusion. Key derivation is included in end-to-end open/reopen totals; the harness also measures a separate unchanged 600,000-round PBKDF2 probe.

Cancellation and acknowledgement probes cover keyboard and emulated touch at 390×844, after service-worker installation and a controlled offline reload. Phone emulation is not physical-iPhone evidence. These are lab results, not field Core Web Vitals or a complete cross-browser regrade. CSP remains `worker-src 'self' blob:`.

## Results (fourth sorted of five, milliseconds)

| Measurement | Baseline | Candidate | Limit | Meets limit |
|---|---:|---:|---:|---|
| F5 open, all bytes | 23476 | 6366 | 10000 | Yes |
| F5 saved-file reopen, all bytes | 25052 | 7332 | 10000 | Yes |
| Completed durable encrypted download | 15676 | 13877 | 60000 | Yes |
| First-card feedback, EventTiming | 256 | 88 | 200 | Yes |
| First-card usable content | 233 | 263 | 500 | Yes |
| Whole scripted session INP | 240 | 144 | 200 | Yes |
| 50,000-event import to review | 493 | 243 | 60000 | Yes |
| Separate PBKDF2 probe | 86.3 | 88.5 | Unchanged 600,000 rounds | Included in end-to-end totals |

One candidate reopen was 10573 ms; the other four were 6030, 6845, 7276 and 7332 ms. The prescribed fourth-sorted result is 7332 ms. No sample was discarded. Card usable time increases by 30 ms while feedback and INP improve; the skeleton is not counted as usable content.

The successful save path was measured again after fixing the fallback caller's missing await. The final subsequent change only marks a cancelled/failed download as pending rather than claiming a download started; its cancellation branch was checked in the following probes.

| Five-run acknowledgement/cancellation probe | Desktop keyboard | Emulated phone touch |
|---|---:|---:|
| Unlock feedback, EventTiming | 24 | 32 |
| Save feedback, EventTiming | 112 | 48 |
| Import acknowledgement, next frame | 22.2 | 28.8 |
| Cancel save, automation round trip | 133 | 146 |
| Cancel F5 checking, automation round trip | 142 | 125 |
| Cancel import, automation round trip | 40 | 84 |

All ten probe sessions allowed navigation after cancelling, removed their temporary staging rows and prevented a late import review. Touch taps bypassed automation's animation-stability wait so the fast import could be cancelled while still running. One desktop save-cancel automation round trip was 240 ms; the five-run fourth-sorted value is 133 ms. This is separate from the EventTiming acknowledgement measurements.

R2a, R2c, R3b and R3d meet the requested limits in the tested Chromium lab journeys. A physical-iPhone check and a complete browser-matrix regrade remain unverified; this implementation report does not claim those broader grading requirements passed.

Final checks: three consecutive default-concurrency `npm test` runs, **483 tests each**, passed. `npm run build` and `npm run check:dist` passed. Five completed downloads passed every original-byte hash and full card/link comparison. No worker-count override, reduced PBKDF2 iteration count or skipped keepsake verification was used.
