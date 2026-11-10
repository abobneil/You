/* Only build-time static assets belong in this cache. No runtime cache writes. */
const PRECACHE = __PRECACHE__;
const CACHE = 'you-shell-__VERSION__';
const urls = PRECACHE.map(path => new URL(path, self.registration.scope).href);
const shell = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls)));
  // Wait naturally until all old app windows close; never interrupt a session.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('you-shell-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Navigation always receives the static shell, including deep paths, queries and hashes.
  // Helper/API requests are never navigation requests and remain outside this cache.
  url.hash = '';
  url.search = '';
  // Downloads (the helper, its zip) are files, not app pages: let the network serve them as they are.
  if (url.pathname.includes('/downloads/')) return;
  const key = request.mode === 'navigate' ? shell : url.href;
  if (!urls.includes(key)) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(key)).then(hit => hit || fetch(request)));
});
