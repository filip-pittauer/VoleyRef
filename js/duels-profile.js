// Profil → Duely: aktivní duely (čekají na soupeře / hrají se) a historie
// všech odehraných. Data: moje_duely() (sql/10_duely.sql).
import { el } from './dom.js';
import { getMyDuels } from './quiz-api.js';
import { DUEL_GAMES, PENDING_DUEL_KEY, duelLink, renderShareBox } from './duel.js';

const dateFormat = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' });
const RESULT_LABEL = { vyhra: 'Výhra', prohra: 'Prohra', remiza: 'Remíza' };

const score = s => (s ? `${s.skore}/${s.pocet}` : '–');

/** Aktivní duel: proti komu, stav; u čekající výzvy odkaz k poslání. */
function activeItem(duel) {
  const game = DUEL_GAMES[duel.hra]?.name ?? duel.hra;
  const waiting = duel.stav === 'ceka';
  const who = duel.ja_vyzyvatel
    ? (waiting ? 'Čeká se, až kamarád výzvu přijme' : `Hraje ${duel.protihrac}`)
    : `Výzva od hráče ${duel.protihrac}`;
  return el('li', { class: 'duel-item stack' },
    el('p', {}, el('strong', {}, game), ` · ${who}`),
    el('p', { class: 'small muted' }, `Tvůj výsledek: ${score(duel.moje)} · ${dateFormat.format(new Date(duel.vytvoreno))}`),
    duel.ja_vyzyvatel && waiting ? renderShareBox(duelLink(duel.kod), game) : null,
    !duel.ja_vyzyvatel ? el('a', { class: 'button button--small', href: `duel.html?kod=${encodeURIComponent(duel.kod)}` }, 'Dohrát') : null);
}

/** Odehraný (nebo vypršelý) duel v historii. */
function historyItem(duel) {
  const game = DUEL_GAMES[duel.hra]?.name ?? duel.hra;
  const label = duel.stav === 'vyprselo' ? 'Vypršelo' : RESULT_LABEL[duel.vysledek];
  return el('li', { class: `duel-item duel-item--${duel.vysledek ?? 'vyprselo'}` },
    el('span', { class: 'duel-item__result' }, label),
    el('span', {}, el('strong', {}, game), duel.protihrac ? ` · ${duel.protihrac}` : ''),
    el('span', { class: 'duel-item__score' }, `${score(duel.moje)} : ${score(duel.jeho)}`),
    duel.muj_bonus ? el('span', { class: 'small' }, `+${duel.muj_bonus} b`) : null);
}

/** Odkaz zpět na výzvu, kvůli které se hráč přihlašoval (duel.html uloží kód). */
function pendingDuel() {
  let code = null;
  try {
    code = localStorage.getItem(PENDING_DUEL_KEY);
    localStorage.removeItem(PENDING_DUEL_KEY);
  } catch { /* bez paměti */ }
  return code ? el('p', { class: 'alert' }, 'Máš otevřenou výzvu na duel: ',
    el('a', { href: `duel.html?kod=${encodeURIComponent(code)}` }, 'pokračovat k výzvě')) : null;
}

/** Vykreslí sekci Duely v Profilu (#duely). */
export async function loadDuels() {
  const box = document.getElementById('duels-content');
  const pending = pendingDuel();
  let duels;
  try {
    duels = await getMyDuels();
  } catch (error) {
    console.error(error);
    box.replaceChildren(el('p', { class: 'muted' }, 'Duely se nepodařilo načíst.'));
    return;
  }
  const empty = el('p', { class: 'muted' }, 'Zatím žádné duely. Po kole kvízu, gest, Odpískej to! nebo Rotačního sprintu klikni na „Vyzvat kamaráda“.');
  box.replaceChildren(pending ?? '',
    el('h3', {}, 'Aktivní'),
    duels.aktivni.length ? el('ul', { class: 'duel-list' }, ...duels.aktivni.map(activeItem)) : el('p', { class: 'muted small' }, 'Žádný aktivní duel.'),
    el('h3', {}, 'Odehrané'),
    duels.hotove.length ? el('ul', { class: 'duel-list' }, ...duels.hotove.map(historyItem)) : empty);
  if (location.hash === '#duely') document.getElementById('duely').scrollIntoView();
}
