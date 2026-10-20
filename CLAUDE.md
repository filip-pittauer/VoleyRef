# CLAUDE.md – Volejbal: trénink rozhodčích

## O projektu
Webová aplikace pro lidi, kteří se učí na volejbalové rozhodčí. Uživatel vidí herní situaci (jeden odehraný míč), rozhodne, jak má rozhodčí postupovat (odpověď A/B/C), a na konci kola dostane skóre. Nejlepší výsledky jsou v žebříčku.

Hlavní části:
- **Kvíz:** kolo má ~10 otázek. Každá otázka ukazuje situaci jako animaci, video nebo obrázek s popisem a nabízí odpovědi A/B/C. Na konci se zobrazí skóre a vysvětlení správných odpovědí.
- **Pravidla („knížka“):** přehled pravidel volejbalu s vlastním vysvětlením a obrázky. Oficiální text pravidel nekopírujeme celý (autorská práva, změny). Píšeme vlastní vysvětlení a odkazujeme na oficiální pravidla (ČVS/FIVB).
- **Přihlášení:** registrace a přihlášení hráčů.
- **Žebříček:** nejlepší skóre přihlášených hráčů.
- **PWA:** web půjde nainstalovat na mobil jako aplikace.

## Technologie
- **Frontend:** čisté HTML, CSS a JavaScript (ES moduly). **Žádný framework** (React apod.) ani build krok, dokud to nebude opravdu potřeba.
- **Animace situací:** SVG ovládané přes JS/CSS. Hřiště, hráči a míč jsou samostatné SVG prvky a pohyb se řídí daty (souřadnice v čase). Záložní varianta: obrázek nebo krátké video.
- **Hosting:** GitHub Pages (statický web, HTTPS zdarma). Později možná vlastní doména.
- **Backend:** Supabase (hostovaný, free plán, region Evropa)
  - PostgreSQL databáze
  - Supabase Auth (přihlášení)
  - Data API přes knihovnu `supabase-js` (načtená z CDN)
  - Projekt je založený se zapnutým Data API, automatickým zpřístupněním nových tabulek a **automatickým RLS**
- **Vývoj:** VS Code + rozšíření Live Server (Ritwick Dey), Git + GitHub.

## Struktura projektu
```
index.html          úvodní stránka / rozcestník
kviz.html           kvíz
pravidla.html       knížka pravidel (kapitoly mají id = kategorie otázek)
zebricek.html       žebříček
statistiky.html     jen přesměrování na Profil (staré odkazy a záložky)
gesta.html          kvíz gest rozhodčích (jen v prohlížeči, bez DB; přístup z kviz.html a úvodu)
ucet.html           Profil: přihlášení, registrace, statistiky (js/stats.js, RPC moje_statistiky),
                    nastavení účtu, smazání účtu (adresa zůstává kvůli odkazům z Supabase)
ochrana-udaju.html  zásady ochrany osobních údajů (GDPR)
css/style.css       společné styly
js/config.js        Supabase URL + publishable klíč (veřejné)
js/supabase.js      klient Supabase (supabase-js z CDN), pomocné funkce pro přihlášení
js/quiz-api.js      volání RPC zacni_kolo / odevzdej_kolo
js/badges.js        názvy a ikony odznaků (podmínky jsou v sql/05_odznaky.sql)
js/player.js        přehrávač animací (play/pauza, posuvník) – pro situace i gesta
js/referee-figure.js  postava rozhodčího v SVG (3D model promítnutý do 2D); gesture-pose.js
                    počítá polohu paží z dat, math3d.js vektory/IK/interpolace
js/                 další moduly (quiz.js, gesture-quiz.js, gesture-atlas.js, account.js, dom.js, …)
img/                obrázky situací, img/icons/ ikony aplikace (zdroj icon.svg),
                    img/ikony.svg ikony navigace (symboly pro <use>)
manifest.json       PWA manifest
sw.js               service worker (mezipaměť, offline)
animace/            SVG animace situací jako JSON (formát v animace/README.md)
gesta/              gesta rozhodčích jako data (gesta.json, formát v gesta/README.md)
sql/                SQL pro Supabase (spouštět v SQL editoru v pořadí 01, 02, …)
tools/              pomocné skripty pro Node (např. seed-otazky.mjs)
private/            NENÍ v repu: otázky se správnými odpověďmi
```

