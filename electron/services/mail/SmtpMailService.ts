import { app, safeStorage } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';
import type { ComposeMailInput, ComposeMailResult, MailErrorCode } from './OutlookMailService.js';

/**
 * Envoi d'e-mails via SMTP (boîte IMAP/SMTP classique, ex. hébergement LWS).
 *
 * C'est la méthode adaptée aux boîtes qui NE sont PAS des comptes Microsoft 365 :
 * le devis est envoyé directement depuis l'application, avec le PDF en pièce jointe,
 * sans dépendre d'Outlook ni de Microsoft Graph.
 *
 * Le mot de passe est chiffré sur le poste (safeStorage) et n'est jamais renvoyé au renderer.
 */

interface SmtpStoredConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  fromName?: string;
  replyTo?: string;
  passwordEnc?: string;
}

export interface SmtpStatus {
  configured: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  fromName?: string;
  replyTo?: string;
}

export interface SmtpConfigInput {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  fromName?: string;
  replyTo?: string;
  /** Laisser vide pour conserver le mot de passe déjà enregistré. */
  password?: string;
}

export class SmtpMailService {
  private static configPath(): string {
    return path.join(app.getPath('userData'), 'smtp-mail.json');
  }

  private static encrypt(value: string): string | undefined {
    try {
      if (safeStorage?.isEncryptionAvailable?.()) {
        return safeStorage.encryptString(value).toString('base64');
      }
    } catch { /* ignore */ }
    return undefined;
  }

  private static decrypt(value?: string): string | undefined {
    if (!value) return undefined;
    try {
      if (safeStorage?.isEncryptionAvailable?.()) {
        return safeStorage.decryptString(Buffer.from(value, 'base64'));
      }
    } catch { /* ignore */ }
    return undefined;
  }

  private static async readConfig(): Promise<SmtpStoredConfig> {
    try {
      return JSON.parse(await fs.readFile(SmtpMailService.configPath(), 'utf-8'));
    } catch {
      return {};
    }
  }

  private static async writeConfig(cfg: SmtpStoredConfig): Promise<void> {
    await fs.writeFile(SmtpMailService.configPath(), JSON.stringify(cfg), 'utf-8');
  }

  // ---------------------------------------------------------------- Statut / config

  static async getStatus(): Promise<SmtpStatus> {
    const cfg = await SmtpMailService.readConfig();
    return {
      configured: !!(cfg.host && cfg.user && cfg.passwordEnc),
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure !== false,
      user: cfg.user,
      fromName: cfg.fromName,
      replyTo: cfg.replyTo,
    };
  }

  static async setConfig(input: SmtpConfigInput): Promise<SmtpStatus> {
    const cfg = await SmtpMailService.readConfig();
    if (input.host !== undefined) cfg.host = input.host.trim();
    if (input.port !== undefined) cfg.port = Number(input.port) || 465;
    if (input.secure !== undefined) cfg.secure = !!input.secure;
    if (input.user !== undefined) cfg.user = input.user.trim();
    if (input.fromName !== undefined) cfg.fromName = input.fromName.trim();
    if (input.replyTo !== undefined) cfg.replyTo = input.replyTo.trim();
    if (input.password) {
      cfg.passwordEnc = SmtpMailService.encrypt(input.password) || undefined;
    }
    await SmtpMailService.writeConfig(cfg);
    return SmtpMailService.getStatus();
  }

  static async clear(): Promise<void> {
    try { await fs.unlink(SmtpMailService.configPath()); } catch { /* ignore */ }
  }

  private static buildTransport(cfg: SmtpStoredConfig) {
    const password = SmtpMailService.decrypt(cfg.passwordEnc) || '';
    const port = cfg.port || 465;
    const secure = cfg.secure !== false;
    return nodemailer.createTransport({
      host: cfg.host,
      port,
      secure,
      auth: { user: cfg.user, pass: password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
  }

  /** Teste la connexion et l'authentification (sans envoyer d'e-mail). */
  static async verify(): Promise<ComposeMailResult> {
    const cfg = await SmtpMailService.readConfig();
    if (!cfg.host || !cfg.user || !cfg.passwordEnc) {
      return { ok: false, mode: 'smtp', errorCode: 'NOT_CONFIGURED', error: "SMTP n'est pas configuré." };
    }
    try {
      await SmtpMailService.buildTransport(cfg).verify();
      return { ok: true, mode: 'smtp' };
    } catch (err: any) {
      return { ok: false, mode: 'smtp', errorCode: SmtpMailService.codeOf(err), error: SmtpMailService.messageOf(err) };
    }
  }

  /** Envoie un e-mail de test à l'adresse indiquée. */
  static async sendTest(to: string): Promise<ComposeMailResult> {
    return SmtpMailService.send({
      to,
      subject: 'Test de configuration - Logic CRM',
      body: "Ceci est un e-mail de test envoyé depuis l'application Logic CRM. Si vous le recevez, la configuration SMTP fonctionne.",
    });
  }

  // ---------------------------------------------------------------- Envoi

  static async send(input: ComposeMailInput): Promise<ComposeMailResult> {
    const cfg = await SmtpMailService.readConfig();
    if (!cfg.host || !cfg.user || !cfg.passwordEnc) {
      return {
        ok: false,
        mode: 'smtp',
        errorCode: 'NOT_CONFIGURED',
        error: "L'envoi SMTP n'est pas configuré. Renseignez-le dans Paramètres (Paramètres → Envoi des devis par e-mail).",
      };
    }

    const attachments = (input.attachments || [])
      .filter(a => a?.base64)
      .map(a => ({
        filename: a.filename || 'piece-jointe.pdf',
        content: Buffer.from(a.base64, 'base64'),
        contentType: a.mimeType || 'application/pdf',
      }));

    const mail: any = {
      from: cfg.fromName ? { name: cfg.fromName, address: cfg.user! } : cfg.user,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject || '',
      attachments,
    };
    if (input.htmlBody) {
      mail.html = input.htmlBody;
      if (input.body) mail.text = input.body;
    } else {
      mail.text = input.body || '';
    }
    if (cfg.replyTo) mail.replyTo = cfg.replyTo;

    try {
      const info = await SmtpMailService.buildTransport(cfg).sendMail(mail);
      return { ok: true, mode: 'smtp', webLink: info?.messageId };
    } catch (err: any) {
      return { ok: false, mode: 'smtp', errorCode: SmtpMailService.codeOf(err), error: SmtpMailService.messageOf(err) };
    }
  }

  // ---------------------------------------------------------------- Erreurs

  private static codeOf(err: any): MailErrorCode {
    const code = String(err?.code || '').toUpperCase();
    if (code === 'EAUTH') return 'SMTP_AUTH';
    if (['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'EDNS', 'ENOTFOUND'].includes(code)) return 'SMTP_CONNECTION';
    if (code === 'EENVELOPE') return 'SMTP_RECIPIENT';
    return 'SMTP';
  }

  private static messageOf(err: any): string {
    const code = SmtpMailService.codeOf(err);
    if (code === 'SMTP_AUTH') {
      return "Identifiants SMTP refusés. Vérifiez l'adresse e-mail et le mot de passe de la boîte (mot de passe de la messagerie, pas celui du poste).";
    }
    if (code === 'SMTP_CONNECTION') {
      return "Impossible de joindre le serveur SMTP. Vérifiez le nom du serveur, le port et la connexion Internet.";
    }
    if (code === 'SMTP_RECIPIENT') {
      return "Adresse du destinataire invalide ou refusée par le serveur.";
    }
    return err?.message || "Erreur lors de l'envoi de l'e-mail.";
  }
}
