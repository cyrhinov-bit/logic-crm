import { ipcMain } from 'electron';
import { MAIL_CHANNELS } from './mail.channels.js';
import { OutlookMailService } from '../../services/mail/OutlookMailService.js';
import { DefaultMailService } from '../../services/mail/DefaultMailService.js';
import { SmtpMailService } from '../../services/mail/SmtpMailService.js';

export function registerMailHandlers(): void {
  // Outlook classique (COM) — pièce jointe automatique.
  ipcMain.handle(MAIL_CHANNELS.COMPOSE_OUTLOOK, (_, input) => OutlookMailService.compose(input ?? {}));
  // Application de messagerie par défaut (mailto) — redirection vers le nouvel Outlook.
  ipcMain.handle(MAIL_CHANNELS.OPEN_DEFAULT, (_, input) => DefaultMailService.openDefault(input ?? {}));

  // SMTP — envoi direct avec pièce jointe (boîte IMAP/SMTP classique).
  ipcMain.handle(MAIL_CHANNELS.SMTP_STATUS, () => SmtpMailService.getStatus());
  ipcMain.handle(MAIL_CHANNELS.SMTP_SET_CONFIG, (_, cfg) => SmtpMailService.setConfig(cfg ?? {}));
  ipcMain.handle(MAIL_CHANNELS.SMTP_CLEAR, () => SmtpMailService.clear());
  ipcMain.handle(MAIL_CHANNELS.SMTP_VERIFY, () => SmtpMailService.verify());
  ipcMain.handle(MAIL_CHANNELS.SMTP_SEND_TEST, (_, to) => SmtpMailService.sendTest(String(to || '')));
  ipcMain.handle(MAIL_CHANNELS.SMTP_SEND, (_, input) => SmtpMailService.send(input ?? {}));
}
