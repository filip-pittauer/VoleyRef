// Kurz po lekcích (Výuka, kurz.html): mapa lekcí v pořadí z kurz/lekce.json.
// Lekce = přečíst si pravidla + test 5 otázek z kategorie (kolo v režimu
// 'lekce', běží stejně jako kvíz v quiz.js). Další lekce se odemkne po
// splnění testu předchozí. Postup přihlášeného počítá server z odehraných
// kol (postup_kurzu); nepřihlášený má postup jen do zavření stránky.
import { el } from './dom.js';
import { categoryName, categoryRulesUrl } from './categories.js';

let request = null;

/** Vrátí Promise s lekcemi z kurz/lekce.json (stáhnou se jednou za návštěvu). */
export function loadLessons() {
  request ??= fetch('kurz/lekce.json')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => data.lekce)
    .catch(error => {
      request = null;   // příště to zkusit znovu
      throw error;
    });
  return request;
}

/**
 * Stav každé lekce: 'done' (splněná), 'open' (odemčená), 'locked'.
 * Odemčená je první lekce a každá, jejíž předchozí lekce je splněná.
 * @param {Array<{ kategorie: string }>} lessons
 * @param {Map<string, { splneno: boolean }>} progress
 */
export function lessonStates(lessons, progress) {
  return lessons.map((lesson, i) => {
    if (progress.get(lesson.kategorie)?.splneno) return 'done';
    if (i === 0 || progress.get(lessons[i - 1].kategorie)?.splneno) return 'open';
    return 'locked';
  });
}

const STEP_MARK = { done: '✓', locked: '🔒' };

/** Odkazy „Přečti si“ a „Vyzkoušej“ u lekce. */
function lessonLinks(lesson) {
  return [
    el('p', { class: 'lesson__label' }, 'Přečti si'),
    el('ul', { class: 'lesson__links' },
      ...lesson.cist.map(link => el('li', {}, el('a', { href: `pravidla.html#${link.kotva}` }, link.text)))),
    lesson.navic.length ? el('p', { class: 'lesson__label' }, 'Vyzkoušej si') : null,
    lesson.navic.length ? el('ul', { class: 'lesson__links' },
      ...lesson.navic.map(link => el('li', {}, el('a', { href: link.href }, link.text)))) : null,
  ];
}

/** Text pod názvem lekce: nejlepší výsledek, nebo proč je zamčená. */
function lessonStatus(state, best, previous) {
  if (state === 'locked') return `Odemkne se po splnění lekce ${categoryName(previous.kategorie)}.`;
  if (!best) return 'Zatím nesplněno';
  return `${state === 'done' ? 'Splněno' : 'Zatím nesplněno'} · nejlepší test ${best.nejlepsi}/${best.pocet}`;
}

/** Jedna lekce: zamčená = jen název; jinak rozbalovací <details> s obsahem a testem. */
function renderLesson(lesson, index, { state, best, previous, current, onStart }) {
  const name = categoryName(lesson.kategorie);
  const head = [
    el('span', { class: 'lesson__step', 'aria-hidden': 'true' }, STEP_MARK[state] ?? String(index + 1)),
    el('span', { class: 'lesson__head' },
      el('span', { class: 'lesson__name' }, `${index + 1}. ${name}`),
      el('span', { class: 'lesson__status' }, lessonStatus(state, best, previous))),
  ];
  if (state === 'locked') {
    return el('li', { class: 'lesson lesson--locked' }, el('div', { class: 'lesson__summary' }, ...head));
  }
  const button = el('button', { class: `button${state === 'done' ? ' button--secondary' : ''}`, type: 'button' },
    state === 'done' ? 'Zopakovat test' : 'Spustit test (5 otázek)');
  button.addEventListener('click', () => onStart(lesson.kategorie, button));
  return el('li', { class: `lesson lesson--${state}` },
    el('details', { open: current },
      el('summary', { class: 'lesson__summary' }, ...head),
      el('div', { class: 'lesson__body stack' },
        el('p', {}, lesson.uvod),
        ...lessonLinks(lesson),
        el('p', { class: 'small muted' }, 'Test má 5 otázek z této oblasti. Ke splnění potřebuješ aspoň 4 správně.'),
        el('div', {}, button))));
}

/**
 * Vykreslí mapu kurzu: souhrn „Hotovo X z Y“ a seznam lekcí.
 * Rozbalená je první nesplněná odemčená lekce (tam hráč pokračuje).
 * @param {HTMLElement} container
 * @param {{ lessons: Array, progress: Map<string, { nejlepsi: number, pocet: number, splneno: boolean }>,
 *           onStart: (category: string, button: HTMLButtonElement) => void }} options
 */
export function renderCourse(container, { lessons, progress, onStart }) {
  const states = lessonStates(lessons, progress);
  const done = states.filter(s => s === 'done').length;
  const current = states.indexOf('open');
  container.replaceChildren(
    el('div', { class: 'course-progress' },
      el('p', {}, done === lessons.length
        ? `Celý kurz máš hotový! 🎉 Teď si můžeš vyzkoušet zkoušku.`
        : `Hotovo ${done} z ${lessons.length} lekcí`),
      el('progress', { value: done, max: lessons.length, 'aria-hidden': 'true' })),
    // replaceChildren (na rozdíl od el) null nepřeskočí – vypsal by „null“
    done === lessons.length ? el('p', {}, el('a', { class: 'button', href: 'zkouska.html' }, 'Na zkoušku')) : '',
    el('ol', { class: 'course' },
      ...lessons.map((lesson, i) => renderLesson(lesson, i, {
        state: states[i],
        best: progress.get(lesson.kategorie),
        previous: lessons[i - 1],
        current: i === current,
        onStart,
      }))));
}

/**
 * Poznámka k výsledku testu lekce: splněno (a co se odemklo), nebo co zopakovat.
 * @param {{ category: string, passScore: number, passed: boolean }} lesson výsledek z odevzdej_kolo
 * @param {Array} lessons
 */
export function lessonResultNote(lesson, lessons) {
  const index = lessons.findIndex(l => l.kategorie === lesson.category);
  const next = lessons[index + 1];
  if (lesson.passed) {
    return el('p', { class: 'lesson-verdict lesson-verdict--pass' },
      next ? `Lekce splněná! Odemkla se další lekce: ${categoryName(next.kategorie)}.` : 'Lekce splněná! Tím máš celý kurz hotový. 🎉');
  }
  return el('p', { class: 'lesson-verdict' },
    `Ke splnění lekce potřebuješ aspoň ${lesson.passScore} správně. Projdi si vysvětlení níž, `,
    el('a', { href: categoryRulesUrl(lesson.category) }, 'shrnutí v pravidlech'),
    ' a zkus test znovu – otázky budou zčásti jiné.');
}
