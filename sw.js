// Service worker – běží na pozadí mezi stránkou a sítí.
// Ukládá soubory webu do mezipaměti (Cache Storage), takže se web
// načte rychle a pravidla jdou číst i bez internetu.
//
// Strategie:
//  - soubory našeho webu: nejdřív síť (vždy aktuální verze), bez sítě z mezipaměti.
//    Síť se ptá s cache: 'no-cache' – prohlížeč se vždy zeptá serveru, jestli
//    nemá novější verzi (nezměněný soubor = krátká odpověď 304). Bez toho by
//    prohlížeč mohl 10 minut používat starý soubor z HTTP cache a smíchat
//    staré a nové moduly (import pak selže a stránka nefunguje).
//  - knihovny z CDN s pevnou verzí: nejdřív mezipaměť (nemění se)
//  - Supabase (databáze, přihlášení): vůbec necachovat, vždy živě
//
// Po změně seznamu souborů zvyš číslo verze – stará mezipaměť se smaže.
const CACHE = 'voleyref-v6';

const APP_SHELL = [
  './',
  'index.html',
  'kviz.html',
  'pravidla.html',
  'zebricek.html',
  'ucet.html',
  'ochrana-udaju.html',
  'statistiky.html',
  'gesta.html',
  'css/style.css',
  'js/account.js',
  'js/animation.js',
  'js/badges.js',
  'js/categories.js',
  'js/config.js',
  'js/dom.js',
  'js/format.js',
  'js/gesture-atlas.js',
  'js/gesture-data.js',
  'js/gesture-pose.js',
  'js/gesture-quiz.js',
  'js/leaderboard.js',
  'js/math3d.js',
  'js/media.js',
  'js/player.js',
  'js/pwa.js',
  'js/quiz-api.js',
  'js/quiz.js',
  'js/referee-figure.js',
  'js/stats.js',
  'js/supabase.js',
  'animace/podani-preslap.json',
  'animace/utok-zadni-rada.json',
  'animace/mic-antena.json',
  'gesta/gesta.json',
  'manifest.json',
  'img/icons/icon.svg',
  'img/icons/icon-192.png',
  'img/icons/favicon-32.png',
];

const CDN = 'https://cdn.jsdelivr.net/';

// Instalace: stáhnout a uložit základní soubory.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' = stáhnout ze serveru, ne z HTTP cache prohlížeče
      .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())   // nová verze se aktivuje hned
  );
});

// Aktivace: smazat mezipaměti starších verzí.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (request.url.startsWith(CDN)) {
    event.respondWith(cacheFirst(request));
  }
  // vše ostatní (Supabase, Google…) jde přímo na síť bez zásahu
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // ignoreSearch: stránka s parametry v URL se najde i bez nich
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match('index.html');
    throw new Error(`Offline a není v mezipaměti: ${request.url}`);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
