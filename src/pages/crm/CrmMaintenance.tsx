import React, { useState } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Wrench, AlertTriangle, 
  CheckCircle, Clock, User, Building, Filter, Eye, 
  Users, Phone, Mail, Award, CheckCircle2, UserX, AlertCircle, X
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../components/ConfirmModal';
import type { 
  InterventionMaintenance, PrioriteIntervention, StatutIntervention,
  TechnicienMaintenance, StatutTechnicien
} from '../../types/crmModules';

export function CrmMaintenance() {
  const { 
    crmMaintenance, crmTechniciens, crmTiers, users, 
    addCrmIntervention, updateCrmIntervention, deleteCrmIntervention,
    addCrmTechnicien, updateCrmTechnicien, deleteCrmTechnicien
  } = useAppContext();
  const { currentUser: authUser } = useAuth();
  const currentUser = users.find(u => u.id === authUser?.id) || authUser;
  const { confirm } = useConfirm();

  const isDirecteur = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');

  // Navigation Tab
  const [activeTab, setActiveTab] = useState<'TICKETS' | 'TECHNICIENS'>('TICKETS');

  // Tickets Filter & Modal State
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [techFilter, setTechFilter] = useState('ALL');
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [editingIntervention, setEditingIntervention] = useState<InterventionMaintenance | null>(null);
  const [viewingIntervention, setViewingIntervention] = useState<InterventionMaintenance | null>(null);

  // Techniciens Filter & Modal State
  const [techSearchTerm, setTechSearchTerm] = useState('');
  const [techStatusFilter, setTechStatusFilter] = useState('ALL');
  const [showTechModal, setShowTechModal] = useState(false);
  const [editingTechnicien, setEditingTechnicien] = useState<TechnicienMaintenance | null>(null);

  // Form State - Ticket
  const [formData, setFormData] = useState<Partial<InterventionMaintenance>>({
    client_id: '',
    client_nom: '',
    site_agence: '',
    utilisateur_concerne: '',
    equipement: '',
    priorite: 'MOYENNE',
    observation: '',
    travaux: '',
    quantite: 1,
    prix_unitaire: 0,
    technicien_assigne: '',
    statut: 'NOUVEAU',
    date_intervention: new Date().toISOString().split('T')[0]
  });

  // Form State - Technicien
  const [techFormData, setTechFormData] = useState<Partial<TechnicienMaintenance>>({
    nom: '',
    telephone: '',
    email: '',
    specialite: 'Maintenance Générale',
    statut: 'DISPONIBLE'
  });

  const clientsList = crmTiers.filter(t => t.type === 'CLIENT');

  // Pre-defined specialties for auto-suggest
  const defaultSpecialties = [
    'Climatisation & Froid',
    'Informatique & Réseaux',
    'Électricité Bâtiment',
    'Électronique & Onduleurs',
    'Plomberie & Sanitaire',
    'Maintenance Générale',
    'Sécurité & Vidéosurveillance'
  ];

  const selectedTechObj = crmTechniciens.find(t => t.nom === formData.technicien_assigne);

  // ----------------------------------------------------
  // TICKETS LOGIC
  // ----------------------------------------------------
  const filteredInterventions = crmMaintenance.filter(m => {
    // Scopage : direction = tout, autres = uniquement ses propres tickets
    if (!isDirecteur && m.cree_par !== currentUser?.id) return false;
    const matchesSearch =
      (m.reference || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.equipement || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.site_agence || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.utilisateur_concerne || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.technicien_assigne || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === 'ALL' || m.priorite === priorityFilter;
    const matchesStatus = statusFilter === 'ALL' || m.statut === statusFilter;
    const matchesTech = techFilter === 'ALL' || m.technicien_assigne === techFilter;
    return matchesSearch && matchesPriority && matchesStatus && matchesTech;
  });

  const handleOpenAddTicket = () => {
    setEditingIntervention(null);
    const defaultTech = crmTechniciens.find(t => t.statut === 'DISPONIBLE')?.nom || crmTechniciens[0]?.nom || '';
    setFormData({
      client_id: '',
      client_nom: '',
      site_agence: '',
      utilisateur_concerne: '',
      equipement: '',
      priorite: 'MOYENNE',
      observation: '',
      travaux: '',
      quantite: 1,
      prix_unitaire: 0,
      technicien_assigne: defaultTech,
      statut: 'NOUVEAU',
      date_intervention: new Date().toISOString().split('T')[0]
    });
    setShowTicketModal(true);
  };

  const handleOpenEditTicket = (m: InterventionMaintenance) => {
    setEditingIntervention(m);
    setFormData({
      client_id: m.client_id || '',
      client_nom: m.client_nom || '',
      site_agence: m.site_agence,
      utilisateur_concerne: m.utilisateur_concerne,
      equipement: m.equipement,
      priorite: m.priorite,
      observation: m.observation,
      travaux: m.travaux,
      quantite: m.quantite || 1,
      prix_unitaire: m.prix_unitaire || 0,
      technicien_assigne: m.technicien_assigne,
      statut: m.statut,
      date_intervention: m.date_intervention || new Date().toISOString().split('T')[0]
    });
    setShowTicketModal(true);
  };

  const handleClientSelect = (clientId: string) => {
    const selected = clientsList.find(c => c.id === clientId);
    setFormData(prev => ({
      ...prev,
      client_id: clientId,
      client_nom: selected ? selected.nom : '',
      site_agence: selected?.ville || prev.site_agence
    }));
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.equipement?.trim() || !formData.site_agence?.trim() || !formData.technicien_assigne?.trim()) {
      alert('Veuillez renseigner le site, l\'équipement et le technicien assigné.');
      return;
    }

    const payload: InterventionMaintenance = {
      id: editingIntervention ? editingIntervention.id : '',
      reference: editingIntervention ? editingIntervention.reference : '',
      client_id: formData.client_id || undefined,
      client_nom: formData.client_nom || undefined,
      site_agence: formData.site_agence.trim(),
      utilisateur_concerne: formData.utilisateur_concerne?.trim() || 'N/A',
      equipement: formData.equipement.trim(),
      priorite: formData.priorite || 'MOYENNE',
      observation: formData.observation?.trim() || '',
      travaux: formData.travaux?.trim() || '',
      quantite: Number(formData.quantite) || 1,
      prix_unitaire: Number(formData.prix_unitaire) || 0,
      prix_total: (Number(formData.quantite) || 1) * (Number(formData.prix_unitaire) || 0),
      technicien_assigne: formData.technicien_assigne.trim(),
      statut: formData.statut || 'NOUVEAU',
      date_intervention: formData.date_intervention,
      cree_par: editingIntervention ? editingIntervention.cree_par : (currentUser?.id || ''),
      cree_par_nom: editingIntervention ? editingIntervention.cree_par_nom : currentUser?.name
    };

    if (editingIntervention) {
      await updateCrmIntervention(editingIntervention.id, payload);
    } else {
      await addCrmIntervention(payload);
    }
    setShowTicketModal(false);
  };

  const handleDeleteTicket = (m: InterventionMaintenance) => {
    confirm({
      title: 'Supprimer l\'intervention',
      message: `Êtes-vous sûr de vouloir supprimer le ticket ${m.reference} (${m.equipement}) ?`,
      confirmLabel: 'Supprimer',
      onConfirm: () => deleteCrmIntervention(m.id)
    });
  };

  // ----------------------------------------------------
  // TECHNICIENS LOGIC
  // ----------------------------------------------------
  const filteredTechniciens = crmTechniciens.filter(t => {
    const matchesSearch =
      (t.nom || '').toLowerCase().includes(techSearchTerm.toLowerCase()) ||
      (t.specialite || '').toLowerCase().includes(techSearchTerm.toLowerCase()) ||
      (t.telephone || '').toLowerCase().includes(techSearchTerm.toLowerCase()) ||
      (t.email || '').toLowerCase().includes(techSearchTerm.toLowerCase());
    const matchesStatus = techStatusFilter === 'ALL' || t.statut === techStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenAddTech = () => {
    setEditingTechnicien(null);
    setTechFormData({
      nom: '',
      telephone: '',
      email: '',
      specialite: 'Maintenance Générale',
      statut: 'DISPONIBLE'
    });
    setShowTechModal(true);
  };

  const handleOpenEditTech = (t: TechnicienMaintenance) => {
    setEditingTechnicien(t);
    setTechFormData({
      nom: t.nom,
      telephone: t.telephone || '',
      email: t.email || '',
      specialite: t.specialite || 'Maintenance Générale',
      statut: t.statut || 'DISPONIBLE'
    });
    setShowTechModal(true);
  };

  const handleSubmitTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!techFormData.nom?.trim()) {
      alert('Veuillez renseigner le nom du technicien.');
      return;
    }

    const techNom = techFormData.nom.trim();
    const payload: TechnicienMaintenance = {
      id: editingTechnicien ? editingTechnicien.id : '',
      nom: techNom,
      telephone: techFormData.telephone?.trim() || undefined,
      email: techFormData.email?.trim() || undefined,
      specialite: techFormData.specialite?.trim() || 'Maintenance Générale',
      statut: techFormData.statut || 'DISPONIBLE',
      cree_par: editingTechnicien ? editingTechnicien.cree_par : (currentUser?.id || ''),
      cree_par_nom: editingTechnicien ? editingTechnicien.cree_par_nom : currentUser?.name
    };

    if (editingTechnicien) {
      await updateCrmTechnicien(editingTechnicien.id, payload);
    } else {
      await addCrmTechnicien(payload);
      if (showTicketModal) {
        setFormData(prev => ({ ...prev, technicien_assigne: techNom }));
      }
    }
    setShowTechModal(false);
  };

  const handleDeleteTech = (t: TechnicienMaintenance) => {
    const assignedTicketsCount = crmMaintenance.filter(m => m.technicien_assigne === t.nom).length;
    // Intégrité (M3) : technicien avec tickets = suppression interdite (assignation par nom, pas de FK)
    if (assignedTicketsCount > 0) {
      alert(`Suppression impossible : ${t.nom} a ${assignedTicketsCount} ticket(s) assigné(s). Réassignez d'abord ses tickets.`);
      return;
    }
    confirm({
      title: 'Supprimer le technicien',
      message: `Êtes-vous sûr de vouloir supprimer le technicien ${t.nom} ?`,
      confirmLabel: 'Supprimer',
      onConfirm: () => { void deleteCrmTechnicien(t.id); }
    });
  };

  // Badges Helpers
  const getPriorityBadge = (p: PrioriteIntervention) => {
    switch (p) {
      case 'URGENTE':
        return <span className="badge-status" style={{ background: '#EF4444', color: '#FFF', fontWeight: 700 }}>🚨 Urgente</span>;
      case 'HAUTE':
        return <span className="badge-status" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#DC2626', fontWeight: 600 }}>Haute</span>;
      case 'MOYENNE':
        return <span className="badge-status" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#CA8A04' }}>Moyenne</span>;
      case 'BASSE':
        return <span className="badge-status" style={{ background: 'rgba(100, 116, 139, 0.12)', color: '#64748B' }}>Basse</span>;
    }
  };

  const getStatusBadge = (s: StatutIntervention) => {
    switch (s) {
      case 'NOUVEAU':
        return <span className="badge-status" style={{ background: 'rgba(37, 99, 235, 0.12)', color: '#2563EB' }}>Nouveau</span>;
      case 'EN_ATTENTE_PIECE':
        return <span className="badge-status" style={{ background: 'rgba(217, 119, 6, 0.12)', color: '#D97706' }}>Attente Pièce</span>;
      case 'EN_COURS':
        return <span className="badge-status" style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7C3AED' }}>En cours</span>;
      case 'TERMINE_A_FACTURER':
        return <span className="badge-status" style={{ background: 'rgba(13, 148, 136, 0.12)', color: '#0D9488' }}>Terminé (À Facturer)</span>;
      case 'CLOTURE':
        return <span className="badge-status bg-success">Clôturé</span>;
      case 'ANNULE':
        return <span className="badge-status bg-error">Annulé</span>;
      case 'EN_ATTENTE':
        return <span className="badge-status" style={{ background: 'rgba(217, 119, 6, 0.12)', color: '#D97706' }}>En attente (legacy)</span>;
      case 'TERMINEE':
        return <span className="badge-status" style={{ background: 'rgba(13, 148, 136, 0.12)', color: '#0D9488' }}>Terminée (legacy)</span>;
      case 'ANNULEE':
        return <span className="badge-status bg-error">Annulée (legacy)</span>;
      default:
        return <span className="badge-status" style={{ background: 'rgba(100, 116, 139, 0.12)', color: '#64748B' }}>{s}</span>;
    }
  };

  const getTechStatusBadge = (s: StatutTechnicien) => {
    switch (s) {
      case 'DISPONIBLE':
        return <span className="badge-status" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontWeight: 600 }}>🟢 Disponible</span>;
      case 'EN_INTERVENTION':
        return <span className="badge-status" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#2563EB', fontWeight: 600 }}>🛠️ En intervention</span>;
      case 'CONGE':
        return <span className="badge-status" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#D97706' }}>🏖️ En congé</span>;
      case 'INACTIF':
        return <span className="badge-status" style={{ background: 'rgba(100, 116, 139, 0.15)', color: '#64748B' }}>⚪ Inactif</span>;
    }
  };

  // KPIs - Tickets (périmètre visible scopé, jamais le global ; annulées exclues partout)
  const totalTickets = filteredInterventions.length;
  const enCoursCount = filteredInterventions.filter(m => ['NOUVEAU', 'EN_COURS', 'EN_ATTENTE_PIECE'].includes(m.statut)).length;
  const urgentesCount = filteredInterventions.filter(m => m.priorite === 'URGENTE' && m.statut !== 'CLOTURE').length;
  const totalFacturation = filteredInterventions.filter(m => m.statut !== 'ANNULE' && m.statut !== 'ANNULEE').reduce((sum, m) => sum + (m.prix_total || 0), 0);

  // KPIs - Techniciens
  const totalTechs = crmTechniciens.length;
  const disponiblesCount = crmTechniciens.filter(t => t.statut === 'DISPONIBLE').length;
  const enInterventionCount = crmTechniciens.filter(t => t.statut === 'EN_INTERVENTION').length;
  const indisponiblesCount = crmTechniciens.filter(t => ['CONGE', 'INACTIF'].includes(t.statut)).length;

  if (!isDirecteur && currentUser?.crmMaintenanceEnabled === false) {
    return (
      <div className="dashboard" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Wrench size={48} color="var(--color-error)" style={{ margin: '0 auto 16px' }} />
        <h2>Module Maintenance non activé</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Ce module n'est pas activé sur votre profil utilisateur. Veuillez contacter la Direction.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header & Sub-Tabs Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Maintenance & Interventions Techniques</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Gestion des tickets de panne, suivi du planning technique et affectation des techniciens.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {activeTab === 'TICKETS' ? (
            <button className="btn btn-primary" onClick={handleOpenAddTicket}>
              <Plus size={16} style={{ marginRight: '8px' }} /> Nouveau Ticket
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleOpenAddTech}>
              <Plus size={16} style={{ marginRight: '8px' }} /> Nouveau Technicien
            </button>
          )}
        </div>
      </div>

      {/* Modern Sub-Tab Navigation Bar */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('TICKETS')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'TICKETS' ? '3px solid var(--color-primary)' : '3px solid transparent',
            color: activeTab === 'TICKETS' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontWeight: activeTab === 'TICKETS' ? 700 : 500,
            fontSize: '0.95rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <Wrench size={18} />
          <span>Tickets d'Intervention</span>
          <span style={{
            fontSize: '0.75rem',
            padding: '2px 8px',
            borderRadius: '12px',
            background: activeTab === 'TICKETS' ? 'rgba(37, 99, 235, 0.15)' : 'var(--color-surface-alt)',
            color: activeTab === 'TICKETS' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontWeight: 700
          }}>
            {totalTickets}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('TECHNICIENS')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'TECHNICIENS' ? '3px solid var(--color-primary)' : '3px solid transparent',
            color: activeTab === 'TECHNICIENS' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontWeight: activeTab === 'TECHNICIENS' ? 700 : 500,
            fontSize: '0.95rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <Users size={18} />
          <span>Gestion des Techniciens</span>
          <span style={{
            fontSize: '0.75rem',
            padding: '2px 8px',
            borderRadius: '12px',
            background: activeTab === 'TECHNICIENS' ? 'rgba(37, 99, 235, 0.15)' : 'var(--color-surface-alt)',
            color: activeTab === 'TECHNICIENS' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontWeight: 700
          }}>
            {totalTechs}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* VUE 1 : TICKETS D'INTERVENTION */}
      {/* ========================================================================= */}
      {activeTab === 'TICKETS' && (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Total Interventions</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{totalTickets}</div>
            </div>
            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #2563EB' }}>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>En cours de traitement</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#2563EB' }}>{enCoursCount}</div>
            </div>
            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #EF4444' }}>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Interventions Urgentes</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#EF4444' }}>{urgentesCount}</div>
            </div>
            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #10B981' }}>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Facturation Technique</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10B981' }}>
                {totalFacturation.toLocaleString('fr-FR')} FCFA
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="card" style={{ marginBottom: '20px', padding: '12px 16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
              <Search size={18} color="var(--color-text-muted)" />
              <input
                type="text"
                placeholder="Rechercher par référence, équipement, lieu, technicien..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '0.9rem',
                  color: 'var(--color-text)'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                className="table-input"
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
                style={{ padding: '4px 8px', fontSize: '0.85rem', width: 'auto' }}
              >
                <option value="ALL">Toutes les priorités</option>
                <option value="URGENTE">🚨 Urgente</option>
                <option value="HAUTE">Haute</option>
                <option value="MOYENNE">Moyenne</option>
                <option value="BASSE">Basse</option>
              </select>

              <select
                className="table-input"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: '4px 8px', fontSize: '0.85rem', width: 'auto' }}
              >
                <option value="ALL">Tous les statuts</option>
                <option value="NOUVEAU">Nouveau</option>
                <option value="EN_ATTENTE_PIECE">En attente pièce</option>
                <option value="EN_COURS">En cours</option>
                <option value="TERMINE_A_FACTURER">Terminé à facturer</option>
                <option value="CLOTURE">Clôturé</option>
                <option value="ANNULE">Annulé</option>
                <option value="EN_ATTENTE">En attente (legacy)</option>
                <option value="TERMINEE">Terminée (legacy)</option>
                <option value="ANNULEE">Annulée (legacy)</option>
              </select>

              <select
                className="table-input"
                value={techFilter}
                onChange={e => setTechFilter(e.target.value)}
                style={{ padding: '4px 8px', fontSize: '0.85rem', width: 'auto' }}
              >
                <option value="ALL">Tous les techniciens</option>
                {crmTechniciens.map(t => (
                  <option key={t.id} value={t.nom}>{t.nom}</option>
                ))}
              </select>

              {techFilter !== 'ALL' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setTechFilter('ALL')}
                  style={{ padding: '4px 8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <X size={12} /> Réinitialiser filtre
                </button>
              )}
            </div>
          </div>

          {/* Tickets Table */}
          <div className="card">
            <div className="table-responsive">
              <table className="data-table responsive-table">
                <thead>
                  <tr>
                    <th>Réf. & Date</th>
                    <th>Site / Lieu</th>
                    <th>Équipement</th>
                    <th>Priorité</th>
                    <th>Technicien Assigné</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'right' }}>Montant Facturé</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInterventions.map(m => (
                    <tr key={m.id}>
                      <td data-label="Réf. & Date">
                        <strong style={{ color: 'var(--color-primary)' }}>{m.reference}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{m.date_intervention || m.created_at?.split('T')[0]}</div>
                      </td>
                      <td data-label="Site">
                        <strong>{m.site_agence}</strong>
                        {m.client_nom && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{m.client_nom}</div>}
                      </td>
                      <td data-label="Équipement">
                        <div>{m.equipement}</div>
                        {m.utilisateur_concerne && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Demandeur: {m.utilisateur_concerne}</div>
                        )}
                      </td>
                      <td data-label="Priorité">{getPriorityBadge(m.priorite)}</td>
                      <td data-label="Technicien Assigné">
                        <button
                          type="button"
                          onClick={() => setTechFilter(m.technicien_assigne)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '4px',
                            color: 'var(--color-text)', textDecoration: 'underline decoration-dotted'
                          }}
                          title="Filtrer par ce technicien"
                        >
                          <User size={13} color="var(--color-primary)" /> {m.technicien_assigne}
                        </button>
                      </td>
                      <td data-label="Statut">{getStatusBadge(m.statut)}</td>
                      <td data-label="Montant" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {(m.prix_total || 0).toLocaleString('fr-FR')} FCFA
                      </td>
                      <td data-label="Actions">
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="icon-button" title="Voir diagnostic et détails" onClick={() => setViewingIntervention(m)}>
                            <Eye size={14} />
                          </button>
                          <button className="icon-button" title="Modifier" onClick={() => handleOpenEditTicket(m)} style={{ color: 'var(--color-primary)' }}>
                            <Edit2 size={14} />
                          </button>
                          <button className="icon-button text-error" title="Supprimer" onClick={() => handleDeleteTicket(m)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredInterventions.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                        Aucune intervention enregistrée.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* VUE 2 : GESTION DES TECHNICIENS */}
      {/* ========================================================================= */}
      {activeTab === 'TECHNICIENS' && (
        <>
          {/* Techniciens KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Total Techniciens</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{totalTechs}</div>
            </div>
            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #10B981' }}>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Disponibles</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10B981' }}>{disponiblesCount}</div>
            </div>
            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #2563EB' }}>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>En Intervention</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#2563EB' }}>{enInterventionCount}</div>
            </div>
            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #F59E0B' }}>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>En Congé / Inactifs</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F59E0B' }}>{indisponiblesCount}</div>
            </div>
          </div>

          {/* Techniciens Filters */}
          <div className="card" style={{ marginBottom: '20px', padding: '12px 16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
              <Search size={18} color="var(--color-text-muted)" />
              <input
                type="text"
                placeholder="Rechercher un technicien par nom, spécialité, contact..."
                value={techSearchTerm}
                onChange={e => setTechSearchTerm(e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '0.9rem',
                  color: 'var(--color-text)'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                className="table-input"
                value={techStatusFilter}
                onChange={e => setTechStatusFilter(e.target.value)}
                style={{ padding: '4px 8px', fontSize: '0.85rem', width: 'auto' }}
              >
                <option value="ALL">Tous les statuts</option>
                <option value="DISPONIBLE">🟢 Disponible</option>
                <option value="EN_INTERVENTION">🛠️ En intervention</option>
                <option value="CONGE">🏖️ En congé</option>
                <option value="INACTIF">⚪ Inactif</option>
              </select>
            </div>
          </div>

          {/* Techniciens Table */}
          <div className="card">
            <div className="table-responsive">
              <table className="data-table responsive-table">
                <thead>
                  <tr>
                    <th>Technicien</th>
                    <th>Spécialité</th>
                    <th>Coordonnées</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'center' }}>Tickets Assignés</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTechniciens.map(t => {
                    const activeTickets = crmMaintenance.filter(m => 
                      m.technicien_assigne === t.nom && ['NOUVEAU', 'EN_COURS', 'EN_ATTENTE_PIECE'].includes(m.statut)
                    ).length;
                    const totalAssigned = crmMaintenance.filter(m => m.technicien_assigne === t.nom).length;

                    return (
                      <tr key={t.id}>
                        <td data-label="Technicien">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '36px', height: '36px', borderRadius: '50%',
                              background: 'var(--color-primary)', color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 700, fontSize: '0.9rem'
                            }}>
                              {t.nom.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <strong>{t.nom}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                Ajouté le {t.created_at?.split('T')[0]}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td data-label="Spécialité">
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '4px 10px', borderRadius: '16px',
                            background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)',
                            fontSize: '0.85rem', fontWeight: 600
                          }}>
                            <Award size={13} /> {t.specialite || 'Maintenance Générale'}
                          </span>
                        </td>
                        <td data-label="Coordonnées">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.85rem' }}>
                            {t.telephone && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <Phone size={13} color="var(--color-text-muted)" /> {t.telephone}
                              </span>
                            )}
                            {t.email && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)' }}>
                                <Mail size={13} /> {t.email}
                              </span>
                            )}
                            {!t.telephone && !t.email && <span style={{ color: 'var(--color-text-muted)' }}>N/A</span>}
                          </div>
                        </td>
                        <td data-label="Statut">
                          {getTechStatusBadge(t.statut)}
                        </td>
                        <td data-label="Tickets Assignés" style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setTechFilter(t.nom);
                              setActiveTab('TICKETS');
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0
                            }}
                            title={`Voir les tickets de ${t.nom}`}
                          >
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              background: activeTickets > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: activeTickets > 0 ? '#DC2626' : '#059669',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              transition: 'transform 0.1s ease'
                            }}>
                              {activeTickets} en cours ({totalAssigned} total)
                            </span>
                          </button>
                        </td>
                        <td data-label="Actions">
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="icon-button" title="Modifier le technicien" onClick={() => handleOpenEditTech(t)} style={{ color: 'var(--color-primary)' }}>
                              <Edit2 size={14} />
                            </button>
                            <button className="icon-button text-error" title="Supprimer le technicien" onClick={() => handleDeleteTech(t)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTechniciens.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                        Aucun technicien répertorié. Cliquez sur "Nouveau Technicien" pour en ajouter un.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL : TICKET D'INTERVENTION */}
      {/* ========================================================================= */}
      {showTicketModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px', overflowY: 'auto'
        }}>
          <div className="card" style={{ maxWidth: '680px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>
                {editingIntervention ? `Modifier le Ticket ${editingIntervention.reference}` : 'Nouveau Ticket d\'Intervention'}
              </h3>
              <button 
                className="icon-button" 
                onClick={() => setShowTicketModal(false)}
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitTicket} className="responsive-form-grid">
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Client (Optionnel)</label>
                <select
                  className="table-input"
                  value={formData.client_id}
                  onChange={e => handleClientSelect(e.target.value)}
                >
                  <option value="">Sélectionner un client</option>
                  {clientsList.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Site / Lieu de l'intervention *</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.site_agence || ''}
                  onChange={e => setFormData({ ...formData, site_agence: e.target.value })}
                  placeholder="Ex: Siège Plateau, Agence Yopougon"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Équipement concerné *</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.equipement || ''}
                  onChange={e => setFormData({ ...formData, equipement: e.target.value })}
                  placeholder="Ex: Climatiseur Split 2CV, Baie serveur"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Demandeur / Utilisateur</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.utilisateur_concerne || ''}
                  onChange={e => setFormData({ ...formData, utilisateur_concerne: e.target.value })}
                  placeholder="Ex: M. Koné (Chef d'agence)"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Priorité</label>
                <select
                  className="table-input"
                  value={formData.priorite}
                  onChange={e => setFormData({ ...formData, priorite: e.target.value as PrioriteIntervention })}
                >
                  <option value="BASSE">Basse</option>
                  <option value="MOYENNE">Moyenne</option>
                  <option value="HAUTE">Haute</option>
                  <option value="URGENTE">🚨 Urgente</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Statut</label>
                <select
                  className="table-input"
                  value={formData.statut}
                  onChange={e => setFormData({ ...formData, statut: e.target.value as StatutIntervention })}
                >
                  <option value="NOUVEAU">Nouveau</option>
                  <option value="EN_ATTENTE_PIECE">En attente pièce</option>
                  <option value="EN_COURS">En cours</option>
                  <option value="TERMINE_A_FACTURER">Terminé à facturer</option>
                  <option value="CLOTURE">Clôturé</option>
                  <option value="ANNULE">Annulé</option>
                  {['EN_ATTENTE', 'TERMINEE', 'ANNULEE'].includes(formData.statut || '') && (
                    <option value={formData.statut}>{formData.statut} (legacy — modifiez pour migrer)</option>
                  )}
                </select>
              </div>

              {/* Sélection du Technicien avec options groupées et création rapide */}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                    Technicien assigné *
                  </label>
                  <button
                    type="button"
                    onClick={handleOpenAddTech}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.8rem', color: 'var(--color-primary)',
                      display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, padding: 0
                    }}
                  >
                    <Plus size={14} /> Ajouter un technicien
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    className="table-input"
                    value={formData.technicien_assigne || ''}
                    onChange={e => setFormData({ ...formData, technicien_assigne: e.target.value })}
                    required
                    style={{ flex: 1 }}
                  >
                    <option value="">-- Sélectionner un technicien --</option>
                    {crmTechniciens.map(t => (
                      <option key={t.id} value={t.nom}>
                        {t.nom} — {t.specialite || 'Général'} ({t.statut === 'DISPONIBLE' ? '🟢 Disponible' : t.statut === 'EN_INTERVENTION' ? '🛠️ En intervention' : t.statut === 'CONGE' ? '🏖️ En congé' : '⚪ Inactif'})
                      </option>
                    ))}
                    {formData.technicien_assigne && 
                     !crmTechniciens.some(t => t.nom === formData.technicien_assigne) && (
                      <option value={formData.technicien_assigne}>
                        {formData.technicien_assigne} (Ancien enregistrement)
                      </option>
                    )}
                  </select>
                </div>

                {crmTechniciens.length === 0 && (
                  <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '6px', background: 'rgba(234, 179, 8, 0.12)', color: '#B45309', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span>⚠️ Aucun technicien n'est enregistré. Veuillez en créer un dans <strong>Gestion des Techniciens</strong>.</span>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleOpenAddTech}
                      style={{ padding: '4px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                    >
                      <Plus size={14} style={{ marginRight: '4px' }} /> Créer maintenant
                    </button>
                  </div>
                )}

                {selectedTechObj && (
                  <div style={{
                    marginTop: '8px', padding: '8px 12px', borderRadius: '6px',
                    background: 'var(--color-surface-alt)', display: 'flex',
                    flexWrap: 'wrap', gap: '14px', alignItems: 'center', fontSize: '0.8rem'
                  }}>
                    <span>Spécialité : <strong style={{ color: 'var(--color-primary)' }}>{selectedTechObj.specialite || 'Maintenance Générale'}</strong></span>
                    {selectedTechObj.telephone && <span>Tél : <strong>{selectedTechObj.telephone}</strong></span>}
                    {selectedTechObj.email && <span>Email : <strong>{selectedTechObj.email}</strong></span>}
                    <span>Disponibilité : {getTechStatusBadge(selectedTechObj.statut)}</span>
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Date intervention</label>
                <input
                  type="date"
                  className="table-input"
                  value={formData.date_intervention || ''}
                  onChange={e => setFormData({ ...formData, date_intervention: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Quantité (Forfaits / Unités)</label>
                <input
                  type="number"
                  min="1"
                  className="table-input"
                  value={formData.quantite || 1}
                  onChange={e => setFormData({ ...formData, quantite: Number(e.target.value) })}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Prix Unitaire Facturé (FCFA)</label>
                <input
                  type="number"
                  min="0"
                  className="table-input"
                  value={formData.prix_unitaire || 0}
                  onChange={e => setFormData({ ...formData, prix_unitaire: Number(e.target.value) })}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Diagnostic & Observation</label>
                <textarea
                  className="table-input"
                  rows={2}
                  value={formData.observation || ''}
                  onChange={e => setFormData({ ...formData, observation: e.target.value })}
                  placeholder="Diagnostic de la panne observée..."
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Travaux réalisés / Pièces changées</label>
                <textarea
                  className="table-input"
                  rows={2}
                  value={formData.travaux || ''}
                  onChange={e => setFormData({ ...formData, travaux: e.target.value })}
                  placeholder="Détail des actions correctives et pièces de rechange installées..."
                />
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowTicketModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">
                  {editingIntervention ? 'Enregistrer' : 'Créer le Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL : NOUVEAU / MODIFIER TECHNICIEN */}
      {/* ========================================================================= */}
      {showTechModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, padding: '16px', overflowY: 'auto'
        }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>
                {editingTechnicien ? `Modifier le Technicien ${editingTechnicien.nom}` : 'Nouveau Technicien de Maintenance'}
              </h3>
              <button 
                className="icon-button" 
                onClick={() => setShowTechModal(false)}
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitTech} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Nom complet *</label>
                <input
                  type="text"
                  className="table-input"
                  value={techFormData.nom || ''}
                  onChange={e => setTechFormData({ ...techFormData, nom: e.target.value })}
                  placeholder="Ex: Kouamé Jean-Baptiste"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Spécialité / Métier</label>
                <input
                  type="text"
                  list="specialties-list"
                  className="table-input"
                  value={techFormData.specialite || ''}
                  onChange={e => setTechFormData({ ...techFormData, specialite: e.target.value })}
                  placeholder="Ex: Climatisation & Froid, Informatique..."
                />
                <datalist id="specialties-list">
                  {defaultSpecialties.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Téléphone</label>
                  <input
                    type="tel"
                    className="table-input"
                    value={techFormData.telephone || ''}
                    onChange={e => setTechFormData({ ...techFormData, telephone: e.target.value })}
                    placeholder="+225 07..."
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Email</label>
                  <input
                    type="email"
                    className="table-input"
                    value={techFormData.email || ''}
                    onChange={e => setTechFormData({ ...techFormData, email: e.target.value })}
                    placeholder="technicien@hinov.ci"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Statut de disponibilité</label>
                <select
                  className="table-input"
                  value={techFormData.statut}
                  onChange={e => setTechFormData({ ...techFormData, statut: e.target.value as StatutTechnicien })}
                >
                  <option value="DISPONIBLE">🟢 Disponible pour interventions</option>
                  <option value="EN_INTERVENTION">🛠️ En intervention sur site</option>
                  <option value="CONGE">🏖️ En congé / Absence</option>
                  <option value="INACTIF">⚪ Inactif / Désactivé</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowTechModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">
                  {editingTechnicien ? 'Enregistrer les modifications' : 'Créer le technicien'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL : CONSULTATION DÉTAILS TICKET */}
      {/* ========================================================================= */}
      {viewingIntervention && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '560px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0 }}>Ticket {viewingIntervention.reference}</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Lieu : {viewingIntervention.site_agence}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {getPriorityBadge(viewingIntervention.priorite)}
                {getStatusBadge(viewingIntervention.statut)}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.9rem', marginBottom: '16px' }}>
              <div><strong>Équipement :</strong> {viewingIntervention.equipement}</div>
              <div><strong>Demandeur :</strong> {viewingIntervention.utilisateur_concerne}</div>
              <div><strong>Technicien :</strong> {viewingIntervention.technicien_assigne}</div>
              <div><strong>Montant Total :</strong> <strong style={{ color: 'var(--color-primary)' }}>{(viewingIntervention.prix_total || 0).toLocaleString('fr-FR')} FCFA</strong></div>
            </div>

            {viewingIntervention.observation && (
              <div style={{ marginBottom: '12px', padding: '10px', borderRadius: '6px', background: 'var(--color-surface-alt)', fontSize: '0.85rem' }}>
                <strong>Observation / Diagnostic :</strong>
                <p style={{ margin: '4px 0 0' }}>{viewingIntervention.observation}</p>
              </div>
            )}

            {viewingIntervention.travaux && (
              <div style={{ marginBottom: '16px', padding: '10px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.08)', fontSize: '0.85rem' }}>
                <strong style={{ color: '#065F46' }}>Travaux réalisés & Pièces :</strong>
                <p style={{ margin: '4px 0 0', color: '#065F46' }}>{viewingIntervention.travaux}</p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={() => setViewingIntervention(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
