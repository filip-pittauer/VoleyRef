// Ovládání stránky kvízu: start → otázky → výsledek.
import { el, showOnly } from './dom.js';
import { CATEGORIES, DIFFICULTIES, categoryName, difficultyName, categoryRulesUrl } from './categories.js';
import { formatDuration, plural } from './format.js';
import { renderMedia } from './media.js';
import { startRound, submitRound, getMistakesCount } from './quiz-api.js';
import { getProfile, isConfigured, NOT_CONFIGURED_MESSAGE } from './supabase.js';

// ---------- Prvky stránky ----------
const startSection = document.getElementById('quiz-start');
const questionSection = document.getElementById('quiz-question');
const resultSection = document.getElementById('quiz-result');
const sections = [startSection, questionSection, resultSection];

const playerInfo = document.getElementById('player-info');
const categorySelect = document.getElementById('category');
const difficultySelect = document.getElementById('difficulty');
const filterNote = document.getElementById('filter-note');
const startButton = document.getElementById('start-button');
const errorBox = document.getElementById('quiz-error');

const mistakesCard = document.getElementById('opakovani');
const mistakesText = document.getElementById('mistakes-text');
const mistakesButton = document.getElementById('mistakes-button');

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

// ---------- Stav ----------
// Jeden objekt se vším, co se během kola mění (podobně jako ViewModel v C#).
let state = null;

// Profil přihlášeného hráče (null = hraje bez přihlášení).
let profile = null;

// ---------- Start: hráč a filtry ----------
async function renderPlayerInfo() {
  if (!isConfigured) {
    showError(NOT_CONFIGURED_MESSAGE);
    return;
  }
  try {
    profile = await getProfile();
  } catch (error) {
    console.error(error);
  }
  playerInfo.replaceChildren(profile
    ? el('span', {}, 'Hraješ jako ', el('strong', {}, profile.prezdivka), '.')
    : el('span', {}, 'Nejsi přihlášený, výsledek se nezapíše do žebříčku ani statistik. ',
        el('a', { href: 'ucet.html' }, 'Přihlásit se')));
  updateFilterNote();
  renderMistakes();
}

function fillSelects() {
  for (const [id, name] of Object.entries(CATEGORIES)) {
    categorySelect.append(el('option', { value: id }, name));
  }
  for (const [level, name] of Object.entries(DIFFICULTIES)) {
    difficultySelect.append(el('option', { value: level }, name));
  }
  // kviz.html?kategorie=blok → kategorie předvybraná (odkaz ze statistik)
  const fromUrl = new URLSearchParams(location.search).get('kategorie');
  if (fromUrl && CATEGORIES[fromUrl]) categorySelect.value = fromUrl;
}

function selectedFilters() {
  return {
    category: categorySelect.value || null,
    difficulty: difficultySelect.value ? Number(difficultySelect.value) : null,
  };
}

/** Upozornění, že kolo s filtrem se do žebříčku nepočítá (jen pro přihlášené). */
function updateFilterNote() {
  const { category, difficulty } = selectedFilters();
  filterNote.hidden = !profile || (!category && !difficulty);
}

// ---------- Start: opakování chyb ----------
async function renderMistakes() {
  if (!profile) {
    mistakesCard.hidden = true;
    return;
  }
  let count;
  try {
    count = await getMistakesCount();
  } catch (error) {
    console.error(error);
    mistakesCard.hidden = true;
    return;
  }

  mistakesCard.hidden = false;
  if (count === 0) {
    mistakesText.textContent = 'Teď nemáš žádné chyby k opakování. 👍';
    mistakesButton.hidden = true;
    return;
  }
  mistakesText.textContent = `Máš ${plural(count, 'otázku', 'otázky', 'otázek')}, `
    + 've kterých jsi naposledy chyboval. Když je zodpovíš správně, ze seznamu zmizí.';
  mistakesButton.textContent = count > 10 ? 'Opakovat chyby (10 z nich)' : 'Opakovat chyby';
  mistakesButton.hidden = false;

  // Odkaz kviz.html#opakovani (ze statistik): karta byla při načtení skrytá,
  // takže na ni prohlížeč sám neodroloval – uděláme to teď.
  if (location.hash === '#opakovani') {
    mistakesCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mistakesButton.focus({ preventScroll: true });
  }
}

