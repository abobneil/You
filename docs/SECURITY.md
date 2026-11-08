# Security checks

Checked 8 November 2026 with Node v24.16.0, npm 11.13.0, Vite 6.4.5 and Vitest 5.1.0.

`npm audit --omit=dev`: zero vulnerabilities before and after changes.
Initial full audit: four affected packages (one moderate, one high, two critical):
@vitest/mocker, vitest, @xmldom/xmldom and tinypool. Updated Vitest to 5.1.0
and xmldom to its current patched release; final `npm audit`: zero vulnerabilities.
These results describe the registry audit at this date, not a permanent guarantee.

Production CSP is injected by vite.config.ts only on build. public/_headers adds
frame-ancestors and response headers on hosts supporting that convention. Other
static hosts must configure those response headers themselves; meta cannot enforce
frame-ancestors. The early theme code is external public/theme-init.js. No production
style attributes or inline style writes were found, so no unsafe-inline is allowed.
WebAssembly compilation needs wasm-unsafe-eval; ordinary eval remains prohibited.

Searched src, index.html, public and dist for HTTP(S), CDN, fonts and analytics.
The VIN fetch uses exactly https://vpic.nhtsa.dot.gov, after confirmation. Audible
uses loopback /__you/audible/ endpoints on the local helper. Its Amazon URL
is an explicit sign-in link, validated as HTTPS www.amazon.com. Other source URLs
are test fixtures or SVG namespace identifiers, not requests. There are no remote
fonts or analytics. ZXing embeds a jsDelivr default URL in its library bundle, but
src/ui/import/scan.ts imports zxing_reader.wasm?url and calls prepareZXingModule
with locateFile before any decoding. Vite emits that WASM in dist/assets. Thus the
WASM path used by the app is same-origin; CSP also blocks the dormant CDN path.
This is static proof of the configured path, not a captured network trace.

Audited all HTML sinks and href/src writes in src. Person/import text uses esc or
textContent; esc escapes both quotes as well as &<>. Fixed raw record/link/profile
IDs in attribute contexts in area, cardView, composer, linkPicker, sensitive and
switcher (minimal security changes to concurrently owned UI). Constants provide
icons, sheet markup, gate help, import instructions and area hashes. Downloads use
locally created blob URLs. Name paste explicitly inserts a text node, including on
browsers without plaintext-only contenteditable support. dom.test.ts checks all
five escaped characters and hostile card-link text. The complete area renderer
imports live DOM/state modules, so its list renderer was audited statically rather
than run without a DOM.

crypto.test.ts covers hostile iteration counts, salt, IV, base64, size and hash;
validation runs before PBKDF2 and before decrypting with an existing key. Base64
ciphertext is capped at 256 MiB of encoded text (about 192 MiB bytes).
`npm run check:dist` rejects production dev reset markers. Run it after building.

No installed Playwright browser harness was available. Landing → create → home →
area → import hub CSP behavior and the actual request trace remain unverified in a
headless browser. Static build inspection verifies CSP precedes scripts, scripts
are external, styles are external, and local WASM exists. No browser pass is claimed.

Audible standalone helper: CSP permits http://127.0.0.1:49631. The API binds only
to IPv4 loopback and validates Host with its port. Exact configured app-origin
CORS plus custom-header preflight protects static deployments. Vite endpoints
require same-origin fetch metadata; the standalone API permits cross-site metadata
only for the configured app origin and preview (remote pages necessarily send it).
POST without Origin or fetch metadata is rejected. Disconnect deletes local vault
entries. Credentials and provider diagnostics are withheld from error logs.
