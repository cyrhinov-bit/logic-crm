import localforage from 'localforage';

// Configuration avec fallback automatique (IndexedDB -> WebSQL -> LocalStorage) pour éviter les blocages de Quota Chromium / Electron
const drivers = [localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE];

// Tous les object stores attendus par le bundle courant (sauvegarde/restauration).
const expectedStoreNames: string[] = [];

const createStore = (storeName: string) => {
  expectedStoreNames.push(storeName);
  return localforage.createInstance({
    name: 'hinov',
    storeName,
    driver: drivers
  });
};

export const db = {
  profiles: createStore('profiles'),
  clients: createStore('clients'),
  quotes: createStore('quotes'),
  sales: createStore('sales'),
  commissions: createStore('commissions'),
  installments: createStore('installments'),
  facturePaiements: createStore('facturePaiements'),
  couts: createStore('couts'),
  scoringRules: createStore('scoringRules'),
  objectifs: createStore('objectifs'),
  classements: createStore('classements'),
  primes: createStore('primes'),
  primeAuditLogs: createStore('primeAuditLogs'),
  prospects: createStore('prospects'),
  prospectActivities: createStore('prospectActivities'),
  prospectFollowUps: createStore('prospectFollowUps'),
  activityReports: createStore('activityReports'),
  weeklyReports: createStore('weeklyReports'),
  v2DailyReports: createStore('v2DailyReports'),
  v2WeeklyReports: createStore('v2WeeklyReports'),
  categories: createStore('categories'),
  services: createStore('services'),
  prestations: createStore('prestations'),
  settings: createStore('settings'),
  syncQueue: createStore('syncQueue'),
  syncErrors: createStore('syncErrors'),
  syncMetadata: createStore('syncMetadata'),
  // POS
  posCategories: createStore('posCategories'),
  posBrands: createStore('posBrands'),
  posSuppliers: createStore('posSuppliers'),
  posProducts: createStore('posProducts'),
  posStockEntries: createStore('posStockEntries'),
  posInventories: createStore('posInventories'),
  posCashSessions: createStore('posCashSessions'),
  posTransactions: createStore('posTransactions'),
  posPayments: createStore('posPayments'),
  posDiscounts: createStore('posDiscounts'),
  posSettings: createStore('posSettings'),
  posReturns: createStore('posReturns'),
  posStockMovements: createStore('posStockMovements'),
  productCompletions: createStore('productCompletions'),
  importSessions: createStore('importSessions'),
  importErrors: createStore('importErrors'),
  productImages: createStore('productImages'),
  // CRM Documents
  documents: createStore('documents'),
  documentFiles: createStore('documentFiles'),
  crmFolders: createStore('crmFolders'),
  notifications: createStore('notifications'),
  // CRM Modules Responsables
  crmTiers: createStore('crmTiers'),
  crmCommerciaux: createStore('crmCommerciaux'),
  crmPrestations: createStore('crmPrestations'),
  crmCaisse: createStore('crmCaisse'),
  crmCommissions: createStore('crmCommissions'),
  crmArticles: createStore('crmArticles'),
  crmStockMouvements: createStore('crmStockMouvements'),
  crmMaintenance: createStore('crmMaintenance'),
  crmTechniciens: createStore('crmTechniciens'),
  // CRM Facturation
  invoices: createStore('invoices'),
  invoicePayments: createStore('invoicePayments'),
};

// ── Auto-réparation IndexedDB (conflit de version / stores illisibles) ───────
// Contexte observé en prod : un bundle ancien (onglet resté ouvert, chunks PWA
// mélangés) face à une base créée par un bundle plus récent → VersionError
// "can't be downgraded" + NotFoundError sur les stores → cache 100% illisible,
// sync morte, 0 partout. localforage ne s'en sort pas seul dans cet état.
// Stratégie : sauvegarde brute (ouverture SANS version + copie curseur,
// agnostique au format), suppression, recréation à l'identique, restauration.
// Le travail non synchronisé (syncQueue/syncErrors) est préservé ; le reste se
// re-télécharge du serveur. Best-effort, jamais bloquant, une fois par heure max.
const DB_NAME = 'hinov';
const HEAL_MARK_KEY = 'hinov_idb_heal_v1';
const HEAL_COOLDOWN_MS = 60 * 60 * 1000;

const openRawDb = (version?: number): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    try {
      const req = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('open failed'));
      req.onblocked = () => reject(new Error('open blocked'));
    } catch (e) {
      reject(e);
    }
  });

