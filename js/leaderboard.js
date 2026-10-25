// Stránka žebříčku: celkový (nejlepší kolo hráče) a dnešní výzva.
// Pořadí počítá server (sql/02_funkce.sql – zebricek, sql/04_denni_vyzva.sql – denni_zebricek).
import { el } from './dom.js';
import { formatDuration } from './format.js';
import { badgeById } from './badges.js';
import { supabase, isConfigured, NOT_CONFIGURED_MESSAGE, getUser } from './supabase.js';

const LIMIT = 50;

const loginHint = document.getElementById('login-hint');

// Intl.DateTimeFormat – formátování data podle češtiny (jako CultureInfo v C#)
const dateFormat = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });

// Dva žebříčky se stejnou logikou, liší se jen RPC funkcí, prvky a sloupcem s datem.
const boards = {
  celkovy: {
    rpc: 'zebricek',
    status: document.getElementById('overall-status'),
    table: document.getElementById('overall-table'),
    withDate: true,
    empty: 'Zatím tu nikdo není. Buď první!',
  },
  denni: {
    rpc: 'denni_zebricek',
    status: document.getElementById('daily-status'),
    table: document.getElementById('daily-table'),
    withDate: false,
    empty: 'Dnešní výzvu zatím nikdo nedohrál. Buď první!',
  },
};

// ---------- Tabulka ----------
/** Odznaky, které si hráč vybral do žebříčku (ikony s popiskem pro čtečku i myš). */
function renderBadgeIcons(ids) {
  if (!ids?.length) return null;
  return [' ', el('span', { class: 'badge-icons' },
    ...ids.map(id => {
      const badge = badgeById(id);
      return el('span', { role: 'img', 'aria-label': badge.name, title: badge.name }, badge.icon);
    }))];
}

/** Pořadí: první tři místa jako medaile (zlato, stříbro, bronz), ostatní číslem. */
function renderRank(rank) {
  if (rank > 3) return `${rank}.`;
  return el('span', { class: `medal medal--${rank}` }, String(rank));
}

/** index = pořadí řádku v tabulce – řádky se „naskládají“ postupně (CSS proměnná --i). */
function renderRow(row, withDate, index) {
  return el('tr', { class: row.je_moje ? 'is-me' : null, style: `--i: ${index}` },
    el('td', { class: 'num' }, renderRank(row.poradi)),
    el('th', { scope: 'row' },
      row.prezdivka,
      renderBadgeIcons(row.odznaky),
      row.je_moje ? [' ', el('span', { class: 'you-tag' }, 'ty')] : null),
    el('td', { class: 'num' }, `${row.skore}/${row.pocet}`),
    el('td', { class: 'num' }, formatDuration(row.trvani_s)),
    withDate ? el('td', { class: 'num hide-narrow' }, dateFormat.format(new Date(row.datum))) : null);
}

/** Načte jeden žebříček (celkový, nebo denní) přes RPC a vykreslí tabulku. */
async function loadBoard(board) {
  const { data, error } = await supabase.rpc(board.rpc, { p_limit: LIMIT });
  if (error) {
    console.error(error);
    board.status.textContent = 'Žebříček se nepodařilo načíst. Zkus obnovit stránku.';
    return;
  }
  if (data.length === 0) {
    board.status.textContent = board.empty;
    return;
  }
  board.table.querySelector('tbody').replaceChildren(...data.map((row, i) => renderRow(row, board.withDate, i)));
  board.status.hidden = true;
  board.table.hidden = false;
}

// ---------- Záložky ----------
const tabs = {
  celkovy: { tab: document.getElementById('tab-celkovy'), panel: document.getElementById('panel-celkovy') },
  denni: { tab: document.getElementById('tab-denni'), panel: document.getElementById('panel-denni') },
};

function selectTab(name) {
  for (const [key, { tab, panel }] of Object.entries(tabs)) {
    const active = key === name;
    tab.setAttribute('aria-selected', String(active));
    panel.hidden = !active;
  }
  // adresa #denni → po obnovení stránky nebo sdílení odkazu zůstane stejná záložka
  history.replaceState(null, '', name === 'denni' ? '#denni' : location.pathname + location.search);
}

for (const [name, { tab }] of Object.entries(tabs)) {
  tab.addEventListener('click', () => selectTab(name));
}

// ---------- Načtení ----------
async function load() {
  if (location.hash === '#denni') selectTab('denni');

  if (!isConfigured) {
    for (const board of Object.values(boards)) board.status.textContent = NOT_CONFIGURED_MESSAGE;
    return;
  }

  const user = await getUser();
  loginHint.hidden = Boolean(user);
  await Promise.all(Object.values(boards).map(loadBoard));
}

load().catch(error => {
  // neočekávaná chyba (např. výpadek sítě) – raději hláška než věčné „Načítám…“
  console.error(error);
  for (const board of Object.values(boards)) {
    board.status.hidden = false;
    board.status.textContent = 'Žebříček se nepodařilo načíst. Zkus obnovit stránku.';
  }
});
