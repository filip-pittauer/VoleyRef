// Hry s gesty: kvíz „Co znamená toto gesto?“ (gesta.html) a Gesto naopak
// (gesto-naopak.html, main data-game="gesto-naopak": hra ukáže význam a hráč
// vybírá ze čtyř animací). Na rozdíl od hlavního kvízu ukazuje správnou
// odpověď hned po každé otázce – gesta jsou veřejná data, není co prozradit.
// Přihlášenému hráči vybere gesta server a na konci spočítá body do žebříčku
// (zacni_hru / odevzdej_hru); nepřihlášený hraje jen v prohlížeči.
import { el, showOnly, replayAnimation, setupChoiceHint } from './dom.js';
import { plural } from './format.js';
import { startGame, submitGame } from './quiz-api.js';
import { getProfile, isConfigured } from './supabase.js';
import { pointsNote } from './points.js';
import { loadGestures, gestureDetails } from './gesture-data.js';
import { createGesturePlayer } from './referee-figure.js';
import { createScore, celebrate } from './celebrate.js';
import { createReportLink } from './report.js';

const ROUND_SIZE = 10;
const OPTION_COUNT = 4;
const REVERSE = document.querySelector('main').dataset.game === 'gesto-naopak';
const GAME = REVERSE ? 'gesto-naopak' : 'gesta';

// ---------- Prvky stránky ----------
const startSection = document.getElementById('gesture-start');
const questionSection = document.getElementById('gesture-question');
const resultSection = document.getElementById('gesture-result');
const sections = [startSection, questionSection, resultSection];

const errorBox = document.getElementById('gesture-error');
const setSelect = document.getElementById('gesture-set');
const startButton = document.getElementById('gesture-start-button');

const progressText = document.getElementById('gesture-progress');
const progressBar = document.getElementById('gesture-progress-bar');
const tally = document.getElementById('gesture-tally');
const heading = document.getElementById('gesture-heading');
const media = document.getElementById('gesture-media');
const form = document.getElementById('gesture-form');
const fieldset = document.getElementById('gesture-fieldset');
const answersBox = document.getElementById('gesture-answers');
const feedback = document.getElementById('gesture-feedback');
const submitButton = document.getElementById('gesture-submit');
const nextButton = document.getElementById('gesture-next');
const answerHint = document.getElementById('gesture-hint');
const hasChoice = setupChoiceHint(form, answerHint);

const scoreText = document.getElementById('gesture-score');
const resultText = document.getElementById('gesture-result-text');
const pointsText = document.getElementById('gesture-points');
const mistakesBox = document.getElementById('gesture-mistakes-box');
const mistakesList = document.getElementById('gesture-mistakes');

// ---------- Stav ----------
let data = null;      // obsah gesta/gesta.json
let state = null;     // probíhající kolo
let profile = null;   // přihlášený hráč (null = hraje bez bodů)

/** Zamíchá pole (Fisher–Yates) a vrátí novou kopii. */
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Nabídka odpovědí: správné gesto, 1–2 gesta, se kterými se snadno splete
 * (pole „zamena“), a zbytek náhodně – vždy ze stejné skupiny (rozhodčí / čároví).
 */
function pickOptions(gesture) {
  const sameGroup = data.gesta.filter(g => g.skupina === gesture.skupina && g.id !== gesture.id);
  const similar = shuffle(sameGroup.filter(g => gesture.zamena?.includes(g.id))).slice(0, 2);
  const others = shuffle(sameGroup.filter(g => !similar.includes(g)));
  return shuffle([gesture, ...similar, ...others].slice(0, OPTION_COUNT));
}

/**
 * Skóre na tabuli: správně : chybně (zatím zodpovězených otázek).
 * changed = 'good' / 'bad' – číslo, které se právě změnilo, krátce poskočí.
 */
function renderTally(answered, changed = null) {
  const wrong = answered - state.correct;
  const good = el('b', { class: 'board__good' }, String(state.correct));
  const bad = el('span', { class: 'board__bad' }, String(wrong));
  tally.replaceChildren(good, ' : ', bad);
  if (changed) replayAnimation(changed === 'good' ? good : bad, 'board__bump');
  tally.setAttribute('aria-label', `Správně ${state.correct}, chybně ${wrong}`);
}

