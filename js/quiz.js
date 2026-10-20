// Ovládání stránky kvízu: start → otázky → výsledek.
import { el, showOnly } from './dom.js';
import { CATEGORIES, DIFFICULTIES, categoryName, difficultyName, categoryRulesUrl, ruleUrl } from './categories.js';
import { formatDuration, plural } from './format.js';
import { badgeById } from './badges.js';
import { renderMedia } from './media.js';
import { createScore, celebrate } from './celebrate.js';
import { startRound, submitRound, getMistakesCount, getDailyStatus } from './quiz-api.js';
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

const dailyText = document.getElementById('daily-text');
const dailyButton = document.getElementById('daily-button');

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
    dailyText.textContent = '';
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
  renderDaily();
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

// ---------- Start: denní výzva ----------
function streakText(serie) {
  if (!serie || serie.aktualni === 0) return null;
  return `🔥 Série: ${plural(serie.aktualni, 'den', 'dny', 'dní')} v řadě`;
}

async function renderDaily() {
  let status;
  try {
    status = await getDailyStatus();
  } catch (error) {
    console.error(error);
    dailyText.textContent = 'Denní výzvu se nepodařilo načíst.';
    dailyButton.hidden = true;
    return;
  }

  const players = `V dnešním žebříčku: ${plural(status.hracu, 'hráč', 'hráči', 'hráčů')}.`;
  const lines = [];
  dailyButton.hidden = false;
  dailyButton.textContent = 'Hrát denní výzvu';

  if (!profile) {
    lines.push('Bez přihlášení se výsledek do denního žebříčku nezapíše.', players);
  } else if (status.stav === 'nehrano') {
    lines.push(streakText(status.serie) ? `${streakText(status.serie)} – nepřeruš ji!` : 'Dnes jsi ještě nehrál.', players);
  } else if (status.stav === 'rozehrano') {
    lines.push('Výzvu máš rozehranou. Čas běží od prvního otevření.');
    dailyButton.textContent = 'Pokračovat';
  } else {
    dailyButton.hidden = true;
    lines.push(`Dnes: ${status.skore}/${status.pocet} za ${formatDuration(status.trvani_s)}`
      + (status.poradi ? ` · ${status.poradi}. místo z ${status.hracu}.` : ' · do žebříčku se nezapočítalo (moc rychlé).'));
    if (streakText(status.serie)) lines.push(streakText(status.serie));
    lines.push('Další výzva bude zítra.');
  }
  dailyText.replaceChildren(...lines.filter(Boolean).flatMap((line, i) => (i ? [el('br'), line] : [line])));
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
  const filters = mode === 'bezne' ? selectedFilters() : { category: null, difficulty: null };
  const button = { bezne: startButton, chyby: mistakesButton, denni: dailyButton }[mode];
  button.disabled = true;
  try {
    const { roundId, questions } = await startRound({ ...filters, mode });
    if (questions.length === 0) {
      showError({
        bezne: 'Pro tento výběr kategorie a obtížnosti zatím nejsou žádné otázky.',
        chyby: 'Nemáš žádné chyby k opakování.',
        denni: 'Denní výzva dnes nemá žádné otázky.',
      }[mode]);
      return;
    }
    state = { roundId, questions, mode, ...filters, index: 0, answers: {} };
    showOnly(questionSection, sections);
    renderQuestion();
  } catch (error) {
    console.error(error);
    if (error.message?.includes('už máš odehranou')) {
      showError('Dnešní výzvu už máš odehranou. Další bude zítra.');
      renderDaily();
    } else {
      showError(isConfigured
        ? 'Kvíz se nepodařilo spustit. Zkontroluj připojení k internetu a zkus to znovu.'
        : NOT_CONFIGURED_MESSAGE);
    }
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
      question.pravidlo ? [el('a', { href: ruleUrl(question.pravidlo) }, `Pravidlo ${question.pravidlo}`), ' · '] : '',
      el('a', { href: categoryRulesUrl(question.kategorie) }, categoryName(question.kategorie))));
}

