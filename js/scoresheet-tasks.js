// Trenažér zápisu – úlohy krátké verze (bez DOM).
// Každá úloha = rozepsaný set (náhodný průběh), jedna událost a otázka.
// { set, team, text, question, options: [{ id, label }], correct, explanation, rule, topic }
//
// Generátory s cyklem "attempt": náhodný stav setu konkrétní situaci nemusí
// umožnit (např. nikdo nestřídal), tak se set vygeneruje znovu; po vyčerpání
// pokusů vrátí generátor jinou, vždy proveditelnou úlohu.
import {
  createSet, randomTeams, simulate, pick, shuffle, other, ROMAN, OUTCOMES, SANCTIONS, MAX_SUBS,
  slotPlayer, serverSlot, serverNumber, nextServerSlot, playerAt, positionOf, freshBench, legalSubs, liberoCandidates,
  judgeSub, judgeTimeout, judgeLiberoIn, judgeLiberoOut, outcomeOf, explainOutcome, delayOutcome,
  misconductSanction, misconductRule, requester, applySub, applyTimeout, applyLiberoIn, applyLiberoOut, applySanction,
  playRally, scoreFor,
} from './scoresheet-model.js';

const BEFORE_NOTE = ' (Zápis a hřiště ukazují stav před touto rozehrou.)';
const LAST_POINTS = 22;     // úlohy nevznikají těsně před koncem ani po konci setu

/** Možnosti odpovědi „jak má žádost dopadnout“ (povolit / neoprávněná žádost / zdržování). */
const outcomeOptions = () => Object.entries(OUTCOMES).map(([id, label]) => ({ id, label }));
/** Až 4 čísla hráčů v náhodném pořadí: správné + 3 různé chytáky (bez prázdných a duplicit). */
const numberOptions = (random, correct, distractors) => {
  const unique = [...new Set(distractors.filter(n => n !== correct && n != null))];
  return shuffle(random, [correct, ...shuffle(random, unique).slice(0, 3)]).map(n => ({ id: String(n), label: `č. ${n}` }));
};
const scoreText = set => `A ${set.score.A} : B ${set.score.B}`;
const leaderScore = set => Math.max(set.score.A, set.score.B);

/** Odehraje n rozeher (mezi nimi náhodné povolené události), nejdéle do LAST_POINTS. */
function play(set, random, n) {
  for (let i = 0; i < n && leaderScore(set) < LAST_POINTS; i++) simulate(set, random, 1);
}

/**
 * Rozehraný set ve dvou fázích: v první se do zápisu občas dostane neoprávněná
 * žádost nebo napomenutí za zdržování (při tehdejším skóre), pak hra pokračuje.
 * hook(set) se zavolá mezi fázemi (historie specifická pro úlohu).
 */
function freshSet(random, { min = 6, max = 34, hook } = {}) {
  const set = createSet(randomTeams(random));
  const total = min + Math.floor(random() * (max - min));
  const first = Math.max(2, Math.floor(total * (0.3 + random() * 0.4)));
  play(set, random, first);
  for (const team of ['A', 'B']) {
    if (random() < 0.25) applySanction(set, team, null, 'neopravnena-zadost');
    if (random() < 0.25) applySanction(set, team, null, 'napomenuti-zdrzovani');
  }
  hook?.(set);
  play(set, random, Math.max(2, total - first));
  return set;
}

