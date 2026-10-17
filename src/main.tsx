import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Détecter l'environnement Electron Desktop
const isElectron = typeof window !== 'undefined' && (
  navigator.userAgent.includes('Electron') ||
  Boolean((window as any).electron) ||
  Boolean((window as any).electronAPI)
);

// N'enregistrer le Service Worker PWA que dans le navigateur Web standard
if (!isElectron) {
  registerSW({ immediate: true });
} else {
  // Dans Electron, désinscrire tout Service Worker résiduel pour éviter les conflits IO/Quota Chromium
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const registration of registrations) {
        registration.unregister().catch(() => {});
      }
    }).catch(() => {});
  }
}

// Capture l'événement d'installation PWA dès le démarrage de l'application
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).deferredPWAInstallPrompt = e;
  (window as any).deferredInstallPrompt = e;
  window.dispatchEvent(new Event('pwa-install-ready'));
  window.dispatchEvent(new CustomEvent('pwa-installable'));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
