// Odznaky: názvy, ikony a popisy. Podmínky (kdy se odznak udělí) počítá
// server – sql/05_odznaky.sql, funkce private.metriky_odznaku.
// Nový odznak = položka tady + řádek v metriky_odznaku (stejné id).

export const BADGE_GROUPS = [
  {
    name: 'Začátky a vytrvalost',
    badges: {
      'prvni-kolo': { icon: '🏐', name: 'První písknutí', description: 'Odehraj první kolo.' },
      'kol-10': { icon: '📋', name: 'Pravidelný rozhodčí', description: 'Odehraj 10 kol.' },
      'kol-50': { icon: '🎽', name: 'Ostřílený rozhodčí', description: 'Odehraj 50 kol.' },
      'otazek-100': { icon: '📚', name: 'Sto situací', description: 'Zodpověz 100 otázek.' },
      'otazek-500': { icon: '🏛️', name: 'Pět set situací', description: 'Zodpověz 500 otázek.' },
    },
  },
  {
    name: 'Přesnost',
    badges: {
      'bez-chyby': { icon: '🎯', name: 'Bez chyby', description: 'Odehraj kolo 10/10.' },
      'neomylny': { icon: '🥇', name: 'Neomylný', description: 'Odehraj 5 kol 10/10.' },
      'rychly': { icon: '⚡', name: 'Rychlý a přesný', description: 'Kolo 10/10 za méně než 2 minuty.' },
      'tezka-vaha': { icon: '💪', name: 'Těžká váha', description: 'Kolo s obtížností Těžká bez chyby.' },
    },
  },
  {
    name: 'Učení',
    badges: {
      'pouceny': { icon: '🔧', name: 'Poučený z chyb', description: 'Oprav 10 chyb v opakování chyb.' },
      'cisty-stul': { icon: '🧹', name: 'Čistý stůl', description: 'Oprav všechny své chyby.' },
      'vsestranny': { icon: '🧭', name: 'Všestranný', description: 'Ve všech 9 kategoriích aspoň 5 otázek s úspěšností 70 %.' },
      'specialista': { icon: '🎓', name: 'Specialista', description: 'V jedné kategorii aspoň 15 otázek s úspěšností 90 %.' },
    },
  },
  {
    name: 'Denní výzva',
    badges: {
      'denni-hrac': { icon: '🗓️', name: 'Denní hráč', description: 'Odehraj denní výzvu.' },
      'serie-3': { icon: '🔥', name: 'Rozjetý', description: 'Denní výzva 3 dny v řadě.' },
      'serie-7': { icon: '🌟', name: 'Týden v kuse', description: 'Denní výzva 7 dní v řadě.' },
      'stupne': { icon: '🥉', name: 'Na stupních', description: 'Skonči v denní výzvě do 3. místa.' },
      'vitez-dne': { icon: '🏆', name: 'Vítěz dne', description: 'Vyhraj denní výzvu.' },
    },
  },
];

// Všechny odznaky v jednom objektu: id → { icon, name, description }
export const BADGES = Object.assign({}, ...BADGE_GROUPS.map(group => group.badges));

/** Odznak podle id (neznámé id – např. odznak přidaný jen na server – dostane náhradní ikonu). */
export function badgeById(id) {
  return BADGES[id] ?? { icon: '🏅', name: id, description: '' };
}
