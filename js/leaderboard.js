// Stránka žebříčku: součet bodů za období (celkem / tento týden / dnes),
// volitelně jen z jedné hry. Pořadí i body počítá server
// (sql/07_hry.sql – zebricek_body; pravidla bodů v docs/bodovy-system.md).
import { el } from './dom.js';
import { badgeById } from './badges.js';
import { getPointsLeaderboard } from './quiz-api.js';
import { isConfigured, NOT_CONFIGURED_MESSAGE, getUser } from './supabase.js';

const LIMIT = 50;

const loginHint = document.getElementById('login-hint');
const panel = document.getElementById('board-panel');
const intro = document.getElementById('board-intro');
const gameSelect = document.getElementById('board-game');
const status = document.getElementById('board-status');
const table = document.getElementById('board-table');
const caption = document.getElementById('board-caption');

// období → záložka a texty; kotva v adrese (#tyden, #dnes) otevře záložku
const PERIODS = {
  celkem: { tab: document.getElementById('tab-celkem'), intro: 'Součet bodů za celou dobu.', empty: 'Zatím tu nikdo není. Buď první!' },
  tyden: { tab: document.getElementById('tab-tyden'), intro: 'Body od pondělí – každý týden začínají všichni znovu.', empty: 'Tento týden zatím nikdo nebodoval. Buď první!' },
  dnes: { tab: document.getElementById('tab-dnes'), intro: 'Body jen za dnešek, nový den začíná o půlnoci.', empty: 'Dnes zatím nikdo nebodoval. Buď první!' },
};
let period = 'celkem';

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
function renderRow(row, index) {
  return el('tr', { class: row.je_moje ? 'is-me' : null, style: `--i: ${index}` },
    el('td', { class: 'num' }, renderRank(Number(row.poradi))),
    el('th', { scope: 'row' },
      row.prezdivka,
      renderBadgeIcons(row.odznaky),
      row.je_moje ? [' ', el('span', { class: 'you-tag' }, 'ty')] : null),
    el('td', { class: 'num' }, String(row.body)),
    el('td', { class: 'num' }, String(row.kol)));
}

/** Načte žebříček pro zvolené období a hru. */
async function loadBoard() {
  const game = gameSelect.value || null;
  const texts = PERIODS[period];
  intro.textContent = texts.intro;
  caption.textContent = `Žebříček – ${texts.tab.textContent}${game ? `, ${gameSelect.selectedOptions[0].textContent}` : ''}`;
  let rows;
  try {
    rows = await getPointsLeaderboard({ period, game, limit: LIMIT });
  } catch (error) {
    console.error(error);
    showStatus('Žebříček se nepodařilo načíst. Zkus obnovit stránku.');
    return;
  }
  if (rows.length === 0) {
    showStatus(texts.empty);
    return;
  }
  table.querySelector('tbody').replaceChildren(...rows.map(renderRow));
  status.hidden = true;
  table.hidden = false;
}

function showStatus(text) {
  status.textContent = text;
  status.hidden = false;
  table.hidden = true;
}

// ---------- Záložky ----------
function selectPeriod(name) {
  period = name;
  for (const [key, { tab }] of Object.entries(PERIODS)) {
    tab.setAttribute('aria-selected', String(key === name));
  }
  panel.setAttribute('aria-labelledby', PERIODS[name].tab.id);
  // adresa #tyden / #dnes → po obnovení nebo sdílení odkazu zůstane stejná záložka
  history.replaceState(null, '', name === 'celkem' ? location.pathname + location.search : `#${name}`);
}

/** Záložka z adresy; staré odkazy #denni (dřívější žebříček denní výzvy) → Dnes. */
function periodFromHash() {
  const hash = location.hash.slice(1);
  if (hash === 'denni') return 'dnes';
  return PERIODS[hash] ? hash : 'celkem';
}

// ---------- Načtení ----------
async function init() {
  selectPeriod(periodFromHash());
  if (!isConfigured) {
    showStatus(NOT_CONFIGURED_MESSAGE);
    return;
  }
  for (const [name, { tab }] of Object.entries(PERIODS)) {
    tab.addEventListener('click', () => { selectPeriod(name); loadBoard(); });
  }
  gameSelect.addEventListener('change', loadBoard);
  const user = await getUser().catch(() => null);
  loginHint.hidden = Boolean(user);
  await loadBoard();
}

init();
