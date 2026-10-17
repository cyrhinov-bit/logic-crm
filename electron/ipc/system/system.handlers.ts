import { ipcMain } from 'electron';
import { SYSTEM_CHANNELS } from './system.channels.js';
import { SystemService } from '../../services/system/system.service.js';
import { BrowserCacheService } from '../../services/system/browserCache.service.js';

export function registerSystemHandlers(): void {
  ipcMain.handle(SYSTEM_CHANNELS.GET_VERSION, () => SystemService.getVersion());
  ipcMain.handle(SYSTEM_CHANNELS.GET_PLATFORM, () => SystemService.getPlatform());
  ipcMain.handle(SYSTEM_CHANNELS.PING, () => SystemService.ping());
  ipcMain.handle(SYSTEM_CHANNELS.GET_METRICS, () => SystemService.getMetrics());
  ipcMain.handle(SYSTEM_CHANNELS.GET_BROWSER_CACHE_INFO, () => BrowserCacheService.getInfo());
  ipcMain.handle(SYSTEM_CHANNELS.CLEAR_BROWSER_CACHE, (_event, options) => BrowserCacheService.clear(options));
}
