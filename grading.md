# Grading You

Rubric **1.0**, 8 November 2026. Status: **agreed**. Signed off by Claude (Opus 5.5) and Codex (GPT-6.1 Sol, extra-high reasoning); owner decisions are recorded in section 1.

This file defines how You is graded. It contains no grade. Agents who grade You follow it exactly and report in the template in section 8.

---

## 1. What a 10/10 You is

You is a private, lifelong record of a person's life. A 10/10 You is the **full vision done at best-in-class quality**, for an ordinary person with nobody technical helping them:

1. **They can start and keep going without help.** A blank page asks their name. Recording a fact, a change or a memory takes moments and makes sense on a phone and on a computer.
2. **Their history is kept.** Supported edits and moves preserve accepted facts, earlier wording and date precision. Save failures are explained and keep a recoverable copy. Intentional removal, browser erasure and forgotten passphrases have clearly explained limits, with guidance for keeping a separate backup.
3. **It stays private.** You encrypts the working record in the browser and in saved record files; the name label may remain readable. A readable copy or private access sheet is created only by deliberate choice. Outside operations need the person's specific prior consent.
4. **They can look back.** For any year, period or person, they can see what life was like then: where they lived and worked, who was around, and their own words and pictures.
5. **They own it, and it outlives the app.** The record moves between their devices with no account. A technical helper can read it without You. If they choose, someone they trust could find and open it later.
6. **It feels like one calm, finished product**, with accessible controls on supported phones and browsers.

**Why this bar.** A life record has one job: to keep a life, privately, for decades, so it can be looked back on. A lost year, a leak or a file nobody can open in 2060 breaks that promise, and no amount of polish makes up for it. So the rubric weighs keeping, protecting and outliving the most, and broken core promises cap the score (section 3). Missing features count against the score: a 10 means the vision is delivered, not that what exists today is polished. A 10 should be rare.

Reference points for "best in class" are Day One (capturing and revisiting a life), 1Password (trust, plain-language security, the Emergency Kit), Obsidian (your files, readable without the app), Apple Health (structured health records) and Google Takeout (complete exports). You does not have to copy their features, accounts or business models.

### Pat: the person graders picture

**Pat, 62**, a retired school administrator. Uses an iPhone and a Windows laptop, Facebook and email. Keeps passwords in a notebook. Has never heard of JSON, IndexedDB or a vault. Reads with text one size larger than the default.

Everything core must work for Pat without help. A route that needs a terminal, developer tools or a developer server does not count as usable for Pat. Pat is the task persona. Section 5's accessibility area still covers people with other abilities and input methods.

### Decisions already made (fixed; don't grade against them)

These are the owner's choices. Graders score how well You delivers them, never whether they were wise.

- **No You account, no hosted data store, no cloud-app registration, no OCR service, no recovery backdoor.** Data lives in the browser and in encrypted `<name>.you.json` files wherever the person keeps them. Desktop sync folders and the phone's Files/share menus are the cloud routes.
- **Encryption:** PBKDF2-SHA-256 with 600,000 iterations and AES-256-GCM through Web Crypto. A passphrase is required before personal content is stored. A forgotten passphrase is unrecoverable, and the person is encouraged to use a password manager.
- **Several Yous per browser.** The person's name may be stored unencrypted as a label. No other biographical content may remain unencrypted in app-managed storage or default record files. Deliberately chosen readable exports and private access-plan outputs follow S5c/d; they are not the working record.
- **Card model:** dated cards in eight areas (About, Health, Work, Money, Home, People, Interests, Goals). A new card **replaces** the current one or is **added alongside** it. **Corrections** keep earlier wording. **This ended** moves a card to history. **Remove** is for mistakes. Dates can be a year, a month or a full date. **Links** have optional labels read from each side. **At the time** is computed from dates, never stored.
- **Imports** go through review and de-duplication. The VIN lookup (NHTSA) asks first. Audible may use a helper on the person's own computer, with explicit opt-in.
- **The person's own words (notes) on any card are part of the vision** (owner decision, 8 Nov 2026).
- **Photos and documents attached to cards are part of the vision**, stored encrypted inside the record (owner decision, 8 Nov 2026).
- **An optional, private future-access plan is part of the vision.** It has no service and no account, and declining it is fully supported (owner decision, 8 Nov 2026).
- **Brand:** a quiet blank first page asking "What is your name?", a focused input and a small load link. Lowercase `you|` cursor wordmark, coral `#FF5A36`, rounded system fonts (no remote fonts), light and dark themes, faint secondary hints. Faint must still be readable and usable.

### What earns nothing

These earn no points, and their absence costs none:

- AI summaries or narration
- social sharing, collaboration or multi-user editing
- native apps
- subscriptions
- reminders or streaks
- automatic year-in-review writing
- multi-step "life event" wizards
- several export formats where one complete readable format works
- any particular framework, schema technology or sync algorithm (such as CRDTs)
- test counts or coverage percentages
- code volume
- README claims, menu entries, "Soon" labels and parser functions that a person can't reach in the production app

Judge outcomes, not implementations.

---

## 2. How the score is calculated

### Areas and weights

| Area | Weight | The question it answers |
|---|---:|---|
| **H** Historical truth | 16 | Does the record keep what was true, and when? |
| **P** Privacy and security | 16 | Does control of the record stay with its person? |
| **S** Saving, moving and lasting | 16 | Will the record survive failures, moves and the app's disappearance? |
| **U** Everyday use | 12 | Can Pat do the core work without help? |
| **L** Looking back | 12 | Can the person see the shape and context of their life? |
| **C** Capturing a life | 12 | Can everything about a life go in, by hand or from existing records? |
| **A** Accessibility and devices | 8 | Can people of all abilities use it on the devices they have? |
| **V** Visual craft and tone | 4 | Does every state feel like one calm, finished product? |
| **R** Speed and reliability | 4 | Is it fast at lifetime scale, offline-capable and reliably released? |
| **Total** | **100** | |

Why: H, P and S (48%) are the promise itself: keep it, protect it, outlive the app. U, L and C (36%) decide whether a real person records a life and gets value from it. A, V and R (16%) matter everywhere, and much of their effect also shows up in the other areas' tasks.

### The clause ledger

Each area is a table of **clauses**. A clause is one testable outcome, marked:

- **P** (passed): demonstrated with evidence.
- **F** (failed): tested and failing, or the feature is missing. Missing functionality is always F.
- **U** (unable to verify): evidence is unavailable for a reason outside the product, such as no physical iPhone, a provider outage or no test account. Record exactly what is missing and what would resolve it.

Every area except C has 20 clauses. C has 24. All clauses within an area are worth the same.

```
area score      = 10 × clauses passed ÷ clauses in the area
raw score       = Σ (area weight × area score) ÷ 100
final score     = the lower of the raw score and every triggered cap (section 3)
```

- Keep exact arithmetic and report to **two decimals**. Never round 9.98 up to 10.
- A **10** needs every clause passed and every cap demonstrated clear.
- **There are no partial clauses and no discretionary deductions.** The anchors in each area describe what totals mean; they don't override the arithmetic.
- A clause that lists several things passes only when all of them pass. The test contracts below a table list each part; record each part's result even when the clause fails, so the report shows "4 of 5 formats work", not just "fail".
- A user-facing capability needs a reachable route in the production app that works at **both phone and desktop sizes**, unless the clause says otherwise. A function callable from the console doesn't count.
- One problem may fail several clauses only when it genuinely breaks several distinct promises. Don't fail unrelated clauses because a problem feels severe; caps exist for that.

**Value of one clause in the final score:** H, P or S = 0.08 · U or L = 0.06 · C = 0.05 · A = 0.04 · V or R = 0.02. Use this to rank the fix list.

### Demonstrated and possible scores

- **Demonstrated score** (the headline): every U counts as failed.
- **Possible score:** every U counts as passed.
- Apply every **triggered** cap to both. A cap that hasn't been checked is **unverified**: don't apply it, but list it, because it could still lower both numbers.
- If any clause is U or any cap is unverified, the grade is **provisional**. Example: "Provisional. Demonstrated 6.42, possible 6.90. CAP1 unverified (no network capture on iPhone)."
- Track the demonstrated score across commits, with the U count beside it, so new evidence (such as a real iPhone) is visible as such.

### Terms

