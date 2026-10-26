// Stránka Profil (ucet.html): přihlášení, registrace, obnova hesla,
// po přihlášení statistiky (stats.js) a nastavení účtu.
import { el, showOnly } from './dom.js';
import { BADGE_GROUPS } from './badges.js';
import { loadStats } from './stats.js';
import { loadDuels } from './duels-profile.js';
import {
  supabase, isConfigured, NOT_CONFIGURED_MESSAGE,
  getProfile, pageUrl, errorMessage,
} from './supabase.js';

const ACCOUNT_URL = pageUrl('ucet.html');

// true = hráč přišel z odkazu „zapomenuté heslo“ a má nastavit nové heslo;
// dokud ho nenastaví, nepřepínáme na stránku účtu.
let recoveryMode = false;

// ---------- Prvky stránky ----------
const $ = id => document.getElementById(id);
const messageBox = $('message');
const loading = $('loading');
const sections = ['login-section', 'register-section', 'reset-section',
  'new-password-section', 'account-section'].map($);

// ---------- Pomocné funkce ----------
function showSection(id) {
  loading.hidden = true;
  showOnly($(id), sections);
}

function showMessage(text, type = 'error') {
  messageBox.textContent = text;
  messageBox.className = `alert alert--${type}`;
  messageBox.hidden = false;
}

function hideMessage() {
  messageBox.hidden = true;
}

/**
 * Obslouží odeslání formuláře: zabrání znovunačtení stránky,
 * zablokuje tlačítko a zachytí chybu. handler dostane data formuláře.
 */
function onSubmit(form, handler) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    hideMessage();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await handler(Object.fromEntries(new FormData(form)), form);
    } catch (error) {
      showMessage(errorMessage(error));
    } finally {
      button.disabled = false;
    }
  });
}

// ---------- Odznaky v žebříčku ----------
const MAX_SHOWN_BADGES = 3;
const badgesCard = $('odznaky-zebricek');
const badgeOptions = $('badge-options');

/** Když jsou vybrané 3 odznaky, ostatní zaškrtávátka zablokujeme. */
function updateBadgeLimit() {
  const boxes = [...badgeOptions.querySelectorAll('input')];
  const full = boxes.filter(box => box.checked).length >= MAX_SHOWN_BADGES;
  for (const box of boxes) box.disabled = full && !box.checked;
}

/** Výběr odznaků, které se ukazují u přezdívky v žebříčku (jen získané). */
async function renderBadgePicker() {
  const { data, error } = await supabase.rpc('moje_odznaky');
  if (error) {
    console.error(error);
    badgesCard.hidden = true;
    return;
  }
  const earned = new Set(data.odznaky.filter(o => o.ziskano).map(o => o.id));
  const selected = new Set(data.vybrane);

  // získané odznaky ve stejném pořadí jako ve Statistikách
  const options = BADGE_GROUPS.flatMap(group => Object.entries(group.badges))
    .filter(([id]) => earned.has(id))
    .map(([id, badge]) => el('label', { class: 'badge-option' },
      el('input', { type: 'checkbox', name: 'odznak', value: id, checked: selected.has(id) }),
      el('span', { class: 'badge-option__icon', 'aria-hidden': 'true' }, badge.icon),
      el('span', {}, badge.name)));

  badgeOptions.replaceChildren(...options);
  $('badges-form').hidden = options.length === 0;
  $('badges-empty').hidden = options.length > 0;
  badgesCard.hidden = false;
  updateBadgeLimit();

  // odkaz ucet.html#odznaky-zebricek (ze Statistik) – karta byla skrytá
  if (location.hash === '#odznaky-zebricek') badgesCard.scrollIntoView();
}

badgeOptions.addEventListener('change', updateBadgeLimit);

onSubmit($('badges-form'), async () => {
  const chosen = [...badgeOptions.querySelectorAll('input:checked')].map(box => box.value);
  const { error } = await supabase.rpc('nastav_odznaky', { p_odznaky: chosen });
  if (error) throw error;
  showMessage(chosen.length ? 'Odznaky v žebříčku jsou uložené.' : 'Odznaky v žebříčku jsou skryté.', 'success');
});

// ---------- Vykreslení podle stavu přihlášení ----------
async function renderLoggedIn(user) {
  const profile = await getProfile();
  $('account-nickname').textContent = profile?.prezdivka ?? '';
  $('account-email').textContent = user.email ?? '';
  $('nickname').value = profile?.prezdivka ?? '';
  showSection('account-section');
  // odkaz ucet.html#statistiky / #nastaveni – sekce byla skrytá, prohlížeč na ni nedoskočil
  if (['#statistiky', '#nastaveni'].includes(location.hash)) $(location.hash.slice(1)).scrollIntoView();
  loadStats();
  loadDuels();
  renderBadgePicker().catch(error => console.error(error));
}