// Stejné pravidlo jako v SQL funkci zebricek(): ochrana proti botům.
const MIN_SECONDS_PER_QUESTION = 3;

/** Poznámka pod skóre: proč se (ne)zapsalo do žebříčku. */
function leaderboardNote(round, result) {
  if (!profile) {
    return el('span', {}, 'Výsledek se nezapsal do žebříčku, protože nejsi přihlášený. ',
      el('a', { href: 'ucet.html' }, 'Přihlásit se'));
  }
  if (round.mode === 'chyby') return 'Opakování chyb se do žebříčku nepočítá.';
  if (round.category || round.difficulty) {
    return 'Kola s vybranou kategorií nebo obtížností se do žebříčku nepočítají.';
  }
  if (result.durationSeconds < result.total * MIN_SECONDS_PER_QUESTION) {
    return `Kolo bylo příliš rychlé (méně než ${MIN_SECONDS_PER_QUESTION} s na otázku), do žebříčku se nepočítá.`;
  }
  if (round.mode === 'denni') {
    return el('span', {}, 'Výsledek je v ', el('a', { href: 'zebricek.html#denni' }, 'denním žebříčku'), '.');
  }
  return el('span', {}, 'Výsledek je uložený. Pokud je to tvé nejlepší kolo, uvidíš ho v ',
    el('a', { href: 'zebricek.html' }, 'žebříčku'), '.');
}

/** Blok „🏅 Nový odznak!“ ve výsledku kola (null, když žádný nový není). */
function renderNewBadges(ids) {
  if (!ids?.length) return null;
  return el('div', { class: 'new-badges', role: 'status' },
    el('p', { class: 'new-badges__title' }, ids.length === 1 ? '🏅 Nový odznak!' : '🏅 Nové odznaky!'),
    el('ul', {}, ...ids.map(id => {
      const badge = badgeById(id);
      return el('li', {},
        el('span', { class: 'new-badges__icon', 'aria-hidden': 'true' }, badge.icon), ' ',
        el('strong', {}, badge.name), ' – ', badge.description);
    })),
    el('a', { href: 'ucet.html#odznaky' }, 'Všechny odznaky'));
}

function renderResult(result) {
  const round = state;
  const questionsById = new Map(round.questions.map(q => [q.id, q]));
  const extra = el('p', { class: 'muted small' });
  const score = createScore(result.score, result.total);

  resultSummary.replaceChildren(
    score,
    el('p', {}, `Čas: ${formatDuration(result.durationSeconds)}`),
    el('p', { class: 'muted small' }, leaderboardNote(round, result)),
    extra,
    renderNewBadges(result.newBadges) ?? '');

  resultList.replaceChildren(
    ...result.results.map(r => renderResultItem(questionsById.get(r.id), r)));

  showOnly(resultSection, sections);
  document.getElementById('result-heading').focus();
  celebrate(score);
  state = null;

  // Doplňující informace se načtou dodatečně (další dotaz na server).
  if (round.mode === 'chyby') {
    getMistakesCount()
      .then(count => {
        extra.textContent = count === 0
          ? 'Všechny chyby máš opravené! 🎉'
          : `K opakování ti zbývá ${plural(count, 'otázka', 'otázky', 'otázek')}.`;
      })
      .catch(error => console.error(error));
  } else if (round.mode === 'denni' && profile) {
    getDailyStatus()
      .then(status => {
        const streak = streakText(status.serie);
        extra.textContent = [
          status.poradi ? `Jsi ${status.poradi}. z ${plural(status.hracu, 'hráče', 'hráčů', 'hráčů')} v dnešní výzvě.` : null,
          streak,
        ].filter(Boolean).join(' ');
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
dailyButton.addEventListener('click', () => begin('denni'));
questionForm.addEventListener('submit', handleAnswer);
againButton.addEventListener('click', () => {
  hideError();
  showOnly(startSection, sections);
  renderMistakes();   // počet chyb i stav denní výzvy se po kole mohl změnit
  renderDaily();
});
