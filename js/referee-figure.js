// Animovaná postava rozhodčího v SVG (gesta).
// Data gesta → gesture-pose.js spočítá polohu paží → tady se to nakreslí.
//
// Postava je jednoduchý 3D model (trup z elips, paže z „tyček“, ruka
// s prsty), který se v každém snímku promítne do 2D. Části se kreslí
// odzadu dopředu podle hloubky – ruka před tělem je vidět, ruka za zády ne
// (tzv. malířův algoritmus).
import { svgEl } from './dom.js';
import {
  add, scale, cross, lerp, normalize, perpendicular, anyPerpendicular, createProjection,
} from './math3d.js';
import { BODY, createPoseSampler } from './gesture-pose.js';
import { createPlayer } from './player.js';

// Výřez scény v metrech [x, y, šířka, výška]: postava od půli stehen po zvednuté ruce.
// Gesto může mít vlastní výřez (čároví rozhodčí potřebují místo na praporek).
const VIEWBOX = [-1.05, -1.42, 2.1, 1.8];

const HAND = 1.2;          // ruce jsou o něco větší než ve skutečnosti, aby byly vidět prsty
const OUTLINE = 0.009;     // tloušťka obrysu (na každou stranu)
const SLEEVE = 0.1;        // tloušťka rukávu
const UPPER_ARM = 0.085;
const FOREARM = 0.074;
const FINGER = 0.017 * HAND;

// Trup: průřezy [výška, poloviční šířka, poloviční hloubka] – elipsy nad sebou.
const TORSO = [[0, 0.165, 0.11], [0.17, 0.15, 0.1], [0.36, 0.18, 0.115], [0.47, 0.2, 0.1]];
const HEAD = { y: 0.755, r: 0.115 };

// ---------- Ruka ----------
// Body ruky leží v rovině dlaně: u = od zápěstí ke konečkům prstů,
// v = napříč dlaní k palci, w = kolmo z dlaně (na straně dlaně kladné).
const PALM = [
  [0, -0.03], [0.01, -0.035], [0.05, -0.04], [0.086, -0.038], [0.094, -0.022], [0.096, 0],
  [0.094, 0.02], [0.088, 0.036], [0.055, 0.041], [0.022, 0.037], [0, 0.03],
];
const PALM_THICKNESS = 0.013;   // dlaň má tloušťku – z boku je vidět tvar, ne čára
const KNUCKLE_U = 0.082;
// ukazováček, prostředníček, prsteníček, malíček: [poloha kořene napříč dlaní, délka]
const FINGERS = [[0.03, 0.074], [0.01, 0.082], [-0.01, 0.076], [-0.029, 0.06]];
const THUMBS = {
  vedle: [[0.018, 0.03, 0.004], [0.05, 0.05, 0.006], [0.08, 0.056, 0.006]],    // u otevřené ruky
  pres: [[0.03, 0.036, 0.012], [0.058, 0.03, 0.034], [0.078, 0, 0.036]],      // přes pokrčené prsty (pěst)
  nahoru: [[0.05, 0.035, 0.012], [0.062, 0.075, 0.016], [0.068, 0.112, 0.014]], // palec vzhůru (do strany od pěsti)
  karta: [[0.03, 0.036, 0.012], [0.07, 0.025, 0.04], [0.105, 0.005, 0.042]],     // svírá kartu zepředu
};
// Tvar ruky: úhel každého prstu (radiány, kladný = k palci), null = pokrčený prst.
const SHAPES = {
  otevrena: { fingers: [0.05, 0.015, -0.015, -0.05], thumb: 'vedle' },
  pest: { fingers: [null, null, null, null], thumb: 'pres' },
  ukazovak: { fingers: [0, null, null, null], thumb: 'pres' },
  dva: { fingers: [0.2, -0.1, null, null], thumb: 'pres' },
  ctyri: { fingers: [0.24, 0.08, -0.08, -0.24], thumb: 'pres' },
  palec: { fingers: [null, null, null, null], thumb: 'nahoru' },
};
// Karty v ruce: [barva, u od, u do, v od, v do, w]. Karta je k divákovi lícem
// a zakrývá celou pěst – prsty jsou za ní, vidět je jen palec, který ji drží.
const CARDS = {
  zluta: [['zluta', 0.03, 0.2, -0.046, 0.046, 0.012]],
  cervena: [['cervena', 0.03, 0.2, -0.046, 0.046, 0.012]],
  obe: [['cervena', 0.035, 0.205, -0.005, 0.085, 0.01], ['zluta', 0.03, 0.2, -0.075, 0.012, 0.014]],
};
const GRIP_W = 0.012;           // tyčka praporku prochází pěstí ve stejné hloubce jako karta

