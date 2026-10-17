const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. Errors
write('electron/errors/SyncErrors.ts',
  "export class SyncError extends Error {\n" +
  "  constructor(message: string) {\n" +
  "    super(message);\n" +
  "    this.name = this.constructor.name;\n" +
  "  }\n" +
  "}\n" +
  "export class SyncFailedError extends SyncError {}\n" +
  "export class NetworkOfflineError extends SyncError {}\n" +
  "export class ConflictResolutionError extends SyncError {}\n" +
  "export class QueueFullError extends SyncError {}\n"
);

// 2. Sync Modules
write('electron/sync/SyncEvents.ts',
  "import { EventEmitter } from 'events';\n" +
  "export const syncEmitter = new EventEmitter();\n"
);

write('electron/sync/OfflineDatabase.ts', "export class OfflineDatabase {}");
write('electron/sync/ChangeTracker.ts', "export class ChangeTracker {}");
write('electron/sync/SyncScheduler.ts', "export class SyncScheduler {}");
write('electron/sync/ConflictResolver.ts', "export class ConflictResolver {}");
write('electron/sync/SyncHistory.ts', "export class SyncHistory {}");
write('electron/sync/RetryManager.ts', "export class RetryManager {}");
write('electron/sync/SyncConfiguration.ts', "export class SyncConfiguration {}");
write('electron/sync/SyncMetrics.ts', "export class SyncMetrics {}");

write('electron/sync/ConnectivityMonitor.ts',
  "import { syncEmitter } from './SyncEvents.js';\n" +
  "export class ConnectivityMonitor {\n" +
  "  static isOnline: boolean = true;\n" +
  "  static setStatus(online: boolean) {\n" +
  "    this.isOnline = online;\n" +
  "    syncEmitter.emit('networkStatusChanged', { isOnline: online });\n" +
  "  }\n" +
  "}\n"
);

write('electron/sync/SyncQueue.ts',
  "import { syncEmitter } from './SyncEvents.js';\n" +
  "export class SyncQueue {\n" +
  "  private static queue: any[] = [];\n" +
  "  static addOperation(operation: any) {\n" +
  "    this.queue.push({ ...operation, id: Date.now().toString(), status: 'PENDING' });\n" +
  "    syncEmitter.emit('queueUpdated', { size: this.queue.length });\n" +
  "  }\n" +
  "  static getPending() { return this.queue.filter(op => op.status === 'PENDING'); }\n" +
  "  static markDone(id: string) {\n" +
  "    const op = this.queue.find(o => o.id === id);\n" +
  "    if (op) op.status = 'DONE';\n" +
  "    syncEmitter.emit('queueUpdated', { size: this.getPending().length });\n" +
  "  }\n" +
  "}\n"
);

write('electron/sync/SyncWorker.ts',
  "import { SyncQueue } from './SyncQueue.js';\n" +
  "import { ConnectivityMonitor } from './ConnectivityMonitor.js';\n" +
  "import { syncEmitter } from './SyncEvents.js';\n" +
  "export class SyncWorker {\n" +
  "  static async processQueue() {\n" +
  "    if (!ConnectivityMonitor.isOnline) return;\n" +
  "    const pending = SyncQueue.getPending();\n" +
  "    if (pending.length === 0) return;\n\n" +
  "    syncEmitter.emit('syncStarted', { operationsCount: pending.length });\n" +
  "    for (const op of pending) {\n" +
  "      await new Promise(r => setTimeout(r, 300)); // Simulate sync\n" +
  "      SyncQueue.markDone(op.id);\n" +
  "      syncEmitter.emit('syncProgress', { opId: op.id });\n" +
  "    }\n" +
  "    syncEmitter.emit('syncCompleted', { successCount: pending.length });\n" +
  "  }\n" +
  "}\n"
);

write('electron/sync/SyncEngine.ts',
  "import { SyncQueue } from './SyncQueue.js';\n" +
  "import { SyncWorker } from './SyncWorker.js';\n" +
  "import { ConnectivityMonitor } from './ConnectivityMonitor.js';\n\n" +
  "export class SyncEngine {\n" +
  "  static enqueue(operation: any) {\n" +
  "    SyncQueue.addOperation(operation);\n" +
  "    if (ConnectivityMonitor.isOnline) SyncWorker.processQueue();\n" +
  "  }\n" +
  "  static forceSync() { return SyncWorker.processQueue(); }\n" +
  "  static getStatus() {\n" +
  "    return {\n" +
  "      isOnline: ConnectivityMonitor.isOnline,\n" +
  "      pendingCount: SyncQueue.getPending().length\n" +
  "    };\n" +
  "  }\n" +
  "  static setNetworkStatus(online: boolean) {\n" +
  "    ConnectivityMonitor.setStatus(online);\n" +
  "    if (online) SyncWorker.processQueue();\n" +
  "  }\n" +
  "}\n"
);

write('electron/sync/index.ts',
  "export * from './SyncEngine.js';\n" +
  "export * from './SyncEvents.js';\n"
);

// 3. IPC
write('electron/ipc/sync/sync.channels.ts',
  "export const SYNC_CHANNELS = {\n" +
  "  ENQUEUE: 'sync:enqueue',\n" +
  "  FORCE_SYNC: 'sync:forceSync',\n" +
  "  GET_STATUS: 'sync:getStatus',\n" +
  "  SET_NETWORK: 'sync:setNetwork',\n" +
  "  ON_EVENT: 'sync:onEvent'\n" +
  "} as const;\n"
);

write('electron/ipc/sync/sync.handlers.ts',
  "import { ipcMain, BrowserWindow } from 'electron';\n" +
  "import { SYNC_CHANNELS } from './sync.channels.js';\n" +
  "import { SyncEngine, syncEmitter } from '../../sync/index.js';\n\n" +
  "export function registerSyncHandlers(): void {\n" +
  "  const eventsToForward = ['syncStarted', 'syncProgress', 'syncCompleted', 'queueUpdated', 'networkStatusChanged'];\n" +
  "  eventsToForward.forEach(eventName => {\n" +
  "    syncEmitter.on(eventName, (data) => {\n" +
  "      const windows = BrowserWindow.getAllWindows();\n" +
  "      windows.forEach(win => win.webContents.send(SYNC_CHANNELS.ON_EVENT, { event: eventName, data }));\n" +
  "    });\n" +
  "  });\n\n" +
  "  ipcMain.handle(SYNC_CHANNELS.ENQUEUE, (_, op) => SyncEngine.enqueue(op));\n" +
  "  ipcMain.handle(SYNC_CHANNELS.FORCE_SYNC, () => SyncEngine.forceSync());\n" +
  "  ipcMain.handle(SYNC_CHANNELS.GET_STATUS, () => SyncEngine.getStatus());\n" +
  "  ipcMain.handle(SYNC_CHANNELS.SET_NETWORK, (_, online) => SyncEngine.setNetworkStatus(online));\n" +
  "}\n"
);

console.log('Fichiers Phase 18 générés.');
