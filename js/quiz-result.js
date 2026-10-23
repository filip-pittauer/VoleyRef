// Společné části výsledku kola – kvíz (quiz.js) i zkouška (exam.js).
import { el } from './dom.js';
import { categoryName, categoryRulesUrl, ruleUrl } from './categories.js';
import { badgeById } from './badges.js';
import { createReportLink } from './report.js';

function answerLine(label, question, key) {
  const text = key ? `${key} – ${question.odpovedi[key]}` : 'bez odpovědi';
  return el('p', {}, el('strong', {}, `${label}: `), text);
}

/** Položka seznamu „Vysvětlení“: situace, odpovědi, vysvětlení a odkaz do pravidel. */
export function renderResultItem(question, result) {
  return el('li', { class: `result ${result.isCorrect ? 'result--ok' : 'result--wrong'}` },
    el('p', { class: 'result__status' }, result.isCorrect ? '✓ Správně' : '✗ Špatně'),
    el('p', {}, question.situace),
    answerLine('Tvoje odpověď', question, result.answer),
    result.isCorrect ? null : answerLine('Správná odpověď', question, result.correctAnswer),
    result.explanation ? el('p', { class: 'result__explanation' }, result.explanation) : null,
    el('p', { class: 'result__rule' },
      question.pravidlo ? [el('a', { href: ruleUrl(question.pravidlo) }, `Pravidlo ${question.pravidlo}`), ' · '] : '',
      el('a', { href: categoryRulesUrl(question.kategorie) }, categoryName(question.kategorie))),
    createReportLink({ questionId: question.id }));
}

/** Blok „🏅 Nový odznak!“ ve výsledku kola (null, když žádný nový není). */
export function renderNewBadges(ids) {
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
