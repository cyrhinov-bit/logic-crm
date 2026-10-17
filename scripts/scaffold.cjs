const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  fs.writeFileSync(path.join(__dirname, filePath), content.trim() + '\n');
}

// --- SYSTEM (update) ---
write('electron/services/system/system.service.ts', `
import { app } from 'electron';
import os from 'os';

export class SystemService {
  static getVersion(): string { return app.getVersion(); }
  static getPlatform(): string { return os.platform(); }
  static ping(): string { return 'pong'; }
  static getMetrics(): any {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: os.platform(),
      architecture: os.arch(),
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      cpus: os.cpus().length,
      username: os.userInfo().username,
      language: app.getLocale(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }
}
`);
write('electron/ipc/system/system.channels.ts', `
export const SYSTEM_CHANNELS = {
  GET_VERSION: 'system:getVersion',
  GET_PLATFORM: 'system:getPlatform',
  PING: 'system:ping',
  GET_METRICS: 'system:getMetrics'
} as const;
`);
write('electron/ipc/system/system.handlers.ts', `
import { ipcMain } from 'electron';
import { SYSTEM_CHANNELS } from './system.channels.js';
import { SystemService } from '../../services/system/system.service.js';

export function registerSystemHandlers(): void {
  ipcMain.handle(SYSTEM_CHANNELS.GET_VERSION, () => SystemService.getVersion());
  ipcMain.handle(SYSTEM_CHANNELS.GET_PLATFORM, () => SystemService.getPlatform());
  ipcMain.handle(SYSTEM_CHANNELS.PING, () => SystemService.ping());
  ipcMain.handle(SYSTEM_CHANNELS.GET_METRICS, () => SystemService.getMetrics());
}
`);

// --- DIALOG ---
write('electron/services/dialog/dialog.service.ts', `
import { dialog } from 'electron';
import { WindowManager } from '../../windows/WindowManager.js';

export class DialogService {
  static async showMessageBox(options: any): Promise<any> {
    const win = WindowManager.getMainWindow();
    return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
  }
  static async showOpenDialog(options: any): Promise<any> {
    const win = WindowManager.getMainWindow();
    return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
  }
}
`);
write('electron/ipc/dialog/dialog.channels.ts', `
export const DIALOG_CHANNELS = {
  SHOW_MESSAGE_BOX: 'dialog:showMessageBox',
  SHOW_OPEN_DIALOG: 'dialog:showOpenDialog'
} as const;
`);
write('electron/ipc/dialog/dialog.handlers.ts', `
import { ipcMain } from 'electron';
import { DIALOG_CHANNELS } from './dialog.channels.js';
import { DialogService } from '../../services/dialog/dialog.service.js';

export function registerDialogHandlers(): void {
  ipcMain.handle(DIALOG_CHANNELS.SHOW_MESSAGE_BOX, (_, opts) => DialogService.showMessageBox(opts));
  ipcMain.handle(DIALOG_CHANNELS.SHOW_OPEN_DIALOG, (_, opts) => DialogService.showOpenDialog(opts));
}
`);

// --- FILESYSTEM ---
write('electron/services/filesystem/filesystem.service.ts', `
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { app } from 'electron';

export class FileSystemService {
  static async readFile(filePath: string): Promise<string> { return fs.readFile(filePath, 'utf-8'); }
  static async writeFile(filePath: string, content: string): Promise<boolean> {
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  }
  static async exists(filePath: string): Promise<boolean> { return existsSync(filePath); }
  static getSystemPaths(): any {
    return {
      userData: app.getPath('userData'),
      appData: app.getPath('appData'),
      documents: app.getPath('documents'),
      downloads: app.getPath('downloads')
    };
  }
}
`);
write('electron/ipc/filesystem/filesystem.channels.ts', `
export const FS_CHANNELS = {
  READ_FILE: 'fs:readFile',
  WRITE_FILE: 'fs:writeFile',
  EXISTS: 'fs:exists',
  GET_PATHS: 'fs:getPaths'
} as const;
`);
write('electron/ipc/filesystem/filesystem.handlers.ts', `
import { ipcMain } from 'electron';
import { FS_CHANNELS } from './filesystem.channels.js';
import { FileSystemService } from '../../services/filesystem/filesystem.service.js';

export function registerFileSystemHandlers(): void {
  ipcMain.handle(FS_CHANNELS.READ_FILE, (_, p) => FileSystemService.readFile(p));
  ipcMain.handle(FS_CHANNELS.WRITE_FILE, (_, p, c) => FileSystemService.writeFile(p, c));
  ipcMain.handle(FS_CHANNELS.EXISTS, (_, p) => FileSystemService.exists(p));
  ipcMain.handle(FS_CHANNELS.GET_PATHS, () => FileSystemService.getSystemPaths());
}
`);

