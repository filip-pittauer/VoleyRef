// statistiky.html → Profil (ucet.html) se zachováním kotvy (např. #odznaky).
// Samostatný soubor, ne <script> ve stránce: Content Security Policy inline skripty blokuje.
location.replace('ucet.html' + (location.hash || '#statistiky'));
