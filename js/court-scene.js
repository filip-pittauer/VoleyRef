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

// Obrys podrážky – stejný tvar jako v diagramu postavení v pravidlech
// (Bézierovy křivky v jednotkách diagramu: špička v −y, pravá noha, šířka v x).
const SOLE_PATH = [
  [[0.6, -9.5], [4.4, -9.5], [4.6, -4], [3.9, -0.5]],
  [[3.9, -0.5], [3.4, 2.5], [3, 5.2], [2.7, 7.2]],
  [[2.7, 7.2], [2.2, 9.9], [-2.2, 9.9], [-2.6, 7.2]],
  [[-2.6, 7.2], [-3, 4.8], [-4, 2], [-4, -1.8]],
  [[-4, -1.8], [-4, -6.4], [-2.8, -9.5], [0.6, -9.5]],
];
/** Body obrysu podrážky jako [dopředu, doprava] v metrech, střed chodidla v nule. */
const SOLE = SOLE_PATH.flatMap(curve => [0, 0.2, 0.4, 0.6, 0.8].map(t => {
  const u = 1 - t;
  const bezier = i => u * u * u * curve[0][i] + 3 * u * u * t * curve[1][i] + 3 * u * t * t * curve[2][i] + t * t * t * curve[3][i];
  return [-bezier(1) / 19 * FOOT_SIZE.length, (bezier(0) - 0.3) / 8.6 * FOOT_SIZE.width];
}));

/** Obrys boty na podlaze; levá noha je zrcadlově. */
function soleOutline(foot, forward, left, isLeftFoot) {
  const side = isLeftFoot ? 1 : -1;     // „doprava“ pravé nohy = −left, levá noha zrcadlově
  return SOLE.map(([ahead, right]) => add(add(foot, scale(forward, ahead)), scale(left, side * right)));
}

/** Konvexní obal bodů na plátně (Andrewův algoritmus) – obrys trupu z průřezů. */
function hull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = list => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/**
 * Část těla jako obrys přes vodorovné průřezy (elipsy) – z kteréhokoli úhlu
 * má tvar, ne jen „tlustou čáru“. sections: [{ center, halfWidth, halfDepth }].
 */
function bodyShape(cam, sections, forward, left, cls) {
  const points = [];
  for (const { center, halfWidth, halfDepth } of sections) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = cam.project(add(center, add(scale(left, Math.cos(a) * halfWidth), scale(forward, Math.sin(a) * halfDepth))));
      if (p.depth > NEAR) points.push(p);
    }
  }
  if (points.length < 3) return null;
  return svgEl('path', { d: `M${hull(points).map(p => `${num(p.x)} ${num(p.y)}`).join('L')}Z`, class: cls });
}

/**
 * Postava hráče ve 3D (perspektivní pohled). Části se kreslí v pevném pořadí
 * vrstev: nohy od vzdálenější (bota, bérec, stehno, nohavice), pánev,
 * paže za tělem, trup, hlava, paže před tělem. Číslo dresu se nekreslí tady,
 * ale vrací se zvlášť (label) – kreslí se až po všech hráčích.
 */
