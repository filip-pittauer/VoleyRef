# CODEMAP – mapa kódu VoleyRef

Rychlá orientace: co kde je, kdo koho volá a kam sáhnout při změně.
Pravidla projektu a postup práce jsou v [CLAUDE.md](CLAUDE.md); tady je jen „mapa“.

> **Udržovat aktuální:** při přidání, smazání nebo přejmenování souboru, modulu, exportu,
> RPC funkce nebo tabulky uprav i tuto mapu (ve stejném commitu).
> Čísla řádků sem záměrně nepíšeme – rychle zastarávají.

Stav: 21. 10. 2026 (vzhled „Svaz“, úplná pravidla, gesta rozhodčích, trenažér postavení).

---

## 1. Celkový obraz

```
 prohlížeč (statické HTML/CSS/JS, GitHub Pages)            Supabase (EU)
 ┌───────────────────────────────────────────┐        ┌──────────────────────────┐
 │ *.html  ──<script type=module>──▶ js/*.js │──RPC──▶│ public.* funkce (02–05)  │
 │ css/style.css, css/fonts.css, fonts/      │        │   ↓ security definer     │
 │ gesta/gesta.json, animace/*.json  (data)  │        │ tabulky + private.*      │
 │ sw.js (offline mezipaměť)                 │──Auth─▶│ Supabase Auth (e-mail,   │
 └───────────────────────────────────────────┘        │   Google)                │
                                                      └──────────────────────────┘
```

- **Žádný build krok**: každá stránka načítá své moduly přímo (`<script type="module">`).
  Moduly se navzájem importují relativními cestami (`./dom.js`).
- **Bezpečnost**: prohlížeč nikdy nevidí správné odpovědi ani nepočítá body.
  Kolo začne `zacni_kolo`, odpovědi vyhodnotí `odevzdej_kolo` na serveru.
- **Co běží jen v prohlížeči (bez DB)**: kvíz gest, přehled gest, trenažér postavení, pravidla.

---

## 2. Stránky → skripty

| Stránka | Účel | Skripty (vstupní moduly) |
|---|---|---|
| `index.html` | úvod / rozcestník, karty sekcí, instalace PWA | `pwa.js` |
| `kviz.html` | kvíz: běžné kolo, denní výzva (`#denni`), opakování chyb (`#opakovani`), karty gest a trenažéru postavení | `pwa.js`, `quiz.js` |
| `gesta.html` | kvíz „Co znamená toto gesto?“ | `pwa.js`, `gesture-quiz.js` |
| `postaveni.html` | trenažér postavení přijímajícího týmu (3D pohled 1./2. rozhodčího, po odpovědi shora); není v navigaci, odkaz z kvízu a úvodu | `pwa.js`, `lineup-trainer.js` |
| `pravidla.html` | úplná pravidla FIVB 2025–2028, diagramy, atlas gest (pravidlo 30) | `pwa.js`, `rules-page.js`, `gesture-atlas.js` |
| `zebricek.html` | žebříček celkový + denní (záložky) | `pwa.js`, `leaderboard.js` |
| `ucet.html` | **Profil**: přihlášení/registrace, statistiky, odznaky, nastavení, odhlášení, smazání účtu | `pwa.js`, `account.js` (→ `stats.js`) |
| `ochrana-udaju.html` | zásady GDPR (statický text) | `pwa.js` |
| `statistiky.html` | jen přesměrování na `ucet.html#statistiky` (staré odkazy) | inline skript |

Hlavička s navigací (Kvíz, Gesta, Pravidla, Žebříček, Profil) je v **každém** HTML zvlášť –
při změně upravit všech 9 souborů. Ikony navigace: `img/ikony.svg` (symboly pro `<use>`).

---

## 3. JavaScript moduly

