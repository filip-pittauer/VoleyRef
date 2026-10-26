// Zdroj otázek a vyhodnocení kola – přes Supabase (fáze 3).
//
// Prohlížeč nikdy nedostane správné odpovědi předem a nepočítá body:
// zacni_kolo vrátí otázky bez řešení, odevzdej_kolo pošle odpovědi
// a server vrátí vyhodnocení (viz sql/02_funkce.sql).
import { supabase, NOT_CONFIGURED_MESSAGE } from './supabase.js';

function requireSupabase() {
  if (!supabase) throw new Error(NOT_CONFIGURED_MESSAGE);
}

/**
 * Začne nové kolo. Vrací { roundId, questions, exam }.
 *   category   = id kategorie, nebo null pro všechny
 *   difficulty = 1–3, nebo null pro všechny
 *   mode       = 'bezne' (kvíz v Hrách) | 'procvicovani' (Výuka, s kategorií/obtížností)
 *                | 'chyby' (opakování chyb) | 'denni' (denní výzva) | 'zkouska'
 *                kategorie a obtížnost se berou jen u 'bezne' a 'procvicovani'
 *   exam       = jen u zkoušky: { limitSeconds, passScore }, jinak null
 */
export async function startRound({ category = null, difficulty = null, mode = 'bezne' } = {}) {
  requireSupabase();
  const { data, error } = await supabase.rpc('zacni_kolo', {
    p_kategorie: category,
    p_obtiznost: difficulty,
    p_rezim: mode,
  });
  if (error) throw error;
  return {
    roundId: data.kolo_id,
    questions: data.otazky,
    exam: data.zkouska ? { limitSeconds: data.zkouska.limit_s, passScore: data.zkouska.hranice } : null,
  };
}

/**
 * Stav dnešní denní výzvy:
 * { den, hracu, stav: 'nehrano'|'rozehrano'|'odehrano', skore, pocet, trvani_s, poradi, serie: { aktualni, nejdelsi },
 *   vcera: true = včerejší výzva je dohraná (jde zobrazit řešení) }
 */
export async function getDailyStatus() {
  requireSupabase();
  const { data, error } = await supabase.rpc('stav_denni_vyzvy');
  if (error) throw error;
  return data;
}

/** Kolik otázek má přihlášený hráč k opakování (naposledy je měl špatně). */
export async function getMistakesCount() {
  requireSupabase();
  const { data, error } = await supabase.rpc('pocet_chyb');
  if (error) throw error;
  return data;
}

/** Vyhodnocení po otázkách: názvy z databáze (česky) → názvy, se kterými pracuje kvíz. */
function mapResults(vysledky) {
  return vysledky.map(v => ({
    id: v.id,
    answer: v.odpoved,
    correctAnswer: v.spravna,   // u dnešní denní výzvy chybí (undefined)
    isCorrect: v.je_spravne,
    explanation: v.vysvetleni,
  }));
}

/**
 * Odevzdá odpovědi kola. answers = { [idOtazky]: 'A' | 'B' | ... }
 * Vrací { score, total, durationSeconds, newBadges: [id odznaku…],
 *         results: [{ id, answer, correctAnswer, isCorrect, explanation }],
 *         solutionHidden: true u dnešní denní výzvy (results mají jen id a answer),
 *         exam: { passScore, inTime, passed } jen u zkoušky, jinak null,
 *         points: body do žebříčku (null = nebodované kolo), pointsReason: 'limit' | 'rychle' | null }
 */
export async function submitRound(roundId, answers) {
  requireSupabase();
  const { data, error } = await supabase.rpc('odevzdej_kolo', {
    p_kolo_id: roundId,
    p_odpovedi: answers,
  });
  if (error) throw error;

  return {
    score: data.skore,
    total: data.pocet,
    durationSeconds: data.trvani_s,
    newBadges: data.nove_odznaky ?? [],
    results: mapResults(data.vysledky),
    solutionHidden: Boolean(data.reseni_skryte),
    exam: data.zkouska
      ? { passScore: data.zkouska.hranice, inTime: data.zkouska.vcas, passed: data.zkouska.splneno }
      : null,
    points: data.body ?? null,
    pointsReason: data.body_duvod ?? null,
  };
}

/**
 * Řešení odehrané denní výzvy z uzavřeného dne (day = 'RRRR-MM-DD', nejpozději včera).
 * Vrací { day, score, total, durationSeconds, questions, results } – results jako u submitRound.
 */
export async function getDailySolution(day) {
  requireSupabase();
  const { data, error } = await supabase.rpc('reseni_denni_vyzvy', { p_den: day });
  if (error) throw error;
  return {
    day: data.den,
    score: data.skore,
    total: data.pocet,
    durationSeconds: data.trvani_s,
    questions: data.otazky,
    results: mapResults(data.vysledky),
  };
}

/**
 * Kolik aktivních otázek je v každé kategorii a obtížnosti (dlaždice Procvičování).
 * @returns {Promise<Array<{ kategorie: string, obtiznost: number, pocet: number }>>}
 */
export async function getCategoryOverview() {
  requireSupabase();
  const { data, error } = await supabase.rpc('prehled_kategorii');
  if (error) throw error;
  return data;
}

/**
 * Úspěšnost přihlášeného hráče po kategoriích (stejná data jako statistiky v Profilu).
 * @returns {Promise<Array<{ kategorie: string, otazek: number, spravne: number }>>}
 */
export async function getCategoryStats() {
  requireSupabase();
  const { data, error } = await supabase.rpc('moje_statistiky');
  if (error) throw error;
  return data.kategorie;
}

