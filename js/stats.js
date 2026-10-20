// Statistiky přihlášeného hráče v Profilu (data počítá server: moje_statistiky()).
// Načtení spouští account.js, až je hráč přihlášený.
import { el } from './dom.js';
import { formatDuration, plural } from './format.js';
import { CATEGORIES, categoryName, difficultyName, categoryRulesUrl } from './categories.js';
import { BADGE_GROUPS } from './badges.js';
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
    el('h3', {}, 'Souhrn'),
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
    el('h3', {}, 'Úspěšnost podle kategorií'),
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
    el('h3', {}, 'Poslední kola'),
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

// ---------- Odznaky ----------
const badgeDateFormat = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });

function badgeCard(id, badge, progress) {
  const earned = Boolean(progress?.ziskano);
  const showBar = !earned && progress && progress.cil > 1;
  return el('li', { class: `badge-card ${earned ? 'badge-card--earned' : 'badge-card--locked'}` },
    el('span', { class: 'badge-card__icon', 'aria-hidden': 'true' }, badge.icon),
    el('strong', { class: 'badge-card__name' }, badge.name),
    el('span', { class: 'badge-card__desc' }, badge.description),
    earned
      ? el('span', { class: 'badge-card__state' }, `Získáno ${badgeDateFormat.format(new Date(progress.ziskano))}`)
      : el('span', { class: 'badge-card__state' }, showBar ? `${progress.hodnota} / ${progress.cil}` : 'Zatím nezískáno'),
    showBar
      ? el('span', { class: 'mini-bar', 'aria-hidden': 'true' },
          el('span', { style: `width: ${Math.round((progress.hodnota / progress.cil) * 100)}%` }))
      : null);
}

function renderBadges(data) {
  if (!data) return null;
  const byId = new Map(data.odznaky.map(o => [o.id, o]));
  const total = BADGE_GROUPS.reduce((sum, g) => sum + Object.keys(g.badges).length, 0);
  const earned = data.odznaky.filter(o => o.ziskano).length;

  return el('section', { id: 'odznaky', class: 'stack' },
    el('h3', {}, 'Odznaky'),
    el('p', {}, `Získáno ${earned} z ${total}. `,
      'Až 3 z nich si můžeš vybrat do žebříčku níže v ', el('a', { href: '#odznaky-zebricek' }, 'nastavení účtu'), '.'),
    ...BADGE_GROUPS.flatMap(group => [
      el('h4', {}, group.name),
      el('ul', { class: 'badge-grid' },
        ...Object.entries(group.badges).map(([id, badge]) => badgeCard(id, badge, byId.get(id)))),
    ]),
    el('p', { class: 'muted small' }, 'Kola bez chyby se počítají jen tehdy, když trvala aspoň 3 sekundy na otázku.'));
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
  const [{ data, error }, mistakes, badges] = await Promise.all([
    supabase.rpc('moje_statistiky'),
    supabase.rpc('pocet_chyb').then(r => r.data ?? 0),
    // když odznaky selžou, zbytek statistik se i tak zobrazí
    supabase.rpc('moje_odznaky').then(r => {
      if (r.error) console.error(r.error);
      return r.data ?? null;
    }),
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

  content.replaceChildren(
    renderSummary(data),
    renderCategories(data.kategorie, mistakes),
    renderRecent(data.posledni) ?? '',
    renderBadges(badges) ?? '');
  status.hidden = true;
  content.hidden = false;

  // odkaz ucet.html#odznaky – sekce vznikla až teď, prohlížeč na ni sám neodroloval
  if (location.hash === '#odznaky') document.getElementById('odznaky')?.scrollIntoView();
}

/** Načte a vykreslí statistiky (volá Profil po přihlášení). */
export function loadStats() {
  status.hidden = false;
  status.textContent = 'Načítám…';
  content.hidden = true;
  return load().catch(error => {
    // neočekávaná chyba (např. výpadek sítě) – raději hláška než věčné „Načítám…“
    console.error(error);
    status.hidden = false;
    status.textContent = 'Statistiky se nepodařilo načíst. Zkus obnovit stránku.';
  });
}