// ---------- Začátek kola ----------
async function begin(mode) {
  hideError();
  const filters = mode === 'chyby' ? { category: null, difficulty: null } : selectedFilters();
  const button = mode === 'chyby' ? mistakesButton : startButton;
  button.disabled = true;
  try {
    const { roundId, questions } = await startRound({ ...filters, mode });
    if (questions.length === 0) {
      showError(mode === 'chyby'
        ? 'Nemáš žádné chyby k opakování.'
        : 'Pro tento výběr kategorie a obtížnosti zatím nejsou žádné otázky.');
      return;
    }
    state = { roundId, questions, mode, ...filters, index: 0, answers: {} };
    showOnly(questionSection, sections);
    renderQuestion();
  } catch (error) {
    console.error(error);
    showError(isConfigured
      ? 'Kvíz se nepodařilo spustit. Zkontroluj připojení k internetu a zkus to znovu.'
      : NOT_CONFIGURED_MESSAGE);
  } finally {
    button.disabled = false;
  }
}

// ---------- Otázka ----------
function renderQuestion() {
  const question = state.questions[state.index];
  const number = state.index + 1;
  const total = state.questions.length;

  progressText.textContent = [
    `Otázka ${number} z ${total}`,
    categoryName(question.kategorie),
    difficultyName(question.obtiznost),
  ].filter(Boolean).join(' · ');
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
function answerLine(label, question, key) {
  const text = key ? `${key} – ${question.odpovedi[key]}` : 'bez odpovědi';
  return el('p', {}, el('strong', {}, `${label}: `), text);
}

function renderResultItem(question, result) {
  return el('li', { class: `result ${result.isCorrect ? 'result--ok' : 'result--wrong'}` },
    el('p', { class: 'result__status' }, result.isCorrect ? '✓ Správně' : '✗ Špatně'),
    el('p', {}, question.situace),
    answerLine('Tvoje odpověď', question, result.answer),
    result.isCorrect ? null : answerLine('Správná odpověď', question, result.correctAnswer),
    result.explanation ? el('p', { class: 'result__explanation' }, result.explanation) : null,
    el('p', { class: 'result__rule' },
      question.pravidlo ? `Pravidlo ${question.pravidlo} · ` : '',
      el('a', { href: categoryRulesUrl(question.kategorie) }, categoryName(question.kategorie))));
}

/** Poznámka pod skóre: proč se (ne)zapsalo do žebříčku. */
function leaderboardNote(round) {
  if (!profile) {
    return el('span', {}, 'Výsledek se nezapsal do žebříčku, protože nejsi přihlášený. ',
      el('a', { href: 'ucet.html' }, 'Přihlásit se'));
  }
  if (round.mode === 'chyby') return 'Opakování chyb se do žebříčku nepočítá.';
  if (round.category || round.difficulty) {
    return 'Kola s vybranou kategorií nebo obtížností se do žebříčku nepočítají.';
  }
  return el('span', {}, 'Výsledek je uložený. Pokud je to tvé nejlepší kolo, uvidíš ho v ',
    el('a', { href: 'zebricek.html' }, 'žebříčku'), '.');
}

function renderResult(result) {
  const round = state;
  const questionsById = new Map(round.questions.map(q => [q.id, q]));
  const remaining = el('p', { class: 'muted small' });

  resultSummary.replaceChildren(
    el('p', { class: 'score' }, `${result.score} / ${result.total}`),
    el('p', {}, `Čas: ${formatDuration(result.durationSeconds)}`),
    el('p', { class: 'muted small' }, leaderboardNote(round)),
    round.mode === 'chyby' ? remaining : '');

  resultList.replaceChildren(
    ...result.results.map(r => renderResultItem(questionsById.get(r.id), r)));

  showOnly(resultSection, sections);
  document.getElementById('result-heading').focus();
  state = null;

  // Po kole chyb ukážeme, kolik jich ještě zbývá (načte se dodatečně).
  if (round.mode === 'chyby') {
    getMistakesCount()
      .then(count => {
        remaining.textContent = count === 0
          ? 'Všechny chyby máš opravené! 🎉'
          : `K opakování ti zbývá ${plural(count, 'otázka', 'otázky', 'otázek')}.`;
      })
      .catch(error => console.error(error));
  }
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
fillSelects();
renderPlayerInfo();
categorySelect.addEventListener('change', updateFilterNote);
difficultySelect.addEventListener('change', updateFilterNote);
startButton.addEventListener('click', () => begin('bezne'));
mistakesButton.addEventListener('click', () => begin('chyby'));
questionForm.addEventListener('submit', handleAnswer);
againButton.addEventListener('click', () => {
  hideError();
  showOnly(startSection, sections);
  renderMistakes();   // počet chyb se po kole mohl změnit
});
