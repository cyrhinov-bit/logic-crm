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
