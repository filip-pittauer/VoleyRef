// 3D scéna trenažéru postavení: hřiště, síť a hráči nakreslení do SVG
// z pohledu 1. rozhodčího, 2. rozhodčího nebo shora.
//
// Svět je v metrech, stejné souřadnice jako v lineup-logic.js: x od sítě do pole
// přijímajícího týmu (podávající tým má záporné x), y nahoru, z napříč hřištěm
// (kladné = vlevo z pohledu přijímajících). Každý bod se promítne perspektivní
// kamerou a části se kreslí odzadu dopředu (malířův algoritmus).
import { svgEl } from './dom.js';
import { add, sub, scale, lerp, createPerspective, clipNear } from './math3d.js';
import { COURT, FOOT_SIZE, footprint } from './lineup-logic.js';

const NET = { top: 2.43, bottom: 1.43, halfLength: 5, postZ: 5.5, postTop: 2.55, antennaZ: 4.55, antennaTop: 3.23 };
const NEAR = 0.3;          // rovina těsně před okem, co je blíž, se ořízne
const ASPECT = 4 / 3;      // poměr stran obrazu

/** Pohledy: oko a místo, kam se dívá. Výřez se spočítá z bodů frame. */
export const VIEWS = {
  ref1: {
    label: '1. rozhodčí',
    // stojí na stupínku u sloupku, oči asi 50 cm nad horním okrajem sítě
    eye: [0, NET.top + 0.5, -(NET.postZ + 0.45)],
    target: [4.3, 0.2, 1.2],
    frame: corners([0.4, 9], [-4.3, 4.5], [0, 1.9]),
  },
  ref2: {
    label: '2. rozhodčí',
    // stojí u sloupku na straně přijímajícího týmu
    eye: [0.9, 1.65, NET.postZ + 0.4],
    target: [4.4, 0.4, -1.2],
    frame: corners([0.4, 9], [-4.5, 4.3], [0, 1.9]),
  },
  top: {
    label: 'Shora',
    eye: [4.5, 40, 0],
    target: [4.5, 0, 0],
    up: [-1, 0, 0],          // síť nahoře, pozice 4 a 5 vlevo
    frame: corners([-0.7, 9.6], [-5.2, 5.2], [0]),
  },
};

function corners(xs, zs, ys) {
  return xs.flatMap(x => zs.flatMap(z => ys.map(y => [x, y, z])));
}

// ---------- Pomocné funkce pro SVG ----------
const num = n => String(Math.round(n * 10000) / 10000);

function createCamera(view) {
  const camera = createPerspective(view.eye, view.target, view.up);
  const project = camera.project;

  /** Mnohoúhelník ve světě → atribut d (nebo null, když je celý za okem). */
  const pathOf = points => {
    const clipped = clipNear(points.map(camera.toCamera), NEAR);
    if (clipped.length < 3) return null;
    return `M${clipped.map(camera.fromCamera).map(p => `${num(p.x)} ${num(p.y)}`).join('L')}Z`;
  };

  return { ...camera, project, pathOf, depth: p => camera.toCamera(p)[2] };
}

/** Obdélník na podlaze (x od–do, z od–do) jako body ve světě. */
const floorRect = (x1, x2, z1, z2, y = 0) => [[x1, y, z1], [x2, y, z1], [x2, y, z2], [x1, y, z2]];

/** Kruh na podlaze kolem bodu (pro výběr hráče). */
function floorCircle(cx, cz, r, y = 0.01) {
  return Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
  });
}

function polygon(cam, points, cls) {
  const d = cam.pathOf(points);
  return d && svgEl('path', { d, class: cls });
}

/** Tlustá čára mezi body ve světě; tloušťka v metrech se zmenšuje se vzdáleností. */
function thick(cam, a, b, width, cls) {
  const pa = cam.project(a), pb = cam.project(b);
  if (pa.depth < NEAR || pb.depth < NEAR) return null;
  return {
    depth: (pa.depth + pb.depth) / 2,
    el: svgEl('line', {
      x1: num(pa.x), y1: num(pa.y), x2: num(pb.x), y2: num(pb.y),
      class: cls, 'stroke-width': num(width * 2 / (pa.depth + pb.depth)),
    }),
  };
}

function disc(cam, center, radius, cls) {
  const p = cam.project(center);
  if (p.depth < NEAR) return null;
  return { depth: p.depth, el: svgEl('circle', { cx: num(p.x), cy: num(p.y), r: num(radius / p.depth), class: cls }) };
}