function playerParts(cam, player, team) {
  // přijímající se dívají k síti (−x), podávající taky k síti (+x)
  const forward = team === 'receiving' ? [-1, 0, 0] : [1, 0, 0];
  const left = team === 'receiving' ? [0, 0, 1] : [0, 0, -1];
  const [footL, footR] = player.feet.map(f => world(f.x, f.z));
  const mid = lerp(footL, footR, 0.5);
  const upright = player.server ? 1 : 0;     // podávající stojí rovně, ostatní v pozoru na příjem
  const bend = 1 - upright;

  const hip = add(add(mid, scale(UP, 0.81 + 0.13 * upright)), scale(forward, -0.05 * bend));
  const shoulder = add(add(hip, scale(UP, 0.5 + 0.04 * upright)), scale(forward, 0.16 * bend));
  const head = add(add(shoulder, scale(UP, 0.23)), scale(forward, 0.05 * bend));
  const bodyDepth = cam.depth(lerp(hip, shoulder, 0.5));
  const out = [];
  const put = item => { if (item) out.push(item.el ?? item); };
  const shapeOf = points => {
    const projected = points.map(cam.project).filter(p => p.depth > NEAR);
    return projected.length >= 3 ? `M${hull(projected).map(p => `${num(p.x)} ${num(p.y)}`).join('L')}Z` : null;
  };

  // nohy od vzdálenější: bota (podrážka přesně podle dat), bérec, ponožka, stehno, nohavice
  const legs = [[footL, true, 1], [footR, false, -1]].map(([foot, isLeft, sideSign]) => {
    const ankle = add(add(foot, scale(UP, 0.07)), scale(forward, -0.04));
    const knee = add(add(add(ankle, scale(UP, 0.42 + 0.05 * upright)), scale(forward, 0.14 * bend)), scale(left, 0.03 * sideSign));
    const hipSide = add(hip, scale(left, 0.1 * sideSign));
    return { foot, isLeft, ankle, knee, hipSide, depth: cam.depth(foot) };
  }).sort((a, b) => b.depth - a.depth);
  for (const leg of legs) {
    const sole = soleOutline(leg.foot, forward, left, leg.isLeft);
    const shoeTop = add(add(leg.foot, scale(UP, 0.055)), scale(forward, -0.03));
    const shoe = shapeOf([...sole, ...sole.map(p => lerp(shoeTop, add(p, scale(UP, 0.055)), 0.6))]);
    if (shoe) out.push(svgEl('path', { d: shoe, class: 'ct-shoe' }));
    const soleD = cam.pathOf(sole);
    if (soleD) out.push(svgEl('path', { d: soleD, class: 'ct-sole' }));    // otisk na podlaze
    put(thick(cam, leg.ankle, leg.knee, 0.095, 'ct-skin'));
    put(thick(cam, leg.ankle, lerp(leg.ankle, leg.knee, 0.28), 0.09, 'ct-sock'));
    put(thick(cam, leg.knee, leg.hipSide, 0.14, 'ct-skin'));
    put(disc(cam, leg.knee, 0.05, 'ct-skin ct-hand'));
    put(thick(cam, leg.hipSide, lerp(leg.hipSide, leg.knee, 0.3), 0.17, `ct-shorts-leg ct-shorts-leg--${team}`));
  }

  // pánev (užší než spodek dresu, aby dres v pase vždy přesahoval)
  put(bodyShape(cam, [
    { center: add(hip, scale(UP, 0.1)), halfWidth: 0.16, halfDepth: 0.1 },
    { center: add(hip, scale(UP, -0.1)), halfWidth: 0.13, halfDepth: 0.1 },
  ], forward, left, `ct-shorts-fill ct-shorts-fill--${team}`));

  // paže: nadloktí (s rukávem) se řadí podle lokte, předloktí s rukou podle ruky
  const arms = [1, -1].map(sideSign => {
    const shoulderSide = add(add(shoulder, scale(left, 0.19 * sideSign)), scale(UP, -0.03));
    const hand = player.server && sideSign === 1
      ? add(add(shoulder, scale(UP, -0.05)), add(scale(forward, 0.34), scale(left, 0.05)))
      : add(add(hip, scale(UP, 0.12 + 0.2 * upright)), add(scale(forward, 0.36 - 0.26 * upright), scale(left, (0.11 + 0.1 * upright) * sideSign)));
    const elbow = add(lerp(shoulderSide, hand, 0.5), add(scale(UP, -0.1), scale(left, 0.05 * sideSign)));
    return { shoulderSide, elbow, hand, upperDepth: cam.depth(elbow), lowerDepth: cam.depth(hand) };
  });
  const drawUpper = arm => {
    put(thick(cam, arm.shoulderSide, arm.elbow, 0.085, 'ct-skin'));
    put(thick(cam, arm.shoulderSide, lerp(arm.shoulderSide, arm.elbow, 0.55), 0.115, `ct-sleeve ct-sleeve--${team}`));
  };
  const drawLower = arm => {
    put(thick(cam, arm.elbow, arm.hand, 0.075, 'ct-skin'));
    put(disc(cam, arm.hand, 0.045, 'ct-skin ct-hand'));
  };
  const farFirst = (list, key) => list.sort((a, b) => b[key] - a[key]);
  farFirst(arms.filter(a => a.upperDepth >= bodyDepth), 'upperDepth').forEach(drawUpper);
  farFirst(arms.filter(a => a.lowerDepth >= bodyDepth), 'lowerDepth').forEach(drawLower);

  // trup, krk, hlava (vlasy vzadu – podle nich je vidět, kam se hráč dívá)
  put(bodyShape(cam, [
    { center: add(hip, scale(UP, 0.06)), halfWidth: 0.18, halfDepth: 0.12 },
    { center: lerp(hip, shoulder, 0.45), halfWidth: 0.155, halfDepth: 0.1 },
    { center: lerp(hip, shoulder, 0.85), halfWidth: 0.19, halfDepth: 0.115 },
    { center: shoulder, halfWidth: 0.16, halfDepth: 0.09 },
  ], forward, left, `ct-torso ct-torso--${team}`));
  put(thick(cam, add(shoulder, scale(UP, 0.04)), lerp(shoulder, head, 0.75), 0.09, 'ct-skin'));
  put(disc(cam, add(add(head, scale(forward, -0.03)), scale(UP, 0.025)), 0.1, 'ct-hair'));
  put(disc(cam, add(head, scale(forward, 0.015)), 0.092, 'ct-skin ct-head'));

  farFirst(arms.filter(a => a.upperDepth < bodyDepth), 'upperDepth').forEach(drawUpper);
  farFirst(arms.filter(a => a.lowerDepth < bodyDepth), 'lowerDepth').forEach(drawLower);
  if (player.server) put(disc(cam, add(add(shoulder, scale(UP, -0.02)), scale(forward, 0.42)), 0.105, 'ct-ball'));

  // číslo dresu (kreslí se nakonec v renderScene): na trupu, záložně nad hlavou
  const body = cam.project(lerp(hip, shoulder, 0.5));
  const above = cam.project(add(head, scale(UP, 0.24)));
  const minFont = team === 'receiving' ? cam.minFont : cam.minFont * 0.7;
  const label = body.depth > NEAR && above.depth > NEAR
    ? { body, above, size: Math.max(0.22 / body.depth, minFont), text: String(player.jersey), depth: body.depth }
    : null;
  return { parts: out, label };
}

