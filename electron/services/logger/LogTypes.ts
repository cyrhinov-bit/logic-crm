export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: any;
}
