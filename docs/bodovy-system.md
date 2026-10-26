# Bodový systém a žebříčky (návrh 26. 10. 2026)

Navazuje na docs/napady-hry-vyuka.md. Myšlenková mapa: https://claude.ai/artifact/B8fX6ha8XHJd3SMdWVkWrZ
(soukromá). Zatím jde o návrh, rozhodnutí
uživatele se zapisují na konec.

## Hlavní pravidlo: Hry = body, Výuka = bez bodů

| Výuka (bez bodů, bez tlaku) | Hry (bodované) |
|---|---|
| Pravidla, slovníček | Kvíz (náhodný mix otázek) |
| Atlas gest | Denní výzva |
| Trenažér postavení – volný režim | Kvíz gest, Gesto naopak, Odpískej to! |
| Trenažér zápisu | Rotační sprint (bodované postavení) |
| Kvíz podle kategorií a obtížnosti | Pravda / nepravda na čas |
| Opakování chyb | Najdi chybu v zápisu, 1v1 zápis |
| Zkouška (jen splněno/nesplněno + odznak) | Duely |

Proč: hráč hned ví, co se počítá. Kvíz podle kategorií by se dal „farmit“
na nejlehčí kategorii, proto patří do Výuky. Bodovaný kvíz je náhodný mix
všech kategorií.

## Jak se počítají body

**Férovost = podobný počet bodů za minutu hraní**, ne za množství obsahu.
Kolo kvízu (10 otázek) trvá ~3 min, kolo gest (10 gest) ~1,5 min. Kdyby
obojí dávalo 10 bodů za správnou, vyplatilo by se hrát jen gesta.
Cíl je **≈ 33 bodů za minutu** u každé hry. Body jsou ×10 proti nápadu
„5/10 = 5 bodů“, aby šly váhy psát bez desetinných čísel.

| Hra | Kolo | Body za správnou | Max za kolo |
|---|---|---|---|
| Kvíz | 10 otázek, ~3 min | 10 | 100 |
| Denní výzva | 5 otázek, 1× denně | 20 | 100 |
| Kvíz gest | 10 gest, ~1,5 min | 5 | 50 |
| Gesto naopak | 10 gest, ~1,5 min | 5 | 50 |
| Odpískej to! | 1 situace, ~30 s | 5 za každé gesto ve správném pořadí | ~15 |
| Rotační sprint | 10 situací, ~3 min | 10 | 100 |
| Pravda / nepravda | 60 s | +2, chybná −2 (aby se nevyplatilo tipovat), min. 0 | ~40 |
| Najdi chybu v zápisu | 1 zápis, ~30 s | 15 | 15 |
| Duel (asynchronní) | kolo kvízu | body jako kvíz + výhra 30 / remíza 15 | – |

Hodnoty jsou v tabulce na serveru (`private.hodnoty_her`), takže se dají
doladit bez změny kódu. Po prvních týdnech se dá z dat spočítat skutečný
čas kol a hodnoty upravit.

## Žebříčky

- **Celkový:** součet všech bodů za celou dobu. Při shodě je výš ten, kdo
  součtu dosáhl dřív, tedy kdo měl dřív poslední zisk bodů.
- **Denní:** součet bodů za dnešek (česká půlnoc). Kdo dnes nehrál, v něm
  není.
- **Za hru:** Kvíz, Gesta, Postavení… Součet bodů z té hry a ve sloupci
  i rekord (nejlepší kolo).
- **Denní výzva:** zůstává jako dnes (všichni mají stejné otázky, porovnává
  se skóre a čas).
- Návrh navíc: **týdenní** (od pondělí). Celkový žebříček bude časem pro
  nováčky nedosažitelný, týdenní dá šanci každému.

Body dostávají jen přihlášení hráči (stejně jako dnes žebříček).

## Ochrana férovosti

- **Body počítá server**, stejně jako u kvízu. Každá bodovaná hra musí mít
  serverové „začni kolo / odevzdej kolo“. Prohlížeč posílá jen odpovědi.
- **Denní strop:** plné body jen za prvních 5 kol každé hry za den (denní
  výzva 1×). Další kola jdou hrát a ukládají se do statistik, ale za 0 bodů.
  Celkový žebříček pak odměňuje pravidelnost, ne to, kdo má víc volného
  času. Zároveň to omezí škodu, kdyby si někdo napsal robota.
- **Min. 2 s na otázku** (už platí u kvízu).
- Gesta jsou veřejná data (gesta.json), takže je jde poznat i strojově.
  Úplně zabránit se tomu nedá. Strop a kontrola času to drží v rozumných
  mezích.

## Technika (pro implementaci)

- `public.kola`: nový sloupec `hra` (`kviz`, `gesta`, `postaveni`…;
  výchozí `kviz`) a `body`.
- `private.hodnoty_her`: hra, režim, body za správnou, bonus, denní strop.
- Body jako „účetní kniha“: každý zisk bodů je řádek (hráč, hra, zdroj =
  kolo nebo duel, body, čas). Všechny žebříčky jsou jen součty nad ní,
  s filtrem na den, týden nebo hru.
- Nové RPC: `zebricek_body(obdobi, hra)` místo dnešního `zebricek`.
- **Přepočet starých kol:** existující kvízová kola jsou ověřená serverem,
  takže se z nich body dají spočítat zpětně a nikdo nezačne od nuly.