// ---------- Rotace a pořadí podání ----------
/** Kdo bude podávat po rozehře – stejný hráč, nebo po získání podání další sloupec. */
function taskNextServer(random) {
  const set = freshSet(random);
  const winner = random() < 0.6 ? other(set.serving) : set.serving;
  const t = set.teams[winner];
  const keeps = set.serving === winner;
  const slot = keeps ? serverSlot(set, winner) : nextServerSlot(set, winner);
  const correct = slotPlayer(t.slots[slot]);
  const distractors = [serverNumber(set, winner), slotPlayer(t.slots[t.court[2]]), slotPlayer(t.slots[t.court[5]]),
    t.slots[slot].subIn ? t.slots[slot].starter : t.slots[slot].sub];
  return {
    set, team: winner, topic: 'rotace',
    text: `Za stavu ${scoreText(set)} vyhrálo rozehru družstvo ${winner}${keeps ? ' (podávalo).' : ' (přijímalo).'}${BEFORE_NOTE}`,
    question: `Kdo z družstva ${winner} bude podávat?`,
    options: numberOptions(random, correct, distractors),
    correct: String(correct),
    explanation: keeps
      ? `Podávající družstvo vyhrálo rozehru, takže podává znovu stejný hráč – č. ${correct} (sloupec ${ROMAN[slot]}).`
      : `Družstvo získalo podání a posune se o jednu pozici: podává další sloupec v pořadí podání – ${ROMAN[slot]} (po ${ROMAN[serverSlot(set, winner)]}). `
        + (t.slots[slot].subIn ? `Ve sloupci je teď na hřišti náhradník č. ${correct}, podává tedy on.` : `Je to č. ${correct}.`),
    rule: keeps ? '12.2.2.1' : '12.2.2.2',
  };
}

/** Jde na podání správný hráč? (chyba v pořadí podání se hlásí až po úderu) */
function taskServeCheck(random) {
  const set = freshSet(random);
  const team = other(set.serving);
  const t = set.teams[team];
  const correctNumber = slotPlayer(t.slots[nextServerSlot(set, team)]);
  const right = random() < 0.45;
  // špatně: hráč, který je teď na hřišti (i libero – to podávat nesmí)
  const shown = right ? correctNumber : pick(random, [1, 3, 6].map(pos => playerAt(set, team, pos)));
  return {
    set, team, topic: 'rotace',
    text: `Družstvo ${team} vyhrálo rozehru a získalo podání. Na podání jde č. ${shown}.${BEFORE_NOTE}`,
    question: 'Podává správný hráč?',
    options: [{ id: 'ok', label: 'Ano, je na řadě' }, { id: 'chyba', label: 'Ne – po úderu ohlásit chybu v pořadí podání' }],
    correct: right ? 'ok' : 'chyba',
    explanation: right
      ? `Ano. Po získání podání podává další sloupec v pořadí podání (${ROMAN[nextServerSlot(set, team)]}) – č. ${correctNumber}.`
      : `Ne. Na řadě je sloupec ${ROMAN[nextServerSlot(set, team)]} – č. ${correctNumber}. Zapisovatel chybu oznámí bzučákem hned po úderu podávajícího; `
        + 'družstvo ztrácí rozehru (bod a podání soupeři) a pořadí se opraví.',
    rule: right ? '12.2.2.2' : '7.7.1',
  };
}

// ---------- Střídání ----------
/** Vyčerpá střídání (s rozehrou mezi žádostmi), dokud to jde a set nekončí. */
function fillSubs(set, team, random) {
  const t = set.teams[team];
  for (let i = 0; i < 20 && t.subsUsed < MAX_SUBS && leaderScore(set) < LAST_POINTS; i++) {
    const subs = legalSubs(set, team, { ignoreBreak: true });
    if (!subs.length) break;
    const s = pick(random, subs);
    applySub(set, team, s.out, s.inn);
    playRally(set, random);
  }
}

/** Vysvětlení povoleného střídání: co a s jakým skóre se zapíše do sloupce. */
function subExplanation(set, team, request) {
  const t = set.teams[team];
  const slotIndex = t.slots.findIndex(s => slotPlayer(s) === request.out);
  return t.slots[slotIndex].subIn
    ? `Návrat hráče základní sestavy č. ${request.inn} je v pořádku – do sloupce ${ROMAN[slotIndex]} se zapíše skóre návratu ${scoreFor(set, team)} (nejdřív body družstva, které střídá).`
    : `Střídání je v pořádku – do sloupce ${ROMAN[slotIndex]} (č. ${request.out}) se zapíše náhradník č. ${request.inn} a skóre ${scoreFor(set, team)} (nejdřív body družstva, které střídá).`;
}

/**
 * Žádost o střídání – povolená, nebo jedna z typických chyb: druhá žádost ve
 * stejném přerušení, vyčerpaný limit, náhradníka střídá jiný hráč, uzavřený
 * sloupec, náhradník, který už jednou hrál.
 */
