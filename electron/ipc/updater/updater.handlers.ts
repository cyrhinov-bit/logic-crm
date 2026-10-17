import { ipcMain, BrowserWindow } from 'electron';
import { UPDATER_CHANNELS } from './updater.channels.js';
import { UpdaterManager, updaterEmitter } from '../../services/updater/index.js';
import { UpdaterError } from '../../errors/UpdaterErrors.js';

export function registerUpdaterHandlers(): void {
  updaterEmitter.on('status', (data) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => win.webContents.send(UPDATER_CHANNELS.ON_STATUS, data));
  });

  const handle = (channel: string, handler: (...args: any[]) => Promise<any> | any) => {
    ipcMain.handle(channel, async (_, ...args) => {
      try {
        return await handler(...args);
      } catch (err: any) {
        if (err instanceof UpdaterError) {
          throw new Error(JSON.stringify({ name: err.name, message: err.message }));
        }
        throw err;
      }
    });
  };

  handle(UPDATER_CHANNELS.CHECK, () => UpdaterManager.check());
  handle(UPDATER_CHANNELS.DOWNLOAD, (info) => UpdaterManager.download(info));
  handle(UPDATER_CHANNELS.INSTALL, () => UpdaterManager.install());
  handle(UPDATER_CHANNELS.GET_CONFIG, () => UpdaterManager.getConfig());
  handle(UPDATER_CHANNELS.SET_CONFIG, (c) => UpdaterManager.setConfig(c));
  handle(UPDATER_CHANNELS.GET_HISTORY, () => UpdaterManager.getHistory());
}
