import type { PlatformBridge } from '../types';

const electron = (window as any).electron;

export const electronBridge: PlatformBridge = {
  isDesktop: true,
  system: {
    getVersion: async () => electron.getVersion(),
    getPlatform: async () => electron.getPlatform(),
    ping: async () => electron.ping(),
    getMetrics: async () => electron.getMetrics(),
    getBrowserCacheInfo: async () => electron.getBrowserCacheInfo(),
    clearBrowserCache: async (options) => electron.clearBrowserCache(options),
  },
  dialog: {
    showMessageBox: async (opts) => electron.showMessageBox(opts),
    showOpenDialog: async (opts) => electron.showOpenDialog(opts),
  },
  files: {
    getSystemPaths: async () => electron.getSystemPaths(),
    readFile: async (b, r) => electron.readFile(b, r),
    writeFile: async (b, r, c) => electron.writeFile(b, r, c),
    deleteFile: async (b, r) => electron.deleteFile(b, r),
    exists: async (b, r) => electron.exists(b, r),
    listDir: async (b, r) => electron.listDir(b, r),
    createTempFile: async (p, c) => electron.createTempFile(p, c),
    readBinaryFile: async (b, r) => electron.readBinaryFile(b, r),
    writeBinaryFile: async (b, r, c) => electron.writeBinaryFile(b, r, c),
  },
  shell: {
    openExternal: async (url) => electron.openExternal(url),
    showItemInFolder: async (path) => electron.showItemInFolder(path),
  },
  mail: {
    compose: async (options) => electron.composeOutlookMail(options),
    openInDefaultMailApp: async (options) => electron.openDefaultMailClient(options),
    smtp: {
      getStatus: async () => electron.smtpMailStatus(),
      setConfig: async (config) => electron.smtpMailSetConfig(config),
      clear: async () => electron.smtpMailClear(),
      verify: async () => electron.smtpMailVerify(),
      sendTest: async (to) => electron.smtpMailSendTest(to),
      send: async (options) => electron.smtpMailSend(options),
    },
  },
  clipboard: {
    readText: async () => electron.readClipboardText(),
    writeText: async (text) => electron.writeClipboardText(text),
    clear: async () => electron.clearClipboard(),
  },
  notifications: {
    showNotification: async (title, body) => electron.showNotification(title, body),
  },
  network: {
    isOnline: async () => electron.isOnline(),
  },
  logger: {
    info: (msg) => electron.logInfo(msg),
    warn: (msg) => electron.logWarn(msg),
    error: (msg) => electron.logError(msg),
    getLogs: async () => electron.getLogs(),
    exportLogs: async () => electron.exportLogs(),
  },
  settings: {
    getSetting: async (key) => electron.getSetting(key),
    setSetting: async (key, value) => electron.setSetting(key, value),
  },
  printer: {
    getPrinters: async () => electron.getPrinters(),
    printTestPage: async (name) => electron.printTestPage(name),
    getQueue: async () => electron.getPrinterQueue(),
  },
  hardware: {
    getDevices: async () => electron.getDevices(),
    discover: async () => electron.discoverHardware(),
  },
  scanner: {
    start: async () => electron.startScanner(),
    stop: async () => electron.stopScanner(),
    getConfig: async () => electron.getScannerConfig(),
    setConfig: async (c) => electron.setScannerConfig(c),
    getHistory: async () => electron.getScannerHistory(),
    onScan: (cb) => electron.onScan(cb),
  },
  backup: {
    createBackup: async () => electron.createBackup(),
    restoreBackup: async (path) => electron.restoreBackup(path),
    getHistory: async () => electron.getBackupHistory(),
    onProgress: (cb) => electron.onBackupProgress(cb),
  },
  updater: {
    checkForUpdates: async () => electron.checkForUpdates(),
    download: async (info) => electron.downloadUpdate(info),
    install: async () => electron.installUpdate(),
    getConfig: async () => electron.getUpdaterConfig(),
    setConfig: async (c) => electron.setUpdaterConfig(c),
    getHistory: async () => electron.getUpdaterHistory(),
    onStatus: (cb) => electron.onUpdateStatus(cb),
  },
  diagnostics: {
    runDiagnostics: async () => electron.runDiagnostics(),
    getSystemMetrics: async () => electron.getSystemMetrics(),
  },
  maintenance: {
    getState: async () => electron.getMaintenanceState(),
    setMode: async (active) => electron.setMaintenanceMode(active),
    onToggle: (cb) => electron.onMaintenanceToggle(cb),
  },
  security: {
    getStatus: async () => electron.getSecurityStatus(),
    checkPermission: async (module, action) => electron.checkSecurityPermission(module, action)
  },
  performance: {
    getMetrics: async () => electron.getPerformanceMetrics(),
    clearCache: async () => electron.clearPerformanceCache(),
    runBenchmark: async () => electron.runPerformanceBenchmark()
  },
  pos: {
    openSale: async (userId) => electron.openSale(userId),
    closeSale: async () => electron.closeSale(),
    getSession: async () => electron.getPosSession(),
    pay: async (amount, method) => electron.paySale(amount, method),
    openDrawer: async () => electron.openCashDrawer(),
    printReceipt: async (data) => electron.printPosReceipt(data),
    displayMessage: async (l1, l2) => electron.displayCustomerMessage(l1, l2),
    onEvent: (cb) => electron.onPosEvent(cb)
  },
  sync: {
    enqueue: async (op) => electron.enqueueSync(op),
    forceSync: async () => electron.forceSync(),
    getStatus: async () => electron.getSyncStatus(),
    setNetworkStatus: async (online) => electron.setNetworkStatus(online),
    configure: async (config) => electron.configureSync(config),
    setAuthToken: async (token) => electron.setSyncAuthToken(token),
    onEvent: (cb) => electron.onSyncEvent(cb)
  }
};