// ---------- Start ----------
/** Kolo přes server (přihlášený → body); při chybě nebo bez přihlášení null. */
async function serverRound(set) {
  if (!profile) return null;
  try {
    const { roundId, items } = await startGame(GAME, set);
    const questions = items.map(id => data.gesta.find(g => g.id === id)).filter(Boolean);
    return questions.length ? { roundId, questions } : null;
  } catch (error) {
    console.error(error);
    return null;   // hraje se dál v prohlížeči, jen bez bodů
  }
}

async function begin() {
  hideError();
  startButton.disabled = true;
  const set = setSelect.value || null;
  const round = await serverRound(set);
  startButton.disabled = false;
  const pool = data.gesta.filter(g => !set || g.skupina === set);
  state = {
    roundId: round?.roundId ?? null,
    questions: round?.questions ?? shuffle(pool).slice(0, ROUND_SIZE),
    answers: {},    // { id gesta: id zvolené odpovědi } – pro server
    index: 0,
    correct: 0,
    mistakes: [],   // [{ gesture, answer }]
  };
  showOnly(questionSection, sections);
  renderQuestion();
}

// ---------- Otázka ----------
function renderQuestion() {
  const gesture = state.questions[state.index];
  const total = state.questions.length;

  progressText.textContent = `Gesto ${state.index + 1} z ${total}`;
  progressBar.max = total;
  progressBar.value = state.index;
  renderTally(state.index);

  const options = pickOptions(gesture);
  if (REVERSE) {
    media.replaceChildren(el('p', { class: 'gesture-meaning' }, gesture.nazev));
    answersBox.replaceChildren(...options.map(renderAnimationOption));
  } else {
    // Zrcadlově = stejné gesto pro tým na druhé straně, význam je stejný.
    media.replaceChildren(createGesturePlayer(gesture, data.pozy, { mirror: Math.random() < 0.5 }));
    answersBox.replaceChildren(...options.map((option, i) =>
      el('label', { class: 'answer' },
        el('input', { type: 'radio', name: 'answer', value: option.id, required: true }),
        el('span', { class: 'answer__key', 'aria-hidden': 'true' }, 'ABCD'[i]),
        el('span', { class: 'answer__text' }, option.nazev))));
  }

  // nové gesto „přijede“ zprava (CSS třída .q-enter)
  for (const part of [media, form]) replayAnimation(part, 'q-enter');

  fieldset.disabled = false;
  feedback.replaceChildren();
  answerHint.hidden = true;
  submitButton.hidden = false;
  nextButton.hidden = true;
  heading.focus();
}

/**
 * Gesto naopak: možnost = animace (bez autoplay, ukazuje klíčovou polohu)
 * a pod ní volba „Gesto A“. Volba není uvnitř labelu s přehrávačem,
 * protože tlačítka přehrávače do labelu nepatří.
 */
function renderAnimationOption(option, i) {
  const key = 'ABCD'[i];
  return el('div', { class: 'reverse-option' },
    createGesturePlayer(option, data.pozy, { mirror: Math.random() < 0.5, autoplay: false }),
    el('label', { class: 'answer' },
      el('input', { type: 'radio', name: 'answer', value: option.id, required: true }),
      el('span', { class: 'answer__key', 'aria-hidden': 'true' }, key),
      el('span', { class: 'answer__text' }, `Gesto ${key}`)));
}

/** Písmeno správné možnosti (Gesto naopak: „Správně je … (gesto C)“). */
function correctKey() {
  const values = [...answersBox.querySelectorAll('input')].map(input => input.value);
  return 'ABCD'[values.indexOf(state.questions[state.index].id)];
}

