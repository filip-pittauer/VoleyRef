// Stránka zkoušky: 30 otázek na čas, volný pohyb mezi otázkami,
// vyhodnocení (prošel/neprošel) až po odevzdání. Otázky, limit i hranici
// úspěchu určuje server (zacni_kolo s režimem 'zkouska'), body počítá taky on.
import { el, showOnly, replayAnimation } from './dom.js';
import { CATEGORIES, categoryName } from './categories.js';
import { formatDuration, plural } from './format.js';
import { renderMedia } from './media.js';
import { createScore, celebrate } from './celebrate.js';
import { renderResultItem, renderNewBadges } from './quiz-result.js';
import { startRound, submitRound } from './quiz-api.js';
import { getProfile, isConfigured, NOT_CONFIGURED_MESSAGE } from './supabase.js';

// Kdy zčervená odpočet a čtečka obrazovky ohlásí, že čas dochází.
const WARNING_SECONDS = 5 * 60;

// ---------- Prvky stránky ----------
const startSection = document.getElementById('exam-start');
const runSection = document.getElementById('exam-run');
const resultSection = document.getElementById('exam-result');
const sections = [startSection, runSection, resultSection];

const errorBox = document.getElementById('exam-error');
const playerInfo = document.getElementById('player-info');
const startButton = document.getElementById('start-button');

const progressText = document.getElementById('exam-progress');
const progressBar = document.getElementById('exam-progress-bar');
const timerText = document.getElementById('exam-timer');
const timerAlert = document.getElementById('timer-alert');
const questionHeading = document.getElementById('question-heading');
const questionText = document.getElementById('question-text');
const questionMedia = document.getElementById('question-media');
const questionForm = document.getElementById('question-form');
const answersBox = document.getElementById('answers');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const answeredText = document.getElementById('exam-answered');
const grid = document.getElementById('exam-grid');
const submitButton = document.getElementById('submit-button');
const dialog = document.getElementById('submit-dialog');
const dialogText = document.getElementById('submit-dialog-text');

const resultSummary = document.getElementById('result-summary');
const resultCategories = document.getElementById('result-categories');
const resultList = document.getElementById('result-list');
const againButton = document.getElementById('again-button');

// ---------- Stav ----------
// null = test neběží. Jinak { roundId, questions, answers, index, limitSeconds, passScore, endsAt }
let state = null;
let profile = null;
let timer = null;

// ---------- Úvod ----------
async function renderPlayerInfo() {
  if (!isConfigured) {
    showError(NOT_CONFIGURED_MESSAGE);
    startButton.disabled = true;
    return;
  }
  try {
    profile = await getProfile();
  } catch (error) {
    console.error(error);
  }
  playerInfo.replaceChildren(profile
    ? el('span', {}, 'Píšeš jako ', el('strong', {}, profile.prezdivka), '. Výsledek uvidíš v Profilu.')
    : el('span', {}, 'Nejsi přihlášený, výsledek se neuloží. ', el('a', { href: 'ucet.html' }, 'Přihlásit se')));
}

/** Začne zkoušku: otázky od serveru, odpočet času, první otázka. */
async function begin() {
  hideError();
  startButton.disabled = true;
  try {
    const { roundId, questions, exam } = await startRound({ mode: 'zkouska' });
    if (questions.length === 0) {
      showError('Zkouška teď nemá žádné otázky.');
      return;
    }
    state = {
      roundId, questions, answers: {}, index: 0,
      limitSeconds: exam.limitSeconds, passScore: exam.passScore,
      // konec podle hodin prohlížeče; server si drží vlastní čas začátku
      endsAt: Date.now() + exam.limitSeconds * 1000,
    };
    buildGrid();
    showOnly(runSection, sections);
    renderQuestion();
    startTimer();
  } catch (error) {
    console.error(error);
    showError('Zkoušku se nepodařilo spustit. Zkontroluj připojení k internetu a zkus to znovu.');
  } finally {
    startButton.disabled = false;
  }
}

// ---------- Odpočet ----------
function startTimer() {
  timerText.parentElement.classList.remove('exam-timer--low');
  timerAlert.textContent = '';
  clearInterval(timer);
  timer = setInterval(tick, 1000);
  tick();
}

