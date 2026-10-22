# Před spuštěním pro veřejnost

- **E-mail projektu** `volleyref.app@gmail.com`: je v ochrana-udaju.html, v Google Cloud jako druhý Owner + e-mail podpory a kontakt vývojáře (Branding), v Supabase jako druhý Owner organizace (`filip-pittauer`, přejmenování volitelné). Osobní účty zůstávají jako záloha.
- **Google OAuth:** projekt `VoleyRef`, Client ID `748381175650-vdl2mkth4jjnrqmetc0pj17cqlqd97k4.apps.googleusercontent.com`, testovací režim (jen přidaní testeři) – „Publish app“ až před spuštěním.
  - Vyměnit Client secret (byl vidět na screenshotu; uživatel odložil): Clients → Add secret → vložit do Supabase (Auth → Providers → Google) → otestovat přihlášení → starý Disable + Delete → smazat `private/Client secret/`. Secret patří jen do Supabase.
- **Vlastní SMTP** (Brevo): vestavěný v Supabase posílá jen pár e-mailů za hodinu a nejspíš jen členům týmu (ověřit registrací cizí adresou). **Čeká na vlastní doménu** („VoleyRef“ je jen pracovní název). Postup: doména → Brevo (účet na volleyref.app@gmail.com, DNS záznamy) → SMTP klíč → Supabase SMTP Settings → Rate Limits → české šablony e-mailů. Odesílatel musí být na vlastní doméně (gmail.com přes cizí SMTP neprojde). Alternativa: jen přihlášení přes Google.
- **Obsah:** 200 otázek a text pravidel zkontroluje zkušený rozhodčí (uživatel zařídí; PDF jsou připravená, viz docs/historie.md).
- Zvážit vypnutí/zapnutí registrací.
