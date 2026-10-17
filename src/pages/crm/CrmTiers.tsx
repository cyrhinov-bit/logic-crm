import React, { useState } from 'react';
import { Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, Building2, User, UserCheck, Filter } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../components/ConfirmModal';
import type { ClientFournisseur, TypeTier } from '../../types/crmModules';

export function CrmTiers() {
  const { crmTiers, users, addCrmTier, updateCrmTier, deleteCrmTier } = useAppContext();
  const { currentUser: authUser } = useAuth();
  const currentUser = users.find(u => u.id === authUser?.id) || authUser;
  const { confirm } = useConfirm();

  const [activeTab, setActiveTab] = useState<TypeTier | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTier, setEditingTier] = useState<ClientFournisseur | null>(null);

  const [formData, setFormData] = useState<Partial<ClientFournisseur>>({
    type: 'CLIENT',
    nom: '',
    telephone: '',
    email: '',
    adresse: '',
    ville: ''
  });

  // Cloisonnement : un simple user ne voit que les tiers qu'il a créés, admin/directeur voit tout
  const isAdmin = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');
  const filteredTiers = crmTiers.filter(t => {
    const matchesPermission = isAdmin || t.cree_par === currentUser?.id;
    const matchesTab = activeTab === 'ALL' || t.type === activeTab;
    const matchesSearch =
      (t.nom || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.telephone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.ville || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesPermission && matchesTab && matchesSearch;
  });

  const handleOpenAdd = () => {
    setEditingTier(null);
    setFormData({
      type: activeTab === 'ALL' ? 'CLIENT' : activeTab,
      nom: '',
      telephone: '',
      email: '',
      adresse: '',
      ville: ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (tier: ClientFournisseur) => {
    setEditingTier(tier);
    setFormData({
      type: tier.type,
      nom: tier.nom,
      telephone: tier.telephone || '',
      email: tier.email || '',
      adresse: tier.adresse || '',
      ville: tier.ville || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom?.trim()) {
      alert('Veuillez saisir un nom valide.');
      return;
    }

    if (editingTier) {
      await updateCrmTier(editingTier.id, formData);
    } else {
      await addCrmTier({
        id: '',
        type: formData.type || 'CLIENT',
        nom: formData.nom.trim(),
        telephone: formData.telephone?.trim(),
        email: formData.email?.trim(),
        adresse: formData.adresse?.trim(),
        ville: formData.ville?.trim(),
        cree_par: currentUser?.id,
        cree_par_nom: currentUser?.name
      });
    }
    setShowModal(false);
  };

  const handleDelete = (tier: ClientFournisseur) => {
    confirm({
      title: 'Supprimer le tiers',
      message: `Êtes-vous sûr de vouloir supprimer ${tier.nom} (${tier.type}) ?`,
      confirmLabel: 'Supprimer',
      onConfirm: () => deleteTier(tier.id)
    });
  };

  const deleteTier = async (id: string) => {
    const ok = await deleteCrmTier(id);
    if (!ok) {
      alert('Suppression impossible : ce tiers est rattaché à des commandes, interventions ou articles en stock.');
    }
  };

  const counts = {
    all: crmTiers.filter(t => isAdmin || t.cree_par === currentUser?.id).length,
    client: crmTiers.filter(t => (isAdmin || t.cree_par === currentUser?.id) && t.type === 'CLIENT').length,
    fournisseur: crmTiers.filter(t => (isAdmin || t.cree_par === currentUser?.id) && t.type === 'FOURNISSEUR').length,
    partenaire: crmTiers.filter(t => (isAdmin || t.cree_par === currentUser?.id) && t.type === 'PARTENAIRE').length
  };

  const getTypeBadge = (type: TypeTier) => {
    switch (type) {
      case 'CLIENT':
        return <span className="badge-status" style={{ background: 'rgba(37, 99, 235, 0.12)', color: '#2563EB' }}>Client</span>;
      case 'FOURNISSEUR':
        return <span className="badge-status" style={{ background: 'rgba(217, 119, 6, 0.12)', color: '#D97706' }}>Fournisseur</span>;
      case 'PARTENAIRE':
        return <span className="badge-status" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}>Partenaire (Apporteur)</span>;
      default:
        return <span className="badge-status">{type}</span>;
    }
  };

  if (!isAdmin && currentUser?.crmTiersEnabled === false) {
    return (
      <div className="dashboard" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Building2 size={48} color="var(--color-error)" style={{ margin: '0 auto 16px' }} />
        <h2>Module Tiers non activé</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Ce module n'est pas activé sur votre profil utilisateur. Veuillez contacter la Direction.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>Clients, Fournisseurs & Partenaires</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Annuaire centralisé des tiers et apporteurs d'affaires pour les prestations CRM.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenAdd}>
          <Plus size={16} style={{ marginRight: '8px' }} /> Nouveau Tiers
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('ALL')}
          className={`btn ${activeTab === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.85rem', padding: '6px 14px' }}
        >
          Tous ({counts.all})
        </button>
        <button
          onClick={() => setActiveTab('CLIENT')}
          className={`btn ${activeTab === 'CLIENT' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.85rem', padding: '6px 14px' }}
        >
          Clients ({counts.client})
        </button>
        <button
          onClick={() => setActiveTab('FOURNISSEUR')}
          className={`btn ${activeTab === 'FOURNISSEUR' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.85rem', padding: '6px 14px' }}
        >
          Fournisseurs ({counts.fournisseur})
        </button>
        <button
          onClick={() => setActiveTab('PARTENAIRE')}
          className={`btn ${activeTab === 'PARTENAIRE' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.85rem', padding: '6px 14px' }}
        >
          Partenaires / Apporteurs ({counts.partenaire})
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Search size={18} color="var(--color-text-muted)" />
          <input
            type="text"
            placeholder="Rechercher par nom, téléphone, email, ville..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '0.95rem',
              color: 'var(--color-text)'
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table responsive-table">
            <thead>
              <tr>
                <th>Nom & Type</th>
                <th>Type</th>
                <th>Téléphone</th>
                <th>Email</th>
                <th>Adresse / Ville</th>
                <th>Créé par</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTiers.map(tier => (
                <tr key={tier.id}>
                  <td data-label="Nom">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '8px',
                        background: 'var(--color-surface-alt)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--color-primary)', border: '1px solid var(--color-border)'
                      }}>
                        {tier.type === 'CLIENT' && <User size={18} />}
                        {tier.type === 'FOURNISSEUR' && <Building2 size={18} />}
                        {tier.type === 'PARTENAIRE' && <UserCheck size={18} />}
                      </div>
                      <div>
                        <strong>{tier.nom}</strong>
                      </div>
                    </div>
                  </td>
                  <td data-label="Type">{getTypeBadge(tier.type)}</td>
                  <td data-label="Téléphone">
                    {tier.telephone ? (
                      <a href={`tel:${tier.telephone}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={13} /> {tier.telephone}
                      </a>
                    ) : '-'}
                  </td>
                  <td data-label="Email">
                    {tier.email ? (
                      <a href={`mailto:${tier.email}`} style={{ color: 'var(--color-text)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Mail size={13} /> {tier.email}
                      </a>
                    ) : '-'}
                  </td>
                  <td data-label="Adresse / Ville">
                    {tier.adresse || tier.ville ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={13} color="var(--color-text-muted)" />
                        {[tier.adresse, tier.ville].filter(Boolean).join(', ')}
                      </span>
                    ) : '-'}
                  </td>
                  <td data-label="Créé par">
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      {tier.cree_par_nom || 'Système'}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="icon-button" title="Modifier" onClick={() => handleOpenEdit(tier)} style={{ color: 'var(--color-primary)' }}>
                        <Edit2 size={15} />
                      </button>
                      <button className="icon-button text-error" title="Supprimer" onClick={() => handleDelete(tier)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTiers.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                    Aucun tiers trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ajout / Modification */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '540px', width: '100%', padding: '24px' }}>
            <h3 style={{ marginBottom: '16px' }}>
              {editingTier ? 'Modifier le Tiers' : 'Nouveau Tiers'}
            </h3>
            <form onSubmit={handleSubmit} className="responsive-form-grid">
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Type de tiers *</label>
                <select
                  className="table-input"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value as TypeTier })}
                  required
                >
                  <option value="CLIENT">Client</option>
                  <option value="FOURNISSEUR">Fournisseur</option>
                  <option value="PARTENAIRE">Partenaire (Apporteur d'affaires)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Nom complet / Société *</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.nom || ''}
                  onChange={e => setFormData({ ...formData, nom: e.target.value })}
                  placeholder="Ex: Société ABC ou M. Yao"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Téléphone</label>
                <input
                  type="tel"
                  className="table-input"
                  value={formData.telephone || ''}
                  onChange={e => setFormData({ ...formData, telephone: e.target.value })}
                  placeholder="+225 07 00 00 00 00"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Email</label>
                <input
                  type="email"
                  className="table-input"
                  value={formData.email || ''}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@exemple.com"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Adresse</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.adresse || ''}
                  onChange={e => setFormData({ ...formData, adresse: e.target.value })}
                  placeholder="Rue, Quartier"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Ville</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.ville || ''}
                  onChange={e => setFormData({ ...formData, ville: e.target.value })}
                  placeholder="Ex: Abidjan"
                />
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">{editingTier ? 'Sauvegarder' : 'Créer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
