# You

A place to keep everything about yourself, from every area of life, and look back on it later.

**You never sends data to a server.** There is no login and no backend. Data stays in the browser until the person chooses where to keep it (a file on their device for now; cloud drives through their own sync apps next).

## Getting started

```sh
npm install
npm run dev        # local dev server with live reload
npm test           # unit tests for the card rules, dates and file format
npm run build      # type-check, then build the static site into dist/
npm run preview    # serve the built site locally
```

The built site in `dist/` is plain static files and can be hosted anywhere.

### Development shortcuts

These exist only under `npm run dev` and are left out of `npm run build`.

- **dev** button, bottom-left: **Clear cards** deletes every card and link in the open You and keeps the You and its passphrase. **Reset everything** wipes all You data in this browser except the light/dark choice.
- Add **`?reset`** to the address (for example `http://localhost:5173/?reset`) to reset everything straight away.

## How it's organized

```
index.html            page markup (all screens live here and are shown or hidden)
src/
  main.ts             starts the app and wires the pieces together
  state.ts            the person's data in memory; save() and change notifications
  core/               rules with no screen code (unit tested)
    types.ts          Card, Link, Profile
    areas.ts          the eight areas, their suggested kinds, link labels
    cards.ts          add, replace, end, correct, remove, link, "at the time"
    dates.ts          fuzzy dates: "2009", "2021-03", "2021-03-14"
    profile.ts        validating and upgrading saved data
  storage/            where data is kept
    local.ts          browser storage (guarded)
    idb.ts            IndexedDB, for remembering the chosen file
    fileFormat.ts     the .you.json file
    target.ts         browser / file / download, the status pill
  ui/                 one file per screen or panel
  styles/app.css
brand/                logo files
prototype/            the original single-file design prototype, kept for reference
```

## Encryption

Everything is encrypted with the person's passphrase before it's written anywhere, including the copy kept in the browser. Nothing is stored until a passphrase exists.

- The key comes from PBKDF2-SHA-256 with 600,000 rounds and a random salt, and is used for AES-256-GCM with a fresh random IV on every save. All of it uses the browser's built-in Web Crypto, with no extra libraries.
- The key lives only in memory. Every visit starts at the unlock screen.
- A wrong passphrase fails AES-GCM's integrity check. There is **no recovery**. "Forgot it?" offers to erase this browser's copy and start over; saved files are untouched.
- Files and the browser copy share one format (`version: 2`, see `src/core/crypto.ts`). Unencrypted `version: 1` files and data from before encryption are locked with a new passphrase when opened.

## Several Yous on one browser

Each You has its own passphrase, encrypted copy (`you.vault.<id>`), save location and settings. The list of Yous (`you.index`) keeps only an id and the person's name, so the unlock screen can say "Welcome back, Sam" and offer the others. That name is the only thing stored unencrypted. Switching, adding and locking reload the page, so the previous You's data and key leave memory. A file that belongs to a You already on this browser asks before replacing it. See `src/storage/profiles.ts`.

## Importing

**Bring in your data** (home screen, or **Import…** inside an area) reads exports people already have. Files are parsed in the browser and never uploaded; every import ends in a review list, matches existing cards (filling in missing details instead of duplicating), and tags new cards with their source.

| Source | File | Code |
|---|---|---|
| Contacts | `.vcf` from Google or iCloud, or Android's contact picker; one contact can be marked "This is me" | `src/core/import/vcard.ts` |
| LinkedIn | The "Get a copy of your data" zip, or its CSVs | `linkedin.ts` |
| Driver's license | The PDF417 barcode on the back, from the camera or a photo (AAMVA) | `aamva.ts`, `src/ui/import/scan.ts` |
| Vehicle | VIN typed or read from a barcode photo, then looked up with NHTSA vPIC. **The only network request; it asks first.** | `vin.ts` |
| Health records | C-CDA (XML) or FHIR (JSON/NDJSON) from a patient portal | `health.ts` |
| Books & movies | Goodreads, Letterboxd or IMDb CSV (Letterboxd zip too) | `media.ts` |
| Streaming | Netflix viewing activity, Spotify data (account or extended history), Apple Media Services zip, YouTube Music via Google Takeout (JSON). Plays roll up into one card per show, movie, artist or podcast; a newer export refreshes the counts | `streaming.ts` |
| Audible | `audible.you-import.json` from the local You Audible adapter | `audible.ts` |

The barcode reader (zxing, WebAssembly) and the importers load only when used. Nothing here needs an app registration.

Audible exports are produced by the separate local adapter at `../aapi` (see its README).
Use **Bring in your data → Audible**, or **Interests → Import…**. Audible's reading status,
ownership and saved position appear as separate Book details; an existing Goodreads/manual
Status is preserved. Reimporting a newer snapshot refreshes unchanged imported details by
stable marketplace/ASIN identity, keeps manual edits and records revisions. Older snapshots
are ignored, and missing titles never delete cards. **Owned** means Audible reports
Purchase origin with indefinite listening rights; **Likely owned** has incomplete rights
evidence, and **Subscription** is kept separate.
Audible credentials stay in the adapter's Windows-protected vault and are never imported here.

## Card rules

- Every piece of information is a **card** in one of eight areas, with a **since** date (when it became true) and a **recorded** date (when it was added).
- A new card either **replaces** the current one (the old card moves to history with an end date) or is **added alongside** it.
- Fixing a typo **corrects** the card in place and keeps the old wording.
- **This ended** moves a card to history with nothing replacing it.
- **Remove** is only for cards added by mistake. Removing a mistaken replacement restores the card it replaced.
- **Details**: many kinds have structured details (a Vehicle's Year, Make, Model, VIN, plate…), defined in `src/core/areas.ts`. Details can format as you type, offer quick picks, or be hidden as sensitive. A card's name can build itself from its details until it's typed by hand, and corrected details keep their old value in the card's history.
- **Links** connect cards, with optional labels read from each side ("through" / "provides"). **At the time** is worked out from overlapping dates and never stored.