// ---------- Pomocné funkce pro SVG ----------
const num = n => String(Math.round(n * 10000) / 10000);
const xy = p => `${num(p.x)} ${num(p.y)}`;
/** Bod na úsečce mezi dvěma body na plátně (k = 0 → a, 1 → b). */
const between = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const polyline = (points, closed = false) => `M${points.map(xy).join('L')}${closed ? 'Z' : ''}`;

/** Hladká křivka přes body (Catmull-Rom převedený na Bézierovy křivky). */
function smoothPath(points) {
  let d = `M${xy(points[0])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)], p1 = points[i];
    const p2 = points[i + 1], p3 = points[Math.min(i + 2, points.length - 1)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${xy(c1)} ${xy(c2)} ${xy(p2)}`;
  }
  return d;
}

function setLine(line, a, b) {
  line.setAttribute('x1', num(a.x));
  line.setAttribute('y1', num(a.y));
  line.setAttribute('x2', num(b.x));
  line.setAttribute('y2', num(b.y));
}

/** Čára s obrysem = dvě čáry přes sebe (tlustší tmavá a na ní barevná). */
function outlinedLine(className, width) {
  return [
    svgEl('line', { class: 'ref-outline', 'stroke-width': width + 2 * OUTLINE }),
    svgEl('line', { class: className, 'stroke-width': width }),
  ];
}

/** Prst jako lomená čára s obrysem. */
function digitNodes(points, width = FINGER) {
  const d = polyline(points);
  return [
    svgEl('path', { class: 'ref-outline', d, 'stroke-width': width + 2 * OUTLINE }),
    svgEl('path', { class: 'ref-digit', d, 'stroke-width': width }),
  ];
}

/** Šířka elipsy (a × b) při pohledu otočeném o úhel yaw. */
const ellipseHalfWidth = (a, b, yaw) => Math.hypot(a * Math.cos(yaw), b * Math.sin(yaw));

// ---------- Trup, krk, kalhoty, límec ----------
function createBody() {
  const trousers = svgEl('path', { class: 'ref-trousers' });
  const neck = svgEl('path', { class: 'ref-skin' });
  const torso = svgEl('path', { class: 'ref-shirt' });
  const collar = [svgEl('path', { class: 'ref-collar' }), svgEl('path', { class: 'ref-collar' })];
  const layer = { id: 'body', node: svgEl('g', {}, trousers, neck, torso, ...collar), depth: 0 };

  return {
    layers: [layer],
    update({ project, yaw }) {
      const at = y => project([0, y, 0]).y;
      const rings = TORSO.map(([y, a, b]) => ({ y: at(y), half: ellipseHalfWidth(a, b, yaw) }));
      const shoulder = rings.at(-1);
      const neckHalf = ellipseHalfWidth(0.06, 0.055, yaw);

      // obrys trupu: zdola po levém boku nahoru, přes ramena a dolů po pravém boku
      const leftSide = [
        ...rings.map(r => ({ x: -r.half, y: r.y })),
        { x: -shoulder.half * 0.9, y: at(0.535) },
        { x: -neckHalf, y: at(0.57) },
      ];
      const rightSide = leftSide.map(p => ({ x: -p.x, y: p.y })).reverse();
      torso.setAttribute('d', `${smoothPath([...leftSide, ...rightSide])}Z`);

      const hips = rings[0].half;
      const low = at(-0.75);
      trousers.setAttribute('d', polyline([
        { x: -hips, y: at(0.03) }, { x: -hips * 1.03, y: low }, { x: -0.025, y: low },
        { x: 0, y: at(-0.24) }, { x: 0.025, y: low }, { x: hips * 1.03, y: low }, { x: hips, y: at(0.03) },
      ], true));

      const neckHalfWidth = ellipseHalfWidth(0.052, 0.05, yaw);
      neck.setAttribute('d', polyline([
        { x: -neckHalfWidth, y: at(0.53) }, { x: -neckHalfWidth, y: at(0.67) },
        { x: neckHalfWidth, y: at(0.67) }, { x: neckHalfWidth, y: at(0.53) },
      ], true));

      // límec trička (polo): dva cípy, které se sbíhají pod krkem;
      // cíp na odvrácené straně (pohled z boku) není vidět
      [-1, 1].forEach((side, i) => {
        const flap = [[side * 0.068, 0.565, 0.035], [side * 0.088, 0.5, 0.085], [0, 0.495, 0.11]].map(project);
        collar[i].setAttribute('d', polyline(flap, true));
        collar[i].style.display = flap[1].depth > 0 ? '' : 'none';
      });
    },
  };
}

