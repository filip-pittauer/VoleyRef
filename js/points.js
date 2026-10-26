// Poznámka pod výsledkem kola: kolik bodů šlo do žebříčku, nebo proč žádné.
// Body počítá server (private.prirad_body), tady se jen popisují.
import { el } from './dom.js';
import { plural } from './format.js';

/**
 * @param {{ points: number|null, pointsReason: 'limit'|'rychle'|null }} result
 * @param {boolean} loggedIn
 * @returns {Node|string|null} null = nebodované kolo (nic nepsat)
 */
export function pointsNote({ points, pointsReason }, loggedIn) {
  if (!loggedIn) {
    return el('span', {}, 'Body do žebříčku sbírají jen přihlášení hráči. ', el('a', { href: 'ucet.html' }, 'Přihlásit se'));
  }
  if (points == null) return null;
  if (pointsReason === 'limit') {
    return 'Dnešní body za tuto hru už máš, další kola jsou za 0 bodů. Zítra znovu!';
  }
  if (pointsReason === 'rychle') {
    return 'Kolo bylo příliš rychlé (méně než 2 s na otázku), body se nepočítají. Zkus to znovu.';
  }
  return el('span', { class: 'points-gain' },
    el('strong', {}, `+${plural(points, 'bod', 'body', 'bodů')}`), ' do ', el('a', { href: 'zebricek.html' }, 'žebříčku'), '.');
}
