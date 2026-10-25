// Trenažér postavení – logika bez DOM: náhodné situace a kontrola postavení (pravidlo 7.4).
//
// Souřadnice v metrech, pohled shora na pole přijímajícího týmu:
//   x = vzdálenost od střední čáry (0 = síť, 9 = koncová čára),
//   z = napříč hřištěm; kladné z = vlevo z pohledu hráčů přijímajícího týmu
//       (dívají se k síti), takže pozice 4 a 5 mají velké z, pozice 2 a 1 malé.
// Podávající tým stojí na druhé polovině (záporné x).

export const COURT = { length: 9, halfWidth: 4.5 };

// Situace jsou vždy jednoznačné: správný vztah i chyba o víc než 40 cm
// (mezi chodidly), aby se nedalo hádat o centimetry ani o výklad pravidla.
export const MARGIN = 0.4;

const FOOT = { length: 0.28, width: 0.11 };   // bota leží podél osy x, špička k síti
const MIN_GAP = 0.8;                          // nejmenší vzdálenost středů dvou hráčů

export const FRONT_ROW = [4, 3, 2];           // zleva doprava (z pohledu týmu)
export const BACK_ROW = [5, 6, 1];

/**
 * Vztahy, které pravidla kontrolují (7.4.2, 7.4.3):
 * column = hráč zadní řady za svým hráčem přední řady,
 * row = v řadě levý hráč vlevo od pravého (krajní hráč vůči oběma ostatním).
 */
export const RELATIONS = [
  { kind: 'column', front: 4, back: 5 },
  { kind: 'column', front: 3, back: 6 },
  { kind: 'column', front: 2, back: 1 },
  { kind: 'row', left: 4, right: 3 },
  { kind: 'row', left: 3, right: 2 },
  { kind: 'row', left: 4, right: 2 },
  { kind: 'row', left: 5, right: 6 },
  { kind: 'row', left: 6, right: 1 },
  { kind: 'row', left: 5, right: 1 },
];

// Chyby, které generátor vytváří: vždy jen jeden porušený vztah. V řadě jen
// sousedé (4–3, 3–2, 5–6, 6–1) – prohození krajních 4–2 by porušilo víc vztahů.
const rowOf = position => (FRONT_ROW.includes(position) ? FRONT_ROW : BACK_ROW);
const areNeighbours = (a, b) => Math.abs(rowOf(a).indexOf(a) - rowOf(a).indexOf(b)) === 1;
const FAULTS = RELATIONS.filter(r => r.kind === 'column' || areNeighbours(r.left, r.right));

/** Kde hráč stojí: nejmenší a největší x a z přes obě chodidla. */
export function footprint(feet) {
  return {
    minX: Math.min(...feet.map(f => f.x)) - FOOT.length / 2,
    maxX: Math.max(...feet.map(f => f.x)) + FOOT.length / 2,
    minZ: Math.min(...feet.map(f => f.z)) - FOOT.width / 2,
    maxZ: Math.max(...feet.map(f => f.z)) + FOOT.width / 2,
  };
}

export const FOOT_SIZE = FOOT;

/**
 * Stav jednoho vztahu: 'ok', 'fault', nebo 'unclear' (rozdíl menší než MARGIN).
 * gap = o kolik metrů je vztah splněný (kladné) nebo porušený (záporné).
 */
export function checkRelation(relation, byPosition) {
  let gap, fault;
  if (relation.kind === 'column') {
    const front = footprint(byPosition[relation.front].feet);
    const back = footprint(byPosition[relation.back].feet);
    gap = back.minX - front.maxX;          // zadní hráč celý za předním
    fault = front.minX - back.maxX;        // zadní hráč celý před předním
  } else {
    const left = footprint(byPosition[relation.left].feet);
    const right = footprint(byPosition[relation.right].feet);
    gap = left.minZ - right.maxZ;          // levý hráč celý vlevo od pravého
    fault = right.minZ - left.maxZ;        // pravý hráč celý vlevo od levého
  }
  const status = gap >= MARGIN ? 'ok' : fault >= MARGIN ? 'fault' : 'unclear';
  return { ...relation, status, gap: status === 'fault' ? -fault : gap };
}

