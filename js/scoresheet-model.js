// Trenažér zápisu – model jednoho setu bez DOM (testovatelný v Node).
//
// Drží to, co zapisovatel sleduje: skóre, pořadí podání (sloupce I–VI),
// střídání, oddechové časy, libero a sankce. Funkce judge* jen posoudí
// žádost podle pravidel (nic nemění), apply* ji provedou.
//
// Pozice na hřišti: team.court[pos - 1] = index sloupce (0–5 = I–VI)
// v pořadí podání. Na začátku stojí sloupec I na pozici 1 (podává), II na 2…

export const MAX_SUBS = 6;            // 15.1
export const MAX_TIMEOUTS = 2;        // 15.1
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
export const other = team => (team === 'A' ? 'B' : 'A');

const BACK_ROW = [1, 5, 6];           // pozice zadní řady

/** Důsledky žádosti nebo přestupku (id odpovědi v trenažéru). */
export const OUTCOMES = {
  zapsat: 'Povolit a zapsat',
  'neopravnena-zadost': 'Odmítnout – neoprávněná žádost (jen zapsat)',
  'napomenuti-zdrzovani': 'Odmítnout – napomenutí za zdržování',
  'trest-zdrzovani': 'Odmítnout – trest za zdržování',
};

/** Sankce za nevhodné chování (stupně podle 21.3). */
export const SANCTIONS = {
  napomenuti: { label: 'Napomenutí (žlutá karta)', severity: 0 },
  trest: { label: 'Trest (červená karta)', severity: 1 },
  vylouceni: { label: 'Vyloučení', severity: 2 },
  diskvalifikace: { label: 'Diskvalifikace', severity: 3 },
};

export const SANCTION_LOG_LABELS = {
  ...Object.fromEntries(Object.entries(SANCTIONS).map(([id, s]) => [id, s.label])),
  'napomenuti-zdrzovani': 'Napomenutí za zdržování',
  'trest-zdrzovani': 'Trest za zdržování',
  'neopravnena-zadost': 'Neoprávněná žádost',
};

// ---------- Založení setu ----------
/**
 * Nový set. teams = { A: { lineup: [6 čísel I–VI], bench: [...], liberos: [...] }, B: {...} },
 * firstServe = 'A' | 'B'.
 */
export function createSet({ A, B, firstServe = 'A' }) {
  const team = config => ({
    lineup: [...config.lineup],
    bench: [...config.bench],
    liberos: [...config.liberos],
    // sloupce pořadí podání: hráč základní sestavy, náhradník, skóre střídání, skóre při ztrátě podání
    slots: config.lineup.map(starter => ({ starter, sub: null, subIn: false, closed: false, subAt: null, backAt: null, serves: [] })),
    court: [0, 1, 2, 3, 4, 5],
    libero: null,                 // { number, slot } – libero na hřišti místo hráče ze sloupce slot
    subsUsed: 0,
    timeouts: [],                 // skóre při oddechových časech („vlastní:soupeř“)
    lastSubRally: -1,             // po které dokončené rozehře byla poslední žádost o střídání
    lastLiberoRally: -1,          // po které dokončené rozehře byla poslední výměna libera
    improperUsed: false,          // v utkání už měl neoprávněnou žádost (15.11.2)
    delayWarned: false,           // už má napomenutí za zdržování (16.2.2)
    excluded: [],                 // vyloučení v setu / diskvalifikovaní (čísla, 'T' = trenér) – nesmějí hrát ani žádat
  });
  return { score: { A: 0, B: 0 }, serving: firstServe, rallies: 0, teams: { A: team(A), B: team(B) }, sanctions: [] };
}

// ---------- Čtení stavu ----------
export const slotPlayer = slot => (slot.subIn ? slot.sub : slot.starter);

/** Skóre z pohledu družstva: „vlastní:soupeř“ (tak se zapisuje k oddechovým časům a střídání). */
export const scoreFor = (set, team) => `${set.score[team]}:${set.score[other(team)]}`;

/** Hráč na pozici 1–6 (včetně libera). */
export function playerAt(set, team, pos) {
  const t = set.teams[team];
  const slot = t.court[pos - 1];
  return t.libero?.slot === slot ? t.libero.number : slotPlayer(t.slots[slot]);
}

