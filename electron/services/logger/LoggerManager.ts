import { LoggerService } from './LoggerService.js';
import { LogExporter } from './LogExporter.js';

export class LoggerManager {
  static info(msg: string) { LoggerService.log('INFO', msg); }
  static warn(msg: string) { LoggerService.log('WARN', msg); }
  static error(msg: string) { LoggerService.log('ERROR', msg); }
  static fatal(msg: string) { LoggerService.log('FATAL', msg); }

  static getLogs() { return LoggerService.getRecentLogs(); }
  static async export() { return await LogExporter.exportLogs(); }
}
