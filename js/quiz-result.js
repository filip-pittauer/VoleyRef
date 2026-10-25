// Společné části výsledku kola – kvíz (quiz.js) i zkouška (exam.js).
import { el } from './dom.js';
import { categoryName, categoryRulesUrl, ruleUrl } from './categories.js';
import { badgeById } from './badges.js';
import { createReportLink } from './report.js';
import { annotateTerms } from './glossary.js';

function answerLine(label, question, key) {
  const text = key ? `${key} – ${question.odpovedi[key]}` : 'bez odpovědi';
  return el('p', {}, el('strong', {}, `${label}: `), text);
}

/** Vysvětlení s podtrženými pojmy ze slovníčku (bubliny se doplní po načtení pojmů). */
function explanationWithTerms(text) {
  const paragraph = el('p', { class: 'result__explanation' }, text);
  annotateTerms(paragraph);
  return paragraph;
}

/**
 * Položka seznamu „Vysvětlení“: situace, odpovědi, vysvětlení a odkaz do pravidel.
 * Bez řešení (isCorrect undefined – dnešní denní výzva) jen situace a odpověď hráče.
 */
export function renderResultItem(question, result) {
  const known = typeof result.isCorrect === 'boolean';
  return el('li', { class: `result ${known ? (result.isCorrect ? 'result--ok' : 'result--wrong') : ''}` },
    known ? el('p', { class: 'result__status' }, result.isCorrect ? '✓ Správně' : '✗ Špatně') : null,
    el('p', {}, question.situace),
    answerLine('Tvoje odpověď', question, result.answer),
    known && !result.isCorrect ? answerLine('Správná odpověď', question, result.correctAnswer) : null,
    result.explanation ? explanationWithTerms(result.explanation) : null,
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
