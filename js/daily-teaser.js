// Karta denní výzvy na úvodu (index.html) a v Hrách (hry.html).
// Hraje se v kvízu: tlačítko je odkaz kviz.html?hrat=denni, který výzvu rovnou spustí.
// Úvod (data-hide-when-played) kartu ukáže jen tehdy, když ji hráč dnes ještě
// nedohrál; v Hrách je vidět pořád, i s dnešním výsledkem.
import { getProfile, isConfigured } from './supabase.js';
import { renderDailyCard } from './daily-card.js';

const card = document.getElementById('denni');

async function init() {
  let profile = null;
  try {
    profile = await getProfile();
  } catch (error) {
    console.error(error);
  }
  const status = await renderDailyCard({
    text: document.getElementById('daily-text'),
    button: document.getElementById('daily-button'),
    profile,
  });
  const hideWhenPlayed = 'hideWhenPlayed' in card.dataset;
  // úvod: bez dat (chyba) nebo po odehrání nic neukazovat; Hry: ukázat vždy (i chybovou hlášku)
  card.hidden = hideWhenPlayed && (!status || status.stav === 'odehrano');
}

if (card && isConfigured) init();
