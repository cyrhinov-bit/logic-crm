import React, { useState, useEffect } from 'react';
import { platform } from '../platform';
import type { ScanRecord } from '../platform/types';

export default function ScannerDiagnosticPage() {
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [lastScan, setLastScan] = useState<ScanRecord | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isStarted, setIsStarted] = useState(false);

  const log = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 10));
  const err = (msg: string) => setLogs(prev => [`❌ ERREUR: ${msg}`, ...prev].slice(0, 10));

  useEffect(() => {
    // Le bridge web fonctionne aussi, on ne bloque pas si ce n'est pas desktop
    platform.scanner.onScan((record) => {
      setLastScan(record);
      setHistory(prev => [record, ...prev]);
      log(`Scan reçu : ${record.data} (${record.format})`);
    });

    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const h = await platform.scanner.getHistory();
      setHistory(h);
    } catch (e) {
      console.warn('Failed to load scanner history', e);
    }
  };

  const toggleScanner = async () => {
    try {
      if (isStarted) {
        await platform.scanner.stop();
        setIsStarted(false);
        log('Scanner arrêté.');
      } else {
        await platform.scanner.start();
        setIsStarted(true);
        log('Scanner démarré.');
      }
    } catch (e: any) {
      err(e.message || String(e));
    }
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Scanner Engine Diagnostic (Phase 10)</h1>
      <p style={{ color: '#666' }}>
        Note: Sur l'application Web, le simulateur interceptera vos frappes rapides de touches. <br/>
        Cliquez n'importe où et tapez un code rapidement (ex: "1234567890128" + Entrée) pour simuler un coup de douchette.
      </p>
      
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <div style={{ flex: 1 }}>
          <h3>1. Contrôle</h3>
          <button 
            onClick={toggleScanner} 
            style={{...btnStyle, background: isStarted ? '#d32f2f' : '#2e7d32'}}
          >
            {isStarted ? 'Arrêter le Scanner' : 'Démarrer le Scanner'}
          </button>
          
          <h3 style={{ marginTop: '20px' }}>Dernier Scan Reçu</h3>
          <div style={{ 
            background: '#fff', border: '2px solid #ddd', 
            padding: '20px', borderRadius: '8px', textAlign: 'center' 
          }}>
            {lastScan ? (
              <>
                <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{lastScan.data}</div>
                <div style={{ color: lastScan.valid ? 'green' : 'red', fontWeight: 'bold', marginTop: '10px' }}>
                  Format: {lastScan.format} | Checksum Valid: {lastScan.valid ? 'OUI' : 'NON'}
                </div>
              </>
            ) : (
              <div style={{ color: '#888' }}>Aucun scan reçu...</div>
            )}
          </div>

          <h3 style={{ marginTop: '20px' }}>Logs</h3>
          <div style={{ background: '#1e1e1e', color: '#0f0', padding: '10px', borderRadius: '4px', minHeight: '150px' }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h3>2. Historique de Session</h3>
          <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '8px', minHeight: '300px' }}>
            {history.length === 0 ? <div>Aucun scan enregistré.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {history.map(record => (
                  <div key={record.id} style={{ background: '#fff', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}>
                    <strong>Données:</strong> <span style={{ fontSize: '1.2em' }}>{record.data}</span> <br/>
                    <strong>Format:</strong> {record.format} <br/>
                    <strong>Validité:</strong> 
                    <span style={{ color: record.valid ? 'green' : 'red', fontWeight: 'bold', marginLeft: '5px' }}>
                      {record.valid ? 'VALIDE' : 'INVALIDE'}
                    </span><br/>
                    <strong>Heure:</strong> {new Date(record.timestamp).toLocaleTimeString()}
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
  padding: '10px 16px',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  width: '100%'
};
