// Procvičování (Výuka, procvicovani.html): dlaždice kategorií s počtem otázek
// a úspěšností hráče. Samotné kolo pak běží stejně jako kvíz (quiz.js).
import { el } from './dom.js';
import { CATEGORIES } from './categories.js';
import { plural } from './format.js';

/** Kolik otázek je v kategorii (null = všechny) při zvolené obtížnosti (null = všechny). */
function questionCount(overview, category, difficulty) {
  return overview
    .filter(row => (!category || row.kategorie === category) && (!difficulty || row.obtiznost === difficulty))
    .reduce((sum, row) => sum + row.pocet, 0);
}

/** Úspěšnost hráče v kategorii: pruh + text; bez dat (nepřihlášený) nic. */
function successInfo(stat) {
  if (!stat) return null;
  if (!stat.otazek) return el('span', { class: 'practice-tile__meta' }, 'Zatím bez odpovědí');
  const percent = Math.round((stat.spravne / stat.otazek) * 100);
  return el('span', { class: 'practice-tile__success' },
    el('span', { class: 'practice-tile__bar', 'aria-hidden': 'true' },
      el('span', { style: `width: ${percent}%` })),
    el('span', { class: 'practice-tile__meta' }, `Úspěšnost ${percent} % z ${plural(stat.otazek, 'odpovědi', 'odpovědí', 'odpovědí')}`));
}

/**
 * Vykreslí dlaždice: „Mix všech kategorií“ a jednu dlaždici za každou kategorii.
 * Kliknutí zavolá onStart(category, button) – category null = mix.
 * @param {HTMLElement} container
 * @param {{ overview: Array|null, stats: Array|null, difficulty: number|null,
 *           suggested: string|null, onStart: Function }} options
 *   overview = počty otázek (null = nepodařilo se načíst → počty se neukážou),
 *   stats = úspěšnost po kategoriích (null = nepřihlášený),
 *   suggested = kategorie z odkazu (?kategorie=…), zvýrazní se
 */
export function renderPracticeTiles(container, { overview, stats, difficulty, suggested, onStart }) {
  const statsById = new Map((stats ?? []).map(s => [s.kategorie, s]));
  const tiles = [[null, 'Mix všech kategorií'], ...Object.entries(CATEGORIES)].map(([id, name]) => {
    const count = overview ? questionCount(overview, id, difficulty) : null;
    const button = el('button', {
      type: 'button',
      class: `practice-tile${id === null ? ' practice-tile--mix' : ''}${id && id === suggested ? ' practice-tile--suggested' : ''}`,
      disabled: count === 0,
    },
    el('span', { class: 'practice-tile__name' }, name),
    count === null ? null : el('span', { class: 'practice-tile__meta' },
      count === 0 ? 'Pro tuto obtížnost nejsou otázky' : plural(count, 'otázka', 'otázky', 'otázek')),
    id && stats ? successInfo(statsById.get(id) ?? { otazek: 0 }) : null);
    button.addEventListener('click', () => onStart(id, button));
    return button;
  });
  container.replaceChildren(...tiles);
}
