/* Netronim offline app shell. User files live in IndexedDB, not in this cache. */
const CACHE = 'netronim-shell-v1';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/wasm/prism.wasm', '/wasm/pulse.wasm'];
// Replaced at build time with hashed app chunks and wallpapers for full offline launch.
const EXTRA = [];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...CORE, ...EXTRA])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('netronim-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put('/index.html', copy)); }
      return response;
    }).catch(() => caches.match('/index.html', { ignoreVary: true }).then(cached => cached || Response.error())));
    return;
  }
  if (/\.(?:js|css|svg|png|jpg|webp|nif|wasm|woff2?)$/.test(url.pathname)) {
    event.respondWith(caches.match(request, { ignoreVary: true }).then(cached => {
      if (cached) { const headers = new Headers(cached.headers); headers.set('Access-Control-Allow-Origin', '*'); return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers }); }
      return caches.open(CACHE).then(cache => fetch(request).then(response => { if (response.ok) cache.put(request, response.clone()); return response; }));
    }));
  }
});