/** Vyhodnotí odpověď hned (gesta jsou veřejná) a ukáže zpětnou vazbu. */
function handleAnswer(event) {
  event.preventDefault();   // formulář by jinak znovu načetl stránku
  if (!hasChoice()) return;
  const gesture = state.questions[state.index];
  const answer = new FormData(form).get('answer');
  const isCorrect = answer === gesture.id;
  state.answers[gesture.id] = answer;

  if (isCorrect) state.correct++;
  else state.mistakes.push({ gesture, answer: data.gesta.find(g => g.id === answer) });

  // obarvit odpovědi: správná zeleně, špatně zvolená červeně
  for (const label of answersBox.querySelectorAll('.answer')) {
    const value = label.querySelector('input').value;
    label.classList.toggle('answer--correct', value === gesture.id);
    label.classList.toggle('answer--wrong', value === answer && !isCorrect);
  }
  fieldset.disabled = true;
  renderTally(state.index + 1, isCorrect ? 'good' : 'bad');

  feedback.replaceChildren(el('div', { class: `result ${isCorrect ? 'result--ok' : 'result--wrong'}` },
    el('p', { class: 'result__status' }, isCorrect ? '✓ Správně' : '✗ Špatně'),
    el('p', {}, isCorrect ? '' : 'Správně je: ', el('strong', {}, gesture.nazev),
      REVERSE && !isCorrect ? ` (gesto ${correctKey()})` : ''),
    ...gestureDetails(gesture, data.skupiny),
    createReportLink({ gestureId: gesture.id })));

  const isLast = state.index === state.questions.length - 1;
  nextButton.textContent = isLast ? 'Zobrazit výsledek' : 'Další gesto';
  submitButton.hidden = true;
  nextButton.hidden = false;
  nextButton.focus();
}

function next() {
  if (state.index < state.questions.length - 1) {
    state.index++;
    renderQuestion();
  } else {
    renderResult();
  }
}

// ---------- Výsledek ----------
function summary(correct, total) {
  if (correct === total) return 'Výborně, všechna gesta máš správně! 🎉';
  if (correct >= total * 0.7) return 'Dobrá práce. Chybná gesta si projdi níže.';
  return 'Gesta si projdi níže nebo v pravidlech a zkus to znovu.';
}

function renderMistake({ gesture, answer }) {
  return el('li', { class: 'result result--wrong stack' },
    el('p', {}, el('strong', {}, gesture.nazev)),
    createGesturePlayer(gesture, data.pozy, { autoplay: false }),
    el('p', {}, el('strong', {}, 'Tvoje odpověď: '), answer?.nazev ?? '–'),
    ...gestureDetails(gesture, data.skupiny),
    createReportLink({ gestureId: gesture.id }));
}

/** Body za kolo: přihlášený s kolem ze serveru → odevzdat; jinak jen pozvánka k přihlášení. */
async function renderPoints(round) {
  pointsText.replaceChildren();
  if (!round.roundId) {
    pointsText.replaceChildren(pointsNote({ points: null }, Boolean(profile)) ?? '');
    return;
  }
  try {
    const result = await submitGame(round.roundId, round.answers);
    pointsText.replaceChildren(pointsNote(result, true) ?? '');
  } catch (error) {
    console.error(error);
    pointsText.textContent = 'Body se nepodařilo uložit (výpadek spojení?).';
  }
}

/** Výsledek kola s přehledem chyb (gesto se dá přehrát znovu). */
function renderResult() {
  renderPoints(state);
  const total = state.questions.length;
  const score = createScore(state.correct, total);
  scoreText.replaceChildren(score);
  resultText.textContent = `${summary(state.correct, total)} (${plural(state.correct, 'správná odpověď', 'správné odpovědi', 'správných odpovědí')})`;
  mistakesList.replaceChildren(...state.mistakes.map(renderMistake));
  mistakesBox.hidden = state.mistakes.length === 0;

  showOnly(resultSection, sections);
  document.getElementById('gesture-result-heading').focus();
  celebrate(score);
}

// ---------- Chyby ----------
function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
}

// ---------- Inicializace ----------
startButton.addEventListener('click', begin);
form.addEventListener('submit', handleAnswer);
nextButton.addEventListener('click', next);
document.getElementById('gesture-again').addEventListener('click', () => showOnly(startSection, sections));

// gesta i hráč najednou; profil je jen kvůli bodům, jeho chyba hru nezastaví
Promise.all([loadGestures(), isConfigured ? getProfile().catch(() => null) : null])
  .then(([loaded, player]) => {
    data = loaded;
    profile = player;
    startButton.disabled = false;
  })
  .catch(error => {
    console.error(error);
    showError('Gesta se nepodařilo načíst. Zkontroluj připojení a obnov stránku.');
  });
