import { LogEntry, LogLevel } from './LogTypes.js';
import { LogFilter } from './LogFilter.js';

export class LoggerService {
  private static logs: LogEntry[] = [];

  static log(level: LogLevel, message: string, context?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: LogFilter.sanitize(message),
      context: LogFilter.sanitize(context)
    };
    this.logs.unshift(entry);
    if (this.logs.length > 500) this.logs.pop();
  }

  static getRecentLogs() { return this.logs; }
}