/** Hráč při pohledu shora: chodidla, průsvitné tělo, číslo dresu a pozice. */
function playerPartsTop(cam, player, team) {
  const forward = team === 'receiving' ? [-1, 0, 0] : [1, 0, 0];
  const left = team === 'receiving' ? [0, 0, 1] : [0, 0, -1];
  const out = [];
  player.feet.forEach((f, i) => {
    const d = cam.pathOf(soleOutline(world(f.x, f.z), forward, left, i === 0));
    if (d) out.push(svgEl('path', { d, class: 'ct-shoe' }));
  });
  const [cx, cz] = centerOf(player);
  const body = cam.pathOf(floorCircle(cx, cz, 0.3, 0.02));
  if (body) out.push(svgEl('path', { d: body, class: `ct-body-top ct-body-top--${team}` }));
  const label = cam.project(world(cx, cz, 0.03));
  out.push(svgEl('text', { x: num(label.x), y: num(label.y), 'font-size': num(0.32 / label.depth), class: 'ct-number' }, String(player.jersey)));
  if (player.position) {
    const below = cam.project(world(cx + 0.48, cz, 0.03));
    out.push(svgEl('text', { x: num(below.x), y: num(below.y), 'font-size': num(0.22 / below.depth), class: 'ct-position' }, `P${player.position}`));
  }
  return out;
}

function centerOf(player) {
  const box = footprint(player.feet);
  return [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2];
}

/** Hráč jako skupina <g>; label = číslo dresu ke kreslení nakonec (jen perspektivní pohledy). */
function drawPlayer(cam, player, team, isTop, attrs = {}) {
  const { parts, label } = isTop ? { parts: playerPartsTop(cam, player, team), label: null } : playerParts(cam, player, team);
  return { el: svgEl('g', { class: `ct-player ct-player--${team}`, ...attrs }, ...parts), label };
}

/**
 * Čísla dresů až po všech hráčích, aby je nezakrylo žádné tělo. Když se číslo
 * překrývá s číslem bližšího hráče, posune se nad hlavu svého hráče.
 */
function drawLabels(labels) {
  const boxAt = (p, l) => {
    const w = l.size * 0.62 * l.text.length, h = l.size * 0.8;
    return { x: p.x - w / 2, y: p.y - h / 2, w, h };
  };
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const placed = [];
  for (const label of [...labels].sort((a, b) => a.depth - b.depth)) {   // od nejbližšího
    label.at = placed.some(box => overlaps(boxAt(label.body, label), box)) ? label.above : label.body;
    placed.push(boxAt(label.at, label));
  }
  return labels.sort((a, b) => b.depth - a.depth).map(label =>
    svgEl('text', { x: num(label.at.x), y: num(label.at.y), 'font-size': num(label.size), class: 'ct-number' }, label.text));
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
  const labels = [];
  const addPlayer = ({ el, label }) => { content.push(el); if (label) labels.push(label); };
  for (const player of byDepth(situation.serving)) addPlayer(drawPlayer(cam, player, 'serving', isTop));
  content.push(...drawNet(cam));
  for (const player of byDepth(situation.receiving)) {
    const attrs = { 'data-position': player.position };
    if (selected.includes(player.position)) attrs['data-selected'] = '';
    addPlayer(drawPlayer(cam, player, 'receiving', isTop, attrs));
  }
  content.push(...drawLabels(labels));
  svg.replaceChildren(...content);
}
