// Vykreslení média u otázky (obrázek / video / animace).
import { el } from './dom.js';

/** Vrátí prvek s médiem, nebo null, když otázka žádné nemá. */
export function renderMedia(media) {
  if (!media) return null;

  switch (media.typ) {
    case 'obrazek':
      return el('figure', { class: 'media' },
        el('img', { src: media.soubor, alt: media.popis ?? '' }));

    case 'video':
      return el('figure', { class: 'media' },
        el('video', { src: media.soubor, controls: true, playsinline: true, preload: 'metadata' },
          media.popis ?? ''),
        media.popis ? el('figcaption', { class: 'visually-hidden' }, media.popis) : null);

    default:
      console.warn('Neznámý typ média:', media.typ);
      return null;
  }
}