function taskSub(random) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const set = freshSet(random);
    const team = pick(random, ['A', 'B']);
    const t = set.teams[team];
    const kind = pick(random, ['ok', 'ok', 'same-break', 'limit', 'wrong-back', 'closed', 'used-sub']);
    let request = null;
    let note = '';
    const notLibero = (s, i) => t.libero?.slot !== i;

    if (kind === 'ok') {
      const subs = legalSubs(set, team);
      if (subs.length) request = pick(random, subs);
    } else if (kind === 'same-break') {
      const subs = legalSubs(set, team);
      if (subs.length) {
        const first = pick(random, subs);
        applySub(set, team, first.out, first.inn);
        // druhá žádost se týká jiných hráčů (ne okamžitý návrat právě vystřídaného)
        const next = legalSubs(set, team, { ignoreBreak: true }).filter(s => s.out !== first.inn && s.inn !== first.out);
        if (next.length) { request = pick(random, next); note = ` V tomtéž přerušení už střídalo (č. ${first.inn} za č. ${first.out}).`; }
      }
    } else if (kind === 'limit') {
      fillSubs(set, team, random);
      const slot = t.slots.find((s, i) => !s.subIn && !s.closed && notLibero(s, i));
      const bench = freshBench(set, team);
      if (t.subsUsed >= MAX_SUBS && slot && bench.length) request = { out: slot.starter, inn: pick(random, bench) };
    } else if (kind === 'wrong-back') {
      const slot = t.slots.find((s, i) => s.subIn && notLibero(s, i));
      const bench = freshBench(set, team);
      if (slot && bench.length) request = { out: slot.sub, inn: pick(random, bench) };
    } else if (kind === 'closed') {
      const slot = t.slots.find((s, i) => s.closed && notLibero(s, i));
      const bench = freshBench(set, team);
      if (slot && bench.length) request = { out: slot.starter, inn: pick(random, bench) };
    } else if (kind === 'used-sub') {
      const used = t.slots.find(s => s.closed)?.sub;
      const slot = t.slots.find((s, i) => !s.subIn && !s.closed && notLibero(s, i));
      if (used && slot) request = { out: slot.starter, inn: used };
    }
    if (!request) continue;
    if (t.lastSubRally === set.rallies && kind !== 'same-break') continue;

    const verdict = judgeSub(set, team, request.out, request.inn);
    const outcome = outcomeOf(set, team, verdict);
    return {
      set, team, topic: 'stridani',
      text: `Za stavu ${scoreText(set)} žádá družstvo ${team} o střídání: č. ${request.inn} za č. ${request.out}.${note}`,
      question: 'Jak má žádost správně dopadnout?',
      options: outcomeOptions(),
      correct: outcome,
      explanation: verdict.ok ? subExplanation(set, team, request) : `${verdict.reason} ${explainOutcome(set, team, verdict, outcome)}`,
      rule: verdict.ok ? '15.6' : verdict.rule,
    };
  }
  return taskTimeout(random);
}

/** Kolik střídání družstvu v setu zbývá. */
function taskSubsLeft(random) {
  const set = freshSet(random, { min: 12, max: 30 });
  const team = pick(random, ['A', 'B']);
  if (random() < 0.4) fillSubs(set, team, random);
  const left = MAX_SUBS - set.teams[team].subsUsed;
  // chytáky kolem správného počtu (±1, ±2 a „použitá místo zbývajících“), jen 0–6
  const options = shuffle(random, [...new Set([left, Math.max(0, left - 1), Math.min(6, left + 1), 6 - left, left + 2])]
    .filter(n => n >= 0 && n <= 6)).slice(0, 4);
  if (!options.includes(left)) options[0] = left;
  return {
    set, team, topic: 'stridani',
    text: `Druhý rozhodčí se ptá zapisovatele, kolik střídání má družstvo ${team} ještě k dispozici.`,
    question: `Kolik střídání smí družstvo ${team} v tomto setu ještě provést?`,
    options: options.sort((a, b) => a - b).map(n => ({ id: String(n), label: String(n) })),
    correct: String(left),
    explanation: `Družstvo smí v setu střídat nejvýše ${MAX_SUBS}×. V zápisu má ${set.teams[team].subsUsed} střídání (počítá se i návrat hráče základní sestavy), zbývá ${left}.`,
    rule: '15.1',
  };
}

