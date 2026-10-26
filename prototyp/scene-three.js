// Prototyp – varianta B: stejná situace ve WebGL přes Three.js.
// Postavy jsou figuríny z válců a koulí, které se v každém snímku natočí
// mezi klouby z motion.js; světlo vrhá stíny. Knihovna je v js/vendor/
// (npm three@0.186.1 beze změny, licence MIT).
import * as THREE from '../js/vendor/three-0.186.1/three.module.js';

const COLORS = {
  wall: '#c9d3e0', free: '#2f6f9f', court: '#e98a3c', line: '#ffffff',
  skin: '#dba27a', hair: '#3b2414', shoe: '#1f2937', sock: '#f8fafc', post: '#94a3b8',
  A: { jersey: '#d61f2c', shorts: '#111827' },
  B: { jersey: '#1e3a8a', shorts: '#f8fafc' },
};
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);

const material = color => new THREE.MeshStandardMaterial({ color, roughness: 0.75 });

/** Textura z <canvas> (pruhy antény, síť, čísla, míč). */
function canvasTexture(width, height, draw, { nearest = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (nearest) texture.magFilter = THREE.NearestFilter;
  return texture;
}

// ---------- Hala, hřiště, síť ----------
function floorPlane(x1, x2, z1, z2, color, y) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), material(color));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  mesh.receiveShadow = true;
  return mesh;
}

function buildCourt(scene) {
  scene.add(floorPlane(-16, 16, -12, 12, COLORS.free, 0));
  scene.add(floorPlane(-9, 9, -4.5, 4.5, COLORS.court, 0.001));
  const w = 0.05;   // čáry 5 cm uvnitř hřiště
  const lines = [[9 - w, 9, -4.5, 4.5], [-9, -9 + w, -4.5, 4.5], [-9, 9, 4.5 - w, 4.5], [-9, 9, -4.5, -4.5 + w],
    [-w / 2, w / 2, -4.5, 4.5], [3 - w, 3, -4.5, 4.5], [-3, -3 + w, -4.5, 4.5]];
  for (const [x1, x2, z1, z2] of lines) scene.add(floorPlane(x1, x2, z1, z2, COLORS.line, 0.002));
}

function buildNet(scene) {
  const post = new THREE.CylinderGeometry(0.05, 0.05, 2.55, 16);
  for (const z of [-5.5, 5.5]) {
    const mesh = new THREE.Mesh(post, material(COLORS.post));
    mesh.position.set(0, 1.275, z);
    mesh.castShadow = true;
    scene.add(mesh);
  }
  // síť: průsvitná textura s oky 10 cm
  const mesh = canvasTexture(1000, 100, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.lineWidth = 1.6;
    for (let x = 0; x <= w; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(10, 1),
    new THREE.MeshStandardMaterial({ map: mesh, transparent: true, side: THREE.DoubleSide, alphaTest: 0.05, roughness: 0.9 }));
  net.rotation.y = Math.PI / 2;
  net.position.set(0, 1.93, 0);
  net.castShadow = true;
  scene.add(net);
  // horní páska, spodní lanko, postranní pásky
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 10), material('#ffffff'));
  band.position.set(0, 2.395, 0);
  band.castShadow = true;
  scene.add(band);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 10), material('#e2e8f0'));
  bottom.position.set(0, 1.445, 0);
  scene.add(bottom);
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1, 0.05), material('#ffffff'));
    strip.position.set(0, 1.93, side * 4.475);
    scene.add(strip);
    // anténa: 1,8 m, pruhy po 10 cm (nad sítí 80 cm)
    const stripes = canvasTexture(2, 18, (ctx) => {
      for (let i = 0; i < 18; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#dc2626'; ctx.fillRect(0, i, 2, 1); }
    }, { nearest: true });
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.8, 8),
      new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5 }));
    antenna.position.set(0, 1.43 + 0.9, side * 4.55);
    antenna.castShadow = true;
    scene.add(antenna);
  }
}

