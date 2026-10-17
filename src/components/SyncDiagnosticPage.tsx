import React, { useState, useEffect } from 'react';
import { platform } from '../platform';
import { db } from '../lib/db';

export default function SyncDiagnosticPage() {
  const [status, setStatus] = useState<any>({ isOnline: true, pendingCount: 0 });
  const [realQueue, setRealQueue] = useState({ pending: 0, errors: 0 });
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    loadStatus();
    loadRealQueue();
    const onErrors = () => loadRealQueue();
    window.addEventListener('sync-errors-updated', onErrors);
    platform.sync.onEvent((payload) => {
      setEvents(prev => [...prev, payload]);
      if (['queueUpdated', 'networkStatusChanged', 'syncCompleted', 'syncFailed'].includes(payload.event)) {
        loadStatus();
        loadRealQueue();
      }
    });
    const timer = setInterval(loadRealQueue, 5000);
    return () => {
      window.removeEventListener('sync-errors-updated', onErrors);
      clearInterval(timer);
    };
  }, []);

  const loadRealQueue = async () => {
    try {
      const q = (await db.syncQueue.getItem<any[]>('queue')) || [];
      const e = (await db.syncErrors.getItem<any[]>('errors')) || [];
      setRealQueue({ pending: q.length, errors: e.length });
    } catch {}
  };

  const loadStatus = async () => {
    try {
      const s = await platform.sync.getStatus();
      setStatus(s);
    } catch(e) { console.error(e); }
  };

  const handleAddFakeOp = async () => {
    // PING : preuve de connectivité réelle à la base configurée, sans écriture.
    // (L'ancien INSERT_SALE fictif aurait créé une fausse vente : refusé par le moteur.)
    try {
      const res: any = await platform.sync.enqueue({ kind: 'PING' });
      await loadStatus();
      alert(res?.id ? `PING enfilé (${res.id}) — surveillez le journal.` : 'PING enfilé.');
    } catch(e: any) { alert('Enqueue impossible : ' + (e?.message || e)); }
  };

  const handleForceSync = async () => {
    try {
      await platform.sync.forceSync();
    } catch(e) { alert(String(e)); }
  };

  const handleToggleNetwork = async () => {
    try {
      await platform.sync.setNetworkStatus(!status.isOnline);
      await loadStatus();
    } catch(e) { alert(String(e)); }
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Moteur de Synchronisation (Phase 18)</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        
        {/* Colonne 1 : Contrôles */}
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '4px' }}>
          <h3>État du Réseau & File d'attente</h3>
          
          <div style={{ marginBottom: '10px' }}>
            <strong>Statut Réseau : </strong> 
            <span style={{ color: status.isOnline ? 'green' : 'red', fontWeight: 'bold' }}>
              {status.isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <strong>Opérations en attente (moteur desktop) : </strong> {status.pendingCount}
          </div>
          <div style={{ marginBottom: '10px', background: '#fff3cd', padding: '8px', borderRadius: '4px' }}>
            <strong>File réelle web (src/lib/sync.ts) : </strong> {realQueue.pending} en attente, {realQueue.errors} en erreur.
            <br />
            <span style={{ fontSize: '12px' }}>Le moteur desktop ci-dessus peut être vert alors que la file web déborde : seule cette ligne fait foi côté web.</span>
            <br />
            <button onClick={loadRealQueue} style={{ marginTop: '6px' }}>Rafraîchir la file réelle</button>
          </div>

          {platform.isDesktop && (
            <>
              <div style={{ marginBottom: '10px' }}>
                <strong>Base configurée : </strong>
                <span style={{ color: status.configured ? 'green' : 'red', fontWeight: 'bold' }}>
                  {status.configured ? 'OUI' : 'NON (connectez-vous pour configurer)'}
                </span>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Authentifié : </strong>
                <span style={{ color: status.authenticated ? 'green' : 'red', fontWeight: 'bold' }}>
                  {status.authenticated ? 'OUI' : 'NON'}
                </span>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Échecs : </strong> {status.failedCount ?? 0}
              </div>
              {status.lastError && (
                <div style={{ marginBottom: '10px', color: '#b91c1c' }}>
                  <strong>Dernière erreur : </strong> {status.lastError}
                </div>
              )}
              {status.lastSyncAt && (
                <div style={{ marginBottom: '10px' }}>
                  <strong>Dernière synchro : </strong> {new Date(status.lastSyncAt).toLocaleString('fr-FR')}
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
            <button onClick={handleToggleNetwork}>Basculer le mode Hors-ligne / En-ligne</button>
            <button onClick={handleAddFakeOp}>Tester la connexion base (PING, sans écriture)</button>
            <button onClick={handleForceSync} disabled={!status.isOnline || status.pendingCount === 0}>Forcer la Synchronisation</button>
          </div>
        </div>

        {/* Colonne 2 : Journal d'événements */}
        <div style={{ background: '#e3f2fd', padding: '15px', borderRadius: '4px', height: '400px', overflowY: 'auto' }}>
          <h3>Activité du SyncWorker (Live)</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {events.map((evt, idx) => (
              <li key={idx} style={{ padding: '5px', borderBottom: '1px solid #ccc', fontSize: '13px' }}>
                <strong style={{ color: '#1565c0' }}>{evt.event}</strong> : 
                <pre style={{ margin: 0, fontSize: '11px', background: '#fff', padding: '4px' }}>
                  {JSON.stringify(evt.data, null, 2)}
                </pre>
              </li>
            ))}
            {events.length === 0 && <li>En attente d'événements...</li>}
          </ul>
        </div>

      </div>
    </div>
  );
}
