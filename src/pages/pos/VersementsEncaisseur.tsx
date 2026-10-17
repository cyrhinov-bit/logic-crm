import { useState, useEffect } from 'react';
import { Receipt, AlertTriangle, CheckCircle, Clock, User, Calendar, MessageSquare, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { getDossiersEncaisseur, declarerMontant, getDeclarationsDossier, getRecomptagesDossier } from '../../services/encaissement';
import type { DossierVersement, DeclarationVersement, RecomptageVersement } from '../../services/encaissement';

const STATUT_LABELS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  en_attente: { label: 'En attente', variant: 'neutral' },
  declare_caissier: { label: 'Déclaré par caissier', variant: 'info' },
  declare_encaisseur: { label: 'Déclaré par encaisseur', variant: 'info' },
  confirme: { label: 'Confirmé', variant: 'success' },
  a_recompter: { label: 'À recompter', variant: 'warning' },
  en_arbitrage: { label: 'En arbitrage', variant: 'danger' },
  confirme_apres_arbitrage: { label: 'Confirmé (arbitrage)', variant: 'success' },
  annule: { label: 'Annulé', variant: 'neutral' },
};

export default function VersementsEncaisseur() {
  const { currentUser } = useAuth();
  const [dossiers, setDossiers] = useState<DossierVersement[]>([]);
  const [dossierSelectionne, setDossierSelectionne] = useState<DossierVersement | null>(null);
  const [declarations, setDeclarations] = useState<DeclarationVersement[]>([]);
  const [recomptages, setRecomptages] = useState<RecomptageVersement[]>([]);
  const [montantSaisi, setMontantSaisi] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    chargerDossiers();
  }, [currentUser]);

  useEffect(() => {
    if (!dossierSelectionne) return;
    chargerDetailsDossier(dossierSelectionne.id);
  }, [dossierSelectionne]);

  const chargerDossiers = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const data = await getDossiersEncaisseur(currentUser.id);
      setDossiers(data);
      setDossierSelectionne(prev => {
        if (prev) {
          const fresh = data.find(d => d.id === prev.id);
          if (fresh) return fresh;
        }
        return data.length > 0 ? data[0] : null;
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const chargerDetailsDossier = async (dossierId: string) => {
    try {
      const [decls, recs] = await Promise.all([
        getDeclarationsDossier(dossierId),
        getRecomptagesDossier(dossierId),
      ]);
      setDeclarations(decls);
      setRecomptages(recs);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeclarerMontant = async () => {
    if (!dossierSelectionne || !currentUser) return;
    const montant = parseFloat(montantSaisi);
    if (isNaN(montant) || montant < 0) {
      setError('Veuillez saisir un montant valide');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Recomptage si le dossier est déjà en désaccord, sinon déclaration initiale
      const typeDeclaration: 'encaisseur_initial' | 'encaisseur_recompte' =
        dossierSelectionne.statut === 'a_recompter' ? 'encaisseur_recompte' : 'encaisseur_initial';

      await declarerMontant({
        dossier_id: dossierSelectionne.id,
        type_declaration: typeDeclaration,
        montant,
        commentaire: commentaire || undefined,
      });

      setMontantSaisi('');
      setCommentaire('');
      await chargerDossiers();
      if (dossierSelectionne) {
        await chargerDetailsDossier(dossierSelectionne.id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <p>Chargement des versements...</p>
      </div>
    );
  }

  const dossiersEnAttente = dossiers.filter(d => ['declare_caissier', 'a_recompter'].includes(d.statut));
  const dossiersDeclares = dossiers.filter(d => d.statut === 'declare_encaisseur');
  const dossiersTermines = dossiers.filter(d => ['confirme', 'confirme_apres_arbitrage', 'annule', 'en_arbitrage'].includes(d.statut));

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 8 }}>
        <Receipt size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
        Versements — Espace Encaisseur
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        Consultez les remises des caissiers et déclarez les montants réellement reçus.
      </p>

      {error && (
        <Card style={{ marginBottom: 16, padding: 12, borderColor: 'var(--color-danger)' }}>
          <p style={{ color: 'var(--color-danger)', margin: 0 }}>{error}</p>
        </Card>
      )}

      {/* Indicateurs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--color-warning)' }}>{dossiersEnAttente.length}</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Remises à traiter</div>
        </Card>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--color-success)' }}>{dossiers.filter(d => d.statut === 'confirme').length}</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Confirmés</div>
        </Card>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--color-danger)' }}>{dossiers.filter(d => d.statut === 'en_arbitrage').length}</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>En arbitrage</div>
        </Card>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--color-primary)' }}>
            {dossiers.filter(d => d.statut === 'confirme').reduce((sum, d) => sum + (d.montant_confirme || 0), 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Total confirmé (FCFA)</div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: dossierSelectionne ? '1fr 1fr' : '1fr', gap: 24 }}>
        {/* Liste des dossiers */}
        <div>
          <h2 style={{ marginBottom: 12, fontSize: 18 }}>Remises en attente</h2>
          {dossiersEnAttente.length === 0 ? (
            <Card style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              Aucune remise à traiter
            </Card>
          ) : (
            dossiersEnAttente.map(dossier => (
              <Card
                key={dossier.id}
                style={{
                  padding: 16,
                  marginBottom: 12,
                  cursor: 'pointer',
                  border: dossierSelectionne?.id === dossier.id ? '2px solid var(--color-primary)' : undefined,
                }}
                onClick={() => setDossierSelectionne(dossier)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{dossier.reference}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                      <Calendar size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      {new Date(dossier.date_versement).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <Badge variant={STATUT_LABELS[dossier.statut]?.variant || 'neutral'}>
                    {STATUT_LABELS[dossier.statut]?.label || dossier.statut}
                  </Badge>
                </div>
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 500 }}>
                  Montant attendu : {dossier.montant_attendu.toLocaleString()} FCFA
                </div>
              </Card>
            ))
          )}

          {dossiersDeclares.length > 0 && (
            <>
              <h2 style={{ marginBottom: 12, fontSize: 18, marginTop: 24 }}>En attente de confirmation</h2>
              {dossiersDeclares.map(dossier => (
                <Card
                  key={dossier.id}
                  style={{
                    padding: 16,
                    marginBottom: 12,
                    cursor: 'pointer',
                    opacity: 0.9,
                    border: dossierSelectionne?.id === dossier.id ? '2px solid var(--color-primary)' : undefined,
                  }}
                  onClick={() => setDossierSelectionne(dossier)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{dossier.reference}</div>
                      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        {new Date(dossier.date_versement).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    <Badge variant={STATUT_LABELS[dossier.statut]?.variant || 'neutral'}>
                      {STATUT_LABELS[dossier.statut]?.label || dossier.statut}
                    </Badge>
                  </div>
                </Card>
              ))}
            </>
          )}

          {dossiersTermines.length > 0 && (
            <>
              <h2 style={{ marginBottom: 12, fontSize: 18, marginTop: 24 }}>Historique</h2>
              {dossiersTermines.map(dossier => (
                <Card
                  key={dossier.id}
                  style={{
                    padding: 16,
                    marginBottom: 12,
                    cursor: 'pointer',
                    opacity: 0.8,
                    border: dossierSelectionne?.id === dossier.id ? '2px solid var(--color-primary)' : undefined,
                  }}
                  onClick={() => setDossierSelectionne(dossier)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{dossier.reference}</div>
                      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        {new Date(dossier.date_versement).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    <Badge variant={STATUT_LABELS[dossier.statut]?.variant || 'neutral'}>
                      {STATUT_LABELS[dossier.statut]?.label || dossier.statut}
                    </Badge>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>

        {/* Détail du dossier */}
        {dossierSelectionne && (
          <div>
            <h2 style={{ marginBottom: 12, fontSize: 18 }}>Détail de la remise</h2>
            <Card style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Référence</div>
                  <div style={{ fontWeight: 600 }}>{dossierSelectionne.reference}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Date</div>
                  <div style={{ fontWeight: 600 }}>{new Date(dossierSelectionne.date_versement).toLocaleDateString('fr-FR')}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Montant attendu</div>
                  <div style={{ fontWeight: 600 }}>{dossierSelectionne.montant_attendu.toLocaleString()} FCFA</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Statut</div>
                  <Badge variant={STATUT_LABELS[dossierSelectionne.statut]?.variant || 'neutral'}>
                    {STATUT_LABELS[dossierSelectionne.statut]?.label || dossierSelectionne.statut}
                  </Badge>
                </div>
              </div>

              {/* Déclarations */}
              {declarations.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 8 }}>Déclarations</h3>
                  {declarations.map(decl => (
                    <div key={decl.id} style={{ padding: 12, backgroundColor: 'var(--color-background-secondary)', borderRadius: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 14 }}>
                          {decl.type_declaration.includes('caissier') ? 'Caissier' : 'Encaisseur'}
                          {decl.type_declaration.includes('initial') ? ' (initial)' : ' (recomptage)'}
                        </span>
                        <span style={{ fontWeight: 600 }}>{decl.montant.toLocaleString()} FCFA</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {new Date(decl.date_declaration).toLocaleString('fr-FR')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Saisie du montant reçu */}
              {['declare_caissier', 'a_recompter'].includes(dossierSelectionne.statut) && (
                <div style={{ padding: 16, backgroundColor: 'var(--color-background-secondary)', borderRadius: 8 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 12 }}>
                    <CheckCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    Déclarer le montant reçu
                  </h3>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Montant reçu (FCFA)</label>
                    <input
                      type="number"
                      value={montantSaisi}
                      onChange={e => setMontantSaisi(e.target.value)}
                      placeholder="Saisissez le montant compté"
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 16 }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Commentaire (optionnel)</label>
                    <textarea
                      value={commentaire}
                      onChange={e => setCommentaire(e.target.value)}
                      placeholder="Précisions sur le comptage..."
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 14, minHeight: 60 }}
                    />
                  </div>
                  <Button
                    variant="primary"
                    onClick={handleDeclarerMontant}
                    disabled={busy || !montantSaisi}
                    icon={<Send size={16} />}
                  >
                    {busy ? 'Envoi en cours...' : 'Confirmer la réception'}
                  </Button>
                </div>
              )}

              {/* Message pour les dossiers en arbitrage */}
              {dossierSelectionne.statut === 'en_arbitrage' && (
                <div style={{ padding: 16, backgroundColor: 'var(--color-warning-light)', borderRadius: 8, marginTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={16} />
                    <strong>Ce dossier est en arbitrage</strong>
                  </div>
                  <p style={{ fontSize: 14, marginTop: 8, marginBottom: 0 }}>
                    La direction a été notifiée et prendra une décision prochainement.
                  </p>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
