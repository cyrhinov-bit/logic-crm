import { ipcMain, BrowserWindow } from 'electron';
import { SYNC_CHANNELS } from './sync.channels.js';
import { SyncEngine, syncEmitter } from '../../sync/index.js';

function assertOp(op: unknown): void {
  if (!op || typeof op !== 'object') throw new Error('Opération invalide.');
  const kind = (op as any).kind ?? (op as any).type;
  if (typeof kind !== 'string' || kind.length === 0 || kind.length > 64) {
    throw new Error('Opération sans kind/type valide.');
  }
  let size = 0;
  try {
    size = JSON.stringify(op).length;
  } catch {
    throw new Error('Opération non sérialisable.');
  }
  if (size > 1_000_000) throw new Error('Opération trop volumineuse (max 1 Mo).');
}

export function registerSyncHandlers(): void {
  const eventsToForward = ['syncStarted', 'syncProgress', 'syncFailed', 'syncCompleted', 'queueUpdated', 'networkStatusChanged'];
  const forwarded = new Set<string>();
  eventsToForward.forEach(eventName => {
    if (forwarded.has(eventName)) return;
    forwarded.add(eventName);
    syncEmitter.on(eventName, (data) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        if (!win.isDestroyed()) win.webContents.send(SYNC_CHANNELS.ON_EVENT, { event: eventName, data });
      });
    });
  });

  ipcMain.handle(SYNC_CHANNELS.ENQUEUE, (_, op) => {
    assertOp(op);
    return SyncEngine.enqueue(op);
  });
  ipcMain.handle(SYNC_CHANNELS.FORCE_SYNC, () => SyncEngine.forceSync());
  ipcMain.handle(SYNC_CHANNELS.GET_STATUS, () => SyncEngine.getStatus());
  ipcMain.handle(SYNC_CHANNELS.SET_NETWORK, (_, online) => SyncEngine.setNetworkStatus(!!online));
  ipcMain.handle(SYNC_CHANNELS.CONFIGURE, (_, cfg) => {
    if (!cfg || typeof cfg.url !== 'string' || typeof cfg.anonKey !== 'string') {
      throw new Error('Configuration invalide : { url, anonKey } attendus.');
    }
    return SyncEngine.configure(cfg.url, cfg.anonKey);
  });
  ipcMain.handle(SYNC_CHANNELS.SET_AUTH_TOKEN, (_, token) => {
    if (token !== null && (typeof token !== 'string' || token.length > 4096)) {
      throw new Error('Token de session invalide.');
    }
    return SyncEngine.setAuthToken(token);
  });
}
