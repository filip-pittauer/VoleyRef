// Trenažér zápisu – dlouhá verze: vedení celého setu (bez DOM).
//
// Hra vydává jednu událost po druhé (rozehra, žádost, výměna libera, kontrola
// podávajícího, sankce). U každé zná správnou reakci zapisovatele; resolve()
// pak do modelu vždy provede SPRÁVNOU variantu, takže set pokračuje dál
// správně, i když hráč chyboval.
import {
  createSet, randomTeams, pick, other, SANCTIONS, MAX_SUBS, isSetOver,
  slotPlayer, serverSlot, nextServerSlot, playerAt, positionOf, freshBench, legalSubs, liberoCandidates,
  judgeSub, judgeTimeout, judgeLiberoIn, judgeLiberoOut, outcomeOf, explainOutcome, delayOutcome, misconductSanction,
  misconductRule, requester,
  applyPoint, applyTimeout, applySub, applyLiberoIn, applyLiberoOut, applySanction,
} from './scoresheet-model.js';

const MISCONDUCT = { hrube: 'hrubé chování', urazlive: 'urážlivé chování', mirne: 'mírně nevhodné chování (2. krok)' };
const DELAYS = ['náhradník nebyl připravený ke hře', 'pomalu se vrací na hřiště po pokynu ke hře'];

/**
 * Nová hra (jeden set s náhodnými družstvy). Vrací { set, next, resolveRally, resolveDecision }:
 * next() vydá další událost, resolveRally/resolveDecision ji provedou (správně) v modelu.
 * Stav hry (fronta, počitadla přerušení) drží uzávěr – proměnné uvnitř funkce,
 * podobně jako soukromá pole třídy v C#.
 */