// ---------- Hlava ----------
/** Bod na povrchu hlavy: azimut (0 = obličej, kladný = levé ucho), výška −1…1. */
function headPoint(azimuth, height) {
  const ring = HEAD.r * Math.sqrt(1 - height * height);
  return [ring * Math.sin(azimuth), HEAD.y + HEAD.r * height, ring * Math.cos(azimuth)];
}

function createHead() {
  const head = svgEl('circle', { class: 'ref-skin', r: HEAD.r });
  const hair = svgEl('path', { class: 'ref-hair' });
  const ears = [svgEl('ellipse', { class: 'ref-skin' }), svgEl('ellipse', { class: 'ref-skin' })];
  const eyes = [svgEl('circle', { class: 'ref-eye', r: 0.012 }), svgEl('circle', { class: 'ref-eye', r: 0.012 })];
  const mouth = svgEl('path', { class: 'ref-mouth' });
  const layer = { id: 'head', node: svgEl('g', {}, ...ears, head, hair, ...eyes, mouth), depth: 0.02 };

  return {
    layers: [layer],
    update({ project, yaw }) {
      const center = project([0, HEAD.y, 0]);
      head.setAttribute('cx', num(center.x));
      head.setAttribute('cy', num(center.y));

      // Vlasy: vše nad „linií vlasů“, která je na čele vysoko a v týlu nízko.
      // Linii projdeme po viditelné polovině hlavy a uzavřeme obloukem přes temeno.
      const facing = -yaw;   // azimut, který míří přímo k divákovi
      const line = Array.from({ length: 17 }, (_, i) => {
        const azimuth = facing - Math.PI / 2 + Math.PI * (i / 16);
        return project(headPoint(azimuth, 0.18 + 0.32 * Math.cos(azimuth)));
      });
      const first = line[0], last = line.at(-1);
      const chordBelowCenter = (first.y + last.y) / 2 > center.y;
      hair.setAttribute('d',
        `${polyline(line)}A${num(HEAD.r)} ${num(HEAD.r)} 0 ${chordBelowCenter ? 1 : 0} 0 ${xy(first)}Z`);

      // uši a obličej kreslíme jen na straně, která je vidět
      [-1, 1].forEach((side, i) => {
        const ear = project(headPoint(side * Math.PI / 2, -0.05));
        ears[i].setAttribute('cx', num(ear.x));
        ears[i].setAttribute('cy', num(ear.y));
        ears[i].setAttribute('rx', num(0.012 + 0.01 * Math.abs(Math.cos(facing - side * Math.PI / 2))));
        ears[i].setAttribute('ry', '0.032');
        ears[i].style.display = ear.depth > center.depth - 0.03 ? '' : 'none';

        const eye = project(headPoint(side * 0.36, 0.08));
        eyes[i].setAttribute('cx', num(eye.x));
        eyes[i].setAttribute('cy', num(eye.y));
        eyes[i].style.display = eye.depth > center.depth + 0.04 ? '' : 'none';
      });

      const smile = [project(headPoint(-0.22, -0.4)), project(headPoint(0, -0.47)), project(headPoint(0.22, -0.4))];
      mouth.setAttribute('d', `M${xy(smile[0])}Q${xy(smile[1])} ${xy(smile[2])}`);
      mouth.style.display = project(headPoint(0, -0.45)).depth > center.depth + 0.05 ? '' : 'none';
    },
  };
}

// ---------- Paže a ruka ----------
const RIGHT = -1;   // pravá paže rozhodčího (na obrázku vlevo, protože se díváme zepředu)
const LEFT = 1;