/** Kdo smí vystřídat náhradníka – jen hráč základní sestavy z jeho sloupce. */
function taskWhoMayReplace(random) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const set = freshSet(random, { min: 12, max: 30 });
    const team = pick(random, ['A', 'B']);
    const t = set.teams[team];
    // jen když je návrat opravdu povolený (nevyčerpaná střídání, ne v tomtéž přerušení)
    const legal = legalSubs(set, team);
    const slot = t.slots.find((s, i) => s.subIn && t.libero?.slot !== i && legal.some(l => l.out === s.sub));
    if (!slot) continue;
    const distractors = [...t.slots.map(s => s.starter), ...freshBench(set, team)];
    return {
      set, team, topic: 'stridani',
      text: `Na hřišti je náhradník č. ${slot.sub} (družstvo ${team}). Trenér ho chce vystřídat.`,
      question: `Kdo smí za č. ${slot.sub} nastoupit?`,
      options: numberOptions(random, slot.starter, distractors),
      correct: String(slot.starter),
      explanation: `Náhradníka smí vystřídat jen hráč základní sestavy, za kterého nastoupil – ve sloupci ${ROMAN[t.slots.indexOf(slot)]} je to č. ${slot.starter}. Tím se sloupec uzavře.`,
      rule: '15.6.2',
    };
  }
  return taskSubsLeft(random);
}

// ---------- Oddechové časy, skóre v zápisu ----------
/** Žádost o oddechový čas – povolená, nebo třetí v setu. Záchranná úloha ostatních generátorů. */
function taskTimeout(random) {
  const team = pick(random, ['A', 'B']);
  const wanted = random() < 0.5 ? 2 : Math.floor(random() * 2);
  // oddechové časy se zapíšou během setu (při tehdejším skóre), ne až teď
  const set = freshSet(random, {
    min: 10, max: 30,
    hook: s => { while (s.teams[team].timeouts.length < wanted) { applyTimeout(s, team); playRally(s, random); } },
  });
  const t = set.teams[team];
  const verdict = judgeTimeout(set, team);
  const outcome = outcomeOf(set, team, verdict);
  return {
    set, team, topic: 'oddechy',
    text: `Za stavu ${scoreText(set)} žádá ${requester(set, team).toLowerCase()} ${team} o oddechový čas.`,
    question: 'Jak má žádost správně dopadnout?',
    options: outcomeOptions(),
    correct: outcome,
    explanation: verdict.ok
      ? `V pořádku – družstvo má v zápisu ${t.timeouts.length} ze 2 oddechových časů. Zapíše se skóre ${scoreFor(set, team)} (nejdřív body družstva, které o čas žádá).`
      : `${verdict.reason} ${explainOutcome(set, team, verdict, outcome)}`,
    rule: verdict.ok ? '15.4' : verdict.rule,
  };
}

/** Jaké skóre se zapíše k oddechovému času / střídání (nejdřív body žádajícího družstva). */
function taskScoreOrder(random) {
  const set = freshSet(random, { min: 10, max: 30 });
  while (set.score.A === set.score.B) playRally(set, random);   // při shodě by obě možnosti byly stejné
  const team = pick(random, ['A', 'B']);
  const what = random() < 0.5 ? 'oddechový čas' : 'střídání';
  const right = scoreFor(set, team);
  const wrong = scoreFor(set, other(team));
  return {
    set, team, topic: 'oddechy',
    text: `Družstvo ${team} má ${what} za stavu ${scoreText(set)}.`,
    question: `Jaké skóre zapíšeš ${what === 'střídání' ? 'ke střídání' : 'k oddechovému času'}?`,
    options: shuffle(random, [{ id: right, label: right }, { id: wrong, label: wrong }]),
    correct: right,
    explanation: `Podle pokynů k vyplňování zápisu se k oddechovému času i ke střídání píše skóre v okamžiku žádosti, nejdřív body družstva, které o přerušení žádá: ${right}.`,
    rule: '27.2.2.3',
  };
}

// ---------- Libero ----------
/**
 * Výměna libera – povolená, nebo chyba: za hráče přední řady, za podávajícího,
 * bez rozehry mezi výměnami, libero nahrazuje jiný hráč než ten, za kterého přišlo.
 */
