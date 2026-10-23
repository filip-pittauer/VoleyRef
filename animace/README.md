# Animace situací – formát dat

Každá animace je jeden JSON soubor v této složce. U otázky se na něj odkazuje přes `media`:

```json
"media": { "typ": "animace", "soubor": "animace/podani-preslap.json", "popis": "Popis pro nevidomé (alt text)" }
```

## Souřadnice
Pohled shora, jednotky jsou **metry**:

```
 y=0  ┌────────────┬────────────┐
      │  tým A     │     tým B  │
      │ (modrý)    │  (červený) │
 y=9  └────────────┴────────────┘
     x=0    x=6   x=9  x=12   x=18
          útočná  síť  útočná
           čára        čára
```

- `x` 0–18 po délce hřiště, síť je na `x = 9`, útočné čáry na `x = 6` a `x = 12`.
- `y` 0–9 po šířce, antény jsou na `y = 0` a `y = 9`.
- Volná zóna je vidět do −3 / 21 (x) a −2,5 / 11,5 (y).
- `z` = výška nad zemí v metrech (nepovinná, výchozí 0). Míč ve výšce je větší a má stín. Hráč s `z > 0` je ve výskoku.

## Struktura souboru

```json
{
  "delka": 4,
  "hraci": [
    { "tym": "A", "cislo": 7, "pozice": [[0, 3, 4.5], [1.2, 5.2, 5], [1.6, 5.8, 5, 1], [2.2, 6.8, 5, 0]] }
  ],
  "mic": [[0, 8.3, 6.5, 2.5], [1.6, 5.8, 5, 3.3], [2.2, 15, 3, 0]],
  "zvyrazneni": [{ "x1": 6, "y1": 0, "x2": 6, "y2": 9, "od": 0.8, "do": 2.6 }],
  "texty": [{ "od": 0.9, "do": 1.4, "text": "Odraz zpoza útočné čáry" }]
}
```

| Pole | Význam |
|---|---|
| `delka` | délka animace v sekundách |
| `hraci[]` | hráči: `tym` (`A` modrý / `B` červený), `cislo` (číslo na dresu), `pozice` |
| `pozice`, `mic` | **klíčové body** `[čas, x, y, z?]` seřazené podle času. Mezi body se poloha dopočítá rovnoměrně (interpolace). Před prvním bodem a po posledním stojí na místě. |
| `zvyrazneni[]` | žlutě zvýrazněná čára (např. koncová nebo útočná) viditelná v čase `od`–`do` |
| `texty[]` | popisek pod animací v čase `od`–`do` |
| `hraci[].stitek` | nepovinný štítek pod hráčem, např. `"zadní řada"`, `"L"`, `"pozice 2"` |
| `hraci[].libero` | `true` = hráč v dresu libera (zelený) |
| `znacky[]` | pevné bílé značky na podlaze `{ x1, y1, x2, y2, carkovana? }` (prodloužení čar, krátké čáry zóny podání) |
| `obdelniky[]` | pevné obdélníky s popiskem `{ x, y, sirka, vyska, text? }` (např. stolek zapisovatele) |
| `vyrez` | nepovinný výřez `[x, y, šířka, výška]` místo výchozího `[-3, -2.5, 24, 14]` |

Tip: hráče, který stojí na místě, stačí zapsat jedním bodem, např. `[[0, 7.5, 4.5]]`.

## Animace k otázkám

Soubory `q<id>-*.json` generuje skript `private/obrazky/animace.mjs` (oblouky míče se dopočítají), do otázek je zapisuje `private/obrazky/media-otazek.mjs`. Animace ukazuje jen situaci ze zadání, nikdy řešení – otázka ji vidí před odpovědí.
