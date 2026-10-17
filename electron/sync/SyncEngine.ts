import { SyncQueue } from './SyncQueue.js';
import { SyncWorker } from './SyncWorker.js';
import { ConnectivityMonitor } from './ConnectivityMonitor.js';
import { supabaseRest } from '../services/sync/supabaseRestClient.js';

export interface MainSyncStatus {
  isOnline: boolean;
  configured: boolean;
  authenticated: boolean;
  pendingCount: number;
  failedCount: number;
  lastError: string | null;
  lastSyncAt: string | null;
}

/**
 * Façade du moteur de synchro du main-process, adossée à la base Supabase
 * configurée via `configure()` (URL + clé anon persistées, token en mémoire).
 * Ne traite QUE les opérations explicitement enfilées ici (diagnostic/outils) :
 * la synchronisation métier (ventes, stock…) reste celle du renderer
 * (src/lib/sync.ts) — aucun double envoi.
 */
export class SyncEngine {
  static configure(url: string, anonKey: string): { configured: boolean } {
    supabaseRest.configure(url, anonKey);
    return { configured: supabaseRest.isConfigured() };
  }

  static setAuthToken(token: string | null): { authenticated: boolean } {
    supabaseRest.setAuthToken(token);
    return { authenticated: supabaseRest.isAuthenticated() };
  }

  static enqueue(operation: any) {
    const op = SyncQueue.addOperation(operation);
    if (ConnectivityMonitor.isOnline) {
      void SyncWorker.processQueue().catch(() => {});
    }
    return { id: op.id, kind: op.kind, status: op.status };
  }

  static forceSync() {
    return SyncWorker.processQueue();
  }

  static getStatus(): MainSyncStatus {
    return {
      isOnline: ConnectivityMonitor.isOnline,
      configured: supabaseRest.isConfigured(),
      authenticated: supabaseRest.isAuthenticated(),
      pendingCount: SyncQueue.getPending().length,
      failedCount: SyncQueue.getFailed().length,
      lastError: SyncWorker.getLastError(),
      lastSyncAt: SyncWorker.getLastSyncAt(),
    };
  }

  static setNetworkStatus(online: boolean) {
    ConnectivityMonitor.setStatus(online);
    if (online) {
      void SyncWorker.processQueue().catch(() => {});
    }
    return { isOnline: ConnectivityMonitor.isOnline };
  }
}
