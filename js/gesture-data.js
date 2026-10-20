// Data gest rozhodčích (gesta/gesta.json) – stáhnou se jen jednou za návštěvu stránky.
import { el } from './dom.js';

let request = null;

/** Vrátí Promise s obsahem gesta/gesta.json ({ skupiny, pozy, gesta }). */
export function loadGestures() {
  request ??= fetch('gesta/gesta.json')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .catch(error => {
      request = null;   // příště to zkusit znovu
      throw error;
    });
  return request;
}

/** Řádek „kdo ukazuje · diagram · pravidla“ pod popisem gesta. */
export function gestureSource(gesture, groups) {
  const diagram = `FIVB diagram ${groups[gesture.skupina].diagram}, č. ${gesture.cislo}`;
  return [
    `Ukazuje: ${gesture.kdo}`,
    diagram,
    gesture.pravidla ? `pravidla ${gesture.pravidla}` : null,
  ].filter(Boolean).join(' · ');
}

/** Popis gesta: význam (pokud je), jak se ukazuje a odkud to je. */
export function gestureDetails(gesture, groups) {
  return [
    gesture.vyznam ? el('p', {}, gesture.vyznam) : null,
    el('p', { class: 'result__explanation' }, el('strong', {}, 'Jak se ukazuje: '), gesture.pohyb),
    el('p', { class: 'result__rule' }, gestureSource(gesture, groups)),
  ];
}
