// Slovníček pojmů: pojmy v textu (pravidla, vysvětlení po kole) se podtrhnou
// a po klepnutí ukážou bublinu s definicí. Zdroj: slovnicek/pojmy.json
// (z něj vzniká i sekce Definice pojmů v pravidla.html).
import { el } from './dom.js';
import { ruleUrl } from './categories.js';

// Kde pojmy nehledat: odkazy, tlačítka, nadpisy, čísla bodů, obrázky, samotný slovníček.
const SKIP = 'a, button, summary, h1, h2, h3, h4, .sub__num, svg, figure, mark, .term, .definitions, .rule-brief__label, .result__rule';

let termsPromise = null;

/** Načte pojmy (jednou za návštěvu) a připraví k nim hledací výrazy. */
function loadTerms() {
  termsPromise ??= fetch('slovnicek/pojmy.json')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => data.pojmy.filter(t => t.tvary.length).map(term => {
      // tvar = začátek slova; „=“ na konci = celé slovo. Mezera může být i nezlomitelná.
      const parts = term.tvary.map(form => {
        const exact = form.endsWith('=');
        const text = (exact ? form.slice(0, -1) : form).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
        return exact ? `${text}(?![\\p{L}\\d])` : `${text}\\p{L}*`;
      });
      // (?<!…) = před pojmem nesmí být písmeno (začátek slova i s diakritikou)
      return { ...term, pattern: new RegExp(`(?<![\\p{L}\\d])(?:${parts.join('|')})`, 'iu'),
        length: Math.max(...term.tvary.map(f => f.length)) };
    })
    // delší pojmy napřed: „dokončený blok“ dřív než „blok“
    .sort((a, b) => b.length - a.length));
  return termsPromise;
}

/** Textové uzly v kořeni, které nejsou uvnitř vynechaných prvků. */
function textNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => (node.nodeValue.trim() && !node.parentElement.closest(SKIP)
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

/**
 * Podtrhne pojmy v prvku root – každý pojem jen při prvním výskytu (ať text
 * nepřeplní podtržení). Vrací Promise (pojmy se načítají ze souboru).
 */
export async function annotateTerms(root) {
  let terms;
  try {
    terms = await loadTerms();
  } catch (error) {
    console.error('Slovníček se nepodařilo načíst:', error);
    return;
  }
  for (const term of terms) {
    for (const node of textNodes(root)) {
      const match = term.pattern.exec(node.nodeValue);
      if (!match) continue;
      // rozdělit textový uzel: před | pojem | za (splitText jako Substring v C#)
      const rest = node.splitText(match.index);
      rest.splitText(match[0].length);
      rest.replaceWith(el('button', { type: 'button', class: 'term', 'data-term': term.id,
        'aria-expanded': 'false', 'aria-controls': 'term-pop' }, rest.nodeValue));
      break;
    }
  }
}

// ---------- Bublina ----------
let pop = null;
let openButton = null;

function closePop() {
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  openButton?.setAttribute('aria-expanded', 'false');
  openButton = null;
}

/** Otevře bublinu s definicí pojmu u tlačítka (pojmy se načtou při první potřebě). */
async function openPop(button) {
  const terms = await loadTerms();
  const term = terms.find(t => t.id === button.dataset.term);
  if (!term) return;
  pop ??= document.body.appendChild(el('div', { id: 'term-pop', class: 'term-pop', role: 'dialog', hidden: true }));

  // na stránce pravidel stačí kotva (rozbalí ji rules-page.js), jinde celá adresa
  const onRules = !!document.getElementById('definice');
  const link = onRules ? `#${ruleUrl(term.pravidlo).split('#')[1]}` : ruleUrl(term.pravidlo);
  pop.setAttribute('aria-label', term.pojem);
  pop.replaceChildren(
    el('p', { class: 'term-pop__title' }, term.pojem),
    el('p', {}, term.definice),
    el('p', { class: 'term-pop__links' },
      el('a', { href: link }, `Pravidlo ${term.pravidlo}`), ' · ',
      el('a', { href: onRules ? '#definice' : 'pravidla.html#definice' }, 'Všechny pojmy')));

  closePop();
  pop.hidden = false;
  openButton = button;
  button.setAttribute('aria-expanded', 'true');

  // pod slovem, ale celá v okně (na mobilu od kraje ke kraji)
  const rect = button.getBoundingClientRect();
  const width = Math.min(352, document.documentElement.clientWidth - 16);
  const left = Math.min(Math.max(8, rect.left), document.documentElement.clientWidth - width - 8);
  pop.style.width = `${width}px`;
  pop.style.left = `${left + window.scrollX}px`;
  pop.style.top = `${rect.bottom + window.scrollY + 6}px`;
}

document.addEventListener('click', event => {
  const button = event.target.closest('.term');
  if (button) {
    if (button === openButton) closePop();
    else openPop(button);
    return;
  }
  if (pop && !pop.contains(event.target)) closePop();
  else if (event.target.closest('#term-pop a')) closePop();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && openButton) {
    const button = openButton;
    closePop();
    button.focus();
  }
});
