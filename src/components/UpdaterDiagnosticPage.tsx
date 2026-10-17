import React, { useState, useEffect } from 'react';
import { platform } from '../platform';
import type { UpdateInfo, UpdateProgress } from '../platform/types';

export default function UpdaterDiagnosticPage() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const log = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 10));
  const err = (msg: string) => setLogs(prev => [`❌ ERREUR: ${msg}`, ...prev].slice(0, 10));

  useEffect(() => {
    platform.updater.onStatus((data) => {
      setProgress(data);
      if (data.status === 'downloaded') {
        setIsDownloading(false);
        log('Téléchargement terminé. Prêt à installer.');
      }
    });
  }, []);

  const handleCheck = async () => {
    setIsChecking(true);
    setUpdateInfo(null);
    log("Vérification des mises à jour...");
    try {
      const info = await platform.updater.checkForUpdates();
      if (info) {
        setUpdateInfo(info);
        log(`Mise à jour trouvée : ${info.version}`);
      } else {
        log("L'application est à jour.");
      }
    } catch (e: any) {
      err(e.message || String(e));
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownload = async () => {
    if (!updateInfo) return;
    setIsDownloading(true);
    log(`Lancement du téléchargement (${(updateInfo.sizeBytes / 1024 / 1024).toFixed(2)} MB)...`);
    try {
      await platform.updater.download(updateInfo);
    } catch (e: any) {
      err(e.message || String(e));
      setIsDownloading(false);
    }
  };

  const handleInstall = async () => {
    log("Lancement de l'installation...");
    try {
      await platform.updater.install();
      log("Installation réussie.");
    } catch (e: any) {
      err(e.message || String(e));
    }
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Updater Engine Diagnostic (Phase 12)</h1>
      
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <div style={{ flex: 1 }}>
          <h3>1. Contrôle</h3>
          
          <button 
            onClick={handleCheck} 
            disabled={isChecking || isDownloading}
            style={{...btnStyle, opacity: (isChecking || isDownloading) ? 0.5 : 1}}
          >
            {isChecking ? 'Recherche en cours...' : 'Vérifier les mises à jour'}
          </button>
          
          {updateInfo && (
            <div style={{ marginTop: '20px', background: '#e3f2fd', padding: '15px', border: '1px solid #1976d2', borderRadius: '4px' }}>
              <h4>Version {updateInfo.version} disponible !</h4>
              <p style={{ whiteSpace: 'pre-line' }}>{updateInfo.releaseNotes}</p>
              
              <button 
                onClick={handleDownload}
                disabled={isDownloading || progress?.status === 'downloaded'}
                style={{...btnStyle, background: '#1976d2', marginTop: '10px'}}
              >
                {isDownloading ? 'Téléchargement...' : (progress?.status === 'downloaded' ? 'Téléchargé' : 'Télécharger')}
              </button>
            </div>
          )}
          
          {progress && progress.status === 'downloading' && (
            <div style={{ marginTop: '20px', background: '#f5f5f5', padding: '15px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong>Vitesse:</strong> <span>{(progress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s</span>
              </div>
              <div style={{ width: '100%', background: '#ddd', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ width: `${progress.percent}%`, background: '#2e7d32', height: '100%', transition: 'width 0.3s' }}></div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.9em', marginTop: '5px' }}>{progress.percent}%</div>
            </div>
          )}

          {progress && progress.status === 'downloaded' && (
            <button 
              onClick={handleInstall}
              style={{...btnStyle, background: '#d84315', marginTop: '20px'}}
            >
              Installer et Redémarrer
            </button>
          )}

          <h3 style={{ marginTop: '20px' }}>Logs</h3>
          <div style={{ background: '#1e1e1e', color: '#0f0', padding: '10px', borderRadius: '4px', minHeight: '150px' }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
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
