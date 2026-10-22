---
name: vydani
description: Kontrolní seznam před commitem a pushem změn webu VoleyRef – testy, verze mezipaměti v sw.js, CODEMAP.md, oba repozitáře (veřejný a soukromý private/), pokyny ke spuštění SQL v Supabase. Použij, když uživatel řekne „pushni“, „commitni“, „nasaď“ nebo když dokončíš balíček práce.
---

# Vydání změn

1. **Testy:** `cd private/testy && node run-all.mjs` (nebo jen dotčené: `node run-all.mjs e2e-gesta`). Selhání vyřešit, nebo uživateli říct přesně co a proč. Zastaralý test opravit v private/testy, ne obcházet.
2. **Mezipaměť:** změnily se soubory webu (HTML/CSS/JS/JSON) → zvýšit `CACHE` v `sw.js`; nový soubor → přidat i do `APP_SHELL`.
3. **CODEMAP.md:** nový/přejmenovaný soubor, modul, export, RPC, tabulka → upravit ve stejném commitu.
4. **Vzhled:** u změn UI zkontrolovat přes Playwright MCP (desktop i šířka 390 px; snímky jdou do `.playwright-mcp/`, ignorované). Multitouch neumí – na to skripty.
5. **Commit:** zprávy česky, končit řádkem `Co-Authored-By` podle systémové připomínky. Veřejné repo i `private/` (soukromé repo – testy, otázky) zvlášť.
6. **Push:** jen pokud uživatel nechtěl počkat („nepushuj“ = commit a push až na pokyn). Větev `styl-hala` nikdy nepushovat.
7. **SQL:** změnily se `sql/` nebo otázky → uživateli přesně napsat, co spustit v SQL editoru Supabase a v jakém pořadí (`01`…`05`, pak `private/seed-otazky.sql`).
8. **Stav:** podstatnou změnu stavu zapsat krátce do „Aktuální stav“ v CLAUDE.md; podrobnosti do docs/historie.md (CLAUDE.md držet krátký – načítá se v každém sezení).
