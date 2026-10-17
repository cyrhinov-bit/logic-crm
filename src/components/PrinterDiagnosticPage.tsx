import React, { useState, useEffect } from 'react';
import { platform } from '../platform';
import type { PrintJob } from '../platform/types';

export default function PrinterDiagnosticPage() {
  const [printers, setPrinters] = useState<any[]>([]);
  const [queue, setQueue] = useState<PrintJob[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);

  const log = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 10));
  const err = (msg: string) => setLogs(prev => [`❌ ERREUR: ${msg}`, ...prev].slice(0, 10));

  useEffect(() => {
    if (platform.isDesktop) {
      loadPrinters();
      const interval = setInterval(loadQueue, 1000);
      return () => clearInterval(interval);
    }
  }, []);

  const loadPrinters = async () => {
    try {
      const p = await platform.printer.getPrinters();
      setPrinters(p);
      if (p.length > 0) setSelectedPrinter(p[0].name);
      log(`${p.length} imprimantes trouvées.`);
    } catch (e: any) {
      err(e.message || String(e));
    }
  };

  const loadQueue = async () => {
    try {
      const q = await platform.printer.getQueue();
      setQueue([...q]); // clone pour forcer le rerender
    } catch (e) {
      console.warn('Failed to load printer queue', e);
    }
  };

  const testPrint = async () => {
    if (!selectedPrinter) return err('Veuillez sélectionner une imprimante.');
    try {
      log(`Lancement de l'impression test sur ${selectedPrinter}...`);
      const jobId = await platform.printer.printTestPage(selectedPrinter);
      log(`Job ajouté : ${jobId}`);
    } catch (e: any) {
      err(e.message || String(e));
    }
  };

  if (!platform.isDesktop) {
    return (
      <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
        <h1>Printer Engine Diagnostic</h1>
        <div style={{ color: 'red' }}>Ce module nécessite Electron.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Printer Engine Diagnostic (Phase 8)</h1>
      
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <h3>1. Découverte des imprimantes</h3>
          <select 
            value={selectedPrinter} 
            onChange={(e) => setSelectedPrinter(e.target.value)}
            style={{ padding: '8px', width: '100%', marginBottom: '10px' }}
          >
            {printers.map(p => (
              <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
            ))}
          </select>
          <button onClick={testPrint} style={btnStyle}>Imprimer Page de Test</button>
          
          <h3 style={{ marginTop: '20px' }}>Logs</h3>
          <div style={{ background: '#1e1e1e', color: '#0f0', padding: '10px', borderRadius: '4px', minHeight: '150px' }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h3>2. File d'attente d'impression (Temps réel)</h3>
          <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '8px', minHeight: '300px' }}>
            {queue.length === 0 ? <div>Aucun travail en attente.</div> : (
              queue.map(job => (
                <div key={job.id} style={{ padding: '10px', borderBottom: '1px solid #ddd' }}>
                  <strong>ID:</strong> {job.id} <br/>
                  <strong>Statut:</strong> 
                  <span style={{ 
                    color: job.status === 'completed' ? 'green' : job.status === 'printing' ? 'blue' : 'orange',
                    fontWeight: 'bold', marginLeft: '5px' 
                  }}>
                    {job.status.toUpperCase()}
                  </span><br/>
                  <strong>Date:</strong> {new Date(job.date).toLocaleTimeString()}
                </div>
              ))
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
