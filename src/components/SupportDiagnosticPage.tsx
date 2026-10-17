import React, { useState, useEffect } from 'react';
import { platform } from '../platform';

export default function SupportDiagnosticPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [isMaintenance, setIsMaintenance] = useState(false);

  useEffect(() => {
    loadLogs();
    checkMaintenance();

    platform.maintenance.onToggle((active) => {
      setIsMaintenance(active);
    });
  }, []);

  const loadLogs = async () => {
    try {
const l = await platform.logger.getLogs();
      setLogs(l);
    } catch {}
  };

  const checkMaintenance = async () => {
    try {
      const state = await platform.maintenance.getState();
      setIsMaintenance(state);
    } catch {}
  };

  const handleRunDiagnostics = async () => {
    try {
      const rep = await platform.diagnostics.runDiagnostics();
      setReport(rep);
    } catch(e) {
      alert("Erreur de diagnostic : " + String(e));
    }
  };

  const handleAddLog = async () => {
    platform.logger.info("Log testé manuellement par l'utilisateur !");
    setTimeout(loadLogs, 200);
  };

  const handleToggleMaintenance = async () => {
    await platform.maintenance.setMode(!isMaintenance);
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Centre de Support & Diagnostics (Phase 13)</h1>
      
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        
        {/* Colonne 1 : Actions et Maintenance */}
        <div style={{ flex: 1 }}>
          <h3>État du Système</h3>
          <div style={{ padding: '15px', background: isMaintenance ? '#ffebee' : '#e8f5e9', border: '1px solid #ccc', borderRadius: '4px' }}>
            <strong>Mode Maintenance :</strong> {isMaintenance ? 'ACTIF (UI bloquée)' : 'Inactif (Normal)'}
            <button 
              onClick={handleToggleMaintenance}
              style={{ display: 'block', marginTop: '10px', padding: '8px 12px', background: isMaintenance ? '#d32f2f' : '#388e3c', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              {isMaintenance ? 'Désactiver le Mode Maintenance' : 'Activer le Mode Maintenance'}
            </button>
          </div>

          <h3 style={{ marginTop: '20px' }}>Diagnostics</h3>
          <button 
            onClick={handleRunDiagnostics}
            style={{ padding: '10px 15px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
          >
            Lancer un bilan de santé (JSON)
          </button>
          
          {report && (
            <pre style={{ background: '#f5f5f5', padding: '10px', marginTop: '10px', overflowX: 'auto', fontSize: '12px' }}>
              {JSON.stringify(report, null, 2)}
            </pre>
          )}
        </div>

        {/* Colonne 2 : Logs */}
        <div style={{ flex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Journaux (Logs en direct)</h3>
            <div>
              <button onClick={handleAddLog} style={{ marginRight: '10px', padding: '6px 12px' }}>Ajouter Log</button>
              <button onClick={loadLogs} style={{ padding: '6px 12px' }}>Rafraîchir</button>
            </div>
          </div>
          <div style={{ background: '#1e1e1e', color: '#0f0', padding: '10px', borderRadius: '4px', height: '400px', overflowY: 'auto', fontSize: '13px' }}>
            {logs.length === 0 ? <div>Aucun log récent.</div> : logs.map((l, i) => (
              <div key={i} style={{ marginBottom: '5px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                <span style={{ color: '#888' }}>[{new Date(l.timestamp).toLocaleTimeString()}]</span>{' '}
                <strong style={{ color: l.level === 'ERROR' ? 'red' : l.level === 'WARN' ? 'orange' : '#0f0' }}>{l.level}</strong>:{' '}
                {l.message}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
