// PWA: registrace service workeru a tlačítko „Nainstalovat aplikaci“.

// Service worker funguje jen přes HTTPS (nebo na localhostu).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(error => {
    console.warn('Service worker se nepodařilo zaregistrovat:', error);
  });
}

// Chrome/Edge na Androidu a PC: prohlížeč pošle událost, když jde web nainstalovat.
// Zachytíme ji a nabídneme vlastní tlačítko (je jen na úvodní stránce).
// Safari na iPhonu tuto událost nemá – tam se instaluje přes Sdílet → Přidat na plochu.
const installButton = document.getElementById('install-button');
let installPrompt = null;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  if (installButton) installButton.hidden = false;
});

installButton?.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});

window.addEventListener('appinstalled', () => {
  if (installButton) installButton.hidden = true;
});