// --- SHELL ---
write('electron/services/shell/shell.service.ts', `
import { shell } from 'electron';

export class ShellService {
  static async openExternal(url: string): Promise<void> { await shell.openExternal(url); }
  static showItemInFolder(fullPath: string): void { shell.showItemInFolder(fullPath); }
}
`);
write('electron/ipc/shell/shell.channels.ts', `
export const SHELL_CHANNELS = {
  OPEN_EXTERNAL: 'shell:openExternal',
  SHOW_ITEM_IN_FOLDER: 'shell:showItemInFolder'
} as const;
`);
write('electron/ipc/shell/shell.handlers.ts', `
import { ipcMain } from 'electron';
import { SHELL_CHANNELS } from './shell.channels.js';
import { ShellService } from '../../services/shell/shell.service.js';

export function registerShellHandlers(): void {
  ipcMain.handle(SHELL_CHANNELS.OPEN_EXTERNAL, (_, url) => ShellService.openExternal(url));
  ipcMain.handle(SHELL_CHANNELS.SHOW_ITEM_IN_FOLDER, (_, path) => { ShellService.showItemInFolder(path); });
}
`);

// --- CLIPBOARD ---
write('electron/services/clipboard/clipboard.service.ts', `
import { clipboard } from 'electron';

export class ClipboardService {
  static readText(): string { return clipboard.readText(); }
  static writeText(text: string): void { clipboard.writeText(text); }
  static clear(): void { clipboard.clear(); }
}
`);
write('electron/ipc/clipboard/clipboard.channels.ts', `
export const CLIPBOARD_CHANNELS = {
  READ_TEXT: 'clipboard:readText',
  WRITE_TEXT: 'clipboard:writeText',
  CLEAR: 'clipboard:clear'
} as const;
`);
write('electron/ipc/clipboard/clipboard.handlers.ts', `
import { ipcMain } from 'electron';
import { CLIPBOARD_CHANNELS } from './clipboard.channels.js';
import { ClipboardService } from '../../services/clipboard/clipboard.service.js';

export function registerClipboardHandlers(): void {
  ipcMain.handle(CLIPBOARD_CHANNELS.READ_TEXT, () => ClipboardService.readText());
  ipcMain.handle(CLIPBOARD_CHANNELS.WRITE_TEXT, (_, text) => { ClipboardService.writeText(text); });
  ipcMain.handle(CLIPBOARD_CHANNELS.CLEAR, () => { ClipboardService.clear(); });
}
`);

// --- NOTIFICATION ---
write('electron/services/notification/notification.service.ts', `
import { Notification } from 'electron';

export class NotificationService {
  static show(title: string, body: string): void {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  }
}
`);
write('electron/ipc/notification/notification.channels.ts', `
export const NOTIFICATION_CHANNELS = {
  SHOW: 'notification:show'
} as const;
`);
write('electron/ipc/notification/notification.handlers.ts', `
import { ipcMain } from 'electron';
import { NOTIFICATION_CHANNELS } from './notification.channels.js';
import { NotificationService } from '../../services/notification/notification.service.js';

export function registerNotificationHandlers(): void {
  ipcMain.handle(NOTIFICATION_CHANNELS.SHOW, (_, title, body) => { NotificationService.show(title, body); });
}
`);

// --- NETWORK ---
write('electron/services/network/network.service.ts', `
import { net } from 'electron';

export class NetworkService {
  static isOnline(): boolean { return net.isOnline(); }
}
`);
write('electron/ipc/network/network.channels.ts', `
export const NETWORK_CHANNELS = {
  IS_ONLINE: 'network:isOnline'
} as const;
`);
write('electron/ipc/network/network.handlers.ts', `
import { ipcMain } from 'electron';
import { NETWORK_CHANNELS } from './network.channels.js';
import { NetworkService } from '../../services/network/network.service.js';

export function registerNetworkHandlers(): void {
  ipcMain.handle(NETWORK_CHANNELS.IS_ONLINE, () => NetworkService.isOnline());
}
`);

