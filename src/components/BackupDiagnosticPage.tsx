import React, { useState, useEffect } from 'react';
import { platform } from '../platform';
import type { BackupMetadata, BackupProgressEvent } from '../platform/types';

export default function BackupDiagnosticPage() {
  const [history, setHistory] = useState<BackupMetadata[]>([]);
  const [progress, setProgress] = useState<BackupProgressEvent | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const log = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 10));
  const err = (msg: string) => setLogs(prev => [`❌ ERREUR: ${msg}`, ...prev].slice(0, 10));

  useEffect(() => {
    platform.backup.onProgress((data) => {
      setProgress(data);
    });
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const h = await platform.backup.getHistory();
      setHistory(h);
    } catch (e) { console.warn("Backup error", e); }
  };

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    setProgress({ step: 'Démarrage...', percent: 0 });
    try {
      log("Lancement d'une sauvegarde complète...");
      const id = await platform.backup.createBackup();
      log(`Sauvegarde terminée avec succès ! (ID: ${id})`);
      setProgress(null);
      await loadHistory();
    } catch (e: any) {
      err(e.message || String(e));
      setProgress(null);
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Backup Engine Diagnostic (Phase 11)</h1>
      <p style={{ color: '#666' }}>
        Console d'administration du moteur de sauvegarde (Zip, AES, Validation).
      </p>
      
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <div style={{ flex: 1 }}>
          <h3>1. Création de Sauvegarde</h3>
          <button 
            onClick={handleCreateBackup} 
            disabled={isBackingUp}
            style={{...btnStyle, opacity: isBackingUp ? 0.5 : 1}}
          >
            {isBackingUp ? 'Sauvegarde en cours...' : 'Créer une Sauvegarde (Simulation UI)'}
          </button>
          
          {progress && (
            <div style={{ marginTop: '20px', background: '#f5f5f5', padding: '15px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong>Étape:</strong> <span>{progress.step}</span>
              </div>
              <div style={{ width: '100%', background: '#ddd', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ width: `${progress.percent}%`, background: '#2e7d32', height: '100%', transition: 'width 0.3s' }}></div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.9em', marginTop: '5px' }}>{progress.percent}%</div>
            </div>
          )}

          <h3 style={{ marginTop: '20px' }}>Logs</h3>
          <div style={{ background: '#1e1e1e', color: '#0f0', padding: '10px', borderRadius: '4px', minHeight: '150px' }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>

        <div style={{ flex: 2 }}>
          <h3>2. Historique des Sauvegardes</h3>
          <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '8px', minHeight: '300px' }}>
            {history.length === 0 ? <div>Aucune sauvegarde dans l'historique.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {history.map(meta => (
                  <div key={meta.id} style={{ background: '#fff', padding: '15px', borderRadius: '4px', border: '1px solid #ccc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>ID: {meta.id}</strong>
                      <span style={{ color: '#666' }}>{new Date(meta.date).toLocaleString()}</span>
                    </div>
                    <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '0.9em' }}>
                      <div><strong>Type:</strong> {meta.type.toUpperCase()}</div>
                      <div><strong>Taille:</strong> {(meta.sizeBytes / 1024 / 1024).toFixed(2)} MB</div>
                      <div><strong>Version App:</strong> {meta.appVersion}</div>
                      <div><strong>Checksum:</strong> {meta.checksum}</div>
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '0.85em', color: '#444' }}>
                      <strong>Modules inclus:</strong> {meta.modules.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  padding: '12px 16px',
  background: '#1976d2',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  width: '100%'
};
