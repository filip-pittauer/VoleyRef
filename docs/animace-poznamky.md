# Animace – poznámky k testování (prototyp A/B)

Přečíst před pokračováním práce na animacích. Kód je v `prototyp/` (A = SVG,
B = Three.js) a technické podrobnosti jsou v docs/historie.md, oddíl
„Prototyp animací A/B“.

## Výsledky testů varianty B (Three.js) na zařízeních (26. 10. 2026)

| Zařízení | Grafika | Výsledek |
|---|---|---|
| PC uživatele | – | vysoká kvalita, plynulé; B vypadá mnohem lépe než A |
| **Google Pixel 10 Pro** (osobní mobil uživatele) | PowerVR D-Series DXT-48-1536, OpenGL ES 3.2, WebGL 2 | **padalo** (viz níže); po opravě běží se stíny |
| Samsung Galaxy A26 | – | vysoká kvalita, plynulé, bez problémů |
| starý tablet Lenovo | – | vysoká kvalita, plynulé |
| velmi starý Samsung (~8 let) | – | vysoká kvalita naběhne, ale trhaně (pochopitelné) |

## Pád na Pixelu 10 Pro – průběh

1. Původní verze: vysoká kvalita naběhla (stíny, otáčení) a za ~2 s spadla
   (ztráta WebGL kontextu). Nízká kvalita šla.
2. Po pádu Chrome WebGL na stránce zablokuje. Každý další pokus pak hlásí
   „Error creating WebGL context.“, dokud se Chrome **úplně nezavře** (i z
   přehledu aplikací). Pouhé obnovení stránky nestačí.
3. Diagnostika po jednom faktoru: vysoká spadla po 55,6 s, bez MSAA po 3,4 s.
   **MSAA viníkem není**, pád přichází v náhodném čase.
4. Nalezená chyba: `renderer.setSize` se volal v každém snímku, a tím se
   60× za sekundu znovu vytvářel obrazový buffer. Opraveno (commit 7daa214),
   velikost se teď mění jen při změně.
5. Po opravě na Pixelu běží a vypadá dobře, nespadlo to. Kvůli zapamatovaným
   pádům v `localStorage` ale nejspíš běžela varianta „jednoduché stíny“,
   ne „vysoká“.

**Proč zrovna nejvýkonnější telefon:** Pixel 10 (čip Tensor G5) jako jeden
z mála telefonů používá grafiku PowerVR od Imagination. Ovladače k ní jsou
nové a v Chromu málo vyzkoušené, ostatní telefony mají Mali nebo Adreno.
Chyba je tedy spíš v ovladači nebo v Chromu na tomhle čipu než ve výkonu.
Plýtvání bufferem v bodě 4 ovladač zjevně nesnesl, jiné ano.

## Co zbývá, až se k animacím vrátíme

- Na Pixelu ověřit vysokou kvalitu: tlačítko „Začít znovu od vysoké“ nebo
  `animace.html?kvalita=vysoka`, nechat běžet 2–3 minuty a otáčet kamerou.
- Posoudit B ve velké scéně, stejně velké jako trenažér postavení.
  V prototypu jsou dvě malé scény pod sebou, takže kvalita není dobře
  vidět.
- Rozhodnout A/B. Pro B zatím mluví všechny vyzkoušené telefony.
- Ostrá verze B: jedna výchozí kvalita (vysoká, na slabých zařízeních
  případně nižší rozlišení), při pádu grafiky **automaticky přepnout na SVG**
  místo hlášky. Diagnostiku s `localStorage` a tlačítky z prototypu do ostré
  verze nepřenášet.
- Na slabých zařízeních (starý Samsung) hlídat dobu snímku a případně
  snížit kvalitu.
- Nápad uživatele převést web na mobilní aplikaci problém s grafikou sám
  nevyřeší: WebView (Capacitor, TWA) používá stejný Chromium a ovladač.
  Pomohl by jen nativní engine (Unity, Godot).
- Pak: přeanimovat situace, minihry (Učebna/Hala, „Odpískej to!“, duely).
- **Odpískej to! (odpiskej.html) má zatím statické situace** (jen text a zástupný
  rámeček „Animace situace přibude“, `.whistle-scene` ve `js/whistle-game.js`).
  Až bude rozhodnuto A/B, nahradit rámeček animací situace (Three.js) – data
  situací jsou v `public.odpiskej_situace`, k animaci přidat sloupec/odkaz na
  `animace/*.json`. Stejně pak Píšťalka (klepnout ve chvíli chyby).
