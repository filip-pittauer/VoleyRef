// Stránka trenažéru zápisu (zapis.html): výběr verze, krátká verze (úlohy),
// dlouhá verze (vedení celého setu), výsledek. Nic se neukládá.
import { el, showOnly, replayAnimation } from './dom.js';
import { ruleUrl } from './categories.js';
import { createScore, celebrate } from './celebrate.js';
import { OUTCOMES, SANCTIONS, ROMAN, slotPlayer } from './scoresheet-model.js';
import { generateTasks } from './scoresheet-tasks.js';
import { createGame, explain } from './scoresheet-game.js';
import { renderCourt, renderSheet } from './scoresheet-view.js';

const TASKS_PER_ROUND = 10;

// ---------- Prvky ----------
const startSection = document.getElementById('sc-start');
const playSection = document.getElementById('sc-play');
const resultSection = document.getElementById('sc-result');
const sections = [startSection, playSection, resultSection];

const progressText = document.getElementById('sc-progress');
const tallyText = document.getElementById('sc-tally');
const eventHeading = document.getElementById('sc-event-heading');
const eventText = document.getElementById('sc-event-text');
const questionText = document.getElementById('sc-question');
const optionsBox = document.getElementById('sc-options');
const feedback = document.getElementById('sc-feedback');
const nextButton = document.getElementById('sc-next');
const courtBox = document.getElementById('sc-court');
const sheetBox = document.getElementById('sc-sheet');

// ---------- Stav ----------
// mode: 'short' (tasks, index) | 'long' (game, event); correct/total = počitadlo;
// mistakes: [{ text, explanation, rule, answer? }] pro přehled chyb na konci.
// phase (dlouhá verze) = na co se čeká: 'point' (klepnutí na bod), 'server'
// (sloupec podávajícího), 'decision' (tlačítka); null = klepnutí do zápisu ignorovat.
let state = null;

/** Horní lišta: počet správných/chybných a postup (úloha, nebo skóre setu). */
function updateBoard() {
  const { correct, total } = state;
  tallyText.replaceChildren(el('span', { class: 'sc-tally__ok' }, `✓ ${correct}`), ' ', el('span', {}, `✗ ${total - correct}`));
  if (state.mode === 'short') {
    progressText.textContent = `Úloha ${Math.min(state.index + 1, state.tasks.length)} z ${state.tasks.length}`;
  } else {
    const { score } = state.game.set;
    progressText.textContent = `Set · A ${score.A} : B ${score.B}`;
  }
}

/** Tlačítka možností; onPick(id, button). */
function renderOptions(options, onPick) {
  optionsBox.replaceChildren(...options.map(option =>
    el('button', { type: 'button', class: 'sc-option', 'data-id': option.id }, option.label)));
  optionsBox.onclick = event => {
    const button = event.target.closest('.sc-option');
    if (button && !button.disabled) onPick(button.dataset.id, button);
  };
}

/** Po odpovědi: zamknout tlačítka, správné zeleně, zvolené špatné červeně. */
function markOptions(correctId, pickedId) {
  for (const button of optionsBox.querySelectorAll('.sc-option')) {
    button.disabled = true;
    button.classList.toggle('sc-option--correct', button.dataset.id === correctId);
    button.classList.toggle('sc-option--wrong', button.dataset.id === pickedId && pickedId !== correctId);
  }
}

/** Výsledek odpovědi s vysvětlením a odkazem na pravidlo (nová karta – rozehraná hra zůstane). */
function showFeedback(isCorrect, explanation, rule) {
  feedback.className = `result ${isCorrect ? 'result--ok' : 'result--wrong'}`;
  feedback.replaceChildren(
    el('p', { class: 'result__status' }, isCorrect ? '✓ Správně' : '✗ Špatně'),
    explanation ? el('p', {}, explanation) : null,
    rule ? el('p', { class: 'result__rule' }, el('a', { href: ruleUrl(rule), target: '_blank', rel: 'noopener' }, `Pravidlo ${rule}`)) : null);
  feedback.hidden = false;
}

/** Vyčistí otázku, možnosti a zpětnou vazbu před další událostí. */
function resetEventPanel() {
  feedback.hidden = true;
  nextButton.hidden = true;
  optionsBox.replaceChildren();
  optionsBox.onclick = null;
  questionText.textContent = '';
}

// =====================================================================
// Krátká verze – úlohy nad zápisem
// =====================================================================
function startShort() {
  state = { mode: 'short', tasks: generateTasks(Math.random, TASKS_PER_ROUND), index: 0, correct: 0, total: 0, mistakes: [] };
  playSection.classList.remove('sc-play--long');
  showOnly(playSection, sections);
  renderTask();
}

