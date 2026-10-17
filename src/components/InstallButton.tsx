import { useEffect, useState } from 'react';
import { Download, Loader } from 'lucide-react';

type InstallState = 'idle' | 'installing' | 'installed';

export function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installState, setInstallState] = useState<InstallState>('idle');

  useEffect(() => {
    const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
    const isIosStandalone = (window.navigator as any).standalone === true;
    const isElectron = window.navigator.userAgent.toLowerCase().includes('electron');

    // Déjà installée ou sur Electron (app bureau) — on n'affiche pas le bouton
    if (isStandalone || isIosStandalone || isElectron) {
      setInstallState('installed');
      return;
    }

    // iOS — afficher bouton avec guide manuel
    if (isIos()) {
      setDeferredPrompt('ios');
      return;
    }

    const checkPrompt = () => {
      if ((window as any).deferredPWAInstallPrompt) {
        setDeferredPrompt((window as any).deferredPWAInstallPrompt);
      }
    };

    checkPrompt();
    window.addEventListener('pwa-install-ready', checkPrompt);

    // Déclenché même si l'utilisateur installe via le bouton natif du navigateur
    const handleAppInstalled = () => {
      setInstallState('installed');
      setDeferredPrompt(null);
      (window as any).deferredPWAInstallPrompt = null;
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // Écouter aussi le passage en mode standalone (installation réussie)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = (e: MediaQueryListEvent) => {
      if (e.matches) setInstallState('installed');
    };
    mediaQuery.addEventListener('change', handleDisplayChange);

    return () => {
      window.removeEventListener('pwa-install-ready', checkPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener('change', handleDisplayChange);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt === 'ios') {
      alert("🍏 Pour installer sur iPhone/iPad :\n\n1. Appuyez sur l'icône 'Partager' (le carré avec la flèche ↑) en bas de Safari.\n2. Faites défiler et sélectionnez 'Sur l'écran d'accueil'.\n3. Confirmez en haut à droite.");
      return;
    }

    if (!deferredPrompt) {
      alert("Pour installer manuellement :\n1. Cliquez sur l'icône d'installation (📲) dans votre barre d'adresse.\n2. Ou ouvrez le menu (•••) → 'Installer l'application'.");
      return;
    }

    setInstallState('installing');
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      (window as any).deferredPWAInstallPrompt = null;
      if (outcome === 'accepted') {
        setInstallState('installed');
      } else {
        setInstallState('idle');
      }
    } catch {
      setInstallState('idle');
    }
  };

  if (installState === 'installed') return null;

  return (
    <button
      onClick={handleInstallClick}
      disabled={installState === 'installing'}
      type="button"
      className="btn btn-outline"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        width: '100%',
        marginTop: '16px',
        borderColor: 'var(--color-primary)',
        color: 'var(--color-primary)',
        opacity: installState === 'installing' ? 0.7 : 1,
        cursor: installState === 'installing' ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.2s ease',
      }}
    >
      {installState === 'installing' ? (
        <>
          <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
          Installation en cours…
        </>
      ) : (
        <>
          <Download size={18} />
          Installer l'Application (PWA)
        </>
      )}
    </button>
  );
}
