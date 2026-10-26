// Duely – společné díly pro všechny hry: tlačítko „Vyzvat kamaráda“ pod
// výsledkem, odkaz s kódem (duel.html?kod=…), výsledek duelu po dohrání.
// Logiku (stejné otázky, vyhodnocení, bonusy) má server: sql/10_duely.sql.
import { el } from './dom.js';
import { plural, formatDuration } from './format.js';
import { createDuel, getDuel } from './quiz-api.js';
import { pageUrl } from './supabase.js';

// kód výzvy, kterou otevřel nepřihlášený hráč – Profil po přihlášení nabídne návrat
export const PENDING_DUEL_KEY = 'voleyref-duel';

/** Hra → stránka, kde se hraje, a český název. */
export const DUEL_GAMES = {
  'kviz': { page: 'kviz.html', name: 'Kvíz' },
  'gesta': { page: 'gesta.html', name: 'Kvíz gest' },
  'gesto-naopak': { page: 'gesto-naopak.html', name: 'Gesto naopak' },
  'odpiskej': { page: 'odpiskej.html', name: 'Odpískej to!' },
  'rotace': { page: 'rotacni-sprint.html', name: 'Rotační sprint' },
};

/** Kód duelu z adresy hry (kviz.html?duel=…), nebo null. */
export function duelCodeFromUrl() {
  return new URLSearchParams(location.search).get('duel');
}

/** Odkaz, který vyzyvatel pošle kamarádovi. */
export function duelLink(code) {
  return pageUrl(`duel.html?kod=${encodeURIComponent(code)}`);
}

/**
 * Sdílení odkazu: na mobilu nabídka sdílení (WhatsApp…), jinak zkopírovat do schránky.
 * @returns {Promise<string>} co se stalo – text pro hráče
 */
export async function shareDuelLink(link, gameName) {
  const text = `Vyzývám tě na duel – ${gameName} (Trénink rozhodčích). Dáš víc než já?`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Duel', text, url: link });
      return 'Odkaz je odeslaný.';
    } catch (error) {
      if (error.name === 'AbortError') return '';   // hráč sdílení zavřel
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    return 'Odkaz je zkopírovaný – vlož ho kamarádovi do zprávy.';
  } catch {
    return 'Zkopíruj odkaz ručně z pole výše.';
  }
}

/** Pole s odkazem + tlačítko Sdílet/Kopírovat (výzva i aktivní duel v Profilu). */
export function renderShareBox(link, gameName) {
  const status = el('p', { class: 'small', role: 'status' });
  const input = el('input', { type: 'text', readonly: true, value: link, class: 'duel-link', 'aria-label': 'Odkaz na duel' });
  input.addEventListener('focus', () => input.select());
  const button = el('button', { type: 'button', class: 'button button--small' }, navigator.share ? 'Poslat odkaz' : 'Kopírovat odkaz');
  button.addEventListener('click', async () => { status.textContent = await shareDuelLink(link, gameName); });
  return el('div', { class: 'stack duel-share' }, el('div', { class: 'duel-share__row' }, input, button), status);
}

/**
 * Tlačítko „Vyzvat kamaráda“ pod výsledkem kola (jen přihlášený, kolo ze serveru).
 * Po kliknutí vytvoří duel a ukáže odkaz ke sdílení.
 */
export function renderChallenge(container, roundId, game) {
  const name = DUEL_GAMES[game]?.name ?? '';
  const button = el('button', { type: 'button', class: 'button button--secondary' }, '⚔ Vyzvat kamaráda');
  const note = el('p', { class: 'small muted' }, 'Kamarád dostane stejné otázky. Výsledek uvidíš v Profilu → Duely.');
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const link = duelLink(await createDuel(roundId));
      container.replaceChildren(el('p', {}, el('strong', {}, 'Výzva je připravená.'), ' Pošli odkaz kamarádovi:'),
        renderShareBox(link, name), note);
      container.querySelector('button')?.click();   // rovnou nabídnout sdílení
    } catch (error) {
      console.error(error);
      button.disabled = false;
      note.textContent = error.message?.includes('moc nepřijatých')
        ? 'Máš moc nepřijatých výzev. Počkej, až je kamarádi odehrají.'
        : 'Výzvu se nepodařilo vytvořit. Zkus to znovu.';
    }
  });
  container.replaceChildren(el('div', { class: 'actions' }, button), note);
}

const scoreText = r => `${r.skore}/${r.pocet} za ${formatDuration(r.trvani_s)}`;

/** Věta s výsledkem duelu z pohledu hráče. */
export function duelVerdict(detail) {
  if (detail.stav !== 'hotovo') return 'Čeká se, až soupeř dohraje.';
  const mine = detail.je_vyzyvatel ? 'vyzyvatel' : 'souper';
  const bonus = detail.muj_bonus ? ` +${plural(detail.muj_bonus, 'bod', 'body', 'bodů')} do žebříčku.` : '';
  if (detail.vysledek === 'remiza') return `Remíza!${bonus}`;
  return detail.vysledek === mine ? `Vyhrál jsi! 🏆${bonus}` : 'Tentokrát prohra – zkus odvetu.';
}

/** Srovnání obou hráčů (stránka duelu i výsledek hry). */
export function renderDuelScore(detail) {
  const rows = [[detail.vyzyvatel, detail.vyzyvatel_vysledek]];
  if (detail.souper_vysledek) rows.push([detail.souper, detail.souper_vysledek]);
  return el('ul', { class: 'duel-score' }, ...rows.map(([nick, r]) => el('li', {}, el('strong', {}, nick), ` ${scoreText(r)}`)));
}

/** Po dohrání duelu: výsledek obou hráčů (načte se ze serveru). */
export async function renderDuelResult(container, code) {
  container.replaceChildren(el('p', { class: 'muted small' }, 'Načítám výsledek duelu…'));
  try {
    const detail = await getDuel(code);
    container.replaceChildren(el('h3', {}, `Duel s hráčem ${detail.je_vyzyvatel ? detail.souper : detail.vyzyvatel}`),
      renderDuelScore(detail), el('p', { class: 'duel-verdict' }, duelVerdict(detail)),
      el('p', { class: 'small' }, el('a', { href: 'ucet.html#duely' }, 'Všechny tvé duely')));
  } catch (error) {
    console.error(error);
    container.replaceChildren(el('p', { class: 'small' }, 'Výsledek duelu se nepodařilo načíst – najdeš ho v ', el('a', { href: 'ucet.html#duely' }, 'Profilu'), '.'));
  }
}
