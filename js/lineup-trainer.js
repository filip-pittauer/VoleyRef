// Trenažér postavení (postaveni.html): náhodná situace v okamžiku podání,
// hráč najde dvojici přijímajícího týmu v chybném postavení, nebo potvrdí,
// že je postavení správné. Běží jen v prohlížeči, nic se neukládá.
import { el } from './dom.js';
import { generateSituation, faultyPositions, isCorrectAnswer, FRONT_ROW, BACK_ROW } from './lineup-logic.js';
import { renderScene } from './court-scene.js';
import { attachPinchZoom } from './scene-zoom.js';

const scene = document.getElementById('lineup-scene');
const viewButtons = [...document.querySelectorAll('#lineup-views [data-view]')];
const card = document.getElementById('lineup-card');
const form = document.getElementById('lineup-form');
const fieldset = document.getElementById('lineup-fieldset');
const correctButton = document.getElementById('lineup-correct');
const submitButton = document.getElementById('lineup-submit');
const nextButton = document.getElementById('lineup-next');
const hint = document.getElementById('lineup-hint');
const feedback = document.getElementById('lineup-feedback');
const progress = document.getElementById('lineup-progress');
const tally = document.getElementById('lineup-tally');
const heading = document.getElementById('lineup-heading');
const zoomReset = document.getElementById('lineup-zoom-reset');
const zoom = attachPinchZoom(scene, { onChange: zoomed => { zoomReset.hidden = !zoomed; } });

const state = {
  situation: null,
  view: 'ref1',          // pohled zvolený hráčem (po vyhodnocení se dočasně přepne na „shora“)
  shownView: 'ref1',
  selected: [],          // pozice vybraných hráčů (nejvýš 2)
  correctLineup: false,  // hráč zvolil „Postavení je správné“
  result: null,          // po vyhodnocení { relations, faulty }
  round: 0,
  good: 0,
  bad: 0,
};

const jerseyOf = position => state.situation.receiving.find(p => p.position === position).jersey;
const who = position => `hráč na pozici ${position} (č. ${jerseyOf(position)})`;

// ---------- Vykreslení ----------
function render() {
  renderScene(scene, state.situation, { view: state.shownView, selected: state.selected, result: state.result });
  zoom.refresh();
  for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === state.shownView));
  for (const button of card.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(state.selected.includes(Number(button.dataset.position))));
  }
  correctButton.setAttribute('aria-pressed', String(state.correctLineup));
}

/**
 * Karta „Postavení podle zápisu“ (síť nahoře, vlevo pozice 4 a 5). Čísla jsou
 * zároveň tlačítka: klepnutím se hráč vybere stejně jako ve scéně.
 */
function renderCard() {
  card.replaceChildren(...[...FRONT_ROW, ...BACK_ROW].map(position => {
    const jersey = jerseyOf(position);
    return el('li', {},
      el('button', {
        type: 'button', class: 'lineup-card__cell', 'data-position': position, 'aria-pressed': 'false',
        'aria-label': `Hráč číslo ${jersey}, pozice ${position}`,
      },
      el('span', { class: 'lineup-card__pos' }, `pozice ${position}`),
      el('span', { class: 'lineup-card__num' }, String(jersey))));
  }));
}

function renderBoard() {
  progress.textContent = `Situace ${state.round}`;
  tally.textContent = state.good + state.bad ? `✓ ${state.good}  ✗ ${state.bad}` : '';
}

// ---------- Průběh ----------
function newSituation() {
  state.situation = generateSituation();
  state.selected = [];
  state.correctLineup = false;
  state.result = null;
  state.shownView = state.view;
  state.round++;

  viewButtons.find(b => b.dataset.view === 'top').hidden = true;
  fieldset.disabled = false;
  hint.hidden = true;
  feedback.replaceChildren();
  correctButton.hidden = false;
  submitButton.hidden = false;
  nextButton.hidden = true;

  renderBoard();
  renderCard();
  render();
}

/** Klepnutí na hráče: vybrat / zrušit výběr (vybírá se dvojice). */
function togglePlayer(position) {
  if (state.result) return;
  state.correctLineup = false;
  if (state.selected.includes(position)) {
    state.selected = state.selected.filter(p => p !== position);
  } else {
    // třetí výběr vytlačí nejstarší – hledá se vždy dvojice
    state.selected = [...state.selected, position].slice(-2);
  }
  hint.hidden = true;
  render();
}

