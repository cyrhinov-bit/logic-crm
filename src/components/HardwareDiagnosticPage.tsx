import React, { useState, useEffect } from 'react';
import { platform } from '../platform';
import type { Device } from '../platform/types';

export default function HardwareDiagnosticPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  const log = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 10));
  const err = (msg: string) => setLogs(prev => [`❌ ERREUR: ${msg}`, ...prev].slice(0, 10));

  useEffect(() => {
    if (platform.isDesktop) {
      loadDevices();
    }
  }, []);

  const loadDevices = async () => {
    try {
      const d = await platform.hardware.getDevices();
      setDevices(d);
      log(`${d.length} périphériques chargés.`);
    } catch (e: any) {
      err(e.message || String(e));
    }
  };

  const handleDiscover = async () => {
    setIsDiscovering(true);
    try {
      log('Lancement du scan des périphériques (USB/Série)...');
      const d = await platform.hardware.discover();
      setDevices(d);
      log(`Découverte terminée. ${d.length} périphériques trouvés.`);
    } catch (e: any) {
      err(e.message || String(e));
    } finally {
      setIsDiscovering(false);
    }
  };

  if (!platform.isDesktop) {
    return (
      <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
        <h1>Hardware Engine Diagnostic</h1>
        <div style={{ color: 'red' }}>Ce module nécessite Electron.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Hardware Engine Diagnostic (Phase 9)</h1>
      
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <h3>1. Contrôle</h3>
          <button 
            onClick={handleDiscover} 
            disabled={isDiscovering}
            style={{...btnStyle, opacity: isDiscovering ? 0.5 : 1}}
          >
            {isDiscovering ? 'Recherche en cours...' : 'Découvrir (Simuler Plug & Play)'}
          </button>
          
          <h3 style={{ marginTop: '20px' }}>Logs</h3>
          <div style={{ background: '#1e1e1e', color: '#0f0', padding: '10px', borderRadius: '4px', minHeight: '150px' }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>

        <div style={{ flex: 2 }}>
          <h3>2. Périphériques enregistrés (Registre)</h3>
          <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '8px', minHeight: '300px' }}>
            {devices.length === 0 ? <div>Aucun périphérique détecté.</div> : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {devices.map(device => (
                  <div key={device.id} style={{ background: '#fff', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}>
                    <strong>ID:</strong> {device.id} <br/>
                    <strong>Type:</strong> {device.type.toUpperCase()} <br/>
                    <strong>Modèle:</strong> {device.manufacturer || 'Inconnu'} {device.model || ''} <br/>
                    <strong>Statut:</strong> 
                    <span style={{ color: device.status === 'connected' ? 'green' : 'red', fontWeight: 'bold', marginLeft: '5px' }}>
                      {device.status.toUpperCase()}
                    </span><br/>
                    <strong>Driver Chargé:</strong> {device.driverLoaded ? '✅ Oui' : '❌ Non'}<br/>
                    <div style={{ marginTop: '5px', fontSize: '0.85em', color: '#666' }}>
                      Capacités: {device.capabilities.join(', ')}
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
  padding: '10px 16px',
  background: '#1976d2',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
};
