// Ovládání stránky kvízu: start → otázky → výsledek.
import { el, showOnly, replayAnimation, setupChoiceHint } from './dom.js';
import { DIFFICULTIES, categoryName, difficultyName } from './categories.js';
import { formatDuration, plural } from './format.js';
import { renderMedia } from './media.js';
import { createScore, celebrate } from './celebrate.js';
import { renderResultItem, renderNewBadges } from './quiz-result.js';
import { startRound, submitRound, getMistakesCount, getDailyStatus, getDailySolution,
  getCategoryOverview, getCategoryStats } from './quiz-api.js';
import { renderPracticeTiles } from './quiz-practice.js';
import { renderDailyCard, streakText, previousDay } from './daily-card.js';
import { pointsNote } from './points.js';
import { acceptDuel } from './quiz-api.js';
import { duelCodeFromUrl, renderChallenge, renderDuelResult } from './duel.js';
import { getProfile, isConfigured, NOT_CONFIGURED_MESSAGE } from './supabase.js';

// ---------- Prvky stránky ----------
const startSection = document.getElementById('quiz-start');
const questionSection = document.getElementById('quiz-question');
const resultSection = document.getElementById('quiz-result');
const sections = [startSection, questionSection, resultSection];

const playerInfo = document.getElementById('player-info');
// jen v Hrách (kviz.html): denní výzva a běžné kolo; jen v procvičování: obtížnost, dlaždice, chyby
const difficultySelect = document.getElementById('difficulty');
const practiceTiles = document.getElementById('practice-tiles');
const startButton = document.getElementById('start-button');
const errorBox = document.getElementById('quiz-error');

const dailyText = document.getElementById('daily-text');
const dailyButton = document.getElementById('daily-button');
const dailySolutionButton = document.getElementById('daily-solution');

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
const answerHint = document.getElementById('answer-hint');
const hasChoice = setupChoiceHint(questionForm, answerHint);

const resultHeading = document.getElementById('result-heading');
const resultSummary = document.getElementById('result-summary');
const resultListHeading = document.getElementById('result-list-heading');
const resultList = document.getElementById('result-list');
const againButton = document.getElementById('again-button');
const duelBox = document.getElementById('duel-box');

// ---------- Stav ----------
// Jeden objekt se vším, co se během kola mění (podobně jako ViewModel v C#).
let state = null;

// Profil přihlášeného hráče (null = hraje bez přihlášení).
let profile = null;

// ---------- Start: hráč ----------
/** Kdo hraje (přihlášený / anonym); pak karty podle stránky (denní výzva, chyby, dlaždice). */
async function renderPlayerInfo() {
  if (!isConfigured) {
    showError(NOT_CONFIGURED_MESSAGE);
    if (dailyText) dailyText.textContent = '';
    return;
  }
  try {
    profile = await getProfile();
  } catch (error) {
    console.error(error);
  }
  playerInfo?.replaceChildren(playerText());
  renderStartCards();
  startDailyFromLink();
  startDuelFromLink();
}

/** Řádek o hráči: v Hrách jde o žebříček, v procvičování o statistiky a chyby. */
function playerText() {
  if (profile) return el('span', {}, 'Hraješ jako ', el('strong', {}, profile.prezdivka), '.');
  const why = practiceTiles
    ? 'Po přihlášení uvidíš úspěšnost v kategoriích a můžeš si opakovat chyby. '
    : 'Nejsi přihlášený, výsledek se nezapíše do žebříčku ani statistik. ';
  return el('span', {}, why, el('a', { href: 'ucet.html' }, 'Přihlásit se'));
}

/** Karty na startu, které stránka má (kvíz v Hrách: denní výzva; procvičování: chyby a dlaždice). */
function renderStartCards() {
  if (mistakesCard) renderMistakes();
  if (dailyText) renderDaily();
  if (practiceTiles) renderPractice();
}

// ---------- Start: procvičování (dlaždice kategorií) ----------
let overview = null;   // počty otázek – stačí načíst jednou

