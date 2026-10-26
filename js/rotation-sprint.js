// Rotační sprint (rotacni-sprint.html): 60 s, co nejvíc situací. Hráč přesouvá
// čísla hráčů ťuknutím (vybrat → ťuknout na cíl = prohodit). Správnost se
// ukáže hned (pravidla v rotation-logic.js); body počítá server ze stejných
// situací (zacni_sprint / odevzdej_sprint). Nepřihlášený hraje jen v prohlížeči.
import { el, showOnly, replayAnimation } from './dom.js';
import { plural } from './format.js';
import { COURT_LAYOUT, ZONES, solve, isCorrect, benchOf, describe, generateSituation } from './rotation-logic.js';
import { startSprint, submitSprint } from './quiz-api.js';
import { getProfile, isConfigured } from './supabase.js';
import { createScore, celebrate } from './celebrate.js';
import { pointsNote } from './points.js';

const LOCAL_LIMIT = 60;      // s – stejně jako private.hodnoty_her pro 'rotace'
const LOCAL_COUNT = 30;
const FEEDBACK_MS = 900;     // jak dlouho je vidět ✓ / ✗ před další situací

const $ = id => document.getElementById(id);
const sections = [$('sprint-start'), $('sprint-run'), $('sprint-result')];
const court = $('sprint-court');
const bench = $('sprint-bench');
const doneButton = $('sprint-done');

let profile = null;
let state = null;   // { roundId, situations, index, answers, correct, court, bench, selected, deadline, timer, locked }

// ---------- Start ----------
async function begin() {
  $('sprint-error').hidden = true;
  $('sprint-start-button').disabled = true;
  let round = null;
  if (profile) {
    try {
      round = await startSprint();
    } catch (error) {
      console.error(error);   // hraje se dál v prohlížeči, jen bez bodů
    }
  }
  $('sprint-start-button').disabled = false;
  const limit = round?.limitSeconds ?? LOCAL_LIMIT;
  state = {
    roundId: round?.roundId ?? null,
    situations: round?.situations ?? Array.from({ length: LOCAL_COUNT }, (_, i) => generateSituation(i)),
    index: 0, answers: {}, correct: 0, mistakes: [],
    limit, deadline: performance.now() + limit * 1000, timer: null, locked: false,
  };
  showOnly($('sprint-run'), sections);
  state.timer = setInterval(tick, 200);
  tick();
  showSituation();
}

/** Odpočet; po vypršení konec (rozpracovaná situace se nepočítá). */
function tick() {
  const left = Math.max(0, (state.deadline - performance.now()) / 1000);
  $('sprint-time').textContent = `${Math.ceil(left)} s`;
  $('sprint-time-bar').max = state.limit;
  $('sprint-time-bar').value = left;
  if (left <= 0) finish();
}

// ---------- Situace ----------
function showSituation() {
  const situation = state.situations[state.index];
  if (!situation) return finish();   // došly situace (nepravděpodobné)
  state.court = [...situation.sestava];
  state.bench = benchOf(situation);
  state.selected = null;
  state.locked = false;
  $('sprint-heading').textContent = `Situace ${state.index + 1}`;
  $('sprint-text').textContent = describe(situation);
  $('sprint-feedback').replaceChildren();
  renderTally();
  renderPlayers();
  replayAnimation($('sprint-text'), 'q-enter');
}

function renderTally() {
  const wrong = state.index - state.correct;
  $('sprint-tally').replaceChildren(el('b', { class: 'board__good' }, String(state.correct)), ' : ',
    el('span', { class: 'board__bad' }, String(wrong)));
  $('sprint-tally').setAttribute('aria-label', `Správně ${state.correct}, chybně ${wrong}`);
}

/** Tlačítko hráče; place = { where: 'court'|'bench', index }. */
function playerButton(number, place, label) {
  const situation = state.situations[state.index];
  const selected = state.selected?.where === place.where && state.selected.index === place.index;
  const button = el('button', {
    type: 'button',
    class: `rot-player${number === situation.libero?.cislo ? ' rot-player--libero' : ''}${selected ? ' is-selected' : ''}`,
    'aria-pressed': String(selected),
    'aria-label': `${label}: hráč číslo ${number}${number === situation.libero?.cislo ? ' (libero)' : ''}`,
    disabled: state.locked,
  }, el('span', { class: 'rot-player__zone', 'aria-hidden': 'true' }, place.where === 'court' ? ZONES[place.index] : ''),
  el('span', { class: 'rot-player__number' }, String(number)));
  button.addEventListener('click', () => choose(place));
  return button;
}

