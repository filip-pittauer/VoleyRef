// Prototyp animací – pohyb postav a míče (nic nekreslí).
// Z dat situace (situace.json) spočítá v čase t polohu kloubů každého hráče
// a polohu míče. Stejná data pak kreslí varianta A (SVG) i B (Three.js).
//
// Svět v metrech jako v court-scene.js: x podél hřiště (síť x = 0, družstvo A
// na kladné straně), y nahoru, z napříč. Póza = poloha chodidel a rukou vůči
// pánvi v souřadnicích těla [vpřed, nahoru, vlevo]; kolena a lokty dopočítá
// inverzní kinematika (stejná jako u gest rozhodčího).
import { add, sub, scale, dot, lerp, normalize, solveTwoBone, sampleSmooth } from '../js/math3d.js';

// rozměry hráče kolem 195 cm (dosah ve stoje asi 2,4 m)
export const BODY = {
  hipHalf: 0.1, thigh: 0.48, shin: 0.48, ankle: 0.08,
  spine: 0.55, shoulderHalf: 0.21, upperArm: 0.33, forearm: 0.3, neck: 0.1, headR: 0.11,
};
const K = 1.07;   // pózy jsou zapsané pro menší postavu – svislé míry se násobí
const UP = [0, 1, 0];
const G = 9.81;
const BALL_R = 0.105;

// Pózy: pelvis = výška pánve nad zemí (stojí-li na zemi), lean = předklon (°),
// feet/hands = [levá, pravá] vůči pánvi [vpřed, nahoru, vlevo].
const RAW_POSES = {
  stand: { pelvis: 0.95, lean: 3, feet: [[0.02, -0.87, 0.13], [-0.02, -0.87, -0.13]], hands: [[0.05, -0.15, 0.27], [0.05, -0.15, -0.27]] },
  ready: { pelvis: 0.78, lean: 25, feet: [[0.12, -0.7, 0.3], [-0.05, -0.7, -0.3]], hands: [[0.42, 0.12, 0.18], [0.42, 0.12, -0.18]] },
  bump: { pelvis: 0.74, lean: 30, feet: [[0.15, -0.66, 0.3], [-0.05, -0.66, -0.3]], hands: [[0.5, -0.02, 0.03], [0.5, -0.02, -0.03]] },
  set: { pelvis: 0.9, lean: 0, feet: [[0.1, -0.82, 0.15], [-0.1, -0.82, -0.15]], hands: [[0.12, 1.02, 0.1], [0.12, 1.02, -0.1]] },
  setFollow: { pelvis: 0.94, lean: -3, feet: [[0.1, -0.86, 0.15], [-0.1, -0.86, -0.15]], hands: [[0.18, 1.18, 0.12], [0.18, 1.18, -0.12]] },
  plant: { pelvis: 0.7, lean: 30, feet: [[0.28, -0.62, 0.14], [0.08, -0.62, -0.14]], hands: [[-0.45, 0.15, 0.25], [-0.45, 0.15, -0.25]] },
  jumpUp: { pelvis: 0.95, lean: 5, feet: [[0, -0.86, 0.1], [-0.05, -0.84, -0.1]], hands: [[0.25, 1.05, 0.15], [0.1, 1.0, -0.2]] },
  spikeCock: { pelvis: 0.95, lean: -8, feet: [[-0.15, -0.72, 0.12], [-0.22, -0.66, -0.12]], hands: [[0.35, 1.05, 0.15], [-0.2, 1.0, -0.3]] },
  spikeHit: { pelvis: 0.95, lean: 12, feet: [[0.05, -0.8, 0.12], [0, -0.8, -0.12]], hands: [[0.25, 0.35, 0.25], [0.26, 1.12, -0.14]] },
  spikeFollow: { pelvis: 0.95, lean: 25, feet: [[0.08, -0.82, 0.12], [0.02, -0.82, -0.12]], hands: [[0.1, 0.2, 0.25], [0.35, 0.2, 0.05]] },
  land: { pelvis: 0.72, lean: 25, feet: [[0.1, -0.64, 0.18], [-0.05, -0.64, -0.18]], hands: [[0.3, 0.25, 0.3], [0.25, 0.15, -0.3]] },
  blockReady: { pelvis: 0.85, lean: 5, feet: [[0.02, -0.77, 0.22], [0.02, -0.77, -0.22]], hands: [[0.25, 0.62, 0.22], [0.25, 0.62, -0.22]] },
  blockLoad: { pelvis: 0.68, lean: 12, feet: [[0.02, -0.6, 0.22], [0.02, -0.6, -0.22]], hands: [[0.25, 0.45, 0.22], [0.25, 0.45, -0.22]] },
  blockUp: { pelvis: 0.97, lean: 0, feet: [[0, -0.88, 0.15], [0, -0.88, -0.15]], hands: [[0.32, 1.18, 0.14], [0.32, 1.18, -0.14]] },
};

