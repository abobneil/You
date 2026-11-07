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

## Card rules

- Every piece of information is a **card** in one of eight areas, with a **since** date (when it became true) and a **recorded** date (when it was added).
- A new card either **replaces** the current one (the old card moves to history with an end date) or is **added alongside** it.
- Fixing a typo **corrects** the card in place and keeps the old wording.
- **This ended** moves a card to history with nothing replacing it.
- **Remove** is only for cards added by mistake. Removing a mistaken replacement restores the card it replaced.
- **Links** connect cards, with optional labels read from each side ("through" / "provides"). **At the time** is worked out from overlapping dates and never stored.
