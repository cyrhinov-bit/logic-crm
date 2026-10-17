import { app } from 'electron';
import { registerIpcHandlers } from '../ipc/index.js';
import { ErrorManager } from '../errors/ErrorManager.js';
import { MenuManager } from '../menu/MenuManager.js';
import { WindowManager } from '../windows/WindowManager.js';
import { UpdaterManager } from '../services/updater/UpdaterManager.js';

// Empêcher plusieurs instances concurrentes de verrouiller les caches et bases de données SQLite/IndexedDB
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Electron] Une autre instance est déjà en cours d\'exécution. Fermeture.');
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = WindowManager.getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Initialisation de la capture globale des erreurs
  ErrorManager.init();

  // Définir l'AppUserModelID pour afficher l'icône personnalisée dans la barre des tâches Windows
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.logic.crm');
  }

  // Éviter les collisions et erreurs de verrouillage de cache disque Chromium sur Windows (Accès refusé / Gpu Cache Creation failed)
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

  app.whenReady().then(() => {
    // Enregistrement des Handlers IPC
    registerIpcHandlers();

    // Configuration du Menu Applicatif
    MenuManager.init();

    // Création du Splash Screen et de la Fenêtre Principale
    WindowManager.init();

    // Mises à jour auto (GitHub Releases via electron-updater)
    UpdaterManager.init();

    // Gestion spécifique macOS
    app.on('activate', () => {
      if (!WindowManager.getMainWindow()) {
        WindowManager.init();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

