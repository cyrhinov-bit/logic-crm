const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. LOGGER
write('electron/services/logger/LogTypes.ts',
  "export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';\n" +
  "export interface LogEntry {\n" +
  "  timestamp: string;\n" +
  "  level: LogLevel;\n" +
  "  message: string;\n" +
  "  context?: any;\n" +
  "}\n"
);

write('electron/services/logger/LogFilter.ts',
  "export class LogFilter {\n" +
  "  static sanitize(data: any): any {\n" +
  "    if (typeof data === 'string') {\n" +
  "      return data.replace(/(password|token|secret|key)=[^& ]+/gi, '$1=***');\n" +
  "    }\n" +
  "    return data;\n" +
  "  }\n" +
  "}\n"
);

write('electron/services/logger/LoggerService.ts',
  "import { LogEntry, LogLevel } from './LogTypes.js';\n" +
  "import { LogFilter } from './LogFilter.js';\n\n" +
  "export class LoggerService {\n" +
  "  private static logs: LogEntry[] = [];\n\n" +
  "  static log(level: LogLevel, message: string, context?: any) {\n" +
  "    const entry: LogEntry = {\n" +
  "      timestamp: new Date().toISOString(),\n" +
  "      level,\n" +
  "      message: LogFilter.sanitize(message),\n" +
  "      context: LogFilter.sanitize(context)\n" +
  "    };\n" +
  "    this.logs.unshift(entry);\n" +
  "    if (this.logs.length > 500) this.logs.pop();\n" +
  "  }\n\n" +
  "  static getRecentLogs() { return this.logs; }\n" +
  "}\n"
);

write('electron/services/logger/LogExporter.ts', "export class LogExporter { static async exportLogs() { return 'logs_exported.zip'; } }");
write('electron/services/logger/LogStorage.ts', "export class LogStorage {}");
write('electron/services/logger/LogRotation.ts', "export class LogRotation {}");
write('electron/services/logger/LogFormatter.ts', "export class LogFormatter {}");

write('electron/services/logger/LoggerManager.ts',
  "import { LoggerService } from './LoggerService.js';\n" +
  "import { LogExporter } from './LogExporter.js';\n\n" +
  "export class LoggerManager {\n" +
  "  static info(msg: string) { LoggerService.log('INFO', msg); }\n" +
  "  static warn(msg: string) { LoggerService.log('WARN', msg); }\n" +
  "  static error(msg: string) { LoggerService.log('ERROR', msg); }\n" +
  "  static fatal(msg: string) { LoggerService.log('FATAL', msg); }\n\n" +
  "  static getLogs() { return LoggerService.getRecentLogs(); }\n" +
  "  static async export() { return await LogExporter.exportLogs(); }\n" +
  "}\n"
);

write('electron/services/logger/index.ts',
  "export * from './LogTypes.js';\n" +
  "export * from './LogFilter.js';\n" +
  "export * from './LoggerService.js';\n" +
  "export * from './LoggerManager.js';\n"
);

write('electron/ipc/logger/logger.channels.ts',
  "export const LOGGER_CHANNELS = {\n" +
  "  INFO: 'logger:info',\n" +
  "  WARN: 'logger:warn',\n" +
  "  ERROR: 'logger:error',\n" +
  "  GET_LOGS: 'logger:getLogs',\n" +
  "  EXPORT: 'logger:export'\n" +
  "} as const;\n"
);

write('electron/ipc/logger/logger.handlers.ts',
  "import { ipcMain } from 'electron';\n" +
  "import { LOGGER_CHANNELS } from './logger.channels.js';\n" +
  "import { LoggerManager } from '../../services/logger/index.js';\n\n" +
  "export function registerLoggerHandlers(): void {\n" +
  "  ipcMain.handle(LOGGER_CHANNELS.INFO, (_, msg) => LoggerManager.info(msg));\n" +
  "  ipcMain.handle(LOGGER_CHANNELS.WARN, (_, msg) => LoggerManager.warn(msg));\n" +
  "  ipcMain.handle(LOGGER_CHANNELS.ERROR, (_, msg) => LoggerManager.error(msg));\n" +
  "  ipcMain.handle(LOGGER_CHANNELS.GET_LOGS, () => LoggerManager.getLogs());\n" +
  "  ipcMain.handle(LOGGER_CHANNELS.EXPORT, () => LoggerManager.export());\n" +
  "}\n"
);

// 2. DIAGNOSTICS
write('electron/services/diagnostics/SystemDiagnostics.ts',
  "import os from 'os';\n" +
  "export class SystemDiagnostics {\n" +
  "  static getMetrics() {\n" +
  "    return {\n" +
  "      platform: os.platform(),\n" +
  "      arch: os.arch(),\n" +
  "      totalMem: os.totalmem(),\n" +
  "      freeMem: os.freemem(),\n" +
  "      cpus: os.cpus().length,\n" +
  "      uptime: os.uptime()\n" +
  "    };\n" +
  "  }\n" +
  "}\n"
);