function createArm(side) {
  const shoulder = [side * BODY.shoulderX, BODY.shoulderY, 0];
  // souřadnice paže [ven, nahoru, vpřed] → souřadnice těla [x, y, z]
  const toBody = v => [side * v[0], v[1], v[2]];
  const at = local => add(shoulder, toBody(local));

  const [upperOutline, upperSkin] = outlinedLine('ref-limb-skin', UPPER_ARM);
  const [sleeveOutline, sleeve] = outlinedLine('ref-limb-shirt', SLEEVE);
  const [foreOutline, foreSkin] = outlinedLine('ref-limb-skin', FOREARM);
  const name = side === RIGHT ? 'right' : 'left';
  const upper = { id: `${name}-upper`, node: svgEl('g', {}, upperOutline, upperSkin, sleeveOutline, sleeve), depth: 0 };
  const fore = { id: `${name}-fore`, node: svgEl('g', {}, foreOutline, foreSkin), depth: 0 };
  const hand = { id: `${name}-hand`, node: svgEl('g'), depth: 0 };
  // loket: krátké kousky kůže bez obrysu přes oba konce – zakryjí šev,
  // kde obrys jedné části paže protíná kůži druhé
  const elbowUpper = svgEl('line', { class: 'ref-limb-skin', 'stroke-width': UPPER_ARM });
  const elbowFore = svgEl('line', { class: 'ref-limb-skin', 'stroke-width': FOREARM });
  const elbow = { id: `${name}-elbow`, node: svgEl('g', {}, elbowUpper, elbowFore), depth: 0 };

  return {
    layers: [upper, fore, elbow, hand],
    update({ project }, pose) {
      const arm = pose[name];
      const s = project(shoulder);
      const e = project(at(arm.elbow));
      const w = project(at(arm.wrist));
      // krátký rukáv: začíná kousek pod kloubem (kulatý konec čáry by jinak
      // trčel nad rameno) a končí v půlce paže
      const sleeveStart = project(at(scale(arm.elbow, 0.25)));
      const cuff = project(at(scale(arm.elbow, 0.5)));

      setLine(upperOutline, cuff, e);
      setLine(upperSkin, cuff, e);
      setLine(sleeveOutline, sleeveStart, cuff);
      setLine(sleeve, sleeveStart, cuff);
      setLine(foreOutline, e, w);
      setLine(foreSkin, e, w);

      // Hloubka vůči ose těla ve stejné výšce: při pohledu shora vycházejí
      // vyšší body „blíž“, takže porovnávat se surovou hloubkou trupu nejde.
      // Malá přednost před trupem, aby paže volně podél těla nemizela za ním.
      const axis = y => project([0, y, 0]).depth;
      const elbow3 = at(arm.elbow), wrist3 = at(arm.wrist);
      upper.depth = (s.depth + e.depth) / 2 - axis((shoulder[1] + elbow3[1]) / 2) + 0.03;
      fore.depth = (e.depth + w.depth) / 2 - axis((elbow3[1] + wrist3[1]) / 2) + 0.03;

      // záplata lokte jen když jsou obě části paže na stejné straně trupu
      // (jinak by kus paže za zády vylezl před trup)
      setLine(elbowUpper, e, between(e, cuff, 0.35));
      setLine(elbowFore, e, between(e, w, 0.25));
      elbow.depth = Math.max(upper.depth, fore.depth) + 0.0005;
      elbow.node.style.display = (upper.depth > 0) === (fore.depth > 0) ? '' : 'none';
      const handDepth = drawHand(hand.node, project, arm, at, toBody) - axis(wrist3[1]) + 0.035;
      hand.depth = handDepth < -0.02 ? handDepth : Math.max(handDepth, fore.depth + 0.002);
    },
  };
}

/** Konvexní obal bodů na plátně (Andrewův algoritmus) – obrys dlaně a pěsti. */
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

const averageDepth = points => points.reduce((sum, p) => sum + p.depth, 0) / points.length;

/**
 * Překreslí ruku (dlaň, prsty, kartu nebo praporek). Vrací hloubku ruky.
 *
 * „Rovina dlaně“ (zápěstí, dlaň s tloušťkou, natažené prsty) se kreslí jako
 * jedna silueta: nejdřív obrysy všech částí, pak všechny výplně – mezi prsty
 * a dlaní tak nejsou švy, prsty odděluje jen tenká rýha. Části mimo rovinu
 * dlaně (pokrčené prsty, palec přes ně, karta, praporek) se kreslí zvlášť:
 * ty na straně odvrácené od diváka před siluetou, ty přivrácené až po ní.
 */
