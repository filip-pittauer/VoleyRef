// Hra „Odpískej to!“ (odpiskej.html): hráč je 1. nebo 2. rozhodčí a z gest
// skládá posloupnost ve správném pořadí (pravidlo 22.2.3). Situace a řešení
// má server (zacni_odpiskej / odevzdej_odpiskej, sql/09_odpiskej.sql),
// řešení se ukáže až na konci kola – stejně jako v kvízu.
// Situace jsou zatím jen text; později je nahradí animace (Three.js).
import { el, showOnly, replayAnimation } from './dom.js';
import { plural } from './format.js';
import { ruleUrl } from './categories.js';
import { loadGestures } from './gesture-data.js';
import { createGesturePlayer } from './referee-figure.js';
import { startWhistle, submitWhistle, acceptDuel } from './quiz-api.js';
import { duelCodeFromUrl, renderChallenge, renderDuelResult } from './duel.js';
import { getProfile, isConfigured, NOT_CONFIGURED_MESSAGE } from './supabase.js';
import { createScore, celebrate } from './celebrate.js';
import { pointsNote } from './points.js';

const $ = id => document.getElementById(id);
const sections = [$('whistle-start'), $('whistle-run'), $('whistle-result')];

let data = null;      // gesta/gesta.json (názvy a animace gest)
let profile = null;
let state = null;     // { roundId, situations, index, answers, sequence }

const gestureById = id => data.gesta.find(g => g.id === id);
const names = ids => ids.map(id => gestureById(id)?.nazev ?? id);

function showError(message) {
  $('whistle-error').textContent = message;
  $('whistle-error').hidden = false;
}

// ---------- Start ----------
/** code = kód duelu (odpiskej.html?duel=…): stejné situace jako vyzyvatel. */
async function begin(code = null) {
  $('whistle-error').hidden = true;
  $('whistle-start-button').disabled = true;
  try {
    const { roundId, situations } = code
      ? await acceptDuel(code).then(d => ({ roundId: d.kolo_id, situations: d.situace }))
      : await startWhistle();
    if (!roundId) return showError('Hra zatím nemá žádné situace.');
    state = { roundId, duelCode: code, situations, index: 0, answers: {}, sequence: [] };
    showOnly($('whistle-run'), sections);
    renderOptions();
    showSituation();
  } catch (error) {
    console.error(error);
    showError(code ? (error.message ?? 'Duel se nepodařilo spustit.') : 'Hru se nepodařilo spustit. Zkontroluj připojení k internetu a zkus to znovu.');
  } finally {
    $('whistle-start-button').disabled = false;
  }
}

// ---------- Situace ----------
function showSituation() {
  const situation = state.situations[state.index];
  const total = state.situations.length;
  $('whistle-progress').textContent = `Situace ${state.index + 1} z ${total}`;
  $('whistle-progress-bar').max = total;
  $('whistle-progress-bar').value = state.index;
  $('whistle-role').textContent = `Jsi ${situation.kdo}. rozhodčí`;
  $('whistle-text').textContent = situation.text;
  state.sequence = [];
  renderSequence();
  $('whistle-done').textContent = state.index === total - 1 ? 'Odpískat a vyhodnotit' : 'Odpískat';
  replayAnimation($('whistle-situation'), 'q-enter');
  $('whistle-heading').focus();
}

/** Nabídka gest 1. a 2. rozhodčího (pořadí jako v diagramu 11 pravidel). */
function renderOptions() {
  const buttons = data.gesta.filter(g => g.skupina === 'rozhodci').map(g => {
    const button = el('button', { type: 'button', class: 'whistle-option', 'data-id': g.id }, g.nazev);
    button.addEventListener('click', () => {
      if (state.sequence.includes(g.id)) return;
      state.sequence.push(g.id);
      renderSequence();
    });
    return button;
  });
  $('whistle-options').replaceChildren(...buttons);
}

/** Zvolená gesta v pořadí; použitá gesta v nabídce zešednou. */
function renderSequence() {
  const list = $('whistle-sequence');
  list.replaceChildren(...names(state.sequence).map(name => el('li', {}, name)));
  $('whistle-sequence-empty').hidden = state.sequence.length > 0;
  for (const button of $('whistle-options').children) {
    button.disabled = state.sequence.includes(button.dataset.id);
  }
  $('whistle-done').disabled = state.sequence.length === 0;
  $('whistle-undo').disabled = state.sequence.length === 0;
}

