// Kategorie otázek: identifikátor (v datech) → český název (v UI).
// Identifikátor je zároveň kotva kapitoly v pravidla.html (#podani apod.).
export const CATEGORIES = {
  'podani': 'Podání',
  'prijem-nahravka': 'Příjem a nahrávka',
  'utok': 'Útok',
  'blok': 'Blok',
  'dotyky-chyby': 'Dotyky, síť a chyby ve hře',
  'rotace-postaveni': 'Rotace a postavení',
  'stridani': 'Střídání a libero',
  'preruseni-hry': 'Přerušení a zdržování hry',
  'signalizace': 'Signalizace rozhodčích',
};

export function categoryName(id) {
  return CATEGORIES[id] ?? id;
}

// Obtížnost otázek (pole "obtiznost" v datech).
export const DIFFICULTIES = {
  1: 'Lehká',
  2: 'Střední',
  3: 'Těžká',
};

export function difficultyName(level) {
  return DIFFICULTIES[level] ?? '';
}

/** Odkaz na kapitolu v knížce pravidel (shrnutí „Ve zkratce“). */
export function categoryRulesUrl(id) {
  return `pravidla.html#${id}`;
}

/** Odkaz na konkrétní bod pravidel: „12.4.3“ → pravidla.html#p-12-4-3, „15“ → #pravidlo-15. */
export function ruleUrl(number) {
  return `pravidla.html#${number.includes('.') ? `p-${number.replaceAll('.', '-')}` : `pravidlo-${number}`}`;
}