## Formát otázky
Platí pro `private/otazky.json` i DB (tabulky `public.otazky` + `private.otazky_reseni`).
```json
{
  "id": 1,
  "aktivni": true,
  "kategorie": "podani",
  "obtiznost": 1,
  "situace": "Popis situace…",
  "media": { "typ": "obrazek", "soubor": "img/podani-01.png", "popis": "alt text" },
  "odpovedi": { "A": "…", "B": "…", "C": "…" },
  "spravna": "B",
  "vysvetleni": "…",
  "pravidlo": "12.4.3",
  "verze_pravidel": "2025"
}
```
- `aktivni`: koncept pro autora. Otázky s `false` se v kvízu nezobrazují (např. neověřená odpověď).
- `kategorie`: jedna hlavní kategorie, identifikátor bez diakritiky (`podani`, `prijem-nahravka`, `utok`, `blok`, `dotyky-chyby`, `rotace-postaveni`, `stridani`, `preruseni-hry`, `signalizace`). Český název se doplní až v UI.
- `obtiznost`: 1–3.
- `media`: `null`, nebo objekt s `typ` (`obrazek` | `video` | `animace`), `soubor` a `popis` (alt text).
- `odpovedi`: 2–4 možnosti, klíče A–D. Právě jedna správná (`spravna`).
- `verze_pravidel`: rok vydání pravidel, ke kterému se otázka vztahuje (při změně pravidel se otázky dají najít a zkontrolovat).
- Správná odpověď se hráči ukazuje **až na konci kola**, ne po každé otázce.
- Jen halový (šestkový) volejbal. Tlačítko „Nevím“ pro hráče nebudeme dělat.

### Kde otázky leží
- `private/otazky.json` – **plná sada se správnými odpověďmi**. Složka `private/` je v `.gitignore` a nesmí do veřejného repa. Je jen na disku autora (zálohovat!).
- Databáze: `node tools/seed-otazky.mjs` zkontroluje JSON a vytvoří `private/seed-otazky.sql` (upsert), které se vloží do SQL editoru Supabase. Otázky se nemažou, jen se nastaví `aktivni: false`.

## Postup vývoje (fáze)
Každá fáze končí funkční verzí, kterou jde nasadit na GitHub Pages.
1. **Kostra webu:** stránky, navigace, základní responzivní CSS (mobile-first).
2. **Kvíz lokálně:** otázky z `data/otazky.json`, obrázky s popisem, A/B/C, skóre spočítané v prohlížeči.
3. **Supabase:** tabulky, RLS pravidla, přihlášení. Otázky a správné odpovědi se přesunou do databáze.
4. **Žebříček:** ukládání výsledků a stránka se žebříčkem.
5. **Animace:** SVG animace situací místo (nebo vedle) obrázků.
6. **PWA:** `manifest.json`, ikony, service worker.
7. **Vlastní doména** (volitelně).

## Bezpečnostní pravidla (důležité)
- Do repa a frontendu patří jen **Project URL** a **anon/publishable klíč** Supabase. **Nikdy** heslo k databázi ani `service_role` klíč. Repo je veřejné.
- Každá tabulka musí mít **RLS** s explicitními pravidly (např. žebříček čte každý, výsledek zapisuje jen přihlášený uživatel sám za sebe).
- **Skóre počítá server, ne prohlížeč.** Od fáze 3 jsou správné odpovědi jen v databázi a body počítá databázová funkce (Postgres RPC), které frontend posílá odpovědi uživatele. Prohlížeč nesmí poslat přímo „mám X bodů“.
- Správné odpovědi nesmí být čitelné z frontendu (žádný `SELECT` na ně pro role `anon`/`authenticated`).
- Ukládáme co nejméně osobních údajů (přezdívka, e-mail pro přihlášení). Kvůli GDPR přidat stránku se zásadami ochrany osobních údajů.

## Konvence kódu
- **Nový soubor webu (HTML/JS/CSS/animace) přidat do `APP_SHELL` v `sw.js` a zvýšit verzi `CACHE`.**
- Navigace: Kvíz, Gesta, Pravidla, Žebříček, Profil (úvod přes logo). Na mobilu dolní lišta s ikonami, od 48rem řádek v hlavičce. Víc než 5 položek se do lišty nevejde.
- Hlavička a navigace jsou v každém HTML souboru zvlášť (bez build kroku) – při změně upravit všechny stránky.
- Texty v UI jsou česky. Názvy proměnných a funkcí v kódu anglicky, komentáře česky.
- Sémantické HTML, přístupnost (alt texty, popisky formulářů, ovladatelnost klávesnicí).
- Mobile-first CSS, CSS proměnné pro barvy.
- Obsah (otázky, situace animací) držet jako data (JSON / DB), ne natvrdo v kódu, aby šly přidávat bez programování.
- Malé, čitelné soubory a funkce. Žádné zbytečné závislosti.

