// Úplná pravidla: každé pravidlo je sbalené v <details>. Odkaz na místo uvnitř
// (např. pravidla.html#p-12-4-3 nebo #podani z výsledků kvízu) musí pravidlo
// nejdřív rozbalit – do sbaleného obsahu prohlížeč neumí skočit.

/** Rozbalí všechna <details>, ve kterých prvek leží (podobně jako rozbalení uzlů stromu k vybranému uzlu). */
export function reveal(element) {
  for (let details = element.closest('details'); details; details = details.parentElement.closest('details')) {
    // Bez plynulého rozbalení: hned potom se skáče na cíl a během animace by
    // pravidlo ještě nemělo výslednou výšku. Platí i pro už otevřené pravidlo –
    // Chrome ho při skoku na kotvu otevře sám a animace by právě běžela.
    details.classList.add('rule--instant');
    details.open = true;
    requestAnimationFrame(() => requestAnimationFrame(() => details.classList.remove('rule--instant')));
  }
}

/** Rozbalí a ukáže místo z adresy (#kotva). */
export function showHashTarget() {
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id && document.getElementById(id);
  if (!target) return;
  reveal(target);
  target.scrollIntoView();
}

// Odkazy uvnitř stránky (obsah, „viz 12.4.3“): rozbalit cíl ještě před tím,
// než na něj prohlížeč skočí (výchozí akce kliknutí proběhne až po této funkci).
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  const target = link && document.getElementById(decodeURIComponent(link.hash.slice(1)));
  if (target) reveal(target);
});
window.addEventListener('hashchange', showHashTarget);

// Tlačítka Rozbalit vše / Sbalit vše (bez JavaScriptu nedávají smysl, proto jsou v HTML skrytá).
const tools = document.querySelector('.rules-tools');
if (tools) {
  tools.hidden = false;
  tools.addEventListener('click', event => {
    const mode = event.target.closest('[data-rules-toggle]')?.dataset.rulesToggle;
    if (!mode) return;
    for (const rule of document.querySelectorAll('details.rule')) rule.open = mode === 'open';
  });
}

// Při tisku rozbalit všechno, jinak by se vytiskly jen nadpisy pravidel.
window.addEventListener('beforeprint', () => {
  for (const rule of document.querySelectorAll('details.rule')) rule.open = true;
});

showHashTarget();
