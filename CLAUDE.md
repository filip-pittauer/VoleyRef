# CLAUDE.md – Volejbal: trénink rozhodčích

## O projektu
Webová aplikace pro lidi, kteří se učí na volejbalové rozhodčí: kvíz z herních situací (A/B/C, skóre a vysvětlení na konci kola, žebříček), úplná pravidla FIVB 2025–2028 **vlastními slovy** (oficiální text nekopírujeme – autorská práva; diagramy vlastní SVG), kvíz gest rozhodčích, trenažér postavení, přihlášení, PWA.

Repo: https://github.com/filip-pittauer/VoleyRef · web: https://filip-pittauer.github.io/VoleyRef/

## Technologie
- **Frontend:** čisté HTML, CSS, JavaScript (ES moduly). **Žádný framework ani build krok.**
- **Animace:** SVG ovládané z JS podle dat (souřadnice v čase); vlastní 3D projekce (math3d.js).
- **Hosting:** GitHub Pages. **Backend:** Supabase (free, EU) – PostgreSQL, Auth, Data API přes `supabase-js` (v `js/vendor/`, ne z CDN); automatické RLS.
- **Vývoj:** VS Code + Live Server, Git + GitHub. Playwright MCP pro prohlížení webu.

## Struktura projektu
Podrobná mapa modulů, závislostí, RPC a toků je v **CODEMAP.md**.
```
CODEMAP.md          mapa kódu (moduly, importy, RPC, kotvy, „kam sáhnout“)
docs/historie.md    podrobnosti hotových částí, odložené nápady, testování podrobně – číst při práci na dané části
docs/pred-spustenim.md  kontrolní seznam před zveřejněním (OAuth, SMTP, e-mail, kontrola obsahu)
index.html          úvod / rozcestník
kviz.html           kvíz (+ karty gest a trenažéru)
pravidla.html       úplná pravidla: <details class="rule"> (kotvy #pravidlo-12, body #p-12-4-3), shrnutí s id
                    kategorií, diagramy #diagram-N; obsah mezi značkami generuje private/pravidla-zdroj/build.mjs
gesta.html          kvíz gest (jen prohlížeč, bez DB)
postaveni.html      trenažér postavení (jen prohlížeč; js/lineup-logic.js, court-scene.js, lineup-trainer.js)
zapis.html          trenažér zápisu: úlohy / vedení setu (jen prohlížeč; js/scoresheet-*.js)
zkouska.html        zkouška: 30 otázek / 30 min / 80 % (js/exam.js, režim 'zkouska' v zacni_kolo)
zebricek.html, ucet.html (Profil), ochrana-udaju.html, statistiky.html (jen přesměrování)
css/style.css       všechny styly (vzhled „Svaz“), css/fonts.css + fonts/ (písma offline kvůli GDPR)
js/                 moduly (viz CODEMAP.md); js/config.js = Supabase URL + publishable klíč
slovnicek/pojmy.json  slovníček pojmů (definice v pravidlech + bubliny)
gesta/gesta.json    gesta jako data; animace/*.json situace jako data
sql/                SQL pro Supabase (spouštět v pořadí 01, 02, …)
tools/              Node skripty (seed-otazky.mjs)
.claude/skills/     postupy pro Clauda (nove-otazky)
private/            NENÍ ve veřejném repu: vlastní SOUKROMÉ repo filip-pittauer/VoleyRef-private
                    (otazky.json se správnými odpověďmi, testy/, pravidla-zdroj/)
```

## Formát otázky
Platí pro `private/otazky.json` i DB (`public.otazky` + `private.otazky_reseni`).
```json
{ "id": 1, "aktivni": true, "kategorie": "podani", "obtiznost": 1,
  "situace": "Popis situace…",
  "media": { "typ": "obrazek", "soubor": "img/podani-01.png", "popis": "alt text" },
  "odpovedi": { "A": "…", "B": "…", "C": "…" }, "spravna": "B",
  "vysvetleni": "…", "pravidlo": "12.4.3", "verze_pravidel": "2025" }
```
- `aktivni: false` = koncept, v kvízu se nezobrazí. Otázky se nemažou, jen deaktivují.
- `kategorie`: `podani`, `prijem-nahravka`, `utok`, `blok`, `dotyky-chyby`, `rotace-postaveni`, `stridani`, `preruseni-hry`, `chovani`, `signalizace`, `hriste` (český název až v UI).
- `obtiznost` 1–3; `media` null nebo `obrazek` | `video` | `animace` | `postaveni` (3D scéna, hráči v datech); `odpovedi` 2–4 (A–D), právě jedna správná. Ilustrace se ukazuje před odpovědí – nesmí ji prozradit (generátory v `private/obrazky/`).
- `obrazek` se `soubor: null` = zástupný rámeček s textem `popis` (obrázek dodá uživatel nebo se nakreslí SVG).
- Správná odpověď se hráči ukazuje **až na konci kola**. Jen halový volejbal. Tlačítko „Nevím“ nebude.
- `private/otazky.json` je jediný zdroj; `node tools/seed-otazky.mjs` vytvoří `private/seed-otazky.sql` (upsert) pro SQL editor Supabase. Postup přidání otázek: skill **nove-otazky**.

