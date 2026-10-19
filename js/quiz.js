// Ovládání stránky kvízu: start → otázky → výsledek.
import { el, showOnly } from './dom.js';
import { CATEGORIES, categoryName, categoryRulesUrl } from './categories.js';
import { renderMedia } from './media.js';
import { startRound, submitRound } from './quiz-api.js';

// ---------- Prvky stránky ----------
const startSection = document.getElementById('quiz-start');
const questionSection = document.getElementById('quiz-question');
const resultSection = document.getElementById('quiz-result');
const sections = [startSection, questionSection, resultSection];

const categorySelect = document.getElementById('category');
const startButton = document.getElementById('start-button');
const errorBox = document.getElementById('quiz-error');

const progressText = document.getElementById('quiz-progress');
const progressBar = document.getElementById('quiz-progress-bar');
const questionHeading = document.getElementById('question-heading');
const questionText = document.getElementById('question-text');
const questionMedia = document.getElementById('question-media');
const answersBox = document.getElementById('answers');
const questionForm = document.getElementById('question-form');
const nextButton = document.getElementById('next-button');

const resultSummary = document.getElementById('result-summary');
const resultList = document.getElementById('result-list');
const againButton = document.getElementById('again-button');

// ---------- Stav kola ----------
// Jeden objekt se vším, co se během kola mění (podobně jako ViewModel v C#).
let state = null;

// ---------- Start ----------
function fillCategories() {
  for (const [id, name] of Object.entries(CATEGORIES)) {
    categorySelect.append(el('option', { value: id }, name));
  }
}

async function handleStart() {
  hideError();
  startButton.disabled = true;
  try {
    const { roundId, questions } = await startRound({ category: categorySelect.value || null });
    if (questions.length === 0) {
      showError('V této kategorii zatím nejsou žádné otázky.');
      return;
    }
    state = { roundId, questions, index: 0, answers: {} };
    showOnly(questionSection, sections);
    renderQuestion();
  } catch (error) {
    console.error(error);
    showError('Kvíz se nepodařilo spustit. Zkus to prosím znovu.');
  } finally {
    startButton.disabled = false;
  }
}

// ---------- Otázka ----------
function renderQuestion() {
  const question = state.questions[state.index];
  const number = state.index + 1;
  const total = state.questions.length;

  progressText.textContent = `Otázka ${number} z ${total} · ${categoryName(question.kategorie)}`;
  progressBar.max = total;
  progressBar.value = state.index;

  questionText.textContent = question.situace;
  questionMedia.replaceChildren(renderMedia(question.media) ?? '');

  answersBox.replaceChildren(
    ...Object.entries(question.odpovedi).map(([key, text]) =>
      el('label', { class: 'answer' },
        el('input', { type: 'radio', name: 'answer', value: key, required: true,
          checked: state.answers[question.id] === key }),
        el('span', { class: 'answer__key', 'aria-hidden': 'true' }, key),
        el('span', { class: 'answer__text' }, text)))
  );

  nextButton.textContent = number === total ? 'Vyhodnotit' : 'Další otázka';

  // Fokus na nadpis otázky – čtečka obrazovky přečte novou otázku
  // a uživatel klávesnice nezačíná znovu od začátku stránky.
  questionHeading.focus();
}

async function handleAnswer(event) {
  // Formulář by jinak odeslal stránku na server a načetl ji znovu.
  event.preventDefault();

  const question = state.questions[state.index];
  state.answers[question.id] = new FormData(questionForm).get('answer');

  if (state.index < state.questions.length - 1) {
    state.index++;
    renderQuestion();
    return;
  }

  nextButton.disabled = true;
  try {
    const result = await submitRound(state.roundId, state.answers);
    renderResult(result);
  } catch (error) {
    console.error(error);
    showError('Vyhodnocení se nepodařilo. Zkus to prosím znovu.');
  } finally {
    nextButton.disabled = false;
  }
}

// ---------- Výsledek ----------
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function answerLine(label, question, key, className) {
  const text = key ? `${key} – ${question.odpovedi[key]}` : 'bez odpovědi';
  return el('p', { class: className }, el('strong', {}, `${label}: `), text);
}

function renderResultItem(question, result) {
  return el('li', { class: `result ${result.isCorrect ? 'result--ok' : 'result--wrong'}` },
    el('p', { class: 'result__status' }, result.isCorrect ? '✓ Správně' : '✗ Špatně'),
    el('p', {}, question.situace),
    answerLine('Tvoje odpověď', question, result.answer, ''),
    result.isCorrect ? null : answerLine('Správná odpověď', question, result.correctAnswer, ''),
    result.explanation ? el('p', { class: 'result__explanation' }, result.explanation) : null,
    el('p', { class: 'result__rule' },
      question.pravidlo ? `Pravidlo ${question.pravidlo} · ` : '',
      el('a', { href: categoryRulesUrl(question.kategorie) }, categoryName(question.kategorie))));
}

function renderResult(result) {
  const questionsById = new Map(state.questions.map(q => [q.id, q]));

  resultSummary.replaceChildren(
    el('p', { class: 'score' }, `${result.score} / ${result.total}`),
    el('p', {}, `Čas: ${formatDuration(result.durationSeconds)}`));

  resultList.replaceChildren(
    ...result.results.map(r => renderResultItem(questionsById.get(r.id), r)));

  showOnly(resultSection, sections);
  document.getElementById('result-heading').focus();
  state = null;
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
fillCategories();
startButton.addEventListener('click', handleStart);
questionForm.addEventListener('submit', handleAnswer);
againButton.addEventListener('click', () => showOnly(startSection, sections));
