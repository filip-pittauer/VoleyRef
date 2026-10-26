# CODEMAP – mapa kódu VoleyRef

Rychlá orientace: co kde je, kdo koho volá a kam sáhnout při změně.
Pravidla projektu a postup práce jsou v [CLAUDE.md](CLAUDE.md); tady je jen „mapa“.

> **Udržovat aktuální:** při přidání, smazání nebo přejmenování souboru, modulu, exportu,
> RPC funkce nebo tabulky uprav i tuto mapu (ve stejném commitu).
> Čísla řádků sem záměrně nepíšeme – rychle zastarávají.

Stav: 23. 10. 2026 (vzhled „Svaz“, úplná pravidla, gesta rozhodčích, trenažér postavení, zkouška).

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
| `index.html` | úvod / rozcestník: karta denní výzvy (jen dokud ji hráč dnes nedohrál), karty sekcí (Hry, Výuka, Pravidla, Žebříček), instalace PWA | `pwa.js`, `daily-teaser.js` |
| `hry.html` | rozcestník **Hry** (bodované): karta denní výzvy, souhrn Tvoje body (dnes/týden/celkem), hry se stavem „dnešní body získány“, žebříček, „Připravujeme“ | `pwa.js`, `daily-teaser.js`, `games-hub.js` |
| `vyuka.html` | rozcestník **Výuka** (bez bodů): pravidla, atlas gest, slovníček, procvičování, trenažéry postavení a zápisu, zkouška | `pwa.js` |
| `kviz.html` | kvíz v Hrách: denní výzva (`#denni`; `?hrat=denni` ji rovnou spustí), běžné kolo (náhodný mix, do žebříčku); v navigaci pod Hry | `pwa.js`, `quiz.js` |
| `procvicovani.html` | **Procvičování** ve Výuce: dlaždice kategorií (počet otázek, úspěšnost), obtížnost, opakování chyb (`#opakovani`), `?kategorie=…` zvýrazní dlaždici; kolo v režimu `procvicovani` (bez žebříčku) | `pwa.js`, `quiz.js` (→ `quiz-practice.js`) |
| `zapis.html` | trenažér zápisu: krátká verze (10 úloh nad rozepsaným zápisem), dlouhá verze (vedení celého setu); bez DB, patří pod Výuku | `pwa.js`, `scoresheet-trainer.js` |
| `zkouska.html` | zkouška: 30 otázek ze všech kategorií za 30 min, přehled otázek, potvrzení odevzdání, prošel/neprošel (80 %); patří pod Výuku | `pwa.js`, `exam.js` |
| `gesta.html` | kvíz „Co znamená toto gesto?“; patří pod Hry; přihlášený hraje kolo ze serveru (body) | `pwa.js`, `gesture-quiz.js` |
| `rotacni-sprint.html` | **Rotační sprint**: 60 s, situace rotace / střídání / libero / více rotací, ťuknutím prohodit hráče; patří pod Hry | `pwa.js`, `rotation-sprint.js` |
| `gesto-naopak.html` | **Gesto naopak**: význam jako otázka, 4 animace jako možnosti (`main data-game="gesto-naopak"`); patří pod Hry | `pwa.js`, `gesture-quiz.js` |
| `postaveni.html` | trenažér postavení přijímajícího týmu (3D pohled 1./2. rozhodčího, po odpovědi shora); patří pod Výuku | `pwa.js`, `lineup-trainer.js` |
| `pravidla.html` | úplná pravidla FIVB 2025–2028, hledání, diagramy, atlas gest (pravidlo 30) | `pwa.js`, `rules-page.js`, `rules-search.js`, `gesture-atlas.js` |
| `zebricek.html` | žebříček podle **bodů**: záložky Celkem / Tento týden / Dnes (`#tyden`, `#dnes`; starý `#denni` → Dnes), výběr hry | `pwa.js`, `leaderboard.js` |
| `ucet.html` | **Profil**: přihlášení/registrace, statistiky, odznaky, nastavení, odhlášení, smazání účtu | `pwa.js`, `account.js` (→ `stats.js`) |
| `ochrana-udaju.html` | zásady GDPR (statický text) | `pwa.js` |
| `statistiky.html` | jen přesměrování na `ucet.html#statistiky` (staré odkazy) | `stats-redirect.js` (klasický skript; inline by CSP zablokovala) |

