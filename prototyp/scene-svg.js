// Prototyp – varianta A: situace v perspektivní SVG scéně bez knihovny
// (stejné kreslení jako trenažér postavení, js/court-scene.js).
import { svgEl } from '../js/dom.js';
import { add, scale, lerp } from '../js/math3d.js';
import {
  NEAR, num, createCamera, floorCircle, polygon, thick, disc, drawCourt, drawNet, bodyShape,
} from '../js/court-scene.js';

const TEAM = { A: 'receiving', B: 'serving' };
const UP = [0, 1, 0];

/** Části jedné postavy s hloubkou (seřadí se odzadu dopředu). */
function figureParts(cam, j, team) {
  const parts = [];
  const put = (item, depthPoint) => {
    if (!item) return;
    if (item.el) parts.push(item);
    else parts.push({ el: item, depth: cam.depth(depthPoint) });
  };
  const cls = TEAM[team];

  for (let i = 0; i < 2; i++) {
    const heel = add(j.ankles[i], scale(j.forward, -0.06));
    const toe = add(add(j.ankles[i], scale(j.forward, 0.18)), scale(UP, -0.03));
    put(thick(cam, heel, toe, 0.11, 'ct-shoe-line'));
    put(thick(cam, j.ankles[i], j.knees[i], 0.1, 'ct-skin'));
    put(thick(cam, j.ankles[i], lerp(j.ankles[i], j.knees[i], 0.3), 0.095, 'ct-sock'));
    put(thick(cam, j.knees[i], j.hips[i], 0.15, 'ct-skin'));
    put(thick(cam, j.hips[i], lerp(j.hips[i], j.knees[i], 0.35), 0.18, `ct-shorts-leg ct-shorts-leg--${cls}`));
  }
  const along = k => add(j.pelvis, scale(j.spine, k));
  put(bodyShape(cam, [
    { center: along(0.05), halfWidth: 0.17, halfDepth: 0.11 },
    { center: along(0.25), halfWidth: 0.155, halfDepth: 0.1 },
    { center: along(0.47), halfWidth: 0.2, halfDepth: 0.12 },
    { center: along(0.55), halfWidth: 0.17, halfDepth: 0.09 },
  ], j.forward, j.left, `ct-torso ct-torso--${cls}`), along(0.3));
  put(thick(cam, j.chest, j.neck, 0.09, 'ct-skin'));
  put(disc(cam, add(j.head, scale(j.forward, -0.03)), 0.105, 'ct-hair'));
  put(disc(cam, add(j.head, scale(j.forward, 0.01)), 0.095, 'ct-skin ct-head'));
  for (let i = 0; i < 2; i++) {
    put(thick(cam, j.shoulders[i], j.elbows[i], 0.09, 'ct-skin'));
    put(thick(cam, j.shoulders[i], lerp(j.shoulders[i], j.elbows[i], 0.5), 0.12, `ct-sleeve ct-sleeve--${cls}`));
    put(thick(cam, j.elbows[i], j.hands[i], 0.08, 'ct-skin'));
    put(disc(cam, j.hands[i], 0.05, 'ct-skin ct-hand'));
  }
  // vzdálenější části první; trup se kreslí jako celek
  return parts.sort((a, b) => b.depth - a.depth).map(p => p.el);
}

/** Číslo dresu na trupu (velikost podle vzdálenosti). */
function jerseyNumber(cam, j, number) {
  const p = cam.project(add(j.pelvis, scale(j.spine, 0.32)));
  if (p.depth < NEAR) return null;
  return svgEl('text', { x: num(p.x), y: num(p.y), 'font-size': num(0.2 / p.depth), class: 'ct-number' }, String(number));
}

/**
 * Vytvoří SVG scénu. Vrací { svg, setView(view), render(frame) }.
 * view = { eye, target, up?, bounds } – bounds = výřez [minX, minY, w, h] na plátně.
 */
export function createSvgScene() {
  const svg = svgEl('svg', { class: 'proto-svg', role: 'img', 'aria-label': 'Animace situace (SVG)' });
  let cam = null;
  let staticLayer = null;
  let netLayer = null;
  let netSide = 0;

  return {
    svg,
    setView(view) {
      cam = createCamera(view);
      const [x, y, w, h] = view.bounds;
      svg.setAttribute('viewBox', `${num(x)} ${num(y)} ${num(w)} ${num(h)}`);
      staticLayer = svgEl('g', {},
        svgEl('rect', { x: num(x), y: num(y), width: num(w), height: num(h), class: 'ct-wall' }),
        ...drawCourt(cam));
      netLayer = svgEl('g', {}, ...drawNet(cam));
      // na které straně sítě je oko (0 = skoro v rovině sítě)
      netSide = Math.abs(view.eye[0]) < 0.5 ? 0 : Math.sign(view.eye[0]);
    },
    render(frame) {
      const shadows = [];
      const people = frame.players.map(p => {
        const j = p.joints;
        const lift = Math.max(0, j.pelvis[1] - 1);
        const shadow = polygon(cam, floorCircle(j.pelvis[0], j.pelvis[2], 0.35 * (1 - Math.min(0.5, lift)), 0.005), 'proto-shadow');
        if (shadow) shadows.push(shadow);
        return {
          x: j.pelvis[0],
          depth: cam.depth(j.pelvis),
          el: svgEl('g', { class: 'ct-player' }, ...figureParts(cam, j, p.team), jerseyNumber(cam, j, p.number) ?? ''),
        };
      });
      const marks = [];
      for (const h of frame.highlights) {
        if (h.line) {
          const item = thick(cam, [h.line[0], 0.01, h.line[1]], [h.line[2], 0.01, h.line[3]], 0.07, 'proto-mark-line');
          if (item) marks.push(item.el);
        } else if (h.ring) {
          const ring = polygon(cam, floorCircle(h.ring[0], h.ring[1], 0.22, 0.012), 'proto-mark-ring');
          if (ring) marks.push(ring);
        }
      }
      if (frame.ball) {
        const b = frame.ball;
        const shadow = polygon(cam, floorCircle(b[0], b[2], 0.1, 0.006), 'proto-shadow');
        if (shadow) shadows.push(shadow);
        const ball = disc(cam, b, 0.105, 'ct-ball');
        if (ball) people.push({ x: b[0], depth: ball.depth, el: ball.el });
      }

      // odzadu dopředu; síť mezi hráči za ní a před ní (z pohledu oka)
      const byDepth = list => list.sort((a, b) => b.depth - a.depth).map(p => p.el);
      const behind = netSide === 0 ? [] : people.filter(p => Math.sign(p.x) !== netSide);
      const front = netSide === 0 ? people : people.filter(p => Math.sign(p.x) === netSide);
      const order = netSide === 0 ? [netLayer, ...byDepth(front)] : [...byDepth(behind), netLayer, ...byDepth(front)];
      svg.replaceChildren(staticLayer, ...marks, ...shadows, ...order);
    },
  };
}
