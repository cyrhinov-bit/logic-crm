import { useState, useEffect } from 'react';
import { Download, CheckCircle2, Share, PlusSquare, X, Smartphone, ArrowRight, Laptop } from 'lucide-react';

interface PwaInstallPromptProps {
  variant?: 'button' | 'banner' | 'nav-item' | 'icon-button';
  className?: string;
  onInstalled?: () => void;
}

export function PwaInstallPrompt({ variant = 'button', className = '' }: PwaInstallPromptProps) {
  const getPrompt = () => (window as any).deferredPWAInstallPrompt || (window as any).deferredInstallPrompt || null;
  const [deferredPrompt, setDeferredPrompt] = useState<any>(getPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showDesktopGuide, setShowDesktopGuide] = useState(false);

  useEffect(() => {
    // 1. Vérifier si l'application est déjà lancée en mode PWA installée (standalone)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true ||
      window.location.search.includes('mode=standalone');

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    const syncPrompt = () => {
      const p = getPrompt();
      if (p) setDeferredPrompt(p);
    };

    syncPrompt();

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      (window as any).deferredPWAInstallPrompt = e;
      (window as any).deferredInstallPrompt = e;
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      (window as any).deferredPWAInstallPrompt = null;
      (window as any).deferredInstallPrompt = null;
      setShowIosGuide(false);
      setShowDesktopGuide(false);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('pwa-install-ready', syncPrompt);
    window.addEventListener('pwa-installable', syncPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('pwa-install-ready', syncPrompt);
      window.removeEventListener('pwa-installable', syncPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const isIos = () => {
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  };

  const handleInstallClick = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // Haptic feedback si supporté
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(30); } catch {}
    }

    // A. Détection iOS / Safari (Apple n'implémente pas beforeinstallprompt)
    if (isIos()) {
      setShowIosGuide(true);
      return;
    }

    // B. Android / Chrome / Edge : Prompt natif direct
    const promptEvent = deferredPrompt || getPrompt();
    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          (window as any).deferredPWAInstallPrompt = null;
          (window as any).deferredInstallPrompt = null;
          setDeferredPrompt(null);
        }
      } catch (err) {
        console.error('Erreur lors du prompt PWA:', err);
        setShowDesktopGuide(true);
      }
    } else {
      // C. Si le prompt n'a pas encore été émis ou sur PC / Safari Mac
      setShowDesktopGuide(true);
    }
  };

  if (isInstalled) {
    if (variant === 'nav-item') {
      return (
        <div className="native-bottom-nav-item active">
          <CheckCircle2 size={20} color="var(--catalog-primary, #0D9488)" />
          <span>Installé</span>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {/* 1. VARIANTES DE BOUTONS */}
      {variant === 'nav-item' ? (
        <button
          onClick={handleInstallClick}
          className="native-bottom-nav-item install-cta"
          type="button"
          title="Installer l'application sur votre téléphone"
        >
          <div className="nav-icon-badge-wrap">
            <Download size={20} />
            <span className="install-pulse-dot" />
          </div>
          <span>Installer</span>
        </button>
      ) : variant === 'icon-button' ? (
        <button
          onClick={handleInstallClick}
          className={`native-topbar-install-btn ${className}`}
          type="button"
          title="Installer l'application"
        >
          <Download size={16} />
          <span className="install-label-desktop">Installer</span>
        </button>
      ) : (
        <button
          onClick={handleInstallClick}
          className={className}
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'var(--catalog-primary, #0D9488)',
            color: 'white',
            border: 'none',
            padding: '7px 14px',
            borderRadius: '20px',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(13, 148, 136, 0.25)',
            whiteSpace: 'nowrap'
          }}
        >
          <Download size={14} />
          <span>Installer l'app</span>
        </button>
      )}

      {/* 2. GUIDE IOS BOTTOM SHEET (SPÉCIFIQUE IPHONE / IPAD) */}
      {showIosGuide && (
        <div
          className="native-sheet-overlay"
          onClick={() => setShowIosGuide(false)}
          style={{ zIndex: 10000 }}
        >
          <div
            className="native-sheet-modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '420px', padding: '20px', textAlign: 'center' }}
          >
            <div className="native-sheet-handle" />
            <button
              onClick={() => setShowIosGuide(false)}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                background: '#F1F5F9',
                border: 'none',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={16} color="#475569" />
            </button>

            <div style={{ width: '56px', height: '56px', backgroundColor: 'var(--catalog-primary-light, #CCFBF1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '8px auto 16px auto', color: 'var(--catalog-primary, #0D9488)' }}>
              <Smartphone size={32} />
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>
              Installer sur iPhone / iPad
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.5', margin: '0 0 20px 0' }}>
              Pour installer le catalogue directement sur votre écran d'accueil sans passer par l'App Store :
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ backgroundColor: '#E0F2FE', color: '#0284C7', padding: '8px', borderRadius: '8px', display: 'flex' }}>
                  <Share size={18} />
                </div>
                <div style={{ fontSize: '13px', color: '#334155' }}>
                  <strong>1.</strong> Touchez le bouton <strong>Partager</strong> en bas de Safari
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ backgroundColor: '#D1FAE5', color: '#059669', padding: '8px', borderRadius: '8px', display: 'flex' }}>
                  <PlusSquare size={18} />
                </div>
                <div style={{ fontSize: '13px', color: '#334155' }}>
                  <strong>2.</strong> Sélectionnez <strong>"Sur l'écran d'accueil"</strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ backgroundColor: '#FEF3C7', color: '#D97706', padding: '8px', borderRadius: '8px', display: 'flex' }}>
                  <CheckCircle2 size={18} />
                </div>
                <div style={{ fontSize: '13px', color: '#334155' }}>
                  <strong>3.</strong> Touchez <strong>Ajouter</strong> en haut à droite
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIosGuide(false)}
              style={{
                width: '100%',
                backgroundColor: 'var(--catalog-primary, #0D9488)',
                color: 'white',
                border: 'none',
                padding: '12px',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Compris
            </button>
          </div>
        </div>
      )}

      {/* 3. GUIDE NAVIGATEUR DESKTOP / ANDROID SANS PROMPT AUTOMATIQUE */}
      {showDesktopGuide && (
        <div
          className="native-sheet-overlay"
          onClick={() => setShowDesktopGuide(false)}
          style={{ zIndex: 10000 }}
        >
          <div
            className="native-sheet-modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '420px', padding: '20px', textAlign: 'center' }}
          >
            <div className="native-sheet-handle" />
            <button
              onClick={() => setShowDesktopGuide(false)}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                background: '#F1F5F9',
                border: 'none',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={16} color="#475569" />
            </button>

            <div style={{ width: '56px', height: '56px', backgroundColor: 'var(--catalog-primary-light, #CCFBF1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '8px auto 16px auto', color: 'var(--catalog-primary, #0D9488)' }}>
              <Laptop size={32} />
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>
              Installer l'application
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.5', margin: '0 0 16px 0' }}>
              Pour installer le catalogue sur votre appareil :
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', marginBottom: '20px' }}>
              <div style={{ padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>
                🖥️ <strong>Sur Ordinateur (Chrome / Edge) :</strong><br />
                Cliquez sur l'icône d'installation <strong>(📲 ou ⊕)</strong> située à droite dans la barre d'adresse de votre navigateur.
              </div>

              <div style={{ padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>
                📱 <strong>Sur Mobile (Chrome Android) :</strong><br />
                Ouvrez le menu <strong>(⋮)</strong> en haut à droite $\rightarrow$ appuyez sur <strong>"Installer l'application"</strong> ou <strong>"Ajouter à l'écran d'accueil"</strong>.
              </div>
            </div>

            <button
              onClick={() => setShowDesktopGuide(false)}
              style={{
                width: '100%',
                backgroundColor: 'var(--catalog-primary, #0D9488)',
                color: 'white',
                border: 'none',
                padding: '12px',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