// ---------- Postava ----------
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 14);
const SPHERE = new THREE.SphereGeometry(1, 18, 12);
const HAIR = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
const TORSO = new THREE.CapsuleGeometry(1, 1.2, 6, 16);
const SHOE = new THREE.BoxGeometry(0.11, 0.08, 0.28);

/** Číslo dresu jako textura (bílé s tmavým obrysem). */
function numberTexture(number) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.font = 'bold 84px Barlow Condensed, Arial Narrow, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.strokeText(String(number), w / 2, h / 2 + 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(number), w / 2, h / 2 + 4);
  });
}

/** Postava jednoho hráče: meshe se v update(j) natočí podle kloubů. */
function createFigure(scene, team, number) {
  const mats = {
    skin: material(COLORS.skin), hair: material(COLORS.hair), shoe: material(COLORS.shoe), sock: material(COLORS.sock),
    jersey: material(COLORS[team].jersey), shorts: material(COLORS[team].shorts),
  };
  const add = (geometry, mat) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const limb = (mat, radius) => ({ mesh: add(CYLINDER, mat), radius });
  const ball = (mat, radius) => ({ mesh: add(SPHERE, mat), radius });

  const torsoGroup = new THREE.Group();
  scene.add(torsoGroup);
  const torso = new THREE.Mesh(TORSO, mats.jersey);
  torso.castShadow = true;
  torso.scale.set(0.19, 0.17, 0.115);
  torso.position.y = 0.3;
  torsoGroup.add(torso);
  const shorts = new THREE.Mesh(CYLINDER, mats.shorts);
  shorts.castShadow = true;
  shorts.scale.set(0.18, 0.24, 0.125);
  shorts.position.y = -0.02;
  torsoGroup.add(shorts);
  const numberMaterial = new THREE.MeshBasicMaterial({ map: numberTexture(number), transparent: true });
  for (const side of [1, -1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), numberMaterial);
    plate.position.set(0, 0.33, side * 0.122);
    if (side < 0) plate.rotation.y = Math.PI;
    torsoGroup.add(plate);
  }

  const parts = {
    thighs: [limb(mats.skin, 0.072), limb(mats.skin, 0.072)],
    shortLegs: [limb(mats.shorts, 0.088), limb(mats.shorts, 0.088)],
    shins: [limb(mats.skin, 0.052), limb(mats.skin, 0.052)],
    socks: [limb(mats.sock, 0.056), limb(mats.sock, 0.056)],
    knees: [ball(mats.skin, 0.058), ball(mats.skin, 0.058)],
    shoes: [add(SHOE, mats.shoe), add(SHOE, mats.shoe)],
    uppers: [limb(mats.skin, 0.046), limb(mats.skin, 0.046)],
    sleeves: [limb(mats.jersey, 0.062), limb(mats.jersey, 0.062)],
    shoulders: [ball(mats.jersey, 0.07), ball(mats.jersey, 0.07)],
    forearms: [limb(mats.skin, 0.04), limb(mats.skin, 0.04)],
    elbows: [ball(mats.skin, 0.044), ball(mats.skin, 0.044)],
    hands: [ball(mats.skin, 0.052), ball(mats.skin, 0.052)],
    neck: limb(mats.skin, 0.05),
    head: ball(mats.skin, 0.11),
    hair: add(HAIR, mats.hair),
  };

  const tmp = new THREE.Vector3();
  const setLimb = ({ mesh, radius }, a, b) => {
    const from = v3(a), to = v3(b);
    tmp.subVectors(to, from);
    const length = tmp.length();
    mesh.position.copy(from).addScaledVector(tmp, 0.5);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, tmp.normalize());
    mesh.scale.set(radius, length, radius);
  };
  const setBall = ({ mesh, radius }, p) => { mesh.position.copy(v3(p)); mesh.scale.setScalar(radius); };
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const basis = new THREE.Matrix4();

  return {
    update(j) {
      // trup: osy x = vlevo, y = páteř, z = vpřed (pravotočivá soustava)
      const left = v3(j.left), spine = v3(j.spine);
      const forward = new THREE.Vector3().crossVectors(left, spine);
      basis.makeBasis(left, spine, forward);
      torsoGroup.position.copy(v3(j.pelvis));
      torsoGroup.quaternion.setFromRotationMatrix(basis);

      for (let i = 0; i < 2; i++) {
        setLimb(parts.thighs[i], j.hips[i], j.knees[i]);
        setLimb(parts.shortLegs[i], j.hips[i], mix(j.hips[i], j.knees[i], 0.38));
        setLimb(parts.shins[i], j.knees[i], j.ankles[i]);
        setLimb(parts.socks[i], j.ankles[i], mix(j.ankles[i], j.knees[i], 0.3));
        setBall(parts.knees[i], j.knees[i]);
        const shoe = parts.shoes[i];
        shoe.position.set(j.ankles[i][0] + j.forward[0] * 0.06, j.ankles[i][1] - 0.035, j.ankles[i][2] + j.forward[2] * 0.06);
        shoe.rotation.set(0, Math.atan2(j.forward[0], j.forward[2]), 0);
        setLimb(parts.uppers[i], j.shoulders[i], j.elbows[i]);
        setLimb(parts.sleeves[i], j.shoulders[i], mix(j.shoulders[i], j.elbows[i], 0.5));
        setBall(parts.shoulders[i], j.shoulders[i]);
        setLimb(parts.forearms[i], j.elbows[i], j.hands[i]);
        setBall(parts.elbows[i], j.elbows[i]);
        setBall(parts.hands[i], j.hands[i]);
      }
      setLimb(parts.neck, j.chest, j.neck);
      setBall(parts.head, j.head);
      // vlasy: čepička natočená dozadu (obličej zůstane vidět)
      parts.hair.position.copy(v3(j.head)).addScaledVector(v3(j.forward), -0.012);
      parts.hair.scale.setScalar(0.116);
      parts.hair.quaternion.setFromUnitVectors(Y_AXIS, spine.clone().addScaledVector(forward, -0.55).normalize());
    },
  };
}

