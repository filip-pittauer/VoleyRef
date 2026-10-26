// Rozcestník Hry (hry.html): body přihlášeného hráče (dnes / týden / celkem)
// a u každé hry, jestli už dnes dala bodované kolo. Data: moje_body() (07_hry.sql).
import { getMyPoints } from './quiz-api.js';
import { getUser, isConfigured } from './supabase.js';
import { plural } from './format.js';

const summary = document.getElementById('my-points');

/** Značka u hry: „Dnešní body získány ✓“, nebo kolik bodů ještě čeká. */
function markGames(played) {
  for (const badge of document.querySelectorAll('[data-points]')) {
    const done = played.includes(badge.dataset.points);
    badge.textContent = done ? 'Dnešní body získány ✓ – další kola za 0' : 'Dnes ještě můžeš získat body';
    badge.classList.toggle('news__status--done', done);
    badge.hidden = false;
  }
}

async function init() {
  const user = await getUser().catch(() => null);
  if (!user) return;   // nepřihlášený: body nesbírá, souhrn zůstane skrytý
  let points;
  try {
    points = await getMyPoints();
  } catch (error) {
    console.error(error);
    return;
  }
  document.getElementById('points-today').textContent = plural(points.dnes, 'bod', 'body', 'bodů');
  document.getElementById('points-week').textContent = plural(points.tyden, 'bod', 'body', 'bodů');
  document.getElementById('points-total').textContent = plural(points.celkem, 'bod', 'body', 'bodů');
  summary.hidden = false;
  markGames(points.dnes_hrano);
}

if (isConfigured && summary) init();
