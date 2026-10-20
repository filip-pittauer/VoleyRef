// SVG animace herní situace řízená daty (formát viz animace/README.md).
//
// Souřadnice jsou v metrech: x = 0–18 po délce hřiště (síť na x = 9),
// y = 0–9 po šířce, z = výška nad zemí (míč, výskok hráče).
// SVG má viewBox přímo v metrech, takže data není potřeba přepočítávat.
import { svgEl } from './dom.js';
import { createPlayer } from './player.js';

// ---------- Výpočet polohy v čase ----------
/**
 * Poloha na dráze v čase t (lineární interpolace mezi klíčovými body).
 * track = [[t, x, y, z?], ...] seřazené podle času. Vrací [x, y, z].
 */
export function sample(track, t) {
  const point = p => [p[1], p[2], p[3] ?? 0];
  if (t <= track[0][0]) return point(track[0]);

  for (let i = 1; i < track.length; i++) {
    const [t1] = track[i];
    if (t <= t1) {
      const [t0] = track[i - 1];
      const ratio = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      const a = point(track[i - 1]);
      const b = point(track[i]);
      return a.map((value, k) => value + (b[k] - value) * ratio);
    }
  }
  return point(track[track.length - 1]);
}

// ---------- Hřiště ----------
function drawCourt() {
  return svgEl('g', { class: 'anim-court' },
    svgEl('rect', { class: 'anim-free', x: -3, y: -2.5, width: 24, height: 14, rx: 0.5 }),
    svgEl('rect', { class: 'anim-floor', x: 0, y: 0, width: 18, height: 9 }),
    svgEl('line', { class: 'anim-line', x1: 6, y1: 0, x2: 6, y2: 9 }),
    svgEl('line', { class: 'anim-line', x1: 12, y1: 0, x2: 12, y2: 9 }),
    svgEl('line', { class: 'anim-net', x1: 9, y1: -0.6, x2: 9, y2: 9.6 }),
    svgEl('circle', { class: 'anim-antenna', cx: 9, cy: 0, r: 0.12 }),
    svgEl('circle', { class: 'anim-antenna', cx: 9, cy: 9, r: 0.12 }));
}

// ---------- Vykreslení jednoho okamžiku ----------
function createScene(data) {
  const svg = svgEl('svg', { viewBox: '-3 -2.5 24 14', role: 'img' });
  svg.append(drawCourt());

  const highlights = (data.zvyrazneni ?? []).map(h => ({
    ...h,
    node: svg.appendChild(svgEl('line', { class: 'anim-highlight', x1: h.x1, y1: h.y1, x2: h.x2, y2: h.y2 })),
  }));

  const players = data.hraci.map(p => {
    const circle = svgEl('circle', { r: 0.6 });
    const label = svgEl('text', {}, String(p.cislo ?? ''));
    const node = svgEl('g', { class: `anim-player anim-team-${p.tym.toLowerCase()}` }, circle, label);
    svg.append(node);
    return { ...p, node, circle };
  });

  const ballShadow = svg.appendChild(svgEl('ellipse', { class: 'anim-ball-shadow', rx: 0.26, ry: 0.14 }));
  const ball = svg.appendChild(svgEl('circle', { class: 'anim-ball', r: 0.28 }));

  /** Nastaví všechny prvky do stavu v čase t. */
  return {
    svg,
    render(t) {
      for (const h of highlights) {
        h.node.style.opacity = t >= (h.od ?? 0) && t <= (h.do ?? Infinity) ? 1 : 0;
      }
      for (const p of players) {
        const [x, y, z] = sample(p.pozice, t);
        // výskok: hráč se zvětší (pohled shora – blíž ke kameře)
        p.node.setAttribute('transform', `translate(${x} ${y}) scale(${1 + z * 0.3})`);
      }
      if (data.mic) {
        const [x, y, z] = sample(data.mic, t);
        ballShadow.setAttribute('cx', x);
        ballShadow.setAttribute('cy', y);
        // míč ve výšce: posun nahoru a větší (jednoduchá perspektiva)
        ball.setAttribute('cx', x);
        ball.setAttribute('cy', y - z * 0.25);
        ball.setAttribute('r', 0.28 * (1 + z * 0.12));
      }
    },
  };
}

function captionAt(data, t) {
  return (data.texty ?? []).find(c => t >= c.od && t <= c.do)?.text ?? '';
}

// ---------- Přehrávač ----------
/** Vytvoří přehrávač animace. data = obsah JSON souboru, description = alt text. */
export function createAnimationPlayer(data, description) {
  const scene = createScene(data);
  scene.svg.setAttribute('aria-label', description ?? 'Animace herní situace');
  return createPlayer(scene, { duration: data.delka, className: 'anim', captionAt: t => captionAt(data, t) });
}
