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
statistiky.html     statistiky přihlášeného hráče (RPC moje_statistiky)
ucet.html           přihlášení, registrace, profil, smazání účtu
ochrana-udaju.html  zásady ochrany osobních údajů (GDPR)
css/style.css       společné styly
js/config.js        Supabase URL + publishable klíč (veřejné)
js/supabase.js      klient Supabase (supabase-js z CDN), pomocné funkce pro přihlášení
js/quiz-api.js      volání RPC zacni_kolo / odevzdej_kolo
js/badges.js        názvy a ikony odznaků (podmínky jsou v sql/05_odznaky.sql)
js/                 další moduly (quiz.js, account.js, dom.js, …)
img/                obrázky situací, img/icons/ ikony aplikace (zdroj icon.svg)
manifest.json       PWA manifest
sw.js               service worker (mezipaměť, offline)
animace/            SVG animace situací jako JSON (formát v animace/README.md)
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
- Navigace: Kvíz, Pravidla, Žebříček, Statistiky, Účet (úvod přes logo). Víc položek se na 375 px nevejde na řádek.
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
- Hotovo: fáze 1–6, knížka pravidel, statistiky, obtížnost, opakování chyb, denní výzva, odznaky (18, výběr 3 do žebříčku).
- Otestováno uživatelem na živém webu: přihlášení Google i e-mail, kvíz, žebříček, přezdívka, smazání účtu, obtížnost, opakování chyb, denní výzva.

### ⚠️ Rozpracované – první věc příště
- **Odznaky jsou nasazené v kódu, ale uživatel ještě NESPUSTIL SQL** v Supabase. Spustit v pořadí: `01_schema.sql`, `02_funkce.sql`, `04_denni_vyzva.sql`, `05_odznaky.sql` (05 závisí na 02 a 04). Do té doby: kvíz funguje (odevzdej_kolo odznaky jen přeskočí), sekce odznaků ve Statistikách a karta na Účtu se nezobrazí, žebříček může hlásit chybu (frontend čte sloupec `odznaky`). Pak nechat uživatele odznaky vyzkoušet.

### Další krok: balíček 4 (schválený uživatelem)
1. **Trenažér postavení** (bez DB, jen v prohlížeči): SVG hřiště, 6 hráčů přijímajícího týmu v okamžiku podání + karta sestavy (pozice I–VI → čísla dresů). Hráč klikne na hráče v chybě postavení, nebo „Postavení je správné“. Situace generovat náhodně kódem, pravdu počítat z geometrie (vztahy předních/zadních 4–5, 3–6, 2–1 a bočních 4–3, 3–2, 5–6, 6–1; okraj nejistoty ≥ 0,4 m). Po odpovědi ukázat porušené vztahy. **Před psaním NEJDŘÍV ověřit aktuální znění pravidla 7.4/7.5 FIVB 2025–2028** (pravidlo o postavení se měnilo – nepsat z paměti).
2. **Gesta rozhodčích:** nakreslit a animovat gesta v SVG (postava rozhodčího, gesta jako data – klíčové polohy rukou), kvíz „co znamená toto gesto“ (lokálně, bez DB) a gesta i v pravidla.html#signalizace. Uživatel chce, aby se na tom nespěchalo. Seznam gest ověřit proti oficiálním (FIVB Diagram 11).
3. Oba režimy přístupné z kvíz.html (karty) a z úvodní stránky; navigace se už nerozšiřuje (5 položek je maximum na mobilu).
- Odznaky pro trenažér/gesta až později (vyžadují ukládání výsledků na server).

### Odložené / nápady
- Editor animací s „developer módem“ (jen pro vybrané editory, animace by se přesunuly do DB) – uživatel zatím neví, jestli animace, nebo videa (rozhodne s kamarádem, jehož je to nápad).
- Animace vs. video: formát otázky podporuje obojí (`media.typ`).
- Vlastní doména (jméno zatím nevybrané).

### Jak jsem testoval (testy nejsou v repu)
- SQL: PGlite (Postgres ve WASM, npm `@electric-sql/pglite`) s napodobeným Supabase (role anon/authenticated/supabase_auth_admin, `auth.users`, `auth.uid()` z `request.jwt.claim.sub`). Vždy testovat i přechod ze stávající verze (`git show HEAD:sql/…`) a dvojí spuštění skriptů.
- Prohlížeč: `playwright-core` + nainstalovaný Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`), statický server `http-server`, Supabase API odchycené a obsloužené PGlite. **V testech blokovat service workery** (`serviceWorkers: 'block'`) a všechny požadavky na skutečný Supabase – jinak test sáhne na živou DB.
- Nástroje byly v dočasné složce sezení; příště je případně nainstalovat znovu (mimo repo).

### Před spuštěním pro veřejnost
- Firemní e-mail (kontakt v ochrana-udaju.html je dočasný alias `raphael.silva955@flounderfantasy.com`) a převod Google Cloud projektu na firemní účet (IAM → Owner).
- Google OAuth: projekt `VoleyRef`, Client ID `748381175650-vdl2mkth4jjnrqmetc0pj17cqlqd97k4.apps.googleusercontent.com`, je v testovacím režimu (jen přidaní testeři) – „Publish app“ až před spuštěním. Vyměnit Client secret (byl vidět na screenshotu); secret patří jen do Supabase.
- Vlastní SMTP v Supabase (např. Brevo) – vestavěný posílá jen pár e-mailů za hodinu.
- Ověřit obsah otázek (`private/otazky.json`, psané z paměti) a pravidel; zálohovat složku `private/` (není v repu).
- Zvážit vypnutí/zapnutí registrací.
