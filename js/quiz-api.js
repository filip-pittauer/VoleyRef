// Zdroj otázek a vyhodnocení kola – LOKÁLNÍ verze (fáze 2).
//
// Rozhraní (startRound / submitRound) je navržené tak, jak bude fungovat
// se serverem: startRound vrátí otázky BEZ správných odpovědí,
// submitRound pošle odpovědi a vrátí vyhodnocení. Ve fázi 3 se vymění
// jen tento soubor, kvíz (quiz.js) zůstane stejný.

const ROUND_SIZE = 10;

// Plná sada otázek je jen lokálně (private/ je v .gitignore),
// na webu se použijí veřejné ukázky z data/.
const SOURCES = ['private/otazky.json', 'data/otazky.json'];

// Rozehraná kola: id kola → { questions (i se správnými odpověďmi), startedAt }
const rounds = new Map();

async function loadAllQuestions() {
  for (const url of SOURCES) {
    const response = await fetch(url);
    if (response.ok) return response.json();
  }
  throw new Error('Nepodařilo se načíst otázky.');
}

/** Fisher–Yates: zamíchá kopii pole (původní nemění). */
export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Jen veřejná část otázky – to, co smí hráč vidět během kola. */
function toPublicQuestion({ spravna, vysvetleni, ...publicPart }) {
  return publicPart;
}

/**
 * Začne nové kolo. Vrací { roundId, questions }.
 * category = id kategorie, nebo null pro všechny.
 */
export async function startRound({ category = null } = {}) {
  const all = await loadAllQuestions();
  const pool = all.filter(q => q.aktivni && (!category || q.kategorie === category));
  const picked = shuffle(pool).slice(0, ROUND_SIZE);

  const roundId = crypto.randomUUID();
  rounds.set(roundId, { questions: picked, startedAt: Date.now() });

  return { roundId, questions: picked.map(toPublicQuestion) };
}

/**
 * Odevzdá odpovědi kola. answers = { [idOtazky]: 'A' | 'B' | ... }
 * Vrací { score, total, durationSeconds, results: [{ id, answer, correctAnswer, isCorrect, explanation }] }
 */
export async function submitRound(roundId, answers) {
  const round = rounds.get(roundId);
  if (!round) throw new Error('Kolo neexistuje nebo už bylo odevzdané.');
  rounds.delete(roundId);

  const results = round.questions.map(q => ({
    id: q.id,
    answer: answers[q.id] ?? null,
    correctAnswer: q.spravna,
    isCorrect: answers[q.id] === q.spravna,
    explanation: q.vysvetleni,
  }));

  return {
    score: results.filter(r => r.isCorrect).length,
    total: results.length,
    durationSeconds: Math.round((Date.now() - round.startedAt) / 1000),
    results,
  };
}