function taskLibero(random) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const set = freshSet(random);
    const team = pick(random, ['A', 'B']);
    const t = set.teams[team];
    const kind = pick(random, ['ok', 'ok', 'front', 'no-rally', 'wrong-back', 'server']);
    let text, verdict;
    const libero = pick(random, t.liberos);

    if (t.libero) {
      if (kind !== 'wrong-back' && kind !== 'ok') continue;
      if (t.lastLiberoRally === set.rallies) continue;
      const replaced = slotPlayer(t.slots[t.libero.slot]);
      const back = kind === 'ok' ? replaced : pick(random, freshBench(set, team));
      if (back == null) continue;
      verdict = judgeLiberoOut(set, team, back);
      text = back === replaced
        ? `Libero č. ${t.libero.number} (družstvo ${team}) odchází, vrací se č. ${back}.`
        : `Za libero č. ${t.libero.number} (družstvo ${team}) jde na hřiště č. ${back}.`;
    } else if (kind === 'ok' || kind === 'front') {
      const candidates = liberoCandidates(set, team);
      if (kind === 'ok' && !candidates.length) continue;
      const player = kind === 'ok' ? pick(random, candidates) : playerAt(set, team, pick(random, [2, 3, 4]));
      verdict = judgeLiberoIn(set, team, player);
      text = `Libero č. ${libero} (družstvo ${team}) jde na hřiště za č. ${player} (pozice ${positionOf(set, team, player)}).`;
    } else if (kind === 'server') {
      if (set.serving !== team || t.lastLiberoRally === set.rallies) continue;
      const player = playerAt(set, team, 1);
      verdict = judgeLiberoIn(set, team, player);
      text = `Družstvo ${team} podává. Libero č. ${libero} jde na hřiště za č. ${player} (pozice 1).`;
    } else if (kind === 'no-rally') {
      const candidates = liberoCandidates(set, team);
      if (candidates.length < 2) continue;
      const first = pick(random, candidates);
      applyLiberoIn(set, team, libero, first);
      applyLiberoOut(set, team);
      const player = pick(random, candidates.filter(n => n !== first));
      verdict = judgeLiberoIn(set, team, player);
      text = `V tomtéž přerušení libero č. ${libero} vystřídalo č. ${first} a hned zase odešlo (vrátil se č. ${first}). Teď chce jít znovu na hřiště za č. ${player}.`;
    } else continue;

    const outcome = outcomeOf(set, team, verdict);
    return {
      set, team, topic: 'libero', text: `Za stavu ${scoreText(set)}: ${text}`,
      question: 'Jak má výměna správně dopadnout?',
      options: outcomeOptions(),
      correct: outcome,
      explanation: verdict.ok
        ? 'Výměna libera je v pořádku. Nepočítá se jako střídání; zapisuje se do zápisu o výměnách libera (vede ho pomocný zapisovatel).'
        : `${verdict.reason} ${explainOutcome(set, team, verdict, outcome)}`,
      rule: verdict.ok ? '19.3.2' : verdict.rule,
    };
  }
  return taskTimeout(random);
}

// ---------- Sankce ----------
const MISCONDUCT = {
  mirne: 'mírně nevhodné chování (2. krok – po ústním upozornění)',
  hrube: 'hrubé chování',
  urazlive: 'urážlivé chování',
  agrese: 'agrese',
};
const MISCONDUCT_ACC = { hrube: 'hrubé chování', urazlive: 'urážlivé chování', agrese: 'agresi' };
const BASE_SANCTION = { hrube: 'trest', urazlive: 'vylouceni', agrese: 'diskvalifikace' };