/** Dlaždice kategorií s počty otázek a úspěšností (jen procvicovani.html). */
async function renderPractice() {
  const [overviewResult, statsResult] = await Promise.allSettled([
    overview ? Promise.resolve(overview) : getCategoryOverview(),
    profile ? getCategoryStats() : Promise.resolve(null),
  ]);
  if (overviewResult.status === 'fulfilled') overview = overviewResult.value;
  else console.error(overviewResult.reason);
  if (statsResult.status === 'rejected') console.error(statsResult.reason);

  // procvicovani.html?kategorie=blok (odkaz ze statistik) → dlaždice zvýrazněná
  const suggested = new URLSearchParams(location.search).get('kategorie');
  renderPracticeTiles(practiceTiles, {
    overview,
    stats: statsResult.status === 'fulfilled' ? statsResult.value : null,
    difficulty: difficultySelect.value ? Number(difficultySelect.value) : null,
    suggested,
    onStart: (category, button) => begin('procvicovani', { category, button }),
  });
  practiceTiles.querySelector('.practice-tile--suggested')?.scrollIntoView({ block: 'center' });
}

function fillDifficulty() {
  for (const [level, name] of Object.entries(DIFFICULTIES)) {
    difficultySelect.append(el('option', { value: level }, name));
  }
}

// ---------- Start: denní výzva ----------
// Dnešní datum podle serveru ('RRRR-MM-DD', český čas) – z něj se počítá „včera“.
let dailyDay = null;

/** Karta denní výzvy (sdílená s úvodem a Hrami, viz daily-card.js). */
async function renderDaily() {
  const status = await renderDailyCard({ text: dailyText, button: dailyButton, solutionButton: dailySolutionButton, profile });
  if (status) dailyDay = status.den;
}

/** Odkaz kviz.html?hrat=denni (z úvodu a Her) rovnou spustí denní výzvu. */
function startDailyFromLink() {
  if (new URLSearchParams(location.search).get('hrat') !== 'denni' || !profile) return;
  // parametr pryč, aby obnovení stránky nespustilo výzvu znovu
  history.replaceState(null, '', location.pathname + location.hash);
  begin('denni');
}

/** Odkaz kviz.html?duel=kód (ze stránky duelu): přijme výzvu a rovnou hraje stejné otázky. */
async function startDuelFromLink() {
  const code = duelCodeFromUrl();
  if (!code || !profile) return;
  hideError();
  try {
    const { kolo_id: roundId, otazky: questions } = await acceptDuel(code);
    state = { roundId, questions, mode: 'duel', duelCode: code, category: null, difficulty: null, index: 0, answers: {} };
    showOnly(questionSection, sections);
    renderQuestion();
  } catch (error) {
    console.error(error);
    showError(error.message ?? 'Duel se nepodařilo spustit.');
  }
}

// ---------- Start: opakování chyb ----------
/** Karta „Opakování chyb“ s počtem otázek k opakování (jen přihlášený). */
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
/**
 * Začne kolo. mode: 'bezne' (kvíz v Hrách), 'procvicovani' (dlaždice kategorie
 * + obtížnost), 'chyby' (opakování chyb), 'denni' (denní výzva) – otázky vybere
 * server podle režimu. button = dlaždice, která kolo spustila (procvičování).
 */