## Bezpečnostní pravidla (důležité)
- Do repa a frontendu jen **Project URL** a **publishable klíč** Supabase. **Nikdy** heslo k DB ani `service_role`. Repo je veřejné.
- Každá tabulka má **RLS** s explicitními pravidly.
- **Deny by default** (sql/01, konec): nové tabulky, sekvence a funkce v `public` nemají pro web (`anon`, `authenticated`) žádná výchozí práva a nové funkce ani EXECUTE pro `PUBLIC`. Každý grant musí být výslovně ve skriptu, který objekt vytváří.
- **Skóre počítá server** (Postgres RPC `zacni_kolo` / `odevzdej_kolo`), prohlížeč posílá jen odpovědi.
- Správné odpovědi nesmí být čitelné z frontendu (žádný `SELECT` pro `anon`/`authenticated`).
- Co nejméně osobních údajů (přezdívka, e-mail); zásady GDPR v ochrana-udaju.html.

## Konvence kódu
- **Nový soubor webu (HTML/JS/CSS/animace) přidat do `APP_SHELL` v `sw.js` a zvýšit verzi `CACHE`.** Při změně existujících souborů webu `CACHE` taky zvýšit.
- **Content Security Policy** je `<meta http-equiv="Content-Security-Policy">` v každém HTML zvlášť (GitHub Pages neumí hlavičky): nová stránka = zkopírovat CSP, nová externí služba = upravit CSP ve všech stránkách stejně. Žádné inline `<script>`, `onclick=`, `style="…"` (ani ve vložených SVG) – styly třídou v CSS, z JS přes `element.style`/`el(…, { style })`. Hlídá test `e2e-csp`.
- **CODEMAP.md držet aktuální** (soubor, modul, export, RPC, tabulka) ve stejném commitu.
- Navigace: Kvíz, Gesta, Pravidla, Žebříček, Profil (úvod přes logo); max. 5 položek. Hlavička a navigace jsou v každém HTML zvlášť – při změně upravit všechny stránky.
- UI česky; názvy v kódu anglicky, komentáře česky.
- Sémantické HTML, přístupnost, mobile-first CSS, CSS proměnné pro barvy. Stránky her mají `main.app-page` (kompaktní na mobilu).
- Obsah jako data (JSON / DB), ne natvrdo v kódu. Malé, čitelné soubory a funkce, žádné zbytečné závislosti.
- **Standard kódu:**
  - JSDoc (`/** … */`) u každé exportované funkce a u funkcí, které nejsou na první pohled jasné; `@param`/`@returns` tam, kde typ není zřejmý.
  - Komentáře česky a vysvětlují **proč**, ne co.
  - Funkce do ~60 řádků, jinak rozdělit.
  - Před commitem `npm run lint` bez chyb (ESLint, `eslint.config.mjs`; varování o složitosti/délce zatím ok). `x == null` je povolený idiom (null i undefined), jinak `===`.
  - Formát souborů: `.editorconfig` (UTF-8, LF, 2 mezery).

## Jak se mnou pracovat
- Komunikuj **česky**.
- Jsem nejsilnější v C#, JavaScript a CSS znám základně. U JS a webových konceptů **vysvětli, proč** se něco dělá; kde pomůže, srovnej s C#.
- Před větší změnou (nová knihovna, změna struktury, změna DB schématu) se nejdřív zeptej.
- SQL piš pro SQL editor v dashboardu Supabase a vysvětli, co dělá. **Všechny soubory v `sql/` musí jít spustit opakovaně** (`if not exists`, `create or replace`, `add column if not exists`, při změně parametrů funkce nejdřív `drop function if exists`). Po změně SQL přesně napsat, které soubory spustit a v jakém pořadí.
- Větší práci dělit do **balíčků**; po každém commit + push a nechat mě vyzkoušet na živém webu. Když řeknu „nepushuj“, commitovat a pushnout až na pokyn.
- Lokální větev `styl-hala` je **jen na mém disku – nikdy ji nepushovat**.

