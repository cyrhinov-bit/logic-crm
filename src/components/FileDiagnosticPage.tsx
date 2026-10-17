import React, { useState } from 'react';
import { platform } from '../platform';

export default function FileDiagnosticPage() {
  const [logs, setLogs] = useState<string[]>([]);

  const log = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 10));
  const err = (msg: string) => setLogs(prev => [`❌ ERREUR: ${msg}`, ...prev].slice(0, 10));

  const runTests = async () => {
    log('Démarrage des tests File Manager...');
    
    if (!platform.isDesktop) {
      return err('Ces tests nécessitent l\'environnement Desktop (Electron).');
    }

    try {
      // 1. Chemins
      log('1. Récupération des chemins...');
      const paths = await platform.files.getSystemPaths();
      log(`-> Temp path: ${paths.temp}`);

      // 2. Fichier Temporaire
      log('2. Création d\'un fichier temporaire...');
      const tempFile = await platform.files.createTempFile('test', 'Hello World!');
      log(`-> Créé à : ${tempFile}`);

      // 3. Écriture / Lecture (Dossier documents)
      log('3. Écriture dans Documents...');
      await platform.files.writeFile('documents', 'test-hinov.txt', 'Contenu de test');
      const content = await platform.files.readFile('documents', 'test-hinov.txt');
      log(`-> Lu : "${content}"`);

      // 4. Test d'existence
      log('4. Vérification d\'existence...');
      const exists = await platform.files.exists('documents', 'test-hinov.txt');
      log(`-> Existe : ${exists}`);

      // 5. Suppression
      log('5. Suppression...');
      await platform.files.deleteFile('documents', 'test-hinov.txt');
      const existsAfter = await platform.files.exists('documents', 'test-hinov.txt');
      log(`-> Existe après suppression : ${existsAfter}`);

      // 6. Test Path Traversal (Sécurité)
      log('6. Test de sécurité (Path Traversal)...');
      try {
        await platform.files.readFile('documents', '../../Windows/System32/cmd.exe');
        err('Fail: Path Traversal non bloqué !');
      } catch (e: any) {
        log(`-> Succès : Path Traversal bloqué (${e.message || e})`);
      }

      log('✅ Tous les tests sont terminés.');

    } catch (e: any) {
      err(e.message || String(e));
    }
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>File Manager Diagnostic (Phase 7)</h1>
      <button 
        onClick={runTests} 
        style={{ padding: '10px 20px', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
      >
        Lancer la série de tests
      </button>

      <div style={{ marginTop: '20px', background: '#1e1e1e', color: '#00ff00', padding: '16px', borderRadius: '8px', minHeight: '300px', fontFamily: 'monospace' }}>
        {logs.map((l, i) => (
          <div key={i} style={{ color: l.startsWith('❌') ? '#ff5252' : '#00ff00' }}>
            {l}
          </div>
        ))}
        {logs.length === 0 && <div style={{ color: '#888' }}>En attente...</div>}
      </div>
    </div>
  );
}
