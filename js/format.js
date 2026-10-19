// Formátování čísel a textů pro UI.

/** 75 → "1:15" (minuty:sekundy) */
export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * České skloňování podle počtu: plural(3, 'otázka', 'otázky', 'otázek') → "3 otázky".
 * one = 1, few = 2–4, many = 0 a 5+.
 */
export function plural(count, one, few, many) {
  const word = count === 1 ? one : count >= 2 && count <= 4 ? few : many;
  return `${count} ${word}`;
}
