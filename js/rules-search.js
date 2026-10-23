// Hledání v pravidlech (pravidla.html) – celé v prohlížeči, bez serveru.
//
// Index se postaví při prvním hledání z textu stránky: každý odstavec, bod
// pravidla, položka seznamu nebo definice je jeden „záznam“ s odkazem na
// nejbližší kotvu (#p-12-4-3, #pravidlo-12, #def-…). Slova se porovnávají bez
// diakritiky a podle „kmene“ (blokování → blok), takže najdou i jiné tvary.
// Slovníček SYNONYMS převádí hovorová slova na výrazy z pravidel.
import { el } from './dom.js';
import { reveal } from './rules-page.js';

const MAX_RESULTS = 12;
const SNIPPET_LENGTH = 220;

// Hovorové výrazy → výrazy, které používají pravidla (bez diakritiky, malými písmeny).
// Víceslovný klíč se hledá v celém dotazu. Přidané výrazy mají menší váhu.
const SYNONYMS = {
  'smec': 'utocny uder utok',
  'smecovat': 'utocny uder utok',
  'smecar': 'utocny uder utocnik',
  'prvni zona': 'predni zona',
  'prvni zone': 'predni zona',
  'prvni zony': 'predni zona',
  'druha zona': 'zadni zona',
  'druhe zony': 'zadni zona',
  'vyskok': 'odraz skok',
  'vyskoku': 'odraz skok',
  'timeout': 'oddechovy cas',
  'time out': 'oddechovy cas',
  'oddech': 'oddechovy cas',
  'zluta karta': 'napomenuti',
  'zlutou kartu': 'napomenuti',
  'cervena karta': 'trest',
  'cervenou kartu': 'trest',
  'karta': 'sankce napomenuti trest',
  'kartu': 'sankce napomenuti trest',
  'aut': 'mimo hriste dopad',
  'v autu': 'mimo hriste dopad',
  'preslap': 'stredni cara koncova cara dotyk',
  'preslapne': 'stredni cara koncova cara dotyk',
  'nahravac': 'nahravka',
  'podavac': 'podavajici podani',
  'dvojak': 'dvojity dotek',
  'chytil': 'chyceny hozeny',
  'chyceni': 'chyceny hozeny',
  'obrana': 'prijem',
  'stridacka': 'stridani',
  'liberko': 'libero',
  'zranil': 'zraneni',
  'nadavky': 'urazlive chovani',
  'nadava': 'urazlive chovani',
  'hadka': 'nesportovni chovani',
  'antena': 'antenka',
  'anteny': 'antenka',
  'sit': 'sit dotyk',
  'pod siti': 'spodni prostor',
  'tecuje': 'dotek',
  'tec': 'dotek',
  'zapisak': 'zapis o utkani',
};

// Slova bez významu pro hledání (předložky, spojky, zájmena…).
const STOPWORDS = new Set(('a i o u v k s z na do od po pod nad za pri pred se si je jsou byt bylo by ze ktery ktera ktere '
  + 'kdyz kdy jak co to ten ta tom tu toho jeho jeji jejich nebo ale take tak uz jen jiz pak aby muze musi smi '
  + 'mi me mne ja ty my vy oni ona ono jsem jsi jste jsme udelam udela delam dela hrac hraci kdo proc').split(' '));

// Koncovky, které se od slova odtrhnou, aby se různé tvary sešly na stejném kmeni.
const SUFFIXES = ['ovavajici', 'avajici', 'ujici', 'ovani', 'ovat', 'ujeme', 'ovany', 'ovana', 'ovane', 'ani', 'eni', 'ati',
  'eti', 'ich', 'ych', 'ymi', 'ami', 'emi', 'ach', 'ech', 'ove', 'ovy', 'ova', 'ou', 'em', 'am', 'um', 'ar', 'ka', 'ky', 'ku',
  'ce', 'a', 'e', 'i', 'o', 'u', 'y'].sort((a, b) => b.length - a.length);

