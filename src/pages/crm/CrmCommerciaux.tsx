import React, { useState } from 'react';
import { Plus, Search, Edit2, Trash2, Phone, Mail, Award, TrendingUp, DollarSign, CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../components/ConfirmModal';
import type { AgentCommercial } from '../../types/crmModules';

export function CrmCommerciaux() {
  const { crmCommerciaux, users, addCrmCommercial, updateCrmCommercial, deleteCrmCommercial } = useAppContext();
  const { currentUser: authUser } = useAuth();
  const currentUser = users.find(u => u.id === authUser?.id) || authUser;
  const isDirecteur = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');
  const { confirm } = useConfirm();

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentCommercial | null>(null);

  const [formData, setFormData] = useState<Partial<AgentCommercial>>({
    nom: '',
    telephone: '',
    email: '',
    taux_commission_defaut: 5
  });

  const filteredAgents = crmCommerciaux.filter(a =>
    (a.nom || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.telephone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenAdd = () => {
    setEditingAgent(null);
    setFormData({
      nom: '',
      telephone: '',
      email: '',
      taux_commission_defaut: 5
    });
    setShowModal(true);
  };

  const handleOpenEdit = (agent: AgentCommercial) => {
    setEditingAgent(agent);
    setFormData({
      nom: agent.nom,
      telephone: agent.telephone || '',
      email: agent.email || '',
      taux_commission_defaut: agent.taux_commission_defaut || 0
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom?.trim()) {
      alert('Veuillez saisir un nom.');
      return;
    }

    if (editingAgent) {
      await updateCrmCommercial(editingAgent.id, formData);
    } else {
      await addCrmCommercial({
        id: '',
        nom: formData.nom.trim(),
        telephone: formData.telephone?.trim(),
        email: formData.email?.trim(),
        taux_commission_defaut: Number(formData.taux_commission_defaut) || 0,
        total_ventes: 0,
        contrats_clos_count: 0,
        cree_par: currentUser?.id,
        cree_par_nom: currentUser?.name
      });
    }
    setShowModal(false);
  };

  const handleDelete = (agent: AgentCommercial) => {
    confirm({
      title: 'Supprimer le commercial',
      message: `Êtes-vous sûr de vouloir supprimer ${agent.nom} ?`,
      confirmLabel: 'Supprimer',
      onConfirm: () => deleteAgent(agent.id)
    });
  };

  const deleteAgent = async (id: string) => {
    const ok = await deleteCrmCommercial(id);
    if (!ok) {
      alert("Suppression impossible : ce commercial est rattaché à des commandes ou possède un historique de ventes.");
    }
  };

  const totalVentesGlobal = crmCommerciaux.reduce((sum, a) => sum + (a.total_ventes || 0), 0);
  const totalContratsGlobal = crmCommerciaux.reduce((sum, a) => sum + (a.contrats_clos_count || 0), 0);

  if (!isDirecteur && currentUser?.crmCommerciauxEnabled === false) {
    return (
      <div className="dashboard" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Award size={48} color="var(--color-error)" style={{ margin: '0 auto 16px' }} />
        <h2>Module Commerciaux non activé</h2>
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
          <h2>Agents Commerciaux</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Gestion des fiches commerciales, taux de commission par défaut et suivi du volume d'affaires négocié.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenAdd}>
          <Plus size={16} style={{ marginRight: '8px' }} /> Nouvel Agent
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '12px', background: 'rgba(37, 99, 235, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
            <Award size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Agents Actifs</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text)' }}>{crmCommerciaux.length}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '12px', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Total Ventes Négociées</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text)' }}>
              {totalVentesGlobal.toLocaleString('fr-FR')} FCFA
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '12px', background: 'rgba(124, 58, 237, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED' }}>
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Contrats Clos</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text)' }}>
              {totalContratsGlobal} affaire(s)
            </div>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Search size={18} color="var(--color-text-muted)" />
          <input
            type="text"
            placeholder="Rechercher un commercial par nom, téléphone, email..."
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
                <th>Nom du Commercial</th>
                <th>Téléphone</th>
                <th>Email</th>
                <th>Taux Comm. Défaut</th>
                <th>Contrats Clos</th>
                <th>Total Ventes Négociées</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map(agent => (
                <tr key={agent.id}>
                  <td data-label="Nom">
                    <strong>{agent.nom}</strong>
                  </td>
                  <td data-label="Téléphone">
                    {agent.telephone ? (
                      <a href={`tel:${agent.telephone}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={13} /> {agent.telephone}
                      </a>
                    ) : '-'}
                  </td>
                  <td data-label="Email">
                    {agent.email ? (
                      <a href={`mailto:${agent.email}`} style={{ color: 'var(--color-text)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Mail size={13} /> {agent.email}
                      </a>
                    ) : '-'}
                  </td>
                  <td data-label="Taux">
                    <span className="badge-status" style={{ background: 'rgba(37, 99, 235, 0.12)', color: '#2563EB', fontWeight: 600 }}>
                      {agent.taux_commission_defaut || 0} %
                    </span>
                  </td>
                  <td data-label="Contrats">{agent.contrats_clos_count || 0}</td>
                  <td data-label="Ventes">
                    <strong style={{ color: 'var(--color-primary)' }}>
                      {(agent.total_ventes || 0).toLocaleString('fr-FR')} FCFA
                    </strong>
                  </td>
                  <td data-label="Actions">
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="icon-button" title="Modifier" onClick={() => handleOpenEdit(agent)} style={{ color: 'var(--color-primary)' }}>
                        <Edit2 size={15} />
                      </button>
                      <button className="icon-button text-error" title="Supprimer" onClick={() => handleDelete(agent)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAgents.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                    Aucun agent commercial enregistré.
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
          <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '24px' }}>
            <h3 style={{ marginBottom: '16px' }}>
              {editingAgent ? 'Modifier l\'Agent Commercial' : 'Nouvel Agent Commercial'}
            </h3>
            <form onSubmit={handleSubmit} className="responsive-form-grid">
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Nom complet *</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.nom || ''}
                  onChange={e => setFormData({ ...formData, nom: e.target.value })}
                  placeholder="Ex: Jean Kouassi"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Taux de commission par défaut (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  className="table-input"
                  value={formData.taux_commission_defaut ?? 5}
                  onChange={e => setFormData({ ...formData, taux_commission_defaut: Number(e.target.value) })}
                  placeholder="5"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Téléphone</label>
                <input
                  type="tel"
                  className="table-input"
                  value={formData.telephone || ''}
                  onChange={e => setFormData({ ...formData, telephone: e.target.value })}
                  placeholder="+225 05 00 00 00 00"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Email</label>
                <input
                  type="email"
                  className="table-input"
                  value={formData.email || ''}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="commercial@hinov.com"
                />
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">{editingAgent ? 'Sauvegarder' : 'Créer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
