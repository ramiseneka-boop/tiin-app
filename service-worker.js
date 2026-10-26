// Increment on every production release so installed iPhone/Android PWAs do not
// keep an older application shell or an old, damaged hero image.
const CACHE_NAME = 'tiin-assets-35';
const APP_SHELL = [
  './manifest.json', './styles/tiin-v2.css', './styles/tiin-command-deck.css', './styles/tiin-polish.css',
  './src/tiin-v2.js', './src/tiin-currency.js',
  './src/tiin-multicurrency.js', './src/tiin-auth-handoff.js', './src/tiin-sync.js', './src/tiin-limits.js', './src/tiin-finance-coach.js', './src/tiin-command-deck.js', './src/tiin-deals.js', './src/tiin-settings.js', './src/tiin-reports.js', './icon-192.png', './icon-512.png',
  './assets/tiin-hero-morning.jpg', './assets/tiin-hero-day.jpg', './assets/tiin-hero-evening.jpg', './assets/tiin-balance-mountains.jpeg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Authentication redirects contain one-use codes; never persist them in caches.
  if (url.searchParams.has('code') || url.searchParams.has('tiin_auth_return') || url.pathname.includes('/auth/')) return;
  const isSameOrigin = url.origin === self.location.origin;
  if (url.href === 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js') {
    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
      if (response.ok || response.type === 'opaque') caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    })));
    return;
  }
  // Never put documents into Cache Storage. Some iOS/PWA combinations can
  // replay a compressed document body as text when an HTML response is read
  // back from a worker cache. Navigation must always use the network.
  if (isSameOrigin && event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() =>
      new Response('TIIN needs an internet connection to open.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      })
    ));
    return;
  }
  const isFreshAsset = /\.(?:js|css)$/i.test(url.pathname);
  if (isSameOrigin && isFreshAsset) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});