// ---------- Hřiště a síť ----------
function drawCourt(cam) {
  const L = COURT.length, W = COURT.halfWidth, line = 0.05;
  const parts = [
    polygon(cam, floorRect(-L - 7, L + 7, -W - 6, W + 6), 'ct-free'),
    polygon(cam, floorRect(-L, L, -W, W), 'ct-court'),
  ];
  // čáry jsou široké 5 cm a leží uvnitř rozměrů hřiště
  const lines = [
    floorRect(L - line, L, -W, W), floorRect(-L, -L + line, -W, W),        // koncové
    floorRect(-L, L, W - line, W), floorRect(-L, L, -W, -W + line),        // postranní
    floorRect(-line / 2, line / 2, -W, W),                                  // střední
    floorRect(3 - line, 3, -W, W), floorRect(-3, -3 + line, -W, W),        // útočné (zadní hrana 3 m od osy)
  ];
  for (const rect of lines) parts.push(polygon(cam, rect, 'ct-line'));
  return parts.filter(Boolean);
}

function drawNet(cam) {
  const { top, bottom, halfLength: H, postZ, postTop, antennaZ, antennaTop } = NET;
  const parts = [];
  parts.push(thick(cam, [0, 0, postZ], [0, postTop, postZ], 0.1, 'ct-post'));
  parts.push(thick(cam, [0, 0, -postZ], [0, postTop, -postZ], 0.1, 'ct-post'));
  const mesh = polygon(cam, [[0, bottom, -H], [0, bottom, H], [0, top, H], [0, top, -H]], 'ct-mesh');
  if (mesh) parts.push({ el: mesh });
  for (let z = -H; z <= H + 1e-6; z += 0.25) parts.push(thick(cam, [0, bottom, z], [0, top, z], 0.006, 'ct-mesh-line'));
  for (let y = bottom; y <= top; y += 0.2) parts.push(thick(cam, [0, y, -H], [0, y, H], 0.006, 'ct-mesh-line'));
  const band = polygon(cam, [[0, top - 0.07, -H], [0, top - 0.07, H], [0, top, H], [0, top, -H]], 'ct-band');
  if (band) parts.push({ el: band });
  parts.push(thick(cam, [0, top - 0.035, -postZ], [0, top - 0.035, postZ], 0.012, 'ct-cord'));
  for (const side of [1, -1]) {
    const band2 = polygon(cam, [[0, bottom, side * 4.45], [0, bottom, side * 4.5], [0, top, side * 4.5], [0, top, side * 4.45]], 'ct-band');
    if (band2) parts.push({ el: band2 });
    // anténa: nad sítí 80 cm pruhů po 10 cm
    parts.push(thick(cam, [0, bottom, side * antennaZ], [0, top, side * antennaZ], 0.02, 'ct-antenna'));
    for (let i = 0; i < 8; i++) {
      const y1 = top + i * 0.1, y2 = y1 + 0.1;
      parts.push(thick(cam, [0, y1, side * antennaZ], [0, Math.min(y2, antennaTop), side * antennaZ], 0.02,
        i % 2 ? 'ct-antenna' : 'ct-antenna ct-antenna--red'));
    }
  }
  return parts.filter(Boolean).map(p => p.el);
}

// ---------- Hráči ----------
const UP = [0, 1, 0];
const world = (x, z, y = 0) => [x, y, z];

