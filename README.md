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
- The file format is documented in [docs/FORMAT.md](docs/FORMAT.md), with a short Python script that reads a file without the app. A record with no keepsakes is saved as `version: 2` (one encrypted envelope); once a card has a photo or document attached, the file is `version: 3`, which adds a `keepsakes` array with each file encrypted separately, one per line, so large files are written and read in pieces (`src/storage/fileFormat.ts`). Opening a file checks every keepsake's SHA-256 before anything in the browser changes, and unknown versions are refused. In the browser, the record stays a `version: 2` envelope and each keepsake's encrypted bytes sit in their own IndexedDB row. Unencrypted `version: 1` files and data from before encryption are locked with a new passphrase when opened.

## Several Yous on one browser

Each You has its own passphrase, encrypted copy (IndexedDB `you-data`, keyed by You id), save location and settings. The list of Yous (`you.index`) keeps only an id and the person's name, so the unlock screen can say "Welcome back, Sam" and offer the others. That name is the only thing stored unencrypted. Switching, adding and locking reload the page, so the previous You's data and key leave memory. A file that belongs to a You already on this browser asks before replacing it. See `src/storage/profiles.ts`.

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
| Audible | Connected straight from You while it runs on your computer, or a file from `npm run audible -- export` | `audible.ts`, `server/audible/` |

The barcode reader (zxing, WebAssembly) and the importers load only when used. Nothing here needs an app registration.

### Audible

Audible has no public API, so You connects the way the Audible iPhone app does: sign in to Amazon on Amazon's own page, then register this computer as an Audible device. Requests are signed with the device key Amazon issues. The code is in `server/audible/` (TypeScript, Node) and runs only on your computer:

- **In the app** (`npm run dev` or `npm run preview`): **Import… → Audible → Connect Audible**, then **Sync from Audible** whenever you like. The page talks to local endpoints under `/__you/audible/`, which refuse anything that isn't a same-origin request from You on `localhost`. A published copy of You is static files, has no such endpoints, and offers the file import instead.
- **From a terminal:** `npm run audible -- connect`, `npm run audible -- export` (writes `exports/audible.you-import.json`, which git ignores), `npm run audible -- status`, `npm run audible -- disconnect`. Add `--active-only` to leave out returned titles.

The connection is kept on the computer running You, in the best place available. It's never part of your You data, the repository, or any output:

| System | Where | Protection |
|---|---|---|
| Windows | `%LOCALAPPDATA%\YouAudible` | Windows DPAPI: only your Windows account can read it |
| Linux desktop | The system keyring (GNOME Keyring, KWallet…) via `secret-tool` | Unlocked when you log in |
| Linux server, macOS, anything else | `~/.config/you-audible` (or `$XDG_CONFIG_HOME`) | Folder `0700`, file `0600`, like SSH keys. Set `YOU_AUDIBLE_PASSPHRASE` to also encrypt it (scrypt + AES-256-GCM) |

`YOU_AUDIBLE_STORE=file` forces the private file. Only read-only library and saved-position requests are made. If the normal route to `api.audible.com` fails to connect, requests go through the CloudFront address Audible's DNS publishes, with the original Host header and normal certificate checks. Only the US store is supported. Tested on Windows 11 and on Linux (Debian, Node 24), including a live export.

Audible's reading status, ownership and saved position appear as separate Book details, and an existing Goodreads or manual Status is kept. Syncing again refreshes imported details that you haven't changed, records the old values in the card's history, and flags nothing when nothing changed. Missing titles never delete cards. **Owned** means Audible reports a purchase with indefinite listening rights; **Likely owned** has incomplete rights evidence; **Subscription** is kept separate.

This uses Audible's private app interface (the same one the community `audible` Python library uses, version 0.13.1, which this code was checked against), so Audible can change it without notice.

## Card rules

