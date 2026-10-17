import { DesktopOnlyFeatureError } from '../errors';
import type { MailComposeOptions, MailComposeResult, PlatformBridge } from '../types';
import { requestWebPrint } from '../../lib/webPrintBus';

export const browserBridge: PlatformBridge = {
  isDesktop: false,
  system: {
    getVersion: async () => '1.0.0 (Mode Web)',
    getPlatform: async () => 'Navigateur',
    ping: async () => 'pong (simulé)',
    getMetrics: async () => ({ platform: 'Navigateur', userAgent: navigator.userAgent }),
    getBrowserCacheInfo: async () => {
      // Sur le web on ne peut pas mesurer le cache HTTP : on rapporte le stockage estimé.
      let storageBytes = 0;
      try {
        const est = await navigator.storage?.estimate?.();
        storageBytes = est?.usage || 0;
      } catch { /* non supporté */ }
      return { httpCacheBytes: 0, storageBytes };
    },
    clearBrowserCache: async (options) => {
      const storages = options?.storages || [];
      const destructive = storages.filter(s => ['cookies', 'localstorage', 'indexdb'].includes(s));
      if (destructive.length > 0) {
        throw new DesktopOnlyFeatureError(`system.clearBrowserCache(${destructive.join(',')}) — effacement refusé sur le web, utilisez l'application Electron`);
      }
      // Équivalent web : vider le CacheStorage (Service Workers / assets PWA).
      if (typeof caches !== 'undefined') {
        for (const key of await caches.keys()) await caches.delete(key);
      }
      return { httpCacheCleared: true, storagesCleared: [], requiresReload: false };
    },
  },
  dialog: {
    showMessageBox: async (opts) => { alert(opts.message); return { response: 0 }; },
    showOpenDialog: async () => { throw new DesktopOnlyFeatureError('dialog.showOpenDialog'); },
  },
  files: {
    getSystemPaths: async () => { throw new DesktopOnlyFeatureError('files.getSystemPaths'); },
    readFile: async () => { throw new DesktopOnlyFeatureError('files.readFile'); },
    writeFile: async () => { throw new DesktopOnlyFeatureError('files.writeFile'); },
    deleteFile: async () => { throw new DesktopOnlyFeatureError('files.deleteFile'); },
    exists: async () => { throw new DesktopOnlyFeatureError('files.exists'); },
    listDir: async () => { throw new DesktopOnlyFeatureError('files.listDir'); },
    createTempFile: async () => { throw new DesktopOnlyFeatureError('files.createTempFile'); },
    readBinaryFile: async () => { throw new DesktopOnlyFeatureError('files.readBinaryFile'); },
    writeBinaryFile: async () => { throw new DesktopOnlyFeatureError('files.writeBinaryFile'); },
  },
  shell: {
    openExternal: async (url) => { window.open(url, '_blank'); },
    showItemInFolder: async () => { throw new DesktopOnlyFeatureError('shell.showItemInFolder'); },
  },
  mail: {
    // Repli navigateur : ouvre le client mail par défaut via un lien mailto.
    // Les pièces jointes ne peuvent pas être ajoutées automatiquement dans ce mode.
    compose: async (options) => openMailtoInBrowser(options),
    openInDefaultMailApp: async (options) => openMailtoInBrowser(options),
    smtp: {
      // L'envoi SMTP direct est disponible uniquement dans l'application de bureau.
      getStatus: async () => ({ configured: false }),
      setConfig: async () => { throw new DesktopOnlyFeatureError('mail.smtp.setConfig'); },
      clear: async () => { /* rien */ },
      verify: async () => ({ ok: false, mode: 'smtp' as const, errorCode: 'NOT_CONFIGURED', error: 'Disponible uniquement dans l’application de bureau.' }),
      sendTest: async () => ({ ok: false, mode: 'smtp' as const, errorCode: 'NOT_CONFIGURED', error: 'Disponible uniquement dans l’application de bureau.' }),
      send: async () => ({ ok: false, mode: 'smtp' as const, errorCode: 'NOT_CONFIGURED', error: 'Disponible uniquement dans l’application de bureau.' }),
    },
  },
  clipboard: {
    readText: async () => navigator.clipboard.readText(),
    writeText: async (text) => navigator.clipboard.writeText(text),
    clear: async () => navigator.clipboard.writeText(''),
  },
  notifications: {
    showNotification: async (title, body) => {
      try {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/favicon.ico' });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
              if (permission === 'granted') {
                new Notification(title, { body, icon: '/favicon.ico' });
              }
            });
          }
        }
      } catch (err) {
        console.warn('Web Notification error:', err);
      }
    },
  },
  network: {
    isOnline: async () => navigator.onLine,
  },
  logger: {
    info: async (msg) => console.log('[WEB-INFO]', msg),
    warn: async (msg) => console.warn('[WEB-WARN]', msg),
    error: async (msg) => console.error('[WEB-ERROR]', msg),
    getLogs: async () => [],
    exportLogs: async () => 'not_supported_on_web.zip'
  },
  settings: {
    getSetting: async (key) => {
      const data = localStorage.getItem(`erp_settings_${key}`);
      return data ? JSON.parse(data) : null;
    },
    setSetting: async (key, value) => {
      localStorage.setItem(`erp_settings_${key}`, JSON.stringify(value));
    },
  },
  printer: {
    getPrinters: async () => [
      { name: 'Web-Simulated-Printer-1', displayName: 'Imprimante Web (Simulation)', status: 0, isDefault: true }
    ],
    printTestPage: async (name) => { console.log(`[Web] Impression de test sur ${name}`); return 'success'; },
    getQueue: async () => [],
  },
  hardware: {
    getDevices: async () => [
      { id: 'web-1', type: 'scanner', name: 'Simulated Scanner', status: 'connected', path: '/dev/null', capabilities: [], driverLoaded: true }
    ],
    discover: async () => { console.log('[Web] Recherche de périphériques...'); return []; }
  },
  scanner: {
    start: async () => { 
      console.log('[Web] Scanner simulé démarré.');
    },
    stop: async () => { 
      console.log('[Web] Scanner simulé arrêté.');
    },
    getConfig: async () => ({
      prefix: '',
      suffix: 'Enter',
      mode: 'keyboard_wedge'
    }),
    setConfig: async (c) => { console.log('[Web] Scanner config', c); },
    getHistory: async () => [],
    onScan: (_cb) => {
    }
  },
  backup: {
    createBackup: async () => { 
      // Simulation pour le test UI Web
      return new Promise(resolve => {
        let p = 0;
        const i = setInterval(() => {
          p += 10;
          if (p >= 100) { clearInterval(i); resolve('simulated-backup-123'); }
        }, 300);
      });
    },
    restoreBackup: async () => { throw new DesktopOnlyFeatureError('backup.restoreBackup'); },
    getHistory: async () => [],
    onProgress: (_cb) => {
      // Pour une vraie simulation, il faudrait hooker ça au createBackup Web.
      // (Simplifié pour le mock Web)
    }
  },
  updater: {
    checkForUpdates: async () => {
      // Simulate checking in web
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            version: '2.0.0-web',
            releaseDate: new Date().toISOString(),
            releaseNotes: '- Web Simulator Update\n- Cool stuff',
            isMandatory: false,
            sizeBytes: 50000000
          });
        }, 1500);
      });
    },
    download: async (_info) => {
      return new Promise(resolve => {
        let p = 0;
        const i = setInterval(() => {
          p += 20;
          if (p >= 100) { clearInterval(i); resolve(); }
        }, 500);
      });
    },
    install: async () => {},
    getConfig: async () => ({ autoCheck: true, autoDownload: false, channel: 'stable' }),
    setConfig: async () => {},
    getHistory: async () => [],
    onStatus: (_cb) => {}
  },
  diagnostics: {
    runDiagnostics: async () => ({
      timestamp: new Date().toISOString(),
      system: { platform: 'web', arch: 'unknown', cpus: 4, totalMem: 8000000000, freeMem: 4000000000 },
      logs: []
    }),
    getSystemMetrics: async () => ({ platform: 'web', arch: 'unknown', cpus: 4 })
  },
  maintenance: {
    getState: async () => {
      const state = sessionStorage.getItem('erp_maintenance_mode');
      return state === 'true';
    },
    setMode: async (active) => {
      sessionStorage.setItem('erp_maintenance_mode', active.toString());
      console.log(`[Web] Maintenance mode set to ${active}`);
      if (webMaintenanceCallback) webMaintenanceCallback(active);
    },
    onToggle: (cb) => { webMaintenanceCallback = cb; }
  },
  security: {
    getStatus: async () => ({
      environment: { nodeIntegration: false, contextIsolation: true, sandbox: true, webMode: true },
      sessionActive: true,
      secureStorageReady: false
    }),
    checkPermission: async () => true
  },
  performance: {
    getMetrics: async () => ({
      memory: { rss: 120, heapTotal: 80, heapUsed: 50 },
      cacheSize: 0,
      uptime: 3600
    }),
    clearCache: async () => { console.log('[Web] Cache vidé'); return true; },
    runBenchmark: async () => {
      await new Promise(r => setTimeout(r, 600));
      return { durationMs: 600, score: 950 };
    }
  },
  pos: {
    openSale: async (userId) => { console.log(`[Web] Vente ouverte pour ${userId}`); return { id: 'sim-1', userId, status: 'OPEN' }; },
    closeSale: async () => { console.log('[Web] Vente fermée'); return { status: 'CLOSED' }; },
    getSession: async () => null,
    pay: async (amount, method) => { console.log(`[Web] Paiement de ${amount} via ${method}`); return { success: true }; },
    openDrawer: async () => { console.log('[Web] Tiroir-caisse ouvert (simulation)'); return true; },
    printReceipt: async (data) => requestWebPrint(data),
    displayMessage: async (l1, l2) => { console.log(`[Web] LCD: [${l1}] [${l2}]`); return true; },
    onEvent: (_cb) => { console.log('[Web] Enregistrement callback onPosEvent'); }
  },
  sync: {
    enqueue: async (op) => { console.log('[Web] Ajout requête queue', op); },
    forceSync: async () => { console.log('[Web] Synchronisation forcée avec Supabase'); },
    getStatus: async () => ({ isOnline: navigator.onLine, pendingCount: 0, engine: 'renderer' }),
    setNetworkStatus: async (online) => { console.log(`[Web] Simulation réseau: ${online}`); },
    configure: async () => ({ configured: false, engine: 'renderer' }),
    setAuthToken: async () => ({ authenticated: false, engine: 'renderer' }),
    onEvent: (cb) => { window.addEventListener('online', () => cb({ event: 'networkStatusChanged', data: { isOnline: true } })); }
  }
};

let webMaintenanceCallback: ((active: boolean) => void) | null = null;

/** Ouvre le client de messagerie par défaut du navigateur via un lien mailto. */
function openMailtoInBrowser(options: MailComposeOptions): MailComposeResult {
  try {
    const to = (Array.isArray(options.to) ? options.to : [options.to])
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .join(',');
    const params: string[] = [];
    if (options.subject) params.push(`subject=${encodeURIComponent(options.subject)}`);
    if (options.body) params.push(`body=${encodeURIComponent(options.body)}`);
    const url = `mailto:${to}${params.length ? `?${params.join('&')}` : ''}`;
    window.location.href = url;
    return { ok: true, mode: 'mailto' };
  } catch (err: any) {
    return { ok: false, mode: 'mailto', error: err?.message || "Impossible d'ouvrir le client de messagerie." };
  }
}