Hlavička s navigací (Hry, Výuka, Pravidla, Žebříček, Profil) je v **každém** HTML zvlášť –
při změně upravit všech 12 stránek s navigací. Stránka sekce má u položky `aria-current="true"`
(kvíz a gesta → Hry; postavení, zápis, zkouška → Výuka), rozcestník sám `aria-current="page"`. Ikony navigace: `img/ikony.svg` (symboly pro `<use>`).

---

## 3. JavaScript moduly

Šipka `←` = importuje z. Exporty jsou veřejné funkce/konstanty modulu (jako `public` v C#).

### Společné pomůcky
| Modul | Exporty | Poznámka |
|---|---|---|
| `dom.js` | `el`, `svgEl`, `showOnly`, `replayAnimation`, `loadingPlaceholder`, `setupChoiceHint` | tvorba prvků (text vždy jako `textContent` – ochrana XSS; `style` přes CSSOM `style.cssText`, atribut `style=` by CSP zablokovala); znovuspuštění CSS animace; skeleton při načítání; vlastní hláška „Vyber jednu odpověď“ místo bubliny prohlížeče (kvíz, gesta) |
| `format.js` | `formatDuration`, `plural`, `secondsUntilNextDay`, `formatCountdown` | české tvary („1 bod / 2 body / 5 bodů“); odpočet do půlnoci českého času (denní výzva) |
| `categories.js` | `CATEGORIES`, `categoryName`, `DIFFICULTIES`, `difficultyName`, `categoryRulesUrl`, `ruleUrl` | kategorie otázek; odkazy do pravidel (`#podani`, `#p-12-4-3`) |
| `badges.js` | `BADGE_GROUPS`, `BADGES`, `badgeById` | názvy/ikony odznaků (podmínky jsou v SQL) |
| `config.js` | `SUPABASE_URL`, `SUPABASE_KEY` | jen veřejná URL + publishable klíč |
| `supabase.js` | `supabase`, `isConfigured`, `NOT_CONFIGURED_MESSAGE`, `pageUrl`, `getUser`, `getProfile`, `errorMessage` | ← `js/vendor/supabase-js-2.117.2.umd.js` (vložený jako `<script>`, top-level await), `config.js` |
| `vendor/supabase-js-2.117.2.umd.js` | globální `supabase` | knihovna supabase-js z npm beze změny (UMD; SHA-256 v `supabase.js`, licence `vendor/supabase-js-LICENSE.txt`, `.gitattributes` = bez převodu konců řádků) |
| `pwa.js` | – | registrace `sw.js`, tlačítko „Nainstalovat aplikaci“ |

### Kvíz, žebříček, profil (používají Supabase)
| Modul | ← importuje | Exporty / co dělá |
|---|---|---|
| `quiz-api.js` | `supabase.js` | `startRound`, `submitRound` (u zkoušky navíc `exam`: limit, hranice, prošel; u dnešní denní výzvy `solutionHidden`), `getDailyStatus`, `getDailySolution`, `getMistakesCount`, `getCategoryOverview`, `getCategoryStats`, `getPointsLeaderboard`, `getMyPoints`, `startGame`, `submitGame`, `startSprint`, `submitSprint` – jediné místo volání RPC kvízu a her; `submitRound` vrací i `points`, `pointsReason` |
| `quiz.js` | `dom`, `categories`, `format`, `media`, `celebrate`, `quiz-result`, `quiz-api`, `quiz-practice`, `daily-card`, `supabase` | kvíz (`kviz.html`) i procvičování (`procvicovani.html`) – karty startu podle toho, které prvky stránka má; start → otázky → výsledek (skóre, vysvětlení, odkaz na bod pravidla, nové odznaky) |
| `daily-card.js` | `dom`, `format`, `quiz-api` | `renderDailyCard` (stav, skóre, pořadí, série, odpočet; tlačítko/odkaz „Hrát“), `streakText`, `previousDay` – karta denní výzvy pro kvíz, úvod i Hry |
| `daily-teaser.js` | `supabase`, `daily-card` | vstupní modul karty na úvodu a v Hrách; `data-hide-when-played` = skrýt po odehrání |
| `quiz-practice.js` | `dom`, `categories`, `format` | `renderPracticeTiles` – dlaždice Procvičování (mix + 11 kategorií, počty podle obtížnosti, pruh úspěšnosti) |
| `exam.js` | `dom`, `categories`, `format`, `media`, `celebrate`, `quiz-result`, `quiz-api`, `supabase` | stránka zkoušky: odpočet (samo-odevzdání), volný pohyb mezi otázkami, mřížka přehledu, `<dialog>` potvrzení, výsledek po kategoriích |
| `quiz-result.js` | `dom`, `categories`, `badges`, `report` | `renderResultItem` (vysvětlení otázky s odkazem do pravidel), `renderNewBadges` – společné pro kvíz a zkoušku |
| `celebrate.js` | `dom` | `createScore` (skóre v kruhu úspěšnosti), `celebrate(ring, { ribbons })` (napočítání + stuhy na canvasu od 60 % správně; respektuje omezený pohyb) – výsledek kvízu, zkoušky i kvízu gest |
| `media.js` | `dom`, `animation`, `court-scene`, `lineup-logic` | `renderMedia` – obrázek / video / animace / scéna postavení (`typ: "postaveni"`, hráči v datech otázky, pod scénou zápis pozic) u otázky; SVG obrázky (`img/otazky/`) vkládá přímo do stránky kvůli CSS (`dg-*`, `qd-*`, tmavý režim); obrázek bez `soubor` = zástupný rámeček |
| `leaderboard.js` | `dom`, `badges`, `quiz-api`, `supabase` | žebříček podle bodů (`getPointsLeaderboard` → RPC `zebricek_body`); období, hra, medaile pro 1.–3. místo |
| `rotation-logic.js` | – | pravidla sprintu bez DOM: `solve`, `isCorrect`, `rotate`, `benchOf`, `describe`, `generateSituation` (nepřihlášený), `ZONES`, `COURT_LAYOUT`; stejná pravidla v SQL (`private.sprint_reseni`, test `rotace-db`) |
| `rotation-sprint.js` | `dom`, `format`, `rotation-logic`, `quiz-api`, `supabase`, `celebrate`, `points` | obrazovka sprintu: odpočet, výběr a prohození hráčů, okamžité ✓/✗, výsledek; přihlášený `startSprint` / `submitSprint` |
| `points.js` | `dom`, `format` | `pointsNote` – věta pod výsledkem kola: „+70 bodů do žebříčku“, limit, příliš rychlé, pozvánka k přihlášení |
| `games-hub.js` | `quiz-api`, `supabase`, `format` | Hry: souhrn bodů hráče a štítky `[data-points]` u her (`getMyPoints` → `moje_body`) |
| `account.js` | `dom`, `badges`, `stats`, `supabase` | Profil: Auth (heslo, Google, reset, nové heslo), přezdívka, výběr odznaků, odhlášení, smazání účtu |
| `report.js` | `dom` (+ `supabase` načtený až při odeslání přes `import()`) | `createReportLink({ questionId } | { gestureId })` – odkaz „Nahlásit chybu“ s formulářem; RPC `nahlasit_chybu` |
| `stats.js` | `dom`, `format`, `categories`, `badges`, `supabase` | `loadStats` – statistiky a odznaky v Profilu |

### Animace situací
| Modul | ← importuje | Exporty |
|---|---|---|
| `player.js` | `dom` | `createPlayer` – ovládání ▶/pauza + posuvník (pro situace i gesta) |
| `animation.js` | `dom`, `player` | `sample`, `createAnimationPlayer` – SVG hřiště z dat `animace/*.json` (štítky hráčů, libero, značky, obdélníky, výřez) |

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
| `gesture-quiz.js` | – (kvíz gest i Gesto naopak; 10 gest, 4 možnosti, okamžité vyhodnocení; přihlášený: gesta vybere server `startGame`, na konci `submitGame` → body přes `points.js`; hlášení přes `report.js`) |
| `gesture-atlas.js` | – (karty všech 32 gest, kotvy `#gesto-<id>`) ← `rules-page.js` |

### Trenažér postavení (jen prohlížeč)
```
lineup-logic.js ─▶ lineup-trainer.js (postaveni.html) ◀─ court-scene.js ─▶ math3d.js
(náhodná situace,    (výběr hráčů, vyhodnocení,          (hřiště, síť, hráči ve 3D → SVG,
 kontrola 7.4.3)      karta sestavy, skóre série)          pohledy ref1 / ref2 / top)
```
| Modul | Exporty |
|---|---|
| `lineup-logic.js` | `generateSituation` (1 nebo 0 porušených vztahů, vše s rezervou `MARGIN` 0,4 m), `checkRelation`, `checkAll`, `RELATIONS`, `footprint`, `faultyPositions`, `isCorrectAnswer`, `situationFromData` (pevná situace z dat otázky), `COURT`, `FOOT_SIZE`, `FRONT_ROW`, `BACK_ROW` – bez DOM, testovatelné v Node |
| `court-scene.js` | `VIEWS` (oko a výřez pohledů), `renderScene(svg, situace, { view, selected, result })` |
| `lineup-trainer.js` | – (stránka trenažéru) |
| `scene-zoom.js` | `attachPinchZoom(svg, { onChange })` → `{ refresh, reset }` – přiblížení dvěma prsty a posun přiblížené scény (mění viewBox); trenažér postavení |

### Trenažér zápisu (jen prohlížeč)
```
scoresheet-model.js ─▶ scoresheet-tasks.js (krátká verze) ─┐
 (set: pořadí podání,  scoresheet-game.js  (dlouhá verze)  ─┼─▶ scoresheet-trainer.js (zapis.html)
  střídání, libero…)   scoresheet-view.js  (zápis, hřiště) ─┘
```
| Modul | Exporty |
|---|---|
| `scoresheet-model.js` | `createSet`, `applyPoint` (rotace, ztráta podání), `judgeSub`/`judgeTimeout`/`judgeLiberoIn`/`judgeLiberoOut` (posouzení podle pravidel), `outcomeOf` (neoprávněná žádost / zdržování), `misconductSanction` (stupnice 21.3), `apply*`, `simulate`, `randomTeams`, `legalSubs`, `OUTCOMES`, `SANCTIONS` – bez DOM, testovatelné v Node |
| `scoresheet-tasks.js` | `generateTasks(random, count)` – úlohy krátké verze (kdo podává, kontrola podávajícího, střídání, zbývající střídání, kdo smí za náhradníka, oddechový čas, skóre v zápisu, libero, sankce, zdržování) |
| `scoresheet-game.js` | `createGame(random)` → `{ set, next, resolveRally, resolveDecision }`, `explain` – události setu se správnou reakcí; po chybě se provede správná varianta |
| `scoresheet-view.js` | `renderCourt`, `renderSheet(container, set, { onPoint, onServer, marker })` – vlastní zjednodušený zápis |
| `scoresheet-trainer.js` | – (stránka: výběr verze, úlohy, vedení setu, výsledek) |

### Pravidla
| Modul | Exporty |
|---|---|
| `rules-page.js` | `reveal`, `showHashTarget` – rozbalí `<details>` pravidla, na které vede kotva; tlačítka Rozbalit/Sbalit vše; rozbalení při tisku |
| `glossary.js` | `annotateTerms(root)` (← `dom`, `categories`) – slovníček: podtrhne pojmy ze `slovnicek/pojmy.json` (první výskyt v prvku) a po klepnutí ukáže bublinu s definicí a odkazem do pravidel; volá `rules-page.js` (každé pravidlo) a `quiz-result.js` (vysvětlení, ne otázka) |
| `rules-search.js` | – (← `dom`, `rules-page`) hledání v pravidlech v prohlížeči: index z textu stránky při prvním hledání, bez diakritiky, kmeny slov, slovníček hovorových výrazů `SYNONYMS`, řazení podle vzácnosti slov a názvu pravidla; skok na kotvu s podbarvením |

---

## 4. Data a obsah

| Soubor | Co obsahuje | Formát |
|---|---|---|
| `slovnicek/pojmy.json` | slovníček pojmů (id, pojem, tvary pro vyhledání v textu, definice, pravidlo); zdroj sekce Definice pojmů (`@slovnicek` v generátoru) i bublin | popis v souboru |
| `gesta/gesta.json` | 32 gest (26 rozhodčích vč. 6a/6b a 25a/25b + 5 čárových), pózy, skupiny | `gesta/README.md` |
| `animace/*.json` | animace situací (`mic-antena`, `podani-preslap`, `utok-zadni-rada`) a `q<id>-*.json` k otázkám (generuje `private/obrazky/animace.mjs`) | `animace/README.md` |
| `img/otazky/*.svg` | obrázky k otázkám (generuje `private/obrazky/diagramy.mjs`, kromě 201/212/213/217 kreslených ručně) | SVG s třídami `dg-*`/`qd-*` |
| `pravidla.html` | text pravidel; obsah mezi značkami `<!-- PRAVIDLA:START/END -->` a `<!-- OBSAH:START/END -->` je **generovaný** | viz níže |
| `img/ikony.svg` | ikony navigace (`#hry`, `#vyuka`, `#pravidla`, `#zebricek`, `#profil`) a karet (`#kviz`, `#gesta`, `#postaveni`, `#zapis`, `#zkouska`, `#denni`) | SVG symboly |
| `img/icons/` | ikony aplikace (PWA, favicon), zdroj `icon.svg` | |
| `fonts/` + `css/fonts.css` | Barlow, Barlow Condensed (woff2, latin + latin-ext), offline bez Googlu | |
| `manifest.json` | PWA manifest | |

### Kotvy v `pravidla.html`
- `#kapitola-N`, `#pravidlo-N` (`<details class="rule">`), body `#p-12-4-3`
- `#definice`, `#diagramy` – rozbalovací bloky bez čísla (`details.rule.rule--extra`, v generátoru `## id | Název`)
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
Žádné CDN (supabase-js je v `js/vendor/`); Supabase: nikdy necachovat.
**Nový soubor webu → přidat do `APP_SHELL` a zvýšit `CACHE` (`voleyref-vN`).**

---

## 5. Databáze (Supabase, `sql/` – spouštět v pořadí, opakovatelně)

**Deny by default** (konec `01_schema.sql`): nové tabulky, sekvence a funkce nemají pro `anon`/`authenticated` žádná práva a nové funkce ani EXECUTE pro `PUBLIC` – každý grant výslovně ve skriptu. Hlídá test `private/testy/prava-db.mjs` (seznam funkcí webu `EXPECTED`; novou RPC tam přidat).

### Tabulky (`01_schema.sql`) – všechny s RLS, přímý přístup odebraný
| Tabulka | Obsah | Přístup z prohlížeče |
|---|---|---|
| `public.otazky` | otázky bez správných odpovědí | jen přes funkce |
| `private.otazky_reseni` | **správné odpovědi** + vysvětlení | nikdy (schéma `private`) |
| `public.profily` | přezdívka, vybrané odznaky | `select` + `update (prezdivka)` jen svůj řádek |
| `public.kola` | odehraná kola všech her (`hra`: kviz / gesta / gesto-naopak / rotace; `data` = situace sprintu; čas, skóre, režim, odpovědi, `polozky` = id gest, `body` + `body_duvod` 'limit'/'rychle'; null = nebodované) | `select` jen svoje |
| `private.hodnoty_her` (`01`) | body za správnou, bonus za rychlost a časový limit (sprint) podle hry a režimu (chybí řádek = nebodované) | nikdy |
| `private.gesta` (`07`) | katalog gest (id, skupina) – musí odpovídat `gesta/gesta.json` (test `body-db`) | nikdy |
| `public.denni_vyzvy` | otázky denní výzvy | jen přes funkce |
| `public.odznaky_hracu` | získané odznaky | jen přes funkce |
| `public.hlaseni` (`06_hlaseni.sql`) | hlášení chyb v otázkách/gestech, stav `nove`/`vyreseno`/`zamitnuto` | jen zápis přes funkci; čtení v dashboardu (pohled `private.prehled_hlaseni`) |

Trigger `po_registraci` → `private.zalozit_profil()` založí profil při registraci.

### Funkce (RPC)
| Soubor | Veřejné (volá prohlížeč) | Kdo smí | Volá z JS | Interní (`private.*`) |
|---|---|---|---|---|
| `02_funkce.sql` | `zacni_kolo(kategorie, obtiznost, rezim)` – režimy `bezne`, `procvicovani`, `chyby`, `denni`, `zkouska` | anon, auth | `quiz-api.js` | `chybne_otazky`, `dnes`, `reseni_skryte`, `otazky_kola`, `vysledky_kola`, `zkouska_otazek`, `zkouska_limit`, `zkouska_hranice`, `zkouska_splnena` |
| | `odevzdej_kolo(kolo_id, odpovedi)` – spočítá body, uloží, udělí odznaky; u dnešní denní výzvy bez řešení | anon, auth | `quiz-api.js` | |
| | `reseni_denni_vyzvy(den)` – řešení vlastní denní výzvy, nejdřív zítra | auth | `quiz-api.js` | |
| | `zebricek(limit)` | anon, auth | `leaderboard.js` | |
| | `pocet_chyb()` | auth | `quiz-api.js`, `stats.js` | |
| | `prehled_kategorii()` – počty aktivních otázek po kategorii a obtížnosti | anon, auth | `quiz-api.js` | |
| | `smazat_ucet()` | auth | `account.js` | |
| `03_statistiky.sql` | `moje_statistiky()` (vč. historie zkoušek) | auth | `stats.js`, `quiz-api.js` (úspěšnost v dlaždicích) | |
| `04_denni_vyzva.sql` | `denni_zebricek(limit)`, `stav_denni_vyzvy()` (vč. `vcera`) | anon, auth | `leaderboard.js`, `quiz-api.js` (→ `daily-card.js`) | `denni_poradi`, `denni_serie` |
| `06_hlaseni.sql` | `nahlasit_chybu(otazka_id, gesto, typ, text)` | anon, auth | `report.js` | pohled `prehled_hlaseni` |
| `07_hry.sql` | `zacni_hru(hra, sada)`, `odevzdej_hru(kolo_id, odpovedi)` | anon, auth | `quiz-api.js` (→ `gesture-quiz.js`) | `prirad_body`, `body_za`, `denni_limit_kol` (v `02`) |
| | `zebricek_body(obdobi, hra, limit)` – součet bodů celkem / tyden / den, shoda → dřívější zisk | anon, auth | `quiz-api.js` (→ `leaderboard.js`) | |
| | `moje_body()` – dnes / týden / celkem, `dnes_hrano` | auth | `quiz-api.js` (→ `games-hub.js`) | |
| | (na konci souboru přepočet bodů starých kol – opakovatelný) | | | |
| `08_rotace.sql` | `zacni_sprint()` (30 situací, limit), `odevzdej_sprint(kolo_id, odpovedi)` (skóre, body, řešení) | anon, auth | `quiz-api.js` (→ `rotation-sprint.js`) | `sprint_situace`, `sprint_reseni` |
| `05_odznaky.sql` | `moje_odznaky()`, `nastav_odznaky(odznaky)` | auth | `account.js`, `stats.js` | `metriky_odznaku`, `udel_odznaky` |

Režimy kola: `bezne` (až 10 otázek, filtr kategorie/obtížnosti), `chyby` (opakování chyb), `denni` (5 stejných otázek pro všechny, jen přihlášení, jeden pokus; řešení až zítra – `private.reseni_skryte` ho skryje i v opakování chyb, statistikách a odznacích),
`zkouska` (30 otázek, z každé kategorie 2–3; limit 30 min + 1 min tolerance, hranice 80 % – parametry v `private.zkouska_*`; do žebříčku se nepočítá, odznak `zkouska`).

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
| `private/obrazky/` | generátory ilustrací k otázkám (`animace.mjs`, `diagramy.mjs`, `media-otazek.mjs`) | `node private/obrazky/<skript>.mjs` |
| `private/testy/` | testy (PGlite + Playwright), viz CLAUDE.md „Jak jsem testoval“ | zkopírovat do scratchpadu, `npm install` |

`tools/seed-otazky.mjs` – kontrola `otazky.json` a vygenerování upsert SQL (výstup obsahuje odpovědi → nikdy necommitovat).

**Prototyp animací** (`prototyp/`, mimo navigaci a `APP_SHELL`): `animace.html` porovnává SVG (`scene-svg.js`) a Three.js (`scene-three.js`, knihovna v `js/vendor/three-0.186.1/`) nad společným pohybem `motion.js` + `situace.json`. `court-scene.js` kvůli tomu exportuje i pomocné funkce kreslení (`createCamera`, `drawCourt`, `drawNet`, `thick`, `disc`, `polygon`, `floorCircle`, `bodyShape`, `NEAR`, `num`). Podrobnosti: docs/historie.md.

**Vývojové nástroje v kořeni** (na web nepatří, nejsou v `APP_SHELL`): `.editorconfig` (UTF-8, LF, 2 mezery), `.gitattributes` (LF i na disku; `js/vendor/` beze změn), `package.json` + `package-lock.json` (jen devDependencies: ESLint), `eslint.config.mjs` (pravidla; `private/` a `js/vendor/` se nekontrolují). `npm install` jednou, pak `npm run lint`.

---

## 8. Kam sáhnout, když chci…

| Chci… | Upravit |
|---|---|
| přidat/změnit otázku | `private/otazky.json` → seed SQL → spustit v Supabase |
| přidat kategorii otázek | `js/categories.js`, `tools/seed-otazky.mjs` (`CATEGORIES`), `check (kategorie in …)` v `sql/01_schema.sql`, shrnutí s tím id v pravidlech, cíl odznaku Všestranný (`sql/05` + `js/badges.js`), `CATS` v `private/testy/otazky-check.mjs` |
| změnit zkoušku (počet, limit, hranice) | `private.zkouska_*` v `sql/02_funkce.sql` + texty v `zkouska.html`, karta ve `vyuka.html`, popis odznaku v `js/badges.js` |
| přidat gesto | záznam v `gesta/gesta.json` (formát `gesta/README.md`) **a** do katalogu `private.gesta` v `sql/07_hry.sql` (hlídá test `body-db`) |
| upravit trenažér zápisu | pravidla a důsledky: `js/scoresheet-model.js`; úlohy: `scoresheet-tasks.js`; četnost událostí dlouhé verze: `scoresheet-game.js`; vzhled: `scoresheet-view.js` + CSS `sc-*`; testy `scoresheet-logic`, `e2e-zapis` |
| upravit trenažér postavení | generování a pravidla: `js/lineup-logic.js`; vzhled scény, kamery pohledů: `js/court-scene.js` (`VIEWS`) a CSS `ct-*`; texty a ovládání: `js/lineup-trainer.js` |
| přidat animaci situace | `animace/<id>.json` + `APP_SHELL` v `sw.js` |
| ilustrace k otázce | `private/obrazky/animace.mjs` / `diagramy.mjs` (vygenerovat), `media-otazek.mjs` (zapíše media do otazky.json), seed; nové soubory do `APP_SHELL`. Ilustrace nesmí prozradit odpověď. Kontrola: `private/testy/media-shots.mjs` |
| upravit hledání v pravidlech | slovníček `SYNONYMS`, `STOPWORDS`, koncovky `SUFFIXES` v `js/rules-search.js`; test `private/testy/e2e-hledani.mjs` |
| přidat/upravit pojem slovníčku | `slovnicek/pojmy.json` → `node private/pravidla-zdroj/build.mjs pravidla.html` (definice v pravidlech); test `e2e-slovnicek` |
| upravit text pravidel | `private/pravidla-zdroj/src/*.txt` + build (nebo drobnost přímo v `pravidla.html`) |
| přidat odznak | `js/badges.js` + `private.metriky_odznaku` v `sql/05_odznaky.sql` (stejné id) |
| změnit body / denní limit | hodnoty: `private.hodnoty_her` v `sql/01_schema.sql`; limit: `private.denni_limit_kol()` v `sql/02_funkce.sql`; texty v `zebricek.html` (Jak se počítají body) a `hry.html`; pravidla `docs/bodovy-system.md` |
| přidat bodovanou hru | hodnota do `private.hodnoty_her`, hodnota do `kola_hra_check` (`01`), start/odevzdání na serveru (vzor `zacni_hru`/`odevzdej_hru` v `07`), volba v `#board-game` (`zebricek.html`), štítek `data-points` v `hry.html` |
| novou stránku | HTML s hlavičkou/navigací jako ostatní **včetně meta CSP**, `APP_SHELL` + `CACHE` v `sw.js`, navigace ve všech stránkách, stránku do `PAGES` v `private/testy/e2e-csp.mjs` |
| novou externí službu (API, obrázky…) | upravit CSP (`connect-src`, `img-src`…) ve **všech** HTML stejně; test `e2e-csp` hlídá, že je všude stejná |
| aktualizovat supabase-js | postup v `docs/historie.md` (Knihovna Supabase a CSP) |
| změnit barvy/vzhled | proměnné na začátku `css/style.css` (světlý i tmavý režim) |
| změnit DB | soubor v `sql/` (opakovatelně spustitelný), test přechodu ze stávající verze, uživateli napsat pořadí spuštění |
