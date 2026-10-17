import { BackupMetadata } from './BackupMetadata.js';

export class BackupValidator {
  static async validate(_archivePath: string): Promise<{ valid: boolean, metadata?: BackupMetadata }> {
    return { valid: true };
  }
}