- Jednoduché hry (kvíz, gesta, gesto naopak, pravda/nepravda) půjdou
  ověřovat v SQL. Postavení a zápis mají složitou logiku v JS: buď ji
  přepsat do SQL, nebo použít Supabase Edge Function. Ta běží v JS a mohla
  by použít stejný `lineup-logic.js`. Edge Functions budou stejně potřeba
  pro AI „Zeptej se pravidel“.

## Pořadí balíčků (návrh)

1. Rozdělení Hry / Výuka (navigace, rozcestníky).
2. Body: DB (kola.hra, hodnoty, kniha bodů, přepočet), bodovaný kvíz,
   nový žebříček s přepínačem Celkem / Dnes / Kvíz / Denní výzva.
3. Kvíz gest přes server (body za gesta), záložka Gesta v žebříčku.
4. Každá další minihra přijde rovnou s vlastní hodnotou bodů a záložkou.

## Rozhodnuto (26. 10. 2026)

1. **Denní strop = 1 bodované kolo každé hry za den.** První kolo kvízu dá
   body, druhé už ne. První kolo postavení dá body, druhé ne atd. Počet je
   jedna proměnná na serveru (funkce `private.denni_limit_kol()`, stejně
   jako `zkouska_limit()`), aby šel změnit jedním přepsáním.
2. Kvíz podle kategorií a opakování chyb **bez bodů** (Výuka).
3. Zkouška (celá simulace 30 otázek / 30 min) **jen odznak**, bez bodů.
4. **Týdenní žebříček ano** (od pondělí), aby to dávalo smysl i pro nové
   hráče.
5. Stará kola kvízu **přepočítat** (i se stropem 1 kolo za den).
6. **Denní výzva nemá vlastní žebříček.** Dává 2× víc bodů za správnou než
   ostatní hry (20 místo 10) a odměňuje i rychlost. Návrh bonusu: až +50
   bodů, plný do 30 s celého kola, pak lineárně klesá na 0 ve 2 min,
   a násobí se podílem správných odpovědí, aby se nevyplatilo rychle
   tipovat. Server zná jen čas celého kola (začátek a odevzdání), ne čas
   jednotlivých otázek. Příklad: 4/5 za 45 s = 80 + 50 × (1 − 15/90) × 4/5
   = 80 + 33 = 113 bodů. Max 150.

## Ověřování postavení a zápisu na serveru

Rozhodnuto 26. 10.: **B = Supabase Edge Function se sdíleným JS**
(`lineup-logic.js`, `scoresheet-*.js` běží i na serveru). Zatím
neimplementováno – před nasazením první funkce ověřit, kde fyzicky běží (GDPR),
a nastavit pojistky (docs/pred-spustenim.md, Náklady a zneužití).

## Stav implementace (větev body-a-minihry)

Hotovo:
- `sql/01`: `kola.hra`, `polozky`, `body`, `body_duvod`, tabulka `private.hodnoty_her`.
- `sql/02`: `private.denni_limit_kol()` (= 1), `body_za`, `prirad_body`
  (při odevzdání kola), `odevzdej_kolo` vrací body.
- `sql/07_hry.sql`: katalog gest, `zacni_hru` / `odevzdej_hru` (kvíz gest,
  Gesto naopak), `zebricek_body` (celkem / týden / den, za hru), `moje_body`,
  přepočet starých kol.
- Web: žebříček podle bodů (záložky + výběr hry), body ve výsledku kvízu
  a her s gesty, souhrn bodů a stav her v Hrách, nová minihra Gesto naopak.

Odchylky od návrhu:
- **Kniha bodů** není samostatná tabulka – body jsou sloupec `kola.body`
  (zatím všechny body pocházejí z kol). Až přijdou duely s bonusem za výhru,
  zvážit tabulku zisků, nebo bonus jako sloupec kola duelu.
- Denní výzva je v žebříčku „Kvíz“ (hra `kviz`, režim `denni`), vlastní žebříček
  nemá. Starý žebříček nejlepšího kola (`zebricek`, `denni_zebricek`) v DB
  zůstává, web ho už nevolá.
- Statistiky v Profilu a odznaky počítají jen kvíz (`hra = 'kviz'`).

Rotační sprint (27. 10.): **bez Edge Function** – pravidla pořadí (rotace,
střídání, libero) jsou jednoduchá, SQL je zvládne (`sql/08_rotace.sql`), JS má
kopii pro okamžitou zpětnou vazbu a test `rotace-db` hlídá shodu. 60 s,
5 bodů za správnou situaci, odevzdání víc než 15 s po limitu = 0 bodů ('cas').
Edge Function zůstává pro trenažér postavení (geometrie) a zápis; při nasazení
vynutit region `eu-central-1` (Frankfurt, `region` v `functions.invoke`).

Odpískej to! (27. 10.): `sql/09_odpiskej.sql`, 10 bodů za situaci (celá
posloupnost gest ve správném pořadí). Řešení tajná jako u kvízu
(`private/odpiskej.json` → seed). Situace zatím text, animace později.

Zbývá: bodovaný zápis, další minihry (Pravda/nepravda, Najdi chybu v zápisu…),
duely.
