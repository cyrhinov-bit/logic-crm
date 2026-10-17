import React, { useState, useEffect } from 'react';
import { platform } from '../platform';

export default function PerformanceDiagnosticPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [benchmark, setBenchmark] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [browserCache, setBrowserCache] = useState<{ httpCacheBytes: number; storageBytes?: number } | null>(null);
  const [clearingBrowserCache, setClearingBrowserCache] = useState(false);
  const [storages, setStorages] = useState<string[]>([]);

  const STORAGE_OPTIONS = [
    { id: 'cookies', label: 'Cookies' },
    { id: 'localstorage', label: 'LocalStorage (session, préférences)' },
    { id: 'indexdb', label: 'IndexedDB (données locales, ventes hors-ligne)' },
    { id: 'serviceworkers', label: 'Service Workers' },
    { id: 'cachestorage', label: 'Cache Storage' },
  ];

  useEffect(() => {
    loadMetrics();
    loadBrowserCacheInfo();
    const interval = setInterval(loadMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadBrowserCacheInfo = async () => {
    try {
      const info = await platform.system.getBrowserCacheInfo();
      setBrowserCache(info);
    } catch (e) {
      console.error(e);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined || bytes === null) return '—';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
  };

  const toggleStorage = (id: string) => {
    setStorages(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const loadMetrics = async () => {
    try {
      const m = await platform.performance.getMetrics();
      setMetrics(m);
    } catch(e) {
      console.error(e);
    }
  };

  const handleClearCache = async () => {
    await platform.performance.clearCache();
    await loadMetrics();
    alert("Cache vidé et Garbage Collector appelé (si dispo).");
  };

  // Cache navigateur Chromium : le vidage HTTP seul est sans danger
  // (ni déconnexion, ni perte de données). L'effacement des stockages
  // (IndexedDB/LocalStorage) supprime les données locales non synchronisées
  // et déconnecte : rechargement obligatoire derrière.
  const handleClearBrowserCache = async () => {
    setClearingBrowserCache(true);
    try {
      await platform.system.clearBrowserCache({ httpCache: true });
      await loadBrowserCacheInfo();
      alert("Cache navigateur (HTTP) vidé.");
    } catch (e: any) {
      alert("Échec du vidage : " + (e?.message || e));
    } finally {
      setClearingBrowserCache(false);
    }
  };

  const handleClearBrowserStorage = async () => {
    if (storages.length === 0) {
      alert("Cochez au moins un stockage à effacer.");
      return;
    }
    const ok = window.confirm(
      "ATTENTION — IRRÉVERSIBLE : efface " + storages.join(', ') + ".\n\n" +
      "Cela supprime les données locales (dont les ventes hors-ligne non synchronisées), " +
      "déconnecte l'utilisateur et recharge l'application.\n\n" +
      "Vérifiez que tout est synchronisé avant de continuer. Continuer ?"
    );
    if (!ok) return;
    setClearingBrowserCache(true);
    try {
      const report = await platform.system.clearBrowserCache({ httpCache: true, storages });
      await loadBrowserCacheInfo();
      alert(
        "Stockages effacés : " + (report.storagesCleared.join(', ') || 'aucun') + ".\n" +
        "L'application va se recharger."
      );
      window.location.reload();
    } catch (e: any) {
      alert("Échec de l'effacement : " + (e?.message || e));
    } finally {
      setClearingBrowserCache(false);
    }
  };

  const handleBenchmark = async () => {
    setLoading(true);
    try {
      const res = await platform.performance.runBenchmark();
      setBenchmark(res);
    } catch(e) {
      alert("Erreur de benchmark : " + String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!metrics) return <div>Chargement des métriques...</div>;

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Centre de Performances & Optimisation (Phase 15)</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        
        {/* Colonne 1 : RAM / CPU */}
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '4px' }}>
          <h3>Mémoire & Système (Electron Main Process)</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li><strong>RSS (Resident Set Size):</strong> {metrics.memory.rss} MB</li>
            <li><strong>Heap Total:</strong> {metrics.memory.heapTotal} MB</li>
            <li><strong>Heap Used:</strong> {metrics.memory.heapUsed} MB</li>
            <li><strong>Uptime:</strong> {Math.round(metrics.uptime)} secondes</li>
          </ul>
        </div>

        {/* Colonne 2 : Cache */}
        <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '4px' }}>
          <h3>Cache applicatif (mémoire)</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li><strong>Taille du Cache:</strong> {metrics.cacheSize} objets</li>
          </ul>
          <button 
            onClick={handleClearCache}
            style={{ padding: '8px 16px', background: '#388e3c', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}
          >
            Purger le cache et forcer le GC
          </button>
        </div>

        {/* Colonne 3 : Cache navigateur (Chromium / Electron) */}
        <div style={{ background: '#e3f2fd', padding: '15px', borderRadius: '4px', gridColumn: 'span 2' }}>
          <h3>Cache navigateur (Chromium — session Electron)</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li><strong>Cache HTTP :</strong> {browserCache ? formatBytes(browserCache.httpCacheBytes) : 'Chargement...'}</li>
            {browserCache?.storageBytes !== undefined && browserCache.storageBytes > 0 && (
              <li><strong>Stockage estimé (web) :</strong> {formatBytes(browserCache.storageBytes)}</li>
            )}
            {!platform.isDesktop && (
              <li style={{ color: '#666' }}>Mode web : seul le CacheStorage peut être vidé ici.</li>
            )}
          </ul>
          <button
            onClick={handleClearBrowserCache}
            disabled={clearingBrowserCache}
            style={{ padding: '8px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}
          >
            {clearingBrowserCache ? "Vidage en cours..." : "Vider le cache navigateur (sans danger)"}
          </button>

          <div style={{ marginTop: '14px', padding: '10px', background: '#fff', border: '1px solid #90caf9', borderRadius: '4px' }}>
            <strong>Effacement avancé des stockages</strong>
            <div style={{ fontSize: '12px', color: '#b71c1c', margin: '6px 0' }}>
              Irréversible : supprime les données locales (ventes hors-ligne non synchronisées incluses),
              déconnecte l'utilisateur et recharge l'application. Ne cocher qu'après synchronisation complète.
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {STORAGE_OPTIONS.map(opt => (
                <label key={opt.id} style={{ fontSize: '13px', display: 'flex', gap: '4px', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={storages.includes(opt.id)} onChange={() => toggleStorage(opt.id)} />
                  {opt.label}
                </label>
              ))}
            </div>
            <button
              onClick={handleClearBrowserStorage}
              disabled={clearingBrowserCache || storages.length === 0}
              style={{ padding: '8px 16px', background: storages.length === 0 ? '#ccc' : '#d32f2f', color: '#fff', border: 'none', borderRadius: '4px', cursor: storages.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              Effacer les stockages sélectionnés
            </button>
          </div>
        </div>
        
        {/* Colonne 4 : Benchmark */}
        <div style={{ background: '#fff3e0', padding: '15px', borderRadius: '4px', gridColumn: 'span 2' }}>
          <h3>Tests de Performance & IPC</h3>
          <p>Mesure de la latence du canal IPC et de l'exécution d'un traitement asynchrone.</p>
          <button 
            onClick={handleBenchmark}
            disabled={loading}
            style={{ padding: '8px 16px', cursor: 'pointer', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '4px' }}
          >
            {loading ? "Test en cours..." : "Lancer le Benchmark"}
          </button>

          {benchmark && (
            <div style={{ marginTop: '15px', padding: '10px', background: '#fff', border: '1px solid #ffcc80', borderRadius: '4px' }}>
              <strong>Durée d'exécution (ms) :</strong> {benchmark.durationMs} ms<br/>
              <strong>Score de performance :</strong> {benchmark.score} pts
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