export function createGame(random = Math.random) {
  const set = createSet(randomTeams(random));
  const queue = [];                // události, které musí přijít hned (bod po trestu, odchod libera)
  let breakEvents = 0;             // kolik událostí už v tomto přerušení bylo
  let requested = { A: false, B: false };   // družstvo už v tomto přerušení žádalo (nebo zdržovalo)
  let serveChecked = false;
  let lastWinner = null;

  // ---------- Žádosti (část neoprávněných) ----------
  /**
   * Žádost o střídání: povolená (5× větší šance), nebo jedna z chyb, které stav
   * setu zrovna umožňuje. null = družstvo teď nemá jak žádat.
   */
  function subRequest(team) {
    const t = set.teams[team];
    const variants = [];
    const legal = legalSubs(set, team);
    if (legal.length) for (let i = 0; i < 5; i++) variants.push(['ok', pick(random, legal)]);
    const bench = freshBench(set, team);
    const onCourt = (slot, i) => t.libero?.slot !== i;
    const subbed = t.slots.find((s, i) => s.subIn && onCourt(s, i));
    if (subbed && bench.length) variants.push(['wrong-back', { out: subbed.sub, inn: pick(random, bench) }]);
    const closed = t.slots.find((s, i) => s.closed && onCourt(s, i));
    if (closed && bench.length) variants.push(['closed', { out: closed.starter, inn: pick(random, bench) }]);
    const usedSub = t.slots.find(s => s.closed)?.sub;
    const open = t.slots.find((s, i) => !s.subIn && !s.closed && onCourt(s, i));
    if (usedSub && open) variants.push(['used-sub', { out: open.starter, inn: usedSub }]);
    if (t.lastSubRally === set.rallies) {
      const more = legalSubs(set, team, { ignoreBreak: true });
      if (more.length) variants.push(['same-break', pick(random, more)]);
    }
    if (t.subsUsed >= MAX_SUBS && open && bench.length) variants.push(['limit', { out: open.starter, inn: pick(random, bench) }]);
    if (!variants.length) return null;
    const [, request] = pick(random, variants);
    const verdict = judgeSub(set, team, request.out, request.inn);
    return {
      type: 'sub', team, ...request, verdict, expected: outcomeOf(set, team, verdict),
      text: `Družstvo ${team} žádá o střídání: č. ${request.inn} za č. ${request.out}.`,
    };
  }

  /** Žádost o oddechový čas (i třetí – neoprávněná). */
  function timeoutRequest(team) {
    const verdict = judgeTimeout(set, team);
    if (!verdict.ok && random() < 0.6) return null;   // po vyčerpání žádá trenér jen občas
    return { type: 'timeout', team, verdict, expected: outcomeOf(set, team, verdict), text: `${requester(set, team)} ${team} žádá o oddechový čas.` };
  }

  /**
   * Výměna libera: odchod (většinou správně, občas za něj jde jiný hráč), nebo
   * příchod – většinou za hráče zadní řady, občas za podávajícího nebo do přední řady.
   */
  function liberoRequest(team) {
    const t = set.teams[team];
    if (t.libero) {
      const replaced = slotPlayer(t.slots[t.libero.slot]);
      const bench = freshBench(set, team);
      const back = random() < 0.75 || !bench.length ? replaced : pick(random, bench);
      if (back === replaced && t.lastLiberoRally === set.rallies) return null;
      const verdict = judgeLiberoOut(set, team, back);
      return { type: 'libero-out', team, back, verdict, expected: outcomeOf(set, team, verdict),
        text: back === replaced
          ? `Libero č. ${t.libero.number} (družstvo ${team}) odchází, vrací se č. ${back}.`
          : `Za libero č. ${t.libero.number} (družstvo ${team}) jde na hřiště č. ${back}.` };
    }
    const candidates = liberoCandidates(set, team);
    let player;
    const roll = random();
    if (candidates.length && roll < 0.82) player = pick(random, candidates);
    else if (set.serving === team && roll < 0.9) player = playerAt(set, team, 1);
    else player = playerAt(set, team, pick(random, [2, 3, 4]));
    const libero = pick(random, t.liberos);
    const verdict = judgeLiberoIn(set, team, player);
    return { type: 'libero-in', team, libero, player, verdict, expected: outcomeOf(set, team, verdict),
      text: `Libero č. ${libero} (družstvo ${team}) jde na hřiště za č. ${player} (pozice ${positionOf(set, team, player)}).` };
  }

  /** Nevhodné chování člena družstva – sankce podle závažnosti a předchozích sankcí. */
  function misconduct(team) {
    const t = set.teams[team];
    // člen na lavičce nebo trenér – vyloučený hráč na hřišti by se musel střídat
    const bench = freshBench(set, team);
    const coachOk = !t.excluded.includes('T');
    if (!coachOk && !bench.length) return null;
    const member = coachOk && (random() < 0.3 || !bench.length) ? 'T' : pick(random, bench);
    const sanctioned = set.sanctions.some(s => s.team === team && s.member === member);
    const yellow = set.sanctions.some(s => s.team === team && s.kind === 'napomenuti');
    const kind = pick(random, sanctioned || yellow ? ['hrube', 'urazlive'] : ['hrube', 'hrube', 'urazlive', 'mirne']);
    const expected = misconductSanction(set, team, member, kind);
    const who = member === 'T' ? 'trenér' : `č. ${member}`;
    return { type: 'misconduct', team, member, kind, expected,
      text: `První rozhodčí: ${MISCONDUCT[kind]} – ${who} (družstvo ${team}).` };
  }

  /** Zdržování hry (bez žádosti). */
  function delayEvent(team) {
    const reasons = set.teams[team].timeouts.length ? [...DELAYS, 'protahuje oddechový čas'] : DELAYS;
    return { type: 'delay', team, expected: delayOutcome(set, team), text: `Družstvo ${team} zdržuje hru: ${pick(random, reasons)}.` };
  }

  /**
   * Událost v přerušení hry pro družstvo, které v něm ještě nežádalo.
   * Pravděpodobnosti: střídání 30 %, oddechový čas 20 %, libero 35 %, chování 10 %, zdržování 5 %.
   */
  function breakEvent() {
    const free = ['A', 'B'].filter(t => !requested[t]);
    if (!free.length) return null;
    const team = pick(random, free);
    const roll = random();
    if (roll < 0.3) return subRequest(team);
    if (roll < 0.5) return timeoutRequest(team);
    if (roll < 0.85) return liberoRequest(team);
    if (roll < 0.95) return misconduct(team);
    return delayEvent(team);
  }

  // ---------- Další událost ----------
  /**
   * Další událost v tomto pořadí: nejdřív vynucené (fronta), konec setu, občas
   * událost v přerušení (nejvýš 2), jednou za přerušení případně kontrola
   * podávajícího, jinak rozehra s náhodným vítězem.
   */
  function next() {
    if (queue.length) return queue.shift();
    if (isSetOver(set)) return { type: 'end' };
    if (breakEvents < 2 && random() < 0.22) {
      const event = breakEvent();
      if (event) { breakEvents++; if (event.team) requested[event.team] = true; return event; }
    }
    if (!serveChecked && lastWinner && random() < 0.15) {
      serveChecked = true;
      const team = set.serving;
      const right = random() < 0.75;
      const correct = slotPlayer(set.teams[team].slots[serverSlot(set, team)]);
      const shown = right ? correct : playerAt(set, team, pick(random, [2, 3, 6]));
      return { type: 'serve', team, shown, correctNumber: correct, expected: right ? 'ok' : 'chyba',
        text: `Na podání jde č. ${shown} (družstvo ${team}).` };
    }
    const winner = random() < 0.5 ? 'A' : 'B';
    return rallyEvent(winner, `Rozehru vyhrálo družstvo ${winner}.`);
  }

  /** Rozehra: vítěz a kdo z něj má podávat (expectedSlot) – na to se trenažér ptá. */
  function rallyEvent(winner, text) {
    return { type: 'rally', winner, text, sideOut: set.serving !== winner,
      prevSlot: serverSlot(set, winner),      // kdo z vítěze podával naposledy (před rotací)
      expectedSlot: set.serving !== winner ? nextServerSlot(set, winner) : serverSlot(set, winner) };
  }

  // ---------- Provedení správné varianty ----------
  /** Po rozehře: zapsat bod (správnému družstvu). Vrací případný nucený odchod libera. */
  function resolveRally(event) {
    const result = applyPoint(set, event.winner);
    breakEvents = 0;
    requested = { A: false, B: false };
    serveChecked = false;
    lastWinner = event.winner;
    if (result.liberoMustLeave) {
      const t = set.teams[event.winner];
      queue.unshift({ type: 'libero-forced', team: event.winner, expected: 'ok',
        text: `Libero č. ${t.libero.number} (družstvo ${event.winner}) by se rotací dostalo do přední řady – odchází, na hřiště se vrací č. ${slotPlayer(t.slots[t.libero.slot])}.` });
    }
  }

  /** Událost s rozhodnutím (žádost, sankce, kontrola podávajícího): provede správnou reakci. */
  function resolveDecision(event) {
    const { team } = event;
    switch (event.type) {
      case 'timeout': case 'sub': case 'libero-in': case 'libero-out':
        if (event.expected === 'zapsat') {
          if (event.type === 'timeout') applyTimeout(set, team);
          if (event.type === 'sub') applySub(set, team, event.out, event.inn);
          if (event.type === 'libero-in') applyLiberoIn(set, team, event.libero, event.player);
          if (event.type === 'libero-out') applyLiberoOut(set, team);
        } else {
          applySanction(set, team, null, event.expected, { withPoint: false });
          if (event.expected === 'trest-zdrzovani') queue.unshift(rallyEvent(other(team), `Trest za zdržování: bod a podání získává družstvo ${other(team)}.`));
        }
        break;
      case 'delay':
        applySanction(set, team, null, event.expected, { withPoint: false });
        if (event.expected === 'trest-zdrzovani') queue.unshift(rallyEvent(other(team), `Trest za zdržování: bod a podání získává družstvo ${other(team)}.`));
        break;
      case 'misconduct':
        applySanction(set, team, event.member, event.expected, { withPoint: false });
        if (event.expected === 'trest') queue.unshift(rallyEvent(other(team), `Trest: bod a podání získává družstvo ${other(team)}.`));
        break;
      case 'serve':
        // chyba v pořadí podání: rozehra pro soupeře (7.7.1); pořadí v zápisu je správné, jen podával jiný hráč
        if (event.expected === 'chyba') queue.unshift(rallyEvent(other(team), `Chyba v pořadí podání: bod a podání získává družstvo ${other(team)}.`));
        else serveChecked = true;
        break;
      case 'libero-forced':
        applyLiberoOut(set, team);
        break;
      default:
    }
  }

  return { set, next, resolveRally, resolveDecision };
}

