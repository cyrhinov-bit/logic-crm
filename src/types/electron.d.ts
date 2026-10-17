export interface ElectronAPI {
  // System
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  ping: () => Promise<string>;
  getMetrics: () => Promise<any>;
  getBrowserCacheInfo: () => Promise<{ httpCacheBytes: number }>;
  clearBrowserCache: (options?: any) => Promise<{ httpCacheCleared: boolean; storagesCleared: string[]; requiresReload: boolean }>;

  // Dialog
  showMessageBox: (options: any) => Promise<any>;
  showOpenDialog: (options: any) => Promise<any>;

  // FileSystem
  getSystemPaths: () => Promise<any>;
  readFile: (baseFolder: string, relativePath: string) => Promise<string>;
  writeFile: (baseFolder: string, relativePath: string, content: string) => Promise<boolean>;
  deleteFile: (baseFolder: string, relativePath: string) => Promise<boolean>;
  exists: (baseFolder: string, relativePath: string) => Promise<boolean>;
  listDir: (baseFolder: string, relativePath?: string) => Promise<string[]>;
  createTempFile: (prefix: string, content: string) => Promise<string>;
  readBinaryFile: (baseFolder: string, relativePath: string) => Promise<string>;
  writeBinaryFile: (baseFolder: string, relativePath: string, content: string) => Promise<boolean>;

  // Shell
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (path: string) => Promise<void>;

  // Clipboard
  readClipboardText: () => Promise<string>;
  writeClipboardText: (text: string) => Promise<void>;
  clearClipboard: () => Promise<void>;

  // Notification
  showNotification: (title: string, body: string) => Promise<void>;

  // Network
  isOnline: () => Promise<boolean>;

  // Logger
  logInfo: (msg: string) => Promise<void>;
  logWarn: (msg: string) => Promise<void>;
  logError: (msg: string) => Promise<void>;

  // Settings
  getSetting: (key: string) => Promise<any>;
  setSetting: (key: string, value: any) => Promise<void>;

  // Printer
  getPrinters: () => Promise<any[]>;
  printTestPage: (printerName: string) => Promise<string>;
  getPrinterQueue: () => Promise<any[]>;

  // Hardware
  getDevices: () => Promise<any[]>;
  discoverHardware: () => Promise<any[]>;

  // Scanner
  startScanner: () => Promise<void>;
  stopScanner: () => Promise<void>;
  getScannerConfig: () => Promise<any>;
  setScannerConfig: (c: any) => Promise<void>;
  getScannerHistory: () => Promise<any[]>;
  onScan: (callback: (record: any) => void) => void;

  // Backup
  createBackup: () => Promise<string>;
  restoreBackup: (path: string) => Promise<boolean>;
  getBackupHistory: () => Promise<any[]>;
  onBackupProgress: (callback: (data: any) => void) => void;

  // Logger (existait en partie)
  logInfo: (msg: string) => Promise<void>;
  logWarn: (msg: string) => Promise<void>;
  logError: (msg: string) => Promise<void>;
  getLogs: () => Promise<any[]>;
  exportLogs: () => Promise<string>;

  // Diagnostics
  runDiagnostics: () => Promise<any>;
  getSystemMetrics: () => Promise<any>;

  // Maintenance
  getMaintenanceState: () => Promise<boolean>;
  setMaintenanceMode: (active: boolean) => Promise<void>;
  onMaintenanceToggle: (callback: (active: boolean) => void) => void;

  // Security
  getSecurityStatus: () => Promise<any>;
  checkSecurityPermission: (module: string, action: string) => Promise<boolean>;

  // Performance
  getPerformanceMetrics: () => Promise<any>;
  clearPerformanceCache: () => Promise<boolean>;
  runPerformanceBenchmark: () => Promise<any>;

  // POS
  openSale: (userId: string) => Promise<any>;
  closeSale: () => Promise<any>;
  getPosSession: () => Promise<any>;
  paySale: (amount: number, method: string) => Promise<any>;
  openCashDrawer: () => Promise<boolean>;
  printPosReceipt: (data: any) => Promise<string>;
  displayCustomerMessage: (line1: string, line2: string) => Promise<boolean>;
  onPosEvent: (callback: (payload: { event: string; data: any }) => void) => void;

  // Sync
  enqueueSync: (op: any) => Promise<void>;
  forceSync: () => Promise<void>;
  getSyncStatus: () => Promise<any>;
  setNetworkStatus: (online: boolean) => Promise<void>;
  configureSync: (config: any) => Promise<any>;
  setSyncAuthToken: (token: string | null) => Promise<any>;
  onSyncEvent: (callback: (payload: { event: string; data: any }) => void) => void;

  // Mail (Outlook natif via COM + SMTP direct)
  composeOutlookMail: (input: any) => Promise<any>;
  openDefaultMailClient: (input: any) => Promise<any>;
  smtpMailStatus: () => Promise<any>;
  smtpMailSetConfig: (config: any) => Promise<any>;
  smtpMailClear: () => Promise<any>;
  smtpMailVerify: () => Promise<any>;
  smtpMailSendTest: (to: string) => Promise<any>;
  smtpMailSend: (input: any) => Promise<any>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}


