// Pomocné funkce pro práci s DOM.

/**
 * Vytvoří HTML prvek, nastaví mu atributy a vloží potomky.
 * Řetězce se vkládají jako text (textContent), nikdy jako HTML –
 * text z dat se tak nemůže „spustit“ jako kód (ochrana proti XSS).
 *
 * Příklad: el('p', { class: 'muted' }, 'Ahoj ', el('strong', {}, 'světe'))
 */
export function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);

  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    element.setAttribute(name, value === true ? '' : value);
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : String(child));
  }

  return element;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Vytvoří SVG prvek (SVG potřebuje createElementNS, ne createElement). */
export function svgEl(tag, attrs = {}, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

/**
 * Znovu spustí CSS animaci dané třídy (např. příjezd další otázky).
 * Samotné přidání třídy, kterou prvek už má, by animaci nespustilo.
 */
export function replayAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;   // vynutí přepočet stylu, jinak by prohlížeč odebrání „nezaznamenal“
  element.classList.add(className);
}

/**
 * Zástupný obsah při načítání: šedé „blikající“ řádky místo textu Načítám….
 * Čtečka obrazovky dostane text, řádky jsou jen vizuální. Vkládá se do <p>,
 * proto jen <span> (CSS z nich dělá bloky).
 */
export function loadingPlaceholder(lines = 3) {
  return [
    el('span', { class: 'visually-hidden' }, 'Načítám…'),
    el('span', { class: 'skeleton', 'aria-hidden': 'true' },
      ...Array.from({ length: lines }, () => el('span', { class: 'skeleton__line' }))),
  ];
}

/**
 * Vlastní hláška „Vyber jednu odpověď“ místo bubliny prohlížeče.
 * Formulář dostane novalidate (prohlížeč pak sám nic neukazuje, required
 * u přepínačů zůstává kvůli čtečkám). Vrací funkci, která při odeslání
 * zkontroluje, že je odpověď vybraná; když ne, ukáže hlášku a vrátí false.
 * Hláška zmizí, jakmile hráč odpověď vybere.
 */
export function setupChoiceHint(form, hint) {
  form.noValidate = true;
  form.addEventListener('change', () => { hint.hidden = true; });

  return function hasChoice() {
    if (new FormData(form).get('answer') !== null) return true;
    hint.hidden = false;
    replayAnimation(hint, 'choice-hint--again');
    form.querySelector('input[name="answer"]')?.focus();
    return false;
  };
}

/** Zobrazí jednu sekci a ostatní ze seznamu skryje. */
export function showOnly(visible, all) {
  for (const section of all) {
    section.hidden = section !== visible;
  }
}
