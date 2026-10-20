// Formátování čísel a textů pro UI.

/** 75 → "1:15" (minuty:sekundy) */
export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Kolik sekund zbývá do půlnoci českého času (kdy začíná nová denní výzva, viz private.dnes() v SQL). */
export function secondsUntilNextDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
  }).formatToParts(now);
  const get = type => Number(parts.find(p => p.type === type).value);
  return 24 * 3600 - (get('hour') * 3600 + get('minute') * 60 + get('second'));
}

/** Odpočet: „5 h 12 min“, „12 min“, „méně než minutu“. */
export function formatCountdown(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return minutes > 0 ? `${minutes} min` : 'méně než minutu';
}

/**
 * České skloňování podle počtu: plural(3, 'otázka', 'otázky', 'otázek') → "3 otázky".
 * one = 1, few = 2–4, many = 0 a 5+.
 */
export function plural(count, one, few, many) {
  const word = count === 1 ? one : count >= 2 && count <= 4 ? few : many;
  return `${count} ${word}`;
}