/** Každou sekundu: zbývající čas, upozornění na konec, po vypršení odevzdání. */
function tick() {
  const left = Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
  timerText.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  if (left <= WARNING_SECONDS && !timerText.parentElement.classList.contains('exam-timer--low')) {
    timerText.parentElement.classList.add('exam-timer--low');
    timerAlert.textContent = `Zbývá ${Math.ceil(left / 60)} minut.`;
  }
  if (left === 0) {
    clearInterval(timer);
    submit({ timeUp: true });
  }
}

// ---------- Otázka ----------
function renderQuestion() {
  const { questions, index, answers } = state;
  const question = questions[index];

  progressText.textContent = `Otázka ${index + 1} z ${questions.length} · ${categoryName(question.kategorie)}`;
  progressBar.max = questions.length;
  progressBar.value = Object.keys(answers).length;

  questionText.textContent = question.situace;
  questionMedia.replaceChildren(renderMedia(question.media) ?? '');
  answersBox.replaceChildren(
    ...Object.entries(question.odpovedi).map(([key, text]) =>
      el('label', { class: 'answer' },
        el('input', { type: 'radio', name: 'answer', value: key, checked: answers[question.id] === key }),
        el('span', { class: 'answer__key', 'aria-hidden': 'true' }, key),
        el('span', { class: 'answer__text' }, text))));

  prevButton.disabled = index === 0;
  nextButton.textContent = index === questions.length - 1 ? 'Odevzdat' : 'Další';
  updateGrid();

  for (const part of [questionText, questionMedia, questionForm]) replayAnimation(part, 'q-enter');
  questionHeading.focus({ preventScroll: true });
}

function goTo(index) {
  state.index = index;
  renderQuestion();
  // na mobilu je přehled otázek pod otázkou – vrátit se nahoru na novou otázku
  runSection.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/** Odpověď se uloží hned při výběru (tlačítko Další už jen přejde dál). */
function handleChange(event) {
  if (event.target.name !== 'answer') return;
  state.answers[state.questions[state.index].id] = event.target.value;
  progressBar.value = Object.keys(state.answers).length;
  updateGrid();
}

function handleNext(event) {
  event.preventDefault();   // formulář by jinak znovu načetl stránku
  if (state.index < state.questions.length - 1) goTo(state.index + 1);
  else confirmSubmit();
}

// ---------- Přehled otázek (mřížka čísel) ----------
function buildGrid() {
  grid.replaceChildren(...state.questions.map((question, i) =>
    el('li', {}, el('button', { class: 'exam-grid__item', type: 'button', 'data-index': i }, String(i + 1)))));
}

function updateGrid() {
  const { questions, answers, index } = state;
  grid.querySelectorAll('.exam-grid__item').forEach((button, i) => {
    const answered = questions[i].id in answers;
    button.classList.toggle('exam-grid__item--answered', answered);
    button.setAttribute('aria-current', i === index ? 'step' : 'false');
    button.setAttribute('aria-label', `Otázka ${i + 1}${answered ? ', zodpovězená' : ''}`);
  });
  answeredText.textContent = `· zodpovězeno ${Object.keys(answers).length} z ${questions.length}`;
}

// ---------- Odevzdání ----------
function confirmSubmit() {
  const missing = state.questions.length - Object.keys(state.answers).length;
  dialogText.textContent = missing > 0
    ? `Zbývá ti ${plural(missing, 'nezodpovězená otázka', 'nezodpovězené otázky', 'nezodpovězených otázek')}. Bez odpovědi se otázka počítá jako špatná.`
    : 'Máš zodpovězené všechny otázky. Po odevzdání už odpovědi změnit nepůjde.';
  dialog.showModal();
}

dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'confirm') submit();
});

