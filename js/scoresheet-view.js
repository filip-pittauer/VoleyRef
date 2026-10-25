// Trenažér zápisu – vykreslení zjednodušeného zápisu a malého hřiště.
// Vlastní návrh (ne kopie oficiálního formuláře): pořadí podání I–VI,
// střídání, oddechové časy, libero, průběžné body a sankce.
import { el } from './dom.js';
import { ROMAN, MAX_SUBS, MAX_TIMEOUTS, SANCTION_LOG_LABELS, slotPlayer, playerAt, serverSlot } from './scoresheet-model.js';

// ---------- Hřiště ----------
// Pozice v mřížce 3 × 2 na každé polovině (řádky shora dolů).
// Družstvo A je vlevo čelem k síti (jeho levá ruka nahoře), B vpravo (levá ruka dole).
const LAYOUT = {
  A: { back: [5, 6, 1], front: [4, 3, 2] },
  B: { front: [2, 3, 4], back: [1, 6, 5] },
};

/** Hráč na pozici: číslo, pozice, zvýraznění libera a podávajícího. */
function courtCell(set, team, pos) {
  const number = playerAt(set, team, pos);
  const t = set.teams[team];
  const isLibero = t.liberos.includes(number);
  const serves = set.serving === team && pos === 1;
  return el('div', { class: `sc-player sc-player--${team.toLowerCase()}${isLibero ? ' sc-player--libero' : ''}${serves ? ' sc-player--serve' : ''}` },
    el('span', { class: 'sc-player__num' }, String(number)),
    el('span', { class: 'sc-player__pos' }, serves ? `${pos} · podává` : String(pos)));
}

/** Malé hřiště s rozestavením obou družstev (pro čtečku obrazovky popsané textem). */
export function renderCourt(set) {
  const half = team => {
    const cols = team === 'A' ? ['back', 'front'] : ['front', 'back'];
    return el('div', { class: `sc-half sc-half--${team.toLowerCase()}` },
      ...cols.map(col => el('div', { class: 'sc-col' }, ...LAYOUT[team][col].map(pos => courtCell(set, team, pos)))));
  };
  return el('div', { class: 'sc-court', role: 'img', 'aria-label': courtLabel(set) },
    half('A'), el('div', { class: 'sc-net', 'aria-hidden': 'true' }), half('B'));
}

/** Textový popis hřiště pro čtečky obrazovky (role="img"). */
function courtLabel(set) {
  const team = t => [1, 2, 3, 4, 5, 6].map(p => `${p}: č. ${playerAt(set, t, p)}`).join(', ');
  return `Hřiště. Družstvo A: ${team('A')}. Družstvo B: ${team('B')}. Podává družstvo ${set.serving}.`;
}

// ---------- Zápis družstva ----------
/**
 * opts.onPoint(team) – klepnutí na další číslo v bodech (dlouhá verze),
 * opts.onServer(team, slot) – klepnutí na sloupec v pořadí podání,
 * opts.marker = { A: slot, B: slot } – označený podávající (výchozí: hráč na pozici 1).
 */