/** Míč Mikasa: žluté a modré pruhy. */
function createBall(scene) {
  const texture = canvasTexture(256, 128, (ctx, w, h) => {
    const colors = ['#f5c400', '#1f4fa8', '#f5c400', '#1f4fa8', '#f5c400', '#1f4fa8'];
    colors.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, (i * h) / colors.length, w, h / colors.length + 1); });
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.105, 32, 20), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45 }));
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

/** Popis grafiky pro diagnostiku: verze WebGL a grafický čip. */
function describeGpu(renderer) {
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return `${renderer.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL 1'} · ${gpu}`;
}

/**
 * Varianty kvality v pořadí zkoušení. Na mobilu s PowerVR vysoká naběhne a za
 * pár sekund spadne (kontext se ztratí) – další varianty se od vysoké liší vždy
 * jen jednou věcí, aby bylo poznat, co pád způsobuje: vyhlazování (MSAA), druh
 * stínů (PCF = měkčí, víc vzorků v shaderu; basic = jeden vzorek), nebo stíny vůbec.
 */
export const QUALITIES = [
  { id: 'vysoka', label: 'vysoká', antialias: true, maxRatio: 2, shadows: 2048 },
  { id: 'bez-msaa', label: 'bez MSAA, rozlišení až 2,5×', antialias: false, maxRatio: 2.5, shadows: 2048 },
  { id: 'stiny-basic', label: 'jednoduché stíny', antialias: true, maxRatio: 2, shadows: 2048, shadowType: 'basic' },
  { id: 'bez-stinu', label: 'bez stínů', antialias: true, maxRatio: 2, shadows: 0 },
  { id: 'nizka', label: 'nízká', antialias: false, maxRatio: 1, shadows: 0, lowPower: true },
];

