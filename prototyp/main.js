// Prototyp – porovnání animací: jedna časová osa řídí variantu A (SVG)
// i B (Three.js), takže obě ukazují vždy stejný okamžik ze stejné kamery.
import { createSituation } from './motion.js';
import { createSvgScene } from './scene-svg.js';
import { createThreeScene, QUALITIES } from './scene-three.js';

const ASPECT = 16 / 9;

// Pohledy: oko, místo, kam se dívá (metry, souřadnice jako v motion.js),
// a vodorovný zorný úhel kamery (°).
const VIEWS = {
  ref1: { label: '1. rozhodčí', eye: [0, 3.1, -6.4], target: [1.2, 1.4, 0.2], fov: 80 },
  ref2: { label: '2. rozhodčí', eye: [0, 1.75, 6.3], target: [1.2, 1.4, -0.2], fov: 80 },
  behind: { label: 'Za útočníkem', eye: [12.5, 3.6, 1.8], target: [0, 1.4, -0.8], fov: 62 },
  tv: { label: 'Televizní', eye: [1.5, 7.5, -15.5], target: [0, 1.0, 0], fov: 55 },
};

/** Výřez na plátně (1 m před okem) podle zorného úhlu, střed = kam se kamera dívá. */
function fitBounds(view) {
  const w = 2 * Math.tan((view.fov * Math.PI) / 360);
  const h = w / ASPECT;
  return [-w / 2, -h / 2, w, h];
}

const $ = id => document.getElementById(id);
const situation = createSituation(await (await fetch('situace.json')).json());
const svgScene = createSvgScene();
$('stage-a').append(svgScene.svg);

// Kvalita B: automatické pokusy od nejlepší (QUALITIES); ?kvalita=<id> začne
// zadaným stupněm – na ruční zkoušení jednotlivých nastavení.
const params = new URLSearchParams(location.search);
const firstLevel = Math.max(0, QUALITIES.findIndex(q => q.id === params.get('kvalita')));
const failed = [];   // stupně, které selhaly (pro diagnostiku)
const NO_SCENE = { setView() {}, render() {}, resize() {}, dispose() {} };   // A poběží dál

/** Místo plátna B ukáže, co se stalo. */
function showProblem(text) {
  const box = document.createElement('div');
  box.className = 'proto-problem';
  box.append(Object.assign(document.createElement('p'), { textContent: text }));
  $('stage-b').replaceChildren(box);
  $('info-b').textContent = `WebGL nedostupné · selhalo: ${failed.join('; ')}`;
}

/**
 * Zkusí vytvořit scénu B od stupně `level` dolů. Pád kontextu za běhu
 * (webglcontextlost bez obnovení do 2 s) = pokus o stupeň níž.
 */
function startThree(level) {
  for (let i = level; i < QUALITIES.length; i++) {
    const quality = QUALITIES[i];
    try {
      const scene = createThreeScene({
        quality,
        onLost: () => setTimeout(() => {
          if (!scene.lost || threeScene !== scene) return;
          failed.push(`${quality.label} (spadla za běhu)`);
          scene.dispose();
          startThree(i + 1);
        }, 2000),
      });
      $('stage-b').replaceChildren(scene.canvas);
      $('info-b').textContent = `${scene.info} · kvalita: ${quality.label}`
        + (failed.length ? ` · selhalo: ${failed.join('; ')}` : '');
      threeScene = scene;
      if (view) { scene.setView(view); draw(); }
      return;
    } catch (error) {
      console.error(error);
      failed.push(`${quality.label} (${error.message})`);
    }
  }
  threeScene = NO_SCENE;
  // po pádu grafiky Chrome často zablokuje WebGL pro celou stránku až do restartu prohlížeče
  showProblem('Grafiku (WebGL) se nepodařilo spustit v žádné kvalitě. Pokud předtím spadla, zkuste zavřít a znovu otevřít prohlížeč.');
}

let threeScene = NO_SCENE;
let view = null;
startThree(firstLevel);

// ---------- Kamera ----------
function setView(next) {
  view = { ...next, bounds: next.bounds ?? fitBounds(next) };
  svgScene.setView(view);
  threeScene.setView(view);
  draw();
}
for (const [id, preset] of Object.entries(VIEWS)) {
  const button = Object.assign(document.createElement('button'), { type: 'button', className: 'button button--small button--secondary', textContent: preset.label });
  button.addEventListener('click', () => {
    for (const b of $('views').children) b.setAttribute('aria-pressed', String(b === button));
    setView(preset);
  });
  button.setAttribute('aria-pressed', String(id === 'behind'));
  $('views').append(button);
}

// tažení myší / prstem: otočení kamery kolem místa, kam se dívá (výřez zůstane)
let drag = null;
for (const stage of [$('stage-a'), $('stage-b')]) {
  stage.addEventListener('pointerdown', event => {
    // jen na samotné animaci – zachycení ukazatele by jinak „spolklo“ klik na tlačítko v hlášce
    if (!event.target.closest('svg, canvas')) return;
    drag = { x: event.clientX, y: event.clientY, eye: view.eye };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (!drag) return;
    const yaw = (event.clientX - drag.x) * -0.008;
    const [tx, , tz] = view.target;
    const dx = drag.eye[0] - tx, dz = drag.eye[2] - tz;
    const eye = [tx + dx * Math.cos(yaw) - dz * Math.sin(yaw),
      Math.max(0.6, drag.eye[1] - (event.clientY - drag.y) * 0.02),
      tz + dx * Math.sin(yaw) + dz * Math.cos(yaw)];
    setView({ ...view, eye });
  });
  stage.addEventListener('pointerup', () => { drag = null; });
}

// ---------- Časová osa ----------
let time = 0, playing = false, last = null, speed = 1;
const slider = $('time');
slider.max = situation.duration;
const timing = { a: [], b: [] };

function draw() {
  const frame = situation.frameAt(time);
  let t0 = performance.now();
  svgScene.render(frame);
  timing.a.push(performance.now() - t0);
  t0 = performance.now();
  threeScene.render(frame);
  timing.b.push(performance.now() - t0);
  slider.value = time;
  $('caption').textContent = situation.captionAt(time);
  $('play').textContent = playing ? '⏸ Pauza' : time >= situation.duration ? '↺ Znovu' : '▶ Přehrát';
}

function tick(now) {
  if (!playing) return;
  if (last !== null) time = Math.min(situation.duration, time + ((now - last) / 1000) * speed);
  last = now;
  if (time >= situation.duration) playing = false;
  draw();
  if (playing) requestAnimationFrame(tick);
}

$('play').addEventListener('click', () => {
  if (playing) { playing = false; draw(); return; }
  if (time >= situation.duration) time = 0;
  playing = true;
  last = null;
  requestAnimationFrame(tick);
});
slider.addEventListener('input', () => { playing = false; time = Number(slider.value); draw(); });
for (const button of $('speeds').querySelectorAll('button')) {
  button.addEventListener('click', () => {
    speed = Number(button.dataset.speed);
    for (const b of $('speeds').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === button));
  });
}

// průměrná doba vykreslení snímku (ms) – jak náročná je která varianta
setInterval(() => {
  const avg = list => (list.length ? (list.reduce((s, v) => s + v, 0) / list.length).toFixed(1) : '–');
  $('perf-a').textContent = `${avg(timing.a)} ms / snímek`;
  $('perf-b').textContent = `${avg(timing.b)} ms / snímek`;
  timing.a.length = timing.b.length = 0;
}, 1000);

new ResizeObserver(() => threeScene.resize()).observe($('stage-b'));
setView(VIEWS.behind);
