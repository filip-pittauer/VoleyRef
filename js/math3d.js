// Malá 3D matematika pro animovanou postavu rozhodčího a hřiště v trenažéru postavení.
// Vektor je obyčejné pole [x, y, z] v metrech (v C# by to byl struct Vector3).

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = a => Math.hypot(a[0], a[1], a[2]);
export const lerp = (a, b, k) => add(a, scale(sub(b, a), k));

/** Vektorový součin (kolmý na oba vektory). */
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Jednotkový vektor stejného směru; u nulového vrátí fallback. */
export function normalize(a, fallback = [0, -1, 0]) {
  const len = length(a);
  return len < 1e-9 ? fallback : scale(a, 1 / len);
}

/** Část vektoru v kolmá na jednotkový směr dir. */
export const perpendicular = (v, dir) => sub(v, scale(dir, dot(v, dir)));

/** Libovolný jednotkový vektor kolmý na dir (záchrana, když jiný směr chybí). */
export function anyPerpendicular(dir) {
  const helper = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize(cross(dir, helper));
}

// ---------- Kamera ----------
/**
 * Pravoúhlé promítání (bez perspektivy) pro SVG.
 * yaw = otočení scény kolem svislé osy, pitch = pohled mírně shora (stupně).
 * Vrací funkci bod → { x, y, depth }: y míří v SVG dolů, větší depth = blíž divákovi.
 * Funkce je lineární, takže jde použít i na směry (např. kam míří dlaň).
 */
export function createProjection(yawDeg, pitchDeg) {
  const yaw = yawDeg * Math.PI / 180;
  const pitch = pitchDeg * Math.PI / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  return ([x, y, z]) => {
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    return { x: x1, y: -(y * cp - z1 * sp), depth: z1 * cp + y * sp };
  };
}

/**
 * Perspektivní kamera (jako oko nebo fotoaparát) – vzdálené věci jsou menší.
 * eye = kde je oko, target = kam se dívá (obojí v metrech).
 * toCamera: bod → [vpravo, nahoru, dopředu] vzhledem k oku;
 * project: bod → { x, y, depth } na „plátně“ 1 m před okem (y v SVG dolů,
 * větší depth = dál od oka – opačně než u createProjection).
 */
export function createPerspective(eye, target, up = [0, 1, 0]) {
  const forward = normalize(sub(target, eye));
  const right = normalize(cross(forward, up));
  const upward = cross(right, forward);
  const toCamera = p => {
    const d = sub(p, eye);
    return [dot(d, right), dot(d, upward), dot(d, forward)];
  };
  const fromCamera = ([x, y, z]) => ({ x: x / z, y: -y / z, depth: z });
  return { toCamera, fromCamera, project: p => fromCamera(toCamera(p)) };
}

/**
 * Ořízne mnohoúhelník (body v souřadnicích kamery) rovinou kousek před okem,
 * aby se nepromítaly body za zády (Sutherland–Hodgman pro jednu rovinu).
 */
export function clipNear(points, near) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const aIn = a[2] >= near, bIn = b[2] >= near;
    if (aIn) out.push(a);
    if (aIn !== bIn) out.push(lerp(a, b, (near - a[2]) / (b[2] - a[2])));
  }
  return out;
}

// ---------- Paže ----------
/**
 * Dvoukloubová inverzní kinematika (rameno → loket → zápěstí).
 * target = kam má dosáhnout zápěstí (vzhledem k rameni), pole = kam má
 * směřovat loket. Délky kostí zůstanou stejné: když je cíl moc daleko,
 * paže se natáhne a míří k němu.
 */
export function solveTwoBone(target, upper, lower, pole) {
  const reach = Math.min(Math.max(length(target), Math.abs(upper - lower) + 1e-3), upper + lower - 1e-4);
  const dir = normalize(target);
  // kosinová věta: jak daleko podél směru k cíli leží loket a jak moc stranou
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const aside = Math.sqrt(Math.max(0, upper * upper - along * along));
  const bend = normalize(perpendicular(pole, dir), anyPerpendicular(dir));
  return {
    elbow: add(scale(dir, along), scale(bend, aside)),
    wrist: scale(dir, reach),
  };
}

// ---------- Plynulý pohyb ----------
const same = (a, b) => a.every((value, i) => Math.abs(value - b[i]) < 1e-9);

/** Rychlost v klíčovém bodě i (Catmull-Rom); na zastaveních nula. */
function velocity(keys, i) {
  if (i === 0 || i === keys.length - 1) return keys[i].value.map(() => 0);
  const prev = keys[i - 1].value, cur = keys[i].value, next = keys[i + 1].value;
  const dt = keys[i + 1].t - keys[i - 1].t;
  if (dt <= 0 || same(prev, cur) || same(cur, next)) return cur.map(() => 0);
  return next.map((value, j) => (value - prev[j]) / dt);
}

/**
 * Hodnota v čase t na plynulé křivce přes klíčové body [{ t, value: [čísla] }].
 * Kubická Hermitova interpolace: křivka prochází všemi body, na začátku,
 * na konci a při zastavení (dva stejné body za sebou) plynule zpomalí.
 */
export function sampleSmooth(keys, t) {
  const last = keys.length - 1;
  if (t <= keys[0].t) return keys[0].value;
  if (t >= keys[last].t) return keys[last].value;

  // poslední úsek, který začíná nejpozději v čase t (přeskočí i úseky nulové délky)
  let i = 0;
  while (keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const dt = b.t - a.t;
  const s = (t - a.t) / dt;
  const va = velocity(keys, i), vb = velocity(keys, i + 1);

  // Hermitovy bázové funkce
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return a.value.map((value, j) => h00 * value + h10 * va[j] * dt + h01 * b.value[j] + h11 * vb[j] * dt);
}

/** Index úseku, ve kterém leží čas t (pro hodnoty, které se mění skokem). */
export function segmentAt(keys, t) {
  let i = 0;
  while (i < keys.length - 1 && t > keys[i + 1].t) i++;
  return i;
}
