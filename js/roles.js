// Trénink podle role (Výuka, role.html): výběr role (zapisovatel, čárový,
// 2. a 1. rozhodčí) a k ní co má na starosti, co si přečíst, čím trénovat
// a které otázky procvičit. Obsah je v role/role.json, stránka jen
// rozcestník na existující hry a trenažéry (nic se neukládá).
import { el } from './dom.js';
import { categoryName } from './categories.js';

const picker = document.getElementById('role-picker');
const detail = document.getElementById('role-detail');
const errorBox = document.getElementById('role-error');

/** Seznam odkazů do pravidel. */
function readingList(links) {
  return el('ul', { class: 'lesson__links' },
    ...links.map(link => el('li', {}, el('a', { href: `pravidla.html#${link.kotva}` }, link.text))));
}

/** Hry a trenažéry pro roli jako dlaždice se stručným popisem. */
function trainingList(items) {
  return el('div', { class: 'news-list' },
    ...items.map(item => el('a', { class: 'news news--plain', href: item.href },
      el('span', { class: 'news__body' },
        el('span', { class: 'news__title' }, item.text),
        el('span', { class: 'news__text' }, item.popis)))));
}

/** Kategorie otázek – odkazy do Procvičování (dlaždice se zvýrazní). */
function questionLinks(categories) {
  return el('ul', { class: 'role-categories' },
    ...categories.map(id => el('li', {},
      el('a', { class: 'button button--secondary button--small', href: `procvicovani.html?kategorie=${encodeURIComponent(id)}` }, categoryName(id)))));
}

/** Detail vybrané role. */
function renderRole(role) {
  detail.replaceChildren(
    el('h2', { id: 'role-heading', tabindex: '-1' }, role.nazev),
    el('p', { class: 'muted' }, role.kde),
    el('section', { class: 'card stack' },
      el('h3', {}, 'Co má na starosti'),
      el('ul', { class: 'role-duties' }, ...role.ukoly.map(text => el('li', {}, text))),
      el('p', { class: 'lesson__label' }, 'Přečti si'),
      readingList(role.cist)),
    el('section', { class: 'stack' },
      el('h3', {}, 'Trénuj'),
      trainingList(role.trenink)),
    el('section', { class: 'stack' },
      el('h3', {}, 'Procvič otázky'),
      el('p', { class: 'small muted' }, 'Oblasti pravidel, které tahle role potřebuje nejvíc.'),
      questionLinks(role.kategorie)));
}

/** Vybere roli: zvýrazní dlaždici, ukáže detail a zapamatuje ji v adrese (#zapisovatel). */
function selectRole(roles, id, { focus = false } = {}) {
  const role = roles.find(r => r.id === id) ?? roles[0];
  for (const button of picker.querySelectorAll('[data-role]')) {
    button.setAttribute('aria-pressed', String(button.dataset.role === role.id));
  }
  renderRole(role);
  // replaceState = změní adresu bez nového záznamu v historii (tlačítko Zpět vede pryč ze stránky)
  history.replaceState(null, '', `#${role.id}`);
  if (focus) document.getElementById('role-heading').focus();
}

/** Dlaždice pro výběr role. */
function renderPicker(roles) {
  picker.replaceChildren(...roles.map(role => {
    const button = el('button', { class: 'practice-tile role-tile', type: 'button', 'data-role': role.id, 'aria-pressed': 'false' },
      el('span', { class: 'practice-tile__name' }, role.nazev),
      el('span', { class: 'practice-tile__meta' }, role.kratce));
    button.addEventListener('click', () => selectRole(roles, role.id, { focus: true }));
    return button;
  }));
}

fetch('role/role.json')
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(({ role: roles }) => {
    renderPicker(roles);
    selectRole(roles, location.hash.slice(1));
  })
  .catch(error => {
    console.error(error);
    errorBox.textContent = 'Obsah se nepodařilo načíst. Zkontroluj připojení a obnov stránku.';
    errorBox.hidden = false;
  });