function drawHand(node, project, arm, at, toBody) {
  // osy ruky: prsty, normála dlaně a směr k palci (vše v souřadnicích paže)
  const f = arm.fingers;
  const n = normalize(perpendicular(arm.palm, f), anyPerpendicular(f));
  const v = cross(n, f);
  const local = ([pu, pv, pw]) => add(arm.wrist, scale(add(add(scale(f, pu), scale(v, pv)), scale(n, pw)), HAND));
  const point = p => project(at(local(p)));
  const shape = SHAPES[arm.shape] ?? SHAPES.otevrena;

  // vidíme dlaň, nebo hřbet? (dlaň je o něco světlejší)
  const palmFacing = project(toBody(n)).depth > 0;
  const toViewer = w => (palmFacing ? w : -w);   // kladné = blíž k divákovi než rovina dlaně

  // --- rovina dlaně ---
  const palm = hull([PALM_THICKNESS, -PALM_THICKNESS].flatMap(w => PALM.map(([pu, pv]) => point([pu, pv, w]))));
  const straight = [];
  shape.fingers.forEach((angle, i) => {
    if (angle === null) return;
    const [base, len] = FINGERS[i];
    straight.push([[KNUCKLE_U - 0.012, base, 0], [KNUCKLE_U + len * Math.cos(angle), base + len * Math.sin(angle), 0]].map(point));
  });
  const thumb = THUMBS[CARDS[arm.holds] && shape.thumb === 'pres' ? 'karta' : shape.thumb];
  const thumbInPlane = thumb.every(([, , w]) => Math.abs(w) < 0.01);
  if (thumbInPlane) straight.push(thumb.map(point));
  straight.sort((a, b) => averageDepth(a) - averageDepth(b));    // vzdálenější prst první

  // zápěstí: obrys krátký, výplň delší – zakryje kulatý konec předloktí
  const wrist = project(at(arm.wrist));
  const towardElbow = meters => project(at(lerp(arm.wrist, arm.elbow, meters / BODY.forearm)));
  const stubOutline = svgEl('line', { class: 'ref-outline', 'stroke-width': FOREARM + 2 * OUTLINE });
  const stubFill = svgEl('line', { class: 'ref-limb-skin', 'stroke-width': FOREARM });
  setLine(stubOutline, towardElbow(0.03), wrist);
  setLine(stubFill, towardElbow(0.07), wrist);

  // pokrčené prsty jako jeden „polštářek“ pěsti: obdélník se zaoblenými rohy
  // (v rovině dlaně) ve dvou hloubkách
  const curled = shape.fingers.map((angle, i) => (angle === null ? FINGERS[i][0] : null)).filter(b => b !== null);
  let fistD = null;
  if (curled.length) {
    const uMin = KNUCKLE_U - 0.04, uMax = KNUCKLE_U + 0.03;
    const vMin = Math.min(...curled) - 0.012, vMax = Math.max(...curled) + 0.012;
    const r = 0.018;
    const corners = [[uMax - r, vMax - r, 0], [uMax - r, vMin + r, 1.5], [uMin + r, vMin + r, 1], [uMin + r, vMax - r, 0.5]];
    const rounded = corners.flatMap(([cu, cv, start]) => [0, 1, 2, 3].map(k => {
      const a = (start + k / 6) * Math.PI;
      return [cu + r * Math.cos(a), cv + r * Math.sin(a)];
    }));
    fistD = polyline(hull([-0.004, 0.045].flatMap(pw => rounded.map(([pu, pv]) => point([pu, pv, pw])))), true);
  }
  // Pěst za dlaní je součástí siluety. U karty taky: celá ruka je za kartou
  // a před ní zůstane jen palec.
  const holdsCard = Boolean(CARDS[arm.holds]);
  const fistBehind = fistD && (holdsCard || toViewer(0.017) < 0);

  const palmD = polyline(palm, true);
  const plane = [
    stubOutline,
    ...(fistBehind ? [svgEl('path', { class: 'ref-outline-fill', d: fistD, 'stroke-width': 2 * OUTLINE })] : []),
    svgEl('path', { class: 'ref-outline-fill', d: palmD, 'stroke-width': 2 * OUTLINE }),
    ...straight.map(d => svgEl('path', { class: 'ref-outline', d: polyline(d), 'stroke-width': FINGER + 2 * OUTLINE })),
    stubFill,
    ...(fistBehind ? [svgEl('path', { class: 'ref-skin ref-flat', d: fistD })] : []),
    svgEl('path', { class: 'ref-skin ref-flat', d: palmD }),
    ...straight.flatMap(d => [
      svgEl('path', { class: 'ref-crease', d: polyline(d), 'stroke-width': FINGER + 0.006 }),
      svgEl('path', { class: 'ref-digit', d: polyline(d), 'stroke-width': FINGER }),
    ]),
  ];

  // --- části mimo rovinu dlaně: { w (strana dlaně), nodes } ---
  const items = [];
  // rýhy mezi pokrčenými prsty na straně, kterou je vidět (zezadu jen klouby nad dlaní)
  const fistCreases = () => curled.slice(0, -1).map((b, i) => {
    const pv = (b + curled[i + 1]) / 2;
    const ends = fistBehind ? [[0.1, pv, -0.005], [KNUCKLE_U + 0.026, pv, -0.005]] : [[KNUCKLE_U - 0.03, pv, 0.046], [KNUCKLE_U + 0.02, pv, 0.046]];
    return svgEl('path', { class: 'ref-crease', d: polyline(ends.map(point)), 'stroke-width': 0.006 });
  });
  if (fistD && !fistBehind) {
    // pěst před dlaní: vlastní obrys a rýhy mezi prsty
    items.push({ w: 0.02, nodes: [svgEl('path', { class: 'ref-skin', d: fistD }), ...fistCreases()] });
  }
  if (fistBehind && !holdsCard) plane.push(...fistCreases());
  if (!thumbInPlane) {
    // palec je vždy navrch ostatních částí na své straně; přes otevřenou dlaň
    // má jen jemnou rýhu, aby nevypadal jako nalepený díl
    const w = thumb.reduce((sum, p) => sum + p[2], 0) / thumb.length;
    const soft = !curled.length && toViewer(w) > 0;
    const d = polyline(thumb.map(point));
    const nodes = soft
      ? [svgEl('path', { class: 'ref-crease', d, 'stroke-width': FINGER + 0.008 }),
        svgEl('path', { class: 'ref-digit', d, 'stroke-width': FINGER })]
      : digitNodes(thumb.map(point), FINGER * 1.25);
    items.push({ w: w + 0.01, nodes });
  }
  items.push(...drawHeld(arm.holds, {
    point, project, grip: at(local([0.05, 0.004, GRIP_W])), stick: toBody(v), cloth: toBody(n),
  }));

  // karta je vždy lícem k divákovi: ruka → karta → palec (podle w), nic za rukou
  const side = holdsCard ? w => Math.abs(w) : toViewer;
  const back = items.filter(item => side(item.w) < 0).sort((a, b) => side(a.w) - side(b.w));
  const front = items.filter(item => side(item.w) >= 0).sort((a, b) => side(a.w) - side(b.w));
  node.replaceChildren(...back.flatMap(i => i.nodes), ...plane, ...front.flatMap(i => i.nodes));
  return (wrist.depth + point([0.05, 0, 0]).depth) / 2;
}