function renderPlayers() {
  court.replaceChildren(el('div', { class: 'rot-court__net', 'aria-hidden': 'true' }, 'síť'),
    ...COURT_LAYOUT.flat().map(i => playerButton(state.court[i], { where: 'court', index: i }, `Zóna ${ZONES[i]}`)));
  bench.replaceChildren(...state.bench.map((n, i) => playerButton(n, { where: 'bench', index: i }, 'Lavička')));
  $('sprint-bench-box').hidden = state.bench.length === 0;
}

/** První ťuknutí vybere hráče, druhé ho prohodí s cílem (stejné místo = zrušit výběr). */
function choose(place) {
  if (state.locked) return;
  const from = state.selected;
  if (!from) {
    state.selected = place;
  } else {
    if (from.where !== place.where || from.index !== place.index) {
      const list = where => (where === 'court' ? state.court : state.bench);
      const a = list(from.where)[from.index];
      list(from.where)[from.index] = list(place.where)[place.index];
      list(place.where)[place.index] = a;
    }
    state.selected = null;
  }
  renderPlayers();
  // fokus zůstane na místě, kam hráč ťukl (překreslení tlačítka nahradí)
  const target = place.where === 'court' ? court.querySelectorAll('.rot-player')[COURT_LAYOUT.flat().indexOf(place.index)]
    : bench.querySelectorAll('.rot-player')[place.index];
  target?.focus();
}

/** Hotovo: vyhodnotit, krátce ukázat ✓ / ✗ (u chyby správné postavení) a jít dál. */
function submitSituation() {
  if (state.locked) return;
  const situation = state.situations[state.index];
  const ok = isCorrect(situation, state.court);
  state.answers[state.index] = [...state.court];
  if (ok) state.correct++;
  else state.mistakes.push({ situation, answer: [...state.court] });
  state.locked = true;
  renderPlayers();
  $('sprint-feedback').replaceChildren(el('p', { class: `result__status sprint-flash ${ok ? 'sprint-flash--ok' : 'sprint-flash--bad'}` },
    ok ? '✓ Správně' : `✗ Správně je: ${lineupText(solve(situation))}`));
  state.index++;
  renderTally();
  setTimeout(() => { if (state && !state.finished) showSituation(); }, ok ? FEEDBACK_MS / 2 : FEEDBACK_MS * 2);
}

/** Sestava jako text: „IV 7 · III 3 · II 12 / V 9 · VI 1 · I 5“. */
function lineupText(lineup) {
  return COURT_LAYOUT.map(row => row.map(i => `${ZONES[i]} ${lineup[i]}`).join(' · ')).join(' / ');
}

// ---------- Konec ----------
async function finish() {
  if (!state || state.finished) return;
  state.finished = true;
  clearInterval(state.timer);
  const round = state;
  const answered = round.index;
  const score = createScore(round.correct, Math.max(answered, 1));
  $('sprint-score').replaceChildren(score);
  $('sprint-result-text').textContent = answered
    ? `Za ${round.limit} s jsi stihl ${plural(answered, 'situaci', 'situace', 'situací')}, správně ${round.correct}.`
    : 'Nestihl jsi žádnou situaci – zkus to znovu.';
  $('sprint-mistakes').replaceChildren(...round.mistakes.map(m => el('li', { class: 'result result--wrong stack' },
    el('p', {}, describe(m.situation)),
    el('p', { class: 'small' }, el('strong', {}, 'Tvoje: '), lineupText(m.answer)),
    el('p', { class: 'small' }, el('strong', {}, 'Správně: '), lineupText(solve(m.situation))))));
  $('sprint-mistakes-box').hidden = round.mistakes.length === 0;
  showOnly($('sprint-result'), sections);
  $('sprint-result-heading').focus();
  celebrate(score);
  await renderPoints(round);
}

/** Body: kolo ze serveru → odevzdat odpovědi; jinak jen pozvánka k přihlášení. */
async function renderPoints(round) {
  const box = $('sprint-points');
  box.replaceChildren();
  if (!round.roundId) {
    box.replaceChildren(pointsNote({ points: null }, Boolean(profile)) ?? '');
    return;
  }
  try {
    const result = await submitSprint(round.roundId, round.answers);
    box.replaceChildren(pointsNote(result, true) ?? '');
  } catch (error) {
    console.error(error);
    box.textContent = 'Body se nepodařilo uložit (výpadek spojení?).';
  }
}

// ---------- Inicializace ----------
$('sprint-start-button').addEventListener('click', begin);
$('sprint-again').addEventListener('click', () => showOnly($('sprint-start'), sections));
doneButton.addEventListener('click', submitSituation);
$('sprint-reset').addEventListener('click', () => {
  if (state.locked) return;
  const situation = state.situations[state.index];
  state.court = [...situation.sestava];
  state.bench = benchOf(situation);
  state.selected = null;
  renderPlayers();
});
if (isConfigured) getProfile().then(p => { profile = p; }).catch(() => {});
