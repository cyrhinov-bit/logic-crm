import React, { useEffect, useState } from 'react';
import { platform, DesktopOnlyFeatureError } from '../platform';

export default function PlatformTest() {
  const [sysInfo, setSysInfo] = useState<{ version: string; platform: string; ping: string } | null>(null);
  const [printerError, setPrinterError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInfo() {
      try {
        const v = await platform.system.getVersion();
        const p = await platform.system.getPlatform();
        const ping = await platform.system.ping();
        setSysInfo({ version: v, platform: p, ping });
      } catch (err: any) {
        console.error('System fetch error:', err);
      }
    }
    loadInfo();
  }, []);

  const testPrinter = async () => {
    try {
      setPrinterError(null);
      await platform.printer.getPrinters();
    } catch (err: any) {
      if (err instanceof DesktopOnlyFeatureError) {
        setPrinterError(err.message);
      } else {
        setPrinterError(`Erreur inattendue: ${err.message}`);
      }
    }
  };

  return (
    <div style={{ padding: '24px', background: platform.isDesktop ? '#e0f7fa' : '#fff3e0', borderRadius: '8px', border: '1px solid #ccc', margin: '24px 0' }}>
      <h2 style={{ marginTop: 0 }}>Test de la Plateforme (Bridge)</h2>
      
      <div style={{ marginBottom: '16px' }}>
        <strong>Mode d'exécution : </strong>
        <span style={{ padding: '4px 8px', borderRadius: '4px', background: platform.isDesktop ? '#00bcd4' : '#ff9800', color: '#fff', fontWeight: 'bold' }}>
          {platform.isDesktop ? 'ELECTRON (Desktop)' : 'NAVIGATEUR (Web)'}
        </span>
      </div>

      {sysInfo ? (
        <div style={{ marginBottom: '16px', background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
          <div><strong>Version :</strong> {sysInfo.version}</div>
          <div><strong>OS / Navigateur :</strong> {sysInfo.platform}</div>
          <div><strong>Ping (Bridge test) :</strong> {sysInfo.ping}</div>
        </div>
      ) : (
        <div style={{ marginBottom: '16px' }}>Chargement des informations système...</div>
      )}

      <div>
        <button onClick={testPrinter} style={{ padding: '8px 16px', cursor: 'pointer', background: '#2196f3', color: 'white', border: 'none', borderRadius: '4px' }}>
          Tester le service Imprimante
        </button>
        {printerError && (
          <div style={{ marginTop: '8px', color: '#d32f2f', background: '#ffebee', padding: '8px', borderRadius: '4px' }}>
            Erreur capturée proprement : {printerError}
          </div>
        )}
      </div>
    </div>
  );
}
