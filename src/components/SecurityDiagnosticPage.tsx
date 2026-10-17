import React, { useState, useEffect } from 'react';
import { platform } from '../platform';

export default function SecurityDiagnosticPage() {
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    loadSecurityStatus();
  }, []);

  const loadSecurityStatus = async () => {
    try {
      const s = await platform.security.getStatus();
      setStatus(s);
    } catch(e) {
      console.error(e);
    }
  };

  const handleTestPermission = async () => {
    try {
      const allowed = await platform.security.checkPermission('TEST_MODULE', 'READ');
      alert(`Permission TEST_MODULE:READ -> ${allowed ? 'Autorisée' : 'Refusée'}`);
    } catch(e) {
      alert("Erreur: " + String(e));
    }
  };

  if (!status) return <div>Chargement de l'état de sécurité...</div>;

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Centre de Sécurité (Phase 14)</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        
        {/* Colonne 1 : Validation de l'environnement */}
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '4px' }}>
          <h3>Validation de l'Environnement</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li style={{ color: status.environment.nodeIntegration === false ? 'green' : 'red' }}>
              {status.environment.nodeIntegration === false ? '✅' : '❌'} nodeIntegration désactivé
            </li>
            <li style={{ color: status.environment.contextIsolation === true ? 'green' : 'red' }}>
              {status.environment.contextIsolation === true ? '✅' : '❌'} contextIsolation activé
            </li>
            <li style={{ color: status.environment.sandbox === true ? 'green' : 'red' }}>
              {status.environment.sandbox === true ? '✅' : '❌'} sandbox activé
            </li>
          </ul>
        </div>

        {/* Colonne 2 : Services de sécurité */}
        <div style={{ background: '#e3f2fd', padding: '15px', borderRadius: '4px' }}>
          <h3>Services de Sécurité</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li>
              {status.secureStorageReady ? '✅' : '❌'} SecureStorage (Chiffrement AES) prêt
            </li>
            <li>
              {status.sessionActive ? '✅' : '❌'} Session Manager actif
            </li>
          </ul>
        </div>
        
        {/* Colonne 3 : Test Permissions */}
        <div style={{ background: '#fff3e0', padding: '15px', borderRadius: '4px', gridColumn: 'span 2' }}>
          <h3>Tests IPC de Sécurité</h3>
          <button 
            onClick={handleTestPermission}
            style={{ padding: '8px 16px', cursor: 'pointer', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '4px' }}
          >
            Tester Permission Manager
          </button>
        </div>

      </div>
    </div>
  );
}
