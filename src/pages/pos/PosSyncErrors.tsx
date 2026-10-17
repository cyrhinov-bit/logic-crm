import { useState, useEffect } from 'react';
import { db } from '../../lib/db';
import { ShieldAlert, Trash2, RefreshCw, CloudUpload, CheckCircle, AlertTriangle, Wrench } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { queueSyncAction, reconcileLocalPosDataWithCloud, isRetiredServicePayload, type SyncAction } from '../../lib/sync';
import { useAppContext } from '../../context/AppContext';
import { toast } from 'react-hot-toast';

interface SyncError {
  action: SyncAction;
  failedAt: string;
  message?: string;
  attempts?: number;
}

// D3 : les erreurs retirées sont archivées (restaurables), jamais détruites.
async function archiveErrors(entries: SyncError[]) {
  if (entries.length === 0) return;
  const archived = (await db.syncErrors.getItem<SyncError[]>('archived')) || [];
  await db.syncErrors.setItem('archived', [...entries, ...archived].slice(0, 200));
}

export default function PosSyncErrors() {
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [pendingQueue, setPendingQueue] = useState<SyncAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<{ success: boolean; message: string } | null>(null);
  const { repairLocalCatalog } = useAppContext();

  const loadErrors = async () => {
    setLoading(true);
    try {
      const stored = (await db.syncErrors.getItem<SyncError[]>('errors')) || [];
      const validErrors = stored.filter(e => !isRetiredServicePayload(e.action?.type, e.action?.payload));
      if (validErrors.length !== stored.length) {
        await db.syncErrors.setItem('errors', validErrors);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sync-errors-updated', { detail: { count: validErrors.length } }));
        }
      }
      setErrors(validErrors);
      // File d'attente en cours (actions non encore envoyées : hors-ligne ou en attente de rejeu)
      const queue = (await db.syncQueue.getItem<SyncAction[]>('queue')) || [];
      setPendingQueue(queue.filter(a => !isRetiredServicePayload(a.type, (a as any).payload)));
    } catch (e) {
      console.error('Erreur de lecture des syncErrors', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadErrors();
  }, []);

  const clearAll = async () => {
    if (!window.confirm('Archiver toutes ces erreurs ? Elles resteront restaurables depuis les archives (200 dernières).')) return;
    await archiveErrors(errors);
    await db.syncErrors.setItem('errors', []);
    setErrors([]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-errors-updated', { detail: { count: 0 } }));
    }
    toast.success('Erreurs archivées (restaurables).');
  };

  const restoreArchived = async () => {
    const archived = (await db.syncErrors.getItem<SyncError[]>('archived')) || [];
    if (archived.length === 0) { toast.error('Aucune archive.'); return; }
    const current = (await db.syncErrors.getItem<SyncError[]>('errors')) || [];
    const merged = [...archived, ...current].slice(0, 200);
    await db.syncErrors.setItem('errors', merged);
    await db.syncErrors.setItem('archived', []);
    setErrors(merged);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-errors-updated', { detail: { count: merged.length } }));
    }
    toast.success(`${archived.length} erreur(s) restaurée(s).`);
  };

  const retryAction = async (error: SyncError, index: number) => {
    // D3 : remise en file D'ABORD, retrait ensuite — jamais l'inverse. En cas
    // d'échec du rejeu, processSyncQueue réenregistre l'erreur (anti-perte, cf. D1).
    if (!isRetiredServicePayload(error.action.type, error.action.payload)) {
      try {
        await queueSyncAction(error.action.type, error.action.payload);
      } catch {
        toast.error("Remise en file impossible pour le moment.");
        return;
      }
    }
    const newErrors = [...errors];
    const [removed] = newErrors.splice(index, 1);
    await archiveErrors(removed ? [removed] : []);
    await db.syncErrors.setItem('errors', newErrors);
    setErrors(newErrors);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-errors-updated', { detail: { count: newErrors.length } }));
    }

    if (!isRetiredServicePayload(error.action.type, error.action.payload)) {
      toast.success('Action remise en file d\'attente de synchronisation.');
    } else {
      toast.success('Action de service ignorée et archivée.');
    }
  };

  const retryAll = async () => {
    if (errors.length === 0) return;
    const count = errors.length;
    for (const err of errors) {
      if (!isRetiredServicePayload(err.action.type, err.action.payload)) {
        try {
          await queueSyncAction(err.action.type, err.action.payload);
        } catch {
          toast.error('Remise en file interrompue : réessayez plus tard.');
          await loadErrors();
          return;
        }
      }
    }
    await archiveErrors(errors);
    await db.syncErrors.setItem('errors', []);
    setErrors([]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-errors-updated', { detail: { count: 0 } }));
    }
    toast.success(`${count} action(s) remise(s) en file (anciennes entrées archivées).`);
  };

  const handleRepairCatalog = async () => {
    if (!window.confirm("Remapper les doublons locaux du catalogue vers les produits du serveur (ventes, stocks, file d'attente) ? L'historique est conservé, les doublons retirés. Continuer ?")) return;
    setIsRepairing(true);
    try {
      const res = await repairLocalCatalog();
      await loadErrors();
      toast.success(res.message, { duration: 6000 });
    } catch (e: any) {
      toast.error('Réparation impossible : ' + (e?.message || e), { duration: 6000 });
    } finally {
      setIsRepairing(false);
    }
  };
  const handleGlobalReconciliation = async () => {
    setIsReconciling(true);
    setReconcileResult(null);
    const toastId = toast.loading('Réconciliation globale en cours...');
    try {
      const result = await reconcileLocalPosDataWithCloud({ force: true });
      setReconcileResult(result);
      await loadErrors();
      if (result.success) {
        toast.success(result.message, { id: toastId, duration: 6000 });
      } else {
        toast.error(result.message, { id: toastId, duration: 6000 });
      }
    } catch (e: any) {
      const msg = e?.message || 'Erreur lors du rapprochement.';
      setReconcileResult({ success: false, message: msg });
      toast.error(msg, { id: toastId });
    } finally {
      setIsReconciling(false);
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Chargement...</div>;

  const pendingByType = pendingQueue.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="pos-page" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={24} color="var(--color-error)" />
            Erreurs & Réconciliation de Synchronisation
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px', fontSize: '14px' }}>
            Affiche les données non synchronisées et permet le rapprochement automatique de la base locale avec le serveur Cloud.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button 
            variant="primary" 
            icon={<CloudUpload size={16} />} 
            onClick={handleGlobalReconciliation}
            disabled={isReconciling}
          >
            {isReconciling ? 'Rapprochement en cours...' : 'Forcer Réconciliation Globale POS'}
          </Button>

          <Button variant="secondary" icon={<Wrench size={16} />} onClick={handleRepairCatalog} disabled={isRepairing} title="Remappe les doublons locaux du catalogue vers les produits du serveur (ventes, stocks, file). À lancer si des ventes perdent leurs lignes ou si des produits échouent.">
            {isRepairing ? 'Réparation...' : 'Réparer le catalogue local'}
          </Button>

          {errors.length > 0 && (
            <>
              <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={retryAll}>
                Tout ré-essayer ({errors.length})
              </Button>
              <Button variant="danger" icon={<Trash2 size={16} />} onClick={clearAll}>
                Archiver
              </Button>
              <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={restoreArchived}>
                Restaurer archives
              </Button>
            </>
          )}
        </div>
      </div>

      {reconcileResult && (
        <div style={{
          padding: '16px',
          marginBottom: '20px',
          borderRadius: 'var(--radius-md)',
          background: reconcileResult.success ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${reconcileResult.success ? '#bbf7d0' : '#fecaca'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          {reconcileResult.success ? <CheckCircle size={24} color="#15803d" /> : <AlertTriangle size={24} color="#b91c1c" />}
          <div>
            <div style={{ fontWeight: 700, color: reconcileResult.success ? '#15803d' : '#b91c1c' }}>
              {reconcileResult.success ? 'Rapprochement Réussi' : 'Attention lors du rapprochement'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text)' }}>
              {reconcileResult.message}
            </div>
          </div>
        </div>
      )}

      {/* File d'attente en cours (M16) : actions saisies hors-ligne ou en attente d'envoi */}
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <CloudUpload size={20} color="var(--color-primary)" />
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>
            File d'attente : {pendingQueue.length} action(s) en attente d'envoi
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {pendingQueue.length === 0
              ? "Rien en attente — tout a été envoyé au serveur."
              : Object.entries(pendingByType).map(([t, n]) => `${t} ×${n}`).join(' • ')}
          </div>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={loadErrors}>
          Actualiser
        </Button>
      </div>

      {errors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <ShieldAlert size={48} color="var(--color-success)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Aucune anomalie détectée</h3>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: '500px', margin: '0 auto 16px' }}>
            Toutes les transactions ont été synchronisées. Si des données locales n'apparaissent pas encore sur d'autres postes, utilisez le bouton "Forcer Réconciliation Globale POS" ci-dessus.
          </p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-alt)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Type d'Action</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Date d'échec</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Cause</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Données (Payload)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '14px', color: 'var(--color-error)' }}>
                      {err.action.type}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
                      {new Date(err.failedAt).toLocaleString('fr-FR')}
                      {(err.attempts || 0) > 1 && (
                        <div style={{ fontSize: '11px', color: 'var(--color-warning-strong)' }}>{err.attempts} tentatives</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', maxWidth: '220px' }}>
                      {err.message || <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={JSON.stringify(err.action.payload, null, 2)}>
                      {JSON.stringify(err.action.payload)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <Button variant="ghost" size="sm" icon={<RefreshCw size={16} />} onClick={() => retryAction(err, idx)}>
                        Réessayer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
