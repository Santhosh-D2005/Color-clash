/**
 * Service worker for the installed app.
 *
 * The build it caches is now the ordinary web build — a small document plus
 * hashed script, style and image files — rather than one document with every
 * image inlined. That is the point of the change: the browser can fetch the
 * artwork in parallel and keep it across updates, instead of re-parsing 1.4 MB
 * of base64 on every cold start.
 *
 * Precaching therefore has to know what was emitted, so the file list is
 * written at build time by tools/build-pwa.ts rather than guessed here.
 *
 * Cache-first (not network-first) is the right call: the game is fully
 * offline-capable — nothing it renders comes from the network at runtime.
 * Online multiplayer uses a WebSocket, which a service worker does not
 * intercept, so an online match is unaffected by any of this.
 *
 * Both tokens below are rewritten at build time; changing the cache name is
 * what evicts an old build after an update.
 */
const CACHE = 'color-clash-__BUILD_ID__';

const SHELL = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // One missing icon should not abort the whole install, so each entry is
      // added individually and failures are tolerated.
      .then((cache) =>
        Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never touch cross-origin requests (the page links a web font); letting them
  // go straight to the network keeps this worker out of the way.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);

      // Cached copy immediately when we have one; the network copy refreshes
      // the cache for next launch.
      return hit || network;
    }),
  );
});