// --- LOGGER ---
write('electron/services/logger/logger.service.ts', `
export class LoggerService {
  static info(msg: string): void { console.log('[INFO]', msg); }
  static warn(msg: string): void { console.warn('[WARN]', msg); }
  static error(msg: string): void { console.error('[ERROR]', msg); }
}
`);
write('electron/ipc/logger/logger.channels.ts', `
export const LOGGER_CHANNELS = {
  INFO: 'logger:info',
  WARN: 'logger:warn',
  ERROR: 'logger:error'
} as const;
`);
write('electron/ipc/logger/logger.handlers.ts', `
import { ipcMain } from 'electron';
import { LOGGER_CHANNELS } from './logger.channels.js';
import { LoggerService } from '../../services/logger/logger.service.js';

export function registerLoggerHandlers(): void {
  ipcMain.handle(LOGGER_CHANNELS.INFO, (_, m) => { LoggerService.info(m); });
  ipcMain.handle(LOGGER_CHANNELS.WARN, (_, m) => { LoggerService.warn(m); });
  ipcMain.handle(LOGGER_CHANNELS.ERROR, (_, m) => { LoggerService.error(m); });
}
`);

// --- SETTINGS ---
write('electron/services/settings/settings.service.ts', `
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export class SettingsService {
  private static getPath() { return path.join(app.getPath('userData'), 'settings.json'); }
  static getSetting(key: string): any {
    try {
      const data = fs.readFileSync(this.getPath(), 'utf-8');
      return JSON.parse(data)[key];
    } catch { return null; }
  }
  static setSetting(key: string, value: any): void {
    let settings: any = {};
    try {
      settings = JSON.parse(fs.readFileSync(this.getPath(), 'utf-8'));
    } catch {}
    settings[key] = value;
    fs.writeFileSync(this.getPath(), JSON.stringify(settings));
  }
}
`);
write('electron/ipc/settings/settings.channels.ts', `
export const SETTINGS_CHANNELS = {
  GET: 'settings:get',
  SET: 'settings:set'
} as const;
`);
write('electron/ipc/settings/settings.handlers.ts', `
import { ipcMain } from 'electron';
import { SETTINGS_CHANNELS } from './settings.channels.js';
import { SettingsService } from '../../services/settings/settings.service.js';

export function registerSettingsHandlers(): void {
  ipcMain.handle(SETTINGS_CHANNELS.GET, (_, k) => SettingsService.getSetting(k));
  ipcMain.handle(SETTINGS_CHANNELS.SET, (_, k, v) => { SettingsService.setSetting(k, v); });
}
`);

// --- MOCKS (Backup, Updater, Printer) ---
const mockCode = (name) => "export class " + name + "Service {\n  static async test() { return 'not_implemented'; }\n}\n";
const mockCh = (name) => "export const " + name.toUpperCase() + "_CHANNELS = { TEST: '" + name.toLowerCase() + ":test' } as const;\n";
const mockHnd = (name) => "import { ipcMain } from 'electron';\nimport { " + name.toUpperCase() + "_CHANNELS } from './" + name.toLowerCase() + ".channels.js';\nexport function register" + name + "Handlers(): void {}\n";

['Backup', 'Updater', 'Printer'].forEach(name => {
  const low = name.toLowerCase();
  write("electron/services/" + low + "/" + low + ".service.ts", mockCode(name));
  write("electron/ipc/" + low + "/" + low + ".channels.ts", mockCh(name));
  write("electron/ipc/" + low + "/" + low + ".handlers.ts", mockHnd(name));
});

// --- IPC INDEX ---
write('electron/ipc/index.ts', `
import { registerSystemHandlers } from './system/system.handlers.js';
import { registerDialogHandlers } from './dialog/dialog.handlers.js';
import { registerFileSystemHandlers } from './filesystem/filesystem.handlers.js';
import { registerShellHandlers } from './shell/shell.handlers.js';
import { registerClipboardHandlers } from './clipboard/clipboard.handlers.js';
import { registerNotificationHandlers } from './notification/notification.handlers.js';
import { registerNetworkHandlers } from './network/network.handlers.js';
import { registerLoggerHandlers } from './logger/logger.handlers.js';
import { registerSettingsHandlers } from './settings/settings.handlers.js';
import { registerBackupHandlers } from './backup/backup.handlers.js';
import { registerUpdaterHandlers } from './updater/updater.handlers.js';
import { registerPrinterHandlers } from './printer/printer.handlers.js';

export function registerIpcHandlers(): void {
  registerSystemHandlers();
  registerDialogHandlers();
  registerFileSystemHandlers();
  registerShellHandlers();
  registerClipboardHandlers();
  registerNotificationHandlers();
  registerNetworkHandlers();
  registerLoggerHandlers();
  registerSettingsHandlers();
  registerBackupHandlers();
  registerUpdaterHandlers();
  registerPrinterHandlers();
}
`);
