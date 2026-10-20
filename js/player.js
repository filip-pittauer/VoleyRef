// Přehrávač animace s ovládáním (přehrát / pauza, posuvník času).
// Používají ho animace herních situací (animation.js) i gesta rozhodčích.
import { el } from './dom.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * scene = { svg, render(t) } – SVG a funkce, která ho překreslí do času t.
 * Možnosti:
 *  - duration: délka animace v sekundách
 *  - className: CSS třída obalu (<figure>)
 *  - captionAt: t → popisek pod animací (bez ní se popisek nezobrazuje)
 *  - posterTime: okamžik, který je vidět, když se animace nespustí sama
 *  - autoplay: spustit hned po zobrazení (ne při nastavení „omezit pohyb“)
 */
export function createPlayer(scene, { duration, className, captionAt = null, posterTime = 0, autoplay = true }) {
  const caption = captionAt ? el('p', { class: 'anim__caption', 'aria-live': 'polite' }) : null;
  const playButton = el('button', { class: 'button button--small', type: 'button' });
  const slider = el('input', {
    type: 'range', min: 0, max: duration, step: 0.05, value: 0,
    'aria-label': 'Čas animace', class: 'anim__slider',
  });

  const startsPlaying = autoplay && !reduceMotion;
  let time = startsPlaying ? 0 : posterTime;
  let playing = false;
  let lastFrame = null;
  // Náhled může ukazovat konec animace – první „Přehrát“ přesto začne od začátku.
  let fromStart = !startsPlaying;

  function update() {
    scene.render(time);
    slider.value = time;
    if (caption) {
      const text = captionAt(time);
      if (caption.textContent !== text) caption.textContent = text;
    }
    playButton.textContent = playing ? '⏸ Pauza'
      : time >= duration && !fromStart ? '↺ Znovu' : '▶ Přehrát';
  }

  // requestAnimationFrame: prohlížeč zavolá funkci před dalším vykreslením
  // (cca 60× za sekundu) – plynulejší a úspornější než setInterval.
  function frame(now) {
    if (!playing) return;
    if (!scene.svg.isConnected && lastFrame !== null) {   // prvek zmizel ze stránky → konec
      playing = false;
      return;
    }
    if (lastFrame !== null) time = Math.min(duration, time + (now - lastFrame) / 1000);
    lastFrame = now;
    if (time >= duration) playing = false;
    update();
    if (playing) requestAnimationFrame(frame);
  }

  function play() {
    if (time >= duration || fromStart) time = 0;
    fromStart = false;
    playing = true;
    lastFrame = null;
    requestAnimationFrame(frame);
  }

  function pause() {
    playing = false;
    update();
  }

  playButton.addEventListener('click', () => (playing ? pause() : play()));
  slider.addEventListener('input', () => {
    playing = false;
    fromStart = false;
    time = Number(slider.value);
    update();
  });

  update();
  if (startsPlaying) play();

  return el('figure', { class: `media ${className}` },
    scene.svg,
    caption,
    el('div', { class: 'anim__controls' }, playButton, slider));
}
