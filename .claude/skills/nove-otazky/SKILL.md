---
name: nove-otazky
description: Přidání nebo oprava otázek kvízu VoleyRef – napsat balíček podle pravidel FIVB 2025–2028, zkontrolovat skriptem, ověřit nezávislým agentem, sloučit do private/otazky.json, vygenerovat seed SQL a commitnout do soukromého repa. Použij, když uživatel chce nové otázky, opravu otázek nebo kontrolu jejich správnosti.
---

# Nové otázky kvízu

Otázky se správnými odpověďmi jsou jen v `private/otazky.json` (soukromé repo `VoleyRef-private`). Formát otázky je v CLAUDE.md.

## 1. Podklad: text pravidel FIVB
Stáhni PDF do scratchpadu a převeď na text (pdftotext je v Git Bash):
```
curl -sL -o rules.pdf https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf
pdftotext -layout rules.pdf rules.txt && iconv -f cp1252 -t utf-8 rules.txt > rules-utf8.txt
```
Pravidla 1–30 zhruba řádky 250–2710, Diagram 9 sankce ~2996, Diagram 11 znamení ~3082, Diagram 12 praporky ~3274. Číslování 2025–2028: 25 challenge, 26 rezervní rozhodčí, 27 zapisovatel, 28 pomocný zapisovatel, 29 čároví, 30 znamení.

## 2. Napsat balíček
- Soubor `balicekN.json` ve scratchpadu: pole otázek s novými `id` (navazují na nejvyšší v otazky.json); `aktivni`, `media`, `verze_pravidel` doplní skript (výchozí `true`, `null`, `"2025"`).
- Vlastními slovy, ne překlad pravidel. Odpovědi podobně dlouhé (správná nesmí vyčnívat), rozložit správné odpovědi A–D, situace jednoznačná (u okamžiku/úsudku to napsat přímo do situace), terminologie jako v pravidla.html („střední čára“, „tým“ v UI).
- Kontroluj pokrytí kategorií: `node -e` přes otazky.json (počet na kategorii a obtížnost).

## 3. Mechanická kontrola
```
node private/testy/otazky-check.mjs <balicekN.json>
```
Hlídá formát, kotvu pravidla v pravidla.html, podobnost se stávajícími, nápadně delší správnou odpověď, rozložení A–D. Opravit, dokud nehlásí tvrdé chyby (podobnost u záměrných dvojic je v pořádku).

## 4. Nezávislé ověření agentem
```
node private/testy/otazky-export.mjs <balicekN.json> k-overeni.txt
```
Spusť agenta (při víc než ~40 otázkách víc agentů souběžně) se zadáním: zkušený rozhodčí, ověřit každou otázku proti `rules-utf8.txt` (správnost odpovědi, není správná i jiná, jednoznačnost a reálnost situace, přesnost vysvětlení, číslo pravidla), výstup ZÁVAŽNÉ/STŘEDNÍ/DROBNÉ s citací a návrhem opravy, pak seznam OK otázek. Všechny nálezy opravit.

## 5. Sloučit a nasadit
```
node private/testy/otazky-check.mjs <balicekN.json> --merge
node tools/seed-otazky.mjs
```
- Seed vyzkoušet: `cd private/testy && node run-all.mjs db prechod`.
- Commit + push v `private/` (soukromé repo). Seed SQL (`private/seed-otazky.sql`) se necommituje.
- Uživateli napsat: spustit `private/seed-otazky.sql` v SQL editoru Supabase (případně předtím změněné `sql/0x`).
- Nová kategorie = změna schématu → nejdřív se zeptat (js/categories.js, tools/seed-otazky.mjs, check v sql/01_schema.sql, shrnutí v pravidla.html, odznak Všestranný v sql/05 + js/badges.js).
