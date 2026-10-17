import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { UpdateChecker } from './UpdateChecker.js';
import { DownloadManager } from './DownloadManager.js';
import { InstallManager } from './InstallManager.js';
import { UpdateConfiguration } from './UpdateConfiguration.js';
import { UpdateHistory } from './UpdateHistory.js';
import { updaterEmitter } from './UpdateEvents.js';

export class UpdaterManager {
  private static initialized = false;
  private static scheduled = false;

  /** À appeler une fois dans main.ts quand l'app est prête. */
  static init() {
    if (this.initialized) return;
    this.initialized = true;

    const cfg = UpdateConfiguration.getConfig();
    this.applyConfig();

    // Log discret sans dépendance supplémentaire.
    try { (autoUpdater as any).logger = console; } catch { /* ignore */ }
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on('checking-for-update', () => {
      updaterEmitter.emit('status', { status: 'checking', percent: 0, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 });
    });

    autoUpdater.on('update-available', (info: any) => {
      updaterEmitter.emit('status', { status: 'available', percent: 0, transferredBytes: 0, totalBytes: info?.files?.[0]?.size || 0, bytesPerSecond: 0 });
    });

    autoUpdater.on('update-not-available', () => {
      updaterEmitter.emit('status', { status: 'checking', percent: 100, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 });
    });

    autoUpdater.on('download-progress', (p: any) => {
      updaterEmitter.emit('status', {
        status: 'downloading',
        percent: Math.floor(p?.percent || 0),
        transferredBytes: p?.transferred || 0,
        totalBytes: p?.total || 0,
        bytesPerSecond: p?.bytesPerSecond || 0
      });
    });

    autoUpdater.on('update-downloaded', (info: any) => {
      updaterEmitter.emit('status', { status: 'downloaded', percent: 100, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 });
      UpdateHistory.add({ version: info?.version || 'unknown', date: new Date().toISOString(), status: 'downloaded' });
      // En mode 100% auto, on installe à la fermeture (autoInstallOnAppQuit).
    });

    autoUpdater.on('error', (err: any) => {
      console.error('[Updater] error:', err);
      updaterEmitter.emit('status', { status: 'error', percent: 0, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 });
    });

    // Check auto au démarrage + toutes les 4h (packagé uniquement).
    if (app.isPackaged && cfg.autoCheck && !this.scheduled) {
      this.scheduled = true;
      setTimeout(() => this.check().catch(() => {}), 10_000);
      setInterval(() => this.check().catch(() => {}), 4 * 60 * 60 * 1000);
    }
  }

  private static applyConfig() {
    const cfg = UpdateConfiguration.getConfig();
    autoUpdater.autoDownload = cfg.autoDownload;
    autoUpdater.allowPrerelease = cfg.channel !== 'stable';
    try { autoUpdater.channel = cfg.channel as any; } catch { /* ignore */ }
  }

  static async check() {
    updaterEmitter.emit('status', { status: 'checking', percent: 0, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 });
    try {
      const info = await UpdateChecker.checkForUpdates();
      if (info) {
        updaterEmitter.emit('status', { status: 'available', percent: 0, transferredBytes: 0, totalBytes: info.sizeBytes, bytesPerSecond: 0 });
        // Si autoDownload=true, electron-updater a déjà lancé le download.
      }
      return info;
    } catch {
      updaterEmitter.emit('status', { status: 'error', percent: 0, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 });
      return null;
    }
  }

  static async download(info: any) {
    return await DownloadManager.downloadUpdate(info);
  }

  static async install() {
    updaterEmitter.emit('status', { status: 'installing', percent: 100, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 });
    await InstallManager.install();
    UpdateHistory.add({ version: app.getVersion(), date: new Date().toISOString(), status: 'install-triggered' });
  }

  static getConfig() { return UpdateConfiguration.getConfig(); }
  static setConfig(c: any) { UpdateConfiguration.setConfig(c); this.applyConfig(); }
  static getHistory() { return UpdateHistory.getHistory(); }
}