/** Pozice 1–6 hráče na hřišti (nebo null). */
export function positionOf(set, team, number) {
  for (let pos = 1; pos <= 6; pos++) if (playerAt(set, team, pos) === number) return pos;
  return null;
}

/** Sloupec (0–5) hráče, který je teď na hřišti za tento sloupec (libero se nepočítá). */
export function slotOfPlayer(set, team, number) {
  const t = set.teams[team];
  return t.slots.findIndex((slot, i) => slotPlayer(slot) === number && t.libero?.slot !== i);
}

/** Sloupec a číslo hráče na pozici 1 (podávající, nebo ten, kdo podával naposledy). */
export function serverSlot(set, team) { return set.teams[team].court[0]; }
export function serverNumber(set, team) { return slotPlayer(set.teams[team].slots[serverSlot(set, team)]); }

/** Kdo bude podávat, až družstvo získá podání (hráč z pozice 2 – sloupec po současném). */
export function nextServerSlot(set, team) { return set.teams[team].court[1]; }

/** Hráči na lavičce, kteří ještě smějí jako náhradníci nastoupit (nejsou libera a ještě nestřídali). */
export function freshBench(set, team) {
  const t = set.teams[team];
  return t.bench.filter(n => !t.slots.some(slot => slot.sub === n) && !t.excluded.includes(n));
}

/** Kdo za družstvo žádá o přerušení: trenér, nebo kapitán ve hře, když je trenér vyloučený (15.3.1). */
export const requester = (set, team) => (set.teams[team].excluded.includes('T') ? 'Kapitán ve hře družstva' : 'Trenér družstva');

export const isSetOver = set => Math.max(set.score.A, set.score.B) >= 25 && Math.abs(set.score.A - set.score.B) >= 2;

// ---------- Rozehra ----------
function rotate(team) {
  const c = team.court;
  team.court = [c[1], c[2], c[3], c[4], c[5], c[0]];
}

/**
 * Bod pro družstvo winner. Když bod získá přijímající družstvo, podávajícímu
 * soupeře se zapíše skóre ztráty podání a vítěz se posune (rotace) a podává.
 * Vrací { sideOut, liberoMustLeave } – libero, které by se dostalo do přední řady, musí odejít.
 */
export function applyPoint(set, winner) {
  const sideOut = set.serving !== winner;
  if (sideOut) {
    const loser = set.teams[other(winner)];
    loser.slots[loser.court[0]].serves.push(set.score[other(winner)]);
    rotate(set.teams[winner]);
    set.serving = winner;
  }
  set.score[winner]++;
  set.rallies++;
  const t = set.teams[winner];
  const liberoMustLeave = !!t.libero && !BACK_ROW.includes(t.court.indexOf(t.libero.slot) + 1);
  return { sideOut, liberoMustLeave };
}

// ---------- Posouzení žádostí ----------
const ok = () => ({ ok: true });
const improper = (reason, rule, about) => ({ ok: false, kind: 'improper', reason, rule, about });
const delay = (reason, rule, about) => ({ ok: false, kind: 'delay', reason, rule, about });

/** Oddechový čas (15.1, 15.11.1.4). */
export function judgeTimeout(set, team) {
  if (set.teams[team].timeouts.length >= MAX_TIMEOUTS) {
    return improper('Družstvo už v setu vyčerpalo oba oddechové časy.', '15.11.1.4', 'timeout');
  }
  return ok();
}