## Jak se mnou pracovat
- Komunikuj **česky**.
- Jsem nejsilnější v C#, JavaScript a CSS znám základně. U JS a webových konceptů **vysvětli, proč** se něco dělá, nejen co. Kde to pomůže, ukaž srovnání s C#.
- Postupuj po malých krocích, které jde hned vyzkoušet v prohlížeči přes Live Server.
- Před větší změnou (nová knihovna, změna struktury, změna DB schématu) se nejdřív zeptej.
- SQL pro Supabase (tabulky, RLS, funkce) piš tak, abych ho mohl vložit do SQL editoru v dashboardu, a vysvětli, co dělá.
- **Všechny soubory v `sql/` musí jít spustit opakovaně** (`if not exists`, `create or replace`, `add column if not exists`, při změně parametrů funkce nejdřív `drop function if exists` staré signatury). Změny se dělají přímo v nich a uživatel je po změně spustí znovu v pořadí 01, 02, 03… Před nasazením otestovat přechod ze stávající verze (git HEAD) na novou.

## Aktuální stav (konec práce 20. 10. 2026)
- Repo: https://github.com/filip-pittauer/VoleyRef, web: https://filip-pittauer.github.io/VoleyRef/
- Hotovo: fáze 1–6, knížka pravidel, statistiky, obtížnost, opakování chyb, denní výzva, odznaky (18, výběr 3 do žebříčku), **gesta rozhodčích** (balíček 4 – čeká na vyzkoušení uživatelem).
- Otestováno uživatelem na živém webu: přihlášení Google i e-mail, kvíz, žebříček, přezdívka, smazání účtu, obtížnost, opakování chyb, denní výzva, odznaky.
- V Supabase je spuštěné všechno SQL `01`–`05` (aktuální verze z repa, stav 20. 10. 2026). Gesta žádné SQL nepotřebují.

### Jak s uživatelem pracujeme
- Větší práci dělit do **balíčků**; po každém commit + push, zastavit se a nechat uživatele vyzkoušet na živém webu, než se jde dál.
- Po změně SQL vždy přesně napsat, které soubory má spustit a v jakém pořadí.
- Nezodpovězená otázka: limit **3 s na otázku** pro žebříček (ochrana proti botům) – nechat, nebo snížit na 2 s?

### Balíček 4: gesta rozhodčích (hotovo 20. 10. 2026, čeká na vyzkoušení)
- `gesta.html`: kvíz „Co znamená toto gesto?“ – 10 gest (nebo 5 u čárových), 4 možnosti ze stejné skupiny (přednostně gesta z pole `zamena`), **vyhodnocení hned po každé odpovědi** (nic se neukládá, takže na rozdíl od hlavního kvízu není co prozradit). Jednoruká gesta se náhodně zrcadlí. Výsledek: skóre + chybná gesta s animací.
- `pravidla.html#signalizace`: přehled všech 32 gest s animacemi (kotvy `#gesto-<id>`), nahradil textový seznam. Signalizace je v pravidlech 2025–2028 **pravidlo 30** (dřív 28).
- Seznam a popisy ověřené proti PDF FIVB 2025–2028 (Diagram 11: 26 gest, 6a/6b a 25 rozdělené na napomenutí/trest; Diagram 12: 5 signálů praporkem). Oficiální český překlad pravidel 2025–2028 jsem nenašel – názvy jsou vlastní, navazují na knížku pravidel.
- Postava: jednoduchý 3D model (paže = inverzní kinematika, ruka s prsty a dlaní), promítnutý do SVG; kreslí se podle hloubky (ruka za zády je schovaná). Gesta jsou jen data – nové gesto = záznam v `gesta/gesta.json`.
- Možná vylepšení podle zpětné vazby: zpomalené přehrávání, smyčka, odznaky za gesta (chtělo by ukládání na server).

