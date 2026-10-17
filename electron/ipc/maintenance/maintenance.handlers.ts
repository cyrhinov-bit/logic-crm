import { ipcMain, BrowserWindow } from 'electron';
import { MAINTENANCE_CHANNELS } from './maintenance.channels.js';
import { MaintenanceManager, maintenanceEmitter } from '../../services/maintenance/index.js';

export function registerMaintenanceHandlers(): void {
  maintenanceEmitter.on('modeChanged', (active) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => win.webContents.send(MAINTENANCE_CHANNELS.ON_TOGGLE, active));
  });

  ipcMain.handle(MAINTENANCE_CHANNELS.GET_STATE, () => MaintenanceManager.getState());
  ipcMain.handle(MAINTENANCE_CHANNELS.SET_MODE, (_, active) => MaintenanceManager.setMode(active));
}
