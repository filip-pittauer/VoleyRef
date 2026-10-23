// Vykreslení média u otázky (obrázek / video / animace / scéna postavení).
import { el, svgEl } from './dom.js';
import { createAnimationPlayer } from './animation.js';
import { renderScene } from './court-scene.js';
import { situationFromData } from './lineup-logic.js';

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
      if (media.soubor.endsWith('.svg')) return renderInlineSvg(media);
      return el('figure', { class: 'media' },
        el('img', { src: media.soubor, alt: media.popis ?? '' }));

    case 'video':
      return el('figure', { class: 'media' },
        el('video', { src: media.soubor, controls: true, playsinline: true, preload: 'metadata' },
          media.popis ?? ''),
        media.popis ? el('figcaption', { class: 'visually-hidden' }, media.popis) : null);

    case 'animace':
      return renderAnimation(media);

    case 'postaveni':
      return renderLineup(media);

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

/**
 * SVG obrázek (img/otazky/*.svg) se vloží přímo do stránky, ne přes <img>:
 * jen tak na něj platí CSS webu (třídy dg-* jako diagramy v pravidlech,
 * barvy pro tmavý režim). Soubory jsou naše, ne od uživatelů.
 */
function renderInlineSvg(media) {
  const figure = el('figure', { class: 'media media--diagram' }, el('p', { class: 'muted small' }, 'Načítám obrázek…'));

  fetch(media.soubor)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then(text => {
      // DOMParser = převod textu na dokument (jako XmlDocument.LoadXml v C#)
      const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
      if (svg.nodeName !== 'svg') throw new Error('Soubor není SVG.');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', media.popis ?? '');
      figure.replaceChildren(document.importNode(svg, true));
    })
    .catch(error => {
      console.error('Obrázek se nepodařilo načíst:', media.soubor, error);
      figure.replaceChildren(el('figcaption', {}, media.popis ?? 'Obrázek se nepodařilo načíst.'));
      figure.classList.add('media--placeholder');
    });

  return figure;
}

/**
 * Scéna postavení (jako v trenažéru) z dat otázky:
 * { typ: "postaveni", pohled: "ref1" | "ref2" | "top", hraci: [{ pozice, cislo, x, z }], popis }
 */
function renderLineup(media) {
  const svg = svgEl('svg', { class: 'court-scene', role: 'img', 'aria-label': media.popis ?? 'Postavení hráčů' });
  renderScene(svg, situationFromData(media), { view: media.pohled ?? 'ref1' });
  // zápis postavení (pozice → číslo dresu), jako má rozhodčí na kartě sestavy
  const lineup = [...media.hraci].sort((a, b) => a.pozice - b.pozice)
    .map(h => `P${h.pozice} č. ${h.cislo}`).join(' · ');
  return el('figure', { class: 'media scene-wrap media--scene' }, svg,
    el('figcaption', { class: 'small muted' }, `Zápis: ${lineup}`));
}