Šipka `←` = importuje z. Exporty jsou veřejné funkce/konstanty modulu (jako `public` v C#).

### Společné pomůcky
| Modul | Exporty | Poznámka |
|---|---|---|
| `dom.js` | `el`, `svgEl`, `showOnly`, `replayAnimation`, `loadingPlaceholder`, `setupChoiceHint` | tvorba prvků (text vždy jako `textContent` – ochrana XSS); znovuspuštění CSS animace; skeleton při načítání; vlastní hláška „Vyber jednu odpověď“ místo bubliny prohlížeče (kvíz, gesta) |
| `format.js` | `formatDuration`, `plural`, `secondsUntilNextDay`, `formatCountdown` | české tvary („1 bod / 2 body / 5 bodů“); odpočet do půlnoci českého času (denní výzva) |
| `categories.js` | `CATEGORIES`, `categoryName`, `DIFFICULTIES`, `difficultyName`, `categoryRulesUrl`, `ruleUrl` | kategorie otázek; odkazy do pravidel (`#podani`, `#p-12-4-3`) |
| `badges.js` | `BADGE_GROUPS`, `BADGES`, `badgeById` | názvy/ikony odznaků (podmínky jsou v SQL) |
| `config.js` | `SUPABASE_URL`, `SUPABASE_KEY` | jen veřejná URL + publishable klíč |
| `supabase.js` | `supabase`, `isConfigured`, `NOT_CONFIGURED_MESSAGE`, `pageUrl`, `getUser`, `getProfile`, `errorMessage` | ← supabase-js z CDN (pevná verze), `config.js` |
| `pwa.js` | – | registrace `sw.js`, tlačítko „Nainstalovat aplikaci“ |

### Kvíz, žebříček, profil (používají Supabase)
| Modul | ← importuje | Exporty / co dělá |
|---|---|---|
| `quiz-api.js` | `supabase.js` | `startRound`, `submitRound`, `getDailyStatus`, `getMistakesCount` – jediné místo volání RPC kvízu |
| `quiz.js` | `dom`, `categories`, `format`, `badges`, `media`, `celebrate`, `quiz-api`, `supabase` | stránka kvízu: start → otázky → výsledek (skóre, vysvětlení, odkaz na bod pravidla, nové odznaky) |
| `celebrate.js` | `dom` | `createScore` (skóre v kruhu úspěšnosti), `celebrate` (napočítání + stuhy na canvasu od 60 % správně; respektuje omezený pohyb) – výsledek kvízu i kvízu gest |
| `media.js` | `dom`, `animation` | `renderMedia` – obrázek / video / animace u otázky |
| `leaderboard.js` | `dom`, `format`, `badges`, `supabase` | žebříček; RPC `zebricek` / `denni_zebricek`; medaile pro 1.–3. místo |
| `account.js` | `dom`, `badges`, `stats`, `supabase` | Profil: Auth (heslo, Google, reset, nové heslo), přezdívka, výběr odznaků, odhlášení, smazání účtu |
| `stats.js` | `dom`, `format`, `categories`, `badges`, `supabase` | `loadStats` – statistiky a odznaky v Profilu |

### Animace situací
| Modul | ← importuje | Exporty |
|---|---|---|
| `player.js` | `dom` | `createPlayer` – ovládání ▶/pauza + posuvník (pro situace i gesta) |
| `animation.js` | `dom`, `player` | `sample`, `createAnimationPlayer` – SVG hřiště z dat `animace/*.json` |

### Gesta rozhodčích (jen prohlížeč)
```
gesta/gesta.json ─▶ gesture-data.js ─▶ gesture-quiz.js (gesta.html)
                                   └─▶ gesture-atlas.js (pravidla.html, pravidlo 30)
                                            │
            math3d.js ◀── gesture-pose.js ◀── referee-figure.js ──▶ player.js
            (vektory,      (data → poloha      (3D postava → SVG,
             IK, spline)    paží v čase)        hloubkové řazení)
```
| Modul | Exporty |
|---|---|
| `math3d.js` | vektory (`add`, `sub`, `scale`, `dot`, `cross`, `normalize`, …), `createProjection` (bez perspektivy), `createPerspective` (kamera s perspektivou), `clipNear`, `solveTwoBone` (IK paže), `sampleSmooth`, `segmentAt` |
| `gesture-pose.js` | `BODY` (rozměry postavy), `createPoseSampler` (gesto → funkce čas → poloha paží) |
| `referee-figure.js` | `createRefereeScene`, `createGesturePlayer` (výřez scény se přizpůsobí rozsahu pohybu gesta – `fitViewBox`) |
| `gesture-data.js` | `loadGestures` (fetch jednou za návštěvu), `gestureSource`, `gestureDetails` |
| `gesture-quiz.js` | – (stránka kvízu gest; 10 gest, 4 možnosti, okamžité vyhodnocení; výsledek přes `celebrate.js`) |
| `gesture-atlas.js` | – (karty všech 32 gest, kotvy `#gesto-<id>`) ← `rules-page.js` |

### Trenažér postavení (jen prohlížeč)
```
lineup-logic.js ─▶ lineup-trainer.js (postaveni.html) ◀─ court-scene.js ─▶ math3d.js
(náhodná situace,    (výběr hráčů, vyhodnocení,          (hřiště, síť, hráči ve 3D → SVG,
 kontrola 7.4.3)      karta sestavy, skóre série)          pohledy ref1 / ref2 / top)
```
| Modul | Exporty |
|---|---|
| `lineup-logic.js` | `generateSituation` (1 nebo 0 porušených vztahů, vše s rezervou `MARGIN` 0,4 m), `checkRelation`, `checkAll`, `RELATIONS`, `footprint`, `faultyPositions`, `isCorrectAnswer`, `COURT`, `FOOT_SIZE`, `FRONT_ROW`, `BACK_ROW` – bez DOM, testovatelné v Node |
| `court-scene.js` | `VIEWS` (oko a výřez pohledů), `renderScene(svg, situace, { view, selected, result })` |
| `lineup-trainer.js` | – (stránka trenažéru) |
| `scene-zoom.js` | `attachPinchZoom(svg, { onChange })` → `{ refresh, reset }` – přiblížení dvěma prsty a posun přiblížené scény (mění viewBox); trenažér postavení |

### Pravidla
| Modul | Exporty |
|---|---|
| `rules-page.js` | `reveal`, `showHashTarget` – rozbalí `<details>` pravidla, na které vede kotva; tlačítka Rozbalit/Sbalit vše; rozbalení při tisku |

---

## 4. Data a obsah

| Soubor | Co obsahuje | Formát |
|---|---|---|
| `gesta/gesta.json` | 32 gest (26 rozhodčích vč. 6a/6b a 25a/25b + 5 čárových), pózy, skupiny | `gesta/README.md` |
| `animace/*.json` | animace situací (`mic-antena`, `podani-preslap`, `utok-zadni-rada`) | `animace/README.md` |
| `pravidla.html` | text pravidel; obsah mezi značkami `<!-- PRAVIDLA:START/END -->` a `<!-- OBSAH:START/END -->` je **generovaný** | viz níže |
| `img/ikony.svg` | ikony navigace (`#kviz`, `#gesta`, `#pravidla`, `#zebricek`, `#profil`) a `#postaveni` (úvod) | SVG symboly |
| `img/icons/` | ikony aplikace (PWA, favicon), zdroj `icon.svg` | |
| `fonts/` + `css/fonts.css` | Barlow, Barlow Condensed (woff2, latin + latin-ext), offline bez Googlu | |
| `manifest.json` | PWA manifest | |

### Kotvy v `pravidla.html`
- `#kapitola-N`, `#pravidlo-N` (`<details class="rule">`), body `#p-12-4-3`
- shrnutí „Ve zkratce“ = id kategorií otázek: `#hriste`, `#body`, `#podani`, `#prijem-nahravka`, `#utok`, `#blok`,
  `#dotyky-chyby`, `#sit-hrac`, `#rotace-postaveni`, `#stridani`, `#preruseni-hry`, `#libero`, `#chovani`, `#signalizace`
- definice `#def-…`, diagramy `#diagram-2` … `#diagram-10` (+ `#diagram-9b`, `#diagram-11` = atlas gest), gesta `#gesto-<id>`

### CSS (`css/style.css`, jeden soubor, sekce podle komentářů)
Barvy a rozměry (proměnné, tmavý režim) · Základ · Hlavička a navigace (dolní lišta na mobilu) · Patička ·
Komponenty · Formuláře · Kvíz · Animace · Gesta · Trenažér postavení (scéna, třídy `ct-*`) · Výsledek · Záložky · Denní výzva · Žebříček · Statistiky ·
Odznaky · Pravidla · Diagramy (SVG, třídy `dg-*`) · Větší obrazovky · Úvodní stránka · Detaily (medaile, skeleton) ·
Animace stránek a detailů (přechody mezi stránkami, příjezd otázky, žebříček, pravidla, úvod – vše jen bez „omezeného pohybu“).
Animace menu jsou v sekci „Animace navigace“ hned za navigací.

### Service worker (`sw.js`)
`APP_SHELL` = seznam všech souborů webu (offline). Vlastní soubory: síť napřed (`no-cache`), bez sítě mezipaměť;
CDN s pevnou verzí: mezipaměť napřed; Supabase: nikdy necachovat.
**Nový soubor webu → přidat do `APP_SHELL` a zvýšit `CACHE` (`voleyref-vN`).**

---

## 5. Databáze (Supabase, `sql/` – spouštět v pořadí, opakovatelně)

### Tabulky (`01_schema.sql`) – všechny s RLS, přímý přístup odebraný
| Tabulka | Obsah | Přístup z prohlížeče |
|---|---|---|
| `public.otazky` | otázky bez správných odpovědí | jen přes funkce |
| `private.otazky_reseni` | **správné odpovědi** + vysvětlení | nikdy (schéma `private`) |
| `public.profily` | přezdívka, vybrané odznaky | `select` + `update (prezdivka)` jen svůj řádek |
| `public.kola` | odehraná kola (čas, skóre, režim, odpovědi) | `select` jen svoje |
| `public.denni_vyzvy` | otázky denní výzvy | jen přes funkce |
| `public.odznaky_hracu` | získané odznaky | jen přes funkce |

Trigger `po_registraci` → `private.zalozit_profil()` založí profil při registraci.

### Funkce (RPC)
| Soubor | Veřejné (volá prohlížeč) | Kdo smí | Volá z JS | Interní (`private.*`) |
|---|---|---|---|---|
| `02_funkce.sql` | `zacni_kolo(kategorie, obtiznost, rezim)` | anon, auth | `quiz-api.js` | `chybne_otazky`, `dnes` |
| | `odevzdej_kolo(kolo_id, odpovedi)` – spočítá body, uloží, udělí odznaky | anon, auth | `quiz-api.js` | |
| | `zebricek(limit)` | anon, auth | `leaderboard.js` | |
| | `pocet_chyb()` | auth | `quiz-api.js`, `stats.js` | |
| | `smazat_ucet()` | auth | `account.js` | |
| `03_statistiky.sql` | `moje_statistiky()` | auth | `stats.js` | |
| `04_denni_vyzva.sql` | `denni_zebricek(limit)`, `stav_denni_vyzvy()` | anon, auth | `leaderboard.js`, `quiz-api.js` | `denni_poradi`, `denni_serie` |
| `05_odznaky.sql` | `moje_odznaky()`, `nastav_odznaky(odznaky)` | auth | `account.js`, `stats.js` | `metriky_odznaku`, `udel_odznaky` |

Režimy kola: `bezne` (až 10 otázek, filtr kategorie/obtížnosti), `chyby` (opakování chyb), `denni` (5 stejných otázek pro všechny, jeden pokus).

---

## 6. Hlavní toky

**Kolo kvízu** – `quiz.js` → `quiz-api.startRound` → RPC `zacni_kolo` (server uloží čas startu, vrátí otázky bez řešení)
→ hráč odpovídá (nic se neposílá) → `submitRound` → RPC `odevzdej_kolo` (server porovná s `private.otazky_reseni`,
uloží kolo, udělí odznaky) → výsledek s vysvětlením a odkazem `ruleUrl(pravidlo)` do pravidel.

**Přihlášení** – `account.js` přes `supabase.auth` (heslo / Google / reset hesla). Adresa `ucet.html` je zadaná
v Supabase jako návratová URL – **neměnit**. Po přihlášení `stats.loadStats()`.

**Odkaz do pravidel** – `pravidla.html#p-12-4-3` → `rules-page.showHashTarget()` rozbalí `<details>` a skočí na bod.
Kliknutí na vnitřní odkaz rozbalí cíl dřív, než prohlížeč skočí.

**Gesto** – `gesta.json` → `createPoseSampler` (klíčové snímky → poloha paží, IK) → `createRefereeScene`
(3D → 2D projekce, kreslení podle hloubky) → `createPlayer` (▶ / posuvník).

---

## 7. Mimo repo (`private/`, v `.gitignore`)

| Cesta | Co | Jak použít |
|---|---|---|
| `private/otazky.json` | **otázky se správnými odpověďmi** (zdroj pravdy) | upravit → `node tools/seed-otazky.mjs` → `private/seed-otazky.sql` spustit v Supabase |
| `private/pravidla-zdroj/` | zdroj textu pravidel (`src/*.txt`), diagramy (`diagramy/*.html`), `build.mjs`, CSS pravidel | `node private/pravidla-zdroj/build.mjs pravidla.html` |
| `private/testy/` | testy (PGlite + Playwright), viz CLAUDE.md „Jak jsem testoval“ | zkopírovat do scratchpadu, `npm install` |

`tools/seed-otazky.mjs` – kontrola `otazky.json` a vygenerování upsert SQL (výstup obsahuje odpovědi → nikdy necommitovat).

---

## 8. Kam sáhnout, když chci…

| Chci… | Upravit |
|---|---|
| přidat/změnit otázku | `private/otazky.json` → seed SQL → spustit v Supabase |
| přidat kategorii otázek | `js/categories.js`, `tools/seed-otazky.mjs` (`CATEGORIES`), `check (kategorie in …)` v `sql/01_schema.sql`, shrnutí s tím id v pravidlech |
| přidat gesto | záznam v `gesta/gesta.json` (formát `gesta/README.md`) |
| upravit trenažér postavení | generování a pravidla: `js/lineup-logic.js`; vzhled scény, kamery pohledů: `js/court-scene.js` (`VIEWS`) a CSS `ct-*`; texty a ovládání: `js/lineup-trainer.js` |
| přidat animaci situace | `animace/<id>.json` + `APP_SHELL` v `sw.js` |
| upravit text pravidel | `private/pravidla-zdroj/src/*.txt` + build (nebo drobnost přímo v `pravidla.html`) |
| přidat odznak | `js/badges.js` + `private.metriky_odznaku` v `sql/05_odznaky.sql` (stejné id) |
| novou stránku | HTML s hlavičkou/navigací jako ostatní, `APP_SHELL` + `CACHE` v `sw.js`, navigace ve všech stránkách |
| změnit barvy/vzhled | proměnné na začátku `css/style.css` (světlý i tmavý režim) |
| změnit DB | soubor v `sql/` (opakovatelně spustitelný), test přechodu ze stávající verze, uživateli napsat pořadí spuštění |