/** Sankce za nevhodné chování podle závažnosti a toho, co už má člen družstva v zápisu. */
function taskMisconduct(random) {
  const team = pick(random, ['A', 'B']);
  let member = null;
  let history = [];
  // historie se odehraje během setu: trest dá soupeři bod (při tehdejším skóre)
  const set = freshSet(random, {
    hook: s => {
      const t = s.teams[team];
      member = random() < 0.2 ? 'T' : pick(random, [...t.lineup, ...freshBench(s, team)]);
      const hadYellow = s.sanctions.some(x => x.team === team && x.kind === 'napomenuti');
      // napomenutí (žlutá karta) nejvýš jedno za družstvo – stejně jako v simulate()
      history = pick(random, hadYellow ? [[], [], ['trest']] : [[], [], ['trest'], ['napomenuti']]);
      for (const kind of history) applySanction(s, team, member, kind);
    },
  });
  const yellowInTeam = set.sanctions.some(x => x.team === team && x.kind === 'napomenuti');
  const kind = pick(random, yellowInTeam || history.length
    ? ['hrube', 'hrube', 'urazlive', 'agrese'] : ['hrube', 'hrube', 'urazlive', 'agrese', 'mirne']);
  const correct = misconductSanction(set, team, member, kind);
  const who = member === 'T' ? 'trenér' : `hráč č. ${member}`;
  const prior = history.length ? ` V zápisu už má: ${history.map(k => SANCTIONS[k].label.toLowerCase()).join(', ')}.` : '';
  const effect = {
    napomenuti: 'Formální napomenutí samo není sankce, jen se zapíše.',
    trest: 'Trest = bod a podání soupeři.',
    vylouceni: 'Vyloučený musí do konce setu do šatny (hráč na hřišti se vystřídá).',
    diskvalifikace: 'Diskvalifikovaný musí do konce utkání do šatny.',
  }[correct];
  const stricter = kind !== 'mirne' && correct !== BASE_SANCTION[kind];
  return {
    set, team, topic: 'sankce',
    text: `První rozhodčí hlásí: ${MISCONDUCT[kind]} – ${who} (družstvo ${team}).${prior}`,
    question: 'Co zapíšeš?',
    options: Object.entries(SANCTIONS).map(([id, s]) => ({ id, label: s.label })),
    correct,
    explanation: (kind === 'mirne'
      ? 'Mírně nevhodné chování se nesankcionuje; ve 2. kroku dostane člen družstva žlutou kartu – formální napomenutí.'
      : `Za ${MISCONDUCT_ACC[kind]} je první sankcí ${SANCTIONS[BASE_SANCTION[kind]].label.toLowerCase()}`
        + (stricter ? `, ale opakovaný přestupek téhož člena se trestá přísněji – ${SANCTIONS[correct].label.toLowerCase()}.` : '.'))
      + ' ' + effect,
    rule: misconductRule(kind, correct),
  };
}

/** Sankce za zdržování: poprvé napomenutí, pak trest. */
function taskDelay(random) {
  const set = freshSet(random);
  const team = pick(random, ['A', 'B']);
  const reasons = ['náhradník nebyl připravený ke hře', 'pomalu se vrací na hřiště po pokynu ke hře'];
  if (set.teams[team].timeouts.length) reasons.push('protahuje oddechový čas');
  const correct = delayOutcome(set, team);
  return {
    set, team, topic: 'sankce',
    text: `Družstvo ${team} zdržuje hru: ${pick(random, reasons)}.`,
    question: 'Jakou sankci zapíšeš?',
    options: [{ id: 'napomenuti-zdrzovani', label: 'Napomenutí za zdržování' }, { id: 'trest-zdrzovani', label: 'Trest za zdržování' }],
    correct,
    explanation: correct === 'napomenuti-zdrzovani'
      ? 'Je to první zdržování družstva v utkání – napomenutí za zdržování, bez ztráty bodu.'
      : 'Družstvo už napomenutí za zdržování v zápisu má. Každé další zdržování je trest za zdržování: bod a podání soupeři.',
    rule: correct === 'napomenuti-zdrzovani' ? '16.2.2' : '16.2.3',
  };
}

// ---------- Výběr úloh ----------
// Generátor uvedený dvakrát se losuje dvakrát častěji (důležitější témata).
const GENERATORS = [taskNextServer, taskNextServer, taskServeCheck, taskSub, taskSub, taskSubsLeft, taskWhoMayReplace,
  taskTimeout, taskScoreOrder, taskLibero, taskLibero, taskMisconduct, taskDelay];

/** Kolo úloh: count úloh, bez dvou stejných typů po sobě. */
export function generateTasks(random = Math.random, count = 10) {
  const tasks = [];
  let last = null;
  while (tasks.length < count) {
    const generator = pick(random, GENERATORS);
    if (generator === last) continue;
    last = generator;
    tasks.push(generator(random));
  }
  return tasks;
}
