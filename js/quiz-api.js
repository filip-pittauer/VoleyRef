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
 *   mode       = 'bezne' | 'chyby' (opakování chyb) | 'denni' (denní výzva) | 'zkouska'
 *                u ostatních než 'bezne' se kategorie a obtížnost ignorují
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
 * { den, hracu, stav: 'nehrano'|'rozehrano'|'odehrano', skore, pocet, trvani_s, poradi, serie: { aktualni, nejdelsi } }
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

/**
 * Odevzdá odpovědi kola. answers = { [idOtazky]: 'A' | 'B' | ... }
 * Vrací { score, total, durationSeconds, newBadges: [id odznaku…],
 *         results: [{ id, answer, correctAnswer, isCorrect, explanation }],
 *         exam: { passScore, inTime, passed } jen u zkoušky, jinak null }
 */
export async function submitRound(roundId, answers) {
  requireSupabase();
  const { data, error } = await supabase.rpc('odevzdej_kolo', {
    p_kolo_id: roundId,
    p_odpovedi: answers,
  });
  if (error) throw error;

  // Názvy z databáze (česky) → názvy, se kterými pracuje kvíz.
  return {
    score: data.skore,
    total: data.pocet,
    durationSeconds: data.trvani_s,
    newBadges: data.nove_odznaky ?? [],
    results: data.vysledky.map(v => ({
      id: v.id,
      answer: v.odpoved,
      correctAnswer: v.spravna,
      isCorrect: v.je_spravne,
      explanation: v.vysvetleni,
    })),
    exam: data.zkouska
      ? { passScore: data.zkouska.hranice, inTime: data.zkouska.vcas, passed: data.zkouska.splneno }
      : null,
  };
}