/**
 * Vysvětlení správné reakce a číslo pravidla: { text, rule }.
 * Volat PŘED resolveDecision (důsledek závisí na tom, co už je v zápisu).
 */
export function explain(set, event) {
  const { team } = event;
  switch (event.type) {
    case 'timeout': case 'sub': case 'libero-in': case 'libero-out': {
      if (event.expected === 'zapsat') {
        const slot = event.type === 'sub' ? set.teams[team].slots.find(sl => slotPlayer(sl) === event.out) : null;
        return {
          text: {
            timeout: 'Oddechový čas je povolený – zapiš skóre (nejdřív body družstva, které žádá).',
            sub: slot?.subIn
              ? 'Návrat hráče základní sestavy je v pořádku – zapiš do jeho sloupce skóre návratu.'
              : 'Střídání je v pořádku – zapiš náhradníka a skóre do sloupce odcházejícího hráče.',
            'libero-in': 'Výměna libera je v pořádku (hráč zadní řady, mezi výměnami proběhla rozehra).',
            'libero-out': 'Výměna libera je v pořádku – vrací se hráč, za kterého libero přišlo.',
          }[event.type],
          rule: { timeout: '15.4', sub: '15.6', 'libero-in': '19.3.2', 'libero-out': '19.3.2.2' }[event.type],
        };
      }
      return { text: `${event.verdict.reason} ${explainOutcome(set, team, event.verdict, event.expected)}`, rule: event.verdict.rule };
    }
    case 'delay':
      return event.expected === 'napomenuti-zdrzovani'
        ? { text: 'První zdržování družstva v utkání: napomenutí za zdržování, bez ztráty bodu.', rule: '16.2.2' }
        : { text: 'Družstvo už napomenutí za zdržování má: trest za zdržování – bod a podání soupeři.', rule: '16.2.3' };
    case 'misconduct': {
      const effect = {
        napomenuti: 'Mírně nevhodné chování se nesankcionuje; ve 2. kroku žlutá karta – formální napomenutí, jen se zapíše.',
        trest: 'Trest: bod a podání soupeři.',
        vylouceni: 'Vyloučení: do konce setu do šatny.',
        diskvalifikace: 'Diskvalifikace: do konce utkání do šatny.',
      }[event.expected];
      const repeated = set.sanctions.some(sn => sn.team === team && sn.member === event.member && SANCTIONS[sn.kind]?.severity >= 1);
      return { text: `Správně: ${SANCTIONS[event.expected].label.toLowerCase()}.${repeated ? ' Opakovaný přestupek téhož člena se trestá přísněji.' : ''} ${effect}`,
        rule: misconductRule(event.kind, event.expected) };
    }
    case 'serve':
      return event.expected === 'ok'
        ? { text: `Podává správně č. ${event.correctNumber}.`, rule: '12.2' }
        : { text: `Na řadě je č. ${event.correctNumber}. Zapisovatel chybu v pořadí podání ohlásí bzučákem hned po úderu; bod a podání získává soupeř.`, rule: '7.7.1' };
    default:
      return { text: '', rule: null };
  }
}
