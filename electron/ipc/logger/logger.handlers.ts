import { ipcMain } from 'electron';
import { LOGGER_CHANNELS } from './logger.channels.js';
import { LoggerManager } from '../../services/logger/index.js';

export function registerLoggerHandlers(): void {
  ipcMain.handle(LOGGER_CHANNELS.INFO, (_, msg) => LoggerManager.info(msg));
  ipcMain.handle(LOGGER_CHANNELS.WARN, (_, msg) => LoggerManager.warn(msg));
  ipcMain.handle(LOGGER_CHANNELS.ERROR, (_, msg) => LoggerManager.error(msg));
  ipcMain.handle(LOGGER_CHANNELS.GET_LOGS, () => LoggerManager.getLogs());
  ipcMain.handle(LOGGER_CHANNELS.EXPORT, () => LoggerManager.export());
}
