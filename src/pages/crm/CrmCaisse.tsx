import React, { useState, useMemo } from 'react';
import { Plus, Search, Trash2, ArrowUpRight, ArrowDownLeft, DollarSign, Wallet, Calendar, Filter, FileText } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../components/ConfirmModal';
import type { MouvementCaisse, TypeMouvementCaisse, ModeReglement } from '../../types/crmModules';

const CATEGORIES_SORTIES = [
  { value: 'ACHATS', label: 'Achats Fournisseurs' },
  { value: 'FRAIS_GENERAUX', label: 'Frais Généraux' },
  { value: 'LOYER', label: 'Loyer' },
  { value: 'CARBURANT', label: 'Carburant / Transport' },
  { value: 'ELECTRICITE_EAU', label: 'Électricité & Eau' },
  { value: 'SALAIRES', label: 'Salaires & Primes' },
  { value: 'COMMISSION', label: 'Commissions d\'affaires' },
  { value: 'TRANSPORT', label: 'Déplacements & Missions' },
  { value: 'MAINTENANCE', label: 'Entretien & Maintenance' },
  { value: 'RESTAURATION', label: 'Restauration' },
  { value: 'AUTRE', label: 'Autre Dépense' }
];

const CATEGORIES_ENTREES = [
  { value: 'PRESTATION', label: 'Prestations & Commandes' },
  { value: 'ACOMPTE_CLIENT', label: 'Acompte Client' },
  { value: 'APPART_CAPITAL', label: 'Apport en Caisse / Trésorerie' },
  { value: 'REMBOURSEMENT', label: 'Remboursement' },
  { value: 'AUTRE', label: 'Autre Recette' }
];

