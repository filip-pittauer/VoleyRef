// „Nahlásit chybu“ u otázky (výsledek kvízu a zkoušky) nebo u gesta (kvíz gest).
// Hlášení uloží server (sql/06_hlaseni.sql, funkce nahlasit_chybu); číst je
// jde jen v dashboardu Supabase.
import { el } from './dom.js';

// Typy hlášení – id musí odpovídat kontrole v tabulce public.hlaseni.
const QUESTION_TYPES = {
  odpoved: 'Správná odpověď je podle mě špatně',
  zadani: 'Zadání je nejasné nebo nereálné',
  vysvetleni: 'Chyba ve vysvětlení',
  preklep: 'Překlep nebo gramatika',
  jine: 'Něco jiného',
};

const GESTURE_TYPES = {
  animace: 'Animace gesta vypadá špatně',
  odpoved: 'Gesto má špatný název nebo význam',
  vysvetleni: 'Chyba v popisu gesta',
  jine: 'Něco jiného',
};

const MAX_TEXT = 1000;
let formCount = 0;   // jedinečná id prvků, když je na stránce víc formulářů

/**
 * Odkaz „Nahlásit chybu“, který rozbalí formulář pod sebou.
 * target = { questionId } nebo { gestureId }
 */
export function createReportLink({ questionId = null, gestureId = null }) {
  const types = questionId ? QUESTION_TYPES : GESTURE_TYPES;
  const id = `report-${++formCount}`;
  const toggle = el('button', { class: 'link-button report__toggle', type: 'button',
    'aria-expanded': 'false', 'aria-controls': id }, questionId ? 'Nahlásit chybu v otázce' : 'Nahlásit chybu v gestu');

  const select = el('select', { id: `${id}-typ`, name: 'typ' },
    ...Object.entries(types).map(([value, label]) => el('option', { value }, label)));
  const text = el('textarea', { id: `${id}-text`, name: 'text', rows: 3, maxlength: MAX_TEXT,
    placeholder: 'Co je špatně? Případně odkaz na pravidlo.' });
  const send = el('button', { class: 'button button--secondary', type: 'submit' }, 'Odeslat');
  const status = el('p', { class: 'report__status small', role: 'status' });

  const form = el('form', { id, class: 'report__form stack', hidden: true },
    el('div', { class: 'field' }, el('label', { for: select.id }, 'Co je špatně'), select),
    el('div', { class: 'field' }, el('label', { for: text.id }, 'Popis (nepovinný)'), text),
    el('div', {}, send),
    status);

  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
    toggle.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) select.focus();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();   // formulář by jinak znovu načetl stránku
    send.disabled = true;
    status.textContent = 'Odesílám…';
    try {
      await sendReport({ questionId, gestureId, type: select.value, text: text.value });
      // po odeslání formulář nahradí poděkování (podruhé už hlásit nejde)
      wrapper.replaceChildren(el('p', { class: 'report__thanks small', role: 'status' },
        '✓ Díky za hlášení, podíváme se na to.'));
    } catch (error) {
      if (!isExpectedRefusal(error)) console.error(error);
      status.textContent = reportErrorMessage(error);
      send.disabled = false;
    }
  });

  const wrapper = el('div', { class: 'report' }, toggle, form);
  return wrapper;
}

async function sendReport({ questionId, gestureId, type, text }) {
  // Supabase se načte až teď: kvíz gest jinak knihovnu vůbec nepotřebuje
  // (a funguje i offline). import() = načtení modulu za běhu, jako lazy-load.
  const { supabase, NOT_CONFIGURED_MESSAGE } = await import('./supabase.js');
  if (!supabase) throw new Error(NOT_CONFIGURED_MESSAGE);
  const { error } = await supabase.rpc('nahlasit_chybu', {
    p_otazka_id: questionId,
    p_gesto: gestureId,
    p_typ: type,
    p_text: text.trim() || null,
  });
  if (error) throw error;
}

/** Server hlášení odmítl záměrně (už nahlášené, moc hlášení) – není to chyba webu. */
function isExpectedRefusal(error) {
  return /už jsi nahlásil|Moc hlášení/.test(error?.message ?? '');
}

/** Záměrné odmítnutí má od serveru českou hlášku – tu ukážeme, jinak obecnou. */
function reportErrorMessage(error) {
  if (isExpectedRefusal(error)) return error.message;
  return 'Hlášení se nepodařilo odeslat. Zkontroluj připojení a zkus to znovu.';
}
