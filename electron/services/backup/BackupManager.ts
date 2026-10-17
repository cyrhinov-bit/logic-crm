import { BackupService } from './BackupService.js';
import { RestoreService } from './RestoreService.js';
import { BackupHistory } from './BackupHistory.js';

export class BackupManager {
  static async create() { return await BackupService.createBackup(); }
  static async restore(path: string) { return await RestoreService.restoreBackup(path); }
  static getHistory() { return BackupHistory.getHistory(); }
}
