import { session } from 'electron';

export type BrowserStorageKind =
  | 'cookies'
  | 'filesystem'
  | 'indexdb'
  | 'localstorage'
  | 'shadercache'
  | 'serviceworkers'
  | 'cachestorage';

export interface BrowserCacheClearOptions {
  /** Vide le cache HTTP Chromium (sans danger : ni déconnexion, ni perte de données). Défaut : true. */
  httpCache?: boolean;
  /** Efface les stockages cochés. ATTENTION : indexdb/localstorage suppriment les
   *  données locales de l'app (ventes hors-ligne non synchronisées, session) et
   *  déconnectent l'utilisateur → rechargement + resynchronisation requis. */
  storages?: BrowserStorageKind[];
}

export interface BrowserCacheInfo {
  /** Taille du cache HTTP de la session, en octets. */
  httpCacheBytes: number;
}

export interface BrowserCacheClearReport {
  httpCacheCleared: boolean;
  storagesCleared: BrowserStorageKind[];
  /** Vrai quand des stockages ont été effacés : le renderer doit se recharger. */
  requiresReload: boolean;
}

const ALLOWED_STORAGES: BrowserStorageKind[] = [
  'cookies',
  'filesystem',
  'indexdb',
  'localstorage',
  'shadercache',
  'serviceworkers',
  'cachestorage'
];

export class BrowserCacheService {
  static async getInfo(): Promise<BrowserCacheInfo> {
    const httpCacheBytes = await session.defaultSession.getCacheSize();
    return { httpCacheBytes };
  }

  static async clear(options: BrowserCacheClearOptions = {}): Promise<BrowserCacheClearReport> {
    const ses = session.defaultSession;
    const { httpCache = true, storages = [] } = options || {};

    let httpCacheCleared = false;
    if (httpCache) {
      await ses.clearCache();
      httpCacheCleared = true;
    }

    const safe = (storages || []).filter((s): s is BrowserStorageKind => ALLOWED_STORAGES.includes(s));
    const storagesCleared: BrowserStorageKind[] = [];
    if (safe.length > 0) {
      await ses.clearStorageData({ storages: safe });
      storagesCleared.push(...safe);
    }

    return { httpCacheCleared, storagesCleared, requiresReload: storagesCleared.length > 0 };
  }
}
