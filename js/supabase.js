// Připojení k Supabase a společné funkce pro přihlášení.
//
// Knihovna je přímo v repu (js/vendor/), ne z cizího CDN: napadené CDN by nám
// nemohlo podstrčit jiný kód a prohlížeč hráče se nikam dalšího nepřipojuje (GDPR).
// Soubor = @supabase/supabase-js@2.117.2, dist/umd/supabase.js z npm, beze změny
// (SHA-256 59d39487c3589843b410322d8a3d562ce022aba1e5ccb16898ef3fb2a0da2ecd;
// licence MIT v js/vendor/supabase-js-LICENSE.txt; aktualizace: docs/historie.md).
//
// Sestavená verze v balíčku je "UMD" – klasický skript, který vytvoří globální
// proměnnou `supabase`, ne ES modul. Proto se nenačítá přes import, ale vloží se
// jako <script src> a počká se na něj (top-level await: modul, který tenhle
// importuje, pokračuje až po načtení – podobně jako await při startu v C#).
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

await new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = new URL('./vendor/supabase-js-2.117.2.umd.js', import.meta.url).href;
  script.onload = resolve;
  script.onerror = () => reject(new Error('Nepodařilo se načíst knihovnu Supabase.'));
  document.head.append(script);
});
const { createClient } = globalThis.supabase;

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

// Jeden klient pro celou stránku (něco jako singleton služby v C#).
// Přihlášení si pamatuje v localStorage, takže platí i po zavření prohlížeče.
export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export const NOT_CONFIGURED_MESSAGE =
  'Web ještě není propojený s databází (chybí nastavení v js/config.js).';

/** Absolutní adresa stránky webu – pro přesměrování z e-mailu nebo Googlu. */
export function pageUrl(file) {
  return new URL(file, location.href).href;
}

/** Přihlášený uživatel, nebo null. */
export async function getUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** Profil přihlášeného hráče ({ id, prezdivka }), nebo null. */
export async function getProfile() {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profily')
    .select('id, prezdivka')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Chybové kódy Supabase Auth → česká hláška pro uživatele.
const AUTH_ERRORS = {
  invalid_credentials: 'Špatný e-mail nebo heslo.',
  email_not_confirmed: 'E-mail ještě není potvrzený. Klikni na odkaz v e-mailu, který jsme ti poslali.',
  user_already_exists: 'Účet s tímto e-mailem už existuje.',
  email_exists: 'Účet s tímto e-mailem už existuje.',
  weak_password: 'Heslo je příliš slabé. Použij aspoň 8 znaků.',
  same_password: 'Nové heslo musí být jiné než současné.',
  over_email_send_rate_limit: 'Odesláno příliš mnoho e-mailů. Zkus to prosím za chvíli.',
  over_request_rate_limit: 'Příliš mnoho pokusů. Zkus to prosím za chvíli.',
  validation_failed: 'Zkontroluj prosím vyplněné údaje.',
  provider_disabled: 'Tento způsob přihlášení zatím není zapnutý.',
  signup_disabled: 'Registrace jsou momentálně vypnuté.',
};

/** Převede chybu ze Supabase na srozumitelnou českou větu. */
export function errorMessage(error) {
  console.error(error);
  if (AUTH_ERRORS[error?.code]) return AUTH_ERRORS[error.code];
  // výjimky z našich SQL funkcí (raise exception '…') mají českou hlášku pro hráče
  if (error?.code === 'P0001' && error.message) return error.message;
  if (error?.code === '23505') return 'Tato přezdívka už je obsazená.';   // unique_violation
  if (error?.code === '23514') return 'Přezdívka musí mít 3–20 znaků.';   // check_violation
  if (/provider is not enabled/i.test(error?.message ?? '')) return AUTH_ERRORS.provider_disabled;
  return 'Něco se pokazilo. Zkus to prosím znovu.';
}
