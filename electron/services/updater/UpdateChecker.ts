import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { UpdateInfo } from './UpdaterTypes.js';
import { VersionService } from './VersionService.js';

function toNotes(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map((r: any) => r?.note || r?.version || '').join('\n');
  return String(raw);
}

export class UpdateChecker {
  static async checkForUpdates(): Promise<UpdateInfo | null> {
    // En dev (non packagé) : pas de flux GitHub, on retourne null = "à jour".
    if (!app.isPackaged) return null;
    try {
      const result = await autoUpdater.checkForUpdates();
      const latest = result?.updateInfo;
      if (!latest) return null;
      const current = VersionService.getCurrentVersion();
      if (!VersionService.isNewer(current, latest.version)) return null;
      const file: any = (latest as any).files?.[0];
      return {
        version: latest.version,
        releaseDate: (latest as any).releaseDate || new Date().toISOString(),
        releaseNotes: toNotes((latest as any).releaseNotes) || (latest as any).releaseName || '',
        isMandatory: false,
        sizeBytes: file?.size || 0
      };
    } catch (err) {
      console.error('[Updater] checkForUpdates failed:', err);
      throw err;
    }
  }
}
