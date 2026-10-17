import { ipcMain } from 'electron';
import { NOTIFICATION_CHANNELS } from './notification.channels.js';
import { NotificationService } from '../../services/notification/notification.service.js';

export function registerNotificationHandlers(): void {
  ipcMain.handle(NOTIFICATION_CHANNELS.SHOW, (_, title, body) => { NotificationService.show(title, body); });
}
