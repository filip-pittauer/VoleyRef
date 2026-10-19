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

/** Odkaz na kapitolu v knížce pravidel. */
export function categoryRulesUrl(id) {
  return `pravidla.html#${id}`;
}
