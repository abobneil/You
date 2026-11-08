# Offline release check — 8 November 2026

Windows, Node 24, headless Chrome 157.0.8103.39; production preview at
http://127.0.0.1:4174/. Disposable browser profile, synthetic record only.

Passed npm ci, npm test (174 tests), npm run build and npm run check:dist.
Verified npm run preview starts and serves the production app. Build has the
existing warning that theme-init.js is a classic external script; it is copied
and included in the precache.

Chrome DevTools Protocol check: loaded online, awaited serviceWorker.ready,
created Offline Test with a passphrase, switched Network.emulateNetworkConditions
to offline, reloaded, unlocked, edited the name to Offline Saved, waited for save,
reloaded offline and unlocked again. The edited name survived. Closed that tab,
opened a new about:blank tab in the same disposable profile, disabled networking
before navigating to the app, then unlocked Offline Saved successfully.
Cache inspection showed index.html, FORMAT.md, favicon, manifest, logo,
theme-init.js and the six hashed JS/CSS/WASM files, with no personal content.

This verifies tab close and offline relaunch, not an OS restart, real iPhone
installation, the complete R4 browser matrix, barcode decoding or F5 scale.
SVG-only manifest icons are provided; platform-specific install prompts remain
unverified. Registration failures are nonfatal and retried on the next launch.
The manifest link is injected into built index.html by docs/offline.ts, keeping
concurrently edited source markup untouched. Service workers require HTTPS or
localhost. Updates wait naturally for all old app windows to close; there is no
skipWaiting, claim or forced reload.

Network audit handoff (outside this agent's assigned files):
- src/core/import/vin.ts lookupVin fetch has no abort timeout. This can leave
  Looking it up… pending indefinitely in src/ui/details.ts. Add a timeout in
  the import-owned function and surface: Couldn't reach NHTSA. You can type the
  details yourself. Existing details.ts catch uses a generic connection message.
- src/ui/import/audibleLive.ts bounds every helper call with AbortSignal.timeout,
  and displays timeout failures, but unreachable fetch errors can surface raw
  browser text (Failed to fetch). Map these to a plain unreachable-helper message.
- No other client fetch paths were found. The worker ignores all non-allowlisted
  paths, methods other than GET, and cross-origin requests entirely.
