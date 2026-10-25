// Výsledek kola: skóre v kruhu úspěšnosti, které se „napočítá“ jako na ukazateli
// v hale, a při dobrém výsledku stuhy ze spodních rohů obrazovky (jako
// konfetová děla na stadionu) v barvách webu. Používá kvíz i kvíz gest.
// Při omezeném pohybu (nastavení systému) se ukáže jen výsledný stav.
import { el, svgEl } from './dom.js';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const COUNT_MS = 1100;

/** Od jakého podílu správných odpovědí vystřelí stuhy. */
const RIBBONS_FROM = 0.6;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Úroveň výsledku podle podílu správných – určuje barvu kruhu. */
function levelOf(ratio) {
  if (ratio === 1) return 'perfect';
  return ratio >= RIBBONS_FROM ? 'good' : 'base';
}

/**
 * Skóre v kruhu úspěšnosti. Čtečka obrazovky dostane hned konečné skóre
 * (aria-label), animované číslo je jen vizuální.
 */
export function createScore(score, total) {
  const ratio = total ? score / total : 0;
  const bar = svgEl('circle', { class: 'score-ring__bar', cx: 60, cy: 60, r: RADIUS,
    'stroke-dasharray': CIRCUMFERENCE, 'stroke-dashoffset': CIRCUMFERENCE });
  const count = el('span', { class: 'score-ring__count' }, String(score));
  const ring = el('div', { class: `score-ring score-ring--${levelOf(ratio)}`, role: 'img',
    'aria-label': `Skóre ${score} z ${total}` },
    svgEl('svg', { class: 'score-ring__svg', viewBox: '0 0 120 120', 'aria-hidden': 'true' },
      svgEl('circle', { class: 'score-ring__track', cx: 60, cy: 60, r: RADIUS }), bar),
    el('p', { class: 'score score-ring__value', 'aria-hidden': 'true' },
      count, el('span', { class: 'score-ring__total' }, ` / ${total}`)));

  ring.dataset.score = score;
  ring.dataset.total = total;
  return ring;
}

/**
 * Spustí animaci skóre (musí už být na stránce) a případně stuhy.
 * ribbons: false = bez stuh (např. nesplněná zkouška, i když má přes 60 %).
 */
export function celebrate(ring, { ribbons = true } = {}) {
  const score = Number(ring.dataset.score);
  const total = Number(ring.dataset.total);
  const ratio = total ? score / total : 0;
  const bar = ring.querySelector('.score-ring__bar');
  const count = ring.querySelector('.score-ring__count');
  const target = CIRCUMFERENCE * (1 - ratio);

  if (reducedMotion()) {
    bar.setAttribute('stroke-dashoffset', target);
    return;
  }

  // Kruh: CSS transition z prázdného na cílovou délku. Hodnotu měníme až
  // v dalším snímku, jinak by prohlížeč přechod „přeskočil“.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ring.classList.add('score-ring--animate');
    bar.setAttribute('stroke-dashoffset', target);
  }));

  // Číslo: 0 → skóre se zpomalením ke konci (jako ukazatel skóre).
  const start = performance.now();
  const tick = now => {
    const t = Math.min(1, (now - start) / COUNT_MS);
    count.textContent = String(Math.round(score * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(tick);
    else ring.classList.add('score-ring--done');
  };
  count.textContent = '0';
  requestAnimationFrame(tick);

  if (ribbons && ratio >= RIBBONS_FROM) {
    // stuhy vystřelí, až kruh skoro doběhne
    setTimeout(() => launchRibbons({ count: ratio === 1 ? 150 : 80, gold: ratio === 1 }), COUNT_MS * 0.7);
  }
}

// ---------- Stuhy ----------
const COLORS = ['#0b2a5b', '#d61f2c', '#ffffff', '#1a4fa0'];
const GOLD = '#e3b341';
const DURATION_MS = 2800;

/** Jedna stuha vystřelená z rohu (left = levé dělo). */
function createRibbon(width, height, left, colors) {
  const angle = (left ? -1 : 1) * (0.32 + Math.random() * 0.38);   // odklon od svislice směrem do středu
  const speed = height * (1.25 + Math.random() * 0.55);            // px/s – doletí zhruba do 2/3 výšky
  return {
    x: left ? 0 : width,
    y: height,
    vx: -Math.sin(angle) * speed,
    vy: -Math.cos(angle) * speed,
    w: 4 + Math.random() * 3,
    h: 10 + Math.random() * 10,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 10,
    flutter: Math.random() * Math.PI * 2,   // fáze „převracení“ stuhy ve vzduchu
    color: colors[Math.floor(Math.random() * colors.length)],
  };
}

/**
 * Stuhy přes celou obrazovku na <canvas> (stovky prvků by v DOM/SVG zpomalily
 * stránku). Jednoduchá fyzika: výstřel, odpor vzduchu, gravitace; po
 * DURATION_MS canvas zmizí.
 */
function launchRibbons({ count, gold }) {
  const canvas = el('canvas', { class: 'ribbons', 'aria-hidden': 'true' });
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = innerWidth;
  const height = innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);   // ostré i na displejích s vyšší hustotou pixelů (kreslí se v CSS px)

  const colors = gold ? [...COLORS, GOLD, GOLD] : COLORS;
  const gravity = height * 1.6;   // px/s²
  const ribbons = Array.from({ length: count }, (_, i) => createRibbon(width, height, i % 2 === 0, colors));
  const start = performance.now();
  let last = start;

  // jeden snímek animace; dt = čas od minulého snímku (max 50 ms – po
  // přepnutí karty prohlížeče by stuhy jinak „poskočily“)
  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const elapsed = now - start;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.min(1, (DURATION_MS - elapsed) / 600);   // na konci vybledne

    for (const r of ribbons) {
      // odpor vzduchu: stuha rychle zpomalí a pak se snáší
      r.vx *= 1 - 1.4 * dt;
      r.vy = r.vy * (1 - 1.4 * dt) + gravity * dt * 0.55;
      r.x += r.vx * dt + Math.sin(r.flutter) * 0.6;
      r.y += r.vy * dt;
      r.rotation += r.spin * dt;
      r.flutter += 7 * dt;

      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.rotation);
      ctx.scale(1, Math.cos(r.flutter));   // převracení – stuha se „blýská“
      ctx.fillStyle = r.color;
      ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
      if (r.color === '#ffffff') {   // bílá stuha by na světlém pozadí zmizela
        ctx.strokeStyle = 'rgba(11, 42, 91, 0.35)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);
      }
      ctx.restore();
    }

    if (elapsed < DURATION_MS) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
