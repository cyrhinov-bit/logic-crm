import { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit2, Trash2, ShieldAlert, Ghost } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function PosUsers() {
  const { users: rawUsers, addUser, updateUser, toggleUserStatus, deleteUser, refreshData } = useAppContext();
  const users = rawUsers;
  const deduped = (() => {
    const byId = new Map(users.map(u => [u.id, u]));
    const seen = new Set<string>();
    const out: typeof users = [];
    for (const u of byId.values()) {
      const k = (u.email || '').trim().toLowerCase();
      if (k) {
        if (seen.has(k)) continue;
        seen.add(k);
      }
      out.push(u);
    }
    return out;
  })();
  const posUsers = deduped.filter(u => u.role === 'Gerant' || u.role === 'Caissier' || u.role === 'Encaisseur');
  const { currentUser } = useAuth();
  const [isCleaning, setIsCleaning] = useState(false);
  const canManage = !!currentUser && ['Directeur', 'SuperAdmin', 'Directeur adjoint', 'Gerant'].includes(currentUser.role);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form, setForm] = useState({ name: '', email: '', pin: '', role: 'Caissier' as 'Gerant' | 'Caissier' | 'Encaisseur' });

  const handleSave = async () => {
    // F23 : validation stricte (nom, email unique/format, PIN exactement 6 chiffres).
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name) { alert('Nom requis.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Email invalide.'); return; }
    const emailDupe = users.find(u => u.email.trim().toLowerCase() === email && (!editingUser || u.id !== editingUser.id));
    if (emailDupe) { alert(`Email déjà utilisé par « ${emailDupe.name} ».`); return; }
    if (!editingUser && !/^\d{6}$/.test(form.pin)) { alert('PIN : exactement 6 chiffres.'); return; }
    if (editingUser) {
      await updateUser(editingUser.id, { name, role: form.role, serviceId: undefined, posReturnsEnabled: !!editingUser.posReturnsEnabled, posCatalogueEnabled: !!editingUser.posCatalogueEnabled });
    } else {
      // Matrice complète des flags POS (M17) : tout est désactivé à la création, à activer via Modules Caissier
      await addUser({ id: uuidv4(), name, email, pin: form.pin, role: form.role, lastLogin: 'Jamais', active: true, posReturnsEnabled: false, posCatalogueEnabled: false, posSupplyEnabled: false, posInventoryEnabled: false, posStockEnabled: false });
    }
    setShowForm(false);
    setEditingUser(null);
    setForm({ name: '', email: '', pin: '', role: 'Caissier' });
  };

  // Comptes fantômes : présents en local sur ce poste mais inconnus du serveur
  // (ex : compte supprimé côté serveur, jamais resynchronisé). Leurs ventes
  // déjà synchronisées restent attribuées à leurs identifiants (traçabilité).
  const handleCleanGhosts = async () => {
    if (isCleaning) return;
    setIsCleaning(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data: serverProfiles, error } = await supabase.from('profiles').select('id');
      if (error || !serverProfiles) { alert('Serveur injoignable : nettoyage impossible en ligne uniquement.'); return; }
      const serverIds = new Set(serverProfiles.map((p: any) => p.id));
      const { db } = await import('../../lib/db');
      const cached = (await db.profiles.getItem<any[]>('data')) || [];
      const ghosts = cached.filter(u => !serverIds.has(u.id) && u.id !== currentUser?.id);
      if (ghosts.length === 0) { alert('Aucun compte fantôme sur ce poste.'); return; }
      if (!window.confirm(`Retirer ${ghosts.length} compte(s) local(aux) inconnu(s) du serveur (${ghosts.map(g => g.name || g.email).join(', ')}) ? L'historique existant est conservé. Continuer ?`)) return;
      await db.profiles.setItem('data', cached.filter(u => serverIds.has(u.id) || u.id === currentUser?.id));
      await refreshData();
      alert('Comptes fantômes retirés de ce poste. Si un fantôme est encore connecté, déconnectez-le.');
    } catch (e: any) {
      alert('Nettoyage impossible : ' + (e?.message || e));
    } finally {
      setIsCleaning(false);
    }
  };
  // F24 : garde anti auto-suppression et dernier gestionnaire actif.
  const handleDelete = (u: typeof posUsers[number]) => {
    if (u.id === currentUser?.id) { alert('Vous ne pouvez pas supprimer votre propre compte.'); return; }
    const activeManagers = posUsers.filter(x => x.active && x.id !== u.id && (x.role === 'Gerant' || x.role === 'Directeur'));
    if (u.role === 'Gerant' && activeManagers.length === 0) { alert('Suppression impossible : dernier gérant actif.'); return; }
    if (window.confirm(`Supprimer définitivement l'utilisateur ${u.name} ? Cette action est irréversible.`)) deleteUser(u.id);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' };

  if (!canManage) {
    return (
      <div className="pos-page" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <ShieldAlert size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Accès réservé</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>Seuls la Direction et les Gérants peuvent gérer les utilisateurs POS.</p>
      </div>
    );
  }

  return (
    <div className="pos-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Utilisateurs POS</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleCleanGhosts} disabled={isCleaning} title="Retire de ce poste les comptes locaux inconnus du serveur (ex : compte supprimé). L'historique est conservé." style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'white', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
            <Ghost size={16} /> {isCleaning ? 'Nettoyage...' : 'Nettoyer les fantômes'}
          </button>
          <button onClick={() => { setShowForm(true); setEditingUser(null); setForm({ name: '', email: '', pin: '', role: 'Caissier' }); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </div>
      {showForm && (
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>{editingUser ? 'Modifier' : 'Ajouter'} un utilisateur</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', alignItems: 'end' }}>
            <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Nom</div><input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Email</div><input style={inputStyle} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={!!editingUser} /></div>
            {!editingUser && <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>PIN (6 chiffres)</div><input style={inputStyle} maxLength={6} value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} /></div>}
            <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Rôle</div><select style={inputStyle} value={form.role} onChange={e => setForm({ ...form, role: e.target.value as any })}><option value="Caissier">Caissier</option><option value="Gerant">Gérant</option>{(['Directeur', 'SuperAdmin'].includes(currentUser?.role || '') || form.role === 'Encaisseur') && (<option value="Encaisseur">Encaisseur</option>)}</select></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button onClick={handleSave} style={{ padding: '8px 16px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Enregistrer</button>
            <button onClick={() => { setShowForm(false); setEditingUser(null); }} style={{ padding: '8px 16px', backgroundColor: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Annuler</button>
          </div>
        </div>
      )}
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Nom</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Email</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Rôle</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Statut</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Actions</th></tr></thead>
          <tbody>
            {posUsers.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                <td style={{ padding: '12px 16px', fontSize: '14px' }}>{u.name}</td>
                <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--color-text-muted)' }}>{u.email}</td>
                <td style={{ padding: '12px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 'var(--radius-lg)', fontSize: '12px', fontWeight: 500, background: u.role === 'Gerant' ? 'var(--color-primary-tint)' : 'var(--color-success-tint)', color: u.role === 'Gerant' ? 'var(--color-primary)' : 'var(--color-success)' }}>{u.role}</span></td>
                <td style={{ padding: '12px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 'var(--radius-lg)', fontSize: '12px', fontWeight: 500, background: u.active ? 'var(--color-success-tint)' : 'var(--color-error-tint)', color: u.active ? 'var(--color-success)' : 'var(--color-error)' }}>{u.active ? 'Actif' : 'Inactif'}</span></td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => { setEditingUser(u); setForm({ name: u.name, email: u.email, pin: '', role: u.role as any }); setShowForm(true); }} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><Edit2 size={16} /></button>
                    <button onClick={() => toggleUserStatus(u.id)} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: u.active ? 'var(--color-warning)' : 'var(--color-success)' }}>{u.active ? 'Désactiver' : 'Activer'}</button>
                    <button onClick={() => handleDelete(u)} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {posUsers.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun utilisateur POS</td></tr>}
          </tbody>
        </table>
</div>
      </div>
    </div>
  );
}
