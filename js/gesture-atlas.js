// Přehled všech gest s animacemi v pravidlech (pravidlo 30, pravidla.html#signalizace).
import { el } from './dom.js';
import { loadGestures, gestureSource } from './gesture-data.js';
import { createGesturePlayer } from './referee-figure.js';
import { showHashTarget } from './rules-page.js';

const container = document.getElementById('gesture-atlas');

function renderCard(gesture, data) {
  // id karty = kotva pro odkazy, např. pravidla.html#gesto-oddech
  return el('article', { class: 'gesture-card', id: `gesto-${gesture.id}` },
    createGesturePlayer(gesture, data.pozy, { autoplay: false }),
    el('h5', {}, gesture.nazev),
    el('p', {}, gesture.pohyb),
    gesture.vyznam ? el('p', { class: 'small muted' }, gesture.vyznam) : null,
    el('p', { class: 'small muted' }, gestureSource(gesture, data.skupiny)));
}

function renderGroup([groupId, group], data) {
  const gestures = data.gesta.filter(g => g.skupina === groupId);
  return [
    el('h4', { class: 'sub-heading' }, `${group.nazev} (FIVB diagram ${group.diagram})`),
    el('div', { class: 'gesture-grid' }, ...gestures.map(g => renderCard(g, data))),
  ];
}

loadGestures()
  .then(data => {
    container.replaceChildren(...Object.entries(data.skupiny).flatMap(group => renderGroup(group, data)));
    // Karty vznikly až teď, takže prohlížeč na kotvu z adresy ještě neskočil
    // (a pravidlo 30 je navíc sbalené).
    if (location.hash.startsWith('#gesto-')) showHashTarget();
  })
  .catch(error => {
    console.error(error);
    container.replaceChildren(el('p', { class: 'alert alert--error' },
      'Animace gest se nepodařilo načíst. Zkontroluj připojení a obnov stránku.'));
  });