const scaleUp = ([a, b, c]) => [a, b * K, c];
const POSES = Object.fromEntries(Object.entries(RAW_POSES).map(([name, p]) =>
  [name, { ...p, pelvis: p.pelvis * K, feet: p.feet.map(scaleUp), hands: p.hands.map(scaleUp) }]));

const STRIDE = 1.5;   // délka dvojkroku při běhu (m)

/** Běh: chodidla a ruce se střídají podle fáze kroku; dir = směr běhu v souřadnicích těla [vpřed, vlevo]. */
function runPose(phase, dir) {
  const step = (sign, k) => {
    const s = Math.sin(phase + (sign > 0 ? 0 : Math.PI));
    const lift = Math.max(0, Math.cos(phase + (sign > 0 ? 0 : Math.PI))) * 0.2;
    return [dir[0] * 0.38 * s + k[0], (-0.84 + lift) * K, dir[1] * 0.38 * s + k[1]];
  };
  const arm = (sign, side) => {
    const s = Math.sin(phase + (sign > 0 ? Math.PI : 0));
    return [0.08 + 0.28 * s, 0.25 + 0.1 * Math.abs(s), side * 0.24];
  };
  return {
    pelvis: 0.92 * K, lean: 14,
    feet: [step(1, [0, 0.11]), step(-1, [0, -0.11])],
    hands: [arm(1, 1), arm(-1, -1)],
  };
}

const smoothstep = s => s * s * (3 - 2 * s);
const mixPose = (a, b, k) => ({
  pelvis: a.pelvis + (b.pelvis - a.pelvis) * k,
  lean: a.lean + (b.lean - a.lean) * k,
  feet: a.feet.map((f, i) => lerp(f, b.feet[i], k)),
  hands: a.hands.map((h, i) => lerp(h, b.hands[i], k)),
});

/** Připraví hráče: dráhu, pózy, skoky a uraženou vzdálenost (pro fázi běhu). */
function preparePlayer(data, duration) {
  const facing = data.smer ?? (data.tym === 'A' ? [-1, 0] : [1, 0]);
  const forward = normalize([facing[0], 0, facing[1]]);
  const left = [forward[2], 0, -forward[0]];
  const track = (data.drahy ?? [[0, data.x, data.z]]).map(([t, x, z]) => ({ t, value: [x, z] }));
  const poses = data.pozy ?? [[0, 'ready']];
  const jumps = data.skoky ?? [];

  // uražená vzdálenost v čase (po 20 ms) – fáze kroku sedí s rychlostí
  const distance = [0];
  let prev = sampleSmooth(track, 0);
  for (let t = 0.02; t <= duration + 0.02; t += 0.02) {
    const p = sampleSmooth(track, t);
    distance.push(distance.at(-1) + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
  }
  return { ...data, forward, left, track, poses, jumps, distance };
}

/** Póza hráče v čase t (plynulé prolnutí mezi klíčovými pózami). */
function poseAt(player, t) {
  const resolve = name => {
    if (name !== 'run') return POSES[name];
    const i = Math.min(player.distance.length - 1, Math.max(0, Math.round(t / 0.02)));
    const p0 = sampleSmooth(player.track, Math.max(0, t - 0.05)), p1 = sampleSmooth(player.track, t + 0.05);
    const move = [p1[0] - p0[0], 0, p1[1] - p0[1]];
    const len = Math.hypot(move[0], move[2]);
    const dir = len > 1e-6
      ? [(move[0] * player.forward[0] + move[2] * player.forward[2]) / len, (move[0] * player.left[0] + move[2] * player.left[2]) / len]
      : [1, 0];
    return runPose((player.distance[i] / STRIDE) * Math.PI * 2, dir);
  };
  const keys = player.poses;
  if (t <= keys[0][0]) return resolve(keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, a] = keys[i - 1], [t1, b] = keys[i];
      return mixPose(resolve(a), resolve(b), smoothstep((t - t0) / (t1 - t0)));
    }
  }
  return resolve(keys.at(-1)[1]);
}

/** Výška výskoku v čase t (parabola mezi odrazem a dopadem). */
function liftAt(player, t) {
  for (const [from, to, height] of player.jumps) {
    if (t > from && t < to) {
      const s = (t - from) / (to - from);
      return 4 * height * s * (1 - s);
    }
  }
  return 0;
}

/**
 * Klouby hráče v čase t (body ve světě): pelvis, chest, neck, head, shoulders,
 * elbows, hands, hips, knees, ankles ([levý, pravý]) + forward/left/spine.
 */