- **Accepted:** information the person confirmed (typed and saved, or applied after import review).
- **Durable:** written to a place that survives closing the tab: the browser's encrypted copy or a file the person chose. A download that was started is not verified as durable.
- **Current / history:** a current card is true now; a history card was true before (replaced or ended).
- **Correction:** fixing a mistake in a card. The earlier wording or value is kept.
- **Replacement:** a real-life change (moved house). The old card goes to history with an end date.
- **Source snapshot:** the last accepted values from an import, used to tell imported values from the person's own edits.
- **Keepsake:** a photo or document attached to a card.
- **The record:** everything in one You: cards, history, notes, links, keepsakes and import provenance.
- **F1–F5, T1–T11:** the shared fixtures and tasks in section 4.

---

## 3. Caps: test the core promises first

A cap is the maximum final score while its trigger holds. Apply the **lowest** triggered cap; caps don't add up.

| Cap | Triggered when | Maximum |
|---|---|---:|
| **CAP1** Data leaves without consent | Personal content, credentials, the passphrase or keys leave the device without the person's specific prior consent to that operation. This includes telemetry, error reports, query strings and uploaded import files. Consent to one operation doesn't authorize another. | 3.00 |
| **CAP2** Exposure | App-owned storage exposes plaintext personal content or usable keys. Or an unlock bypass reveals a You. Or a demonstrated cryptographic failure defeats confidentiality or integrity: a key stored beside its ciphertext, an IV reused under one key, or altered ciphertext accepted as valid. Or attacker-controlled typed, imported or attached content **executes script** with the app's privileges. | 3.00 |
| **CAP3** Silent loss | A reachable, supported workflow destroys, overwrites, omits or makes unreadable previously accepted information without the person knowing and being able to recover it. One lost field counts. | 4.00 |
| **CAP4** Account or backend required | Core recording, opening or exporting requires a You login, an operator-run data backend or cloud-app registration. | 3.00 |
| **CAP5** Core journey blocked | A reproducible product defect blocks a whole core journey (create/unlock, record, save, reopen) on mainstream desktop Chromium or iPhone Safari, with no discoverable safe alternative in the product on that device. | 4.00 |
| **CAP6** Third-party requests | The shipped app or its enabled helper contacts an outside party without the specific prior choice that authorizes it, even with no personal data. Examples: remote fonts, CDN scripts, analytics, crash reporting, resources loaded from content. | 6.00 |

**Why these numbers:** the owner chose them (3 for leaks and exposure, 4 for loss). Leaks and exposure can't be undone. Silent loss defeats the record's reason to exist. A third-party request breaks an explicit privacy promise without exposing the record.

**Evidence standard.** A cap needs a reproduction, or a traced reachable code path with a complete causal explanation. A suspicion is an open risk, not a trigger. Retest a surprising reproduction once on an untouched fixture. Keep a **cap investigation log** separate from the clause ledger: what was tried, the result, and whether each cap is *demonstrated clear*, *triggered* or *unverified*. "No incident seen" is weaker than a completed adversarial check. Neither proves the app is secure.

**Boundaries:**

- **Silent** includes three cases:
  - a "Saved" status that promises more than was written;
  - a generic "Replace?" confirmation that hides known newer work;
  - an irreversible step whose loss of history isn't disclosed.

  A clear "not saved" state with retry or export that keeps the last durable copy is a failure handled safely. It is not CAP3.
- **Not app data-loss bugs:** confirmed removal of a mistaken card, an explained destructive reset, clearing browser data from the browser or OS, and a forgotten passphrase. How clearly these are explained is still graded. A reset must never run from an ordinary production URL.
- **Not CAP1 or CAP6:**
  - loading the static app from its own origin, and ordinary IP/HTTP transport metadata;
  - browser or OS traffic outside the app's control;
  - an encrypted file sent to a destination the person chose;
  - the consented NHTSA VIN request;
  - Audible traffic after an explained opt-in.

  A blanket consent banner never makes analytics or remote fonts acceptable. A first-party proxy doesn't hide an upload: CAP1 follows the data and its recipient, not the hostname.
- **Readable exports** are not the default record. Creating plaintext requires an explicit warning and choice beforehand; otherwise apply CAP2.
- **Allowed plaintext (CAP2 / P2a / P3a/d exceptions):** the allowed name label does not trigger CAP2. Neither does a readable export deliberately created after S5d's warning, or a private S5c access-plan output containing only information the person expressly chose to include. These exceptions do not authorize plaintext working copies, caches, temporary files, diagnostics or default record exports. A passphrase must never be included by default, and usable encryption keys are never exported by these routes.
- **Script execution:** pasting code into developer tools is not a product exploit. Execution inside a demonstrably isolated preview, with no access to the record, the session or the app's origin, is not app-privileged execution. Isolation must be shown, not assumed from the word "sandbox".
- Don't require recovery of an erased only copy, a lost key or deliberate tampering by the device owner. Do require detection, honest warnings, safe failure and keeping recoverable originals. Don't claim immunity to a compromised OS.
- A failed unit test or typecheck alone doesn't trigger CAP5. A product-caused failure to build or launch a usable release can. A package-registry outage is an environment problem, not a product defect.

---

## 4. Grading procedure

### Environment and order

1. **Record:**
   - the rubric version, commit SHA, working-tree status and date;
   - OS, Node/npm, and exact browser and device versions;
   - time zone and test clock.

   Use a clean, disposable checkout. Keep reports, captures and fixtures outside it. Never use real personal, health, identity or Amazon data. Never run destructive tests in someone's everyday browser profile.
2. **Build and test.** Read the README and package scripts. Run `npm ci`, `npm test` and `npm run build`, saving full logs and exit codes. Record install or network failures separately from code failures. Passing unit tests support but don't prove UI behavior.
3. **Serve the production build:** `npm run preview -- --host 127.0.0.1 --port 4173`. This is grader setup, not a burden Pat carries. Test direct loading of a deep route.
   - `npm run dev` may be used to understand code or build fixtures, but dev-only tools and live reload are not the product.
   - Preview can mount local Audible endpoints. Also verify a plain static deployment without them.
4. **Viewports and themes.** Use fresh browser profiles at **1440×900** and **390×844** CSS px. Also check 320×568 reflow and 844×390 landscape. Run core tasks in light and dark themes. Desktop emulation doesn't prove iOS file/share, on-screen keyboard, camera, backgrounding or permission behavior.
5. **Order of work:**
   1. cap checks and the P, S and H failure tests;
   2. recording, notes, keepsakes and imports;
   3. looking back;
   4. accessibility;
   5. visual states;
   6. scale and speed.

   Save the original fixtures before each destructive or corruption test.
6. **Browser matrix (minimum):**
   - current desktop Chrome or Edge, Firefox, and Safari on a real iPhone;
   - real Android Chrome where camera or contact-picker features are claimed.

   Record exact versions. Chromium tests the direct-file route; Firefox and Safari test download/share. Never expose the local helper publicly to make phone testing easier.
7. **Evidence:** grade every clause from an evidence ledger before looking at any earlier grade.
   - For each pass, cite the observation or test, plus code for security or durability claims.
   - For each failure, give minimal steps and expected vs. actual results.
   - Capture screenshots at both main sizes, console errors and sanitized network traffic.

   The code paths named below are starting points. Follow renamed equivalents.
8. **Disagreements.** Compare reports clause by clause. If two graders differ by more than 0.5 in an area, rerun the disputed clauses; don't average. If a clause's wording caused the split, fix it in the next rubric version.

No particular automation tool is required. Automated checks and mocked file handles add to manual operation on real platforms; they don't replace it.

### Shared fixtures

Both graders must use the same synthetic fixture archive, with a SHA-256 manifest of exact bytes and expected outcomes. Freeze it, along with reference hardware and timing settings, before comparing grades. If none exists yet, build these cases before scoring, publish them with the report, and reuse them afterward. Changing fixtures or hardware must be visible in any comparison.

- **F1: a small lifetime.** Two Yous, Alex Kim and Robin Lee, with different passphrases and opaque IDs. Alex's record contains:
  - at least 32 cards across all eight areas, with 12 historical cards;
  - a three-address replacement chain and two jobs held at the same time;
  - a medication that ended, and a goal that was renamed;
  - six links with one-sided, two-sided and empty labels;
  - several revisions, notes on five cards (one note corrected), and source metadata;
  - sensitive fields, custom kinds and unknown dates;
  - accents, emoji and non-Latin text;
  - **keepsakes:** a JPEG photo with EXIF data, an iPhone HEIC photo, a PNG scan, and a multi-page PDF.

  An export and reopen compares the whole record, including IDs, links, revision wording, dates, provenance, notes and keepsake bytes (by hash). Name any volatile fields allowed to differ.
