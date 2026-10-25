# Historie a podrobnosti projektu

Podrobnosti, které nejsou potřeba v každém sezení (proto nejsou v CLAUDE.md).
Číst, když se pracuje na dané části.

## Fáze vývoje (všechny hotové kromě 7)
1. **Kostra webu:** stránky, navigace, základní responzivní CSS (mobile-first).
2. **Kvíz lokálně:** otázky z JSON, obrázky s popisem, A/B/C, skóre v prohlížeči.
3. **Supabase:** tabulky, RLS, přihlášení; otázky a správné odpovědi v databázi.
4. **Žebříček:** ukládání výsledků a stránka se žebříčkem.
5. **Animace:** SVG animace situací místo (nebo vedle) obrázků.
6. **PWA:** `manifest.json`, ikony, service worker.
7. **Vlastní doména** (volitelně, jméno zatím není).

Dál hotovo: statistiky, obtížnost, opakování chyb, denní výzva, odznaky (18, výběr 3 do žebříčku), gesta (balíček 4), vzhled „Svaz“, úplná pravidla (balíček 5), animace a detaily (balíček 6), README.md a CODEMAP.md, 200 otázek, trenažér postavení, mobilní úpravy, zkouška.
Uživatel na živém webu otestoval: přihlášení Google i e-mail, kvíz, žebříček, přezdívku, smazání účtu, obtížnost, opakování chyb, denní výzvu, odznaky, vzhled Svaz, pravidla, animace, mobilní verzi trenažéru a gest.

## Otázky (200, hotovo 21. 10. 2026)
- Všechny `aktivni: true` (před spuštěním je zkontroluje rozhodčí), 17–23 na kategorii, bez médií.
- Psané podle anglického PDF FIVB 2025–2028 (`pdftotext` z `https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf`). Postup nových otázek je ve skillu `nove-otazky` (`.claude/skills/nove-otazky/SKILL.md`).
- Kategorie `chovani` („Chování a tresty“): js/categories.js, tools/seed-otazky.mjs, kontrola `otazky_kategorie_check` v `sql/01_schema.sql` (drop + add), odznak Všestranný vyžaduje 10 kategorií.
- Limit **2 s na otázku** (dřív 3 s) pro žebříček, denní výzvu a „dokonalá“ kola: `sql/02`, `04`, `05`, `MIN_SECONDS_PER_QUESTION` v js/quiz.js.
- Nevyřešené: trest za porušení 12.5.3 (ruce nad hlavou při podání) pravidla výslovně neuvádějí – otázka 67 se ptá jen na zákaz; ověřit v Casebooku 2025.
- PDF k připomínkám (pro kamaráda rozhodčího): `private/testy/pravidla-pdf.mjs <výstup.pdf>`, `otazky-pdf.mjs <výstup.pdf>` (otázky se správnými odpověďmi – neveřejné).

## Zkouška (`zkouska.html`, 23. 10. 2026)
- Inspirace: veřejný test Komise rozhodčích MSKVS (kr-mskvs.cz, 132 otázek s výběrem ze 3–4 možností, hodně faktografie) a školení KVS (písemný test + ústní + praktická část; v testu i soutěžní řád – ten zatím neřešíme, není součást pravidel FIVB).
- 30 otázek, z každé kategorie 2–3 (`row_number() over (partition by kategorie)`), limit 30 min (+1 min tolerance na serveru), hranice 80 % = 24. Web odevzdá sám při 0:00. Volný pohyb mezi otázkami, mřížka přehledu, `<dialog>` potvrzení.
- Výsledek: prošel/neprošel, skóre, úspěšnost po kategoriích, vysvětlení (`js/quiz-result.js` sdílí s kvízem). Stuhy jen při splnění. Přihlášeným se ukládá (Profil → Zkoušky, `moje_statistiky().zkousky`), odznak „Zkouška složena“. Do žebříčku se nepočítá.
- Kategorie `hriste` („Hřiště a vybavení“, pravidla 1–4): 27 faktografických otázek (id 201–227). Zdroj také oficiální český překlad ČVS 2025–2028: https://www.cvf.cz/rs/obr/clanky/028/973/Pravidla_volejbalu_2025_2028_final_II.pdf
- Zástupné obrázky: `media: { typ: "obrazek", soubor: null, popis: "obrázek sítě…" }` → rámeček s popisem (js/media.js). Po dodání obrázku stačí doplnit `soubor`.
- Testy: `badges-db` (zkouška v DB), `e2e-zkouska` (průběh, ovládané hodiny pro odpočet, Profil), snímky `zkouska-shots.mjs <složka> [mobile]`.

