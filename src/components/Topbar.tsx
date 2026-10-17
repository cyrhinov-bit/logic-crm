import React, { useState, useRef, useEffect } from 'react';
import { Menu, Bell, KeyRound, LogOut, Eye, EyeOff, CheckCircle2, XCircle, ArrowLeftRight, Camera, Trash2, Palette, Building2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { ThemeModal } from './ThemeModal';
import { compressProfileAvatar } from '../lib/imageEnhancer';
import { db } from '../lib/db';
import { toast } from 'react-hot-toast';
import './Topbar.css';

export function Topbar({ onToggleMenu }: { onToggleMenu?: () => void }) {
  const location = useLocation();
  const { currentUser, logout, updatePin, updateCurrentUser } = useAuth();
  const { posWorkspace, setPosWorkspace, updateMyProfile, notifications, markNotificationAsRead, markAllNotificationsAsRead, services } = useAppContext();
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [syncErrorsCount, setSyncErrorsCount] = useState<number>(0);

  useEffect(() => {
    const checkErrors = async () => {
      try {
        const stored = (await db.syncErrors.getItem<any[]>('errors')) || [];
        setSyncErrorsCount(stored.length);
      } catch {
        setSyncErrorsCount(0);
      }
    };

    checkErrors();

    const handleErrorsUpdated = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && typeof detail.count === 'number') {
        setSyncErrorsCount(detail.count);
      } else {
        checkErrors();
      }
    };

    window.addEventListener('sync-errors-updated', handleErrorsUpdated);
    window.addEventListener('sync-critical-error', checkErrors);
    const interval = setInterval(checkErrors, 10000);

    return () => {
      window.removeEventListener('sync-errors-updated', handleErrorsUpdated);
      window.removeEventListener('sync-critical-error', checkErrors);
      clearInterval(interval);
    };
  }, []);

  const currentService = services.find(s => s.id === currentUser?.serviceId);
  const serviceName = currentService?.name || null;
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const userNotifications = notifications
    .filter(n => n.user_id === currentUser?.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const unreadCount = userNotifications.filter(n => !n.is_read).length;

  // Fermer le menu si clic en dehors
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getInitials = (name?: string) =>
    (name || '?')
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const openPinModal = () => {
    setShowProfileMenu(false);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setFeedback(null);
    setShowPinModal(true);
  };

  const handleSavePin = async () => {
    setFeedback(null);
    if (newPin !== confirmPin) {
      setFeedback({ type: 'error', message: 'Les deux nouveaux codes PIN ne correspondent pas.' });
      return;
    }
    setSaving(true);
    const result = await updatePin(currentPin, newPin);
    setSaving(false);
    if (result.success) {
      setFeedback({ type: 'success', message: 'Code PIN mis à jour avec succès !' });
      setTimeout(() => setShowPinModal(false), 1800);
    } else {
      setFeedback({ type: 'error', message: result.error || 'Une erreur est survenue.' });
    }
  };

  const pinInputProps = (value: string, onChange: (v: string) => void) => ({
    type: 'password' as const,
    maxLength: 6,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value.replace(/\D/g, '')),
    className: 'pin-input',
    placeholder: '••••••',
  });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.loading('Optimisation de la photo...', { id: 'photo-upload' });
      const compressedDataUrl = await compressProfileAvatar(file, 256);
      updateCurrentUser({ photo: compressedDataUrl });
      await updateMyProfile({ photo: compressedDataUrl });
      toast.success('Photo de profil mise à jour !', { id: 'photo-upload' });
      setShowProfileMenu(false);
    } catch (err) {
      console.error('Erreur traitement photo:', err);
      toast.error('Erreur lors du traitement de la photo', { id: 'photo-upload' });
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    updateCurrentUser({ photo: undefined });
    await updateMyProfile({ photo: '' });
    toast.success('Photo de profil supprimée');
    setShowProfileMenu(false);
  };

  return (
    <>
      <nav className="topbar">
        <div className="topbar-left">
          <button className="icon-button menu-toggle" onClick={onToggleMenu} title="Menu de navigation">
            <Menu />
          </button>
          <span className="brand-name">{posWorkspace.active ? 'HINOV POS' : 'HINOV BUSINESS SUITE'}</span>
          {(currentUser?.role === 'Directeur' || currentUser?.posRole != null) && (
            <button
              className="topbar-switch-btn"
              onClick={() => {
                const newActive = !posWorkspace.active;
                setPosWorkspace({ active: newActive });
                navigate(newActive ? '/pos' : '/');
              }}
              style={{
                backgroundColor: posWorkspace.active ? 'var(--color-success)' : 'var(--color-primary)',
              }}
            >
              <ArrowLeftRight size={14} />
              <span className="topbar-btn-text">{posWorkspace.active ? 'Retour CRM' : 'Ouvrir POS'}</span>
              <span className="topbar-btn-text-mobile">{posWorkspace.active ? 'CRM' : 'POS'}</span>
            </button>
          )}

          {currentUser?.role === 'SuperAdmin' && (
            <button
              className="topbar-switch-btn"
              onClick={() => {
                const isResp = location.pathname.startsWith('/responsable');
                navigate(isResp ? '/utilisateurs' : '/responsable');
              }}
              style={{
                backgroundColor: location.pathname.startsWith('/responsable') ? '#7C3AED' : 'var(--color-primary)',
              }}
            >
              <ArrowLeftRight size={14} />
              <span className="topbar-btn-text">{location.pathname.startsWith('/responsable') ? 'Retour Admin' : 'Ouvrir Responsable'}</span>
              <span className="topbar-btn-text-mobile">{location.pathname.startsWith('/responsable') ? 'Admin' : 'Responsable'}</span>
            </button>
          )}

          {/* Badge Pôle / Service mis en avant pour les Responsables */}
          {currentUser?.role === 'Responsable' && serviceName && (
            <div className="topbar-service-badge" title={`Responsable du pôle ${serviceName}`}>
              <Building2 size={15} style={{ flexShrink: 0 }} />
              <span className="topbar-service-label">Pôle :</span>
              <span className="topbar-service-name">{serviceName}</span>
            </div>
          )}
        </div>

        <div className="topbar-right">
          {/* Alerte Erreurs de Synchronisation si présentes */}
          {syncErrorsCount > 0 && (
            <button 
              className="icon-button" 
              onClick={() => navigate('/pos/sync-errors')} 
              title={`${syncErrorsCount} erreur(s) de synchronisation - Cliquez pour réconcilier`}
              style={{
                backgroundColor: '#FEF2F2',
                color: '#DC2626',
                border: '1px solid #FCA5A5',
                position: 'relative',
                marginRight: '8px',
                borderRadius: '8px',
                padding: '6px 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <ShieldAlert size={18} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{syncErrorsCount}</span>
            </button>
          )}

          <div className="profile-wrapper" ref={notifRef} style={{ marginRight: '12px' }}>
            <button className="icon-button notification-btn" onClick={() => setShowNotifications(p => !p)} title="Notifications">
              <Bell />
              {(unreadCount > 0 || syncErrorsCount > 0) && (
                <span className="badge" style={{ backgroundColor: syncErrorsCount > 0 ? '#DC2626' : undefined }}>
                  {unreadCount + (syncErrorsCount > 0 ? syncErrorsCount : 0)}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="profile-dropdown notifications-dropdown" style={{ padding: '0' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold' }}>Notifications</span>
                  <span className="badge-status bg-primary" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                    {unreadCount + (syncErrorsCount > 0 ? 1 : 0)} {(unreadCount + (syncErrorsCount > 0 ? 1 : 0)) > 1 ? 'nouvelles' : 'nouvelle'}
                  </span>
                </div>

                {/* Bannière d'alerte Erreurs Sync dans le menu de notifications */}
                {syncErrorsCount > 0 && (
                  <div 
                    style={{ 
                      padding: '12px 16px', 
                      backgroundColor: '#FEF2F2', 
                      borderBottom: '1px solid #FECACA', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'background-color 0.15s'
                    }}
                    onClick={() => { navigate('/pos/sync-errors'); setShowNotifications(false); }}
                    onMouseOver={e => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                    onMouseOut={e => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                  >
                    <ShieldAlert size={22} color="#DC2626" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#991B1B' }}>
                        {syncErrorsCount} Erreur(s) de synchronisation
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#B91C1C', marginTop: '2px' }}>
                        Cliquez pour voir les détails et réconcilier vos données.
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  {userNotifications.length === 0 && syncErrorsCount === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucune notification.</div>
                  ) : (
                    userNotifications.map(n => (
                      <div key={n.id} style={{ padding: '16px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', backgroundColor: n.is_read ? 'transparent' : 'var(--color-surface)' }} onClick={() => { markNotificationAsRead(n.id); if (n.link) navigate(n.link); setShowNotifications(false); }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: n.type === 'error' ? 'var(--color-danger)' : n.type === 'success' ? 'var(--color-success)' : 'inherit' }}>{n.title}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)' }}>{new Date(n.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{n.message}</div>
                      </div>
                    ))
                  )}
                </div>
                {unreadCount > 0 && (
                  <div style={{ padding: '12px', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
                    <button className="btn btn-outline" style={{ width: '100%', fontSize: '0.85rem' }} onClick={() => { markAllNotificationsAsRead(); setShowNotifications(false); }}>
                      Tout marquer comme lu
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Avatar profil */}
          <div className="profile-wrapper" ref={menuRef}>
            <button className="avatar-btn" onClick={() => setShowProfileMenu(p => !p)} title="Mon profil">
              {currentUser?.photo ? (
                <img src={currentUser.photo} alt="Avatar" className="avatar-img" />
              ) : (
                <span className="avatar-initials">
                  {getInitials(currentUser?.name)}
                </span>
              )}
            </button>

            {showProfileMenu && (
              <div className="profile-dropdown">
                <div className="profile-dropdown-header">
                  <div className="avatar-lg">
                    {currentUser?.photo ? (
                      <img src={currentUser.photo} alt="Avatar" className="avatar-img-lg" />
                    ) : (
                      getInitials(currentUser?.name)
                    )}
                  </div>
                  <div>
                    <div className="profile-name">{currentUser?.name || 'Utilisateur'}</div>
                    <div className="profile-role">{currentUser?.role || ''}</div>
                    {serviceName && (
                      <div className="profile-service-tag">
                        <Building2 size={12} style={{ marginRight: 3 }} />
                        {serviceName}
                      </div>
                    )}
                    <div className="profile-email">{currentUser?.email || ''}</div>
                  </div>
                </div>
                <button className="dropdown-item" onClick={() => photoInputRef.current?.click()}>
                  <Camera size={15} />
                  {currentUser?.photo ? 'Changer ma photo' : 'Ajouter ma photo'}
                </button>
                {currentUser?.photo && (
                  <button className="dropdown-item dropdown-item-danger" onClick={handleRemovePhoto}>
                    <Trash2 size={15} />
                    Supprimer ma photo
                  </button>
                )}
                <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
                <hr className="dropdown-divider" />
                <button className="dropdown-item" onClick={() => { setShowProfileMenu(false); setShowThemeModal(true); }}>
                  <Palette size={15} />
                  Personnaliser mon thème
                </button>
                <button className="dropdown-item" onClick={openPinModal}>
                  <KeyRound size={15} />
                  Modifier le code PIN
                </button>
                <button className="dropdown-item dropdown-item-danger" onClick={logout}>
                  <LogOut size={15} />
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Modal modification PIN */}
      {showPinModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPinModal(false)}>
          <div className="pin-modal">
            <div className="pin-modal-header">
              <div className="pin-modal-icon">
                <KeyRound size={22} />
              </div>
              <div>
                <h3>Modifier le code PIN</h3>
                <p>Connecté en tant que <strong>{currentUser?.name}</strong></p>
              </div>
            </div>

            <div className="pin-modal-body">
              {/* PIN actuel */}
              <div className="pin-form-group">
                <label>Code PIN actuel</label>
                <div className="pin-input-wrapper">
                  <input {...pinInputProps(currentPin, setCurrentPin)} autoFocus />
                  <button
                    type="button"
                    className="pin-toggle-visibility"
                    onClick={() => setShowCurrent(p => !p)}
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span className="pin-hint">Code à 4 ou 6 chiffres utilisé pour votre session</span>
              </div>

              {/* Nouveau PIN */}
              <div className="pin-form-group">
                <label>Nouveau code PIN</label>
                <div className="pin-input-wrapper">
                  <input {...pinInputProps(newPin, setNewPin)} />
                  <button
                    type="button"
                    className="pin-toggle-visibility"
                    onClick={() => setShowNew(p => !p)}
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="pin-indicators">
                  {[...Array(6)].map((_, i) => (
                    <span
                      key={i}
                      className={`pin-dot ${i < newPin.length ? 'filled' : ''}`}
                    />
                  ))}
                  <span className="pin-count">{newPin.length}/6 chiffres</span>
                </div>
              </div>

              {/* Confirmation PIN */}
              <div className="pin-form-group">
                <label>Confirmer le nouveau code PIN</label>
                <div className="pin-input-wrapper">
                  <input {...pinInputProps(confirmPin, setConfirmPin)} />
                  <button
                    type="button"
                    className="pin-toggle-visibility"
                    onClick={() => setShowConfirm(p => !p)}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPin.length > 0 && (
                  <div className={`match-indicator ${newPin === confirmPin ? 'match' : 'no-match'}`}>
                    {newPin === confirmPin ? (
                      <><CheckCircle2 size={13} /> Les codes correspondent</>
                    ) : (
                      <><XCircle size={13} /> Les codes ne correspondent pas</>
                    )}
                  </div>
                )}
              </div>

              {feedback && (
                <div className={`pin-feedback ${feedback.type}`}>
                  {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  <span>{feedback.message}</span>
                </div>
              )}
            </div>

            <div className="pin-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowPinModal(false)}
                disabled={saving}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSavePin}
                disabled={saving || !currentPin || newPin.length < 4 || newPin !== confirmPin}
              >
                {saving ? 'Enregistrement...' : 'Enregistrer le PIN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Personnalisation Thème */}
      <ThemeModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
      />
    </>
  );
}
