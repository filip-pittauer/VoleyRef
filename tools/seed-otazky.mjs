// Vygeneruje SQL pro nahrání otázek z private/otazky.json do Supabase.
//
// Použití (v terminálu ve složce projektu):
//   node tools/seed-otazky.mjs
// Vznikne private/seed-otazky.sql – jeho obsah vlož do Supabase → SQL Editor → Run.
//
// Otázky se vkládají jako "upsert": nové se přidají, existující (stejné id)
// se přepíšou. Otázka smazaná z JSON v databázi zůstane – místo mazání
// jí raději nastav "aktivni": false.
//
// Výsledné SQL obsahuje správné odpovědi, proto se ukládá do private/
// (je v .gitignore). NIKDY ho necommituj.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const INPUT = 'private/otazky.json';
const OUTPUT = 'private/seed-otazky.sql';

const CATEGORIES = [
  'podani', 'prijem-nahravka', 'utok', 'blok', 'dotyky-chyby',
  'rotace-postaveni', 'stridani', 'preruseni-hry', 'signalizace',
];
const ANSWER_KEYS = ['A', 'B', 'C', 'D'];
const MEDIA_TYPES = ['obrazek', 'video', 'animace'];

// ---------- Kontrola dat ----------
function validate(questions) {
  const errors = [];
  const ids = new Set();

  for (const [index, q] of questions.entries()) {
    const where = `otázka #${index + 1} (id ${q.id})`;
    const err = message => errors.push(`${where}: ${message}`);

    if (!Number.isInteger(q.id) || q.id < 1) err('id musí být kladné celé číslo');
    if (ids.has(q.id)) err('duplicitní id');
    ids.add(q.id);

    if (typeof q.aktivni !== 'boolean') err('aktivni musí být true/false');
    if (!CATEGORIES.includes(q.kategorie)) err(`neznámá kategorie "${q.kategorie}"`);
    if (![1, 2, 3].includes(q.obtiznost)) err('obtiznost musí být 1, 2 nebo 3');
    if (!q.situace?.trim()) err('chybí situace');

    const keys = Object.keys(q.odpovedi ?? {});
    if (keys.length < 2 || keys.length > 4) err('odpovědi musí být 2–4');
    if (keys.join('') !== ANSWER_KEYS.slice(0, keys.length).join('')) err('odpovědi musí mít klíče A, B, (C, D) v tomto pořadí');
    if (!keys.includes(q.spravna)) err(`správná odpověď "${q.spravna}" není mezi odpověďmi`);

    if (q.media !== null && q.media !== undefined) {
      if (!MEDIA_TYPES.includes(q.media.typ)) err(`neznámý typ média "${q.media.typ}"`);
      if (!q.media.soubor) err('médium nemá soubor');
      else if (!/^https?:/.test(q.media.soubor) && !existsSync(q.media.soubor)) err(`soubor média "${q.media.soubor}" neexistuje`);
      if (!q.media.popis) err('médium nemá popis (alt text)');
    }
  }
  return errors;
}

// ---------- Převod na SQL ----------
// Text do SQL: apostrof se zdvojí ('' = jeden ' uvnitř řetězce).
function sqlText(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  if (value === null || value === undefined) return 'null';
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

function buildSql(questions) {
  const questionRows = questions.map(q => `  (${[
    q.id, q.aktivni, sqlText(q.kategorie), q.obtiznost, sqlText(q.situace),
    sqlJson(q.media ?? null), sqlJson(q.odpovedi), sqlText(q.pravidlo), sqlText(q.verze_pravidel),
  ].join(', ')})`);

  const solutionRows = questions.map(q =>
    `  (${q.id}, ${sqlText(q.spravna)}, ${sqlText(q.vysvetleni)})`);

  return `-- Vygenerováno: ${new Date().toISOString()} z ${INPUT} (${questions.length} otázek)
-- OBSAHUJE SPRÁVNÉ ODPOVĚDI – necommitovat!

insert into public.otazky
  (id, aktivni, kategorie, obtiznost, situace, media, odpovedi, pravidlo, verze_pravidel)
values
${questionRows.join(',\n')}
on conflict (id) do update set
  aktivni = excluded.aktivni,
  kategorie = excluded.kategorie,
  obtiznost = excluded.obtiznost,
  situace = excluded.situace,
  media = excluded.media,
  odpovedi = excluded.odpovedi,
  pravidlo = excluded.pravidlo,
  verze_pravidel = excluded.verze_pravidel,
  upraveno = now();

insert into private.otazky_reseni (otazka_id, spravna, vysvetleni)
values
${solutionRows.join(',\n')}
on conflict (otazka_id) do update set
  spravna = excluded.spravna,
  vysvetleni = excluded.vysvetleni;
`;
}

// ---------- Hlavní program ----------
const questions = JSON.parse(readFileSync(INPUT, 'utf8'));
const errors = validate(questions);

if (errors.length > 0) {
  console.error('V otázkách jsou chyby, SQL se nevytvořilo:');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}

writeFileSync(OUTPUT, buildSql(questions));
const active = questions.filter(q => q.aktivni).length;
console.log(`Hotovo: ${OUTPUT} (${questions.length} otázek, z toho ${active} aktivních).`);