/** Střídání: hráč out odchází, hráč inn přichází (15.1, 15.2, 15.6, 15.11). */
export function judgeSub(set, team, out, inn) {
  const t = set.teams[team];
  if (t.lastSubRally === set.rallies) {
    return improper('Je to druhá žádost o střídání v tomtéž přerušení – mezi dvěma žádostmi musí proběhnout dokončená rozehra.', '15.11.1.3', 'sub');
  }
  if (t.subsUsed >= MAX_SUBS) return improper(`Družstvo už v setu vyčerpalo všech ${MAX_SUBS} střídání.`, '15.11.1.4', 'sub');
  const slotIndex = slotOfPlayer(set, team, out);
  if (slotIndex < 0) return delay(`Hráč č. ${out} není na hřišti, nemůže být vystřídán.`, '15.5.1', 'sub');
  if (t.excluded.includes(inn)) {
    return delay(`Hráč č. ${inn} je vyloučený (nebo diskvalifikovaný) – do konce setu se hry nesmí účastnit.`, '21.3.2.1', 'sub');
  }
  if (positionOf(set, team, inn) || t.slots.some((s, i) => i !== slotIndex && s.starter === inn)) {
    return delay(`Hráč č. ${inn} patří do jiného sloupce základní sestavy – na tomto místě nastoupit nesmí.`, '15.6.1', 'sub');
  }
  const slot = t.slots[slotIndex];
  if (!slot.subIn) {
    if (slot.closed) {
      return delay(`Hráč č. ${out} už v setu jednou odešel a vrátil se – znovu hru opustit nesmí.`, '15.6.1', 'sub');
    }
    if (t.slots.some(s => s.sub === inn)) {
      return delay(`Náhradník č. ${inn} už v setu jednou nastoupil – znovu nastoupit nesmí.`, '15.6.2', 'sub');
    }
    return ok();
  }
  if (inn !== slot.starter) {
    return delay(`Náhradníka č. ${out} smí vystřídat jen hráč č. ${slot.starter}, za kterého nastoupil.`, '15.6.2', 'sub');
  }
  return ok();
}

/** Libero jde na hřiště za hráče player (19.3.1.1, 19.3.2.1, 19.3.2.9). */
export function judgeLiberoIn(set, team, player) {
  const t = set.teams[team];
  if (t.lastLiberoRally === set.rallies) {
    return delay('Mezi dvěma výměnami libera musí proběhnout dokončená rozehra.', '19.3.2.1', 'libero');
  }
  const pos = positionOf(set, team, player);
  if (!BACK_ROW.includes(pos)) {
    return delay(`Libero smí nahradit jen hráče zadní řady – č. ${player} je na pozici ${pos} v přední řadě.`, '19.3.1.1', 'libero');
  }
  if (set.serving === team && pos === 1) {
    return delay(`Č. ${player} jde podávat – libero podávat nesmí.`, '19.3.1.3', 'libero');
  }
  return ok();
}

/** Hráč back nahrazuje libero na hřišti (19.3.2.2, 19.3.2.9). */
export function judgeLiberoOut(set, team, back) {
  const t = set.teams[team];
  const replaced = slotPlayer(t.slots[t.libero.slot]);
  if (back !== replaced) {
    return delay(`Libero smí nahradit jen hráč, za kterého na hřiště přišlo (č. ${replaced}), nebo druhé libero.`, '19.3.2.2', 'libero');
  }
  if (t.lastLiberoRally === set.rallies) {
    return delay('Mezi dvěma výměnami libera musí proběhnout dokončená rozehra.', '19.3.2.1', 'libero');
  }
  return ok();
}

/**
 * Co se stane s odmítnutou žádostí: první neoprávněná žádost v utkání se jen
 * zapíše (15.11.2), další je zdržování (15.11.3). Zdržování: poprvé napomenutí,
 * pak trest – bod a podání soupeři (16.2.2, 16.2.3).
 */
export function outcomeOf(set, team, verdict) {
  if (verdict.ok) return 'zapsat';
  const t = set.teams[team];
  if (verdict.kind === 'improper' && !t.improperUsed) return 'neopravnena-zadost';
  return t.delayWarned ? 'trest-zdrzovani' : 'napomenuti-zdrzovani';
}

/**
 * Proč má odmítnutá žádost právě tento důsledek (podle toho, co už je v zápisu).
 * Volat PŘED provedením důsledku. Vrací text bez důvodu odmítnutí (ten je ve verdict.reason).
 */
