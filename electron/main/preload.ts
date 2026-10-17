import { contextBridge, ipcRenderer } from 'electron';

/**
 * PRELOAD SCRIPT
 * Expose la totalité de l'API Electron native au processus Web React.
 */
const electronAPI = {
  // System
  getVersion: () => ipcRenderer.invoke('system:getVersion'),
  getPlatform: () => ipcRenderer.invoke('system:getPlatform'),
  ping: () => ipcRenderer.invoke('system:ping'),
  getMetrics: () => ipcRenderer.invoke('system:getMetrics'),
  getBrowserCacheInfo: () => ipcRenderer.invoke('system:getBrowserCacheInfo'),
  clearBrowserCache: (options?: any) => ipcRenderer.invoke('system:clearBrowserCache', options),

  // Dialog
  showMessageBox: (options: any) => ipcRenderer.invoke('dialog:showMessageBox', options),
  showOpenDialog: (options: any) => ipcRenderer.invoke('dialog:showOpenDialog', options),

  // FileSystem
  getSystemPaths: () => ipcRenderer.invoke('fs:getPaths'),
  readFile: (baseFolder: string, relativePath: string) => ipcRenderer.invoke('fs:readFile', baseFolder, relativePath),
  writeFile: (baseFolder: string, relativePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', baseFolder, relativePath, content),
  deleteFile: (baseFolder: string, relativePath: string) => ipcRenderer.invoke('fs:deleteFile', baseFolder, relativePath),
  exists: (baseFolder: string, relativePath: string) => ipcRenderer.invoke('fs:exists', baseFolder, relativePath),
  listDir: (baseFolder: string, relativePath?: string) => ipcRenderer.invoke('fs:listDir', baseFolder, relativePath),
  createTempFile: (prefix: string, content: string) => ipcRenderer.invoke('fs:createTempFile', prefix, content),
  readBinaryFile: (baseFolder: string, relativePath: string) => ipcRenderer.invoke('fs:readBinaryFile', baseFolder, relativePath),
  writeBinaryFile: (baseFolder: string, relativePath: string, content: string) => ipcRenderer.invoke('fs:writeBinaryFile', baseFolder, relativePath, content),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),

  // Mail (Outlook natif)
  composeOutlookMail: (input: any) => ipcRenderer.invoke('mail:composeOutlook', input),
  openDefaultMailClient: (input: any) => ipcRenderer.invoke('mail:openDefault', input),
  // Mail (SMTP)
  smtpMailStatus: () => ipcRenderer.invoke('mail:smtpStatus'),
  smtpMailSetConfig: (cfg: any) => ipcRenderer.invoke('mail:smtpSetConfig', cfg),
  smtpMailClear: () => ipcRenderer.invoke('mail:smtpClear'),
  smtpMailVerify: () => ipcRenderer.invoke('mail:smtpVerify'),
  smtpMailSendTest: (to: any) => ipcRenderer.invoke('mail:smtpSendTest', to),
  smtpMailSend: (input: any) => ipcRenderer.invoke('mail:smtpSend', input),

  // Clipboard
  readClipboardText: () => ipcRenderer.invoke('clipboard:readText'),
  writeClipboardText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  clearClipboard: () => ipcRenderer.invoke('clipboard:clear'),

  // Notification
  showNotification: (title: string, body: string) => ipcRenderer.invoke('notification:show', title, body),

  // Network
  isOnline: () => ipcRenderer.invoke('network:isOnline'),

  // Logger
  logInfo: (msg: string) => ipcRenderer.invoke('logger:info', msg),
  logWarn: (msg: string) => ipcRenderer.invoke('logger:warn', msg),
  logError: (msg: string) => ipcRenderer.invoke('logger:error', msg),
  getLogs: () => ipcRenderer.invoke('logger:getLogs'),
  exportLogs: () => ipcRenderer.invoke('logger:export'),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),

  // Printer
  getPrinters: () => ipcRenderer.invoke('printer:getPrinters'),
  printTestPage: (printerName: string) => ipcRenderer.invoke('printer:printTestPage', printerName),
  getPrinterQueue: () => ipcRenderer.invoke('printer:getQueue'),
  
  // Hardware
  getDevices: () => ipcRenderer.invoke('hardware:getDevices'),
  discoverHardware: () => ipcRenderer.invoke('hardware:discover'),

  // Scanner
  startScanner: () => ipcRenderer.invoke('scanner:start'),
  stopScanner: () => ipcRenderer.invoke('scanner:stop'),
  getScannerConfig: () => ipcRenderer.invoke('scanner:getConfig'),
  setScannerConfig: (c: any) => ipcRenderer.invoke('scanner:setConfig', c),
  getScannerHistory: () => ipcRenderer.invoke('scanner:getHistory'),
  onScan: (callback: (record: any) => void) => {
    ipcRenderer.on('scanner:onScan', (_, record) => callback(record));
  },

  // Backup
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: (path: string) => ipcRenderer.invoke('backup:restore', path),
  getBackupHistory: () => ipcRenderer.invoke('backup:getHistory'),
  onBackupProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('backup:onProgress', (_, data) => callback(data));
  },

  // Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (info: any) => ipcRenderer.invoke('updater:download', info),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  getUpdaterConfig: () => ipcRenderer.invoke('updater:getConfig'),
  setUpdaterConfig: (c: any) => ipcRenderer.invoke('updater:setConfig', c),
  getUpdaterHistory: () => ipcRenderer.invoke('updater:getHistory'),
  onUpdateStatus: (callback: (data: any) => void) => {
    ipcRenderer.on('updater:onStatus', (_, data) => callback(data));
  },

  // Diagnostics
  runDiagnostics: () => ipcRenderer.invoke('diagnostics:run'),
  getSystemMetrics: () => ipcRenderer.invoke('diagnostics:getMetrics'),

  // Maintenance
  getMaintenanceState: () => ipcRenderer.invoke('maintenance:getState'),
  setMaintenanceMode: (active: boolean) => ipcRenderer.invoke('maintenance:setMode', active),
  onMaintenanceToggle: (callback: (active: boolean) => void) => {
    ipcRenderer.on('maintenance:onToggle', (_, active) => callback(active));
  },

  // Security
  getSecurityStatus: () => ipcRenderer.invoke('security:getStatus'),
  checkSecurityPermission: (module: string, action: string) => ipcRenderer.invoke('security:checkPermission', module, action),

  // Performance
  getPerformanceMetrics: () => ipcRenderer.invoke('performance:getMetrics'),
  clearPerformanceCache: () => ipcRenderer.invoke('performance:clearCache'),
  runPerformanceBenchmark: () => ipcRenderer.invoke('performance:runBenchmark'),

  // POS
  openSale: (userId: string) => ipcRenderer.invoke('pos:openSale', userId),
  closeSale: () => ipcRenderer.invoke('pos:closeSale'),
  getPosSession: () => ipcRenderer.invoke('pos:getSession'),
  paySale: (amount: number, method: string) => ipcRenderer.invoke('pos:pay', amount, method),
  openCashDrawer: () => ipcRenderer.invoke('pos:openDrawer'),
  printPosReceipt: (data: any) => ipcRenderer.invoke('pos:printReceipt', data),
  displayCustomerMessage: (line1: string, line2: string) => ipcRenderer.invoke('pos:displayMessage', line1, line2),
  onPosEvent: (callback: (payload: { event: string; data: any }) => void) => {
    ipcRenderer.on('pos:onEvent', (_, payload) => callback(payload));
  },

  // Sync (moteur main-process, base Supabase configurée)
  enqueueSync: (op: any) => ipcRenderer.invoke('sync:enqueue', op),
  forceSync: () => ipcRenderer.invoke('sync:forceSync'),
  getSyncStatus: () => ipcRenderer.invoke('sync:getStatus'),
  setNetworkStatus: (online: boolean) => ipcRenderer.invoke('sync:setNetwork', online),
  configureSync: (cfg: any) => ipcRenderer.invoke('sync:configure', cfg),
  setSyncAuthToken: (token: string | null) => ipcRenderer.invoke('sync:setAuthToken', token),
  onSyncEvent: (callback: (payload: { event: string; data: any }) => void) => {
    ipcRenderer.on('sync:onEvent', (_, payload) => callback(payload));
  }
};

contextBridge.exposeInMainWorld('electron', electronAPI);