## Testy
Ve `private/testy/` (soukromé repo, knihovny nainstalované, `node_modules` ignorované):
- `node run-all.mjs` – všechny aktuální testy (SQL v PGlite, prohlížeč přes playwright-core), vypíše jen souhrn a selhané kontroly; `node run-all.mjs e2e` jen vybrané. Sám si vytvoří snímek SQL z git HEAD pro test přechodu.
- Před nasazením změn SQL vždy otestovat přechod ze stávající verze (`prechod-db`) a dvojí spuštění.
- V testech se blokuje service worker a každý požadavek na skutečný Supabase.
- Podrobnosti a nástroje na kontrolu vzhledu (snímky gest, PDF pro rozhodčího): docs/historie.md.

## Aktuální stav (22. 10. 2026)
- Hotovo a na živém webu: fáze 1–6, kvíz (200 otázek, 10 kategorií, obtížnost, opakování chyb, denní výzva, odznaky, limit 2 s na otázku), pravidla, gesta (přepracovaná postava), trenažér postavení, mobilní verze her. V Supabase spuštěné SQL `01`–`05` a seed všech 200 otázek.
- Zkouška (zkouska.html, kategorie `hriste` s 27 otázkami) je na živém webu, SQL spuštěné.
- Hlášení chyb (js/report.js, sql/06) je na živém webu.
- Ilustrace u 49 otázek jsou na webu (generátory v private/obrazky/, náhled private/obrazky/nahled.mjs).
- Hledání v pravidlech (js/rules-search.js) je na webu.
- Slovníček pojmů (slovnicek/pojmy.json, js/glossary.js) je na webu.
- **Kde jsme skončili (24. 10. 2026):** trenažér zápisu (zapis.html, krátká a dlouhá verze, js/scoresheet-*.js), pravidla zkontrolovaná agentem. Testy 26/26.
- **Bezpečnost hotová (25. 10. 2026):** denní výzva bez prozrazení řešení, výchozí práva „deny by default“ (test prava-db), supabase-js v js/vendor/ + CSP (test e2e-csp), zásady GDPR. Odložené (známá omezení dema): docs/pred-spustenim.md.
- **Čitelnost (od 25. 10. 2026, už bez druhé session):** krok 1 ESLint + .editorconfig, krok 2 komentáře (JSDoc u funkcí, obsah v css/style.css). Další: 12 varování o složitosti/délce funkcí (`npm run lint`), pak předávací dokumentace a audity.
- **Kde jsme skončili (26. 10. 2026):** prototyp animací `prototyp/animace.html` (A = SVG, B = Three.js; podrobnosti docs/historie.md). Na PC je B mnohem hezčí. Pády B na mobilu (PowerVR) způsobovalo `setSize` v každém snímku. Po opravě B na mobilu běží se stíny. **Prototyp odložen**, otevřené body v docs/historie.md: ověřit vysokou kvalitu, B ve velké scéně, rozhodnout A/B. Pak přeanimovat situace, minihry (Učebna/Hala, „Odpískej to!“, duely).
- **Otevřené body:**
  - V budoucnu AI hledání „Zeptej se pravidel“ (Supabase Edge Function + Claude API) – uživatel chce, samostatný balíček.
  - Obrázky k otázkám `hriste` (zástupné rámečky): dodá uživatel, nebo nakreslíme SVG.
  - Počet hráčů v týmu: anglická pravidla 4.1.1 = 12 (14 jen soutěže FIVB dospělých), oficiální český překlad ČVS = 14; ověřit u rozhodčího.
  - Animace postav (gesta) uživatel chce dál zlepšovat; záložní nápad GSAP / Anime.js (viz docs/historie.md).
  - Text pravidel a otázky zkontroluje zkušený rozhodčí (uživatel zařídí).
  - Před zveřejněním: docs/pred-spustenim.md (OAuth, Client secret, SMTP čeká na doménu, jméno webu zatím není).