/** Malá písmena, bez diakritiky (č → c, ř → r). */
function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Kmen slova: odtrhne nejdelší známou koncovku, kmen má aspoň 3 znaky. */
function stem(word) {
  for (const suffix of SUFFIXES) {
    if (word.length - suffix.length >= 3 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}

/** Významová slova textu jako kmeny. */
function stems(text) {
  return normalize(text).split(/[^a-z0-9]+/).filter(w => w && !STOPWORDS.has(w) && (w.length > 1 || /\d/.test(w))).map(stem);
}

const stemsMatch = (a, b) => a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b));

// ---------- Index ----------
let index = null;

/** Kotva pro prvek: vlastní id, předchozí sourozenec s id (bod pravidla), nebo nadřazený prvek s id. */
function anchorFor(node) {
  if (node.id) return node;
  if (node.tagName === 'DD' && node.previousElementSibling?.id) return node.previousElementSibling;
  for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
    if (sib.id && /^(p|def|gesto)-/.test(sib.id)) return sib;
  }
  return node.parentElement.closest('[id]:not(main)');
}

/** Popisek místa: „Pravidlo 12 Podání · 12.4.3“, „Definice: Zóny“… */
function placeOf(node, anchor) {
  const rule = node.closest('details.rule');
  const title = rule?.querySelector('summary h3')?.textContent.trim().replace(/^(\d+)\s*/, 'Pravidlo $1 · ');
  const num = anchor?.querySelector?.(':scope > .sub__num')?.textContent.trim();
  if (node.closest('#definice')) return 'Definice pojmů';
  if (node.closest('#gesture-atlas')) return 'Signalizace rozhodčích (pravidlo 30)';
  return [title ?? node.closest('section')?.querySelector('h2')?.textContent.trim(), num].filter(Boolean).join(' · ');
}

function buildIndex() {
  const nodes = document.querySelectorAll(
    'main .rules-chapter :is(p, li, dd, dt, h4, figcaption), main details.rule summary h3, #gesture-atlas :is(h3, p)');
  const entries = [];
  for (const node of nodes) {
    // seznam uvnitř odstavce/položky indexujeme jen jednou (nejvnitřnější prvky)
    if (node.querySelector('p, li, dd')) continue;
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (text.length < 3) continue;
    const anchor = anchorFor(node);
    if (!anchor) continue;
    const heading = /^H[34]$|^DT$/.test(node.tagName);
    const ruleTitle = node.closest('details.rule')?.querySelector('summary h3')?.textContent ?? '';
    entries.push({ node, text, anchor, heading, stems: stems(text), ruleStems: stems(ruleTitle), place: placeOf(node, anchor) });
  }
  // df = v kolika záznamech kmen je (vzácná slova mají větší váhu, jako idf ve vyhledávačích)
  const df = new Map();
  for (const entry of entries) for (const s of new Set(entry.stems)) df.set(s, (df.get(s) ?? 0) + 1);
  return { entries, df, total: entries.length };
}

// ---------- Hledání ----------
/** Dotaz → hledané kmeny s váhou (slova z dotazu 1, přidaná synonyma 0,7). */
function parseQuery(query) {
  const terms = new Map(stems(query).map(s => [s, 1]));
  const normalized = ` ${normalize(query).replace(/[^a-z0-9]+/g, ' ')} `;
  for (const [phrase, expansion] of Object.entries(SYNONYMS)) {
    if (normalized.includes(` ${phrase} `)) {
      for (const s of stems(expansion)) if (!terms.has(s)) terms.set(s, 0.7);
    }
  }
  return terms;
}