write('electron/services/diagnostics/ReportGenerator.ts',
  "import { SystemDiagnostics } from './SystemDiagnostics.js';\n" +
  "import { LoggerManager } from '../logger/index.js';\n\n" +
  "export class ReportGenerator {\n" +
  "  static async generateReport() {\n" +
  "    return {\n" +
  "      timestamp: new Date().toISOString(),\n" +
  "      system: SystemDiagnostics.getMetrics(),\n" +
  "      logs: LoggerManager.getLogs().slice(0, 50)\n" +
  "    };\n" +
  "  }\n" +
  "}\n"
);

write('electron/services/diagnostics/DiagnosticManager.ts',
  "import { SystemDiagnostics } from './SystemDiagnostics.js';\n" +
  "import { ReportGenerator } from './ReportGenerator.js';\n\n" +
  "export class DiagnosticManager {\n" +
  "  static getSystemMetrics() { return SystemDiagnostics.getMetrics(); }\n" +
  "  static async runDiagnostics() { return await ReportGenerator.generateReport(); }\n" +
  "}\n"
);

write('electron/services/diagnostics/index.ts',
  "export * from './DiagnosticManager.js';\n"
);

write('electron/ipc/diagnostics/diagnostics.channels.ts',
  "export const DIAGNOSTICS_CHANNELS = {\n" +
  "  RUN: 'diagnostics:run',\n" +
  "  GET_METRICS: 'diagnostics:getMetrics'\n" +
  "} as const;\n"
);

write('electron/ipc/diagnostics/diagnostics.handlers.ts',
  "import { ipcMain } from 'electron';\n" +
  "import { DIAGNOSTICS_CHANNELS } from './diagnostics.channels.js';\n" +
  "import { DiagnosticManager } from '../../services/diagnostics/index.js';\n\n" +
  "export function registerDiagnosticsHandlers(): void {\n" +
  "  ipcMain.handle(DIAGNOSTICS_CHANNELS.RUN, () => DiagnosticManager.runDiagnostics());\n" +
  "  ipcMain.handle(DIAGNOSTICS_CHANNELS.GET_METRICS, () => DiagnosticManager.getSystemMetrics());\n" +
  "}\n"
);

// 3. MAINTENANCE
write('electron/services/maintenance/MaintenanceEvents.ts',
  "import { EventEmitter } from 'events';\n" +
  "export const maintenanceEmitter = new EventEmitter();\n"
);

write('electron/services/maintenance/MaintenanceManager.ts',
  "import { maintenanceEmitter } from './MaintenanceEvents.js';\n\n" +
  "export class MaintenanceManager {\n" +
  "  private static isMaintenance = false;\n\n" +
  "  static getState() { return this.isMaintenance; }\n" +
  "  static setMode(active: boolean) {\n" +
  "    this.isMaintenance = active;\n" +
  "    maintenanceEmitter.emit('modeChanged', active);\n" +
  "  }\n" +
  "}\n"
);

write('electron/services/maintenance/index.ts',
  "export * from './MaintenanceManager.js';\n" +
  "export * from './MaintenanceEvents.js';\n"
);

write('electron/ipc/maintenance/maintenance.channels.ts',
  "export const MAINTENANCE_CHANNELS = {\n" +
  "  GET_STATE: 'maintenance:getState',\n" +
  "  SET_MODE: 'maintenance:setMode',\n" +
  "  ON_TOGGLE: 'maintenance:onToggle'\n" +
  "} as const;\n"
);

write('electron/ipc/maintenance/maintenance.handlers.ts',
  "import { ipcMain, BrowserWindow } from 'electron';\n" +
  "import { MAINTENANCE_CHANNELS } from './maintenance.channels.js';\n" +
  "import { MaintenanceManager, maintenanceEmitter } from '../../services/maintenance/index.js';\n\n" +
  "export function registerMaintenanceHandlers(): void {\n" +
  "  maintenanceEmitter.on('modeChanged', (active) => {\n" +
  "    const windows = BrowserWindow.getAllWindows();\n" +
  "    windows.forEach(win => win.webContents.send(MAINTENANCE_CHANNELS.ON_TOGGLE, active));\n" +
  "  });\n\n" +
  "  ipcMain.handle(MAINTENANCE_CHANNELS.GET_STATE, () => MaintenanceManager.getState());\n" +
  "  ipcMain.handle(MAINTENANCE_CHANNELS.SET_MODE, (_, active) => MaintenanceManager.setMode(active));\n" +
  "}\n"
);

console.log('Fichiers Phase 13 générés.');
