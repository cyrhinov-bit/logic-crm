const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. Errors
write('electron/errors/BackupErrors.ts', `
export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class BackupFailedError extends BackupError {}
export class RestoreFailedError extends BackupError {}
export class BackupCorruptedError extends BackupError {}
export class BackupVersionMismatchError extends BackupError {}
export class BackupEncryptionError extends BackupError {}
export class InsufficientDiskSpaceError extends BackupError {}
`);

// 2. Types / Metadata
write('electron/services/backup/BackupMetadata.ts', `
export interface BackupMetadata {
  id: string;
  date: string;
  appVersion: string;
  sizeBytes: number;
  type: 'full' | 'incremental' | 'custom';
  modules: string[];
  checksum: string;
  durationMs: number;
}
`);

// 3. Components
write('electron/services/backup/BackupCompressor.ts', `
export class BackupCompressor {
  static async compress(sourcePath: string, destPath: string): Promise<boolean> {
    // Squelette de compression (zip)
    return true;
  }
}
`);

write('electron/services/backup/BackupEncryptor.ts', `
export class BackupEncryptor {
  static async encrypt(data: Buffer, key: string): Promise<Buffer> {
    return data;
  }
}
`);

write('electron/services/backup/BackupValidator.ts', `
import { BackupMetadata } from './BackupMetadata.js';

export class BackupValidator {
  static async validate(archivePath: string): Promise<{ valid: boolean, metadata?: BackupMetadata }> {
    return { valid: true };
  }
}
`);

write('electron/services/backup/BackupHistory.ts', `
import { BackupMetadata } from './BackupMetadata.js';

export class BackupHistory {
  private static history: BackupMetadata[] = [];
  static add(entry: BackupMetadata) { this.history.unshift(entry); }
  static getHistory() { return this.history; }
}
`);

// 4. Progress Emitter
write('electron/services/backup/BackupEvents.ts', `
import { EventEmitter } from 'events';
export const backupEmitter = new EventEmitter();
`);

// 5. Services
write('electron/services/backup/BackupService.ts', `
import { randomUUID } from 'crypto';
import { backupEmitter } from './BackupEvents.js';
import { BackupHistory } from './BackupHistory.js';
import { BackupMetadata } from './BackupMetadata.js';

export class BackupService {
  static async createBackup(): Promise<string> {
    const backupId = randomUUID();
    
    // Simulation d'étapes asynchrones avec progression
    backupEmitter.emit('progress', { step: 'Préparation', percent: 10 });
    await new Promise(r => setTimeout(r, 500));
    
    backupEmitter.emit('progress', { step: 'Copie des fichiers', percent: 40 });
    await new Promise(r => setTimeout(r, 600));
    
    backupEmitter.emit('progress', { step: 'Compression de l\\'archive', percent: 80 });
    await new Promise(r => setTimeout(r, 700));
    
    backupEmitter.emit('progress', { step: 'Vérification', percent: 100 });
    
    const meta: BackupMetadata = {
      id: backupId,
      date: new Date().toISOString(),
      appVersion: '1.0.0',
      sizeBytes: 1543000,
      type: 'full',
      modules: ['database', 'settings', 'documents'],
      checksum: 'fake-checksum-83nf',
      durationMs: 1800
    };
    
    BackupHistory.add(meta);
    return backupId;
  }
}
`);

write('electron/services/backup/RestoreService.ts', 'export class RestoreService { static async restoreBackup(path: string) { return true; } }');
write('electron/services/backup/BackupScheduler.ts', 'export class BackupScheduler {}');
write('electron/services/backup/BackupRetention.ts', 'export class BackupRetention {}');

// 6. Manager
write('electron/services/backup/BackupManager.ts', `
import { BackupService } from './BackupService.js';
import { RestoreService } from './RestoreService.js';
import { BackupHistory } from './BackupHistory.js';

export class BackupManager {
  static async create() { return await BackupService.createBackup(); }
  static async restore(path: string) { return await RestoreService.restoreBackup(path); }
  static getHistory() { return BackupHistory.getHistory(); }
}
`);

// 7. Index
write('electron/services/backup/index.ts', `
export * from './BackupMetadata.js';
export * from './BackupErrors.js';
export * from './BackupEvents.js';
export * from './BackupManager.js';
export * from './BackupHistory.js';
`);

// 8. IPC
write('electron/ipc/backup/backup.channels.ts', `
export const BACKUP_CHANNELS = {
  CREATE: 'backup:create',
  RESTORE: 'backup:restore',
  GET_HISTORY: 'backup:getHistory',
  ON_PROGRESS: 'backup:onProgress'
} as const;
`);

write('electron/ipc/backup/backup.handlers.ts', `
import { ipcMain, BrowserWindow } from 'electron';
import { BACKUP_CHANNELS } from './backup.channels.js';
import { BackupManager, backupEmitter } from '../../services/backup/index.js';
import { BackupError } from '../../errors/BackupErrors.js';

export function registerBackupHandlers(): void {
  backupEmitter.on('progress', (data) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => win.webContents.send(BACKUP_CHANNELS.ON_PROGRESS, data));
  });

  const handle = (channel: string, handler: (...args: any[]) => Promise<any> | any) => {
    ipcMain.handle(channel, async (_, ...args) => {
      try {
        return await handler(...args);
      } catch (err: any) {
        if (err instanceof BackupError) {
          throw new Error(JSON.stringify({ name: err.name, message: err.message }));
        }
        throw err;
      }
    });
  };

  handle(BACKUP_CHANNELS.CREATE, () => BackupManager.create());
  handle(BACKUP_CHANNELS.RESTORE, (path) => BackupManager.restore(path));
  handle(BACKUP_CHANNELS.GET_HISTORY, () => BackupManager.getHistory());
}
`);

console.log('Fichiers Backup générés.');