export function explainOutcome(set, team, verdict, outcome) {
  if (outcome === 'zapsat') return '';
  const t = set.teams[team];
  if (outcome === 'neopravnena-zadost') {
    return 'Je to první neoprávněná žádost družstva v utkání: odmítne se a zapíše bez dalších důsledků (15.11.2).';
  }
  const why = {
    improper: 'Družstvo už v utkání jednu neoprávněnou žádost mělo (je v zápisu), takže další je zdržování (15.11.3).',
    sub: 'Žádost o nedovolené střídání není neoprávněná žádost (15.11), ale rovnou zdržování (16.1.3, 15.10.4).',
    libero: 'Nedovolená výměna libera zjištěná před další rozehrou se opraví a je to zdržování (19.3.2.9).',
  }[verdict.kind === 'improper' ? 'improper' : verdict.about] ?? '';
  return `${why} ${t.delayWarned
    ? 'Napomenutí za zdržování už družstvo má, proto trest za zdržování: bod a podání soupeři (16.2.3).'
    : 'Je to první zdržování družstva: napomenutí za zdržování bez ztráty bodu (16.2.2).'}`.trim();
}

/** Zdržování hry (bez žádosti): napomenutí, nebo trest za zdržování. */
export const delayOutcome = (set, team) => (set.teams[team].delayWarned ? 'trest-zdrzovani' : 'napomenuti-zdrzovani');

/**
 * Sankce za nevhodné chování člena družstva (21.3, 21.4.2): kind = 'mirne' |
 * 'hrube' | 'urazlive' | 'agrese'. Každý další přestupek téhož člena se trestá přísněji.
 */
export function misconductSanction(set, team, member, kind) {
  if (kind === 'mirne') return 'napomenuti';
  const base = { hrube: 1, urazlive: 2, agrese: 3 }[kind];
  const previous = set.sanctions
    .filter(s => s.team === team && s.member === member && SANCTIONS[s.kind]?.severity >= 1)
    .reduce((max, s) => Math.max(max, SANCTIONS[s.kind].severity), 0);
  const severity = Math.min(3, Math.max(base, previous + 1));
  return Object.keys(SANCTIONS).find(id => SANCTIONS[id].severity === severity);
}

/** Číslo pravidla pro sankci za nevhodné chování (21.1, 21.3). */
export function misconductRule(kind, sanction) {
  return {
    mirne: { napomenuti: '21.1' },
    hrube: { trest: '21.3.1', vylouceni: '21.3.2.3', diskvalifikace: '21.3.3.4' },
    urazlive: { vylouceni: '21.3.2.2', diskvalifikace: '21.3.3.3' },
    agrese: { diskvalifikace: '21.3.3.2' },
  }[kind]?.[sanction] ?? '21.3';
}

// ---------- Provedení ----------
export function applyTimeout(set, team) {
  set.teams[team].timeouts.push(scoreFor(set, team));
}

export function applySub(set, team, out, inn) {
  const t = set.teams[team];
  const slot = t.slots[slotOfPlayer(set, team, out)];
  if (!slot.subIn) {
    slot.sub = inn;
    slot.subIn = true;
    slot.subAt = scoreFor(set, team);
  } else {
    slot.subIn = false;
    slot.closed = true;
    slot.backAt = scoreFor(set, team);
  }
  t.subsUsed++;
  t.lastSubRally = set.rallies;
}

export function applyLiberoIn(set, team, libero, player) {
  const t = set.teams[team];
  t.libero = { number: libero, slot: slotOfPlayer(set, team, player) };
  t.lastLiberoRally = set.rallies;
}

export function applyLiberoOut(set, team) {
  const t = set.teams[team];
  t.libero = null;
  t.lastLiberoRally = set.rallies;
}

/**
 * Zapíše sankci nebo odmítnutou žádost; trest (i za zdržování) = bod a podání soupeři.
 * withPoint: false = bod se nepřipíše (v dlouhé verzi ho zapisuje uživatel sám).
 */
export function applySanction(set, team, member, kind, { withPoint = true } = {}) {
  set.sanctions.push({ team, member, kind, score: scoreFor(set, team) });
  const t = set.teams[team];
  if (kind === 'neopravnena-zadost') t.improperUsed = true;
  if (kind === 'napomenuti-zdrzovani') t.delayWarned = true;
  if ((kind === 'vylouceni' || kind === 'diskvalifikace') && member != null) t.excluded.push(member);
  if (withPoint && (kind === 'trest' || kind === 'trest-zdrzovani')) {
    const result = applyPoint(set, other(team));
    // soupeř se mohl posunout – libero v přední řadě odchází (19.3.2.1)
    if (result.liberoMustLeave) applyLiberoOut(set, other(team));
    return result;
  }
  return null;
}

