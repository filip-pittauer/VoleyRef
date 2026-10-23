// Vykreslení média u otázky (obrázek / video / animace).
import { el } from './dom.js';
import { createAnimationPlayer } from './animation.js';

/** Vrátí prvek s médiem, nebo null, když otázka žádné nemá. */
export function renderMedia(media) {
  if (!media) return null;

  switch (media.typ) {
    case 'obrazek':
      // obrázek se teprve připravuje → zatím rámeček s popisem („obrázek sítě“)
      if (!media.soubor) {
        return el('figure', { class: 'media media--placeholder' },
          el('span', { 'aria-hidden': 'true' }, '🖼️'), el('figcaption', {}, media.popis ?? 'obrázek'));
      }
      return el('figure', { class: 'media' },
        el('img', { src: media.soubor, alt: media.popis ?? '' }));

    case 'video':
      return el('figure', { class: 'media' },
        el('video', { src: media.soubor, controls: true, playsinline: true, preload: 'metadata' },
          media.popis ?? ''),
        media.popis ? el('figcaption', { class: 'visually-hidden' }, media.popis) : null);

    case 'animace':
      return renderAnimation(media);

    default:
      console.warn('Neznámý typ média:', media.typ);
      return null;
  }
}

/**
 * Animace se načítá ze samostatného JSON souboru. Funkce hned vrátí
 * zástupný prvek a animaci do něj vloží, až se data stáhnou.
 */
function renderAnimation(media) {
  const placeholder = el('div', { class: 'media anim-placeholder' }, 'Načítám animaci…');

  fetch(media.soubor)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => placeholder.replaceWith(createAnimationPlayer(data, media.popis)))
    .catch(error => {
      console.error('Animaci se nepodařilo načíst:', media.soubor, error);
      // záložní varianta: aspoň textový popis situace
      placeholder.textContent = media.popis ?? 'Animaci se nepodařilo načíst.';
    });

  return placeholder;
}