/** Vykreslí aktuální úlohu: text, hřiště, zápis a možnosti; po odpovědi vyhodnotí. */
function renderTask() {
  const task = state.tasks[state.index];
  resetEventPanel();
  updateBoard();
  eventText.textContent = task.text;
  questionText.textContent = task.question;
  courtBox.replaceChildren(renderCourt(task.set));
  renderSheet(sheetBox, task.set);
  renderOptions(task.options, pickedId => {
    const isCorrect = pickedId === task.correct;
    state.total++;
    if (isCorrect) state.correct++;
    else state.mistakes.push({ text: `${task.text} ${task.question}`, explanation: task.explanation, rule: task.rule,
      answer: task.options.find(o => o.id === task.correct).label });
    markOptions(task.correct, pickedId);
    showFeedback(isCorrect, task.explanation, task.rule);
    updateBoard();
    nextButton.textContent = state.index === state.tasks.length - 1 ? 'Zobrazit výsledek' : 'Další úloha';
    nextButton.hidden = false;
    nextButton.focus();
  });
  for (const part of [eventText, optionsBox]) replayAnimation(part, 'q-enter');
  eventHeading.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

// =====================================================================
// Dlouhá verze – vedení celého setu
// =====================================================================
function startLong() {
  state = { mode: 'long', game: createGame(Math.random), correct: 0, total: 0, mistakes: [], event: null, phase: null };
  playSection.classList.add('sc-play--long');
  showOnly(playSection, sections);
  nextEvent();
}

/** Započítá odpověď v dlouhé verzi (chyba jde do přehledu na konci). */
function count(isCorrect, event, explanation, rule) {
  state.total++;
  if (isCorrect) state.correct++;
  else state.mistakes.push({ text: event.text, explanation, rule });
  updateBoard();
}

/** Po správné odpovědi jde hra rovnou dál, po chybě čeká na „Pokračovat“. */
function proceed(isCorrect) {
  if (isCorrect) {
    nextEvent();
    return;
  }
  nextButton.textContent = 'Pokračovat';
  nextButton.hidden = false;
  nextButton.focus();
}

/**
 * Další událost dlouhé verze. Rozehra se odpovídá klepnutím přímo do zápisu
 * (bod, pak případně sloupec podávajícího), ostatní události tlačítky.
 */
function nextEvent() {
  const { game } = state;
  const event = game.next();
  state.event = event;
  resetEventPanel();
  if (event.type === 'end') {
    showResult();
    return;
  }
  updateBoard();
  eventText.textContent = event.text;
  courtBox.replaceChildren(renderCourt(game.set));
  replayAnimation(eventText, 'q-enter');

  if (event.type === 'rally') {
    state.phase = 'point';
    questionText.textContent = `Zapiš bod: klepni na další číslo v bodech družstva ${event.winner}.`;
    renderSheet(sheetBox, game.set, { onPoint: pickPoint });
    return;
  }

  state.phase = 'decision';
  renderSheet(sheetBox, game.set);
  const options = {
    timeout: OUTCOMES, sub: OUTCOMES, 'libero-in': OUTCOMES, 'libero-out': OUTCOMES,
    delay: { 'napomenuti-zdrzovani': 'Napomenutí za zdržování', 'trest-zdrzovani': 'Trest za zdržování' },
    misconduct: Object.fromEntries(Object.entries(SANCTIONS).map(([id, s]) => [id, s.label])),
    serve: { ok: 'V pořádku', chyba: 'Po úderu bzučák – chyba v pořadí podání' },
    'libero-forced': { ok: 'Zapsat výměnu libera' },
  }[event.type];
  questionText.textContent = {
    'libero-forced': '', serve: 'Podává správný hráč?', misconduct: 'Co zapíšeš?', delay: 'Co zapíšeš?',
  }[event.type] ?? 'Jak má žádost správně dopadnout?';
  renderOptions(Object.entries(options).map(([id, label]) => ({ id, label })), pickDecision);
}

/** Odpověď na událost s tlačítky; hra pak provede správnou variantu (i po chybě). */
function pickDecision(pickedId) {
  const { event, game } = state;
  const isCorrect = pickedId === event.expected;
  const { text: explanation, rule } = explain(game.set, event);   // před provedením (záleží na zápisu)
  if (event.type !== 'libero-forced') count(isCorrect, event, explanation, rule);
  markOptions(event.expected, pickedId);
  game.resolveDecision(event);
  renderSheet(sheetBox, game.set);
  if (!isCorrect) showFeedback(false, explanation, rule);
  proceed(isCorrect);
}

/** Rozehra, krok 1: bod. */
function pickPoint(team) {
  const { event, game } = state;
  const isCorrect = team === event.winner;
  count(isCorrect, event, `Bod patřil družstvu ${event.winner}.`);
  state.rallyError = !isCorrect;          // po chybě v bodě počkat na „Pokračovat“ i po správném podávajícím
  game.resolveRally(event);
  if (!event.sideOut) {
    renderSheet(sheetBox, game.set);
    if (!isCorrect) showFeedback(false, `Rozehru vyhrálo družstvo ${event.winner} – bod se zapisuje jemu.`);
    proceed(isCorrect);
    return;
  }
  // krok 2: družstvo získalo podání – kdo podává? (sloupec v pořadí podání)
  state.phase = 'server';
  questionText.textContent = `Družstvo ${event.winner} získalo podání. Klepni v jeho pořadí podání na sloupec hráče, který bude podávat.`;
  renderSheet(sheetBox, game.set, { onServer: pickServer, marker: { [event.winner]: event.prevSlot } });
  if (!isCorrect) showFeedback(false, `Rozehru vyhrálo družstvo ${event.winner} – bod se zapisuje jemu (opraveno).`);
}

/** Rozehra, krok 2: nový podávající (sloupec). */
function pickServer(team, slot) {
  const { event, game } = state;
  if (team !== event.winner) return;          // klepnutí do zápisu soupeře ignorovat
  const isCorrect = slot === event.expectedSlot;
  const number = slotPlayer(game.set.teams[team].slots[event.expectedSlot]);
  const explanation = `Po získání podání podává další sloupec v pořadí: po ${ROMAN[event.prevSlot]} je ${ROMAN[event.expectedSlot]} – č. ${number}.`;
  state.total++;
  if (isCorrect) state.correct++;
  else state.mistakes.push({ text: `${event.text} Kdo podává?`, explanation, rule: '12.2.2.2' });
  updateBoard();
  renderSheet(sheetBox, game.set);
  courtBox.replaceChildren(renderCourt(game.set));
  if (!isCorrect) showFeedback(false, explanation, '12.2.2.2');
  proceed(isCorrect && !state.rallyError);
}

// Klepnutí do zápisu (body, sloupce) – zápis se překresluje, proto delegace na kontejneru.
sheetBox.addEventListener('click', event => {
  if (state?.mode !== 'long') return;
  const point = event.target.closest('.sc-point--next');
  if (point && state.phase === 'point') { state.phase = null; pickPoint(point.dataset.team); return; }
  const slotButton = event.target.closest('.sc-slot-btn');
  if (slotButton && state.phase === 'server') {
    if (slotButton.dataset.team !== state.event.winner) return;
    state.phase = null;
    pickServer(slotButton.dataset.team, Number(slotButton.dataset.slot));
  }
});

// =====================================================================
// Výsledek
// =====================================================================
/** Výsledek kola: skóre, přehled chyb s vysvětlením, oslava. */
function showResult() {
  const { correct, total, mistakes, mode } = state;
  const score = createScore(correct, total);
  document.getElementById('sc-score').replaceChildren(score);
  const percent = total ? Math.round((correct / total) * 100) : 0;
  document.getElementById('sc-result-text').textContent = mode === 'long'
    ? `Set skončil ${state.game.set.score.A} : ${state.game.set.score.B}. Správně ${percent} % rozhodnutí v zápisu.`
    : `Správně ${correct} z ${total} úloh.`;
  document.getElementById('sc-mistakes').replaceChildren(...mistakes.map(m =>
    el('li', { class: 'result result--wrong stack' },
      el('p', {}, m.text),
      m.answer ? el('p', {}, el('strong', {}, 'Správně: '), m.answer) : null,
      el('p', { class: 'result__explanation' }, m.explanation),
      m.rule ? el('p', { class: 'result__rule' }, el('a', { href: ruleUrl(m.rule) }, `Pravidlo ${m.rule}`)) : null)));
  document.getElementById('sc-mistakes-box').hidden = mistakes.length === 0;
  showOnly(resultSection, sections);
  document.getElementById('sc-result-heading').focus();
  celebrate(score);
}

// ---------- Ovládání ----------
document.getElementById('start-short').addEventListener('click', startShort);
document.getElementById('start-long').addEventListener('click', startLong);
document.getElementById('sc-again').addEventListener('click', () => (state.mode === 'long' ? startLong() : startShort()));
const toStart = () => { state = null; showOnly(startSection, sections); };
document.getElementById('sc-switch').addEventListener('click', toStart);
document.getElementById('sc-quit').addEventListener('click', toStart);
nextButton.addEventListener('click', () => {
  if (state.mode === 'short') {
    state.index++;
    if (state.index >= state.tasks.length) showResult();
    else renderTask();
  } else {
    nextEvent();
  }
});
