// Vygeneruje SQL pro nahrání situací hry „Odpískej to!“ z private/odpiskej.json.
//
// Použití (v terminálu ve složce projektu):
//   node tools/seed-odpiskej.mjs
// Vznikne private/seed-odpiskej.sql – spustit v Supabase → SQL Editor až po
// sql/09_odpiskej.sql. Situace se vkládají jako „upsert“ (stejné id = přepsat);
// nemazat, jen nastavit "aktivni": false.
//
// SQL obsahuje správná gesta, proto se ukládá do private/. NIKDY ho necommituj
// do veřejného repa.

import { readFileSync, writeFileSync } from 'node:fs';

const INPUT = 'private/odpiskej.json';
const OUTPUT = 'private/seed-odpiskej.sql';

const gestures = JSON.parse(readFileSync('gesta/gesta.json', 'utf8')).gesta;
const refereeGestures = new Set(gestures.filter(g => g.skupina === 'rozhodci').map(g => g.id));

/**
 * Kontrola situace: gesta existují, a pořadí odpovídá pravidlu 22.2.3 –
 * píská-li 1. rozhodčí, nejdřív družstvo, které bude podávat; píská-li
 * 2. rozhodčí (nebo jde o oboustrannou chybu), družstvo, které bude podávat, až nakonec.
 * @returns {string[]} chyby (prázdné = v pořádku)
 */
function validate(s, ids) {
  const errors = [];
  const where = `situace ${s.id}`;
  if (!Number.isInteger(s.id) || s.id < 1) errors.push(`${where}: id musí být kladné celé číslo`);
  if (ids.has(s.id)) errors.push(`${where}: duplicitní id`);
  if (![1, 2].includes(s.kdo)) errors.push(`${where}: kdo musí být 1 nebo 2`);
  if (!s.text?.trim() || !s.vysvetleni?.trim()) errors.push(`${where}: chybí text nebo vysvětlení`);
  if (!Array.isArray(s.spravne) || s.spravne.length < 1) errors.push(`${where}: spravne musí být neprázdné pole`);
  for (const g of s.spravne ?? []) if (!refereeGestures.has(g)) errors.push(`${where}: neznámé gesto rozhodčího „${g}“`);
  const doubleFault = s.spravne?.[0] === 'dvojita-chyba';
  const serveFirst = s.spravne?.[0] === 'tym-podava';
  if (s.kdo === 1 && !doubleFault && !serveFirst) errors.push(`${where}: 1. rozhodčí ukazuje nejdřív družstvo, které bude podávat`);
  if ((s.kdo === 2 || doubleFault) && s.spravne?.at(-1) !== 'tym-podava') errors.push(`${where}: družstvo, které bude podávat, patří na konec`);
  return errors;
}

const sqlText = value => (value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`);
const sqlArray = list => `array[${list.map(sqlText).join(', ')}]::text[]`;

const situations = JSON.parse(readFileSync(INPUT, 'utf8'));
const ids = new Set();
const errors = situations.flatMap(s => { const e = validate(s, ids); ids.add(s.id); return e; });
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const rows = situations.map(s => [
  `insert into public.odpiskej_situace (id, aktivni, kdo, text) values (${s.id}, ${s.aktivni !== false}, ${s.kdo}, ${sqlText(s.text)})`,
  '  on conflict (id) do update set aktivni = excluded.aktivni, kdo = excluded.kdo, text = excluded.text;',
  `insert into private.odpiskej_reseni (situace_id, spravne, vysvetleni, pravidlo) values (${s.id}, ${sqlArray(s.spravne)}, ${sqlText(s.vysvetleni)}, ${sqlText(s.pravidlo)})`,
  '  on conflict (situace_id) do update set spravne = excluded.spravne, vysvetleni = excluded.vysvetleni, pravidlo = excluded.pravidlo;',
].join('\n'));

writeFileSync(OUTPUT, `-- Vygenerováno: node tools/seed-odpiskej.mjs (z private/odpiskej.json). NEcommitovat do veřejného repa.\n-- Spustit po sql/09_odpiskej.sql.\n${rows.join('\n')}\n`);
console.log(`${OUTPUT}: ${situations.length} situací`);
