import { ipcMain } from 'electron';
import { SETTINGS_CHANNELS } from './settings.channels.js';
import { SettingsService } from '../../services/settings/settings.service.js';

export function registerSettingsHandlers(): void {
  ipcMain.handle(SETTINGS_CHANNELS.GET, (_, k) => SettingsService.getSetting(k));
  ipcMain.handle(SETTINGS_CHANNELS.SET, (_, k, v) => { SettingsService.setSetting(k, v); });
}
