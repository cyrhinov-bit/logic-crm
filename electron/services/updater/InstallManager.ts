import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

export class InstallManager {
  static async install() {
    if (!app.isPackaged) return true; // dev : no-op
    // Ferme et installe la MAJ téléchargée (relance l'app).
    autoUpdater.quitAndInstall(false, true);
    return true;
  }
}