export function CrmCaisse() {
  const { crmCaisse, users, addCrmMouvementCaisse, deleteCrmMouvementCaisse } = useAppContext();
  const { currentUser: authUser } = useAuth();
  const currentUser = users.find(u => u.id === authUser?.id) || authUser;
  const isDirecteur = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');
  const { confirm } = useConfirm();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | TypeMouvementCaisse>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState<{
    type: TypeMouvementCaisse;
    categorie: string;
    montant: number;
    date_mouvement: string;
    mode_reglement: ModeReglement;
    motif: string;
    reference_piece: string;
  }>({
    type: 'SORTIE',
    categorie: 'ACHATS',
    montant: 0,
    date_mouvement: new Date().toISOString().split('T')[0],
    mode_reglement: 'ESPECES',
    motif: '',
    reference_piece: ''
  });

  // Scopage : direction = tout, autres = uniquement ses propres mouvements
  const ownCaisse = isDirecteur ? crmCaisse : crmCaisse.filter(m => (m as any).cree_par === currentUser?.id);

  const filteredMouvements = useMemo(() => {
    return ownCaisse.filter(m => {
      const matchesSearch =
        (m.motif || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.reference_piece || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.cree_par_nom || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === 'ALL' || m.type === typeFilter;
      const matchesCategory = categoryFilter === 'ALL' || m.categorie === categoryFilter;
      return matchesSearch && matchesType && matchesCategory;
    }).sort((a, b) => new Date(b.date_mouvement || b.created_at || '').getTime() - new Date(a.date_mouvement || a.created_at || '').getTime());
  }, [ownCaisse, searchTerm, typeFilter, categoryFilter]);

  // Financial Metrics — calculées sur le périmètre visible (ownCaisse), PAS sur le filtre
  // de recherche : une recherche ne doit jamais changer le solde affiché.
  const totalEntrees = ownCaisse.filter(m => m.type === 'ENTREE').reduce((sum, m) => sum + (m.montant || 0), 0);
  const totalSorties = ownCaisse.filter(m => m.type === 'SORTIE').reduce((sum, m) => sum + (m.montant || 0), 0);
  const soldeDisponible = totalEntrees - totalSorties;
  // Solde global réel (périmètre visible) utilisé pour le contrôle de provision
  const soldeGlobal = soldeDisponible;

  const handleOpenAdd = (defaultType: TypeMouvementCaisse = 'SORTIE') => {
    setFormData({
      type: defaultType,
      categorie: defaultType === 'SORTIE' ? 'ACHATS' : 'PRESTATION',
      montant: 0,
      date_mouvement: new Date().toISOString().split('T')[0],
      mode_reglement: 'ESPECES',
      motif: '',
      reference_piece: ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.motif?.trim() || formData.montant <= 0) {
      alert('Veuillez saisir un motif et un montant supérieur à 0.');
      return;
    }
    const todayStr = new Date().toISOString().split('T')[0];
    if (formData.date_mouvement > todayStr) {
      alert('La date du mouvement ne peut pas être dans le futur.');
      return;
    }
    // Provision : une sortie manuelle ne peut pas rendre la caisse négative
    if (formData.type === 'SORTIE' && Number(formData.montant) > soldeGlobal) {
      alert(`Provision insuffisante : solde disponible ${soldeGlobal.toLocaleString('fr-FR')} FCFA.`);
      return;
    }

    await addCrmMouvementCaisse({
      id: '',
      type: formData.type,
      categorie: formData.categorie,
      montant: Number(formData.montant),
      date_mouvement: formData.date_mouvement,
      mode_reglement: formData.mode_reglement,
      motif: formData.motif.trim(),
      reference_piece: formData.reference_piece.trim() || undefined,
      module_code: 'CAISSE_DEPENSES',
      cree_par: currentUser?.id,
      cree_par_nom: currentUser?.name
    });
    setShowModal(false);
  };

  const handleDelete = (m: MouvementCaisse) => {
    // Écritures système (encaissements / règlements auto) : suppression interdite,
    // elles sont la contrepartie d'une prestation ou commission — les modifier casserait la cohérence.
    if (m.module_code && m.module_code !== 'CAISSE_DEPENSES') {
      alert(`Écriture générée automatiquement (${m.module_code} — pièce ${m.reference_piece || '-'}) : suppression interdite pour préserver la cohérence avec la commande / commission liée.`);
      return;
    }
    confirm({
      title: 'Supprimer l\'écriture de caisse',
      message: `Êtes-vous sûr de vouloir supprimer ce mouvement de ${m.type === 'ENTREE' ? 'recette' : 'dépense'} (${m.montant.toLocaleString('fr-FR')} FCFA - ${m.motif}) ?`,
      confirmLabel: 'Supprimer',
      onConfirm: () => deleteMouvement(m.id)
    });
  };

  const deleteMouvement = async (id: string) => {
    const ok = await deleteCrmMouvementCaisse(id);
    if (!ok) {
      alert('Écriture générée automatiquement : suppression interdite pour préserver la cohérence avec la commande / commission liée.');
    }
  };

  const getCategoryLabel = (type: TypeMouvementCaisse, cat: string) => {
    const list = type === 'ENTREE' ? CATEGORIES_ENTREES : CATEGORIES_SORTIES;
    return list.find(c => c.value === cat)?.label || cat;
  };

  if (!isDirecteur && currentUser?.crmCaisseEnabled === false) {
    return (
      <div className="dashboard" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Wallet size={48} color="var(--color-error)" style={{ margin: '0 auto 16px' }} />
        <h2>Module Caisse non activé</h2>
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
          <h2>Journal de Caisse & Dépenses</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Suivi centralisé en temps réel des flux de trésorerie physique (encaissements et décaissements).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => handleOpenAdd('ENTREE')} style={{ color: '#10B981' }}>
            <ArrowDownLeft size={16} style={{ marginRight: '6px' }} /> Entrée Caisse
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenAdd('SORTIE')}>
            <Plus size={16} style={{ marginRight: '6px' }} /> Nouvelle Dépense
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px', borderLeft: '4px solid #10B981' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Total Recettes (Entrées)</span>
            <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
              <ArrowDownLeft size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10B981' }}>
            {totalEntrees.toLocaleString('fr-FR')} FCFA
          </div>
        </div>

        <div className="card" style={{ padding: '20px', borderLeft: '4px solid #EF4444' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Total Dépenses (Sorties)</span>
            <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#EF4444' }}>
            {totalSorties.toLocaleString('fr-FR')} FCFA
          </div>
        </div>

        <div className="card" style={{ padding: '20px', borderLeft: `4px solid ${soldeDisponible >= 0 ? '#2563EB' : '#EF4444'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Solde Caisse Disponible</span>
            <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(37, 99, 235, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
              <Wallet size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: soldeDisponible >= 0 ? '#2563EB' : '#EF4444' }}>
            {soldeDisponible.toLocaleString('fr-FR')} FCFA
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '12px 16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
          <Search size={18} color="var(--color-text-muted)" />
          <input
            type="text"
            placeholder="Rechercher par motif, réf. pièce, auteur..."
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            className="table-input"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            style={{ padding: '4px 8px', fontSize: '0.85rem', width: 'auto' }}
          >
            <option value="ALL">Tous les flux</option>
            <option value="ENTREE">Entrées uniquement</option>
            <option value="SORTIE">Sorties uniquement</option>
          </select>

          <select
            className="table-input"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ padding: '4px 8px', fontSize: '0.85rem', width: 'auto' }}
          >
            <option value="ALL">Toutes les catégories</option>
            <optgroup label="Sorties">
              {CATEGORIES_SORTIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </optgroup>
            <optgroup label="Entrées">
              {CATEGORIES_ENTREES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </optgroup>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table responsive-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Catégorie</th>
                <th>Motif & Pièce</th>
                <th>Règlement</th>
                <th>Enregistré par</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMouvements.map(m => (
                <tr key={m.id}>
                  <td data-label="Date">
                    <span style={{ fontSize: '0.85rem' }}>{m.date_mouvement || m.created_at?.split('T')[0]}</span>
                  </td>
                  <td data-label="Type">
                    {m.type === 'ENTREE' ? (
                      <span className="badge-status" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ArrowDownLeft size={12} /> Entrée
                      </span>
                    ) : (
                      <span className="badge-status" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ArrowUpRight size={12} /> Sortie
                      </span>
                    )}
                  </td>
                  <td data-label="Catégorie">
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                      {getCategoryLabel(m.type, m.categorie)}
                    </span>
                  </td>
                  <td data-label="Motif">
                    <div style={{ fontWeight: 600 }}>{m.motif}</div>
                    {m.reference_piece && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        <FileText size={10} /> Réf: {m.reference_piece}
                      </span>
                    )}
                  </td>
                  <td data-label="Règlement">
                    <span className="badge-status" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text)', fontSize: '11px' }}>
                      {m.mode_reglement}
                    </span>
                  </td>
                  <td data-label="Par">
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {m.cree_par_nom || 'N/A'}
                    </span>
                  </td>
                  <td data-label="Montant" style={{ textAlign: 'right' }}>
                    <strong style={{ fontSize: '0.95rem', color: m.type === 'ENTREE' ? '#10B981' : '#EF4444' }}>
                      {m.type === 'ENTREE' ? '+' : '-'} {(m.montant || 0).toLocaleString('fr-FR')} FCFA
                    </strong>
                  </td>
                  <td data-label="Actions">
                    <button className="icon-button text-error" title="Supprimer" onClick={() => handleDelete(m)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredMouvements.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                    Aucun mouvement de caisse enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ajout Mouvement */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', padding: '24px' }}>
            <h3 style={{ marginBottom: '16px' }}>
              {formData.type === 'ENTREE' ? 'Nouvelle Entrée en Caisse' : 'Nouveau Décaissement / Dépense'}
            </h3>
            <form onSubmit={handleSubmit} className="responsive-form-grid">
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Type de flux *</label>
                <select
                  className="table-input"
                  value={formData.type}
                  onChange={e => {
                    const newType = e.target.value as TypeMouvementCaisse;
                    setFormData({
                      ...formData,
                      type: newType,
                      categorie: newType === 'ENTREE' ? 'PRESTATION' : 'ACHATS'
                    });
                  }}
                  required
                >
                  <option value="SORTIE">Sortie (Décaissement)</option>
                  <option value="ENTREE">Entrée (Encaissement)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Catégorie *</label>
                <select
                  className="table-input"
                  value={formData.categorie}
                  onChange={e => setFormData({ ...formData, categorie: e.target.value })}
                  required
                >
                  {formData.type === 'ENTREE'
                    ? CATEGORIES_ENTREES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                    : CATEGORIES_SORTIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                  }
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Montant (FCFA) *</label>
                <input
                  type="number"
                  min="1"
                  className="table-input"
                  value={formData.montant || ''}
                  onChange={e => setFormData({ ...formData, montant: Number(e.target.value) })}
                  placeholder="Ex: 50000"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Date *</label>
                <input
                  type="date"
                  className="table-input"
                  value={formData.date_mouvement}
                  onChange={e => setFormData({ ...formData, date_mouvement: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Mode de règlement *</label>
                <select
                  className="table-input"
                  value={formData.mode_reglement}
                  onChange={e => setFormData({ ...formData, mode_reglement: e.target.value as ModeReglement })}
                  required
                >
                  <option value="ESPECES">Espèces</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="VIREMENT">Virement bancaire</option>
                  <option value="CHEQUE">Chèque</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>N° Pièce / Facture</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.reference_piece}
                  onChange={e => setFormData({ ...formData, reference_piece: e.target.value })}
                  placeholder="Ex: FACT-2026-004"
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Motif / Libellé explicite *</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.motif}
                  onChange={e => setFormData({ ...formData, motif: e.target.value })}
                  placeholder="Ex: Achat cartouches d'encre imprimante bureau"
                  required
                />
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Valider le Mouvement</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