async function render(session) {
  try {
    if (session?.user) {
      await renderLoggedIn(session.user);
    } else {
      showSection('login-section');
    }
  } catch (error) {
    showMessage(errorMessage(error));
  }
}

// ---------- Přihlášení / registrace ----------
onSubmit($('login-form'), async ({ email, password }) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  // Zobrazení účtu zařídí onAuthStateChange (událost SIGNED_IN).
});

onSubmit($('register-form'), async ({ nickname, email, password }, form) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // přezdívku si přečte databázový trigger a založí profil
      data: { prezdivka: nickname.trim() },
      // kam vede odkaz v potvrzovacím e-mailu
      emailRedirectTo: ACCOUNT_URL,
    },
  });
  if (error) throw error;

  form.reset();

  // E-mail už má účet: Supabase z bezpečnostních důvodů nehlásí chybu,
  // ale vrátí uživatele bez přihlašovacích „identit“ a e-mail nepošle.
  if (data.user && data.user.identities?.length === 0) {
    showSection('login-section');
    $('login-email').value = email;
    showMessage('Tento e-mail už má účet. Přihlas se heslem nebo přes Google. '
      + 'Pokud jsi účet založil přes Google a chceš i heslo, použij „Zapomenuté heslo?“.', 'error');
    return;
  }

  if (!data.session) {
    // Supabase vyžaduje potvrzení e-mailu – hráč zatím není přihlášený.
    showSection('login-section');
    showMessage('Účet je vytvořený. Poslali jsme ti e-mail, klikni na odkaz v něm a pak se přihlas.', 'success');
  }
});

for (const button of document.querySelectorAll('[data-google]')) {
  button.addEventListener('click', async () => {
    hideMessage();
    // Přesměruje na Google a po přihlášení zpět na tuto stránku.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: ACCOUNT_URL },
    });
    if (error) showMessage(errorMessage(error));
  });
}

// ---------- Zapomenuté a nové heslo ----------
onSubmit($('reset-form'), async ({ email }, form) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: ACCOUNT_URL });
  if (error) throw error;
  form.reset();
  showMessage('Pokud účet s tímto e-mailem existuje, poslali jsme na něj odkaz pro nastavení nového hesla.', 'success');
});

onSubmit($('new-password-form'), async ({ password }, form) => {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  recoveryMode = false;
  form.reset();
  await renderLoggedIn(data.user);
  showMessage('Heslo je změněné.', 'success');
});

// ---------- Profil ----------
onSubmit($('nickname-form'), async ({ nickname }) => {
  const user = (await supabase.auth.getUser()).data.user;
  const { error } = await supabase
    .from('profily')
    .update({ prezdivka: nickname.trim() })
    .eq('id', user.id);
  if (error) throw error;
  await renderLoggedIn(user);
  showMessage('Přezdívka je uložená.', 'success');
});

$('logout-button').addEventListener('click', async () => {
  hideMessage();
  const { error } = await supabase.auth.signOut();
  if (error) showMessage(errorMessage(error));
});

$('delete-button').addEventListener('click', async () => {
  // confirm() je jednoduchý potvrzovací dialog prohlížeče
  if (!confirm('Opravdu smazat účet i všechny výsledky? Tuto akci nejde vrátit.')) return;
  hideMessage();
  const { error } = await supabase.rpc('smazat_ucet');
  if (error) {
    showMessage(errorMessage(error));
    return;
  }
  await supabase.auth.signOut();
  showMessage('Účet byl smazán.', 'success');
});

// Přepínání mezi přihlášením / registrací / obnovou hesla
for (const button of document.querySelectorAll('[data-show]')) {
  button.addEventListener('click', () => {
    hideMessage();
    showSection(button.dataset.show);
    $(button.dataset.show).querySelector('input')?.focus();
  });
}

// ---------- Start ----------
if (!isConfigured) {
  loading.hidden = true;
  showMessage(NOT_CONFIGURED_MESSAGE);
} else {
  // Reaguje na přihlášení, odhlášení i návrat z e-mailu nebo Googlu.
  // Callback nesmí přímo čekat na další volání Supabase (mohlo by se
  // zaseknout), proto práci odložíme přes setTimeout.
  supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryMode = true;
        showSection('new-password-section');
      } else if (event === 'SIGNED_OUT') {
        recoveryMode = false;
        render(null);
      } else if (!recoveryMode && event !== 'TOKEN_REFRESHED') {
        render(session);
      }
    }, 0);
  });
}