function submitSituation() {
  if (state.sequence.length === 0) return;
  const situation = state.situations[state.index];
  state.answers[situation.id] = [...state.sequence];
  if (state.index < state.situations.length - 1) {
    state.index++;
    showSituation();
  } else {
    finish();
  }
}

// ---------- Výsledek ----------
async function finish() {
  $('whistle-done').disabled = true;
  let result;
  try {
    result = await submitWhistle(state.roundId, state.answers);
  } catch (error) {
    console.error(error);
    $('whistle-done').disabled = false;
    showError('Vyhodnocení se nepodařilo. Zkus to prosím znovu.');
    return;
  }
  const textById = new Map(state.situations.map(s => [s.id, s]));
  const score = createScore(result.score, result.total);
  $('whistle-score').replaceChildren(score);
  $('whistle-result-text').textContent = `Správně ${plural(result.score, 'situace', 'situace', 'situací')} z ${result.total}.`;
  $('whistle-points').replaceChildren((state.duelCode ? 'V duelu se body za odpovědi nepočítají – za výhru dostaneš bonus.' : pointsNote(result, Boolean(profile))) ?? '');
  renderDuelBox(state);
  $('whistle-results').replaceChildren(...result.results.map(r => renderResultItem(textById.get(r.id), r)));
  showOnly($('whistle-result'), sections);
  $('whistle-result-heading').focus();
  celebrate(score);
}

/** Pod výsledkem: výsledek duelu, nebo „Vyzvat kamaráda“ (jen přihlášený). */
function renderDuelBox(round) {
  const box = $('duel-box');
  box.hidden = !profile;
  if (round.duelCode) {
    renderDuelResult(box, round.duelCode);
    history.replaceState(null, '', location.pathname);
  } else if (profile) {
    renderChallenge(box, round.roundId, 'odpiskej');
  }
}

/** Jedna situace ve výsledku: tvoje gesta, správná gesta (u chyby i s animacemi), vysvětlení. */
function renderResultItem(situation, r) {
  return el('li', { class: `result ${r.isCorrect ? 'result--ok' : 'result--wrong'} stack` },
    el('p', { class: 'result__status' }, r.isCorrect ? '✓ Správně' : '✗ Špatně'),
    el('p', {}, el('strong', {}, `${situation.kdo}. rozhodčí: `), situation.text),
    el('p', { class: 'small' }, el('strong', {}, 'Tvoje znamení: '), names(r.answer).join(' → ') || '–'),
    el('p', { class: 'small' }, el('strong', {}, 'Správně: '), names(r.correct).join(' → ')),
    r.isCorrect ? null : el('div', { class: 'reverse-grid' },
      ...r.correct.map(id => el('div', { class: 'reverse-option' },
        createGesturePlayer(gestureById(id), data.pozy, { autoplay: false }),
        el('p', { class: 'small' }, gestureById(id).nazev)))),
    el('p', { class: 'result__explanation' }, r.explanation),
    r.rule ? el('p', { class: 'result__rule small' }, 'Pravidla: ',
      ...r.rule.split(',').map(n => n.trim()).flatMap((n, i) => [i ? ', ' : '', el('a', { href: ruleUrl(n) }, n)])) : null);
}

// ---------- Inicializace ----------
$('whistle-start-button').addEventListener('click', () => begin());
$('whistle-done').addEventListener('click', submitSituation);
$('whistle-undo').addEventListener('click', () => { state.sequence.pop(); renderSequence(); });
$('whistle-again').addEventListener('click', () => { $('duel-box').hidden = true; showOnly($('whistle-start'), sections); });

if (!isConfigured) {
  showError(NOT_CONFIGURED_MESSAGE);
} else {
  Promise.all([loadGestures(), getProfile().catch(() => null)])
    .then(([gestures, player]) => {
      data = gestures;
      profile = player;
      $('whistle-start-button').disabled = false;
      $('whistle-login').hidden = Boolean(profile);
      if (duelCodeFromUrl() && profile) begin(duelCodeFromUrl());
    })
    .catch(error => {
      console.error(error);
      showError('Gesta se nepodařilo načíst. Zkontroluj připojení a obnov stránku.');
    });
}