/**
 * Žebříček podle bodů.
 * @param {{ period?: 'celkem'|'tyden'|'den'|'dnes', game?: string|null, limit?: number }} options
 *   game = null pro všechny hry, jinak 'kviz' | 'gesta' | 'gesto-naopak'
 * @returns {Promise<Array<{ poradi: number, prezdivka: string, body: number, kol: number,
 *   je_moje: boolean, odznaky: string[] }>>}
 */
export async function getPointsLeaderboard({ period = 'celkem', game = null, limit = 50 } = {}) {
  requireSupabase();
  const { data, error } = await supabase.rpc('zebricek_body', {
    p_obdobi: period === 'dnes' ? 'den' : period,
    p_hra: game,
    p_limit: limit,
  });
  if (error) throw error;
  return data;
}

/**
 * Body přihlášeného hráče: { celkem, tyden, dnes, dnes_hrano: ['kviz/bezne', 'gesta/bezne', …] }
 * (dnes_hrano = hry, které už dnes daly bodované kolo).
 */
export async function getMyPoints() {
  requireSupabase();
  const { data, error } = await supabase.rpc('moje_body');
  if (error) throw error;
  return data;
}

/**
 * Začne kolo hry mimo kvíz (gesta vybere server). Vrací { roundId, items: [id gest] }.
 * @param {'gesta'|'gesto-naopak'} game
 * @param {string|null} set skupina gest ('rozhodci' / 'carovi'), null = všechna
 */
export async function startGame(game, set = null) {
  requireSupabase();
  const { data, error } = await supabase.rpc('zacni_hru', { p_hra: game, p_sada: set });
  if (error) throw error;
  return { roundId: data.kolo_id, items: data.polozky };
}

/**
 * Odevzdá kolo hry: answers = { [id položky]: id zvolené odpovědi }.
 * Vrací { score, total, durationSeconds, points, pointsReason }.
 */
export async function submitGame(roundId, answers) {
  requireSupabase();
  const { data, error } = await supabase.rpc('odevzdej_hru', { p_kolo_id: roundId, p_odpovedi: answers });
  if (error) throw error;
  return { score: data.skore, total: data.pocet, durationSeconds: data.trvani_s, points: data.body, pointsReason: data.body_duvod };
}

/**
 * Začne Rotační sprint (situace vygeneruje server).
 * Vrací { roundId, limitSeconds, situations: [situace…] } – formát situace v js/rotation-logic.js.
 */
export async function startSprint() {
  requireSupabase();
  const { data, error } = await supabase.rpc('zacni_sprint');
  if (error) throw error;
  return { roundId: data.kolo_id, limitSeconds: data.limit_s, situations: data.situace };
}

/**
 * Odevzdá sprint: answers = { [pořadí situace]: [6 čísel v zónách I–VI] } (jen zodpovězené).
 * Vrací { score, total, durationSeconds, points, pointsReason, solutions: [sestavy] }.
 */
export async function submitSprint(roundId, answers) {
  requireSupabase();
  const { data, error } = await supabase.rpc('odevzdej_sprint', { p_kolo_id: roundId, p_odpovedi: answers });
  if (error) throw error;
  return {
    score: data.skore, total: data.pocet, durationSeconds: data.trvani_s,
    points: data.body, pointsReason: data.body_duvod, solutions: data.reseni,
  };
}

/** Začne kolo „Odpískej to!“: { roundId, situations: [{ id, kdo, text }] } (roundId null = žádné situace). */
export async function startWhistle() {
  requireSupabase();
  const { data, error } = await supabase.rpc('zacni_odpiskej');
  if (error) throw error;
  return { roundId: data.kolo_id, situations: data.situace };
}

/**
 * Odevzdá „Odpískej to!“: answers = { [id situace]: [id gest v pořadí] }.
 * Vrací { score, total, durationSeconds, points, pointsReason,
 *         results: [{ id, answer, correct, isCorrect, explanation, rule }] }.
 */
export async function submitWhistle(roundId, answers) {
  requireSupabase();
  const { data, error } = await supabase.rpc('odevzdej_odpiskej', { p_kolo_id: roundId, p_odpovedi: answers });
  if (error) throw error;
  return {
    score: data.skore, total: data.pocet, durationSeconds: data.trvani_s,
    points: data.body, pointsReason: data.body_duvod,
    results: data.vysledky.map(v => ({
      id: v.id, answer: v.odpoved, correct: v.spravne, isCorrect: v.je_spravne,
      explanation: v.vysvetleni, rule: v.pravidlo,
    })),
  };
}

// ---------- Duely (sql/10_duely.sql) ----------

/** Vytvoří výzvu z vlastního odehraného kola. Vrací kód duelu. */
export async function createDuel(roundId) {
  requireSupabase();
  const { data, error } = await supabase.rpc('vytvor_duel', { p_kolo_id: roundId });
  if (error) throw error;
  return data.kod;
}

/**
 * Detail duelu: { kod, hra, stav: 'ceka'|'hraje'|'hotovo'|'vyprselo', vyzyvatel, souper,
 *   je_vyzyvatel, je_souper, vyzyvatel_vysledek, souper_vysledek, vysledek, muj_bonus }
 */
export async function getDuel(code) {
  requireSupabase();
  const { data, error } = await supabase.rpc('detail_duelu', { p_kod: code });
  if (error) throw error;
  return data;
}

/** Přijme výzvu: { hra, kolo_id, …zadání ve tvaru zacni_* dané hry }. */
export async function acceptDuel(code) {
  requireSupabase();
  const { data, error } = await supabase.rpc('prijmi_duel', { p_kod: code });
  if (error) throw error;
  return data;
}

/** Duely přihlášeného hráče: { aktivni: [...], hotove: [...] } (formát v sql/10_duely.sql). */
export async function getMyDuels() {
  requireSupabase();
  const { data, error } = await supabase.rpc('moje_duely');
  if (error) throw error;
  return data;
}
