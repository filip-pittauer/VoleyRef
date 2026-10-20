# Gesta rozhodčích – formát dat

Všechna gesta jsou v jednom souboru `gesta.json`. Používá ho kvíz gest (`gesta.html`, `js/gesture-quiz.js`) a přehled gest v pravidlech (`pravidla.html#signalizace`, `js/gesture-atlas.js`). Kreslí je `js/referee-figure.js`.

Zdroj: **FIVB Official Volleyball Rules 2025–2028**, Diagram 11 (gesta 1. a 2. rozhodčího) a Diagram 12 (praporek čárového rozhodčího). Texty jsou vlastními slovy, ne překlad pravidel.

## Struktura souboru

```json
{
  "skupiny": { "rozhodci": { "nazev": "1. a 2. rozhodčí", "diagram": "11" }, "carovi": { … } },
  "pozy": { "klid": { "ruka": [0.06, -0.54, 0.05], … }, … },
  "gesta": [ { … }, … ]
}
```

### Gesto

| Pole | Význam |
|---|---|
| `id` | identifikátor bez diakritiky (kotva v pravidlech: `pravidla.html#gesto-<id>`) |
| `cislo` | číslo gesta v diagramu FIVB (`"6a"`, `"25"`…) |
| `skupina` | `rozhodci` nebo `carovi`; špatné odpovědi v kvízu se berou ze stejné skupiny |
| `nazev` | co gesto znamená – text odpovědi v kvízu |
| `vyznam` | nepovinné rozšíření významu (zobrazí se po odpovědi a v přehledu) |
| `pohyb` | jak se gesto ukazuje – zároveň alternativní text animace (nesmí prozradit `nazev`) |
| `kdo` | který rozhodčí gesto ukazuje |
| `pravidla` | čísla pravidel FIVB, nebo `null` |
| `zamena` | nepovinné: `id` gest, se kterými se snadno splete (kvíz je nabízí jako špatné odpovědi) |
| `kamera` | nepovinné: `{ "otoceni": 18, "naklon": 6 }` – pohled zboku (stupně) a shora (stupně) |
| `vyrez` | nepovinné: výřez scény `[x, y, šířka, výška]` v metrech (praporek potřebuje víc místa) |
| `sit` | `true` = nakreslit síť (gesta, která ukazují na síť) |
| `delka` | délka animace v sekundách; poslední snímek je „držené“ gesto |
| `nahled` | nepovinné: čas, který je vidět před přehráním (výchozí = konec) |
| `prava`, `leva` | klíčové snímky pravé a levé paže (chybí-li, paže je v klidu) |
| `telo` | nepovinné: natočení celého těla `[{ "t": 0, "otoceni": 0 }, …]` ve stupních |

## Klíčové snímky paže

```json
"prava": [
  { "t": 0, "poza": "klid" },
  { "t": 0.25 },
  { "t": 0.9, "poza": "zvednuta", "tvar": "dva" },
  { "t": 2.2 }
]
```

Snímek obsahuje jen to, co se mění – ostatní hodnoty převezme z předchozího snímku. Snímek jen s `t` znamená „zůstaň stát“. Mezi snímky se pohyb dopočítá plynule (křivkou přes všechny body, na zastaveních zpomalí).

| Pole | Význam |
|---|---|
| `t` | čas v sekundách |
| `poza` | pojmenovaná poloha z `pozy` (např. `klid`, `zvednuta`, `do-strany`) |
| `ruka` | kde je zápěstí: `[ven, nahoru, vpřed]` v metrech **od ramene** |
| `loket` | kam má směřovat loket (směr), výchozí dolů, ven a mírně dozadu |
| `prsty` | kam míří prsty (směr), nebo `"predlokti"` = rovně v prodloužení předloktí |
| `dlan` | kam je otočená dlaň (směr) |
| `tvar` | `otevrena`, `pest`, `ukazovak`, `dva`, `ctyri`, `palec` |
| `drzi` | co je v ruce: `zluta`, `cervena`, `obe` (karty), `praporek`, nebo `null` |
| `kruh` | krouživý pohyb: `{ "stred": [..], "polomer": 0.07, "rovina": "bok", "otacky": 3, "doba": 1.8, "faze": 90 }` |

**Souřadnice paže jsou zrcadlené:** „ven“ je u pravé paže doprava, u levé doleva. Stejná čísla tak pro obě ruce znamenají souměrný pohyb. Paže měří 0,29 m (nadloktí) + 0,27 m (předloktí); když je `ruka` dál, paže se natáhne směrem k ní.

**Směry** se píšou slovy `nahoru`, `dolu`, `vpred`, `vzad`, `ven`, `dovnitr` a jdou sčítat (`"nahoru+ven"`), nebo jako vektor `[ven, nahoru, vpřed]`.

**Kruh:** `rovina` je `bok` (svisle zepředu dozadu), `celo` (svisle před tělem) nebo `vodorovna`; `faze` je úhel startu ve stupních, `smer` (1 / −1) směr otáčení.

## Tipy
- Gesto, které se ukazuje jednou rukou, může kvíz zobrazit zrcadlově (pro tým na druhé straně) – význam se nemění.
- Při ladění pomůže posuvník pod animací: zastaví ji v libovolném čase.
- Nové gesto přidané sem se automaticky objeví v kvízu i v pravidlech.
