// Karta „Pokračuj“ na úvodu (index.html): přihlášenému ukáže, co ho čeká –
// další lekci kurzu, chyby k opakování a hry, ve kterých dnes ještě může
// získat body. Nepřihlášenému nabídne, kde začít. Data se načítají
// souběžně a chyba jednoho zdroje kartu nezastaví (ta položka jen chybí).
import { el } from './dom.js';
import { categoryName } from './categories.js';
import { plural } from './format.js';
import { getCourseProgress, getMistakesCount, getMyPoints } from './quiz-api.js';
import { loadLessons, lessonStates } from './course.js';
import { DUEL_GAMES } from './duel.js';
import { getUser, isConfigured } from './supabase.js';

const card = document.getElementById('pokracuj');

/** Jedna řádka karty: odkaz s nadpisem a krátkým textem. */
function item(href, title, text) {
  return el('li', {}, el('a', { class: 'continue-item', href },
    el('span', { class: 'continue-item__title' }, title),
    el('span', { class: 'continue-item__text' }, text)));
}

/** Kurz: další odemčená lekce, začátek kurzu, nebo pozvánka na zkoušku. */
function courseItem(lessons, progressRows) {
  const progress = new Map(progressRows.map(p => [p.kategorie, p]));
  const states = lessonStates(lessons, progress);
  const done = states.filter(s => s === 'done').length;
  if (done === lessons.length) return item('zkouska.html', 'Kurz máš hotový 🎉', 'Vyzkoušej si zkoušku: 30 otázek za 30 minut.');
  const next = lessons[states.indexOf('open')];
  return done === 0
    ? item('kurz.html', 'Začni kurzem po lekcích', `Pravidla krok za krokem – první lekce: ${categoryName(next.kategorie)}.`)
    : item('kurz.html', 'Pokračuj v kurzu', `Lekce ${done + 1} z ${lessons.length}: ${categoryName(next.kategorie)}.`);
}

/** Hry, ve kterých dnes ještě nebylo bodované kolo (dnes_hrano = ['kviz/bezne', …]). */
function gamesItem(points) {
  const left = Object.entries(DUEL_GAMES).filter(([game]) => !points.dnes_hrano.includes(`${game}/bezne`));
  if (!left.length) {
    return item('zebricek.html', 'Dnešní body máš ze všech her ✓', `Tento týden: ${plural(points.tyden, 'bod', 'body', 'bodů')}. Podívej se do žebříčku.`);
  }
  return item(left.length === Object.keys(DUEL_GAMES).length ? 'hry.html' : DUEL_GAMES[left[0][0]].page,
    'Dnes ještě můžeš získat body',
    `${left.map(([, game]) => game.name).join(', ')}. Tento týden máš ${plural(points.tyden, 'bod', 'body', 'bodů')}.`);
}

/** Přihlášený: položky podle toho, co se podařilo načíst. */
async function renderPlayer() {
  const [lessons, progress, mistakes, points] = await Promise.allSettled([
    loadLessons(), getCourseProgress(), getMistakesCount(), getMyPoints(),
  ]);
  for (const result of [lessons, progress, mistakes, points]) {
    if (result.status === 'rejected') console.error(result.reason);
  }
  const items = [
    lessons.status === 'fulfilled' && progress.status === 'fulfilled' ? courseItem(lessons.value, progress.value) : null,
    mistakes.status === 'fulfilled' && mistakes.value > 0
      ? item('procvicovani.html#opakovani', 'Opakuj chyby', `${plural(mistakes.value, 'otázka', 'otázky', 'otázek')}, ve kterých jsi naposledy chyboval.`)
      : null,
    points.status === 'fulfilled' ? gamesItem(points.value) : null,
  ].filter(Boolean);
  if (!items.length) return;   // nic se nenačetlo – karta zůstane skrytá
  card.replaceChildren(el('h2', {}, 'Pokračuj'), el('ul', { class: 'continue-list' }, ...items));
  card.hidden = false;
}

/** Nepřihlášený: kde začít a proč se přihlásit. */
function renderGuest() {
  card.replaceChildren(
    el('h2', {}, 'Nevíš, kde začít?'),
    el('ul', { class: 'continue-list' },
      item('kurz.html', 'Kurz po lekcích', 'Pravidla krok za krokem: přečti si kapitolu a splň krátký test.'),
      item('kviz.html', 'Kvíz z herních situací', 'Rozhodni 10 situací a na konci uvidíš vysvětlení.')),
    el('p', { class: 'small muted' }, 'Po ', el('a', { href: 'ucet.html' }, 'přihlášení'),
      ' se ti ukládá postup v kurzu, chyby k opakování a body do žebříčku.'));
  card.hidden = false;
}

async function init() {
  const user = await getUser().catch(() => null);
  if (user) await renderPlayer();
  else renderGuest();
}

if (card) {
  if (isConfigured) init();
  else renderGuest();
}
