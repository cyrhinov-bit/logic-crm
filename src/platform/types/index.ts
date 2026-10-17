export interface SystemInterface {
  getVersion(): Promise<string>;
  getPlatform(): Promise<string>;
  ping(): Promise<string>;
  getMetrics(): Promise<any>;
  getBrowserCacheInfo(): Promise<{ httpCacheBytes: number; storageBytes?: number }>;
  clearBrowserCache(options?: { httpCache?: boolean; storages?: string[] }): Promise<{ httpCacheCleared: boolean; storagesCleared: string[]; requiresReload: boolean }>;
}

export interface DialogInterface {
  showMessageBox(options: any): Promise<any>;
  showOpenDialog(options: any): Promise<any>;
}

export interface FileInterface {
  getSystemPaths(): Promise<any>;
  readFile(baseFolder: string, relativePath: string): Promise<string>;
  writeFile(baseFolder: string, relativePath: string, content: string): Promise<boolean>;
  deleteFile(baseFolder: string, relativePath: string): Promise<boolean>;
  exists(baseFolder: string, relativePath: string): Promise<boolean>;
  listDir(baseFolder: string, relativePath?: string): Promise<string[]>;
  createTempFile(prefix: string, content: string): Promise<string>;
  readBinaryFile(baseFolder: string, relativePath: string): Promise<string>;
  writeBinaryFile(baseFolder: string, relativePath: string, content: string): Promise<boolean>;
}

export interface ShellInterface {
  openExternal(url: string): Promise<void>;
  showItemInFolder(path: string): Promise<void>;
}

export interface MailAttachment {
  filename: string;
  /** Contenu du fichier encodé en base64 (sans préfixe data:). */
  base64: string;
  mimeType?: string;
}

export interface MailComposeOptions {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  /** Corps en texte brut (utilisé en secours du HTML et par le mode mailto). */
  body?: string;
  htmlBody?: string;
  attachments?: MailAttachment[];
  /** true = envoi direct ; false/omis = ouvre la fenêtre de composition pour relecture. */
  send?: boolean;
}

export interface MailComposeResult {
  ok: boolean;
  /** 'outlook' = Outlook classique via COM ; 'mailto' = messagerie par défaut ; 'smtp' = envoi direct. */
  mode?: 'outlook' | 'mailto' | 'smtp';
  /** Code d'erreur exploitable (ex : 'ELEVATED', 'NO_PROFILE', 'NOT_CONFIGURED', 'SMTP_AUTH'). */
  errorCode?: string;
  error?: string;
  /** Chemin du PDF enregistré sur disque (mode 'mailto'). */
  filePath?: string;
  /** true si le PDF a été copié dans le presse-papiers (mode 'mailto'). */
  copiedToClipboard?: boolean;
  /** Identifiant du message envoyé (mode 'smtp'). */
  webLink?: string;
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

/** Envoi direct par SMTP (boîte IMAP/SMTP classique, ex. hébergement LWS). */
export interface SmtpMailInterface {
  getStatus(): Promise<SmtpStatus>;
  setConfig(config: SmtpConfigInput): Promise<SmtpStatus>;
  clear(): Promise<void>;
  verify(): Promise<MailComposeResult>;
  sendTest(to: string): Promise<MailComposeResult>;
  send(options: MailComposeOptions): Promise<MailComposeResult>;
}

export interface MailInterface {
  /** Ouvre un e-mail pré-rempli. Sous Windows/Electron : Outlook natif avec pièces jointes. */
  compose(options: MailComposeOptions): Promise<MailComposeResult>;
  /** Ouvre l'application de messagerie par défaut (nouvel Outlook, etc.) via un lien mailto. */
  openInDefaultMailApp(options: MailComposeOptions): Promise<MailComposeResult>;
  /** Envoi direct par SMTP, avec pièce jointe (boîte IMAP/SMTP classique). */
  smtp: SmtpMailInterface;
}

export interface ClipboardInterface {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
  clear(): Promise<void>;
}

export interface NotificationInterface {
  showNotification(title: string, body: string): Promise<void>;
}

export interface NetworkInterface {
  isOnline(): Promise<boolean>;
}

export interface LoggerInterface {
  info(msg: string): Promise<void>;
  warn(msg: string): Promise<void>;
  error(msg: string): Promise<void>;
  getLogs(): Promise<any[]>;
  exportLogs(): Promise<string>;
}

export interface SettingsInterface {
  getSetting(key: string): Promise<any>;
  setSetting(key: string, value: any): Promise<void>;
}

export interface BackupMetadata {
  id: string;
  date: string;
  appVersion: string;
  sizeBytes: number;
  type: 'full' | 'incremental' | 'custom';
  modules: string[];
  checksum: string;
  durationMs: number;
}

export interface BackupProgressEvent {
  step: string;
  percent: number;
}

export interface BackupInterface {
  createBackup(): Promise<string>;
  restoreBackup(path: string): Promise<boolean>;
  getHistory(): Promise<BackupMetadata[]>;
  onProgress(callback: (data: BackupProgressEvent) => void): void;
}

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  isMandatory: boolean;
  sizeBytes: number;
}

export interface UpdateProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  status: 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error';
}

export interface UpdaterInterface {
  checkForUpdates(): Promise<UpdateInfo | null>;
  download(info: UpdateInfo): Promise<void>;
  install(): Promise<void>;
  getConfig(): Promise<any>;
  setConfig(c: any): Promise<void>;
  getHistory(): Promise<any[]>;
  onStatus(callback: (data: UpdateProgress) => void): void;
}

export interface DiagnosticInterface {
  runDiagnostics(): Promise<any>;
  getSystemMetrics(): Promise<any>;
}

export interface MaintenanceInterface {
  getState(): Promise<boolean>;
  setMode(active: boolean): Promise<void>;
  onToggle(callback: (active: boolean) => void): void;
}

export interface SecurityInterface {
  getStatus(): Promise<any>;
  checkPermission(module: string, action: string): Promise<boolean>;
}

export interface PerformanceInterface {
  getMetrics(): Promise<any>;
  clearCache(): Promise<boolean>;
  runBenchmark(): Promise<any>;
}

export interface SyncInterface {
  enqueue(op: any): Promise<void>;
  forceSync(): Promise<void>;
  getStatus(): Promise<any>;
  setNetworkStatus(online: boolean): Promise<void>;
  configure(config: { url: string; anonKey: string }): Promise<any>;
  setAuthToken(token: string | null): Promise<any>;
  onEvent(callback: (payload: { event: string; data: any }) => void): void;
}

/**
 * Interface unifiée de tous les services de la plateforme.
 */
export interface PlatformBridge {
  isDesktop: boolean;
  system: SystemInterface;
  dialog: DialogInterface;
  files: FileInterface;
  shell: ShellInterface;
  mail: MailInterface;
  clipboard: ClipboardInterface;
  notifications: NotificationInterface;
  network: NetworkInterface;
  logger: LoggerInterface;
  settings: SettingsInterface;
  backup: BackupInterface;
  updater: UpdaterInterface;
  diagnostics: DiagnosticInterface;
  maintenance: MaintenanceInterface;
  security: SecurityInterface;
  performance: PerformanceInterface;
  sync: SyncInterface;
}