const dumpStoreRaw = (conn: IDBDatabase, store: string): Promise<Array<{ k: any; v: any }>> =>
  new Promise((resolve) => {
    const out: Array<{ k: any; v: any }> = [];
    try {
      if (!conn.objectStoreNames.contains(store)) return resolve(out);
      const tx = conn.transaction(store, 'readonly');
      const cursorReq = tx.objectStore(store).openCursor();
      cursorReq.onsuccess = () => {
        const c = cursorReq.result;
        if (!c) return resolve(out);
        out.push({ k: c.key, v: c.value });
        c.continue();
      };
      cursorReq.onerror = () => resolve(out);
      tx.onabort = () => resolve(out);
    } catch {
      resolve(out);
    }
  });

const deleteRawDb = (): Promise<void> =>
  new Promise((resolve, reject) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('delete failed'));
      req.onblocked = () => reject(new Error('delete blocked (un autre onglet utilise encore la base)'));
    } catch (e) {
      reject(e);
    }
  });

let healthPromise: Promise<void> | null = null;

const runHealthCheck = async (): Promise<void> => {
  if (typeof indexedDB === 'undefined') return;
  // 1. Sonde via localforage : un getItem sur clé absente résout null si sain.
  try {
    await db.syncMetadata.getItem('__probe__');
    return;
  } catch (e: any) {
    const name = String(e?.name || '');
    // Seuls les conflits de version/stores déclenchent la réparation.
    // Toute autre cause (quota, private mode…) : ne jamais détruire la base.
    if (!/VersionError|NotFoundError|InvalidStateError/i.test(name)) return;
  }
  // 2. Anti-boucle : une seule tentative de réparation par heure.
  try {
    const last = Number(localStorage.getItem(HEAL_MARK_KEY) || 0);
    if (Date.now() - last < HEAL_COOLDOWN_MS) {
      console.warn('[Cache] Base locale toujours illisible (réparation déjà tentée il y a moins d\'1h). Fermez les autres onglets puis rechargez la page.');
      return;
    }
  } catch { /* sans localStorage : on tente quand même (garde mémoire) */ }
  console.warn('[Cache] Base locale illisible (conflit de version), réparation : sauvegarde → recréation…');
  // 3. Sauvegarde brute (ouverture sans version : lit même une base "trop récente").
  let backup: Record<string, Array<{ k: any; v: any }>> = {};
  try {
    const raw = await openRawDb();
    try {
      for (const s of Array.from(raw.objectStoreNames)) {
        backup[s] = await dumpStoreRaw(raw, s);
      }
    } finally {
      raw.close();
    }
  } catch (e) {
    console.error('[Cache] Sauvegarde impossible, réparation abandonnée :', e);
    return;
  }
  const savedEntries = Object.values(backup).reduce((n, arr) => n + arr.length, 0);
  // 4. Suppression puis recréation (stores attendus, sans keyPath comme localforage).
  try {
    await deleteRawDb();
  } catch (e) {
    console.error('[Cache] Suppression impossible :', e);
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of expectedStoreNames) {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
        }
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error || new Error('recreate failed'));
      req.onblocked = () => reject(new Error('recreate blocked'));
    });
    // 5. Restauration à l'identique (put valeur/clé, même ordre, mêmes clés).
    const raw2 = await openRawDb();
    try {
      for (const [store, entries] of Object.entries(backup)) {
        if (entries.length === 0 || !raw2.objectStoreNames.contains(store)) continue;
        await new Promise<void>((resolve) => {
          try {
            const tx = raw2.transaction(store, 'readwrite');
            const os = tx.objectStore(store);
            for (const { k, v } of entries) {
              try {
                os.put(v, k);
              } catch { /* entrée non recopiable : ignorée */ }
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
          } catch {
            resolve();
          }
        });
      }
    } finally {
      raw2.close();
    }
    try {
      localStorage.setItem(HEAL_MARK_KEY, String(Date.now()));
    } catch { /* non bloquant */ }
    console.warn(`[Cache] Réparation terminée (${savedEntries} entrée(s) restaurée(s), file de synchro préservée). Si l'affichage reste vide, rechargez la page.`);
  } catch (e) {
    console.error('[Cache] Restauration impossible :', e);
  }
};

/** À attendre avant toute lecture/écriture cache critique (refresh, sync). */
export const ensureDbHealth = (): Promise<void> => {
  if (!healthPromise) {
    healthPromise = runHealthCheck().catch(() => {});
  }
  return healthPromise;
};

// Démarrage proactif (sans bloquer l'import) ; les chemins critiques
// (refreshData, processSyncQueue, queueSyncAction) attendent aussi cette promesse.
if (typeof window !== 'undefined') {
  void ensureDbHealth();
}

