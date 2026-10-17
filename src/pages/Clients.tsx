import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Search, Filter, UserCheck, Building2, Phone, Mail, RotateCcw } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../components/ConfirmModal';
import type { Client } from '../context/AppContext';
import { canReadAllClients } from '../lib/scope';
import toast from 'react-hot-toast';

export function Clients() {
  const { clients, addClient, updateClient, deleteClient, users } = useAppContext();
  const { currentUser: authUser } = useAuth();
  const currentUser = users.find(u => u.id === authUser?.id) || authUser;
  const { confirm } = useConfirm();

  const isDirector = currentUser?.role === 'Directeur' || currentUser?.role === 'SuperAdmin' || currentUser?.role === 'Directeur adjoint';
  const canSeeAllClients = canReadAllClients(currentUser?.role);

  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [commercialFilter, setCommercialFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [newClient, setNewClient] = useState<Partial<Client>>({});
  const [editForm, setEditForm] = useState<Partial<Client>>({});

  const commercials = useMemo(() => {
    return users.filter(u => (u.role === 'Commercial' || u.role === 'Responsable' || u.role === 'Directeur') && u.active);
  }, [users]);

  // Lecture partagée : Direction + Responsable voient tous les clients (sélection
  // dans Devis / Factures / Documents). Gestion reste propriétaire.
  const allowedClients = useMemo(() => {
    if (canSeeAllClients) return clients;
    return clients.filter(c => c.commercialId === currentUser?.id);
  }, [clients, canSeeAllClients, currentUser]);

  const filteredClients = useMemo(() => {
    return allowedClients.filter(c => {
      // 1. Commercial filter (supervision admin)
      if (isDirector && commercialFilter && c.commercialId !== commercialFilter) {
        return false;
      }
      // 2. Status filter
      if (statusFilter && (c.status || 'Actif') !== statusFilter) {
        return false;
      }
      // 3. Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchContact = (c.contact || '').toLowerCase().includes(q);
        const matchEmail = (c.email || '').toLowerCase().includes(q);
        const matchPhone = (c.phone || '').toLowerCase().includes(q);
        const matchCompany = (c.company || '').toLowerCase().includes(q);
        if (!matchName && !matchContact && !matchEmail && !matchPhone && !matchCompany) {
          return false;
        }
      }
      return true;
    });
  }, [allowedClients, isDirector, commercialFilter, statusFilter, searchTerm]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if client already exists
    const existingClient = clients.find(c => {
      const emailMatch = newClient.email && c.email && c.email.toLowerCase() === newClient.email.toLowerCase();
      const phoneMatch = newClient.phone && c.phone && c.phone === newClient.phone;
      const nameMatch = newClient.name && c.name && c.name.toLowerCase() === newClient.name.toLowerCase();
      return emailMatch || phoneMatch || nameMatch;
    });

    if (existingClient) {
      toast.error("Un client avec ce nom d'entreprise, email ou téléphone existe déjà.");
      return;
    }

    if (newClient.name || newClient.contact) {
      const assignedCommercialId = isDirector ? (newClient.commercialId || currentUser?.id || '') : (currentUser?.id || '');
      addClient({
        id: Date.now().toString(),
        name: newClient.name || '',
        contact: newClient.contact || '',
        email: newClient.email || '',
        phone: newClient.phone || '',
        company: newClient.company || '',
        address: newClient.address || '',
        status: newClient.status || 'Actif',
        commercialId: assignedCommercialId
      });
      toast.success('Client ajouté avec succès');
      setShowForm(false);
      setNewClient({});
    }
  };

  const startEdit = (client: Client) => {
    // Non-directors can only edit their own clients
    if (!isDirector && client.commercialId !== currentUser?.id) {
      toast.error("Vous n'avez pas l'autorisation de modifier ce client.");
      return;
    }

    setEditingClient(client);
    setEditForm({
      name: client.name,
      contact: client.contact,
      email: client.email,
      phone: client.phone,
      company: client.company || '',
      address: client.address || '',
      status: client.status || 'Actif',
      commercialId: client.commercialId || ''
    });
    setShowForm(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    if (!isDirector && editingClient.commercialId !== currentUser?.id) {
      toast.error("Vous n'avez pas l'autorisation de modifier ce client.");
      return;
    }

    // Check if another client already exists with these details
    const existingClient = clients.find(c => {
      if (c.id === editingClient.id) return false;
      const emailMatch = editForm.email && c.email && c.email.toLowerCase() === editForm.email.toLowerCase();
      const phoneMatch = editForm.phone && c.phone && c.phone === editForm.phone;
      const nameMatch = editForm.name && c.name && c.name.toLowerCase() === editForm.name.toLowerCase();
      return emailMatch || phoneMatch || nameMatch;
    });

    if (existingClient) {
      toast.error("Un autre client utilise déjà ce nom d'entreprise, email ou téléphone.");
      return;
    }

    const assignedCommercialId = isDirector ? (editForm.commercialId ?? editingClient.commercialId ?? '') : (editingClient.commercialId || currentUser?.id || '');

    updateClient(editingClient.id, {
      ...editingClient,
      name: editForm.name || '',
      contact: editForm.contact || '',
      email: editForm.email || '',
      phone: editForm.phone || '',
      company: editForm.company || '',
      address: editForm.address || '',
      status: editForm.status || 'Actif',
      commercialId: assignedCommercialId
    });
    toast.success('Client mis à jour');
    setEditingClient(null);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setCommercialFilter('');
    setStatusFilter('');
  };

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0 }}>
              {canSeeAllClients ? (isDirector ? 'Supervision de Tous les Clients' : 'Tous les Clients') : 'Mes Clients Créés'}
            </h2>
            <span className="badge-status bg-primary" style={{ fontSize: '0.8rem', padding: '3px 8px' }}>
              {filteredClients.length} {filteredClients.length > 1 ? 'clients' : 'client'}
            </span>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
            {isDirector 
              ? 'Supervision globale de l\'ensemble du portefeuille client de tous les collaborateurs.' 
              : canSeeAllClients
                ? 'Vous pouvez sélectionner tous les clients dans les modules (Devis, Factures...). Seuls vos clients attribués sont modifiables.'
                : 'Vous avez uniquement accès aux clients que vous avez créés et qui vous sont attribués.'}
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditingClient(null); }}>
          <Plus size={16} style={{ marginRight: '8px' }} /> Nouveau Client
        </button>
      </div>

      {/* ─── FILTRES & RECHERCHE ─── */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          
          {/* Recherche */}
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input 
              type="text" 
              className="table-input" 
              placeholder="Rechercher par entreprise, contact, email, tél..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '36px', width: '100%' }}
            />
          </div>

          {/* Filtre Commercial (Supervision Admin) */}
          {isDirector && (
            <div style={{ minWidth: '200px' }}>
              <select 
                className="table-input"
                value={commercialFilter}
                onChange={e => setCommercialFilter(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Tous les commerciaux</option>
                {commercials.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
                ))}
              </select>
            </div>
          )}

          {/* Filtre Statut */}
          <div style={{ minWidth: '140px' }}>
            <select
              className="table-input"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">Tous les statuts</option>
              <option value="Actif">Actif</option>
              <option value="Inactif">Inactif</option>
            </select>
          </div>

          {/* Bouton Réinitialiser */}
          {(searchTerm || commercialFilter || statusFilter) && (
            <button 
              className="btn btn-secondary" 
              onClick={resetFilters}
              title="Réinitialiser les filtres"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={14} /> Effacer
            </button>
          )}
        </div>
      </div>

      {/* ─── FORMULAIRE AJOUT CLIENT ─── */}
      {showForm && (
        <div className="card" style={{ marginBottom: '24px', padding: '24px', borderLeft: '4px solid var(--color-primary)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Ajouter un nouveau client</h3>
          <form onSubmit={handleAdd} className="responsive-form-grid">
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Nom de l'entreprise</label>
              <input className="table-input" placeholder="Ex: HINOV SARL" onChange={e => setNewClient({...newClient, name: e.target.value})} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Responsable / Contact *</label>
              <input className="table-input" placeholder="Ex: Jean Dupont" required onChange={e => setNewClient({...newClient, contact: e.target.value})} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Adresse Email *</label>
              <input className="table-input" placeholder="Ex: contact@client.com" type="email" required onChange={e => setNewClient({...newClient, email: e.target.value})} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Téléphone *</label>
              <input className="table-input" placeholder="Ex: +225 0700000000" required onChange={e => setNewClient({...newClient, phone: e.target.value})} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Adresse Géographique</label>
              <input className="table-input" placeholder="Ex: Abidjan, Cocody" onChange={e => setNewClient({...newClient, address: e.target.value})} />
            </div>
            
            {isDirector ? (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Commercial assigné</label>
                <select className="table-input" value={newClient.commercialId || ''} onChange={e => setNewClient({...newClient, commercialId: e.target.value})}>
                  <option value="">-- Assigner à un collaborateur --</option>
                  {commercials.map(c => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Créateur & Commercial</label>
                <div style={{ padding: '8px 12px', background: '#F1F5F9', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                  👤 {currentUser?.name} (Vous)
                </div>
              </div>
            )}

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
              <button type="submit" className="btn btn-primary">Enregistrer le client</button>
            </div>
          </form>
        </div>
      )}

      {/* ─── FORMULAIRE MODIFICATION CLIENT ─── */}
      {editingClient && (
        <div className="card" style={{ marginBottom: '24px', padding: '24px', borderLeft: '4px solid #F59E0B' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Modifier le client : {editingClient.name || editingClient.contact}</h3>
          <form onSubmit={handleSaveEdit} className="responsive-form-grid">
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Nom de l'entreprise</label>
              <input
                className="table-input"
                placeholder="Ex: HINOV SARL"
                value={editForm.name || ''}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Responsable / Contact *</label>
              <input
                className="table-input"
                placeholder="Ex: Jean Dupont"
                value={editForm.contact || ''}
                required
                onChange={e => setEditForm({ ...editForm, contact: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Adresse e-mail *</label>
              <input
                className="table-input"
                type="email"
                placeholder="Ex: contact@client.com"
                value={editForm.email || ''}
                required
                onChange={e => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Téléphone *</label>
              <input
                className="table-input"
                placeholder="Ex: +225 0700000000"
                value={editForm.phone || ''}
                required
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Adresse Géographique</label>
              <input
                className="table-input"
                placeholder="Ex: Abidjan, Cocody"
                value={editForm.address || ''}
                onChange={e => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Statut</label>
              <select
                className="table-input"
                value={editForm.status || 'Actif'}
                onChange={e => setEditForm({ ...editForm, status: e.target.value })}
              >
                <option value="Actif">Actif</option>
                <option value="Inactif">Inactif</option>
              </select>
            </div>

            {isDirector && (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Commercial assigné</label>
                <select
                  className="table-input"
                  value={editForm.commercialId || ''}
                  onChange={e => setEditForm({ ...editForm, commercialId: e.target.value })}
                >
                  <option value="">Aucun commercial</option>
                  {commercials.map(c => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
                </select>
              </div>
            )}

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingClient(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary">Sauvegarder les modifications</button>
            </div>
          </form>
        </div>
      )}

      {/* ─── TABLEAU DES CLIENTS ─── */}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table responsive-table">
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Responsable</th>
                <th>Email</th>
                <th>Téléphone</th>
                {isDirector && <th>Commercial en charge</th>}
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => {
                const commercialUser = users.find(u => u.id === client.commercialId);
                const canManage = isDirector || client.commercialId === currentUser?.id;

                return (
                  <tr key={client.id}>
                    <td data-label="Entreprise">
                      <strong>{client.name || client.company || '-'}</strong>
                    </td>
                    <td data-label="Responsable">{client.contact || '-'}</td>
                    <td data-label="Email">
                      {client.email ? (
                        <a href={`mailto:${client.email}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Mail size={13} /> {client.email}
                        </a>
                      ) : '-'}
                    </td>
                    <td data-label="Téléphone">
                      {client.phone ? (
                        <a href={`tel:${client.phone}`} style={{ color: 'var(--color-text)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={13} /> {client.phone}
                        </a>
                      ) : '-'}
                    </td>
                    {isDirector && (
                      <td data-label="Commercial">
                        {commercialUser ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--color-primary-tint)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700 }}>
                              {commercialUser.name.substring(0, 2).toUpperCase()}
                            </div>
                            {commercialUser.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Non assigné</span>
                        )}
                      </td>
                    )}
                    <td data-label="Statut">
                      <span className={`badge-status ${client.status === 'Actif' ? 'bg-success' : 'bg-error'}`}>
                        {client.status || 'Actif'}
                      </span>
                    </td>
                    <td data-label="Actions">
                      {canManage ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="icon-button" style={{ color: 'var(--color-primary)' }} title="Modifier le client" onClick={() => startEdit(client)}>
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="icon-button text-error"
                            title="Supprimer le client"
                            onClick={() => confirm({
                              title: 'Supprimer le client',
                              message: `Êtes-vous sûr de vouloir supprimer le client "${client.name || client.contact}" ?`,
                              confirmLabel: 'Supprimer',
                              onConfirm: () => {
                                deleteClient(client.id);
                                toast.success('Client supprimé');
                              }
                            })}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Lecture seule</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={isDirector ? 7 : 6} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                    {searchTerm || commercialFilter || statusFilter
                      ? 'Aucun client ne correspond à vos filtres.'
                      : (isDirector ? 'Aucun client enregistré dans la base.' : 'Vous n\'avez pas encore créé de client.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