export function jointsAt(player, t) {
  const pose = poseAt(player, t);
  const [x, z] = sampleSmooth(player.track, t);
  const { forward: f, left: l } = player;
  const local = ([a, b, c]) => add(add(scale(f, a), scale(UP, b)), scale(l, c));

  const pelvis = [x, pose.pelvis + liftAt(player, t), z];
  const lean = pose.lean * Math.PI / 180;
  const spine = add(scale(UP, Math.cos(lean)), scale(f, Math.sin(lean)));
  const chest = add(pelvis, scale(spine, BODY.spine));
  const neck = add(chest, scale(spine, BODY.neck));
  const head = add(neck, scale(spine, BODY.headR + 0.02));

  const limb = (root, target, upper, lower, pole) => {
    const { elbow, wrist } = solveTwoBone(sub(target, root), upper, lower, pole);
    return [add(root, elbow), add(root, wrist)];
  };
  const sides = [1, -1];
  const shoulders = sides.map(s => add(add(chest, scale(l, s * BODY.shoulderHalf)), scale(spine, -0.03)));
  const hips = sides.map(s => add(add(pelvis, scale(l, s * BODY.hipHalf)), scale(UP, -0.05)));
  const arms = sides.map((s, i) => limb(shoulders[i], add(pelvis, local(pose.hands[i])), BODY.upperArm, BODY.forearm,
    add(add(scale(f, -0.3), scale(UP, -0.5)), scale(l, s * 0.6))));
  const legs = sides.map((s, i) => limb(hips[i], add(pelvis, local(pose.feet[i])), BODY.thigh, BODY.shin,
    add(f, scale(l, s * 0.15))));

  return {
    forward: f, left: l, spine, pelvis, chest, neck, head, shoulders, hips,
    elbows: arms.map(a => a[0]), hands: arms.map(a => a[1]),
    knees: legs.map(a => a[0]), ankles: legs.map(a => a[1]),
  };
}

// ---------- Míč ----------
/** Bod dráhy míče: pevný [x, y, z], nebo u ruky hráče (vyřeší se z kloubů). */
function ballPoint(point, players) {
  if (point.pozice) return point.pozice;
  const player = players.find(p => p.tym === point.tym && p.cislo === point.hrac);
  const j = jointsAt(player, point.t);
  const hand = point.ruka === 'L' ? j.hands[0] : point.ruka === 'P' ? j.hands[1] : lerp(j.hands[0], j.hands[1], 0.5);
  const [a, b, c] = point.posun ?? [0, 0, 0];
  return add(hand, add(add(scale(j.forward, a), scale(UP, b)), scale(j.left, c)));
}

/** Míč v čase t: mezi body letí po parabole (gravitace), u "valí" se kutálí po zemi. */
function ballAt(points, t) {
  if (t <= points[0].t) return points[0].at;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (t > b.t) continue;
    const T = b.t - a.t, tau = t - a.t, s = tau / T;
    const pos = lerp(a.at, b.at, s);
    if (b.vali) return pos;
    const vy = (b.at[1] - a.at[1] + G * T * T / 2) / T;
    return [pos[0], a.at[1] + vy * tau - G * tau * tau / 2, pos[2]];
  }
  return points.at(-1).at;
}

/** Připraví celou situaci: { duration, players, frameAt(t), captionAt(t), highlights }. */
export function createSituation(data) {
  const players = data.hraci.map(p => preparePlayer(p, data.delka));
  const ball = data.mic.map(p => ({ t: p.t, vali: p.vali, at: ballPoint(p, players) }));
  ball.forEach(p => { if (p.at[1] < BALL_R) p.at[1] = BALL_R; });
  // zvýraznění: čára [x1, z1, x2, z2], nebo kroužek u špičky chodidla v okamžiku odrazu
  const highlights = (data.zvyrazneni ?? []).map(h => {
    if (h.cara) return { od: h.od, do: h.do, line: h.cara };
    const player = players.find(p => p.tym === h.chodidlo.tym && p.cislo === h.chodidlo.hrac);
    const j = jointsAt(player, h.chodidlo.t);
    const toes = [0, 1].map(side => toeOf(j, side));
    const front = toes.reduce((a, b) => (dot(b, j.forward) > dot(a, j.forward) ? b : a));
    return { od: h.od, do: h.do, ring: [front[0], front[2]] };
  });

  return {
    duration: data.delka,
    players,
    radius: BALL_R,
    /** Snímek v čase t: klouby všech hráčů a poloha míče. */
    frameAt(t) {
      return {
        players: players.map(p => ({ team: p.tym, number: p.cislo, joints: jointsAt(p, t) })),
        ball: t >= ball[0].t ? ballAt(ball, t) : null,
        highlights: highlights.filter(h => t >= h.od && t <= h.do),
      };
    },
    captionAt: t => data.texty.find(x => t >= x.od && t < x.do)?.text ?? '',
  };
}


/** Kde je špička chodidla (pro zvýraznění odrazu na čáře). */
export function toeOf(joints, side) {
  return add(joints.ankles[side], scale(joints.forward, 0.16));
}
