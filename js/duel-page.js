// Stránka výzvy (duel.html?kod=…): kdo vyzývá, v jaké hře a s jakým
// výsledkem; podle stavu „Přijmout a hrát“, čekání, nebo výsledek duelu.
import { el } from './dom.js';
import { getDuel } from './quiz-api.js';
import { getUser, isConfigured, NOT_CONFIGURED_MESSAGE } from './supabase.js';
import { DUEL_GAMES, PENDING_DUEL_KEY, duelLink, renderShareBox, renderDuelScore, duelVerdict } from './duel.js';

const box = document.getElementById('duel-content');
const code = new URLSearchParams(location.search).get('kod');

const show = (...children) => box.replaceChildren(...children);

/** Obsah podle stavu duelu a role hráče. */
function renderDetail(detail) {
  const game = DUEL_GAMES[detail.hra];
  const playUrl = `${game.page}?duel=${encodeURIComponent(code)}`;
  const parts = [
    el('p', { class: 'duel-title' }, el('strong', {}, detail.vyzyvatel), ' vyzývá na duel ve hře ', el('strong', {}, game.name), '.'),
    renderDuelScore(detail),
  ];
  if (detail.stav === 'hotovo') {
    parts.push(el('p', { class: 'duel-verdict' }, detail.je_vyzyvatel || detail.je_souper ? duelVerdict(detail) : 'Duel je odehraný.'));
  } else if (detail.stav === 'vyprselo') {
    parts.push(el('p', {}, 'Výzva vypršela (platí 7 dní).'));
  } else if (detail.je_vyzyvatel) {
    parts.push(el('p', {}, detail.stav === 'ceka' ? 'Čeká se, až kamarád výzvu přijme. Pošli mu odkaz:' : `Hraje ${detail.souper}…`),
      detail.stav === 'ceka' ? renderShareBox(duelLink(code), game.name) : '');
  } else if (detail.stav === 'hraje' && !detail.je_souper) {
    parts.push(el('p', {}, 'Tuhle výzvu už přijal někdo jiný.'));
  } else {
    parts.push(el('p', {}, 'Dostaneš úplně stejné otázky. Vyhrává víc správných odpovědí, při shodě kratší čas.'),
      el('a', { class: 'button', href: playUrl }, detail.je_souper ? 'Pokračovat v duelu' : 'Přijmout a hrát'));
  }
  parts.push(el('p', { class: 'small' }, el('a', { href: 'ucet.html#duely' }, 'Moje duely')));
  show(...parts);
}

async function init() {
  if (!code) return show(el('p', {}, 'V odkazu chybí kód duelu.'));
  if (!isConfigured) return show(el('p', {}, NOT_CONFIGURED_MESSAGE));
  const user = await getUser().catch(() => null);
  if (!user) {
    try { localStorage.setItem(PENDING_DUEL_KEY, code); } catch { /* bez paměti */ }
    return show(el('p', {}, 'Kamarád tě vyzval na duel! Duely hrají jen přihlášení hráči.'),
      el('a', { class: 'button', href: 'ucet.html' }, 'Přihlásit se'),
      el('p', { class: 'small muted' }, 'Po přihlášení tě Profil vrátí k výzvě.'));
  }
  try { localStorage.removeItem(PENDING_DUEL_KEY); } catch { /* bez paměti */ }
  try {
    renderDetail(await getDuel(code));
  } catch (error) {
    console.error(error);
    show(el('p', {}, error.message?.includes('neexistuje') ? 'Takový duel neexistuje – zkontroluj odkaz.' : 'Duel se nepodařilo načíst.'));
  }
}

init();
