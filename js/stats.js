// Stránka statistik přihlášeného hráče (data počítá server: moje_statistiky()).
import { el } from './dom.js';
import { formatDuration, plural } from './format.js';
import { CATEGORIES, categoryName, difficultyName, categoryRulesUrl } from './categories.js';
import { supabase, isConfigured, NOT_CONFIGURED_MESSAGE, getUser } from './supabase.js';

// Kategorie s menším počtem otázek nebereme jako „nejslabší“ – málo dat.
const MIN_QUESTIONS_FOR_WEAKEST = 3;

const status = document.getElementById('stats-status');
const content = document.getElementById('stats-content');

const dateFormat = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

function percent(correct, total) {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

// ---------- Souhrn (dlaždice s čísly) ----------
function tile(label, value, note = null) {
  return el('div', { class: 'stat-tile' },
    el('p', { class: 'stat-tile__value' }, value),
    el('p', { class: 'stat-tile__label' }, label),
    note ? el('p', { class: 'stat-tile__note' }, note) : null);
}

function renderSummary({ souhrn, nejlepsi }) {
  return el('section', { class: 'stack' },
    el('h2', {}, 'Souhrn'),
    el('div', { class: 'stat-tiles' },
      tile('odehraných kol', souhrn.kol),
      tile('zodpovězených otázek', souhrn.otazek),
      tile('úspěšnost', `${percent(souhrn.spravne, souhrn.otazek)} %`, `${souhrn.spravne} správně`),
      tile('nejlepší kolo', nejlepsi ? `${nejlepsi.skore}/${nejlepsi.pocet}` : '–',
        nejlepsi ? `za ${formatDuration(nejlepsi.trvani_s)}` : null)));
}

// ---------- Kategorie (pruhy úspěšnosti) ----------
function categoryRow(id, stats) {
  const name = categoryName(id);
  if (!stats) {
    return el('li', { class: 'cat-row cat-row--empty' },
      el('span', { class: 'cat-row__name' }, name), ' ',
      el('span', { class: 'cat-row__value' }, 'zatím nehráno'));
  }
  const value = percent(stats.spravne, stats.otazek);
  return el('li', { class: 'cat-row' },
    el('span', { class: 'cat-row__name' }, name), ' ',
    el('span', { class: 'cat-row__value' }, `${value} % (${stats.spravne} z ${stats.otazek})`),
    // pruh je jen vizuální doplněk, číslo je v textu → aria-hidden
    el('span', { class: 'cat-row__bar', 'aria-hidden': 'true' },
      el('span', { style: `width: ${value}%` })));
}

function findWeakest(categories) {
  return categories
    .filter(c => c.otazek >= MIN_QUESTIONS_FOR_WEAKEST)
    .sort((a, b) => a.spravne / a.otazek - b.spravne / b.otazek)[0] ?? null;
}

function renderCategories(categories, mistakes) {
  const byId = new Map(categories.map(c => [c.kategorie, c]));
  const weakest = findWeakest(categories);

  return el('section', { class: 'stack' },
    el('h2', {}, 'Úspěšnost podle kategorií'),
    mistakes > 0
      ? el('p', { class: 'card' },
          'K opakování máš ', el('strong', {}, plural(mistakes, 'otázku', 'otázky', 'otázek')),
          ', ve kterých jsi naposledy chyboval. ', el('a', { href: 'kviz.html#opakovani' }, 'Opakovat chyby'), '.')
      : null,
    weakest && weakest.spravne < weakest.otazek
      ? el('p', { class: 'card' },
          'Nejvíc chybuješ v kategorii ', el('strong', {}, categoryName(weakest.kategorie)), '. ',
          el('a', { href: categoryRulesUrl(weakest.kategorie) }, 'Zopakuj si pravidla'), ' nebo ',
          el('a', { href: `kviz.html?kategorie=${encodeURIComponent(weakest.kategorie)}` }, 'si ji procvič'), '.')
      : null,
    el('ul', { class: 'cat-list' },
      ...Object.keys(CATEGORIES).map(id => categoryRow(id, byId.get(id)))));
}

// ---------- Poslední kola ----------
/** Popis kola: „Opakování chyb“, „Všechny“, „Útok · Těžká“… */
function roundLabel(round) {
  if (round.rezim === 'chyby') return 'Opakování chyb';
  if (round.rezim === 'denni') return 'Denní výzva';
  return [round.kategorie ? categoryName(round.kategorie) : 'Všechny', difficultyName(round.obtiznost)]
    .filter(Boolean).join(' · ');
}

function renderRecent(rounds) {
  if (rounds.length === 0) return null;
  return el('section', { class: 'stack' },
    el('h2', {}, 'Poslední kola'),
    el('div', { class: 'table-wrap' },
      el('table', { class: 'leaderboard' },
        el('caption', { class: 'visually-hidden' }, 'Posledních 10 odehraných kol'),
        el('thead', {}, el('tr', {},
          el('th', { scope: 'col' }, 'Kdy'),
          el('th', { scope: 'col' }, 'Kolo'),
          el('th', { scope: 'col', class: 'num' }, 'Body'),
          el('th', { scope: 'col', class: 'num' }, 'Čas'))),
        el('tbody', {}, ...rounds.map(r => el('tr', {},
          el('td', {}, dateFormat.format(new Date(r.datum))),
          el('td', {}, roundLabel(r)),
          el('td', { class: 'num' }, `${r.skore}/${r.pocet}`),
          el('td', { class: 'num' }, formatDuration(r.trvani_s))))))));
}

// ---------- Načtení ----------
async function load() {
  if (!isConfigured) {
    status.textContent = NOT_CONFIGURED_MESSAGE;
    return;
  }

  const user = await getUser();
  if (!user) {
    status.replaceChildren('Statistiky se ukládají jen přihlášeným hráčům. ',
      el('a', { href: 'ucet.html' }, 'Přihlas se'), ' a ', el('a', { href: 'kviz.html' }, 'zahraj si kvíz'), '.');
    return;
  }

  // dva dotazy najednou (Promise.all – jako Task.WhenAll v C#)
  const [{ data, error }, mistakes] = await Promise.all([
    supabase.rpc('moje_statistiky'),
    supabase.rpc('pocet_chyb').then(r => r.data ?? 0),
  ]);
  if (error) {
    console.error(error);
    status.textContent = 'Statistiky se nepodařilo načíst. Zkus to prosím později.';
    return;
  }

  if (data.souhrn.kol === 0) {
    status.replaceChildren('Zatím nemáš odehrané žádné kolo. ', el('a', { href: 'kviz.html' }, 'Zahraj si kvíz'), '.');
    return;
  }

  content.replaceChildren(renderSummary(data), renderCategories(data.kategorie, mistakes), renderRecent(data.posledni) ?? '');
  status.hidden = true;
  content.hidden = false;
}

load();
