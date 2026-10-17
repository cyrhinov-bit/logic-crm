import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { updaterEmitter } from './UpdateEvents.js';
import { UpdateInfo } from './UpdaterTypes.js';

export class DownloadManager {
  static async downloadUpdate(info: UpdateInfo): Promise<void> {
    // Dev : garde la simulation pour tester l'UI sans build packagé.
    if (!app.isPackaged) {
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

    // Packagé : vrai téléchargement via electron-updater (la progression
    // arrive via l'event 'download-progress' câblé dans UpdaterManager.init).
    await autoUpdater.downloadUpdate();
  }
}