function renderTeam(set, team, opts) {
  const t = set.teams[team];
  const marker = opts.marker?.[team] ?? serverSlot(set, team);

  const header = el('tr', {}, el('th', { scope: 'row' }, 'Sloupec'),
    ...t.slots.map((slot, i) => {
      const label = `${ROMAN[i]}${i === marker ? ' ●' : ''}`;
      return el('th', { scope: 'col', class: i === marker ? 'is-server' : '' },
        opts.onServer
          ? el('button', { type: 'button', class: 'sc-slot-btn', 'data-team': team, 'data-slot': i,
            'aria-label': `Sloupec ${ROMAN[i]} – podává č. ${slotPlayer(slot)}` }, label)
          : label);
    }));
  const row = (title, cells) => el('tr', {}, el('th', { scope: 'row' }, title), ...cells.map(c => el('td', {}, c)));
  const table = el('table', { class: 'sc-order' },
    el('caption', { class: 'visually-hidden' }, `Pořadí podání družstva ${team}`),
    el('thead', {}, header),
    el('tbody', {},
      // přeškrtnuté číslo = hráč teď není na hřišti (vystřídaný / náhradník už odešel)
      row('Sestava', t.slots.map(slot => el('strong', { class: slot.subIn ? 'is-off' : '' }, String(slot.starter)))),
      row('Náhradník', t.slots.map(slot => (slot.sub ? el('strong', { class: slot.subIn ? '' : 'is-off' }, String(slot.sub)) : ''))),
      row('Střídání', t.slots.map(slot => [slot.subAt ?? '', slot.backAt ? el('br') : '', slot.backAt ? `↩ ${slot.backAt}` : ''])),
      row('Ztráta podání', t.slots.map(slot => slot.serves.join(' · ')))));
  // zvýraznit sloupec podávajícího (třída na buňkách celého sloupce)
  for (const tr of table.querySelectorAll('tbody tr')) tr.querySelectorAll('td').forEach((td, i) => { if (i === marker) td.classList.add('is-server'); });

  const libero = t.libero
    ? `na hřišti č. ${t.libero.number} za č. ${slotPlayer(t.slots[t.libero.slot])}`
    : 'na lavičce';
  const timeouts = Array.from({ length: MAX_TIMEOUTS }, (_, i) => el('span', { class: 'sc-box' }, t.timeouts[i] ?? '–'));
  const subs = Array.from({ length: MAX_SUBS }, (_, i) => el('span', { class: `sc-dot${i < t.subsUsed ? ' is-used' : ''}`, 'aria-hidden': 'true' }));

  return el('section', { class: `sc-team sc-team--${team.toLowerCase()}`, 'aria-label': `Zápis družstva ${team}` },
    el('header', { class: 'sc-team__head' },
      el('h3', {}, `Družstvo ${team}`),
      el('span', { class: 'sc-team__score' }, String(set.score[team])),
      set.serving === team ? el('span', { class: 'sc-badge' }, 'podává') : null),
    el('div', { class: 'sc-scroll' }, table),
    el('dl', { class: 'sc-meta' },
      el('div', {}, el('dt', {}, 'Oddechové časy'), el('dd', {}, ...timeouts)),
      el('div', {}, el('dt', {}, `Střídání ${t.subsUsed}/${MAX_SUBS}`), el('dd', { class: 'sc-dots' }, ...subs)),
      el('div', {}, el('dt', {}, `Libero ${t.liberos.join(', ')}`), el('dd', {}, libero)),
      el('div', {}, el('dt', {}, 'Lavička'), el('dd', {}, t.bench.join(', ')))),
    renderPoints(set, team, opts));
}

/** Průběžné body: přeškrtnutá čísla, v dlouhé verzi je další číslo tlačítko. */
function renderPoints(set, team, opts) {
  const score = set.score[team];
  const max = Math.max(25, score + 2);
  const cells = [];
  for (let n = 1; n <= max; n++) {
    if (n === score + 1 && opts.onPoint) {
      cells.push(el('button', { type: 'button', class: 'sc-point sc-point--next', 'data-team': team, 'aria-label': `Zapsat bod ${n} družstvu ${team}` }, String(n)));
    } else {
      cells.push(el('span', { class: `sc-point${n <= score ? ' is-done' : ''}` }, String(n)));
    }
  }
  return el('div', { class: 'sc-points', 'aria-label': `Body družstva ${team}: ${score}` }, ...cells);
}

/** Tabulka sankcí a odmítnutých žádostí (member null = celé družstvo, 'T' = trenér). */
function renderSanctions(set) {
  if (!set.sanctions.length) return el('p', { class: 'muted small sc-sanctions-empty' }, 'Sankce a neoprávněné žádosti: zatím nic.');
  return el('table', { class: 'sc-sanctions' },
    el('caption', {}, 'Sankce a neoprávněné žádosti'),
    el('thead', {}, el('tr', {}, ...['Družstvo', 'Kdo', 'Záznam', 'Skóre'].map(h => el('th', { scope: 'col' }, h)))),
    el('tbody', {}, ...set.sanctions.map(s => el('tr', {},
      el('td', {}, s.team), el('td', {}, s.member == null ? 'družstvo' : s.member === 'T' ? 'trenér' : `č. ${s.member}`),
      el('td', {}, SANCTION_LOG_LABELS[s.kind] ?? s.kind), el('td', {}, s.score)))));
}

/** Celý zápis (obě družstva + sankce) do containeru. */
export function renderSheet(container, set, opts = {}) {
  container.replaceChildren(
    el('div', { class: 'sc-teams' }, renderTeam(set, 'A', opts), renderTeam(set, 'B', opts)),
    renderSanctions(set));
}
