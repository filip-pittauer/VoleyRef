// Kvíz „Co znamená toto gesto?“ – běží jen v prohlížeči, bez databáze.
// Na rozdíl od hlavního kvízu ukazuje správnou odpověď hned po každé
// otázce: nic se neukládá, takže není co prozradit, a hráč se rychleji učí.
import { el, showOnly } from './dom.js';
import { plural } from './format.js';
import { loadGestures, gestureDetails } from './gesture-data.js';
import { createGesturePlayer } from './referee-figure.js';

const ROUND_SIZE = 10;
const OPTION_COUNT = 4;

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

const scoreText = document.getElementById('gesture-score');
const resultText = document.getElementById('gesture-result-text');
const mistakesBox = document.getElementById('gesture-mistakes-box');
const mistakesList = document.getElementById('gesture-mistakes');

// ---------- Stav ----------
let data = null;    // obsah gesta/gesta.json
let state = null;   // probíhající kolo

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

/** Skóre na tabuli: správně : chybně (zatím zodpovězených otázek). */
function renderTally(answered) {
  const wrong = answered - state.correct;
  tally.replaceChildren(String(state.correct), ' : ', el('span', {}, String(wrong)));
  tally.setAttribute('aria-label', `Správně ${state.correct}, chybně ${wrong}`);
}

// ---------- Start ----------
function begin() {
  hideError();
  const pool = data.gesta.filter(g => !setSelect.value || g.skupina === setSelect.value);
  state = {
    questions: shuffle(pool).slice(0, ROUND_SIZE),
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

  // Zrcadlově = stejné gesto pro tým na druhé straně, význam je stejný.
  media.replaceChildren(createGesturePlayer(gesture, data.pozy, { mirror: Math.random() < 0.5 }));

  answersBox.replaceChildren(...pickOptions(gesture).map((option, i) =>
    el('label', { class: 'answer' },
      el('input', { type: 'radio', name: 'answer', value: option.id, required: true }),
      el('span', { class: 'answer__key', 'aria-hidden': 'true' }, 'ABCD'[i]),
      el('span', { class: 'answer__text' }, option.nazev))));

  fieldset.disabled = false;
  feedback.replaceChildren();
  submitButton.hidden = false;
  nextButton.hidden = true;
  heading.focus();
}

function handleAnswer(event) {
  event.preventDefault();   // formulář by jinak znovu načetl stránku
  const gesture = state.questions[state.index];
  const answer = new FormData(form).get('answer');
  const isCorrect = answer === gesture.id;

  if (isCorrect) state.correct++;
  else state.mistakes.push({ gesture, answer: data.gesta.find(g => g.id === answer) });

  // obarvit odpovědi: správná zeleně, špatně zvolená červeně
  for (const label of answersBox.querySelectorAll('.answer')) {
    const value = label.querySelector('input').value;
    label.classList.toggle('answer--correct', value === gesture.id);
    label.classList.toggle('answer--wrong', value === answer && !isCorrect);
  }
  fieldset.disabled = true;
  renderTally(state.index + 1);

  feedback.replaceChildren(el('div', { class: `result ${isCorrect ? 'result--ok' : 'result--wrong'}` },
    el('p', { class: 'result__status' }, isCorrect ? '✓ Správně' : '✗ Špatně'),
    el('p', {}, isCorrect ? '' : 'Správně je: ', el('strong', {}, gesture.nazev)),
    ...gestureDetails(gesture, data.skupiny)));

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
    ...gestureDetails(gesture, data.skupiny));
}

function renderResult() {
  const total = state.questions.length;
  scoreText.textContent = `${state.correct} / ${total}`;
  resultText.textContent = `${summary(state.correct, total)} (${plural(state.correct, 'správná odpověď', 'správné odpovědi', 'správných odpovědí')})`;
  mistakesList.replaceChildren(...state.mistakes.map(renderMistake));
  mistakesBox.hidden = state.mistakes.length === 0;

  showOnly(resultSection, sections);
  document.getElementById('gesture-result-heading').focus();
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

loadGestures()
  .then(loaded => {
    data = loaded;
    startButton.disabled = false;
  })
  .catch(error => {
    console.error(error);
    showError('Gesta se nepodařilo načíst. Zkontroluj připojení a obnov stránku.');
  });
