// Co je nového v pravidlech 2025–2028 (Výuka, zmeny.html): karty změn
// „dřív / teď / co to znamená pro rozhodčího“ z zmeny/zmeny.json.
// Filtr nahoře přepíná všechny změny / jen zásadní (mění hru).
import { el } from './dom.js';

const list = document.getElementById('changes-list');
const trials = document.getElementById('changes-trials');
const filter = document.getElementById('changes-filter');
const errorBox = document.getElementById('changes-error');

const WEIGHT = {
  zasadni: 'Mění hru',
  upresneni: 'Upřesnění',
};

/** Jedna změna: štítek, název, čísla pravidel, dřív/teď a dopad pro rozhodčího. */
function renderChange(change) {
  return el('li', { class: `change card stack change--${change.vaha}`, id: change.id },
    el('p', { class: 'change__meta' },
      el('span', { class: 'change__badge' }, WEIGHT[change.vaha] ?? change.vaha),
      ` Pravidlo ${change.pravidla}`),
    el('h2', { class: 'change__title' }, change.nazev),
    el('div', { class: 'change__compare' },
      el('div', { class: 'change__before' }, el('p', { class: 'change__label' }, 'Dřív (2021–2024)'), el('p', {}, change.driv)),
      el('div', { class: 'change__after' }, el('p', { class: 'change__label' }, 'Teď (2025–2028)'), el('p', {}, change.ted))),
    el('p', {}, el('strong', {}, 'Pro rozhodčího: '), change.rozhodci),
    el('p', { class: 'change__links small' },
      ...change.odkazy.flatMap((link, i) => [i ? ' · ' : '', el('a', { href: `pravidla.html#${link.kotva}` }, link.text)])));
}

/** Vykreslí změny podle filtru (všechny / jen zásadní). */
function render(changes) {
  const onlyMajor = filter.value === 'zasadni';
  list.replaceChildren(...changes.filter(c => !onlyMajor || c.vaha === 'zasadni').map(renderChange));
}

fetch('zmeny/zmeny.json')
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(data => {
    render(data.zmeny);
    filter.addEventListener('change', () => render(data.zmeny));
    trials.replaceChildren(...data.pokusy.map(trial =>
      el('li', {}, el('strong', {}, `${trial.nazev}. `), trial.text)));
    // odkaz zmeny.html#ruce-nad-hlavou: karta vznikla až teď, prohlížeč na ni sám neodroloval
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  })
  .catch(error => {
    console.error(error);
    errorBox.textContent = 'Přehled změn se nepodařilo načíst. Zkontroluj připojení a obnov stránku.';
    errorBox.hidden = false;
  });