// ---------- Náhodné družstvo a průběh (pro generování úloh) ----------
export const pick = (random, list) => list[Math.floor(random() * list.length)];

export function shuffle(random, list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Náhodná družstva: 6 v základní sestavě, 4–5 na lavičce, 1–2 libera (čísla 1–20). */
export function randomTeams(random) {
  const team = () => {
    const numbers = shuffle(random, Array.from({ length: 20 }, (_, i) => i + 1));
    const liberoCount = random() < 0.5 ? 1 : 2;
    const benchCount = random() < 0.5 ? 4 : 5;
    return {
      lineup: numbers.slice(0, 6),
      bench: numbers.slice(6, 6 + benchCount).sort((a, b) => a - b),
      liberos: numbers.slice(6 + benchCount, 6 + benchCount + liberoCount).sort((a, b) => a - b),
    };
  };
  return { A: team(), B: team(), firstServe: random() < 0.5 ? 'A' : 'B' };
}

/**
 * Povolená střídání družstva v tuto chvíli: [{ out, inn }].
 * ignoreBreak: nehlídat „jedna žádost za přerušení“ (pro tvorbu neoprávněné žádosti).
 */
export function legalSubs(set, team, { ignoreBreak = false } = {}) {
  const t = set.teams[team];
  if (t.subsUsed >= MAX_SUBS || (!ignoreBreak && t.lastSubRally === set.rallies)) return [];
  const result = [];
  t.slots.forEach((slot, i) => {
    if (t.libero?.slot === i) return;
    if (slot.subIn) result.push({ out: slot.sub, inn: slot.starter });
    else if (!slot.closed) for (const inn of freshBench(set, team)) result.push({ out: slot.starter, inn });
  });
  return result;
}

/** Hráči zadní řady, za které smí právě teď jít libero. */
export function liberoCandidates(set, team) {
  const t = set.teams[team];
  if (t.libero || t.lastLiberoRally === set.rallies) return [];
  return BACK_ROW.map(pos => playerAt(set, team, pos))
    // libero nepodává: hráče na pozici 1 podávajícího družstva nenahrazuje
    .filter(n => !(set.serving === team && positionOf(set, team, n) === 1));
}

/** Jedna rozehra s náhodným vítězem; libero, které by šlo do přední řady, odejde. */
export function playRally(set, random) {
  const result = applyPoint(set, random() < 0.5 ? 'A' : 'B');
  if (result.liberoMustLeave) applyLiberoOut(set, set.serving);
  return result;
}

/**
 * Náhodný průběh: rallies rozeher, mezi nimi občas oddechový čas, střídání,
 * výměna libera a sankce – vše podle pravidel. Libero, které by se dostalo do
 * přední řady, odejde. Výsledný stav slouží jako „rozepsaný zápis“ pro úlohy.
 */
export function simulate(set, random, rallies, { stopBeforeEnd = true } = {}) {
  for (let i = 0; i < rallies; i++) {
    for (const team of ['A', 'B']) {
      const t = set.teams[team];
      if (random() < 0.05 && judgeTimeout(set, team).ok) applyTimeout(set, team);
      const subs = legalSubs(set, team);
      if (subs.length && random() < 0.07) { const s = pick(random, subs); applySub(set, team, s.out, s.inn); }
      if (t.libero && random() < 0.15 && t.lastLiberoRally !== set.rallies) applyLiberoOut(set, team);
      const candidates = liberoCandidates(set, team);
      if (candidates.length && random() < 0.35) applyLiberoIn(set, team, pick(random, t.liberos), pick(random, candidates));
      if (random() < 0.01 && !set.sanctions.some(s => s.team === team && s.kind === 'napomenuti')) {
        applySanction(set, team, pick(random, t.lineup), 'napomenuti');
      }
    }
    playRally(set, random);
    if (stopBeforeEnd && Math.max(set.score.A, set.score.B) >= 22) break;
  }
  return set;
}
