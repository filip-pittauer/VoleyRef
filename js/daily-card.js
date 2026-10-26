// Karta denní výzvy – stejná na úvodu (index.html), v Hrách (hry.html)
// i v kvízu (kviz.html). Stav (nehráno / rozehráno / odehráno, skóre,
// pořadí, série) počítá server: stav_denni_vyzvy().
import { el } from './dom.js';
import { formatDuration, plural, secondsUntilNextDay, formatCountdown } from './format.js';
import { getDailyStatus } from './quiz-api.js';

/** „🔥 Série: 3 dny v řadě“, nebo null, když série není. */
export function streakText(serie) {
  if (!serie || serie.aktualni === 0) return null;
  return `🔥 Série: ${plural(serie.aktualni, 'den', 'dny', 'dní')} v řadě`;
}

/** Den před datem 'RRRR-MM-DD'. Počítá se v UTC, aby výsledek neposunul letní čas. */
export function previousDay(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

let countdownTimer = null;

/** Odpočet do nové výzvy (o půlnoci českého času), obnovuje se každých 20 s; po půlnoci zavolá refresh. */
function renderCountdown(refresh) {
  const line = el('span', { class: 'countdown' });
  const update = () => {
    const seconds = secondsUntilNextDay();
    line.textContent = `Další výzva za ${formatCountdown(seconds)}.`;
    if (seconds < 30) {
      clearInterval(countdownTimer);
      setTimeout(refresh, seconds * 1000 + 2000);   // po půlnoci načíst novou výzvu
    }
  };
  clearInterval(countdownTimer);
  countdownTimer = setInterval(update, 20000);
  update();
  return line;
}

/** Řádky textu karty podle stavu; tlačítku nastaví text a viditelnost. */
function statusLines(status, profile, button, refresh) {
  const players = `V dnešním žebříčku: ${plural(status.hracu, 'hráč', 'hráči', 'hráčů')}.`;
  button.hidden = false;
  button.textContent = 'Hrát denní výzvu';

  if (!profile) {
    // Server denní výzvu anonymovi nespustí (mohl by ji hrát dokola a zjistit řešení).
    button.hidden = true;
    return [el('span', {}, 'Denní výzva je jen pro přihlášené. ', el('a', { href: 'ucet.html' }, 'Přihlásit se')), players];
  }
  if (status.stav === 'nehrano') {
    const streak = streakText(status.serie);
    return [streak ? `${streak} – nepřeruš ji!` : 'Dnes jsi ještě nehrál.', players];
  }
  if (status.stav === 'rozehrano') {
    button.textContent = 'Pokračovat';
    return ['Výzvu máš rozehranou. Čas běží od prvního otevření.'];
  }
  button.hidden = true;
  return [
    `Dnes: ${status.skore}/${status.pocet} za ${formatDuration(status.trvani_s)}`
      + (status.poradi ? ` · ${status.poradi}. místo z ${status.hracu}.` : ' · do žebříčku se nezapočítalo (moc rychlé).'),
    streakText(status.serie),
    renderCountdown(refresh),
  ];
}

/**
 * Vyplní kartu denní výzvy podle stavu na serveru.
 * @param {{ text: HTMLElement, button: HTMLElement, solutionButton?: HTMLElement|null,
 *           profile: object|null }} parts
 *   text = odstavec se stavem, button = „Hrát“ (tlačítko v kvízu, odkaz jinde),
 *   solutionButton = „Řešení včerejší výzvy“ (jen v kvízu)
 * @returns {Promise<object|null>} stav z serveru (den, stav, skore…), null = nepodařilo se načíst
 */
export async function renderDailyCard(parts) {
  const { text, button, solutionButton = null, profile } = parts;
  let status;
  try {
    status = await getDailyStatus();
  } catch (error) {
    console.error(error);
    text.textContent = 'Denní výzvu se nepodařilo načíst.';
    button.hidden = true;
    if (solutionButton) solutionButton.hidden = true;
    return null;
  }
  if (solutionButton) solutionButton.hidden = !(profile && status.vcera);
  const lines = statusLines(status, profile, button, () => renderDailyCard(parts));
  text.replaceChildren(...lines.filter(Boolean).flatMap((line, i) => (i ? [el('br'), line] : [line])));
  return status;
}