function search(query) {
  index ??= buildIndex();
  const terms = parseQuery(query);
  if (terms.size === 0) return { terms, results: [] };
  const phrase = normalize(query).trim();
  const idf = term => {
    let df = 0;
    for (const [s, n] of index.df) if (stemsMatch(term, s)) df += n;
    return Math.log(1 + index.total / (1 + df));
  };
  const weights = [...terms].map(([term, weight]) => [term, weight * idf(term)]);

  const scored = [];
  for (const entry of index.entries) {
    let score = 0, matched = 0;
    for (const [term, weight] of weights) {
      if (entry.stems.some(s => stemsMatch(term, s))) { score += weight; matched++; }
    }
    if (!matched) continue;
    if (phrase.length > 3 && normalize(entry.text).includes(phrase)) score *= 1.6;   // celá fráze doslova
    if (entry.heading) score *= 1.3;                                                  // nadpis bodu / pojem
    // název pravidla odpovídá dotazu (např. smeč → pravidlo 13 Útočný úder): téma sedí
    if (weights.some(([term]) => entry.ruleStems.some(s => stemsMatch(term, s)))) score *= 1.35;
    score *= 0.6 + 0.4 * (matched / weights.length);                                  // víc slov dotazu = lépe
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // z jednoho místa (kotvy) jen nejlepší záznam
  const seen = new Set();
  const results = [];
  for (const item of scored) {
    if (seen.has(item.entry.anchor)) continue;
    seen.add(item.entry.anchor);
    results.push(item);
    if (results.length === MAX_RESULTS) break;
  }
  return { terms, results };
}

// ---------- Výsledky ----------
/** Úryvek s <mark> u nalezených slov (text vždy jako textContent – žádné HTML z dat). */
function snippet(text, terms) {
  const words = text.split(/(\s+)/);
  const isHit = word => {
    const s = stems(word)[0];
    return s && [...terms.keys()].some(term => stemsMatch(term, s));
  };
  // začít kousek před prvním nalezeným slovem
  let start = 0, length = 0;
  const first = words.findIndex(isHit);
  if (first > 12) start = first - 8;
  const parts = start > 0 ? ['… '] : [];
  for (let i = start; i < words.length; i++) {
    if (length > SNIPPET_LENGTH) { parts.push(' …'); break; }
    parts.push(isHit(words[i]) ? el('mark', {}, words[i]) : words[i]);
    length += words[i].length;
  }
  return parts;
}

function goTo(anchor) {
  reveal(anchor);
  history.replaceState(null, '', `#${anchor.id}`);
  anchor.scrollIntoView({ block: 'center' });
  anchor.classList.remove('search-target');
  void anchor.offsetWidth;            // restart animace zvýraznění
  anchor.classList.add('search-target');
}

// ---------- Napojení na stránku ----------
const form = document.getElementById('rules-search');
if (form) {
  const input = document.getElementById('rules-search-input');
  const status = document.getElementById('rules-search-status');
  const list = document.getElementById('rules-search-results');
  let current = [];

  form.hidden = false;

  // Lupa vedle nadpisu (jen na mobilu, viz CSS): otevře/zavře blok hledání.
  const toggle = document.getElementById('rules-search-toggle');
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    const open = form.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
  });

  const render = () => {
    const query = input.value.trim();
    if (query.length < 2) {
      list.replaceChildren();
      status.textContent = '';
      current = [];
      return;
    }
    const { terms, results } = search(query);
    current = results;
    status.textContent = results.length === 0
      ? 'Nic nenalezeno. Zkus jiné slovo, třeba „blok“, „podání“ nebo „libero“.'
      : `Nejlepší shody: ${results.length}`;
    list.replaceChildren(...results.map(({ entry }) =>
      el('li', {},
        el('a', { href: `#${entry.anchor.id}`, class: 'search-result' },
          el('span', { class: 'search-result__place' }, entry.place || 'Pravidla'),
          el('span', { class: 'search-result__text' }, ...snippet(entry.text, terms))))));
  };

  // hledá se průběžně při psaní (s malým zpožděním, ať se nepočítá při každém písmenu)
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });

  // Enter = první výsledek; Escape = smazat
  form.addEventListener('submit', event => {
    event.preventDefault();
    render();
    if (current[0]) goTo(current[0].entry.anchor);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { input.value = ''; render(); }
  });

  list.addEventListener('click', event => {
    const link = event.target.closest('.search-result');
    if (!link) return;
    event.preventDefault();
    const anchor = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (anchor) goTo(anchor);
  });
}
