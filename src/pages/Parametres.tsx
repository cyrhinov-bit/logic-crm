import React, { useState, useEffect, useMemo } from 'react';
import { Save, Upload, Palette, Check } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../components/ConfirmModal';
import toast from 'react-hot-toast';
import { THEME_PRESETS, THEME_CATEGORIES, getUserThemeColor, setUserThemeColor, applyTheme } from '../lib/theme';
import { MailSmtpSettings } from '../components/MailSmtpSettings';

export function Parametres() {
  const { settings, updateSettings } = useAppContext();
  const { currentUser } = useAuth();
  const { confirm } = useConfirm();
  const [localSettings, setLocalSettings] = useState(settings);
  const [selectedThemeColor, setSelectedThemeColor] = useState(() => getUserThemeColor(currentUser?.id));
  const [themeCategory, setThemeCategory] = useState<string>('Tous');
  const isDirtyRef = React.useRef(false);

  // Keep local state in sync when settings are loaded asynchronously (only if user hasn't edited text fields)
  useEffect(() => {
    if (!isDirtyRef.current && settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  const filteredThemePresets = useMemo(() => {
    if (themeCategory === 'Tous') return THEME_PRESETS;
    return THEME_PRESETS.filter(p => p.category === themeCategory);
  }, [themeCategory]);

  const handleThemeChange = (hex: string) => {
    setSelectedThemeColor(hex);
    applyTheme(hex);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Veuillez sélectionner un fichier image valide');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawDataUrl = event.target?.result as string;
        const img = new Image();
        img.onload = async () => {
          const maxWidth = 1400;
          const maxHeight = 500;
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          let optimizedDataUrl = rawDataUrl;
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const isPng = file.type === 'image/png';
            optimizedDataUrl = isPng 
              ? canvas.toDataURL('image/png') 
              : canvas.toDataURL('image/jpeg', 0.92);
          }
          const next = { ...localSettings, headerLogoBase64: optimizedDataUrl };
          setLocalSettings(next);
          try {
            await updateSettings(next);
            toast.success('En-tête enregistré avec succès !');
          } catch (err) {
            console.error(err);
            toast.error('Erreur lors de la sauvegarde de l\'en-tête');
          }
        };
        img.onerror = async () => {
          const next = { ...localSettings, headerLogoBase64: rawDataUrl };
          setLocalSettings(next);
          try {
            await updateSettings(next);
            toast.success('En-tête enregistré avec succès !');
          } catch (err) {
            console.error(err);
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveHeaderLogo = async () => {
    const next = { ...localSettings, headerLogoBase64: undefined };
    setLocalSettings(next);
    try {
      await updateSettings(next);
      toast.success('En-tête supprimé.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Veuillez sélectionner un fichier image valide');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawDataUrl = event.target?.result as string;
        const img = new Image();
        img.onload = async () => {
          const maxWidth = 800;
          const maxHeight = 800;
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          let optimizedDataUrl = rawDataUrl;
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            optimizedDataUrl = canvas.toDataURL('image/png');
          }
          const next = { ...localSettings, companyStampBase64: optimizedDataUrl };
          setLocalSettings(next);
          try {
            await updateSettings(next);
            toast.success('Cachet d\'entreprise enregistré avec succès !');
          } catch (err) {
            console.error(err);
            toast.error('Erreur lors de la sauvegarde du cachet');
          }
        };
        img.onerror = async () => {
          const next = { ...localSettings, companyStampBase64: rawDataUrl };
          setLocalSettings(next);
          try {
            await updateSettings(next);
            toast.success('Cachet d\'entreprise enregistré avec succès !');
          } catch (err) {
            console.error(err);
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveStamp = async () => {
    const next = { ...localSettings, companyStampBase64: undefined };
    setLocalSettings(next);
    try {
      await updateSettings(next);
      toast.success('Cachet supprimé.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = () => {
    confirm({
      title: 'Enregistrer les paramètres',
      message: 'Souhaitez-vous enregistrer les modifications apportées aux paramètres de l\'application ?',
      confirmLabel: 'Enregistrer',
      variant: 'info',
      onConfirm: async () => {
        try {
          if (currentUser?.id) {
            setUserThemeColor(currentUser.id, selectedThemeColor);
          }
          await updateSettings(localSettings);
          isDirtyRef.current = false;
          toast.success('Paramètres enregistrés avec succès !');
        } catch (err) {
          console.error(err);
          toast.error('Erreur lors de l\'enregistrement des paramètres');
        }
      }
    });
  };

  return (
    <div className="dashboard">
      <h2>Paramètres de l'application</h2>

      <div className="card" style={{ maxWidth: '800px', padding: 'var(--spacing-5)' }}>
        <section style={{ marginBottom: '32px' }}>
          <h3 style={{ color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Identité de l'entreprise</h3>
          
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Logo / Modèle d'en-tête (Téléversable)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {localSettings.headerLogoBase64 ? (
                <img src={localSettings.headerLogoBase64} alt="En-tête" style={{ maxHeight: '80px', maxWidth: '200px', objectFit: 'contain', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
              ) : (
                <div style={{ width: '150px', height: '60px', backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', borderRadius: '4px' }}>Aucun logo</div>
              )}
              <label className="btn btn-outline" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Upload size={16} style={{ marginRight: '8px' }} />
                Téléverser
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
              </label>
              {localSettings.headerLogoBase64 && (
                <button className="btn btn-secondary" onClick={handleRemoveHeaderLogo}>Supprimer</button>
              )}
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>Cette image apparaît en tête des devis et sur le portail client.</p>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Cachet & Signature de l'entreprise (Permanent sur les PDF)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {localSettings.companyStampBase64 ? (
                <img src={localSettings.companyStampBase64} alt="Cachet Entreprise" style={{ maxHeight: '80px', maxWidth: '160px', objectFit: 'contain', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: '#fafafa', padding: '4px' }} />
              ) : (
                <div style={{ width: '150px', height: '60px', backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', borderRadius: '4px' }}>Aucun cachet</div>
              )}
              <label className="btn btn-outline" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Upload size={16} style={{ marginRight: '8px' }} />
                Téléverser le cachet
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleStampUpload} />
              </label>
              {localSettings.companyStampBase64 && (
                <button className="btn btn-secondary" onClick={handleRemoveStamp}>Supprimer</button>
              )}
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>Ce cachet apparaîtra automatiquement et de manière permanente dans la section "Signature autorisée & Cachet" sur tous vos devis PDF.</p>
          </div>

          <div className="responsive-form-grid">
            <div className="form-group">
              <label>Nom de l'entreprise</label>
              <input type="text" className="table-input" value={localSettings.companyName} onChange={e => { isDirtyRef.current = true; setLocalSettings({...localSettings, companyName: e.target.value}); }} />
            </div>
            <div className="form-group">
              <label>RCCM</label>
              <input type="text" className="table-input" value={localSettings.companySiret} onChange={e => { isDirtyRef.current = true; setLocalSettings({...localSettings, companySiret: e.target.value}); }} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Adresse siège social</label>
              <input type="text" className="table-input" value={localSettings.companyAddress} onChange={e => { isDirtyRef.current = true; setLocalSettings({...localSettings, companyAddress: e.target.value}); }} />
            </div>
            <div className="form-group">
              <label>Capital social (ex : 2.000.000)</label>
              <input type="text" className="table-input" value={localSettings.companyCapital || ''} onChange={e => { isDirtyRef.current = true; setLocalSettings({...localSettings, companyCapital: e.target.value}); }} />
            </div>
            <div className="form-group">
              <label>Téléphone (ex : (225) 27 23 22 79 92)</label>
              <input type="text" className="table-input" value={localSettings.companyPhone || ''} onChange={e => { isDirtyRef.current = true; setLocalSettings({...localSettings, companyPhone: e.target.value}); }} />
            </div>
            <div className="form-group">
              <label>Email de contact</label>
              <input type="text" className="table-input" value={localSettings.companyEmail || ''} onChange={e => { isDirtyRef.current = true; setLocalSettings({...localSettings, companyEmail: e.target.value}); }} />
            </div>
            <div className="form-group">
              <label>IBAN (coordonnées bancaires du devis)</label>
              <input type="text" className="table-input" value={localSettings.bankIban || ''} onChange={e => { isDirtyRef.current = true; setLocalSettings({...localSettings, bankIban: e.target.value}); }} />
            </div>
          </div>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h3 style={{ color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Configuration des devis</h3>
          <div className="responsive-form-grid">
            <div className="form-group">
              <label>Durée de validité par défaut (jours)</label>
              <input type="number" className="table-input" value={localSettings.defaultValidity} onChange={e => setLocalSettings({...localSettings, defaultValidity: Number(e.target.value)})} />
            </div>
            <div className="form-group">
              <label>Taux de commission commerciale (%)</label>
              <input type="number" className="table-input" value={localSettings.commissionRate} onChange={e => setLocalSettings({...localSettings, commissionRate: Number(e.target.value)})} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>URL du site / Domaine personnalisé pour les liens de devis</label>
              <input
                type="url"
                className="table-input"
                placeholder="Ex: https://devis.votre-entreprise.com"
                value={localSettings.siteUrl || ''}
                onChange={e => setLocalSettings({ ...localSettings, siteUrl: e.target.value })}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Laisser vide pour utiliser automatiquement l'URL courante de votre navigateur.
              </p>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Mentions légales par défaut</label>
              <textarea className="table-input" rows={4} value={localSettings.defaultTerms} onChange={e => setLocalSettings({...localSettings, defaultTerms: e.target.value})} />
            </div>
          </div>
        </section>

        <MailSmtpSettings />

        {/* Section Thème & Apparence */}
        <section style={{ marginBottom: '32px' }}>
          <h3 style={{ color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Palette size={20} /> Thème & Apparence Personnelle ({THEME_PRESETS.length} nuances)
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
            Personnalisez la couleur primaire de votre interface. Les boutons, accents et menus s'adapteront immédiatement.
          </p>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {THEME_CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setThemeCategory(cat)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '16px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: themeCategory === cat ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                  backgroundColor: themeCategory === cat ? 'var(--color-primary)' : '#F8FAFC',
                  color: themeCategory === cat ? '#ffffff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            {filteredThemePresets.map(preset => {
              const isSelected = selectedThemeColor.toLowerCase() === preset.hex.toLowerCase();
              return (
                <div
                  key={preset.hex}
                  onClick={() => handleThemeChange(preset.hex)}
                  style={{
                    border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '10px 8px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--color-primary-tint)' : '#ffffff',
                    textAlign: 'center',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: preset.hex,
                      margin: '0 auto 6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.15)'
                    }}
                  >
                    {isSelected && <Check size={16} strokeWidth={3} />}
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text)' }}>{preset.name}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>{preset.mood}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', maxWidth: '380px' }}>
            <input
              type="color"
              value={selectedThemeColor}
              onChange={e => handleThemeChange(e.target.value)}
              style={{ width: '40px', height: '34px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
            />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Nuancier Libre : <span style={{ color: 'var(--color-primary)', fontFamily: 'monospace' }}>{selectedThemeColor.toUpperCase()}</span></div>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Cliquez pour choisir n'importe quelle couleur</div>
            </div>
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            className="btn" 
            style={{ backgroundColor: 'var(--color-danger)', color: 'white' }}
            onClick={() => {
              confirm({
                title: 'Vider le cache local',
                message: 'Voulez-vous vraiment supprimer toutes les données locales de l\'interface ? Cela ne supprimera pas les données sur Supabase, mais réinitialisera l\'interface pour vos tests.',
                confirmLabel: 'Vider le cache',
                variant: 'danger',
                onConfirm: async () => {
                  const { db } = await import('../lib/db');
                  const queue = (await db.syncQueue.getItem('queue')) as any[] || [];
                  if (queue.length > 0) {
                    alert(`Attention : ${queue.length} élément(s) en attente de synchronisation. Veuillez patienter ou vous connecter à internet avant de vider le cache, sous peine de perdre ces données.`);
                    return;
                  }
                  
                  const protectedKeys = ['syncQueue', 'syncErrors', 'syncMetadata'];
                  for (const key of Object.keys(db)) {
                    if (!protectedKeys.includes(key)) {
                      await (db as any)[key].clear();
                    }
                  }
                  window.location.reload();
                }
              });
            }}
          >
            Vider le cache local (Test)
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={16} style={{ marginRight: '8px' }} /> Enregistrer les paramètres
          </button>
        </div>
      </div>
    </div>
  );
}
