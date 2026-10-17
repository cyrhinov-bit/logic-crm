import { ipcMain } from 'electron';
import { SECURITY_CHANNELS } from './security.channels.js';
import { SecurityManager, PermissionManager } from '../../security/index.js';

export function registerSecurityHandlers(): void {
  ipcMain.handle(SECURITY_CHANNELS.GET_STATUS, () => SecurityManager.getStatus());
  ipcMain.handle(SECURITY_CHANNELS.CHECK_PERMISSION, (_, module, action) => PermissionManager.hasPermission(module, action));
}