/** Karty nebo praporek v ruce: [{ w (strana dlaně), nodes }]. */
function drawHeld(holds, { point, project, grip, stick, cloth }) {
  if (!holds) return [];

  if (CARDS[holds]) {
    return CARDS[holds].map(([color, u1, u2, v1, v2, w]) => ({
      w,
      nodes: [svgEl('path', {
        class: `ref-card ref-card--${color}`,
        d: polyline([[u1, v1], [u2, v1], [u2, v2], [u1, v2]].map(([pu, pv]) => point([pu, pv, w])), true),
      })],
    }));
  }

  if (holds === 'praporek') {
    // tyčka prochází pěstí ve směru k palci, látka vlaje ve směru dlaně
    const along = k => add(grip, scale(stick, k));
    const top = along(0.46), bottom = along(0.17);
    const free = (p, droop) => add(add(p, scale(cloth, 0.3)), scale(stick, -droop));
    const waveControl = add(lerp(free(top, 0.02), free(bottom, 0.03), 0.5), scale(cloth, 0.035));
    const flag = svgEl('path', {
      class: 'ref-flag',
      d: `M${xy(project(top))}L${xy(project(free(top, 0.02)))}Q${xy(project(waveControl))} ${xy(project(free(bottom, 0.03)))}L${xy(project(bottom))}Z`,
    });
    const line = svgEl('line', { class: 'ref-stick', 'stroke-width': 0.026 });
    setLine(line, project(along(-0.07)), project(along(0.48)));
    return [{ w: GRIP_W, nodes: [flag, line] }];
  }

  console.warn('Neznámá věc v ruce:', holds);
  return [];
}

