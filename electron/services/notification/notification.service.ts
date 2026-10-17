import { Notification } from 'electron';

export class NotificationService {
  static show(title: string, body: string): void {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  }
}