async function begin(mode, { category = null, button = null } = {}) {
  hideError();
  const filters = mode === 'procvicovani'
    ? { category, difficulty: difficultySelect.value ? Number(difficultySelect.value) : null }
    : { category: null, difficulty: null };
  button ??= { bezne: startButton, chyby: mistakesButton, denni: dailyButton }[mode];
  button.disabled = true;
  try {
    const { roundId, questions } = await startRound({ ...filters, mode });
    if (questions.length === 0) {
      showError({
        bezne: 'Kvíz zatím nemá žádné otázky.',
        procvicovani: 'Pro tento výběr kategorie a obtížnosti zatím nejsou žádné otázky.',
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
/** Vykreslí aktuální otázku (text, ilustrace, odpovědi); dřívější odpověď zůstane zaškrtnutá. */
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

  answerHint.hidden = true;
  nextButton.textContent = number === total ? 'Vyhodnotit' : 'Další otázka';

  // nová otázka „přijede“ zprava (CSS třída .q-enter)
  for (const part of [questionText, questionMedia, questionForm]) replayAnimation(part, 'q-enter');

  // Fokus na nadpis otázky – čtečka obrazovky přečte novou otázku
  // a uživatel klávesnice nezačíná znovu od začátku stránky.
  questionHeading.focus();
}

/** Uloží odpověď a jde na další otázku; po poslední odešle kolo k vyhodnocení. */
async function handleAnswer(event) {
  // Formulář by jinak odeslal stránku na server a načetl ji znovu.
  event.preventDefault();
  if (!hasChoice()) return;

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
/** Poznámka pod skóre: body do žebříčku (počítá server), nebo proč žádné nejsou. */
function leaderboardNote(round, result) {
  if (round.mode === 'procvicovani') return 'Procvičování se do žebříčku nepočítá.';
  if (round.mode === 'chyby' && profile) return 'Opakování chyb se do žebříčku nepočítá.';
  if (round.mode === 'duel') return 'V duelu se body za odpovědi nepočítají – za výhru dostaneš bonus.';
  return pointsNote(result, Boolean(profile));
}

/** Seznam „Vysvětlení“; bez položek (dnešní denní výzva) se skryje i s nadpisem. */
function renderResultList(questions, results) {
  const questionsById = new Map(questions.map(q => [q.id, q]));
  resultList.replaceChildren(...results.map(r => renderResultItem(questionsById.get(r.id), r)));
  resultListHeading.hidden = results.length === 0;
}

/** Výsledek kola: skóre, poznámka k žebříčku, nové odznaky a přehled otázek. */
function renderResult(result) {
  const round = state;
  const extra = el('p', { class: 'muted small' });
  const score = createScore(result.score, result.total);

  resultHeading.textContent = 'Výsledek kola';
  againButton.textContent = practiceTiles ? 'Zpět na kategorie' : 'Hrát znovu';
  resultSummary.replaceChildren(
    score,
    el('p', {}, `Čas: ${formatDuration(result.durationSeconds)}`),
    // denní výzva: řešení by ostatním prozradilo dnešní odpovědi
    result.solutionHidden ? el('p', {}, 'Správné odpovědi a vysvětlení uvidíš zítra.') : '',
    el('p', { class: 'small' }, leaderboardNote(round, result) ?? ''),
    extra,
    renderNewBadges(result.newBadges) ?? '');

  renderResultList(round.questions, result.solutionHidden ? [] : result.results);

  showOnly(resultSection, sections);
  resultHeading.focus();
  celebrate(score);
  state = null;
  renderDuelBox(round);

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

/** Pod výsledkem: výsledek duelu, nebo „Vyzvat kamaráda“ (jen běžné kolo přihlášeného). */
function renderDuelBox(round) {
  duelBox.hidden = true;
  if (round.mode === 'duel') {
    duelBox.hidden = false;
    renderDuelResult(duelBox, round.duelCode);
    history.replaceState(null, '', location.pathname);   // obnovení stránky už duel znovu nespustí
  } else if (profile && round.mode === 'bezne' && round.roundId && !round.category && !round.difficulty) {
    duelBox.hidden = false;
    renderChallenge(duelBox, round.roundId, 'kviz');
  }
}

// ---------- Řešení včerejší denní výzvy ----------
/** Řešení včerejší denní výzvy (vlastní kolo) – stejné zobrazení jako výsledek kola. */
async function showDailySolution() {
  hideError();
  dailySolutionButton.disabled = true;
  try {
    const solution = await getDailySolution(previousDay(dailyDay));
    resultHeading.textContent = 'Řešení včerejší výzvy';
    againButton.textContent = 'Zpět';
    const score = createScore(solution.score, solution.total);
    resultSummary.replaceChildren(score, el('p', {}, `Čas: ${formatDuration(solution.durationSeconds)}`));
    renderResultList(solution.questions, solution.results);
    showOnly(resultSection, sections);
    resultHeading.focus();
    celebrate(score, { ribbons: false });   // vyplní kruh; stuhy jen hned po kole
  } catch (error) {
    console.error(error);
    showError('Řešení včerejší výzvy se nepodařilo načíst.');
  } finally {
    dailySolutionButton.disabled = false;
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
if (difficultySelect) {
  fillDifficulty();
  difficultySelect.addEventListener('change', renderPractice);
}
renderPlayerInfo();
startButton?.addEventListener('click', () => begin('bezne'));
mistakesButton?.addEventListener('click', () => begin('chyby'));
dailyButton?.addEventListener('click', () => begin('denni'));
dailySolutionButton?.addEventListener('click', showDailySolution);
questionForm.addEventListener('submit', handleAnswer);
againButton.addEventListener('click', () => {
  hideError();
  duelBox.hidden = true;
  showOnly(startSection, sections);
  renderStartCards();   // počet chyb, stav denní výzvy i úspěšnost se po kole mohly změnit
});
