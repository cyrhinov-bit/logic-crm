import { BackupMetadata } from './BackupMetadata.js';

export class BackupHistory {
  private static history: BackupMetadata[] = [];
  static add(entry: BackupMetadata) { this.history.unshift(entry); }
  static getHistory() { return this.history; }
}