/** Odevzdá zkoušku (i nedokončenou); vyhodnotí ji server. */
async function submit({ timeUp = false } = {}) {
  if (!state || state.submitting) return;
  state.submitting = true;
  clearInterval(timer);
  if (dialog.open) dialog.close();
  submitButton.disabled = nextButton.disabled = true;

  try {
    const result = await submitRound(state.roundId, state.answers);
    renderResult(result, timeUp);
  } catch (error) {
    console.error(error);
    state.submitting = false;
    showError('Odevzdání se nepodařilo. Zkontroluj připojení a zkus to znovu tlačítkem Odevzdat zkoušku.');
  } finally {
    submitButton.disabled = nextButton.disabled = false;
  }
}

// ---------- Výsledek ----------
function categoryRow(id, correct, total) {
  const percent = Math.round((correct / total) * 100);
  return el('li', { class: 'cat-row' },
    el('span', { class: 'cat-row__name' }, categoryName(id)), ' ',
    el('span', { class: 'cat-row__value' }, `${correct} z ${total}`),
    el('span', { class: 'cat-row__bar', 'aria-hidden': 'true' }, el('span', { style: `width: ${percent}%` })));
}

function renderCategories(questions, results) {
  const correctById = new Map(results.map(r => [r.id, r.isCorrect]));
  const stats = {};
  for (const question of questions) {
    const s = stats[question.kategorie] ??= { correct: 0, total: 0 };
    s.total++;
    if (correctById.get(question.id)) s.correct++;
  }
  // pořadí jako v kvízu (CATEGORIES), jen kategorie, které ve zkoušce byly
  return Object.keys(CATEGORIES).filter(id => stats[id]).map(id => categoryRow(id, stats[id].correct, stats[id].total));
}

function savedNote() {
  if (!profile) {
    return el('span', {}, 'Výsledek se neuložil, protože nejsi přihlášený. ', el('a', { href: 'ucet.html' }, 'Přihlásit se'));
  }
  return el('span', {}, 'Výsledek je uložený v ', el('a', { href: 'ucet.html#zkousky' }, 'Profilu'), '.');
}

/** Výsledek: splněno/nesplněno, skóre, přehled otázek se správnými odpověďmi. */
function renderResult(result, timeUp) {
  const exam = state;
  const { passed, passScore, inTime } = result.exam;
  const score = createScore(result.score, result.total);
  const questionsById = new Map(exam.questions.map(q => [q.id, q]));

  // filter(Boolean) vyhodí vynechané řádky (null) – replaceChildren by je vypsal jako text „null“
  resultSummary.replaceChildren(...[
    el('p', { class: `exam-verdict exam-verdict--${passed ? 'pass' : 'fail'}` },
      passed ? '✓ Zkouška splněna' : '✗ Zkouška nesplněna'),
    score,
    el('p', {}, `Potřeba ${passScore} správných odpovědí z ${result.total}. Čas: ${formatDuration(result.durationSeconds)}.`),
    timeUp ? el('p', {}, 'Čas vypršel, test se odevzdal sám.') : null,
    inTime ? null : el('p', {}, 'Test byl odevzdán po časovém limitu, proto se nepočítá jako splněný.'),
    el('p', { class: 'muted small' }, savedNote()),
    renderNewBadges(result.newBadges),
  ].filter(Boolean));

  resultCategories.replaceChildren(...renderCategories(exam.questions, result.results));
  resultList.replaceChildren(...result.results.map(r => renderResultItem(questionsById.get(r.id), r)));

  state = null;
  showOnly(resultSection, sections);
  window.scrollTo({ top: 0 });
  document.getElementById('result-heading').focus({ preventScroll: true });
  celebrate(score, { ribbons: passed });
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
renderPlayerInfo();
startButton.addEventListener('click', begin);
questionForm.addEventListener('change', handleChange);
questionForm.addEventListener('submit', handleNext);
prevButton.addEventListener('click', () => goTo(state.index - 1));
submitButton.addEventListener('click', confirmSubmit);
grid.addEventListener('click', event => {
  const button = event.target.closest('.exam-grid__item');
  if (button) goTo(Number(button.dataset.index));
});
againButton.addEventListener('click', () => {
  hideError();
  showOnly(startSection, sections);
});

// Rozepsaný test by se zavřením stránky ztratil – prohlížeč se zeptá.
window.addEventListener('beforeunload', event => {
  if (state && !state.submitting) event.preventDefault();
});
