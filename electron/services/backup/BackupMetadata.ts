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