### Odložené / nápady
- **Trenažér postavení** (uživatel ho chce, ale později; bez DB, jen v prohlížeči): SVG hřiště, 6 hráčů přijímajícího týmu v okamžiku podání + karta sestavy (pozice I–VI → čísla dresů). Hráč klikne na hráče v chybě postavení, nebo „Postavení je správné“. Situace generovat náhodně kódem, pravdu počítat z geometrie (vztahy předních/zadních 4–5, 3–6, 2–1 a bočních 4–3, 3–2, 5–6, 6–1; okraj nejistoty ≥ 0,4 m). Po odpovědi ukázat porušené vztahy. Přístup z kviz.html (karta) a z úvodu; navigace se nerozšiřuje.
  - Zjištěno 20. 10. 2026: od pravidel 2025–2028 **podávající tým chybu postavení nemá** (hráči podávajícího týmu smějí stát kdekoli), v pořadí musí být jen přijímající tým; po úderu podávajícího se smějí volně pohybovat oba týmy (7.4, 7.4.4). Trenažér proto jen pro přijímající tým. **Před psaním ověřit přesné znění 7.4.3 a 7.5** v anglickém PDF (`https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf`).
- Editor animací s „developer módem“ (jen pro vybrané editory, animace by se přesunuly do DB) – uživatel zatím neví, jestli animace, nebo videa (rozhodne s kamarádem, jehož je to nápad).
- Animace vs. video: formát otázky podporuje obojí (`media.typ`).
- Vlastní doména (jméno zatím nevybrané).

### Jak jsem testoval (testy nejsou ve veřejném repu)
- SQL: PGlite (Postgres ve WASM, npm `@electric-sql/pglite`) s napodobeným Supabase (role anon/authenticated/supabase_auth_admin, `auth.users`, `auth.uid()` z `request.jwt.claim.sub`). Vždy testovat i přechod ze stávající verze (`git show HEAD:sql/…`) a dvojí spuštění skriptů.
- Prohlížeč: `playwright-core` + nainstalovaný Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`), statický server `http-server`, Supabase API odchycené a obsloužené PGlite. **V testech blokovat service workery** (`serviceWorkers: 'block'`) a všechny požadavky na skutečný Supabase – jinak test sáhne na živou DB.
- **Skripty jsou zkopírované v `private/testy/`** (jen na disku, ignorované Gitem): `fake-supabase.mjs` + `lib.mjs` (prostředí), `db.mjs` (bezpečnost, 45 kontrol), `*-db.mjs` (SQL po balíčcích), `e2e-*.mjs` (prohlížeč). Spuštění: zkopírovat složku do scratchpadu sezení (ne do repa), `npm install`, `node db.mjs` atd.
- Cesty uvnitř jsou natvrdo: `ROOT` v `lib.mjs` (projekt) a `OLD` v `migrate-db.mjs`, `daily-db.mjs`, `badges-db.mjs` (složka se snímkem SQL z `git show HEAD:sql/…` – před testem přechodu ji znovu vytvořit).
- Gesta: `e2e-gesta.mjs` (kvíz gest, přehled v pravidlech, omezený pohyb), `pwa-gesta.mjs` (mezipaměť v6, gesta offline), `gesta-atlas.mjs` / `gesta-shots.mjs` / `gesto-detail.mjs <id>` (snímky gest do `shots/` – na kontrolu vzhledu animací očima).
- Zastaralé testy (selhávají i bez změn): `e2e.mjs` krok 1 čeká „Supabase není propojený“ (config.js už propojený je), `pwa.mjs` počítá soubory v mezipaměti `voleyref-v4` (natvrdo).

### Před spuštěním pro veřejnost
- Firemní e-mail (kontakt v ochrana-udaju.html je dočasný alias `raphael.silva955@flounderfantasy.com`) a převod Google Cloud projektu na firemní účet (IAM → Owner).
- Google OAuth: projekt `VoleyRef`, Client ID `748381175650-vdl2mkth4jjnrqmetc0pj17cqlqd97k4.apps.googleusercontent.com`, je v testovacím režimu (jen přidaní testeři) – „Publish app“ až před spuštěním. Vyměnit Client secret (byl vidět na screenshotu); secret patří jen do Supabase.
- Vlastní SMTP v Supabase (např. Brevo) – vestavěný posílá jen pár e-mailů za hodinu.
- Ověřit obsah otázek (`private/otazky.json`, psané z paměti) a pravidel; zálohovat složku `private/` (není v repu).
- Zvážit vypnutí/zapnutí registrací.
