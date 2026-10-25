// Převod dat gesta (gesta/gesta.json, formát v gesta/README.md) na polohu
// paží v libovolném čase. Nic nekreslí – jen počítá (kreslí referee-figure.js).
//
// Souřadnice paže jsou vztažené k jejímu rameni a „zrcadlené“:
// [ven, nahoru, vpřed] – „ven“ je u pravé paže doprava, u levé doleva.
// Díky tomu se stejná čísla dají použít pro obě ruce.
import {
  add, sub, scale, normalize, solveTwoBone, sampleSmooth, segmentAt,
} from './math3d.js';

// Rozměry postavy v metrech (počátek je uprostřed boků).
export const BODY = {
  shoulderX: 0.19,
  shoulderY: 0.50,
  upperArm: 0.29,
  forearm: 0.27,
};

const DIRECTIONS = {
  nahoru: [0, 1, 0],
  dolu: [0, -1, 0],
  vpred: [0, 0, 1],
  vzad: [0, 0, -1],
  ven: [1, 0, 0],
  dovnitr: [-1, 0, 0],
};

// Prsty míří ve směru předloktí (rovné zápěstí).
const FOLLOW_FOREARM = 'predlokti';

// Hodnoty, které platí, dokud je data nezmění (doplní je póza „klid“).
const BASE_KEY = {
  ruka: [0.06, -0.54, 0.05],
  loket: [0.35, -1, -0.25],
  prsty: FOLLOW_FOREARM,
  dlan: 'dovnitr',
  tvar: 'otevrena',
  drzi: null,
};

/** Směr zapsaný vektorem, nebo slovy: "vpred", "nahoru+ven"… → jednotkový vektor. */
function direction(value) {
  if (Array.isArray(value)) return normalize(value);
  const sum = value.split('+').reduce((acc, name) => {
    const dir = DIRECTIONS[name.trim()];
    if (!dir) throw new Error(`Neznámý směr „${name}“`);
    return add(acc, dir);
  }, [0, 0, 0]);
  return normalize(sum);
}

/** Klíčové body pohybu po kružnici (pole „kruh“ ve snímku). */
function circleKeys(key, circle) {
  const turns = circle.otacky ?? 1;
  const steps = Math.round(8 * turns);
  const start = (circle.faze ?? 0) * Math.PI / 180;
  const sign = circle.smer ?? 1;
  const r = circle.polomer;
  const offset = {
    bok: a => [0, Math.sin(a), Math.cos(a)],         // svislá rovina zepředu dozadu
    celo: a => [Math.cos(a), Math.sin(a), 0],        // svislá rovina před tělem
    vodorovna: a => [Math.cos(a), 0, Math.sin(a)],   // vodorovná rovina
  }[circle.rovina];
  if (!offset) throw new Error(`Neznámá rovina kruhu „${circle.rovina}“`);

  return Array.from({ length: steps + 1 }, (_, k) => {
    const angle = start + sign * 2 * Math.PI * turns * (k / steps);
    return { ...key, t: key.t + circle.doba * (k / steps), ruka: add(circle.stred, scale(offset(angle), r)) };
  });
}

/**
 * Doplní každý snímek o hodnoty z předchozího snímku a z pojmenované pózy
 * a rozvine kruhy. Výsledek: seznam úplných snímků seřazený podle času.
 */
function resolveKeys(keys, poses) {
  const resolved = [];
  let previous = { ...BASE_KEY, ...poses.klid };

  for (const key of keys) {
    if (key.poza && !poses[key.poza]) throw new Error(`Neznámá póza „${key.poza}“`);
    const { poza, kruh, ...own } = key;
    const full = { ...previous, ...(poza ? poses[poza] : {}), ...own };
    const added = kruh ? circleKeys(full, kruh) : [full];
    resolved.push(...added);
    previous = added.at(-1);
  }

  resolved.forEach((key, i) => {
    if (i > 0 && key.t < resolved[i - 1].t) throw new Error(`Snímky nejsou seřazené podle času (t = ${key.t})`);
  });
  return resolved;
}

/** Připraví stopy jedné paže pro rychlé dotazy „kde je paže v čase t“. */
function prepareArm(keys, poses) {
  const resolved = resolveKeys(keys?.length ? keys : [{ t: 0, poza: 'klid' }], poses);

  const frames = resolved.map(key => {
    const pole = direction(key.loket);
    const follow = key.prsty === FOLLOW_FOREARM;
    let fingers;
    if (follow) {
      // směr předloktí v tomto snímku (potřeba pro plynulý přechod na pevný směr)
      const { elbow, wrist } = solveTwoBone(key.ruka, BODY.upperArm, BODY.forearm, pole);
      fingers = normalize(sub(wrist, elbow));
    } else {
      fingers = direction(key.prsty);
    }
    return { t: key.t, wrist: key.ruka, pole, fingers, follow, palm: direction(key.dlan), shape: key.tvar, holds: key.drzi };
  });

  const track = name => frames.map(frame => ({ t: frame.t, value: frame[name] }));
  return { frames, wrist: track('wrist'), pole: track('pole'), fingers: track('fingers'), palm: track('palm') };
}

/** Hodnota, která se mění skokem (tvar ruky, karta) – přepne se v půlce přechodu. */
function discreteAt(frames, t, name) {
  const i = segmentAt(frames, t);
  const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
  if (b === a || t <= a.t) return a[name];
  return (t - a.t) / (b.t - a.t) < 0.5 ? a[name] : b[name];
}

/**
 * Paže v čase t: zápěstí a směr lokte plynule mezi snímky, z nich loket
 * (inverzní kinematika). Prsty buď sledují předloktí, nebo mají vlastní směr.
 */
function sampleArm(arm, t) {
  const target = sampleSmooth(arm.wrist, t);
  const pole = sampleSmooth(arm.pole, t);
  const { elbow, wrist } = solveTwoBone(target, BODY.upperArm, BODY.forearm, pole);
  const forearm = normalize(sub(wrist, elbow));

  const i = segmentAt(arm.frames, t);
  const next = Math.min(i + 1, arm.frames.length - 1);
  // prsty sledují předloktí jen když oba sousední snímky chtějí „predlokti“;
  // jinak se směr prstů plynule mění (tak vznikne i přechod na pevný směr)
  const followNow = arm.frames[i].follow && arm.frames[next].follow;

  return {
    elbow,
    wrist,
    fingers: followNow ? forearm : normalize(sampleSmooth(arm.fingers, t)),
    palm: normalize(sampleSmooth(arm.palm, t)),
    shape: discreteAt(arm.frames, t, 'shape'),
    holds: discreteAt(arm.frames, t, 'holds'),
  };
}

/**
 * Z dat gesta vytvoří funkci t → poloha postavy:
 * { twist (otočení těla ve stupních), right, left } – paže v souřadnicích ramene.
 */
export function createPoseSampler(gesture, poses) {
  const right = prepareArm(gesture.prava, poses);
  const left = prepareArm(gesture.leva, poses);
  const twist = (gesture.telo ?? [{ t: 0, otoceni: 0 }]).map(k => ({ t: k.t, value: [k.otoceni] }));

  return t => ({
    twist: sampleSmooth(twist, t)[0],
    right: sampleArm(right, t),
    left: sampleArm(left, t),
  });
}