function showHint(text) {
  hint.textContent = text;
  hint.hidden = false;
}

/** Popis porušeného vztahu (nebo správného postavení) pro vysvětlení. */
function explanation(situation) {
  const fault = situation.fault;
  if (!fault) {
    return [el('p', {}, 'Postavení bylo správné: každý hráč zadní řady stojí za svým hráčem přední řady a v obou řadách je pořadí zleva 4–3–2 a 5–6–1.')];
  }
  if (fault.kind === 'column') {
    return [el('p', {},
      `Chyba: ${who(fault.back)} stojí blíž k síti než ${who(fault.front)}. Hráč zadní řady musí mít aspoň část chodidla dál od střední čáry než přední chodidlo svého hráče přední řady (`,
      el('a', { href: 'pravidla.html#p-7-4-3-1' }, 'pravidlo 7.4.3.1'), ').')];
  }
  const row = FRONT_ROW.includes(fault.left) ? FRONT_ROW : BACK_ROW;
  return [el('p', {},
    `Chyba: ${who(fault.right)} stojí víc vlevo než ${who(fault.left)}. V řadě musí hráči stát zleva ${row.join('–')} (z pohledu týmu, který se dívá k síti) (`,
    el('a', { href: 'pravidla.html#p-7-4-3-2' }, 'pravidlo 7.4.3.2'), ').')];
}

/** Vyhodnotí odpověď a přepne na pohled shora s čarami mezi hráči. */
function evaluate(event) {
  event.preventDefault();
  if (state.result) return;
  if (!state.correctLineup && state.selected.length === 0) {
    showHint('Vyber dva hráče, kteří spolu stojí v chybném pořadí, nebo zvol „Postavení je správné“.');
    return;
  }
  if (!state.correctLineup && state.selected.length === 1) {
    showHint('Chyba postavení je vždy mezi dvěma hráči. Vyber ještě druhého.');
    return;
  }

  const situation = state.situation;
  const correct = isCorrectAnswer(situation, state.correctLineup ? { correctLineup: true } : { positions: state.selected });
  if (correct) state.good++; else state.bad++;
  const faulty = faultyPositions(situation);
  state.result = { relations: situation.relations, faulty };
  state.shownView = 'top';

  const answerLine = correct ? null : el('p', {},
    faulty.length ? `Správná odpověď: č. ${jerseyOf(faulty[0])} a č. ${jerseyOf(faulty[1])}.` : 'Správná odpověď: postavení je správné.');
  feedback.replaceChildren(el('div', { class: `result ${correct ? 'result--ok' : 'result--wrong'}` },
    el('p', { class: 'result__status' }, correct ? '✓ Správně' : '✗ Špatně'),
    answerLine,
    ...explanation(situation),
    el('p', { class: 'muted small' }, 'Na plánku shora: zelené čáry = vztah v pořádku, červená = porušený.')));

  viewButtons.find(b => b.dataset.view === 'top').hidden = false;
  fieldset.disabled = true;
  correctButton.hidden = true;
  hint.hidden = true;
  submitButton.hidden = true;
  nextButton.hidden = false;
  renderBoard();
  render();
  // fokus na „Další situace“ (klávesnice), ale bez posunu k tlačítku –
  // stránka se vrátí nahoru, aby byl vidět plánek shora s vyhodnocením
  nextButton.focus({ preventScroll: true });
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
}

// ---------- Události ----------
scene.addEventListener('click', event => {
  const player = event.target.closest('[data-position]');
  if (player) togglePlayer(Number(player.dataset.position));
});

card.addEventListener('click', event => {
  const button = event.target.closest('button[data-position]');
  if (button) togglePlayer(Number(button.dataset.position));
});

correctButton.addEventListener('click', () => {
  if (state.result) return;
  state.correctLineup = !state.correctLineup;
  if (state.correctLineup) state.selected = [];
  hint.hidden = true;
  render();
});

for (const button of viewButtons) {
  button.addEventListener('click', () => {
    state.shownView = button.dataset.view;
    if (button.dataset.view !== 'top') state.view = button.dataset.view;   // zapamatovat pro další situace
    render();
  });
}

zoomReset.addEventListener('click', () => zoom.reset());
form.addEventListener('submit', evaluate);
nextButton.addEventListener('click', () => {
  newSituation();
  heading.focus();
});

newSituation();
