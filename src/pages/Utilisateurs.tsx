import React, { useState } from 'react';
import { Plus, Edit2, UserX, Power, CheckCircle, AlertTriangle, Shield } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import type { User } from '../context/AppContext';

export function Utilisateurs() {
  const { users: rawUsers, services, addUser, updateUser, toggleUserStatus, deleteUser } = useAppContext();
  const users = React.useMemo(() => {
    const byId = new Map(rawUsers.map(u => [u.id, u]));
    const seen = new Set<string>();
    const out: typeof rawUsers = [];
    for (const u of byId.values()) {
      const k = (u.email || '').trim().toLowerCase();
      if (k) {
        if (seen.has(k)) continue;
        seen.add(k);
      }
      out.push(u);
    }
    return out;
  }, [rawUsers]);
  const { currentUser } = useAuth();
  const { confirm } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'Responsable' as User['role'],
    posRole: '',
    serviceId: '',
    pin: '',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    role: 'Responsable' as User['role'],
    posRole: '' as User['posRole'] | '',
    serviceId: '',
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.pin) {
      alert('Veuillez remplir le nom, l\'e-mail et le mot de passe.');
      return;
    }
    addUser({
      id: Date.now().toString(),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role as User['role'],
      posRole: newUser.posRole ? (newUser.posRole as User['posRole']) : null,
      serviceId: newUser.serviceId,
      pin: newUser.pin,
      lastLogin: 'Jamais',
      active: true,
      // Défaut par rôle (Caissier/Gerant/Encaisseur : pas de CRM) — addUser applique la même règle en repli
      ...((newUser.role === 'Caissier' || newUser.role === 'Gerant' || newUser.role === 'Encaisseur')
        ? {
            crmPrestationsEnabled: false, crmCaisseEnabled: false, crmMaintenanceEnabled: false,
            crmStocksEnabled: false, crmTiersEnabled: false, crmCommerciauxEnabled: false,
            crmCommissionsEnabled: false, crmFacturationEnabled: false, crmSupFacturesEnabled: false
          }
        : {
            crmPrestationsEnabled: true, crmCaisseEnabled: true, crmMaintenanceEnabled: true,
            crmStocksEnabled: true, crmTiersEnabled: true, crmCommerciauxEnabled: true,
            crmCommissionsEnabled: true, crmFacturationEnabled: true,
            // Factures Fournisseurs : actif par défaut pour la Direction uniquement
            crmSupFacturesEnabled: ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(newUser.role)
          })
    });
    setShowForm(false);
    setNewUser({
      name: '',
      email: '',
      role: 'Responsable',
      posRole: '',
      serviceId: '',
      pin: '',
    });
  };

  const startEdit = (u: User) => {
    setEditingUser(u);
    setEditForm({
      name: u.name,
      role: u.role,
      posRole: u.posRole || '',
      serviceId: u.serviceId || '',
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    updateUser(editingUser.id, {
      name: editForm.name,
      role: editForm.role,
      posRole: editForm.posRole ? (editForm.posRole as User['posRole']) : null,
      serviceId: editForm.serviceId,
    });
    setEditingUser(null);
  };

  const handleDelete = (u: User) => {
    confirm({
      title: 'Supprimer l\'utilisateur',
      message: `Êtes-vous sûr de vouloir supprimer l'utilisateur ${u.name} (${u.email}) ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      onConfirm: () => deleteUser(u.id)
    });
  };

  const getServiceName = (id?: string) => {
    if (!id) return '-';
    return services.find(s => s.id === id)?.name || 'Inconnu';
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'Directeur': return 'var(--color-error)';
      case 'Directeur adjoint': return '#7C3AED';
      case 'Responsable': return '#2196F3';
      case 'Commercial': return '#0D9488';
      default: return 'var(--color-text-muted)';
    }
  };

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2>Gestion des Utilisateurs</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Créez et gérez les comptes des collaborateurs de votre entreprise.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditingUser(null); }}>
          <Plus size={16} style={{ marginRight: '8px' }} /> Nouvel Utilisateur
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '24px', padding: '24px' }}>
          <h3>Ajouter un utilisateur</h3>
          <form onSubmit={handleAdd} className="responsive-form-grid">
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Nom complet *</label>
              <input type="text" className="table-input" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} placeholder="Ex: Jean Dupont" required />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Adresse e-mail *</label>
              <input type="email" className="table-input" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} placeholder="Ex: collaborateur@hinov.com" required />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Code PIN / Mot de passe *</label>
              <input type="password" className="table-input" value={newUser.pin} onChange={e => setNewUser({...newUser, pin: e.target.value})} placeholder="******" required />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Rôle *</label>
              <select className="table-input" required value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as User['role'] })}>
                <option value="Caissier">Caissier</option>
                <option value="Gerant">Gérant</option>
                <option value="Encaisseur">Encaisseur</option>
                <option value="Commercial">Commercial</option>
                <option value="Responsable">Responsable</option>
                {['Directeur', 'SuperAdmin'].includes(currentUser?.role || '') && (
                  <option value="Directeur adjoint">Directeur adjoint</option>
                )}
                {currentUser?.role === 'SuperAdmin' && (
                  <option value="Directeur">Directeur</option>
                )}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Rôle POS secondaire (Optionnel)</label>
              <select className="table-input" value={newUser.posRole} onChange={e => setNewUser({ ...newUser, posRole: e.target.value })}>
                <option value="">Aucun</option>
                <option value="Caissier">Caissier</option>
                <option value="Gerant">Gérant</option>
                {currentUser?.role === 'SuperAdmin' && (
                  <option value="Directeur">Directeur</option>
                )}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Service</label>
              <select className="table-input" value={newUser.serviceId || ''} onChange={e => setNewUser({ ...newUser, serviceId: e.target.value })}>
                <option value="">Sélectionner un service (Optionnel)</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
              <button type="submit" className="btn btn-primary">Enregistrer</button>
            </div>
          </form>
        </div>
      )}

      {editingUser && (
        <div className="card" style={{ marginBottom: '24px', padding: '24px', borderLeft: '4px solid var(--color-primary)' }}>
          <h3>Modifier l'utilisateur : {editingUser.email}</h3>
          <form onSubmit={handleSaveEdit} className="responsive-form-grid">
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Nom complet *</label>
              <input type="text" className="table-input" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Rôle *</label>
              <select className="table-input" required value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value as User['role'] })}>
                <option value="Caissier">Caissier</option>
                <option value="Gerant">Gérant</option>
                <option value="Encaisseur">Encaisseur</option>
                <option value="Commercial">Commercial</option>
                <option value="Responsable">Responsable</option>
                {['Directeur', 'SuperAdmin'].includes(currentUser?.role || '') && (
                  <option value="Directeur adjoint">Directeur adjoint</option>
                )}
                {currentUser?.role === 'SuperAdmin' && (
                  <option value="Directeur">Directeur</option>
                )}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Rôle POS secondaire (Optionnel)</label>
              <select className="table-input" value={editForm.posRole || ''} onChange={e => setEditForm({ ...editForm, posRole: e.target.value as any })}>
                <option value="">Aucun</option>
                <option value="Caissier">Caissier</option>
                <option value="Gerant">Gérant</option>
                {currentUser?.role === 'SuperAdmin' && (
                  <option value="Directeur">Directeur</option>
                )}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Service associé</label>
              <select className="table-input" value={editForm.serviceId} onChange={e => setEditForm({ ...editForm, serviceId: e.target.value })}>
                <option value="">Sélectionner un service (Optionnel)</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingUser(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary">Sauvegarder les modifications</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="data-table responsive-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Service</th>
                {currentUser?.role === 'SuperAdmin' && <th>Code PIN</th>}
                <th>Dernière connexion</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ opacity: u.active !== false ? 1 : 0.6 }}>
                  <td data-label="Nom">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {u.photo ? (
                        <img src={u.photo} alt={u.name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--color-border)' }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                          {(u.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <strong>{u.name}</strong>
                    </div>
                  </td>
                  <td data-label="Email">{u.email}</td>
                  <td data-label="Rôle"><span className="badge-status" style={{ backgroundColor: getRoleColor(u.role) }}>{u.role}</span></td>
                  <td data-label="Statut">
                    {u.active !== false ? (
                      <span className="badge-status bg-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle size={12} /> Actif
                      </span>
                    ) : (
                      <span className="badge-status bg-error" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={12} /> Inactif
                      </span>
                    )}
                  </td>
                  <td data-label="Service">{getServiceName(u.serviceId)}</td>
                  {currentUser?.role === 'SuperAdmin' && <td data-label="Code PIN">{u.pin || 'N/A'}</td>}
                  <td data-label="Dernière connexion">{u.lastLogin}</td>
                  <td data-label="Actions">
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="icon-button" style={{ color: 'var(--color-primary)' }} title="Modifier" onClick={() => startEdit(u)}>
                        <Edit2 size={16} />
                      </button>
                      {(currentUser?.role === 'SuperAdmin' || u.role !== 'Directeur') && (
                        <>
                          <button
                            className="icon-button"
                            style={{ color: u.active !== false ? '#ff9800' : '#4caf50' }}
                            title={u.active !== false ? 'Désactiver le compte' : 'Activer le compte'}
                            onClick={() => toggleUserStatus(u.id)}
                          >
                            <Power size={16} />
                          </button>
                          <button className="icon-button text-error" title="Supprimer" onClick={() => handleDelete(u)}>
                            <UserX size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px' }}>Aucun utilisateur trouvé.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