## Trenažér zápisu (24. 10. 2026)
- `zapis.html`: výběr verze – krátká (10 úloh nad rozepsaným zápisem) a dlouhá (vedení celého setu). Vlastní zjednodušený zápis (pořadí podání I–VI, náhradníci, skóre střídání, ztráta podání, oddechové časy, libero, body, sankce) + malé hřiště. Bez DB.
- Logika `js/scoresheet-model.js` (bez DOM): rotace, střídání (15.6, 15.11), libero (19.3), oddechové časy, sankce (21.3 stupnice, 16.2 zdržování). Důsledky odmítnutí: neoprávněná žádost (15.11) poprvé jen zapsat, pak zdržování; žádost o nedovolené střídání a nedovolená výměna libera rovnou zdržování.
- Kontrolu pravidel udělal agent (rozhodčí); opravené: vyloučení nesmějí hrát/žádat (kapitán ve hře místo trenéra), po odmítnutí žádná další žádost v tomtéž přerušení, historie sankcí a oddechových časů při dřívějším skóre, úlohy ne v ukončeném setu, přesná čísla pravidel.
- Terminologie podle ČVS: 15.9 „nedovolené střídání“ (ne neoprávněné), 15.11 „neoprávněné žádosti“ – změněno i v pravidlech a slovníčku.
- Testy `scoresheet-logic` (pravidla + invarianty generátorů), `e2e-zapis`.

## Slovníček pojmů (24. 10. 2026)
- 61 oficiálních pojmů v `slovnicek/pojmy.json` (vlastními slovy podle našich pravidel). Generátor pravidel z nich dělá sekci Definice pojmů (`@slovnicek` v src/80-definice.txt), web bubliny (`js/glossary.js`).
- Bubliny: v pravidlech (první výskyt pojmu v každém pravidle) a ve vysvětlení po kole/zkoušce. V otázce před odpovědí ne (napovídalo by). Hovorové výrazy záměrně ne (uživatel chtěl jen oficiální).
- `tvary` = začátky slov, `=` na konci = celé slovo (blok= nechytá blokovat).

## Hledání v pravidlech (24. 10. 2026)
- `js/rules-search.js`: pole nahoře na pravidla.html, výsledky při psaní, Enter = první výsledek. Bez diakritiky, kmeny slov (blokování ≈ blok), slovníček hovorových výrazů (smeč → útočný úder, první zóna → přední zóna, žlutá karta → napomenutí, time out → oddechový čas).
- Chytré hledání podle významu probráno s uživatelem: embeddingy v prohlížeči (velký model, slabá čeština) nebo AI na serveru (Supabase Edge Function + Claude API, „Zeptej se pravidel“ – platí se za dotaz, limit, GDPR). Zatím nerozhodnuto, případně samostatný balíček.

