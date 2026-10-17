import { useEffect, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Save, CheckCircle2 } from 'lucide-react';
import { useCanManagePosReferentials } from '../../hooks/useCanManagePosReferentials';

export default function PosSettings() {
  const { posSettings, updatePosSettings } = useAppContext();
  const canEdit = useCanManagePosReferentials();
  const [form, setForm] = useState(posSettings);
  const [saved, setSaved] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  // Resynchroniser le formulaire si les paramètres chargent après le montage
  useEffect(() => {
    setForm(posSettings);
  }, [posSettings]);

  const handleSave = async () => {
    // F25 : formats validés (WhatsApp E.164 souple, email, couleur hex, longueurs).
    const wa = ((form as any).whatsappOrderPhone || '').trim();
    if (wa && !/^\+?[0-9][0-9\s.-]{5,19}$/.test(wa)) {
      alert('Numéro WhatsApp invalide : utilisez le format international (ex : +225 07 00 00 00 00).');
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      alert('Email invalide.');
      return;
    }
    const theme = ((form as any).themeColor || '').trim();
    if (theme && !/^#[0-9a-fA-F]{6}$/.test(theme)) {
      alert('Couleur du thème invalide : format hexadécimal attendu (ex : #0D9488).');
      return;
    }
    if ((form.ticketMessage || '').length > 500) {
      alert('Message ticket trop long (500 caractères maximum).');
      return;
    }
    if (((form as any).catalogBannerText || '').length > 200) {
      alert("Texte d'accroche trop long (200 caractères maximum).");
      return;
    }
    await updatePosSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 500, color: 'var(--color-text)', marginBottom: '4px' };

  return (
    <div className="pos-page" style={{ maxWidth: '640px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Paramètres POS</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'var(--color-error)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => setShowClearModal(true)}
          >
            Vider le cache local (Test)
          </button>
          {canEdit && (
          <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
            {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saved ? 'Enregistré !' : 'Enregistrer'}
          </button>
          )}
        </div>
      </div>
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div className="responsive-form-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={labelStyle}>Nom de la librairie</div>
            <input style={inputStyle} value={form.libraryName} onChange={e => setForm({ ...form, libraryName: e.target.value })} />
          </div>
          <div>
            <div style={labelStyle}>Adresse</div>
            <input style={inputStyle} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <div style={labelStyle}>Téléphone</div>
            <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <div style={labelStyle}>Email</div>
            <input style={inputStyle} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <div style={labelStyle}>Devise</div>
            <input style={inputStyle} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
          </div>
          <div>
            <div style={labelStyle}>Type d'imprimante</div>
            <select style={inputStyle} value={form.printerType} onChange={e => setForm({ ...form, printerType: e.target.value })}>
              <option>Thermique 58mm</option>
              <option>Thermique 80mm</option>
              <option>A4</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={labelStyle}>Message sur le ticket</div>
            <textarea style={{ ...inputStyle, minHeight: '80px' }} value={form.ticketMessage} onChange={e => setForm({ ...form, ticketMessage: e.target.value })} />
          </div>

          {/* Section Catalogue Public & Commandes WhatsApp */}
          <div style={{ gridColumn: '1 / -1', marginTop: '16px', paddingTop: '16px', borderTop: '2px solid var(--color-border)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F766E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🛍️</span> Catalogue Public & Commandes WhatsApp
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              Configurez le numéro WhatsApp sur lequel vos clients transmettent leurs commandes depuis le catalogue en ligne.
            </p>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <div style={labelStyle}>Numéro WhatsApp de réception des commandes *</div>
            <input 
              style={inputStyle} 
              placeholder="Ex: +225 07 00 00 00 00 (avec indicatif)" 
              value={(form as any).whatsappOrderPhone || ''} 
              onChange={e => setForm({ ...form, whatsappOrderPhone: e.target.value } as any)} 
            />
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
              Les commandes du catalogue public seront envoyées directement à ce numéro avec la liste des articles et les coordonnées du client.
            </span>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <div style={labelStyle}>Texte d'accroche de la bannière du catalogue</div>
            <input 
              style={inputStyle} 
              placeholder="Ex: Commandez en quelques clics et faites-vous livrer rapidement via WhatsApp !" 
              value={(form as any).catalogBannerText || ''} 
              onChange={e => setForm({ ...form, catalogBannerText: e.target.value } as any)} 
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <div style={labelStyle}>Couleur du Thème du Catalogue Public</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input 
                type="color" 
                value={(form as any).themeColor || '#0D9488'} 
                onChange={e => setForm({ ...form, themeColor: e.target.value } as any)}
                style={{ width: '42px', height: '38px', borderRadius: '8px', border: '1px solid #D1D5DB', cursor: 'pointer', padding: '2px' }}
              />
              <input 
                style={{ ...inputStyle, width: '140px' }} 
                placeholder="#0D9488" 
                value={(form as any).themeColor || ''} 
                onChange={e => setForm({ ...form, themeColor: e.target.value } as any)} 
              />
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Le catalogue s'adapte automatiquement à votre couleur personnalisée.
              </span>
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
            <a 
              href="/#/catalogue" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                backgroundColor: '#F0FDFA',
                color: '#0F766E',
                border: '1px solid #CCFBF1',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              <span>Voir le Catalogue Public</span>
              <span>↗</span>
            </a>
          </div>
        </div>
      </div>
      
      {showClearModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: 'var(--radius-lg)', width: '400px', maxWidth: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 600 }}>Confirmer la réinitialisation</h3>
            <p style={{ marginBottom: '24px', color: 'var(--color-text-muted)', fontSize: '14px', lineHeight: '1.5' }}>Voulez-vous vraiment supprimer toutes les données locales de l'interface ? Cela réinitialisera l'interface pour vos tests. La purge est <strong>refusée tant que la file de synchronisation n'est pas vide</strong>, puis exige une resynchronisation complète vérifiée.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowClearModal(false)} style={{ padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'white', cursor: 'pointer', fontWeight: 500 }}>Annuler</button>
              <button onClick={() => {
                import('../../lib/db').then(async ({ db }) => {
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
                });
              }} style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--color-error)', color: 'white', cursor: 'pointer', fontWeight: 500 }}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
