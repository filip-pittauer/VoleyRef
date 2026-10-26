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
//  - knihovna Supabase je v js/vendor/ (žádné CDN) – patří k souborům webu
//  - Supabase (databáze, přihlášení): vůbec necachovat, vždy živě
//
// Po změně seznamu souborů zvyš číslo verze – stará mezipaměť se smaže.
const CACHE = 'voleyref-v41';

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
  'postaveni.html',
  'zkouska.html',
  'zapis.html',
  'hry.html',
  'vyuka.html',
  'procvicovani.html',
  'gesto-naopak.html',
  'rotacni-sprint.html',
  'odpiskej.html',
  'css/style.css',
  'css/fonts.css',
  'fonts/barlow-400-latin-ext.woff2',
  'fonts/barlow-400-latin.woff2',
  'fonts/barlow-600-latin-ext.woff2',
  'fonts/barlow-600-latin.woff2',
  'fonts/barlow-700-latin-ext.woff2',
  'fonts/barlow-700-latin.woff2',
  'fonts/barlow-condensed-700-latin-ext.woff2',
  'fonts/barlow-condensed-700-latin.woff2',
  'fonts/barlow-condensed-800-latin-ext.woff2',
  'fonts/barlow-condensed-800-latin.woff2',
  'js/account.js',
  'js/animation.js',
  'js/badges.js',
  'js/categories.js',
  'js/celebrate.js',
  'js/config.js',
  'js/court-scene.js',
  'js/daily-card.js',
  'js/daily-teaser.js',
  'js/games-hub.js',
  'js/points.js',
  'js/dom.js',
  'js/exam.js',
  'js/format.js',
  'js/gesture-atlas.js',
  'js/glossary.js',
  'js/gesture-data.js',
  'js/gesture-pose.js',
  'js/gesture-quiz.js',
  'js/leaderboard.js',
  'js/lineup-logic.js',
  'js/lineup-trainer.js',
  'js/math3d.js',
  'js/media.js',
  'js/player.js',
  'js/pwa.js',
  'js/quiz-api.js',
  'js/quiz-result.js',
  'js/report.js',
  'js/rules-search.js',
  'js/scoresheet-game.js',
  'js/scoresheet-model.js',
  'js/scoresheet-tasks.js',
  'js/scoresheet-trainer.js',
  'js/scoresheet-view.js',
  'js/quiz.js',
  'js/quiz-practice.js',
  'js/rotation-logic.js',
  'js/rotation-sprint.js',
  'js/whistle-game.js',
  'js/referee-figure.js',
  'js/rules-page.js',
  'js/scene-zoom.js',
  'js/stats.js',
  'js/stats-redirect.js',
  'js/supabase.js',
  'js/vendor/supabase-js-2.117.2.umd.js',
  'animace/podani-preslap.json',
  'animace/utok-zadni-rada.json',
  'animace/mic-antena.json',
  'slovnicek/pojmy.json',
  // ilustrace k otázkám (animace a SVG obrázky)
  'animace/q6-cloneni.json',
  'animace/q11-skupinovy-blok.json',
  'animace/q13-zadni-rada-doskok.json',
  'animace/q15-libero-predni-zona.json',
  'animace/q29-podani-postaveni.json',
  'animace/q41-mic-nad-stolkem.json',
  'animace/q42-vne-anteny-zpet.json',
  'animace/q43-vne-anteny-nahravka.json',
  'animace/q73-blok-nahravky.json',
  'animace/q101-dotyk-site-daleko.json',
  'animace/q103-blok-vne-anteny.json',
  'animace/q106-zadni-rada-blok.json',
  'animace/q108-blok-nahravky-pres-sit.json',
  'animace/q112-libero-zadni-zona.json',
  'animace/q114-zadni-rada-podel-site.json',
  'animace/q116-podani-vyskok.json',
  'animace/q117-podani-mimo-zonu.json',
  'animace/q130-vne-anteny-slapnuti.json',
  'animace/q131-vne-anteny-mezi.json',
  'animace/q177-podani-vne-anteny.json',
  'animace/q188-blok-odraz-aut.json',
  'animace/q191-zadni-rada-mimo-hriste.json',
  'img/otazky/201-hriste.svg',
  'img/otazky/212-sit-vyska.svg',
  'img/otazky/213-mereni-site.svg',
  'img/otazky/217-antenka.svg',
  'img/otazky/q1-podani-koncova-cara.svg',
  'img/otazky/q14-zadni-rada-nad-okrajem.svg',
  'img/otazky/q16-mic-o-antenu.svg',
  'img/otazky/q18-stredni-cara-pata.svg',
  'img/otazky/q20-dopad-postranni-cara.svg',
  'img/otazky/q32-nohy-pozice-4-5.svg',
  'img/otazky/q69-uder-podani-vysoko.svg',
  'img/otazky/q75-dotyk-site-vne-anteny.svg',
  'img/otazky/q95-ruka-za-stredni-carou.svg',
  'img/otazky/q98-mic-pod-siti.svg',
  'img/otazky/q105-blok-predlokti.svg',
  'img/otazky/q109-uder-nad-polem-soupere.svg',
  'img/otazky/q110-zadni-rada-pod-okrajem.svg',
  'img/otazky/q111-odraz-utocna-cara.svg',
  'img/otazky/q133-libero-smec-pod-okrajem.svg',
  'img/otazky/q185-prsty-u-site.svg',
  'img/otazky/q189-uder-podani-nizko.svg',
  'img/otazky/q198-stredni-cara-cele.svg',
  'gesta/gesta.json',
  'manifest.json',
  'img/ikony.svg',
  'img/icons/icon.svg',
  'img/icons/icon-192.png',
  'img/icons/favicon-32.png',
];

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
  }
  // vše ostatní (Supabase, Google…) jde přímo na síť bez zásahu
});

/** Nejdřív síť (a uložit do mezipaměti), bez sítě mezipaměť; stránka offline → úvod. */
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
