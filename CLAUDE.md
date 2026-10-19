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
index.html        úvodní stránka / rozcestník
kviz.html         kvíz
pravidla.html     knížka pravidel
zebricek.html     žebříček
css/style.css     společné styly
js/               JavaScript (moduly)
img/              obrázky situací
data/otazky.json  otázky (jen v rané fázi, viz níže)
```

## Formát otázky
Platí pro `data/otazky.json` a později pro DB schéma.
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
- `data/otazky.json` – jen pár veřejných ukázek pro lokální fázi 2.

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

## Aktuální stav
- Supabase projekt je založený (zatím bez tabulek).
- Repo na GitHubu: zakládá se, další krok je fáze 1 (kostra webu).
