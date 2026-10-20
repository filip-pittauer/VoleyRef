# VoleyRef – trénink volejbalových rozhodčích

Webová aplikace pro lidi, kteří se učí na volejbalové rozhodčí. Hráč vidí herní situaci,
rozhodne, jak má rozhodčí postupovat, a na konci kola dostane skóre a vysvětlení.

**▶ Vyzkoušet: [filip-pittauer.github.io/VoleyRef](https://filip-pittauer.github.io/VoleyRef/)**

Jde nainstalovat do mobilu jako aplikace (PWA) a pravidla a gesta fungují i bez internetu.

## Co aplikace umí

- **Kvíz situací** – kola po 10 otázkách (obrázek, video nebo animace + odpovědi A/B/C),
  filtr podle kategorie a obtížnosti, opakování chyb. Body počítá server, ne prohlížeč.
- **Denní výzva** – 5 stejných otázek pro všechny hráče, jeden pokus denně, denní žebříček a série.
- **Gesta rozhodčích** – všech 32 oficiálních gest jako animovaná 3D postava a kvíz „Co znamená toto gesto?“.
- **Pravidla** – úplná pravidla halového volejbalu FIVB 2025–2028 vlastními slovy, s oficiálním číslováním,
  shrnutími „Ve zkratce“, definicemi pojmů a diagramy. Každý bod má vlastní odkaz (např. `pravidla.html#p-12-4-3`).
- **Žebříček a Profil** – přihlášení e-mailem nebo přes Google, statistiky podle kategorií, 18 odznaků.

> Pravidla v aplikaci jsou neoficiální výukový text. Závazné je znění
> [ČVS](https://www.cvf.cz/) a [FIVB](https://www.fivb.com/volleyball/the-game/official-volleyball-rules/).

## Technologie

- **Frontend:** čisté HTML, CSS a JavaScript (ES moduly), bez frameworku a bez build kroku.
  Animace jsou SVG řízené daty (JSON).
- **Backend:** [Supabase](https://supabase.com/) – PostgreSQL, přihlášení (Auth) a databázové funkce (RPC).
- **Hosting:** GitHub Pages.

Podrobná mapa souborů, modulů a databázových funkcí je v [CODEMAP.md](CODEMAP.md).

## Struktura

```
*.html          stránky (kviz, gesta, pravidla, zebricek, ucet = Profil, …)
css/            styly a písma (písma jsou uložená ve fonts/, nenačítají se z Googlu)
js/             ES moduly (jeden vstupní modul na stránku)
gesta/          gesta rozhodčích jako data (gesta.json, formát v README)
animace/        animace herních situací jako data (formát v README)
sql/            databáze pro Supabase (spouštět v pořadí 01, 02, …)
tools/          pomocné skripty pro Node.js
sw.js           service worker (offline)
```

## Spuštění u sebe

1. Naklonuj repo a otevři složku ve VS Code.
2. Spusť stránku přes rozšíření **Live Server** (nebo jakýkoli statický server, např. `npx http-server`).
   Moduly a service worker nefungují při otevření souboru přímo (`file://`).

Pravidla a gesta fungují hned. Kvíz, žebříček a přihlášení potřebují databázi:

### Vlastní Supabase

1. Založ projekt na Supabase.
2. V **SQL Editoru** spusť soubory ze složky `sql/` v pořadí `01` → `05`.
   Všechny jde spustit opakovaně (aktualizují stávající databázi).
3. Do `js/config.js` dej **Project URL** a **publishable (anon) klíč** svého projektu.
4. V Supabase → Authentication → URL Configuration povol adresu svého webu (stránka `ucet.html`).
5. Nahraj otázky: v repu nejsou (obsahují správné odpovědi). Formát je popsaný v
   [CLAUDE.md](CLAUDE.md#formát-otázky); skript `node tools/seed-otazky.mjs` z `private/otazky.json`
   vytvoří SQL, které spustíš v SQL Editoru.

## Bezpečnost

- Ve frontendu je jen veřejná URL a publishable klíč Supabase. Heslo k databázi ani `service_role` klíč
  do repa nepatří.
- Všechny tabulky mají Row Level Security. Prohlížeč k nim přistupuje jen přes databázové funkce.
- Správné odpovědi jsou v neveřejném schématu `private` a skóre počítá server
  (`zacni_kolo` / `odevzdej_kolo`), takže výsledek nejde podvrhnout z prohlížeče.

## Stav

Projekt se průběžně vyvíjí. Plán a poznámky k vývoji jsou v [CLAUDE.md](CLAUDE.md).
