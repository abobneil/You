Import refresh implementation

Branch: t3/fix-import-snapshot-review.

Validation: shared invariant covers 12 source keys and all 120 permutations of repeat, older, newer, manual edit and deliberate clear. Every nonempty accepted field value remains current or in revisions; snapshot time never decreases. The cap archive regression checks accepted end precision, history status, older replay, and title rename. Expected outcomes: src/core/import/fixtures/area-c/refresh.expected.json.

Per-source variant baseline (all Appendix B rows). These browser grades are historical, not a new certification. Matching/lifecycle/snapshot fixes have automated coverage; physical phone and live Amazon remain unverified. Full browser replay and every failing synthetic case are not completed in this implementation.


Each row includes review/apply and decrypted export/fresh reopen unless stated. Common repeat/replay observations apply to the source variants that use that parser.

| Source / variant | Result | Observation |
|---|---|---|
| Contacts vCard 3 | F | BOM/folding, labels, Unicode, country and selective apply P; repeat-self P; newer work phone P; manual address/phone clear P; older phone rollback F. |
| Contacts vCard 4 / This is me | P | About/Home/Work facts, labels and reusable self choice preserved; self-repeat no duplicate. |
| Contacts names/international phones | P | Similar names and +44/+1 remain distinct. |
| Contacts malformed/credentials | P | Rejected without changing digest. |
| LinkedIn full archive | F | 10 accepted rows retained including second stint; title rename creates new current job; end refresh fails. |
| LinkedIn loose CSVs | F | Proper loose filenames parse all 10; same refresh engine/lifecycle defect. Earlier li- prefixed attempt was not a valid loose-format test and is superseded. |
| LinkedIn no Positions/malformed | P | Missing export explained; no unreviewed writes. |
| Licence sharp/90° photo | P | Name, birth date, masked number/address reviewed locally. |
| Licence blur/12° tilt/wrong QR | P | Safe retry guidance; tilt remains a decoding limitation. |
| Licence camera grant/cancel/refusal | P | Fake-device camera reads synthetic barcode; stops on dismissal; refusal gives alternative. Real phone camera not verified. |
| VIN typed | P | Consent names NHTSA and exact VIN; decline/invalid no request; fixture, incomplete and timeout safe. |
| VIN barcode photo | P | Barcode fills VIN and asks before each lookup. |
| Health C-CDA | F | Ordinary doses/units/dates P; negations/unsupported section excluded without disclosure. |
| Health FHIR Bundle | F | Not-taken no longer becomes current Warfarin; unknown remains unknown. Skip disclosure and lifecycle refresh F. |
| Health NDJSON | F | Same parser and safe exclusion; missing disclosure F. |
| Goodreads CSV | F | Editions/authors, source scale and new rating/status refresh P; older export rollback F. |
| Letterboxd diary CSV | P | Dune 1984 and 2021 distinct; original watch dates and ratings kept. |
| Letterboxd archive zip | P | Diary plus watched/ratings includes Paddington 2. |
| IMDb ratings CSV | P | Correct creator added to corresponding film/year; repeat no duplicate. |
| Netflix viewing CSV | P | Show/movie rollups and first/latest date correct. |
| Netflix multi-profile archive | P | Profile selection explained; trailer/short play disclosures; no double counting. |
| Spotify account zip | P | 6 plays, 20 min and dates; short play disclosed. |
| Spotify extended zip | P | Fable Band 8 plays, 28 min; short play disclosed. |
| Apple nested Media Services zip | P | Own service card, 8 plays, 40 min, first 2020-03-04; video disclosed. |
| YouTube Music Takeout | P | Own service card, 6 plays, first 2022-05-01; ordinary video disclosed. |
| Audible local v1 export | P | Stable ASINs; rename, missing item, ownership and manual edits/clear retained. |
| Audible mocked sync response | P | Both fixture snapshots through app Sync button; provider errors expose file fallback. |
| Audible older/repeat/newer | P | Older ignored; repeats do not duplicate; newer revises unedited fields. |
| Audible malformed/version/credential input | P | Rejected, saved digest unchanged. |
| Windows helper exe, no Node | P | Pasted origin pairing works, 200 exact origin / 403 other origin, isolated empty store. |
| Live Amazon sign-in/sync | U | No dedicated account. Resolve with test-account sign-in, provider library sync and fallback checks. |