/** Stav všech vztahů postavení (přední–zadní, sousedé v řadě) pro { pozice: hráč }. */
export function checkAll(byPosition) {
  return RELATIONS.map(relation => checkRelation(relation, byPosition));
}

// ---------- Náhoda ----------
const uniform = (random, min, max) => min + random() * (max - min);
const pick = (random, list) => list[Math.floor(random() * list.length)];

function shuffle(random, list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Tři hodnoty z intervalu, sestupně, s odstupem aspoň gap (pro pořadí do strany). */
function spreadValues(random, min, max, gap) {
  for (;;) {
    const values = [0, 1, 2].map(() => uniform(random, min, max)).sort((a, b) => b - a);
    if (values[0] - values[1] >= gap && values[1] - values[2] >= gap) return values;
  }
}

/** Chodidla hráče se středem (x, z): rozkročení napříč, jedna noha o kus vpřed. */
function makeFeet(random, x, z) {
  const width = uniform(random, 0.3, 0.44);
  const stagger = uniform(random, -0.28, 0.28);
  return [
    { x: x - stagger / 2, z: z + width / 2 },   // levá noha
    { x: x + stagger / 2, z: z - width / 2 },   // pravá noha
  ];
}

/**
 * Hloubka (x) hráčů jednoho sloupce. Normálně přední u sítě nebo v poli
 * a zadní za ním; při chybě stojí přední hráč hluboko a zadní před ním.
 */
function columnDepths(random, isFault) {
  if (isFault) {
    const front = uniform(random, 3.2, 6.8);
    return { front, back: uniform(random, 0.9, front - 1.35) };
  }
  const front = random() < 0.4 ? uniform(random, 0.6, 1.4) : uniform(random, 1.2, 4.4);
  return { front, back: uniform(random, front + 1.35, Math.max(front + 1.4, 8.2)) };
}

/** Pořadí řady zleva doprava; při chybě se dva sousední hráči prohodí. */
function rowOrder(row, fault) {
  const order = [...row];
  if (fault?.kind === 'row') {
    const i = order.indexOf(fault.left), j = order.indexOf(fault.right);
    if (i >= 0 && j >= 0) [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function farEnough(points) {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z) < MIN_GAP) return false;
    }
  }
  return true;
}

function sameFault(relations, fault) {
  const faults = relations.filter(r => r.status === 'fault');
  if (!fault) return faults.length === 0;
  return faults.length === 1 && faults[0].kind === fault.kind &&
    (fault.kind === 'column'
      ? faults[0].front === fault.front && faults[0].back === fault.back
      : faults[0].left === fault.left && faults[0].right === fault.right);
}

/** Šest různých čísel dresů 1–20. */
function jerseyNumbers(random) {
  return shuffle(random, Array.from({ length: 20 }, (_, i) => i + 1)).slice(0, 6);
}

/** Podávající tým: stojí kdekoli na své polovině, podávající za koncovou čarou. */
function servingTeam(random) {
  const numbers = jerseyNumbers(random);
  const players = [];
  while (players.length < 5) {
    const candidate = { x: -uniform(random, 0.7, 8.3), z: uniform(random, -4, 4) };
    if (farEnough([...players, candidate])) players.push(candidate);
  }
  const server = { x: -COURT.length - uniform(random, 0.8, 2.2), z: uniform(random, -3.8, 3.8), server: true };
  return [...players, server].map((p, i) => ({ jersey: numbers[i], feet: makeFeet(random, p.x, p.z), server: !!p.server }));
}

/**
 * Nová situace. Vrací { receiving: [{ position, jersey, feet }], serving: [...],
 * relations: [vztahy se stavem], fault: porušený vztah nebo null }.
 * random = funkce jako Math.random (v testech jde podstrčit vlastní).
 */
