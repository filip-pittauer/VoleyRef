// Přiblížení SVG scény dvěma prsty (pinch) a posun jedním prstem, když je
// scéna přiblížená. Mění jen viewBox (výřez), obsah se nepřekresluje.
//
// Pointer Events sjednocují myš, dotyk i pero: každý prst je jeden „pointer“
// s vlastním pointerId, takže dva prsty = dva záznamy v mapě.
// CSS: na scéně touch-action: pan-y (jedním prstem jde stránka posouvat,
// gesto dvěma prsty dostane skript) a při přiblížení touch-action: none
// (posun jedním prstem pak posouvá výřez, ne stránku) – třída is-zoomed.

const MAX_SCALE = 4;

/**
 * Připojí zoom ke <svg>. Po každém překreslení scény (nový viewBox) zavolej
 * refresh(): když se výchozí výřez nezměnil, zůstane přiblížení zachované.
 * onChange(isZoomed) – např. pro tlačítko „Zrušit přiblížení“.
 */
export function attachPinchZoom(svg, { onChange } = {}) {
  let base = null;            // výchozí výřez [x, y, w, h] z poslední kresby
  let view = null;            // aktuální výřez
  let gesture = null;         // { type: 'pinch' | 'pan', … }
  let moved = false;          // gesto něčím pohnulo → potlačit následný klik
  const pointers = new Map(); // pointerId → { x, y } na obrazovce

  const isZoomed = () => Boolean(base && view && view[2] < base[2] - 1e-9);

  function apply() {
    svg.setAttribute('viewBox', view.join(' '));
    svg.classList.toggle('is-zoomed', isZoomed());
    onChange?.(isZoomed());
  }

  /** Výřez nesmí být větší než výchozí ani z něj vyjet. */
  function clamp([x, y, w]) {
    const [bx, by, bw, bh] = base;
    const width = Math.min(bw, Math.max(bw / MAX_SCALE, w));
    const height = width * bh / bw;
    return [
      Math.min(Math.max(x, bx), bx + bw - width),
      Math.min(Math.max(y, by), by + bh - height),
      width,
      height,
    ];
  }

  /** Bod na obrazovce → souřadnice ve výřezu. */
  function toScene(px, py, v = view) {
    const r = svg.getBoundingClientRect();
    return [v[0] + (px - r.left) / r.width * v[2], v[1] + (py - r.top) / r.height * v[3]];
  }

  const midpoint = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  /** Podle počtu prstů: dva = přiblížení, jeden u přiblížené scény = posun, jinak nic. */
  function startGesture() {
    if (pointers.size >= 2) {
      const m = midpoint();
      gesture = { type: 'pinch', startView: view, startDist: Math.max(m.dist, 1), anchor: toScene(m.x, m.y) };
    } else if (pointers.size === 1 && isZoomed()) {
      const [p] = pointers.values();
      gesture = { type: 'pan', startView: view, start: { ...p } };
    } else {
      gesture = null;
    }
  }

  svg.addEventListener('pointerdown', event => {
    if (!base) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) moved = false;
    startGesture();
  });

  svg.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const r = svg.getBoundingClientRect();

    if (gesture.type === 'pinch' && pointers.size >= 2) {
      const m = midpoint();
      // prsty od sebe na dvojnásobek → výřez poloviční šířky (2× přiblížení)
      const width = gesture.startView[2] * gesture.startDist / Math.max(m.dist, 1);
      const height = width * base[3] / base[2];
      // bod pod prsty zůstane pod prsty
      const x = gesture.anchor[0] - (m.x - r.left) / r.width * width;
      const y = gesture.anchor[1] - (m.y - r.top) / r.height * height;
      view = clamp([x, y, width]);
      moved = true;
      apply();
    } else if (gesture.type === 'pan') {
      const [p] = pointers.values();
      const dx = (p.x - gesture.start.x) / r.width * gesture.startView[2];
      const dy = (p.y - gesture.start.y) / r.height * gesture.startView[3];
      if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 6) moved = true;
      view = clamp([gesture.startView[0] - dx, gesture.startView[1] - dy, gesture.startView[2]]);
      apply();
    }
  });

  const end = event => {
    pointers.delete(event.pointerId);
    startGesture();     // z pinch může plynule navázat posun zbylým prstem
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', end);

  // po přiblížení nebo posunu nesmí „puštění prstu“ vybrat hráče
  // (true = fáze zachycení: poběží dřív než obsluha kliknutí na hráče)
  svg.addEventListener('click', event => {
    if (!moved) return;
    moved = false;
    event.stopImmediatePropagation();
    event.preventDefault();
  }, true);

  return {
    /** Po překreslení scény: nový výchozí výřez, nebo zachovat přiblížení. */
    refresh() {
      const current = svg.getAttribute('viewBox').split(/\s+/).map(Number);
      const same = base && current.every((value, i) => Math.abs(value - base[i]) < 1e-6);
      if (!same) {
        base = current;
        view = current;
      }
      apply();
    },
    reset() {
      if (!base) return;
      view = base;
      apply();
    },
  };
}