/** Postava hráče ve 3D (perspektivní pohled): seznam částí s hloubkou. */
function playerParts(cam, player, team) {
  // přijímající se dívají k síti (−x), podávající taky k síti (+x)
  const forward = team === 'receiving' ? [-1, 0, 0] : [1, 0, 0];
  const left = team === 'receiving' ? [0, 0, 1] : [0, 0, -1];
  const [footL, footR] = player.feet.map(f => world(f.x, f.z));
  const mid = lerp(footL, footR, 0.5);
  const upright = player.server ? 1 : 0;     // podávající stojí rovně, ostatní v pozoru na příjem
  const bend = 1 - upright;

  const hip = add(add(mid, scale(UP, 0.84 + 0.1 * upright)), scale(forward, -0.05 * bend));
  const shoulder = add(add(hip, scale(UP, 0.5 + 0.04 * upright)), scale(forward, 0.16 * bend));
  const head = add(add(shoulder, scale(UP, 0.22)), scale(forward, 0.05 * bend));
  const parts = [];
  const push = item => { if (item) parts.push(item); };

  // boty (na podlaze, přesně podle dat – podle nich se postavení posuzuje)
  for (const foot of [footL, footR]) {
    const toe = scale(forward, FOOT_SIZE.length / 2), side = scale(left, FOOT_SIZE.width / 2);
    const shoe = [add(add(foot, toe), side), add(sub(foot, toe), side), sub(sub(foot, toe), side), sub(add(foot, toe), side)];
    const d = cam.pathOf(shoe);
    if (d) push({ depth: cam.depth(foot) + 0.05, el: svgEl('path', { d, class: 'ct-shoe' }) });
  }

  for (const [foot, sideSign] of [[footL, 1], [footR, -1]]) {
    const ankle = add(add(foot, scale(UP, 0.09)), scale(forward, -0.04));
    const knee = add(add(add(ankle, scale(UP, 0.4 + 0.05 * upright)), scale(forward, 0.15 * bend)), scale(left, 0.03 * sideSign));
    const hipSide = add(hip, scale(left, 0.1 * sideSign));
    push(thick(cam, ankle, knee, 0.11, 'ct-skin'));
    push(thick(cam, knee, hipSide, 0.14, 'ct-skin'));
    push(thick(cam, lerp(hipSide, knee, 0.45), hipSide, 0.17, `ct-shorts ct-shorts--${team}`));
  }

  push(thick(cam, add(hip, scale(UP, -0.05)), add(hip, scale(UP, 0.1)), 0.36, `ct-shorts ct-shorts--${team}`));
  push(thick(cam, add(hip, scale(UP, 0.08)), shoulder, 0.36, `ct-jersey ct-jersey--${team}`));

  for (const sideSign of [1, -1]) {
    const shoulderSide = add(shoulder, scale(left, 0.19 * sideSign));
    const hand = player.server && sideSign === 1
      ? add(add(shoulder, scale(UP, -0.05)), add(scale(forward, 0.34), scale(left, 0.05)))
      : add(add(hip, scale(UP, 0.12 + 0.2 * upright)), add(scale(forward, 0.36 - 0.26 * upright), scale(left, (0.11 + 0.1 * upright) * sideSign)));
    const elbow = add(lerp(shoulderSide, hand, 0.5), add(scale(UP, -0.1), scale(left, 0.04 * sideSign)));
    push(thick(cam, shoulderSide, elbow, 0.1, `ct-jersey ct-jersey--${team}`));
    push(thick(cam, elbow, hand, 0.08, 'ct-skin'));
  }
  if (player.server) push(disc(cam, add(add(shoulder, scale(UP, -0.02)), scale(forward, 0.42)), 0.105, 'ct-ball'));

  push(disc(cam, head, 0.11, 'ct-skin ct-head'));

  // číslo dresu: vždy čelem k divákovi, aby šlo přečíst
  const label = cam.project(lerp(hip, shoulder, 0.55));
  if (label.depth > NEAR) {
    parts.push({
      depth: label.depth - 0.2,     // vždy nad trupem
      el: svgEl('text', { x: num(label.x), y: num(label.y), 'font-size': num(Math.max(0.2 / label.depth, cam.minFont)), class: 'ct-number' }, String(player.jersey)),
    });
  }
  return parts;
}

/** Hráč při pohledu shora: chodidla, průsvitné tělo a číslo. */
function playerPartsTop(cam, player, team) {
  const parts = [];
  for (const f of player.feet) {
    const foot = world(f.x, f.z);
    const d = cam.pathOf(floorRect(f.x - FOOT_SIZE.length / 2, f.x + FOOT_SIZE.length / 2, f.z - FOOT_SIZE.width / 2, f.z + FOOT_SIZE.width / 2));
    if (d) parts.push({ depth: cam.depth(foot), el: svgEl('path', { d, class: 'ct-shoe ct-shoe--top' }) });
  }
  const box = footprint(player.feet);
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
  const body = cam.pathOf(floorCircle(cx, cz, 0.3, 0.02));
  if (body) parts.push({ depth: 0, el: svgEl('path', { d: body, class: `ct-body-top ct-jersey--${team}` }) });
  const label = cam.project(world(cx, cz, 0.03));
  parts.push({ depth: -1, el: svgEl('text', { x: num(label.x), y: num(label.y), 'font-size': num(0.32 / label.depth), class: 'ct-number' }, String(player.jersey)) });
  if (player.position) {
    const below = cam.project(world(cx + 0.48, cz, 0.03));
    parts.push({ depth: -1, el: svgEl('text', { x: num(below.x), y: num(below.y), 'font-size': num(0.22 / below.depth), class: 'ct-position' }, `P${player.position}`) });
  }
  return parts;
}

