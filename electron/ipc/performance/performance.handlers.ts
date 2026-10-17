import { ipcMain } from 'electron';
import { PERFORMANCE_CHANNELS } from './performance.channels.js';
import { PerformanceManager } from '../../performance/index.js';

export function registerPerformanceHandlers(): void {
  ipcMain.handle(PERFORMANCE_CHANNELS.GET_METRICS, () => PerformanceManager.getMetrics());
  ipcMain.handle(PERFORMANCE_CHANNELS.CLEAR_CACHE, () => PerformanceManager.clearCache());
  ipcMain.handle(PERFORMANCE_CHANNELS.RUN_BENCHMARK, () => PerformanceManager.runBenchmark());
}
