import { useState, useEffect, useCallback } from 'react';
import { Receipt, AlertTriangle, CheckCircle, Clock, Users, TrendingUp, Search, Filter, UserPlus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  getDossiersFiltres,
  arbitrer,
  annulerDossier,
  getDeclarationsDossier,
  getRecomptagesDossier,
  getLitigesDossier,
  getAllAffectations,
  creerAffectation,
  setAffectationActive,
  getFrequences,
  upsertFrequence,
  deleteFrequence,
} from '../../services/encaissement';
import type { DossierVersement, DeclarationVersement, RecomptageVersement, LitigeVersement, FrequenceVersement, TypeFrequence } from '../../services/encaissement';

const STATUT_LABELS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  en_attente: { label: 'En attente', variant: 'neutral' },
  declare_caissier: { label: 'Déclaré caissier', variant: 'info' },
  declare_encaisseur: { label: 'Déclaré encaisseur', variant: 'info' },
  confirme: { label: 'Confirmé', variant: 'success' },
  a_recompter: { label: 'À recompter', variant: 'warning' },
  en_arbitrage: { label: 'En arbitrage', variant: 'danger' },
  confirme_apres_arbitrage: { label: 'Confirmé (arbitrage)', variant: 'success' },
  annule: { label: 'Annulé', variant: 'neutral' },
};

const TYPES_FREQUENCE_LABELS: Record<string, string> = {
  quotidienne: 'Quotidienne',
  n_jours: 'Tous les N jours',
  hebdomadaire: 'Hebdomadaire',
  bihebdomadaire: 'Bimensuelle',
  mensuelle: 'Mensuelle',
  personnalisee: 'Personnalisée',
};

