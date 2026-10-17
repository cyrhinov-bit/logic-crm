import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { platform, DesktopOnlyFeatureError } from '../platform';

export default function DiagnosticPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [paths, setPaths] = useState<any>(null);
  const [clipboardText, setClipboardText] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadInfo();
  }, []);

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 5));
  };

  const catchError = (err: any) => {
    if (err instanceof DesktopOnlyFeatureError) {
      setErrorMsg(`Bloqué (Web) : ${err.message}`);
    } else {
      setErrorMsg(`Erreur native : ${err.message}`);
    }
  };

  const loadInfo = async () => {
    try {
      const m = await platform.system.getMetrics();
      setMetrics(m);
      if (platform.isDesktop) {
        const p = await platform.files.getSystemPaths();
        setPaths(p);
      }
    } catch (e) {
      catchError(e);
    }
  };

  const testDialog = async () => {
    try {
      setErrorMsg(null);
      await platform.dialog.showMessageBox({ title: 'Test', message: 'Ceci est une boîte de dialogue native !' });
      addLog('Dialog affichée avec succès.');
    } catch (e) { catchError(e); }
  };

  const testNotification = async () => {
    try {
      setErrorMsg(null);
      await platform.notifications.showNotification('Hinov Business Suite', 'Notification de test depuis la page de diagnostic !');
      addLog('Notification native envoyée.');
    } catch (e) { catchError(e); }
  };

  const testClipboard = async () => {
    try {
      setErrorMsg(null);
      await platform.clipboard.writeText('Texte copié depuis Hinov Business Suite !');
      const text = await platform.clipboard.readText();
      setClipboardText(text);
      addLog('Presse-papiers modifié et lu.');
    } catch (e) { catchError(e); }
  };

  const testLogger = async () => {
    try {
      setErrorMsg(null);
      await platform.logger.info('Test de log IPC réussi !');
      addLog('Log envoyé au Main Process.');
    } catch (e) { catchError(e); }
  };

  const diagnosticLinks: { path: string; label: string }[] = [
    { path: '/diagnostics/scanner', label: 'Scanner (Douchette)' },
    { path: '/diagnostics/printer', label: 'Imprimante Thermique' },
    { path: '/diagnostics/pos', label: 'Moteur POS' },
    { path: '/diagnostics/hardware', label: 'Matériel' },
    { path: '/diagnostics/files', label: 'Fichiers' },
    { path: '/diagnostics/backup', label: 'Sauvegardes' },
    { path: '/diagnostics/sync', label: 'Synchronisation' },
    { path: '/diagnostics/security', label: 'Sécurité' },
    { path: '/diagnostics/performance', label: 'Performance' },
    { path: '/diagnostics/updater', label: 'Mises à jour' },
    { path: '/diagnostics/support', label: 'Support' }
  ];

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Diagnostic Système (Phase 6)</h1>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {diagnosticLinks.map(link => (
          <Link key={link.path} to={link.path} style={{ padding: '8px 12px', background: '#1976d2', color: 'white', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold', fontSize: '13px' }}>{link.label}</Link>
        ))}
      </div>
      <div style={{ background: platform.isDesktop ? '#e3f2fd' : '#fff3e0', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
        <strong>Environnement Actif : </strong>
        {platform.isDesktop ? 'ELECTRON (Application Bureau Native)' : 'WEB (Navigateur Classique)'}
      </div>

      {errorMsg && (
        <div style={{ background: '#ffebee', color: '#c62828', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #ef9a9a' }}>
          <strong>Attention : </strong> {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 400px', background: '#f5f5f5', padding: '16px', borderRadius: '8px' }}>
          <h3>Métriques OS & Matériel</h3>
          {metrics ? (
            <pre style={{ fontSize: '12px', overflowX: 'auto' }}>
              {JSON.stringify(metrics, null, 2)}
            </pre>
          ) : (
            <p>Chargement...</p>
          )}

          {platform.isDesktop && paths && (
            <>
              <h3>Chemins Système</h3>
              <pre style={{ fontSize: '12px', overflowX: 'auto' }}>
                {JSON.stringify(paths, null, 2)}
              </pre>
            </>
          )}
        </div>

        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3>Tests Fonctionnels</h3>
          <button onClick={testDialog} style={btnStyle}>Ouvrir Boîte de dialogue</button>
          <button onClick={testNotification} style={btnStyle}>Envoyer Notification</button>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={testClipboard} style={btnStyle}>Test Presse-Papiers</button>
            <span style={{ alignSelf: 'center', fontSize: '14px', fontStyle: 'italic' }}>{clipboardText}</span>
          </div>

          <button onClick={testLogger} style={btnStyle}>Test Logger (Regarder console Terminal)</button>

          <div style={{ marginTop: '16px', background: '#e0e0e0', padding: '12px', borderRadius: '8px' }}>
            <strong>Dernières actions :</strong>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
              {logs.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
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
