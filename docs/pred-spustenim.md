# Před spuštěním pro veřejnost

- **E-mail projektu** `volleyref.app@gmail.com`: je v ochrana-udaju.html, v Google Cloud jako druhý Owner + e-mail podpory a kontakt vývojáře (Branding), v Supabase jako druhý Owner organizace (`filip-pittauer`, přejmenování volitelné). Osobní účty zůstávají jako záloha.
- **Google OAuth:** projekt `VoleyRef`, Client ID `748381175650-vdl2mkth4jjnrqmetc0pj17cqlqd97k4.apps.googleusercontent.com`, testovací režim (jen přidaní testeři) – „Publish app“ až před spuštěním.
  - Vyměnit Client secret (byl vidět na screenshotu; uživatel odložil): Clients → Add secret → vložit do Supabase (Auth → Providers → Google) → otestovat přihlášení → starý Disable + Delete → smazat `private/Client secret/`. Secret patří jen do Supabase.
  - Scopes nechat prázdné (Supabase bere jen základní e-mail a profil). Authorized JavaScript origins pro přihlášení přes Supabase nejsou potřeba.
- **Supabase Auth:**
  - Secure password change zapnuté, Secure email change zapnuté.
  - Minimum hesla 8 znaků – stejně jako formulář na webu (`minlength="8"` v ucet.html). Při změně upravit i ucet.html a hlášku `weak_password` v js/supabase.js.
  - Před spuštěním smazat Redirect URL `http://127.0.0.1:5500/…` (slouží jen pro lokální vývoj).
- **Vlastní SMTP** (Brevo): vestavěný v Supabase posílá jen pár e-mailů za hodinu a nejspíš jen členům týmu (ověřit registrací cizí adresou). **Čeká na vlastní doménu** („VoleyRef“ je jen pracovní název). Postup: doména → Brevo (účet na volleyref.app@gmail.com, DNS záznamy) → SMTP klíč → Supabase SMTP Settings → Rate Limits → české šablony e-mailů. Odesílatel musí být na vlastní doméně (gmail.com přes cizí SMTP neprojde). Alternativa: jen přihlášení přes Google.
- **Obsah:** 200 otázek a text pravidel zkontroluje zkušený rozhodčí (uživatel zařídí; PDF jsou připravená, viz docs/historie.md).
- Zvážit vypnutí/zapnutí registrací.

## Známá omezení dema (bezpečnost, odloženo)

- **Neomezená kola pro anonymy:** nepřihlášený hráč může hrát běžná kola bez omezení a skriptem by z výsledků postupně zjistil správné odpovědi (i k otázkám dnešní denní výzvy). Řešit omezením podle IP – až na vlastním backendu (Postgres v Supabase IP adresu klienta spolehlivě nezná).
- **Neviditelné znaky v přezdívkách:** přezdívka může obsahovat neviditelné znaky (např. mezeru nulové šířky), takže jde v žebříčku napodobit cizí přezdívku. Řešit kontrolou povolených znaků v `profily_prezdivka_check` (sql/01) a v `private.zalozit_profil`.

## Náklady a zneužití (zkontrolovat před spuštěním)

Stav 26. 10. 2026: organizace Supabase `VolleyRef` je na tarifu **Free** bez
platební karty → účet za překročení nemůže přijít. Při vyčerpání kvóty
Supabase služby omezí (web přestane fungovat do dalšího měsíce), nic
neúčtuje.

- **Při přechodu na Pro** (kvůli zálohám, výkonu…): nechat zapnutý
  **Spend Cap** (výchozí). S ním se nad rámec tarifu neúčtuje, služby se jen
  omezí. Vypnout ho jen vědomě.
- **Edge Functions** (bodování postavení a zápisu): Free = 500 000 volání za
  měsíc. Pojistky: volat jen přihlášení (kontrola JWT ve funkci), limit kol
  za den na hráče už dává strop 1 bodovaného kola, nebodovaná kola funkci
  nevolají. Sledovat využití v dashboardu (Usage).
- **AI „Zeptej se pravidel“** (Claude API, platí se za tokeny):
  - v Anthropic Console nastavit **měsíční limit útraty** (spend limit) a
    upozornění, vlastní API klíč jen pro tento web,
  - klíč jen v tajemstvích Edge Function, nikdy ve frontendu,
  - jen pro přihlášené, limit dotazů na hráče za den (tabulka + kontrola
    ve funkci), krátké `max_tokens`, omezená délka dotazu,
  - systémový prompt omezený na pravidla volejbalu, aby funkce nešla
    používat jako obecný chatbot zdarma.
- **Kvóty Free** hlídat: velikost DB 500 MB (anonymní kola, viz
  „Neomezená kola pro anonymy“ níže), přenos dat, počet uživatelů Auth.