- **F2: dates and time.**
  - Address A since `2000`, B since `2010-06`, C since `2020-03-14`.
  - Job J from `2005` to `2012`, and hobby K from `2010-01` to `2010-02`.
  - One unknown start. "Now" is a different year.

  An "as of 2007" query must find A and J, not B or C, while keeping year and month precision. Test both possible and definite overlap. Equal or uncertain boundaries must be explained, not given an invented handover day. Include a leap day, an invalid 30 February, an end before its start, and UTC timestamps near midnight in New York and Auckland.
- **F3: imports.** Valid and malformed samples of every source and variant in Appendix B, each with expected outcomes. Include:
  - byte-order marks, quoted CSV newlines and folded vCard lines;
  - mixed case and Unicode;
  - same-name different people, and the same title by different authors or in different editions;
  - colliding international phone numbers;
  - cancelled reviews, and repeated, older and newer snapshots.

  Barcode images encode synthetic data and include sharp, rotated, blurred and wrong-code cases. Never use a real ID document.
- **F4: adversity.**
  - **Corrupt and unusual files:** a valid encrypted file plus corrupted, truncated and unsupported-version copies of it; legacy v1 and prototype profiles; a profile with one malformed card and an unknown future field.
  - **Failing storage:** a browser store and mocked file handle that fail before, during and at the close of a write. Repeat with a real denied file permission.
  - **Divergent copies:** two tabs, and two offline file copies, that make different changes after a shared starting point.
  - **Hostile keepsakes:** an SVG containing script, an HTML file renamed `.jpg`, a PDF with embedded JavaScript, a decompression-bomb image, a 0-byte file, and a file over the stated size limit.
- **F5: lifetime scale.** A deterministic record covering 50 years, all eight areas and several sources:
  - 10,000 cards, including 2,000 historical cards, 1,000 links and 2,000 revisions;
  - 300 keepsakes totalling about 500 MB;
  - separately, 50,000 streaming source events for an import test.

  Fix the byte sizes and expected rollups in the manifest. Also test empty, one-card and 100-card states. F5 is the baseline for full credit, not a maximum lifetime.

### Tasks for Pat

Give the goal without saying where the controls are. In-app help is allowed. Terminals, developer tools, reading source and coaching are not. Timing starts when the instruction is read and excludes OS or provider waits. Stop at the limit, keep the evidence, and ask for an explanation of the result.

| Task | Success means | Limit |
|---|---|---:|
| **T1** | Start as Alex, set a passphrase, and explain why it can't be recovered and where today's data is kept | 3 min |
| **T2** | Add an address dated only `2000` and a job; add a second job held at the same time; correct a typo and find the old wording | 4 min |
| **T3** | Replace the address with a 2010 address; end one job; find the old address and the ended job | 4 min |
| **T4** | Save an encrypted file through a desktop folder or the phone's Files/share menu; reopen it in a fresh browser with the passphrase | 5 min |
| **T5** | Load contacts, leave one out, mark "This is me", apply, repeat, and explain what was new and what was already there | 4 min after the export is supplied |
| **T6** | Find where Alex lived and worked in 2007; browse that period without being swamped by streaming plays | 3 min |
| **T7** | Add Robin, lock or switch, unlock Alex, and explain which file belongs to whom | 3 min |
| **T8** | Hit a denied save, recognise that the file isn't current, and keep the latest data somewhere safe | 3 min |
| **T9** | Choose a period, make a readable copy or printout, explain its privacy consequence, and check its events and dates | 4 min |
| **T10** | Prepare a future-access plan: identify the file and the separately kept unlocking information, then show the plan works in a fresh browser. Use a synthetic passphrase and a simulated recipient. | 5 min |
| **T11** | Attach the supplied photo and PDF to two cards, add a note to one, then find both again later | 4 min |

The grader runs all tasks as a scripted walkthrough under Pat's constraints and **labels it as an agent walkthrough**. For stronger evidence of ease of use, an optional study can be run with at least three non-technical adults who have never used You, one of them aged 60 or over. Report their results separately, and don't claim an expert's success proves Pat's. Tasks are evidence for the clauses that cite them. A task never adds a second deduction for a feature that is already missing.

---

## 5. Areas

### H. Historical truth (16%)

**A 10:** the current view is a window onto a life record, not a form that forgets earlier answers. Accepted facts, wording, notes, dates and links keep their meaning after every supported operation. *When it was true* and *when it was recorded* never get mixed up.