export function generateSituation(random = Math.random, { faultChance = 0.6 } = {}) {
  const fault = random() < faultChance ? pick(random, FAULTS) : null;
  const numbers = jerseyNumbers(random);

  for (let attempt = 0; attempt < 2000; attempt++) {
    const centers = {};
    const front = rowOrder(FRONT_ROW, fault), back = rowOrder(BACK_ROW, fault);
    const frontZ = spreadValues(random, -3.9, 3.9, 1.2), backZ = spreadValues(random, -3.9, 3.9, 1.2);
    front.forEach((position, i) => { centers[position] = { z: frontZ[i] }; });
    back.forEach((position, i) => { centers[position] = { z: backZ[i] }; });
    for (const [f, b] of [[4, 5], [3, 6], [2, 1]]) {
      const isFault = fault?.kind === 'column' && fault.front === f;
      const depth = columnDepths(random, isFault);
      centers[f].x = depth.front;
      centers[b].x = depth.back;
    }
    if (!farEnough(Object.values(centers))) continue;

    const byPosition = {};
    for (const position of [1, 2, 3, 4, 5, 6]) {
      byPosition[position] = { position, jersey: numbers[position - 1], feet: makeFeet(random, centers[position].x, centers[position].z) };
    }
    const relations = checkAll(byPosition);
    if (relations.some(r => r.status === 'unclear') || !sameFault(relations, fault)) continue;

    return {
      receiving: Object.values(byPosition),
      serving: servingTeam(random),
      relations,
      fault: relations.find(r => r.status === 'fault') ?? null,
    };
  }
  throw new Error('Nepodařilo se vytvořit situaci.');
}

/** Pozice hráčů, kteří jsou v porušeném vztahu (prázdné = postavení je správné). */
export function faultyPositions(situation) {
  if (!situation.fault) return [];
  const f = situation.fault;
  return f.kind === 'column' ? [f.front, f.back] : [f.left, f.right];
}

/**
 * Vyhodnocení odpovědi. answer = { correctLineup: true } nebo { positions: [a, b] }.
 * Správně je jen přesná dvojice hráčů v chybném vztahu, nebo „správné“ u správného postavení.
 */
export function isCorrectAnswer(situation, answer) {
  const faulty = faultyPositions(situation);
  if (answer.correctLineup) return faulty.length === 0;
  const chosen = [...answer.positions].sort();
  return faulty.length === chosen.length && [...faulty].sort().every((p, i) => p === chosen[i]);
}

// Výchozí podávající tým pro scény u otázek (data ho neuvádějí): pět hráčů
// rozestavěných po poli a podávající za koncovou čarou.
const DEFAULT_SERVING = [
  { x: -1.2, z: 2.6 }, { x: -1.5, z: -0.4 }, { x: -1.0, z: -3.0 },
  { x: -5.6, z: 1.6 }, { x: -6.2, z: -2.0 }, { x: -10.2, z: -2.6, server: true },
];

/**
 * Pevná situace z dat otázky (media typ "postaveni"):
 * hraci = [{ pozice, cislo, x, z }] – x = vzdálenost od sítě, z = napříč
 * (kladné vlevo z pohledu týmu), viz souřadnice nahoře. Chodidla se
 * dopočítají vedle sebe kolem středu. Vrací situaci pro renderScene.
 */
export function situationFromData({ hraci, podavajici = DEFAULT_SERVING }) {
  const feetAround = (x, z) => [{ x, z: z + 0.18 }, { x, z: z - 0.18 }];
  // chodidla: [{ x, z }, { x, z }] jde zadat i přímo (např. jedna noha za postranní čarou)
  const receiving = hraci.map(h => ({ position: h.pozice, jersey: h.cislo, feet: h.chodidla ?? feetAround(h.x, h.z) }));
  const serving = podavajici.map((p, i) => ({ jersey: p.cislo ?? [3, 8, 11, 14, 17, 9][i % 6], feet: feetAround(p.x, p.z), server: !!p.server }));
  const relations = checkAll(Object.fromEntries(receiving.map(p => [p.position, p])));
  return { receiving, serving, relations, fault: relations.find(r => r.status === 'fault') ?? null };
}