## Ilustrace k otázkám (24. 10. 2026)
- 49 otázek má ilustraci: 22 animací shora, 5 scén postavení (`typ: "postaveni"`, 3D z trenažéru nebo shora, pod scénou zápis pozic), 22 SVG obrázků (z boku podél sítě s figurami-piktogramy a lupou na míč u horního okraje, detaily čar a chodidel shora, síť zepředu s anténkou).
- Výběr udělal agent (vybráno 45 + 4 ručně kreslené k otázkám o hřišti); druhý agent zkontroloval všech 49 přes Playwright (soulad se zadáním, neprozrazení odpovědi, mobil, tmavý režim) a nálezy jsou opravené.
- Pravidlo: ilustrace je vidět před odpovědí → nesmí ji prozradit. Proto nemají obrázek např. otázky na polohu zón a čar (205, 208, 209, 216), pořadí doteků nebo kvalitu odbití.
- Generátory v `private/obrazky/`: `animace.mjs` (oblouky míče, kontrola přechodu sítě), `diagramy.mjs` (dráha přes síť musí být nad páskou – jinak chyba), `media-otazek.mjs` (zapíše media do otazky.json). Kontrola vzhledu: `private/testy/media-shots.mjs <složka> [id,…]`, `arch.mjs` (arch snímků); test `e2e-media`.
- Engine animací: štítky hráčů (na straně od sítě), libero, značky, obdélníky, výřez; anténky nad hráči; míč ve výšce posunutý jen o 0,1·z (u antén je vidět, kde přechází síť).
- Náhled všech ilustrací s otázkami a odpověďmi na jedné stránce: `node private/obrazky/nahled.mjs` → `private/nahled-ilustraci.html` (neveřejné, v .gitignore), otevřít přes Live Server: http://127.0.0.1:5500/private/nahled-ilustraci.html
- Nápady na později: ilustrace ve vysvětlení po kole (tam smí ukázat i řešení – např. zóny, čáry).

## Knihovna Supabase a CSP (25. 10. 2026)
- **supabase-js je v repu** (`js/vendor/supabase-js-<verze>.umd.js`), ne z CDN: napadené CDN by nemohlo podstrčit kód a prohlížeč se nepřipojuje k dalšímu serveru (GDPR, stejně jako písma). Je to soubor `dist/umd/supabase.js` z npm balíčku beze změny – klasický skript s globální proměnnou `supabase`; `js/supabase.js` ho vloží jako `<script src>` a počká na něj (top-level await). `.gitattributes`: `js/vendor/**` bez převodu konců řádků, ať součet sedí.
- **Aktualizace knihovny:**
  1. Ve složce mimo repo: `npm pack @supabase/supabase-js@<verze>` (npm sám ověří integritu balíčku proti registru), rozbalit `tar xzf supabase-supabase-js-<verze>.tgz`.
  2. Ověřit: `sha256sum package/dist/umd/supabase.js` a porovnat se stejným souborem z jiného zdroje, např. `curl -s https://unpkg.com/@supabase/supabase-js@<verze>/dist/umd/supabase.js | sha256sum` (musí sedět).
  3. Zkopírovat do `js/vendor/supabase-js-<verze>.umd.js` (starý smazat), `package/LICENSE` → `js/vendor/supabase-js-LICENSE.txt`.
  4. Upravit cestu, verzi a SHA-256 v komentáři a v `script.src` v `js/supabase.js`, název v `APP_SHELL` v `sw.js` + zvýšit `CACHE`, CODEMAP.md.
  5. `node run-all.mjs` (hlavně e2e-profil, e2e-csp) a na živém webu vyzkoušet přihlášení e-mailem i přes Google.
- **Content Security Policy** (meta ve všech HTML, stejná): `default-src 'self'`, Supabase jen v `connect-src`, žádné `unsafe-inline`/`unsafe-eval`. Výjimky: `img-src data:` (podle zadání; dnes ho nic nepotřebuje). Přihlášení přes Google a odkaz z e-mailu jsou navigace (přesměrování), na ty se CSP nevztahuje; service worker spadá pod `script-src 'self'`. Kvůli CSP: inline skript ze `statistiky.html` → `js/stats-redirect.js`, `el(…, { style })` nastavuje styl přes CSSOM, `style=` v `img/otazky/217-antenka.svg` → třída `dg-antenna--thick`. `frame-ancestors` (ochrana proti vložení do cizího iframe) v meta nefunguje – jen v HTTP hlavičce, tedy až na vlastním hostingu.
- Testy: `e2e-csp` (všechny stránky anonym i přihlášený, přihlášení, Google, hlášení, inline SVG; kontrola, že sběr porušení funguje). Falešné Supabase v testech běží na adrese skutečného projektu (jinak by ho CSP zablokovala), požadavky obslouží `page.route` – na skutečný server nic neodejde.

