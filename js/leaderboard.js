// Stránka žebříčku: nejlepší kolo každého hráče (počítá server, viz sql/02_funkce.sql).
import { el } from './dom.js';
import { formatDuration } from './format.js';
import { supabase, isConfigured, NOT_CONFIGURED_MESSAGE, getUser } from './supabase.js';

const LIMIT = 50;

const status = document.getElementById('leaderboard-status');
const table = document.getElementById('leaderboard');
const tbody = table.querySelector('tbody');
const loginHint = document.getElementById('login-hint');

// Intl.DateTimeFormat – formátování data podle češtiny (jako CultureInfo v C#)
const dateFormat = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });

function renderRow(row) {
  return el('tr', { class: row.je_moje ? 'is-me' : null },
    el('td', { class: 'num' }, `${row.poradi}.`),
    el('th', { scope: 'row' }, row.prezdivka, row.je_moje ? [' ', el('span', { class: 'badge' }, 'ty')] : null),
    el('td', { class: 'num' }, `${row.skore}/${row.pocet}`),
    el('td', { class: 'num' }, formatDuration(row.trvani_s)),
    el('td', { class: 'num hide-narrow' }, dateFormat.format(new Date(row.datum))));
}

async function load() {
  if (!isConfigured) {
    status.textContent = NOT_CONFIGURED_MESSAGE;
    return;
  }

  const [{ data, error }, user] = await Promise.all([
    supabase.rpc('zebricek', { p_limit: LIMIT }),
    getUser(),
  ]);

  loginHint.hidden = Boolean(user);

  if (error) {
    console.error(error);
    status.textContent = 'Žebříček se nepodařilo načíst. Zkus to prosím později.';
    return;
  }
  if (data.length === 0) {
    status.textContent = 'Zatím tu nikdo není. Buď první!';
    return;
  }

  tbody.replaceChildren(...data.map(renderRow));
  status.hidden = true;
  table.hidden = false;
}

load().catch(error => {
  // neočekávaná chyba (např. výpadek sítě) – raději hláška než věčné „Načítám…“
  console.error(error);
  status.hidden = false;
  status.textContent = 'Žebříček se nepodařilo načíst. Zkus obnovit stránku.';
});