| Row | a | b | c | d |
|---|---|---|---|---|
| **H1** Changes | Replacing keeps the old card, ends it and makes the new one current | Adding alongside leaves the other current cards current | An older fact entered later lands in the right place in life time; its recorded time stays the real entry time | Removing a mistaken replacement restores the card it replaced, with a valid chain |
| **H2** Corrections | Correcting a main value or note keeps the earlier wording and when it changed | Changing or clearing a detail keeps its earlier value and which detail it was | Correcting a date, kind or other meaningful metadata keeps the earlier meaning in history (a warning alone doesn't pass) | Saving with no change records nothing; two real corrections keep their order |
| **H3** Dates | Year, month and full-date precision round-trip unchanged; unknown stays visibly unknown | Impossible dates and an end before its start are blocked or openly resolved, never silently replaced | Life-time views never treat the recorded time as a known life date | F2's chronology and overlap answers are right at every boundary and in both test time zones |
| **H4** Links | Both optional labels read from the correct side and survive reopening | Self-links, duplicates and links to missing cards can't corrupt the record | Ending or replacing a card keeps its links meaningful instead of silently moving them | "At the time" updates when dates change and is computed, never stored |
| **H5** History access | Earlier wording, source and recorded time can be seen from the normal UI | "This ended", reopening and mistake removal have distinct, accurately explained effects | F1 export and reopen keeps every historical card, revision, replacement chain and link | Cancelling an edit, end or removal changes nothing, and "This ended" and Remove each have a working way back |

**Anchors:** 0 = no reliable history; data is overwritten. 3 = a few dated facts survive, but ordinary changes or their history are unreliable. 5 = happy-path replace, correct and end work, with real gaps in dates or links. 7 = normal history is reliable and readable, with several edge cases or advanced corrections incomplete. 10 = every clause, including the adversarial date and round-trip cases.

**Evidence:**
- Run the F1/F2 sequence at both sizes: add A, replace it with B, add an older predecessor, add alongside, correct two fields, clear one, change a date, correct a note, end and reopen, remove a mistaken replacement, inspect every old state, then export and reopen.
- Compare stable IDs and exact strings. Test stale links and tied boundary dates.
- Code: `src/core/types.ts`, `cards.ts`, `dates.ts`, `relations.ts`, `areas.ts` and their tests, plus `src/ui/composer.ts`, `cardView.ts`, `dateInput.ts` and `details.ts`. Tests of core helpers don't prove the UI uses them.

**Common deductions:**
- Earlier wording that exists but can't be seen fails H5a. Wording that is lost fails H2a/b and may trigger CAP3.
- Turning a year into 1 January fails H3a and H3c.
- A good-looking timeline that gives wrong answers fails H3d.

### P. Privacy and security (16%)

**A 10:** the person can trust You without trusting an operator. Encryption is verified where data is stored, consent is narrow, and Yous sharing a browser stay separate. A threat model says what is and isn't protected. This is an applied review, not a certification.

| Row | a | b | c | d |
|---|---|---|---|---|
| **P1** Network and supply chain | Cold and warm use of the static app makes no analytics, remote-font, third-party script or unrequested provider requests | Personal content and import files leave the device only through specifically consented operations; diagnostics contain no personal content, passphrase or usable keys | An enforced content policy on the production delivery limits where scripts load from and where the app can send data (report-only fails) | Shipped browser and helper dependencies have no unresolved applicable high or critical advisories on the grading date |
| **P2** Encryption | App-managed persistent copies of cards, revisions, notes, keepsakes, thumbnails and imports are encrypted, including caches and default record files; only the explicit exceptions in section 3 are allowed | New vaults use PBKDF2-SHA-256 at 600,000 iterations and 256-bit AES-GCM via Web Crypto, verified in the saved envelope | Each You has its own random salt, and every save uses a fresh random 96-bit IV | A wrong passphrase or altered ciphertext or header is rejected safely; nothing half-decrypted replaces the current record |
| **P3** Keys and locking | The passphrase and usable keys never persist in app-managed storage, caches, URLs, logs, record exports or helper output; only an expressly chosen passphrase entry in S5c's private access-plan output is excepted | Reload, the lock button and an inactivity timeout (safe default, adjustable) all require unlocking again, without losing unsaved work or calling a failed save saved | Lock, switch and Back never reveal the previous session or save pending data into another You, including two Yous with the same name | Unencrypted app-managed storage holds only the allowed name label and non-biographical technical values |
| **P4** Untrusted input | HTML and script in typed text, imports, notes, labels and keepsakes render as inert content | Malformed encrypted envelopes are bounds-checked (size, iterations, fields) before expensive work, and errors keep existing data | Archives, XML and keepsake files can't trigger outside requests, file writes or unbounded decompression; size limits are explained | Sensitive values stay masked in previews, search and history until revealed, with an accessible reveal and re-hide |
| **P5** Passphrase, threats, helper | Setup explains there's no recovery, gives on-device strength guidance and a password-manager suggestion, and allows paste and autofill | A written threat model (assets, trust boundaries, exclusions) covers hostile imports and keepsakes, shared or unlocked devices, storage loss, dependency or update compromise, and the local helper, and each mitigation is checked | Audible credentials stay on the person's computer in protected OS storage (or a disclosed protected fallback), never in the record, the repository or responses | Helper endpoints reject cross-origin calls and hostile Host headers, use read-only provider calls, remove local authorization on disconnect, and explain their traffic before opt-in |

**Test contracts:**
- **CAP2 / P2a / P3a/d exceptions:** the name label, deliberately created readable exports, and private access-plan outputs are governed by section 3's "Allowed plaintext" boundary. Nothing else is exempt.
- **P1c:** the policy must be enforced on the real production delivery and must cover script sources and outbound channels such as fetch, forms, images and frames. A `connect-src` rule alone is not enough. The policy is defense in depth and doesn't excuse P4a.
- **P1d:** save the audit tool and database versions. An advisory in a package that isn't shipped, or in code proven unreachable, passes only with that determination written down. An uninvestigated alert fails, and a registry outage is U. Audit development tooling separately.
- **P3b:** check inactivity locking and return from a long suspension, as well as the explicit lock.
- **P5a:** the strength guidance never sends the passphrase anywhere, never labels anything "unbreakable" and never imposes arbitrary character rules. Using a password manager is never required to begin.

**Anchors:** 0 = personal data is exposed by design, or there is no encryption or isolation. 3 = a lock screen protects only some paths. 5 = basic encryption and unlock work; important consent, input, metadata or helper boundaries are unproven or broken. 7 = normal local use and files are private; bounded hardening gaps remain. 10 = every clause, across browser, file, import, keepsake and helper boundaries.

**Evidence:**
- **Network:** preserve all requests across a cold static load, every ordinary flow, a declined and an accepted VIN lookup, a barcode import, keepsake handling, and Audible enabled and disabled.
- **Storage:** search localStorage, IndexedDB, Cache Storage, downloaded files, URLs and logs for unique synthetic canary strings.
- **Encryption:** seal identical plaintext repeatedly and compare IVs. Alter each envelope field independently. Test huge iteration counts with a watchdog.
- **Helper:** send synthetic cross-site requests and hostile Host values to it in isolation.
- **Code:** `src/core/crypto.ts`, `src/storage/*`, `src/state.ts`, `src/ui/dom.ts`, the import parsers and the scanner assets, and `server/audible/plugin.ts`, `http.ts`, `auth.ts`, `vault.ts` and `service.ts`.

**Common deductions:**
- "Local" in a README doesn't pass P1. Correct AES alone doesn't pass P2a or P3a.
- A 600,000 constant without checking a real saved envelope doesn't pass P2b.
- An unlock screen over content that is still reachable fails P3b/c and can trigger CAP2.
- Having no recovery service is correct; don't penalize it.

### S. Saving, moving and lasting (16%)

**A 10:** a lifetime doesn't depend on one tab, one browser or You continuing to exist. The latest durable copy is always identifiable. Failures and conflicts keep complete originals. A technical helper can read the record without You, and Pat has a plain backup and access plan.

| Row | a | b | c | d |
|---|---|---|---|---|
| **S1** Durable saves | Browser-only edits survive closing, reopening and unlocking | Direct-file edits survive closing, reopening and opening the file in a fresh browser | The download/share route gives a complete, decryptable, latest file on Firefox and iPhone Safari | The save status (saved, pending, browser-only, downloaded, reconnect needed, failed) matches what was actually written, and a started download is never shown as a verified save |
| **S2** Failure safety | Storage-full or blocked-storage failures are shown and offer a way to keep current work | File permission, write or close failures keep the last good copy and offer retry or saving elsewhere | Rapid edits, immediate lock or close, and overlapping writes can't let an older snapshot win | Setup and load, and every offered migration, passphrase-change, app-update or helper-update route, preserve recoverable records on success and interruption and explain access to old copies |
| **S3** Conflicts | Different edits in two tabs are reconciled, or blocked with both versions kept | Opening an older file of the same You warns about newer browser work and offers to keep it first | A sync-folder file changed elsewhere is never silently overwritten; both complete versions stay recoverable | Different offline copies from two devices can be compared and reconciled, or kept separately, through an understandable flow in the product |
| **S4** Move and restore | A fresh browser or device opens F1 from its file and passphrase alone, with the whole record and identical keepsake bytes | Removing one You through the app leaves other Yous and saved files intact; browser/OS erasure is explained as removing all affected browser copies, with recovery from separately saved files | A desktop sync-folder route and a phone Files/share route work without app registration or a pretend provider connection | Legacy files stay intact while migrating; corrupt or unsupported data is rejected or reviewed, never silently filtered |
| **S5** Long life | The envelope and inner format are versioned and documented: dates, IDs, revisions, links, sources, notes, keepsakes and encryption parameters | A documented offline route lets a technical helper decrypt and read F1 with the passphrase using standard tools, without the hosted app | Backup and future-access guidance covers browser erasure, finding the latest copy, a tested restore, and an optional private access plan that works in a fresh context | Pat can make a legible, complete readable export of a chosen period within T9's limit, including notes and original keepsake files, after an explicit plaintext warning and choice |

**Test contracts:**
- **S2d:** for each offered lifecycle route, keep a pre-operation file, run both success and interruption cases, and reopen the resulting and original copies with their documented passphrases and supported readers. Explain which old copies retain the old passphrase and whether a newer app is needed. Never silently overwrite the only readable copy. A passphrase-change or helper-update feature is not required merely by this clause; where none is offered, record that fact and test the applicable setup, load, migration and release paths.
- **S3:** "Kept both" means two complete, reopenable records with distinguishable names or destinations, plus guidance on what to do next. An unexplained duplicate file, an inaccessible recovery blob, or a choice that discards one version doesn't pass. Automatic field-level merging is not required.
- **S4b:** test app removal of Alex while Robin and both saved files remain intact. Separately, erase the site's browser data: the saved files must remain intact and must restore in a fresh context. Do not require browser-only Yous to survive origin-wide erasure; grade the warning and usable save/restore route instead.
- **S5c:** the access plan never includes the passphrase or life details by default. It offers a deliberate choice, or a blank to fill in privately, and explains why the file location is itself sensitive. It is generated and printed on the device. No recipient needs an account. Declining the plan is fully supported and isn't penalized: the clause grades whether the capability exists and works (T10), not whether Pat uses it. Sync-folder conflict copies alone are not a backup plan.
- **S5d:** run T9 and compare the chosen period with the fixture's expected events, dates and notes. One complete readable export format is enough; it may be a single package containing a readable document and the referenced original keepsake files, whose hashes must match. Its readable part must be printable. A printout or thumbnails alone do not substitute for original files. No second export format is required. Keep active content inert in the readable document; preserving original bytes does not authorize executing them or automatically loading their outside resources. S5d owns the export, privacy choice and T9 time limit; L5d independently owns faithful period reading. Do not fail L5d solely because an export button is missing if complete in-app period reading works. Plaintext is never the default form of the record.

**Anchors:** 0 = no dependable readable copy. 3 = one browser's happy path sometimes works; saving and moving are fragile. 5 = normal encrypted browser and file round-trips work, but failure, phone, conflict or longevity cases need substantial work. 7 = normal cross-device use and failure handling are trustworthy; some preservation or conflict refinements remain. 10 = every clause, including stale writers and an offline way out of the product.

**Evidence:**
- **Writes:** in `src/storage/*`, `src/state.ts`, `src/core/profile.ts` and `src/ui/session.ts`, trace each UI change through to write completion. A toast is not proof.
- **Failures:** inject each F4 failure separately, then decrypt the previous and latest copies afterwards. Edit during a delayed encryption or file close, and lock immediately after typing.
- **Conflicts:** run two tabs on the same You, an externally edited file, and a permission revoked after load.
- **Phone:** on a real iPhone, save or share, find the file in Files, reopen it and decrypt it.
- **Independent reading:** decrypt a sample with a short script written only from the documentation.
- Cloud success means the bytes reached the person's chosen folder, not that a cloud logo appeared.

**Common deductions:**
- A swallowed storage-full error fails S2a even if the UI keeps working. If the UI said "saved", CAP3 applies.
- A generic replace dialog that hides newer work fails S3b and may trigger CAP3.
- A `.json` extension earns no longevity credit by itself.
- Manual download can earn full credit when the status and steps are accurate.

### U. Everyday use (12%)

**A 10:** Pat finds the core work in the product's own words, understands what each action will change, and always knows where the record is kept. Nielsen's heuristics (system status, user control, error prevention, familiar language) inform these clauses. They don't justify an onboarding tour on the intentionally blank first page.

| Row | a | b | c | d |
|---|---|---|---|---|
| **U1** First visit | A fresh visit shows only the focused name question and a small load link | T1 succeeds within its limit using only information in the app | The load, wrong-passphrase, forgotten-passphrase and cancel paths each state the next safe step | Blank, Unicode and long names work without breaking the layout or export, and no invented identity is forced |
| **U2** Recording | T2 succeeds within its limit | All eight areas offer understandable examples and field guidance | Changing type, or going to links and back, keeps the drafted name, details, date, note and keepsakes | T3 succeeds within its limit, and replace, correct, alongside and end are explained before they happen |
| **U3** Ownership | T4 succeeds on desktop within its limit without needing to understand file formats | T4 succeeds on an iPhone within its limit through a visible file/share route with clear latest-copy guidance | T7 succeeds within its limit; same-name Yous never leave the active You or its save place ambiguous | The browser-only risk is explained at a useful moment, and the safe save route stays reachable |
| **U4** Control | T8 succeeds within its limit, with a clear next step instead of an error code | Cancel, Back, close and Escape behave predictably; dismissing a draft warns first or can be undone | Pending work can't be submitted twice (or doing so is harmless), and the status says what's happening | Success, error, empty and loading states look different, and errors keep what the person typed |
| **U5** Repeated work | T5 succeeds within its limit | T6 succeeds within its limit using ordinary navigation, search or looking-back controls | Returning from a card, link, history or filter restores a useful place | Lock, switch, import, save and help are visible; nothing essential is hover-only or shortcut-only |

**Anchors:** 0 = Pat can't accomplish core goals. 3 = a technical helper can complete fragments, and key choices go unexplained. 5 = familiar desktop happy paths work, with a heavy burden of discovery or recovery. 7 = most tasks succeed unaided on phone and desktop, with a few recurring detours. 10 = every clause, under the shared task conditions.

**Evidence:**
- Run T1–T8, recording the screen, active time, detours and Pat's explanations.
- At both sizes, try switching types, Back from the link picker, an accidental backdrop close, an invalid entry, a denied save and a second You with the same name.
- Code: `src/ui/landing.ts`, `gate.ts`, `session.ts`, `switcher.ts`, `storagePicker.ts`, `composer.ts`, `sheet.ts`, `router.ts` and `nudge.ts`, and the copy in `index.html`. Code can't prove that Pat understands something; tasks do.
- Keep simple-card entry time from T2 as diagnostic evidence; it is not scored.

**Common deductions:**
- A terminal-only or localhost-only route fails the user-facing clause even if its parser works.
- A quiet label nobody finds fails discovery. Making it loud isn't the only fix.
- The browser's own Save or Files dialog can be part of a passing route.

### L. Looking back (12%)

**A 10:** the person can revisit any period of life and see what belonged together. This is a first-class purpose; old cards hidden in an edit dialog don't satisfy it. Day One's date navigation is a useful reference, but You must respect fuzzy dates and all eight areas rather than copy a journal calendar.

| Row | a | b | c | d |
|---|---|---|---|---|
| **L1** Life overview | A normal user can reach both current and historical records | One chronological life view brings together all eight areas | The life view jumps to any year or period across F5's 50 years without endless scrolling | The life view gives useful detail at year or period level and opens cards without losing its place |
| **L2** Past context | "Where did I live and work in 2007?" returns F2's life-time answer, not the entry date | For that period, related people and activities from other areas are visible | Fuzzy dates and uncertain overlaps look different from exact facts | Replacements, endings and corrections read as different kinds of change, with a way to see the details |
| **L3** Finding | Search finds current and historical values, notes and earlier corrected wording, and shows their status | Search covers custom kinds, structured details and Unicode without silently missing matches, and keeps sensitive values masked | Area, kind, source and time filters combine, clear, and show their current scope | Sorting is stable and correctly labeled, including unknown dates |
| **L4** What matters | Large imported histories are summarized or folded so personal milestones stay findable | A source or year summary expands to its cards | Sparse and empty periods are shown honestly, with no invented events or "insights" | From a person, their related current and historical cards can be reached, with dates and link labels |
| **L5** Faithful reading | Historical cards show date precision, status, source, links, notes and keepsakes legibly | Looking back works on a phone, with no context hidden in tooltips | F5 stays navigable by period and kind, and keeps counts and scope when groups fold | A chosen period can be read straight through, or exported and printed, without leaving out any of its accepted events |

**Anchors:** 0 = history can't be found or read. 3 = isolated old cards in basic date lists. 5 = usable historical browsing and search, but limited reading across areas for a period. 7 = a useful life view and search answer most questions, with gaps in uncertainty, scale or rediscovery. 10 = every clause, and the whole lifetime can be navigated and read faithfully.

**Evidence:**
- Use F2 for the exact answers.
- Search for a replaced address, a corrected spelling, a note, a custom kind, a non-Latin name and a sensitive field.
- Run T6 at both sizes. Then browse F5 by decade, pick a period, filter to Work and People, open an old card and come back.
- Confirm streaming plays don't bury a move or a job.
- Code: `src/core/browse.ts`, `src/ui/area.ts`, `cardView.ts`, routing and any life-view code. A computed `atTheTime()` is not a delivered life view.

**Common deductions:**
- A missing life view fails L1b–d and L2b.
- A new heading over the same area list is not a life view.
- Sorting by recorded time while claiming "your life in 2007" fails L2a.
- Decorative charts or generated prose earn nothing.

### C. Capturing a life (12%)

**A 10:** everything a person would want to keep about their life has a fitting place, with their own words and keepsakes beside it. Existing records come in accurately, are reviewed, and never turn outside errors into personal truth.

| Row | a | b | c | d |
|---|---|---|---|---|
| **C1** Breadth | At least 90% of the life checklist (Appendix A) passes its representation contract | 100% of the checklist passes | A fact not on the list can use a reusable custom kind with suitable detail fields | Any card can hold the person's own words (optional, multi-line), kept through corrections, search and export |
| **C2** Keepsakes | A photo or document can be attached to any card from a desktop file picker and from the phone's photos, camera or Files | The original bytes are stored encrypted inside the record and come back unchanged when opened or exported | Size limits are stated before they bite; oversized, unsupported or hostile files fail safely with a plain message and change nothing | Keepsakes can be viewed, described for screen readers, and replaced or removed with history kept like any other change |
| **C3** Review | Every source reaches review before changing accepted data; Cancel or rejected input changes nothing | Review shows the proposed changes, with old and new values | Choosing entries one by one or in bulk works, and the applied totals match the selection | Source, date provenance and skipped or unsupported content are disclosed accurately |
| **C4** Identity and refresh | Repeating an import, or replaying an older one, creates no duplicates, false history or rollback | Strong identities (source ID, email, phone) match conservatively across normalization cases | Ambiguous names or titles stay separate or go to explicit match review | A newer refresh updates unchanged imported values with revisions, preserves manual edits and deliberate clears, and never deletes accepted cards merely because the source omits them |
| **C5** Personal records | Contacts (vCard) and "This is me" pass their source contract | LinkedIn archive and loose CSVs pass their source contract | Licence barcode and the consented VIN lookup pass their source contracts | Health records (C-CDA, FHIR JSON, FHIR NDJSON) pass their source contract |
| **C6** Culture and delivery | Goodreads, Letterboxd and IMDb pass their source contract | Netflix, Spotify, Apple Music and YouTube Music pass their source contract | Audible library and refresh pass their source contract | A non-technical desktop user can get and use the Audible helper, with an honest file fallback |

C has 24 clauses, so each is worth 10/24 area points.

**Test contracts:**
- **C1a/b:** list every checklist item's result, not only the percentage. An item passes when the person can do all of the following:
  - create it with its minimum details and date precision;
  - see it in its area and in life context;
  - save and reopen it faithfully.

  A built-in kind or a reusable custom kind both count. A title with everything stuffed in, or a generic note, does not count where structured details are listed. Sensitive details stay optional and masked. The checklist tests what You can hold, not what Pat must disclose.
- **C1d:** notes are checked for entry and reading here, for correction history under H2a, for search under L3a, and for export under S5d.
- **C2:**
  - real encrypted bytes must survive a fresh-device round-trip (S4a) and appear in the readable export (S5d);
  - hostile F4 files must stay inert (P4a/c);
  - F5 keepsakes must meet the R budgets.

  External file paths, thumbnail-only copies and plaintext caches don't pass. Converted display previews are allowed, but the original bytes must also remain encrypted inside the record and be exported unchanged. Record a hash comparison after attachment, replacement, encrypted save/reopen and readable export; earlier accepted originals must remain recoverable through the replacement history required by C2d. For F4 hostile files, test attachment and record-opening routes plus previews and any readable output: unsafe input must be rejected or handled inertly according to the stated clause, with no app-privileged execution, unauthorized request, unrequested file write or unbounded decompression.
- **C2a/d (T11):** run T11 at both main sizes. C2a owns attachment-route discoverability and the four-minute task limit; C1d owns note entry and C2d owns later keepsake viewing. If a constituent capability is missing, record the task as blocked and fail its canonical clause; do not invent an additional timing failure for a task that could not be completed. When the constituent capabilities exist, exceeding the complete T11 limit fails C2a. Record every constituent result.
- **C3–C6:** these rows apply to every source and variant in Appendix B, Audible included.
  - Valid rows in a partly invalid file may be offered, as long as the omissions are stated, but nothing is applied without review.
  - Source cells pass only when **every** variant in that source's contract passes. List each variant's result.
  - For every source and variant, compare the accepted result with F3's expected values after review/application and again after export/reopen. Dates and their precision, units, negation, unknown statuses, source distinctions and provenance must retain their meaning. Merely retaining a card count does not pass the relevant C5/C6 source cell.
  - C6d includes ordinary desktop installation, start, sign-in and use without a terminal or developer server, plus the file fallback during helper unavailability and provider errors. Malformed, unsupported-version and authentication/credential files must be rejected as library input without changing accepted data. Record each part separately; external unavailability is U only for the affected live evidence, not for missing functionality.
  - Audible's credentials and endpoints are graded under P5c/d. A command-line-only Audible route fails C6d.

**Anchors:** 0 = structured facts can't be recorded, or importing is unsafe. 3 = cards in all areas plus isolated parsers, with little dependable review. 5 = most common life facts fit, notes or keepsakes are partial, and some sources work end to end. 7 = broad coverage with notes and keepsakes; most sources and re-imports work, with a few format or delivery gaps. 10 = every clause, and every named source and adversarial case passes.

**Evidence:**
- Walk Appendix A against `src/core/areas.ts` and the UI. Run T2, T3, T5 and T11, and the F3 and F4 fixtures.
- Record digests of the accepted record before review, after Cancel, after a selective apply, after a repeat, after an older and a newer snapshot, after a manual edit, and after a deliberate clear.
- Code: `src/core/import/*` (especially `match.ts`, `parse.ts` and `types.ts`) and `src/ui/import/*`. Test the barcode reader offline.
- Don't ask anyone for a real Amazon password. Without a dedicated test account, the live part of C6d is U, and the fixtures still decide C6c.

**Common deductions:**
- "Already there" based only on a loose name match fails C4c.
- A review summary that hides overwritten values fails C3b.
- Silently losing manual edits triggers CAP3, not just a deduction here.

### A. Accessibility and devices (8%)

**A 10:** every core task works without relying on sight, a mouse, precise touch or one browser's file API. WCAG 2.2 A and AA is the floor. A tiny visible link can have a larger invisible touch target. A quiet design doesn't exempt essential text from contrast rules.

**Tested scope** (every screen, in both themes): landing, create/unlock, home empty and populated, each area, composer, link picker, card history, keepsake picker and viewer, readable-export and print controls, future-access plan, life view, import review, storage choice and save failure, conflict, switcher, and error states. Map any further A or AA failure in this scope to the closest clause. There is no floating veto after the arithmetic, and passing clauses don't imply a conformance audit of untested screens.

| Row | a | b | c | d |
|---|---|---|---|---|
| **A1** Keyboard | Every T1–T11 action works by keyboard alone, including dates, link removal and reveal | Focus is visible and never hidden behind fixed bars or the on-screen keyboard | Dialogs take, keep and return focus in a sensible order, with no trap | Enter, Space, Escape and Back behave consistently, without destructive surprises |
| **A2** Assistive technology | Inputs, icons, controls, headings and regions have correct names and roles | Save, error and import results are announced without rereading the page | Screen-reader order includes dates, status, revisions, selections and link direction | Create → record → save → reopen succeeds with NVDA on desktop and VoiceOver on iPhone |
| **A3** Readability | Essential text meets AA contrast (4.5:1, or 3:1 for large text) in both themes | Control edges, states and focus meet 3:1, and color alone never carries meaning | 200% text and 320 CSS px reflow keep all content and actions without scrolling both ways | Errors name the field and the fix; placeholders are never the only label |
| **A4** Touch | Targets meet WCAG 2.2's 24×24 CSS px rule or a documented exception | Primary repeated phone actions have hit areas of about 44×44 (a product goal beyond AA) | The on-screen keyboard, safe areas and landscape never hide required inputs or buttons | Nothing requires hover, dragging or a multi-finger gesture without an alternative |
| **A5** Preferences and parity | Reduced motion turns off non-essential movement, and nothing flashes hazardously | Passphrase paste, autofill, password managers and a visible reveal all work | Core tasks work in Chromium, Firefox and iPhone Safari, with honest file fallbacks | Camera and contact features are detected; refusal or absence has an accessible alternative, and cameras stop on exit |

**Anchors:** 0 = core use excludes whole input methods or device groups. 3 = some labels and keyboard support, with frequent blockers. 5 = main desktop paths work; dialogs, phones or assistive technology have major gaps. 7 = most A/AA and device paths pass, with several bounded violations. 10 = every clause, backed by manual evidence.

**Evidence:**
- Run an automated scan of the tested scope, then do manual keyboard and screen-reader work. Record the WCAG criteria and contrast measurements.
- Test 200% text, a 1280-wide desktop at 400% zoom, real phone large text, and the open keyboard.
- Inspect hit rectangles, not icon sizes.
- Code: `index.html`, `src/styles/app.css`, `sheet.ts`, `dateInput.ts`, `valueField.ts`, `sensitive.ts` and `tags.ts`. An automated scan alone proves neither usability nor conformance.

**Common deductions:**
- A clickable `span` with no keyboard action fails A1a and A2a.
- Faint essential text fails A3a even if it's on-brand.
- "WCAG AA requires 44 px" is wrong: AA's minimum is 24 px, with exceptions.

### V. Visual craft and tone (4%)

**A 10:** calm presentation helps the person read a life and understand consequential actions. The owner's spare style holds in dense, empty and failing states. This area is judged from a fixed state gallery, not a grader's taste. Contrast belongs to A and wins over faintness.

| Row | a | b | c | d |
|---|---|---|---|---|
| **V1** Identity | The lowercase `you\|` mark matches `brand/logo/` and is legible at actual size | Coral `#FF5A36` is the accent, and other colors don't compete with it | The rounded system font stack renders with no remote font requests | The first page keeps its blank, focused name question and small load link |
| **V2** Hierarchy | Type sizes, spacing and grouping are consistent across home, area, card and composer | Each dialog has one clear primary action, or a deliberately neutral choice | Current, history, source and selection states are distinct and consistent | Long titles, Unicode, multi-line details and narrow screens wrap or truncate, with a way to see everything |
| **V3** Themes | Light and dark are designed throughout, including errors, imports, reveals and the keepsake viewer | System theme and the manual override both work, with no wrong-theme flash on load | Switching theme keeps input, view and focus | Hover, selected, disabled and raised states stay distinct in both themes |
| **V4** Restraint | Secondary hints stay quiet, with no competing banners or clutter | Motion orients or gives feedback and never delays the next action | Errors, the forgotten passphrase and empty periods use direct, respectful words | Big imports don't turn every item into a loud card; density suits browsing |
| **V5** Finish | The state gallery has no clipping, overlap or sideways overflow | Buttons, icons and fields share consistent geometry, alignment and spacing | Loading, empty, failed and disabled states are deliberately designed | Ordinary flows use plain words, with no schema keys, raw JSON or implementation errors |

**Anchors:** 0 = essential content unreadable, or no coherent structure. 3 = brand fragments in inconsistent screens. 5 = a coherent main path; dense, responsive or error states unfinished. 7 = consistent identity and most states, with several reproducible finish defects. 10 = every clause, across the gallery in both themes and sizes.

**Evidence:** capture every screen in A's tested scope at 390×844 and 1440×900, with long-content stress cases. Compare computed values and the rendered mark against `brand/logo/`, `index.html`, `src/styles/app.css` and `prototype/index.html`. The prototype is a reference, not a pixel-perfect mandate. Every claimed failure cites a screenshot and an element; "doesn't feel premium" is not evidence.

### R. Speed and reliability (4%)

**A 10:** a lifetime-scale record stays fast, releases reproducibly, and works without a network. Core Web Vitals give the loading and interaction targets; they never justify weakening encryption.

| Row | a | b | c | d |
|---|---|---|---|---|
| **R1** Release | A clean install and `npm test` succeed without hidden credentials or services | `npm run build` succeeds, including browser and server type checks, and outputs runnable static files | The production app exposes no unguarded development wipe tools (`?reset`, the dev button) | Built-app smoke journeys and deep-route reloads succeed without uncaught errors across the browser matrix |
| **R2** Lifetime scale | F5, including all keepsake bytes, loads and reopens within R3d's 10-second unlock limit and completes a durable encrypted save within 60 seconds, without truncation | Searching, filtering and sorting F5 takes 500 ms or less (75th percentile of 5 runs) | With F5, opening a card, changing view or returning from history gives feedback within 200 ms and usable content within 500 ms | Twenty area, card and filter cycles show no growing listeners or retained detached DOM |
| **R3** Measured speed | Cold landing/home LCP is 2.5 s or less under the lab profile | Session INP is 200 ms or less under the lab profile | Session CLS is 0.1 or less under the lab profile | Unlock, save and import acknowledge within 200 ms; F5 unlocks within 10 s; a 50,000-event import reaches review within 60 s; Cancel and navigation stay usable throughout |
| **R4** Offline and resume | After a documented first setup, an offline relaunch can unlock, browse, edit and save | File imports and the barcode reader work offline; VIN and Audible say clearly that they're unavailable | A network failure never blocks local card work or leaves an endless pending state | Backgrounding, refresh and tab close during work restore the last durable record and show pending changes accurately |
| **R5** Regression evidence | Automated tests check history rules and crypto round-trip, tamper and wrong-passphrase behavior | Automated or reproducible checks cover denied storage, interrupted writes and stale-writer conflicts | Import fixtures have inspectable expected outcomes for identity collisions, re-imports and manual-edit preservation | Docs explain static deployment, supported browsers and fallbacks, format versions and migration, limits, why each dependency exists, and how to run the checks, and the commands work on a clean machine |

**Measurement rules:**
- **Lab profile:** a named reference desktop and browser version, with 4× CPU slowdown, 1.6 Mbps down, 750 Kbps up and 150 ms latency. Pin the exact tool settings in the first report and reuse them.
- **Runs:** five independent cold sessions per measured screen. Report the fourth-sorted result (nearest-rank 75th percentile).
- **INP:** measure whole sessions with the same scripted interactions. Total Blocking Time is not INP.
- **F5 timings:** use the same reference hardware and 4× CPU setting with no network. Freeze 300 original keepsake files totalling 500,000,000 bytes in the manifest, with their individual sizes and hashes. Measure load/reopen from confirming the file/passphrase to a usable record, including file reading, decoding, key derivation and decryption. Measure save from the initiating edit or Save action to completion at the selected durable destination; include serialization, encryption, writing and close. For download/share, verify the completed file separately and never substitute a started download for durability. Exclude time spent waiting for the person's OS-dialog choices or an external provider, not app processing. Use five independent runs and the fourth-sorted result for both limits. Report key-derivation time separately but include it in the end-to-end total. Reopen the resulting record and verify all expected data and original-byte hashes. The 60-second save limit is this rubric's completion threshold, not a claim that any implementation has met it.
- **Phones:** add a real-device interaction check; emulation doesn't measure iPhone speed.
- **Field vs. lab:** Google's Core Web Vitals are field metrics; these are reproducible lab stand-ins, and passing them isn't field compliance. Never add remote telemetry to earn points.
- **Offline:** offline credit needs a documented, ordinary way to keep the app available locally (installed or saved static copy). An already-open tab doesn't count.
- If timing tools are unavailable, mark only those clauses U.

**Anchors:** 0 = no runnable, dependable release. 3 = a development demo runs, but release, offline and scale behavior is unreliable. 5 = normal built use and a meaningful test suite work, with big scale, offline or failure gaps. 7 = dependable release and lifetime use, with a few performance or regression gaps. 10 = every clause, using the fixed fixtures and conditions.

**Evidence:**
- Save the command logs, build manifests, console output, timing traces and fixture manifests.
- Go offline, close, relaunch and retry.
- During expensive work, try cancelling with the keyboard and by touch.
- Inspect `src/dev.ts` and the built output for reset behavior.
- Code: `src/main.ts`, routing, deferred import loading, `src/core/browse.ts`, `src/ui/area.ts`, `src/storage/*` and `vite.config.ts`.

**Common deductions:**
- A fast empty landing page doesn't establish F5 performance.
- A frozen UI during crypto or import fails R3d even when the result is correct.
- Never lower the key-derivation iterations to improve timings.

---

## 6. Path to 10

Every report ends with a ranked fix list:

1. **Cap triggers first.** They limit everything else.
2. **Then failed clauses, by value.** Use the clause values in section 2 (an H, P or S clause is worth 0.08), and group clauses one change would fix.
3. **Then U clauses**, with the evidence that would resolve each.

For each item, give the affected clauses or cap, the trigger, expected vs. actual, and the smallest outcome that would close it. Don't claim a proposed fix passes until its clauses are rerun.

---

## 7. Changing this rubric

- Each report names the rubric version it used. Grades are comparable only under the same rubric version, fixtures and measurement profile.
- Don't change the bar between commits quietly. A new requirement replaces or revises a clause and bumps the version; nothing unscored may block a 10.
- Product-vision questions are settled by the owner before grading, then recorded in section 1. An open vision question is never a U clause.
- When two graders split by more than 0.5 on an area because a clause was ambiguous, reword that clause in the next version.

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-08 | First version, agreed by Claude (Opus 5.5) and Codex (GPT-6.1 Sol, extra-high reasoning). Owner decisions: absolute-vision bar; Pat as persona; caps 3/3/4/3/4/6; notes, keepsakes and an optional future-access plan are part of the vision. |

---

## 8. Report template

Angle-bracket fields are blanks to fill in.

````markdown
# You grade — <YYYY-MM-DD>

Rubric: <version> · Commit: <sha> (<clean/dirty>) · Grader: <agent and model>
Environment: <OS, Node/npm, exact browsers and devices, viewports, themes, time zone, test clock>
Delivery: <static URL or local build; helper tested separately?>
Fixtures: <manifest hash> · Evidence folder: <path>
Status: <final / provisional, and why>

## Result
Demonstrated **<x.xx> / 10** · Possible <x.xx> / 10 · Controlling cap: <CAPn or none>
Unverified caps: <list or none> · U clauses: <count>

## Caps
| Cap | Demonstrated clear / triggered / unverified | Evidence and reproduction | Maximum applied |
|---|---|---|---|
| CAP1 | | | |
| CAP2 | | | |
| CAP3 | | | |
| CAP4 | | | |
| CAP5 | | | |
| CAP6 | | | |

## Areas
| Area | Weight | Passed | Failed | U | Demonstrated /10 | Possible /10 | Weighted | Key evidence |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| H | 16 | | | | | | | |
| P | 16 | | | | | | | |
| S | 16 | | | | | | | |
| U | 12 | | | | | | | |
| L | 12 | | | | | | | |
| C | 12 | | | | | | | |
| A | 8 | | | | | | | |
| V | 4 | | | | | | | |
| R | 4 | | | | | | | |

## Path to 10
<Ranked as in section 6.>

## Clause ledger (all 184)
| Clause | P / F / U | Observation or minimal reproduction | Evidence (file, test, log, code path:line) | Browser / viewport |
|---|---|---|---|---|
| H1a | | | | |

## Life checklist results (Appendix A, 50 items)
## Source contract results (Appendix B, every variant)
## Tasks
| Task | Phone | Desktop | Active time | Wrong turns | Explanation given | Agent walkthrough or observed person |
|---|---|---|---|---|---|---|

## Cap investigation log
## Commands, timings and accessibility measurements
## Comparison with the previous grade
<Same rubric, fixtures and profile? Clause-level changes only. Keep rubric/environment changes separate from product changes.>
````

A screenshot proves layout and visible state, not encryption or durability. A passing test proves its assertions, not every UI path. Trust claims cite both what the person sees and the storage or input boundary. Keep all fixtures synthetic, and sanitize network traces and helper logs.

---

## Appendix A — Life checklist (50 items)

Each item lists its minimum details. Any item may also have a date with year, month or day precision, unless it is a lasting fact. **Sensitive** details are optional and masked. Each numbered item contributes exactly one result. Where an item groups several cases, freeze the required examples in the shared manifest before grading and require every such example to pass; never split or reweight an item during scoring.

**About**
1. Legal name and former names: name, kind (birth, married, changed), since
2. Birth: date (any precision), place
3. Citizenship: country, since
4. Identity documents (passport, driver's licence, national ID): type, number *(sensitive)*, issuer, issued and expiry dates
5. Languages: language, ability
6. Emergency contacts: linked person, relationship, phone

**Health**
7. Conditions: name, since, ongoing or ended
8. Medications: name, dose with units, how often, since/until, status
9. Allergies: allergen, reaction, severity
10. Vaccinations: vaccine, date, dose number
11. Doctors and care providers: name, specialty, contact; linkable to conditions
12. Health insurance: insurer, plan, member ID *(sensitive)*, dates
13. Procedures and hospital stays: what, where, date
14. Measurements: blood type; height and weight as dated values
15. Care wishes: advance directive or organ-donor choice, and where the document is kept
16. Family health history: condition, linked relative

**Work**
17. Jobs: employer, role, since/until with partial dates; several at once allowed
18. Education: school, qualification, field, dates
19. Certifications and professional licences: name, issuer, number *(sensitive)*, dates
20. Military service: branch, rank, dates
21. Volunteering: organization, role, dates
22. Skills: skill, optional level

**Money**
23. Bank accounts: institution, type, masked number, opened/closed
24. Retirement and investment accounts: provider, type, masked reference
25. Loans and debts: lender, type (mortgage, car, student…), amount, dates
26. Credit cards: issuer, masked number, dates
27. Insurance policies (life, home, car): insurer, type, policy number *(sensitive)*, dates
28. Income: source, optional amount, dates
29. Tax records: tax year, who prepared it, where the return is kept (no tax calculations)

**Home**
30. Places lived: address, since/until, owned or rented
31. Vehicles: year, make, model, VIN *(sensitive)*, plate, dates owned
32. Important possessions: item, description, acquired date (a handful of things, not inventory software)
33. Household services: provider, masked account
34. Pets: name, species, dates

**People**
35. Partners and marriages: linked person, relationship (dating, married, divorced…), since/until
36. Children: linked person, birth date
37. Parents: linked person
38. Siblings: linked person
39. Friends: linked person, how you met, since
40. Important dates: birthdays, anniversaries and deaths of people in your life
41. Contact details: phone, email, address, current and past

**Interests**
42. Books: title, author, date read, rating
43. Films and shows: title, date watched, rating
44. Music and podcasts: artist or show, since
45. Hobbies and activities: what, since/until
46. Travel and places visited: place, dates

**Goals**
47. Goals: goal, target date, status (achieved, dropped…), renamed history kept
48. Milestones: what, date
49. Wishes for after death: funeral wishes, bequests, where the will is kept
50. Values and beliefs: free description

90% means at least 45 items pass.

## Appendix B — Source contracts

A source cell in C5/C6 passes only when every variant in its row works. These rows are format contracts for this rubric version, not a promise that a provider's export will never change. Freeze representative export versions in F3. If a provider changes its format, record which versions are supported and revise the fixtures explicitly.

| Source | Variants and minimum expected results |
|---|---|
| **Contacts** | vCard 3 and 4 with folded lines, accents and non-Latin text, several labeled phones and emails, a postal address, a birthday and an organization. The person's own contact ("This is me") creates About and Home facts; others create People cards. Two similar names never erase distinct people. |
| **LinkedIn** | The full archive zip and the loose Profile, Positions, Education and skills CSVs, including notes before the headers. Concurrent and ended jobs, partial dates and education are kept. A missing work export is stated clearly. |
| **Licence** | A synthetic AAMVA PDF417 barcode, both as a sharp or rotated photo and through the camera. The extracted name, birth date, licence number and address are reviewed. Blur, a wrong code, camera refusal and Cancel each have a safe next step. The image stays on the device and the camera stops when dismissed. |
| **VIN** | A typed VIN, plus barcode-photo help where offered. Before any request, consent names NHTSA and shows the VIN that will be sent; declining makes no request. A fixture response maps year, make, model, trim and fuel. An invalid VIN, a timeout or an incomplete response keeps manual input and invents nothing. Results go through review. |
| **Health** | C-CDA XML, FHIR Bundle JSON and NDJSON covering allergies, medications, conditions and immunizations. Dates, status, doses, units and negation keep their meaning. Missing evidence is "unknown", never "none", and no diagnosis is inferred from another field. |
| **Books and films** | Goodreads CSV, Letterboxd diary CSV and archive zip, and IMDb ratings CSV. Titles, authors or creators, ratings in the source's scale, dates and reading state are kept where present. Same-title editions and different works stay distinct. |
| **Streaming** | Netflix viewing CSV and archive; Spotify account and extended histories; the Apple Media Services zip, including the relevant nested archive; YouTube Music Takeout JSON. Plays roll up into show, movie, artist or podcast cards with correct first and latest dates and counts, the right profile, no double counting on repeat, and exclusions disclosed. |
| **Audible** | A versioned local library export and a helper sync response. Stable source IDs, authors and editions are kept, including when a work is renamed. Owned, likely owned, subscription and current availability remain distinguishable. Completion evidence and listening position remain separate from each other and from manual/general reading status; unknown is never asserted as finished or unread. A newer sync updates unchanged imported details with revisions, preserves manual corrections and deliberate clears, and keeps books missing from the later library. Test repeat, older and newer snapshots, then export and reopen. |

## Sources

Accessed 8 November 2026. These inform the clauses. The weights, caps, fixtures and extra thresholds are this rubric's own decisions, and a score implies no certification.

- Kleppmann, Wiggins, van Hardenberg and McGranaghan, [Local-first software: You own your data, in spite of the cloud](https://www.inkandswitch.com/essay/local-first/) (Ink & Switch, 2019): offline use, longevity, privacy and user control. Collaboration is out of scope for You.
- Nielsen Norman Group, [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): system status, error prevention, familiar language and recovery.
- OWASP, [Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html), [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) (PBKDF2-HMAC-SHA256: 600,000 iterations) and [Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).
- Library of Congress, [Sustainability of Digital Formats](https://www.loc.gov/preservation/digital/formats/sustain/sustain.shtml) and [Recommended Formats Statement: Datasets](https://www.loc.gov/preservation/resources/rfs/data.html): documented formats, provenance and low external dependency. The Library prefers unencrypted deposits. You keeps encryption as the default, so it must document independent decryption and offer a deliberate readable export.
- W3C, [WCAG 2.2](https://www.w3.org/TR/WCAG22/): contrast 1.4.3 and 1.4.11, reflow 1.4.10, target size 2.5.8 (24×24 CSS px), and accessible authentication 3.3.8.
- Google, [Web Vitals](https://web.dev/articles/vitals): LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1 at the 75th percentile, in the field.
- Day One, [Calendar view](https://dayoneapp.com/features/calendar-view/) and [Exporting entries](https://dayoneapp.com/guides/settings/exporting-entries/): date navigation, revisiting, and media kept with entries.
- Obsidian, [How Obsidian stores data](https://help.obsidian.md/data-storage): files that outlive the app.
- 1Password, [Emergency Kit](https://support.1password.com/emergency-kit/): planning access without a recovery service.