function centerOf(player) {
  const box = footprint(player.feet);
  return [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2];
}

function drawPlayer(cam, player, team, isTop, attrs = {}) {
  const parts = (isTop ? playerPartsTop : playerParts)(cam, player, team).sort((a, b) => b.depth - a.depth);
  return svgEl('g', { class: `ct-player ct-player--${team}`, ...attrs }, ...parts.map(p => p.el));
}

// ---------- Vyhodnocení ----------
function drawRelations(cam, byPosition, relations) {
  const parts = [];
  for (const r of relations) {
    // krajní hráči řady (4–2, 5–1) jen při chybě, jinak by se čáry překrývaly
    if (r.kind === 'row' && Math.abs([4, 3, 2, 5, 6, 1].indexOf(r.left) - [4, 3, 2, 5, 6, 1].indexOf(r.right)) === 2 && r.status !== 'fault') continue;
    const [a, b] = r.kind === 'column' ? [r.front, r.back] : [r.left, r.right];
    const [ax, az] = centerOf(byPosition[a]), [bx, bz] = centerOf(byPosition[b]);
    const item = thick(cam, world(ax, az, 0.015), world(bx, bz, 0.015), r.status === 'fault' ? 0.09 : 0.045, `ct-rel ct-rel--${r.status}`);
    if (item) parts.push(item.el);
  }
  return parts;
}

/**
 * Nakreslí situaci do <svg>. options: view (klíč z VIEWS), selected (pozice
 * vybraných hráčů), result (po vyhodnocení: { relations, faulty: [pozice] }).
 */
export function renderScene(svg, situation, { view = 'ref1', selected = [], result = null } = {}) {
  const settings = VIEWS[view];
  const cam = createCamera(settings);
  const isTop = view === 'top';

  // výřez: body z frame promítnuté na plátno + okraj, doplněno na poměr stran
  const pts = settings.frame.map(cam.project).filter(p => p.depth > NEAR);
  let minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
  let minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
  const pad = 0.04 * Math.max(maxX - minX, maxY - minY);
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  let w = maxX - minX, h = maxY - minY;
  if (w / h < ASPECT) { const extra = h * ASPECT - w; minX -= extra / 2; w += extra; }
  else { const extra = w / ASPECT - h; minY -= extra / 2; h += extra; }
  svg.setAttribute('viewBox', `${num(minX)} ${num(minY)} ${num(w)} ${num(h)}`);
  cam.minFont = h * 0.034;     // čísla na dresech i u vzdálených hráčů aspoň takhle velká

  const byPosition = Object.fromEntries(situation.receiving.map(p => [p.position, p]));
  const faulty = new Set(result?.faulty ?? []);
  const content = [svgEl('rect', { x: num(minX), y: num(minY), width: num(w), height: num(h), class: 'ct-wall' })];
  content.push(...drawCourt(cam));
  if (result) content.push(...drawRelations(cam, byPosition, result.relations));

  // kroužky pod vybranými (a po vyhodnocení pod chybujícími) hráči
  for (const player of situation.receiving) {
    const state = faulty.has(player.position) ? 'fault' : selected.includes(player.position) ? 'selected' : null;
    if (!state) continue;
    const [cx, cz] = centerOf(player);
    const ring = polygon(cam, floorCircle(cx, cz, 0.5), `ct-ring ct-ring--${state}`);
    if (ring) content.push(ring);
  }

  // podávající tým je za sítí (oko je vždy na straně přijímajících), pak síť, pak přijímající
  const byDepth = list => [...list].sort((a, b) => cam.depth(world(...centerOf(b))) - cam.depth(world(...centerOf(a))));
  for (const player of byDepth(situation.serving)) content.push(drawPlayer(cam, player, 'serving', isTop));
  content.push(...drawNet(cam));
  for (const player of byDepth(situation.receiving)) {
    const attrs = { 'data-position': player.position };
    if (selected.includes(player.position)) attrs['data-selected'] = '';
    content.push(drawPlayer(cam, player, 'receiving', isTop, attrs));
  }
  svg.replaceChildren(...content);
}