export default function VersementsAdmin() {
  const { currentUser } = useAuth();
  const { users } = useAppContext();
  const [dossiers, setDossiers] = useState<DossierVersement[]>([]);
  const [affectations, setAffectations] = useState<any[]>([]);
  const [frequences, setFrequences] = useState<FrequenceVersement[]>([]);
  const [dossierSelectionne, setDossierSelectionne] = useState<DossierVersement | null>(null);
  const [declarations, setDeclarations] = useState<DeclarationVersement[]>([]);
  const [recomptages, setRecomptages] = useState<RecomptageVersement[]>([]);
  const [litiges, setLitiges] = useState<LitigeVersement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArbitrage, setShowArbitrage] = useState(false);
  const [montantArbitrage, setMontantArbitrage] = useState('');
  const [motifArbitrage, setMotifArbitrage] = useState('');
  const [decision, setDecision] = useState<'montant_caissier' | 'montant_encaisseur' | 'montant_retenu' | 'annulation'>('montant_retenu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtreSearch, setFiltreSearch] = useState('');

  // Annulation via modale (window.prompt n'existe pas dans Electron)
  const [annulationCible, setAnnulationCible] = useState<DossierVersement | null>(null);
  const [motifAnnulation, setMotifAnnulation] = useState('');

  // Nouvelle affectation caissier ↔ encaisseur
  const [affCaissier, setAffCaissier] = useState('');
  const [affEncaisseur, setAffEncaisseur] = useState('');

  // Nouvelle fréquence
  const [showFreqForm, setShowFreqForm] = useState(false);
  const [freqType, setFreqType] = useState<TypeFrequence>('quotidienne');
  const [freqN, setFreqN] = useState('1');
  const [freqCaissier, setFreqCaissier] = useState('');

  const caissiers = users.filter(u => (u.role === 'Caissier' || u.role === 'Gerant') && u.active !== false);
  const encaisseurs = users.filter(u => u.role === 'Encaisseur' && u.active !== false);
  const userName = (id?: string) => (id ? (users.find(u => u.id === id)?.name || id.substring(0, 8)) : '—');

  const chargerDonnees = useCallback(async () => {
    setLoading(true);
    try {
      const [dos, aff, freqs] = await Promise.all([
        getDossiersFiltres(filtreStatut ? { statut: filtreStatut as any } : undefined),
        getAllAffectations(),
        getFrequences(),
      ]);
      setDossiers(dos);
      setAffectations(aff);
      setFrequences(freqs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filtreStatut]);

  useEffect(() => {
    chargerDonnees();
  }, [chargerDonnees]);

  // Rafraîchir l'objet sélectionné après un rechargement de la liste
  // (sinon le détail affiche un statut périmé après une action)
  useEffect(() => {
    if (!dossierSelectionne) return;
    const fresh = dossiers.find(d => d.id === dossierSelectionne.id);
    if (fresh && fresh !== dossierSelectionne) setDossierSelectionne(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossiers]);

  useEffect(() => {
    if (!dossierSelectionne) return;
    chargerDetailsDossier(dossierSelectionne.id);
  }, [dossierSelectionne]);

  const chargerDetailsDossier = async (dossierId: string) => {
    try {
      const [decls, recs, lits] = await Promise.all([
        getDeclarationsDossier(dossierId),
        getRecomptagesDossier(dossierId),
        getLitigesDossier(dossierId),
      ]);
      setDeclarations(decls);
      setRecomptages(recs);
      setLitiges(lits);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleArbitrer = async () => {
    if (!dossierSelectionne) return;
    const montant = parseFloat(montantArbitrage);
    if (isNaN(montant) || montant < 0) {
      setError('Veuillez saisir un montant valide');
      return;
    }
    if (!motifArbitrage.trim()) {
      setError('Veuillez saisir un motif');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await arbitrer({
        dossier_id: dossierSelectionne.id,
        montant_retenu: montant,
        motif: motifArbitrage,
        decision,
      });
      setSuccess('Arbitrage enregistré avec succès');
      setShowArbitrage(false);
      setMontantArbitrage('');
      setMotifArbitrage('');
      await chargerDonnees();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAnnuler = async () => {
    if (!annulationCible) return;
    if (!motifAnnulation.trim()) {
      setError('Veuillez saisir un motif d\'annulation');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await annulerDossier({ dossier_id: annulationCible.id, motif: motifAnnulation });
      setSuccess('Dossier annulé avec succès');
      setAnnulationCible(null);
      setMotifAnnulation('');
      await chargerDonnees();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreerAffectation = async () => {
    if (!affCaissier || !affEncaisseur) {
      setError('Sélectionnez un caissier et un encaisseur');
      return;
    }
    if (affCaissier === affEncaisseur) {
      setError('Le caissier et l\'encaisseur doivent être différents');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await creerAffectation({ caissier_id: affCaissier, encaisseur_id: affEncaisseur });
      setSuccess('Affectation enregistrée');
      setAffCaissier('');
      setAffEncaisseur('');
      await chargerDonnees();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAffectation = async (id: string, actif: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setAffectationActive(id, actif);
      await chargerDonnees();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveFrequence = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await upsertFrequence({
        caissier_id: freqCaissier || undefined,
        frequence_type: freqType,
        frequence_n: freqType === 'n_jours' ? Number(freqN) : undefined,
      });
      setSuccess('Fréquence enregistrée');
      setShowFreqForm(false);
      setFreqCaissier('');
      await chargerDonnees();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFrequence = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteFrequence(id);
      await chargerDonnees();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dossiersFiltres = dossiers.filter(d => {
    if (filtreSearch) {
      const search = filtreSearch.toLowerCase();
      return (
        d.reference.toLowerCase().includes(search) ||
        d.caissier_id.toLowerCase().includes(search) ||
        d.encaisseur_id.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Statistiques
  const stats = {
    total: dossiers.length,
    enAttente: dossiers.filter(d => d.statut === 'en_attente').length,
    confirme: dossiers.filter(d => ['confirme', 'confirme_apres_arbitrage'].includes(d.statut)).length,
    aRecompter: dossiers.filter(d => d.statut === 'a_recompter').length,
    enArbitrage: dossiers.filter(d => d.statut === 'en_arbitrage').length,
    montantTotal: dossiers.filter(d => ['confirme', 'confirme_apres_arbitrage'].includes(d.statut)).reduce((s, d) => s + (d.montant_confirme || 0), 0),
  };

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Chargement...</div>;
  }

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>
        <Receipt size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
        Administration des Versements
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        Supervisez tous les versements, les écarts et les litiges
      </p>

      {error && <Card style={{ marginBottom: 16, padding: 12, borderColor: '#EF4444' }}><p style={{ color: '#EF4444', margin: 0 }}>{error}</p></Card>}
      {success && <Card style={{ marginBottom: 16, padding: 12, borderColor: '#10B981' }}><p style={{ color: '#10B981', margin: 0 }}>{success}</p></Card>}

      {/* Statistiques */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold' }}>{stats.total}</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Total dossiers</div>
        </Card>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#F59E0B' }}>{stats.enAttente}</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>En attente</div>
        </Card>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#10B981' }}>{stats.confirme}</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Confirmés</div>
        </Card>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#F97316' }}>{stats.aRecompter}</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>À recompter</div>
        </Card>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#EF4444' }}>{stats.enArbitrage}</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>En arbitrage</div>
        </Card>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#2563EB' }}>{stats.montantTotal.toLocaleString()}</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Total confirmé (FCFA)</div>
        </Card>
      </div>

      {/* Filtres */}
      <Card style={{ marginBottom: 24, padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Rechercher..."
              value={filtreSearch}
              onChange={e => setFiltreSearch(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #E2E8F0', minWidth: 200 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={16} />
            <select
              value={filtreStatut}
              onChange={e => setFiltreStatut(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #E2E8F0' }}
            >
              <option value="">Tous les statuts</option>
              {Object.entries(STATUT_LABELS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {annulationCible && (
        <Card style={{ marginBottom: 24, padding: 20, border: '2px solid #EF4444' }}>
          <h3 style={{ marginTop: 0 }}>Annuler le dossier {annulationCible.reference}</h3>
          <p style={{ fontSize: 14, color: '#64748B', marginTop: 0 }}>
            Cette action est définitive. Indiquez le motif d'annulation.
          </p>
          <textarea
            value={motifAnnulation}
            onChange={e => setMotifAnnulation(e.target.value)}
            placeholder="Motif de l'annulation"
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E2E8F0', minHeight: 70, marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <Button variant="danger" onClick={handleAnnuler} disabled={busy}>
              {busy ? 'Annulation...' : 'Confirmer l\'annulation'}
            </Button>
            <Button variant="outline" onClick={() => { setAnnulationCible(null); setMotifAnnulation(''); }}>
              Retour
            </Button>
          </div>
        </Card>
      )}

      {/* Affectations caissier ↔ encaisseur */}
      <Card style={{ marginBottom: 24, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Users size={16} />
          <h2 style={{ fontSize: 16, margin: 0 }}>Affectations caissier ↔ encaisseur</h2>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Caissier</label>
            <select value={affCaissier} onChange={e => setAffCaissier(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #E2E8F0', minWidth: 180 }}>
              <option value="">-- Sélectionner --</option>
              {caissiers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Encaisseur</label>
            <select value={affEncaisseur} onChange={e => setAffEncaisseur(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #E2E8F0', minWidth: 180 }}>
              <option value="">-- Sélectionner --</option>
              {encaisseurs.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <Button variant="primary" onClick={handleCreerAffectation} disabled={busy} icon={<UserPlus size={16} />}>
            Affecter
          </Button>
        </div>
        {affectations.length === 0 ? (
          <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>Aucune affectation configurée.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {affectations.map(aff => (
              <div key={aff.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8, fontSize: 14, gap: 8, flexWrap: 'wrap' }}>
                <span>{userName(aff.caissier_id)} → {userName(aff.encaisseur_id)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge variant={aff.actif ? 'success' : 'neutral'}>{aff.actif ? 'Active' : 'Inactive'}</Badge>
                  <Button variant="outline" onClick={() => handleToggleAffectation(aff.id, !aff.actif)} disabled={busy}>
                    {aff.actif ? 'Désactiver' : 'Activer'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Fréquences de versement */}
      <Card style={{ marginBottom: 24, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} />
            <h2 style={{ fontSize: 16, margin: 0 }}>Fréquences de versement</h2>
          </div>
          <Button variant="outline" onClick={() => setShowFreqForm(v => !v)}>
            {showFreqForm ? 'Fermer' : 'Nouvelle fréquence'}
          </Button>
        </div>
        {showFreqForm && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 8 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Caissier (vide = général)</label>
              <select value={freqCaissier} onChange={e => setFreqCaissier(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #E2E8F0', minWidth: 180 }}>
                <option value="">Tous (général)</option>
                {caissiers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Type</label>
              <select value={freqType} onChange={e => setFreqType(e.target.value as TypeFrequence)} style={{ padding: 8, borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <option value="quotidienne">Quotidienne</option>
                <option value="n_jours">Tous les N jours</option>
                <option value="hebdomadaire">Hebdomadaire</option>
                <option value="bihebdomadaire">Bimensuelle</option>
                <option value="mensuelle">Mensuelle</option>
              </select>
            </div>
            {freqType === 'n_jours' && (
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>N jours</label>
                <input type="number" min={1} value={freqN} onChange={e => setFreqN(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #E2E8F0', width: 100 }} />
              </div>
            )}
            <Button variant="primary" onClick={handleSaveFrequence} disabled={busy}>Enregistrer</Button>
          </div>
        )}
        {frequences.length === 0 ? (
          <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>Aucune fréquence configurée (quotidienne par défaut).</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {frequences.map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8, fontSize: 14, gap: 8, flexWrap: 'wrap' }}>
                <span>
                  <strong>{f.caissier_id ? userName(f.caissier_id) : 'Tous (général)'}</strong> — {TYPES_FREQUENCE_LABELS[f.frequence_type] || f.frequence_type}
                  {f.frequence_type === 'n_jours' && f.frequence_n ? ` (${f.frequence_n} j)` : ''}
                </span>
                <Button variant="outline" onClick={() => handleDeleteFrequence(f.id)} disabled={busy} icon={<Trash2 size={14} />}>
                  Supprimer
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: dossierSelectionne ? '1fr 1fr' : '1fr', gap: 24 }}>
        {/* Liste des dossiers */}
        <div>
          <h2 style={{ marginBottom: 12, fontSize: 18 }}>Tous les dossiers</h2>
          {dossiersFiltres.length === 0 ? (
            <Card style={{ padding: 24, textAlign: 'center', color: '#64748B' }}>
              Aucun dossier trouvé
            </Card>
          ) : (
            dossiersFiltres.map(dossier => (
              <Card
                key={dossier.id}
                style={{
                  padding: 16,
                  marginBottom: 12,
                  cursor: 'pointer',
                  border: dossierSelectionne?.id === dossier.id ? '2px solid #2563EB' : undefined,
                }}
                onClick={() => setDossierSelectionne(dossier)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>{dossier.reference}</div>
                  <Badge variant={STATUT_LABELS[dossier.statut]?.variant || 'neutral'}>
                    {STATUT_LABELS[dossier.statut]?.label || dossier.statut}
                  </Badge>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 13 }}>
                  <div>
                    <div style={{ color: '#64748B' }}>Attendu</div>
                    <strong>{dossier.montant_attendu.toLocaleString()}</strong>
                  </div>
                  <div>
                    <div style={{ color: '#64748B' }}>Caissier</div>
                    <strong>{dossier.montant_declare_caissier?.toLocaleString() || '—'}</strong>
                  </div>
                  <div>
                    <div style={{ color: '#64748B' }}>Encaisseur</div>
                    <strong>{dossier.montant_declare_encaisseur?.toLocaleString() || '—'}</strong>
                  </div>
                  <div>
                    <div style={{ color: '#64748B' }}>Confirmé</div>
                    <strong>{dossier.montant_confirme?.toLocaleString() || '—'}</strong>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>
                  {new Date(dossier.date_versement).toLocaleDateString('fr-FR')}
                  {dossier.nombre_recomptages > 0 && ` — ${dossier.nombre_recomptages} recomptage(s)`}
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Détail */}
        {dossierSelectionne && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 18, margin: 0 }}>Détail</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                {dossierSelectionne.statut === 'en_arbitrage' && (
                  <Button variant="warning" onClick={() => setShowArbitrage(true)}>
                    Arbitrer
                  </Button>
                )}
                {['en_attente', 'declare_caissier', 'declare_encaisseur', 'a_recompter'].includes(dossierSelectionne.statut) && (
                  <Button variant="danger" onClick={() => { setAnnulationCible(dossierSelectionne); setMotifAnnulation(''); }}>
                    Annuler
                  </Button>
                )}
              </div>
            </div>

            <Card style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>Référence</div>
                  <div style={{ fontWeight: 600 }}>{dossierSelectionne.reference}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>Date</div>
                  <div style={{ fontWeight: 600 }}>{new Date(dossierSelectionne.date_versement).toLocaleDateString('fr-FR')}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>Caissier</div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{userName(dossierSelectionne.caissier_id)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>Encaisseur</div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{userName(dossierSelectionne.encaisseur_id)}</div>
                </div>
              </div>

              {/* Déclarations */}
              {declarations.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 8 }}>Déclarations</h3>
                  {declarations.map(decl => (
                    <div key={decl.id} style={{ padding: 12, backgroundColor: '#F8FAFC', borderRadius: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 14 }}>
                          {decl.type_declaration.includes('caissier') ? 'Caissier' : 'Encaisseur'}
                          {decl.type_declaration.includes('initial') ? ' (initial)' : ' (recomptage)'}
                        </span>
                        <span style={{ fontWeight: 600 }}>{decl.montant.toLocaleString()} FCFA</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>
                        {new Date(decl.date_declaration).toLocaleString('fr-FR')}
                        {decl.commentaire && ` — ${decl.commentaire}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recomptages */}
              {recomptages.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 8 }}>Recomptages</h3>
                  {recomptages.map((rec: RecomptageVersement) => (
                    <div key={rec.id} style={{ padding: 12, backgroundColor: '#F8FAFC', borderRadius: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Écart : <strong>{rec.ecart.toLocaleString()}</strong></span>
                        <Badge variant={rec.statut === 'accorde' ? 'success' : 'danger'}>
                          {rec.statut === 'accorde' ? 'Accordé' : 'Désaccord'}
                        </Badge>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>
                        Caissier: {rec.caissier_montant.toLocaleString()} — Encaisseur: {rec.encaisseur_montant.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Litiges */}
              {litiges.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 16, marginBottom: 8 }}>Litiges</h3>
                  {litiges.map((lit: LitigeVersement) => (
                    <div key={lit.id} style={{ padding: 12, backgroundColor: '#FEF2F2', borderRadius: 8, marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{lit.motif}</div>
                      {lit.montant_retenu && <div>Montant retenu : <strong>{lit.montant_retenu.toLocaleString()} FCFA</strong></div>}
                      {lit.ecart_restant && <div>Écart restant : <strong>{lit.ecart_restant.toLocaleString()} FCFA</strong></div>}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Modal arbitrage */}
            {showArbitrage && (
              <Card style={{ marginTop: 16, padding: 20, border: '2px solid #F59E0B' }}>
                <h3 style={{ marginTop: 0 }}>Arbitrage</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Décision</label>
                  <select value={decision} onChange={e => setDecision(e.target.value as any)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E2E8F0' }}>
                    <option value="montant_retenu">Montant retenu (personnalisé)</option>
                    <option value="montant_caissier">Montant du caissier</option>
                    <option value="montant_encaisseur">Montant de l'encaisseur</option>
                    <option value="annulation">Annulation du dossier</option>
                  </select>
                </div>
                {decision !== 'annulation' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Montant retenu (FCFA)</label>
                    <input
                      type="number"
                      value={montantArbitrage}
                      onChange={e => setMontantArbitrage(e.target.value)}
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E2E8F0' }}
                    />
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Motif *</label>
                  <textarea
                    value={motifArbitrage}
                    onChange={e => setMotifArbitrage(e.target.value)}
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E2E8F0', minHeight: 80 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Button variant="primary" onClick={handleArbitrer} disabled={busy}>
                    {busy ? 'Enregistrement...' : 'Enregistrer l\'arbitrage'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowArbitrage(false)}>
                    Annuler
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
