const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. Errors
write('electron/errors/UpdaterErrors.ts', `
export class UpdaterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class UpdateCheckFailedError extends UpdaterError {}
export class DownloadFailedError extends UpdaterError {}
export class InstallFailedError extends UpdaterError {}
export class RollbackFailedError extends UpdaterError {}
export class InvalidVersionError extends UpdaterError {}
export class NetworkUnavailableError extends UpdaterError {}
`);

// 2. Types & Data Models
write('electron/services/updater/UpdaterTypes.ts', `
export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  isMandatory: boolean;
  sizeBytes: number;
}

export interface UpdateProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  status: 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error';
}

export interface UpdaterConfig {
  autoCheck: boolean;
  autoDownload: boolean;
  channel: 'stable' | 'beta' | 'alpha';
}
`);

// 3. Components
write('electron/services/updater/VersionService.ts', `
export class VersionService {
  static getCurrentVersion(): string { return '1.0.0'; }
  static isNewer(current: string, target: string): boolean {
    return target > current; // Simplifié
  }
}
`);

write('electron/services/updater/UpdateConfiguration.ts', `
import { UpdaterConfig } from './UpdaterTypes.js';

export class UpdateConfiguration {
  private static config: UpdaterConfig = {
    autoCheck: true,
    autoDownload: false,
    channel: 'stable'
  };

  static getConfig(): UpdaterConfig { return { ...this.config }; }
  static setConfig(c: Partial<UpdaterConfig>): void { this.config = { ...this.config, ...c }; }
}
`);

write('electron/services/updater/UpdateHistory.ts', `
export class UpdateHistory {
  private static history: any[] = [];
  static add(entry: any) { this.history.unshift(entry); }
  static getHistory() { return this.history; }
}
`);

write('electron/services/updater/UpdateEvents.ts', `
import { EventEmitter } from 'events';
export const updaterEmitter = new EventEmitter();
`);

write('electron/services/updater/ReleaseNotesService.ts', `
export class ReleaseNotesService {
  static async getNotes(version: string): Promise<string> {
    return "- Améliorations de performance\\n- Correction de bugs mineurs";
  }
}
`);

// Managers
write('electron/services/updater/UpdateChecker.ts', `
import { UpdateInfo } from './UpdaterTypes.js';
import { VersionService } from './VersionService.js';
import { ReleaseNotesService } from './ReleaseNotesService.js';

export class UpdateChecker {
  static async checkForUpdates(): Promise<UpdateInfo | null> {
    // Simulation
    const current = VersionService.getCurrentVersion();
    const newVersion = '2.0.0';
    if (VersionService.isNewer(current, newVersion)) {
      return {
        version: newVersion,
        releaseDate: new Date().toISOString(),
        releaseNotes: await ReleaseNotesService.getNotes(newVersion),
        isMandatory: false,
        sizeBytes: 154000000 // ~154 MB
      };
    }
    return null;
  }
}
`);

write('electron/services/updater/DownloadManager.ts', `
import { updaterEmitter } from './UpdateEvents.js';
import { UpdateInfo } from './UpdaterTypes.js';

export class DownloadManager {
  static async downloadUpdate(info: UpdateInfo): Promise<void> {
    updaterEmitter.emit('status', { status: 'downloading', percent: 0, transferredBytes: 0, totalBytes: info.sizeBytes, bytesPerSecond: 0 });
    
    let transferred = 0;
    const speed = 15000000; // ~15 MB/s
    
    return new Promise(resolve => {
      const interval = setInterval(() => {
        transferred += speed;
        if (transferred >= info.sizeBytes) {
          transferred = info.sizeBytes;
          clearInterval(interval);
          updaterEmitter.emit('status', { status: 'downloaded', percent: 100, transferredBytes: transferred, totalBytes: info.sizeBytes, bytesPerSecond: speed });
          resolve();
        } else {
          const percent = Math.floor((transferred / info.sizeBytes) * 100);
          updaterEmitter.emit('status', { status: 'downloading', percent, transferredBytes: transferred, totalBytes: info.sizeBytes, bytesPerSecond: speed });
        }
      }, 500);
    });
  }
}
`);