/**
 * Vytvoří WebGL scénu. Vrací { canvas, info, lost, setView(view), render(frame), resize(), dispose() }.
 * view = { eye, target, up?, bounds } – stejný výřez jako SVG varianta.
 * quality = jeden z QUALITIES. onLost() – grafika v prohlížeči spadla.
 * Když WebGL kontext nejde vytvořit, Three.js vyhodí výjimku.
 */
export function createThreeScene({ quality = QUALITIES[0], onLost } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, powerPreference: quality.lowPower ? 'low-power' : 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxRatio));
  renderer.shadowMap.enabled = quality.shadows > 0;
  if (quality.shadowType === 'basic') renderer.shadowMap.type = THREE.BasicShadowMap;
  const canvas = renderer.domElement;
  // ztráta kontextu = prohlížeč grafiku zastavil (málo paměti, ovladač…); bez
  // preventDefault by se už nikdy neobnovila
  let lost = false;
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; onLost?.(); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; });
  canvas.className = 'proto-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Animace situace (Three.js)');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.wall);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7a90, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(5, 14, -6);
  sun.castShadow = quality.shadows > 0;
  if (quality.shadows) sun.shadow.mapSize.set(quality.shadows, quality.shadows);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  buildCourt(scene);
  buildNet(scene);
  const ball = createBall(scene);
  const figures = new Map();

  const red = new THREE.MeshBasicMaterial({ color: '#dc2626', transparent: true, opacity: 0.85 });
  const markLine = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 9), red);
  markLine.rotation.x = -Math.PI / 2;
  const markRing = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.23, 40), red);
  markRing.rotation.x = -Math.PI / 2;
  scene.add(markLine, markRing);

  const camera = new THREE.PerspectiveCamera();
  let view = null;
  let lastFrame = null;

  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
  }

  function draw() {
    if (lost) return;
    resize();
    renderer.render(scene, camera);
  }

  return {
    canvas,
    info: describeGpu(renderer),
    get lost() { return lost; },
    setView(next) {
      view = next;
      camera.position.copy(v3(view.eye));
      camera.up.copy(v3(view.up ?? [0, 1, 0]));
      camera.lookAt(v3(view.target));
      camera.updateMatrixWorld();
      // stejný výřez jako SVG: plátno 1 m před okem → hranice frustra ve vzdálenosti near
      const near = 0.1, [x, y, w, h] = view.bounds;
      camera.projectionMatrix.makePerspective(x * near, (x + w) * near, -y * near, -(y + h) * near, near, 100);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      if (lastFrame) this.render(lastFrame);
    },
    render(frame) {
      lastFrame = frame;
      for (const p of frame.players) {
        const key = `${p.team}${p.number}`;
        if (!figures.has(key)) figures.set(key, createFigure(scene, p.team, p.number));
        figures.get(key).update(p.joints);
      }
      ball.visible = Boolean(frame.ball);
      if (frame.ball) {
        ball.position.copy(v3(frame.ball));
        ball.rotation.set(frame.ball[0] * 2.2, frame.ball[2] * 1.3, 0);   // míč se otáčí podle dráhy
      }
      const line = frame.highlights.find(h => h.line)?.line;
      markLine.visible = Boolean(line);
      if (line) markLine.position.set((line[0] + line[2]) / 2, 0.004, (line[1] + line[3]) / 2);
      const ring = frame.highlights.find(h => h.ring)?.ring;
      markRing.visible = Boolean(ring);
      if (ring) markRing.position.set(ring[0], 0.005, ring[1]);
      draw();
    },
    resize: () => { if (lastFrame) draw(); },
    // uvolní GPU paměť před pokusem s nižší kvalitou
    dispose() { renderer.dispose(); canvas.remove(); },
  };
}