// ---------- Síť (u gest, která ukazují na síť) ----------
// Rozhodčí stojí na stupínku u sloupku a síť vede od něj dopředu (osa z),
// horní okraj sítě je zhruba ve výšce jeho hrudníku. Sloupek nekreslíme –
// zakrýval by ruku, která na síť ukazuje.
const NET = { top: 0.3, bottom: -0.7, from: 0.45, to: 3.2, antenna: 1.05 };

function createNet() {
  const mesh = svgEl('path', { class: 'ref-net__mesh' });
  const [bandOutline, band] = outlinedLine('ref-net__band', 0.06);
  const antennaBase = svgEl('line', { class: 'ref-net__antenna', 'stroke-width': 0.024 });
  const antennaStripes = svgEl('line', { class: 'ref-net__stripes', 'stroke-width': 0.024 });
  const layer = {
    id: 'net',
    node: svgEl('g', {}, mesh, bandOutline, band, antennaBase, antennaStripes),
    depth: 0,
  };

  return {
    layers: [layer],
    update({ project }) {
      const p = (y, z) => project([0, y, z]);
      let d = '';
      for (let z = NET.from; z <= NET.to; z += 0.16) d += `M${xy(p(NET.top, z))}L${xy(p(NET.bottom, z))}`;
      for (let y = NET.top - 0.15; y > NET.bottom; y -= 0.15) d += `M${xy(p(y, NET.from))}L${xy(p(y, NET.to))}`;
      mesh.setAttribute('d', d);
      setLine(bandOutline, p(NET.top, NET.from), p(NET.top, NET.to));
      setLine(band, p(NET.top, NET.from), p(NET.top, NET.to));
      setLine(antennaBase, p(NET.bottom, NET.antenna), p(NET.top + 0.8, NET.antenna));
      setLine(antennaStripes, p(NET.bottom, NET.antenna), p(NET.top + 0.8, NET.antenna));
      // síť je před trupem, ale za rukou, která na ni sahá
      layer.depth = p(NET.top, NET.from).depth - project([0, NET.top, 0]).depth - 0.08;
    },
  };
}

// ---------- Scéna a přehrávač ----------
/**
 * Vytvoří SVG s postavou pro jedno gesto. Vrací { svg, render(t) }.
 * mirror = zrcadlově (gesto pro tým na druhé straně – význam se nemění).
 */
export function createRefereeScene(gesture, poses, { mirror = false } = {}) {
  const poseAt = createPoseSampler(gesture, poses);
  const camera = { otoceni: 18, naklon: 6, ...gesture.kamera };

  const svg = svgEl('svg', { viewBox: (gesture.vyrez ?? VIEWBOX).join(' '), role: 'img', class: 'ref' });
  const figure = svgEl('g', mirror ? { transform: 'scale(-1 1)' } : {});
  svg.append(figure);

  const parts = [createBody(), createHead(), createArm(RIGHT), createArm(LEFT)];
  if (gesture.sit) parts.push(createNet());
  const layers = parts.flatMap(part => part.layers);
  let order = '';

  return {
    svg,
    render(t) {
      const pose = poseAt(t);
      const yawDeg = camera.otoceni + pose.twist;
      const view = { project: createProjection(yawDeg, camera.naklon), yaw: yawDeg * Math.PI / 180 };
      for (const part of parts) part.update(view, pose);

      // kreslit odzadu dopředu; pořadí v DOM měnit jen když je potřeba
      const sorted = [...layers].sort((a, b) => a.depth - b.depth);
      const key = sorted.map(layer => layer.id).join();
      if (key !== order) {
        figure.append(...sorted.map(layer => layer.node));
        order = key;
      }
    },
  };
}

/** Přehrávač gesta s ovládáním. Popis pohybu slouží jako alternativní text. */
export function createGesturePlayer(gesture, poses, { mirror = false, autoplay = true } = {}) {
  const scene = createRefereeScene(gesture, poses, { mirror });
  scene.svg.setAttribute('aria-label', `Animace gesta: ${gesture.pohyb}`);
  return createPlayer(scene, {
    duration: gesture.delka,
    className: 'gesture',
    posterTime: gesture.nahled ?? gesture.delka,
    autoplay,
  });
}