## Hlášení chyb (23. 10. 2026)
- Odkaz „Nahlásit chybu“ u každé otázky ve výsledku kvízu a zkoušky, v kvízu gest ve zpětné vazbě po odpovědi a u chybných gest na konci. Typ chyby + nepovinný text (max. 1000 znaků). Hlásit jde i bez přihlášení.
- `sql/06_hlaseni.sql`: tabulka `public.hlaseni` (otázka NEBO gesto), funkce `nahlasit_chybu` (přihlášený: stejnou věc jednou, 20/h; nepřihlášení dohromady 50/h), pohled `private.prehled_hlaseni` se správnou odpovědí. Po smazání účtu hlášení zůstane bez vazby (on delete set null) – uvedeno v ochrana-udaju.html.
- Prohlížení: dashboard Supabase (Table Editor, schéma private → prehled_hlaseni; stav a poznámka v public → hlaseni). Admin stránka na webu případně později spolu se správou otázek.
- Kvíz gest načte supabase-js až při odeslání hlášení (`import()`), jinak funguje bez Supabase i offline.

## Balíček 4: gesta rozhodčích
- `gesta.html`: kvíz „Co znamená toto gesto?“ – 10 gest (nebo 5 u čárových), 4 možnosti ze stejné skupiny (přednostně z `zamena`), vyhodnocení hned po odpovědi (nic se neukládá). Jednoruká gesta se náhodně zrcadlí.
- `pravidla.html#signalizace`: přehled 32 gest (kotvy `#gesto-<id>`). Signalizace je v pravidlech 2025–2028 **pravidlo 30**.
- Ověřeno proti PDF FIVB (Diagram 11: 26 gest, 6a/6b a 25 rozdělené; Diagram 12: 5 signálů praporkem). Názvy vlastní.
- Postava: 3D model (paže = IK) promítnutý do SVG, vrstvy podle hloubky vůči ose těla. Ruka = jedna silueta (`drawHand`: obrysy, pak výplně, rýhy `.ref-crease`), dlaň s tloušťkou, pěst jako jeden „polštářek“, karta: celá ruka za kartou, vidět jen palec (`holdsCard`), jedna barva kůže. Výřez scény podle rozsahu pohybu (`fitViewBox`).
- Data gest: `gesta/gesta.json`, formátovat `node private/testy/fmt-gesta.mjs gesta/gesta.json`.
- Kontrola vzhledu: `private/testy/gesta-shots.mjs [id,…]` (arch fází do `shots/`), `hands-sheet.mjs <složka> [id,…]` (vektorové detaily rukou); dvě kola nezávislých agentů už proběhla.
- Uživatel chce postavy dál zlepšovat; kdyby to nestačilo, zvažuje **GSAP** nebo **Anime.js** – pozor, ty řeší časování/plynulost pohybu, ne kresbu postavy.
- Možná vylepšení: zpomalené přehrávání, smyčka, odznaky za gesta.

