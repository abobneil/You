# Import contract evidence

Run `npm test` and `npm run build` from the repository root. Fixtures contain invented people, works and clinical terms only. Each input JSON has an adjacent `.expected.json`; the input wrapper specifies the parser and archive transport. Tests build archives with fflate, compare proposal values and accepted cards, verify provenance and precision, replay without changes, and normalize a serialized record. The existing Audible and streaming suites exercise older/newer snapshots; `fixtures.test.ts` also checks manual corrections, deliberate clears, missing cards and international identity collisions. These checks are parser/model evidence, not a claim of physical-device or end-to-end encrypted-file verification.

| Source | Variants supported | Fixture files (all under `fixtures/`; adjacent expected JSON) | Known limits / evidence still needed |
|---|---|---|---|
| Contacts | vCard 3/4, BOM, folding, Unicode, labeled phones/emails, own-contact conversion | `vcard-3.0*`, `vcard-4.0*`, `contacts-same-name*`, `contacts-malformed*`; own-contact conversion in `import.test.ts` | Name-only contacts require explicit review; no automatic identity inferred from names. Birthdays without a year have no timeline date. Additional labeled details are retained in fields. Own-contact fixture file and source UID/REV refresh still needed. |
| LinkedIn | Loose Profile, Positions, Education, Skills; archive; notes before headers | `linkedin-profile*`, `linkedin-positions*`, `linkedin-education*`, `linkedin-skills*`, `linkedin-full-zip*`, `linkedin-malformed*` | Missing Positions disclosed. Untimestamped CSVs fill gaps, rather than refreshing existing accepted values. Unsupported individual rows need fuller omission accounting. |
| Licence | Synthetic AAMVA PDF417 text, US/Canadian date parsing | `aamva*`, `licence-malformed*`; `scan.test.ts` | Camera lifecycle mocked for Cancel, Escape, late permission, success, errors and refusal. Sharp/rotated/blurred image decoding on physical devices is unverified. |
| VIN | Typed import-hub VIN, NHTSA response mapping, incomplete/invalid response and ten-second abort | `vin-response*`, `vin-incomplete*`; fetch/timeout test in `fixtures.test.ts` | Import hub asks about exact VIN and reviews results. Separate `src/ui/details.ts` route is outside this change: its persisted blanket consent and missing VIN in prompt still need correction. Consent UI needs end-to-end tests. |
| Health | C-CDA, FHIR Bundle, NDJSON; four clinical kinds; structured dose/unit and negation | `ccda*`, `fhir-bundle*`, `fhir-ndjson*`, `health-malformed*` | No inferred diagnoses. Unknown status remains Unknown. Unsupported clinical rows and negation need per-reason omission counts. FHIR references without display text are not resolved. |
| Books / films | Goodreads, Letterboxd CSV/archive, IMDb | `goodreads*`, `letterboxd*`, `imdb*`, `book-collisions*`, `media-malformed*` | Source rating scale retained separately from display stars; Goodreads edition identifiers distinguish editions. Archive chooses diary before watched/ratings; does not reconcile separate ratings file. Full per-row skip accounting and refresh snapshots remain. |
| Netflix | Viewing CSV and archive; profile-aware rollups | `netflix*`, `streaming-malformed*`; `streaming.test.ts` | Full profile/trailer/quick-look cases in streaming suite. Snapshot freshness derives from latest play, not export timestamp. |
| Spotify | Account and extended history | `spotify-account*`, `spotify-extended*` | Artists below listening threshold excluded with disclosure; export-format changes require new frozen fixtures. |
| Apple | Media Services archive with nested history zip | `apple-nested*` | One archive nesting level; known daily-track/play-activity columns. |
| YouTube Music | Takeout JSON | `youtube-music*` | Ordinary videos excluded; unknown formats disclosed. |
| Audible | Version 1 US local export and helper library response | `audible-export*`, `audible-sync*`, `audible-malformed*`; `audible.test.ts` | Both routes share the versioned library parser. Stable IDs, title refresh, ownership, completion and position kept separately; manual corrections/clears retained. Live sign-in/provider and ordinary desktop installation are outside these fixtures. |

Review groups New, Updates and Already there; Already there and source notes start collapsed. Field overwrites show old and new values; an application simulation computes selection totals. Source-specific date provenance is explicit for Goodreads; fuller provenance and accurate skipped-row counts remain necessary across every source. The table deliberately separates passing automated fixtures from remaining Appendix B acceptance work.

## Area C regression archive (rubric 1.0)

`fixtures/area-c/` preserves the synthetic inputs from the b88d333 area-C ledger,
including archives, loose CSVs, older/newer exports, BOM/folded vCards,
Unicode, international phones, duplicate titles and negative health statements.
Every input has an adjacent `.expected.json` describing its review/application
contract. `area-c.test.ts` exercises the reported Dune/director corruption,
repeated job stints, blank titles, negative medication and service collisions.
The shared snapshot engine is tested for repeat, explicit older/newer timestamp,
manual edits and deliberate clears for each source namespace.

Snapshot timestamps: import builders accept an explicit `at` for callers with a
known export timestamp. Otherwise they use review/import time. Exports without
creation metadata cannot yet distinguish an older export imported later; this
remains a limitation, and should not be graded as passing the older-export UI
contract. Contacts' self-identity routing remains owned by the concurrent fix.

### Audible helper delivery

Windows builds produce `dist/downloads/you-audible-helper-win.exe` using the
current Node executable, a SEA preparation blob and postject. Node is not needed
on the recipient's Windows computer. The executable is unsigned; release signing
is a separate distribution concern. The zip remains the Node-based fallback.

The helper asks the person to paste the app address shown in the import hub.
Only that exact origin and the legacy local preview origin are allowed; HTTPS
and loopback HTTP are supported. Host validation, custom-header checks and
origin checking remain enforced. `YOU_APP_URL` configures the build default;
at runtime the environment variable bypasses the address prompt. No arbitrary
web origin can pair itself through an HTTP request. After launch, reopen Import
to refresh the helper status, then use Connect for Amazon authorization.

For macOS/Linux, bundle helper.cjs using `npm run build:helper`, create a SEA
config naming helper.cjs and an output blob, run
`node --experimental-sea-config sea.json`, copy that platform's Node binary,
and inject with `npx postject <binary> NODE_SEA_BLOB sea.blob --sentinel-fuse
NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`. On macOS remove the signature
before injection, add `--macho-segment-name NODE_SEA`, then ad-hoc sign the result.
Build on the target OS/architecture; the automated release builder currently
packages the Windows executable only.