write('electron/services/updater/InstallManager.ts', 'export class InstallManager { static async install() { return true; } }');
write('electron/services/updater/RollbackManager.ts', 'export class RollbackManager { static async rollback() { return true; } }');

// 4. Main Manager
write('electron/services/updater/UpdaterManager.ts', `
import { UpdateChecker } from './UpdateChecker.js';
import { DownloadManager } from './DownloadManager.js';
import { InstallManager } from './InstallManager.js';
import { UpdateConfiguration } from './UpdateConfiguration.js';
import { UpdateHistory } from './UpdateHistory.js';
import { updaterEmitter } from './UpdateEvents.js';

export class UpdaterManager {
  static async check() {
    updaterEmitter.emit('status', { status: 'checking', percent: 0, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 });
    await new Promise(r => setTimeout(r, 1000));
    const info = await UpdateChecker.checkForUpdates();
    if (info) {
      updaterEmitter.emit('status', { status: 'available', percent: 0, transferredBytes: 0, totalBytes: info.sizeBytes, bytesPerSecond: 0 });
    } else {
      updaterEmitter.emit('status', { status: 'error', percent: 0, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 });
    }
    return info;
  }
  
  static async download(info: any) {
    return await DownloadManager.downloadUpdate(info);
  }
  
  static async install() {
    updaterEmitter.emit('status', { status: 'installing', percent: 100, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 });
    await InstallManager.install();
    UpdateHistory.add({ version: '2.0.0', date: new Date().toISOString(), status: 'success' });
  }

  static getConfig() { return UpdateConfiguration.getConfig(); }
  static setConfig(c: any) { UpdateConfiguration.setConfig(c); }
  static getHistory() { return UpdateHistory.getHistory(); }
}
`);

// 5. Index
write('electron/services/updater/index.ts', `
export * from './UpdaterTypes.js';
export * from './VersionService.js';
export * from './ReleaseNotesService.js';
export * from './UpdateConfiguration.js';
export * from './UpdateHistory.js';
export * from './UpdateEvents.js';
export * from './UpdateChecker.js';
export * from './DownloadManager.js';
export * from './InstallManager.js';
export * from './RollbackManager.js';
export * from './UpdaterManager.js';
`);

// 6. IPC
write('electron/ipc/updater/updater.channels.ts', `
export const UPDATER_CHANNELS = {
  CHECK: 'updater:check',
  DOWNLOAD: 'updater:download',
  INSTALL: 'updater:install',
  GET_CONFIG: 'updater:getConfig',
  SET_CONFIG: 'updater:setConfig',
  GET_HISTORY: 'updater:getHistory',
  ON_STATUS: 'updater:onStatus'
} as const;
`);

write('electron/ipc/updater/updater.handlers.ts', `
import { ipcMain, BrowserWindow } from 'electron';
import { UPDATER_CHANNELS } from './updater.channels.js';
import { UpdaterManager, updaterEmitter } from '../../services/updater/index.js';
import { UpdaterError } from '../../errors/UpdaterErrors.js';

export function registerUpdaterHandlers(): void {
  updaterEmitter.on('status', (data) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => win.webContents.send(UPDATER_CHANNELS.ON_STATUS, data));
  });

  const handle = (channel: string, handler: (...args: any[]) => Promise<any> | any) => {
    ipcMain.handle(channel, async (_, ...args) => {
      try {
        return await handler(...args);
      } catch (err: any) {
        if (err instanceof UpdaterError) {
          throw new Error(JSON.stringify({ name: err.name, message: err.message }));
        }
        throw err;
      }
    });
  };

  handle(UPDATER_CHANNELS.CHECK, () => UpdaterManager.check());
  handle(UPDATER_CHANNELS.DOWNLOAD, (info) => UpdaterManager.download(info));
  handle(UPDATER_CHANNELS.INSTALL, () => UpdaterManager.install());
  handle(UPDATER_CHANNELS.GET_CONFIG, () => UpdaterManager.getConfig());
  handle(UPDATER_CHANNELS.SET_CONFIG, (c) => UpdaterManager.setConfig(c));
  handle(UPDATER_CHANNELS.GET_HISTORY, () => UpdaterManager.getHistory());
}
`);

console.log('Fichiers Updater générés.');