- Every piece of information is a **card** in one of eight areas, with a **since** date (when it became true) and a **recorded** date (when it was added).
- A new card either **replaces** the current one (the old card moves to history with an end date) or is **added alongside** it.
- Fixing a typo **corrects** the card in place and keeps the old wording.
- **This ended** moves a card to history with nothing replacing it.
- **Remove** is only for cards added by mistake. Removing a mistaken replacement restores the card it replaced.
- **Details**: many kinds have structured details (a Vehicle's Year, Make, Model, VIN, plate…), defined in `src/core/areas.ts`. Details can format as you type, offer quick picks, or be hidden as sensitive. A card's name can build itself from its details until it's typed by hand, and corrected details keep their old value in the card's history.
- **Links** connect cards, with optional labels read from each side ("through" / "provides"). **At the time** is worked out from overlapping dates and never stored.

## Browsing a big area

Imports can add thousands of cards, so an area stays an index rather than a wall of cards (`src/ui/area.ts`, rules in `src/core/browse.ts`):

- **Search and Add stay pinned** at the top while you scroll. Press `/` to search the area, or the kind you're in.
- **Each kind folds to one row** once it has more than 6 cards ("Movie or show · 1,203 · 1,200 from Netflix"), with a preview of your own cards or your most played. Smaller kinds show their cards in place.
- **A kind's own page** (`#interests/Movie%20or%20show`) filters by type, source and year, and sorts by newest, oldest, A–Z or most played.
- **Your own cards come first**, then each import's history under "From Netflix".
- **Long lists are one line per card**, drawn 100 at a time as you scroll.
- **Years fold**, newest open. A closed year draws nothing until it's opened. "Over time" lists your own entries and sums up imported history per year ("Netflix: 200 Movie or show cards"), linking to that kind filtered to the year.

## Use it offline

Chrome/Edge: choose **Install app** from the address bar. iPhone Safari: **Share → Add to Home Screen**. Visit once online and let the page finish loading before closing it. After that first visit, You opens without a network; saving still works because your data is local. Offline setup requires HTTPS (or localhost), service workers enabled, and enough browser storage. Clearing site data removes the offline app and browser record; keep a separate saved file.

Updates download in the background and wait. Close every You window, then launch again to use the update. There is no update prompt and no forced reload. The service worker caches only the built static shell, including the barcode WASM and FORMAT.md. It never caches personal records, helper responses or NHTSA requests. VIN lookup and Audible need a connection; file imports and barcode reading run locally.

## Deploying

Publish the static files in `dist/` on an HTTPS static host. No application server is needed. Keep `_headers` for hosts that support it; configure equivalent response headers on other hosts (see [security notes](docs/SECURITY.md)). The build injects a CSP meta tag, including `manifest-src 'self'` and `worker-src 'self'`; the response header additionally prevents framing. Serve `sw.js` with revalidation (`Cache-Control: no-cache`) so updates can be found. The manifest starts at `/`, so install the app at the origin root.

## Supported browsers and fallbacks

Chrome/Edge desktop can save straight into a file you choose, when the browser offers file access. Firefox and Safari, including iPhone, download/share a copy instead: save that copy in Files or another folder you choose. Later saves create another copy rather than silently updating the earlier one. The encrypted browser copy remains local; a downloaded copy is your separate backup. Browser permissions and private browsing can limit persistence.

## Limits

Keepsakes are limited to 25 MB each. Browser storage quotas vary by device, available space and browsing mode; keep a separate file backup. A forgotten passphrase is unrecoverable.

## Format versions and migration

See [the file format](docs/FORMAT.md). Version 1 is the legacy plaintext format, version 2 uses an encrypted envelope, and version 3 adds keepsakes. Older files are kept and never overwritten until saved again. Opening an old file upgrades the working record; keep the original as a backup.

## Why each dependency exists

- `fflate`: reads ZIP imports on your device.
- `zxing-wasm`: reads barcodes on your device, using bundled WebAssembly.
- `vite`: development server and production static build.
- `typescript`: checks browser and local helper types.
- `vitest`: runs automated checks.
- `@types/node`: Node type definitions for build tools and the local helper.
- `@xmldom/xmldom`: parses XML in tests without a browser.

The last five are development dependencies; they are not external services.

## Running the checks

```sh
npm ci
npm test
npm run build
npm run check:dist
npm run preview
```

Preview serves the production build locally; stop it with Ctrl+C. `check:dist` checks the built release for development reset tools. The offline test also builds in memory and checks the worker's static asset list and caching boundaries.