## Balíček 5: úplná pravidla
- 30 pravidel FIVB 2025–2028 vlastními slovy; české názvy podle staršího překladu ČVS (2009). Body „Soutěže FIVB“ odlišené poznámkou.
- Číslování 2025–2028: **25 rozhodčí pro video challenge, 26 rezervní rozhodčí**, zapisovatel 27, pomocný zapisovatel 28, čároví 29, znamení 30.
- Novinky 2025: postavení jen přijímajícího týmu (7.4), zákaz rukou nad hlavou při podání (12.5.3), prodloužený kontakt nad sítí (9.1.2.3), blok „bez ohledu na výšku doteku“ (14.1.1), sankce (urážlivé chování = vyloučení, agrese = diskvalifikace, vyloučený do šatny).
- Zdroj `private/pravidla-zdroj/src/*.txt` + `diagramy/*.html`; `node private/pravidla-zdroj/build.mjs pravidla.html` přepíše obsah mezi značkami a zkontroluje odkazy [[12.4.3]].

## Balíček 6: animace a detaily
Animace menu, výsledek kola v kruhu se stuhami (js/celebrate.js, od 60 %), přechody stránek (@view-transition), příjezd otázky, zpětná vazba v kvízu gest, žebříček s medailemi, plynulé rozbalení pravidel, čáry na úvodu, skeleton, odpočet denní výzvy. Vše vypnuté při `prefers-reduced-motion: reduce`. Uživatel nechtěl napočítání čísel a lesk odznaků v Profilu.

## Trenažér postavení (`postaveni.html`)
- Vlastní 3D v SVG (`createPerspective` v math3d.js), bez knihovny (three.js jen jako záloha).
- Pohledy 1. rozhodčí (stupínek u sloupku, oči 50 cm nad sítí) a 2. rozhodčí (u sloupku na straně přijímajících); po odpovědi shora (jen hřiště, čtverec) s čarami vztahů a čísly pozic.
- Odpověď = dvojice v porušeném vztahu, nebo „Postavení je správné“; generátor 0–1 porušený vztah, ~60 % chyb, rezerva 0,4 m. Kontroluje se jen přijímající tým.
- Mobil: `main.app-page`, scéna + zápis + tlačítka na jedné obrazovce, výběr klepnutím v zápisu, kamera zaměřená na hráče, čísla min. 6,5 % výšky scény, zoom dvěma prsty (`js/scene-zoom.js`), po vyhodnocení posun nahoru.
- Možná dolaďování: libero (jiný dres), odlišit podávajícího, obtížnost (menší rezerva), pátá dlaždice na úvodu sama na řádku.

## Odložené nápady
- Editor animací s „developer módem“ (animace by šly do DB) – zatím nerozhodnuto, jestli animace, nebo videa.
- Úvodní panel hráče s úrovní (jen v lokální větvi `styl-hala`, nikdy nepushovat).
- Supabase MCP jen pro čtení.
- Licence repa: zatím žádná – uživatel neřeší, nepřipomínat.

## Testování podrobně
- SQL: PGlite (Postgres ve WASM) s napodobeným Supabase (role anon/authenticated/supabase_auth_admin, `auth.users`, `auth.uid()` z `request.jwt.claim.sub`). `prechod-db.mjs` nasadí aktuální SQL na verzi z git HEAD (`old-sql/`, vytváří run-all) a spustí ho dvakrát.
- Prohlížeč: `playwright-core` + nainstalovaný Chrome, `http-server`, Supabase API obsloužené PGlite. V testech se blokují service workery a všechny požadavky na skutečný Supabase.
- Cesty jsou natvrdo: `ROOT` v `lib.mjs`, `OLD` v `*-db.mjs` (`private/testy/old-sql`).
- Jednorázové historické testy (nespouští je run-all): `migrate-db.mjs`, `daily-db.mjs`, `kategorie-db.mjs`, `e2e.mjs`, `pwa.mjs` (zastaralé).
- Playwright MCP (interaktivní prohlížení): scope **user** (`claude mcp add -s user playwright -- cmd /c npx @playwright/mcp@latest --browser chrome`, přidávat přes PowerShell – Git Bash přepisuje `/c`). Snímky ukládá do `.playwright-mcp/` (v .gitignore). Multitouch (pinch) neumí – na to skript `e2e-zoom.mjs`.
