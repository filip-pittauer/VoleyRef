// Rotační sprint – pravidla bez DOM: situace a jejich řešení (pravidla 7.6, 15, 19.3).
//
// Sestava = pole 6 čísel hráčů v zónách I–VI (index 0 = zóna I … 5 = zóna VI):
//   přední řada IV III II (indexy 3, 2, 1), zadní řada V VI I (indexy 4, 5, 0).
// Server má stejná pravidla v SQL (sql/08_rotace.sql: private.sprint_reseni)
// – test rotace-db hlídá, že obě strany dávají stejná řešení.

export const ZONES = ['I', 'II', 'III', 'IV', 'V', 'VI'];
// zobrazení na hřišti: síť nahoře, přední řada IV III II, zadní V VI I
export const COURT_LAYOUT = [[3, 2, 1], [4, 5, 0]];
const FRONT_ZONE_IV = 3;

/**
 * Události výměny z pohledu „našeho“ družstva. Rotuje se jen tehdy, když
 * družstvo přijímalo a výměnu vyhrálo (získalo právo podávat, 7.6.1).
 */
export const EVENTS = {
  'prijem-vyhra': 'Naše družstvo přijímalo podání a vyhrálo výměnu.',
  'prijem-prohra': 'Naše družstvo přijímalo podání a prohrálo výměnu.',
  'podani-vyhra': 'Naše družstvo podávalo a vyhrálo výměnu.',
  'podani-prohra': 'Naše družstvo podávalo a prohrálo výměnu.',
};

/** Jedna rotace po směru hodinových ručiček: hráč ze zóny II jde do I, z I do VI… */
export function rotate(court) {
  return [...court.slice(1), court[0]];
}

/** Kolikrát se v situaci rotuje. */
function rotationCount(situation) {
  if (situation.typ === 'vice') return situation.kroky;
  return situation.udalost === 'prijem-vyhra' ? 1 : 0;
}

/**
 * Správná sestava po situaci. Libero, které se rotací dostane do zóny IV
 * (přední řada), musí ven (hraje jen v zadní řadě, 19.3.1.2) a vrací se hráč,
 * za kterého hrálo (19.3.2.2).
 * Střídání proběhne až po výměně (v přerušení hry).
 * @param {object} situation { typ, sestava, udalost?, kroky?, libero?: { cislo, za }, stridani?: { ven, dovnitr } }
 * @returns {number[]} sestava v zónách I–VI
 */
export function solve(situation) {
  let court = [...situation.sestava];
  for (let i = 0; i < rotationCount(situation); i++) {
    court = rotate(court);
    if (situation.libero && court[FRONT_ZONE_IV] === situation.libero.cislo) court[FRONT_ZONE_IV] = situation.libero.za;
  }
  if (situation.stridani) court = court.map(n => (n === situation.stridani.ven ? situation.stridani.dovnitr : n));
  return court;
}

/** Hráči mimo hřiště, kteří se v situaci můžou dostat na hřiště (lavička v UI). */
export function benchOf(situation) {
  return [situation.stridani?.dovnitr, situation.libero?.za].filter(n => n != null);
}

/** Je odpověď (sestava I–VI) správná? */
export function isCorrect(situation, answer) {
  const solution = solve(situation);
  return answer.length === 6 && solution.every((n, i) => n === answer[i]);
}

// ---------- Generování (nepřihlášený hráč; přihlášenému generuje server) ----------
const pick = (random, list) => list[Math.floor(random() * list.length)];

/** Náhodná čísla dresů 1–20 bez opakování. */
function shirtNumbers(random, count) {
  const all = Array.from({ length: 20 }, (_, i) => i + 1);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count);
}

/** Typ situace podle pořadí ve sprintu: obtížnost roste. */
export function typeFor(index, random = Math.random) {
  if (index < 4) return 'rotace';
  if (index < 8) return 'stridani';
  if (index < 12) return 'libero';
  return pick(random, ['rotace', 'stridani', 'libero', 'vice', 'vice']);
}

/**
 * Náhodná situace (stejná pravidla jako private.sprint_situace v SQL).
 * @param {number} index pořadí ve sprintu (0 = první)
 */
export function generateSituation(index, random = Math.random) {
  const typ = typeFor(index, random);
  const numbers = shirtNumbers(random, 8);
  const sestava = numbers.slice(0, 6);
  const event = () => (random() < 0.5 ? 'prijem-vyhra' : pick(random, ['prijem-prohra', 'podani-vyhra', 'podani-prohra']));
  if (typ === 'vice') return { typ, sestava, kroky: 2 + Math.floor(random() * 3) };
  if (typ === 'stridani') {
    return { typ, sestava, udalost: random() < 0.5 ? 'prijem-vyhra' : null,
      stridani: { ven: pick(random, sestava), dovnitr: numbers[6] } };
  }
  if (typ === 'libero') {
    const udalost = random() < 0.7 ? 'prijem-vyhra' : event();
    // libero nesmí podávat (19.3.1.3) → při našem podání ne v zóně I; často v zóně V (po rotaci musí ven)
    const zones = udalost.startsWith('podani') ? [4, 5] : [4, 4, 5, 0];
    const zone = pick(random, zones);
    const za = sestava[zone];
    sestava[zone] = numbers[7];
    return { typ, sestava, udalost, libero: { cislo: numbers[7], za } };
  }
  return { typ, sestava, udalost: event() };
}

/** Text zadání situace (bez otázky „Jak teď stojí…?“). */
export function describe(situation) {
  const parts = [];
  if (situation.libero) parts.push(`Libero č. ${situation.libero.cislo} hraje za č. ${situation.libero.za}.`);
  if (situation.typ === 'vice') {
    parts.push(`Od tohoto postavení naše družstvo ještě ${situation.kroky}× získalo právo podávat.`);
  }
  if (situation.udalost) parts.push(EVENTS[situation.udalost]);
  if (situation.stridani) {
    parts.push(`${situation.udalost ? 'Potom střídání' : 'Střídání'}: č. ${situation.stridani.dovnitr} za č. ${situation.stridani.ven}.`);
  }
  return parts.join(' ');
}
