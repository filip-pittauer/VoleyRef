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

## K rozhodnutí

1. Denní strop: ano/ne, kolik kol (návrh 5).
2. Kvíz podle kategorií a opakování chyb bez bodů (návrh ano)?
3. Zkouška: bez bodů, jen odznak (návrh), nebo body?
4. Týdenní žebříček: ano/ne.
5. Přepočítat stará kola kvízu (návrh ano).

## Rozhodnuto

(zatím nic)
