import { useState, useEffect } from 'react';
import { Receipt, AlertTriangle, CheckCircle, Clock, Send, TrendingUp, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  getDossiersCaissier,
  creerDossier,
  declarerMontant,
  getEcheancesCaissier,
  getAffectationsCaissier,
} from '../../services/encaissement';
import type { DossierVersement } from '../../services/encaissement';
import { toLocalDayKey } from '../../lib/dates';
import { useAppContext } from '../../context/AppContext';

const STATUT_LABELS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  en_attente: { label: 'En attente', variant: 'neutral' },
  declare_caissier: { label: 'Déclaré', variant: 'info' },
  declare_encaisseur: { label: 'Réception en attente', variant: 'info' },
  confirme: { label: 'Confirmé', variant: 'success' },
  a_recompter: { label: 'À recompter', variant: 'warning' },
  en_arbitrage: { label: 'En arbitrage', variant: 'danger' },
  confirme_apres_arbitrage: { label: 'Confirmé (arbitrage)', variant: 'success' },
  annule: { label: 'Annulé', variant: 'neutral' },
};

export default function VersementsCaissier() {
  const { currentUser } = useAuth();
  const { users } = useAppContext();
  const [dossiers, setDossiers] = useState<DossierVersement[]>([]);
  const [echeances, setEcheances] = useState<any[]>([]);
  const [affectations, setAffectations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Formulaire de création
  const [encaisseurId, setEncaisseurId] = useState('');
  const [montant, setMontant] = useState('');

  // Recompter un dossier (montants divergents)
  const [recompteDossier, setRecompteDossier] = useState<DossierVersement | null>(null);
  const [recompteMontant, setRecompteMontant] = useState('');

  const encaisseurName = (id: string) => users.find(u => u.id === id)?.name || id.substring(0, 8);

  useEffect(() => {
    if (!currentUser) return;
    chargerDonnees();
  }, [currentUser]);

  const chargerDonnees = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [dos, aff] = await Promise.all([
        getDossiersCaissier(currentUser.id),
        getAffectationsCaissier(currentUser.id),
      ]);
      setDossiers(dos);
      setAffectations(aff);

      // Charger les échéances du mois en cours
      const maintenant = new Date();
      const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
      const finMois = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0);
      const ech = await getEcheancesCaissier({
        caissier_id: currentUser.id,
        date_debut: debutMois.toISOString().split('T')[0],
        date_fin: finMois.toISOString().split('T')[0],
      });
      setEcheances(ech);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreerDossier = async () => {
    if (!currentUser) return;
    if (!encaisseurId) {
      setError('Veuillez sélectionner un encaisseur');
      return;
    }
    const montantNum = parseFloat(montant);
    if (isNaN(montantNum) || montantNum <= 0) {
      setError('Veuillez saisir un montant valide');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const dossier = await creerDossier({
        caissier_id: currentUser.id,
        encaisseur_id: encaisseurId,
        montant_attendu: montantNum,
        date_versement: toLocalDayKey(new Date()),
      });

      // Déclarer immédiatement le montant
      await declarerMontant({
        dossier_id: dossier.id,
        type_declaration: 'caissier_initial',
        montant: montantNum,
      });

      setSuccess(`Versement ${dossier.reference} créé et déclaré avec succès`);
      setShowForm(false);
      setMontant('');
      setEncaisseurId('');
      await chargerDonnees();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRecompterCaissier = async () => {
    if (!recompteDossier) return;
    const montantNum = parseFloat(recompteMontant);
    if (isNaN(montantNum) || montantNum < 0) {
      setError('Veuillez saisir un montant valide');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await declarerMontant({
        dossier_id: recompteDossier.id,
        type_declaration: 'caissier_recompte',
        montant: montantNum,
      });
      setSuccess('Recomptage enregistré');
      setRecompteDossier(null);
      setRecompteMontant('');
      await chargerDonnees();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <p>Chargement de vos versements...</p>
      </div>
    );
  }

  const totalConfirmes = dossiers
    .filter(d => ['confirme', 'confirme_apres_arbitrage'].includes(d.statut))
    .reduce((sum, d) => sum + (d.montant_confirme || 0), 0);

  const dossiersActifs = dossiers.filter(d => ['en_attente', 'declare_caissier', 'declare_encaisseur', 'a_recompter'].includes(d.statut));
  const dossiersTermines = dossiers.filter(d => ['confirme', 'confirme_apres_arbitrage', 'annule', 'en_arbitrage'].includes(d.statut));

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>
            <Receipt size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Mes Versements
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Déclarez vos remises d'espèces à l'encaisseur
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowForm(true)}
          disabled={affectations.length === 0}
          icon={<Send size={16} />}
        >
          Nouveau versement
        </Button>
      </div>

      {affectations.length === 0 && (
        <Card style={{ marginBottom: 24, padding: 16, backgroundColor: '#FFF7ED', borderColor: '#FB923C' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />
            <strong>Vous n'êtes affecté à aucun encaisseur</strong>
          </div>
          <p style={{ fontSize: 14, marginTop: 8, marginBottom: 0 }}>
            Contactez votre direction pour être affecté à un encaisseur avant de pouvoir déclarer des versements.
          </p>
        </Card>
      )}

      {error && (
        <Card style={{ marginBottom: 16, padding: 12, borderColor: 'var(--color-danger)' }}>
          <p style={{ color: 'var(--color-danger)', margin: 0 }}>{error}</p>
        </Card>
      )}

      {success && (
        <Card style={{ marginBottom: 16, padding: 12, borderColor: 'var(--color-success)' }}>
          <p style={{ color: 'var(--color-success)', margin: 0 }}>{success}</p>
        </Card>
      )}

      {/* Indicateurs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--color-primary)' }}>
            {totalConfirmes.toLocaleString()}
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Total confirmé (FCFA)</div>
        </Card>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--color-warning)' }}>{dossiersActifs.length}</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>En cours</div>
        </Card>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--color-danger)' }}>
            {echeances.filter(e => e.statut === 'en_retard').length}
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Échéances en retard</div>
        </Card>
        <Card style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--color-success)' }}>
            {echeances.filter(e => e.statut === 'complete').length}
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Échéances honorées</div>
        </Card>
      </div>

      {/* Formulaire de création */}
      {showForm && (
        <Card style={{ marginBottom: 24, padding: 20, border: '2px solid var(--color-primary)' }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Nouveau versement</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Encaisseur destinataire</label>
              <select
                value={encaisseurId}
                onChange={e => setEncaisseurId(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }}
              >
                <option value="">-- Sélectionner --</option>
                {affectations.map(aff => (
                  <option key={aff.id} value={aff.encaisseur_id}>
                    {encaisseurName(aff.encaisseur_id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Montant à remettre (FCFA)</label>
              <input
                type="number"
                value={montant}
                onChange={e => setMontant(e.target.value)}
                placeholder="Montant"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button variant="primary" onClick={handleCreerDossier} disabled={busy}>
              {busy ? 'Création...' : 'Créer et déclarer'}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Annuler
            </Button>
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Liste des dossiers */}
        <div>
          <h2 style={{ marginBottom: 12, fontSize: 18 }}>Versements en cours</h2>
          {dossiersActifs.length === 0 ? (
            <Card style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              Aucun versement en cours
            </Card>
          ) : (
            dossiersActifs.map(dossier => (
              <Card key={dossier.id} style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>{dossier.reference}</div>
                  <Badge variant={STATUT_LABELS[dossier.statut]?.variant || 'neutral'}>
                    {STATUT_LABELS[dossier.statut]?.label || dossier.statut}
                  </Badge>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 14 }}>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Montant attendu : </span>
                    <strong>{dossier.montant_attendu.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Déclaré : </span>
                    <strong>{dossier.montant_declare_caissier?.toLocaleString() || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Reçu : </span>
                    <strong>{dossier.montant_declare_encaisseur?.toLocaleString() || '—'}</strong>
                  </div>
                </div>
                {dossier.statut === 'a_recompter' && (
                  <div style={{ marginTop: 12 }}>
                    <Button variant="warning" onClick={() => { setRecompteDossier(dossier); setRecompteMontant(''); }}>
                      Recompter
                    </Button>
                  </div>
                )}
              </Card>
            ))
          )}

          {recompteDossier && (
            <Card style={{ marginTop: 12, padding: 16, border: '2px solid #F59E0B' }}>
              <h3 style={{ marginTop: 0, fontSize: 16 }}>Recompter {recompteDossier.reference}</h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 0 }}>
                Indiquez le montant que vous avez réellement compté.
              </p>
              <input
                type="number"
                value={recompteMontant}
                onChange={e => setRecompteMontant(e.target.value)}
                placeholder="Montant recompté (FCFA)"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)', marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <Button variant="primary" onClick={handleRecompterCaissier} disabled={busy}>
                  {busy ? 'Envoi...' : 'Valider le recomptage'}
                </Button>
                <Button variant="outline" onClick={() => { setRecompteDossier(null); setRecompteMontant(''); }}>
                  Annuler
                </Button>
              </div>
            </Card>
          )}

          {dossiersTermines.length > 0 && (
            <>
              <h2 style={{ marginBottom: 12, fontSize: 18, marginTop: 24 }}>Historique</h2>
              {dossiersTermines.map(dossier => (
                <Card key={dossier.id} style={{ padding: 16, marginBottom: 12, opacity: 0.85 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{dossier.reference}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
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

        {/* Échéances */}
        <div>
          <h2 style={{ marginBottom: 12, fontSize: 18 }}>
            <Calendar size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Échéances du mois
          </h2>
          {echeances.length === 0 ? (
            <Card style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              Aucune échéance ce mois
            </Card>
          ) : (
            echeances.slice(0, 10).map(ech => (
              <Card key={ech.id} style={{ padding: 12, marginBottom: 8, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{new Date(ech.date_echeance).toLocaleDateString('fr-FR')}</span>
                  <Badge variant={ech.statut === 'en_retard' ? 'danger' : ech.statut === 'complete' ? 'success' : 'neutral'}>
                    {ech.statut === 'en_retard' ? 'En retard' : ech.statut === 'complete' ? 'Honorée' : 'À venir'}
                  </Badge>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
