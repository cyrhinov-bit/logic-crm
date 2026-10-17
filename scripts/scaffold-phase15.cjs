const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. Errors
write('electron/errors/PerformanceErrors.ts',
  "export class PerformanceError extends Error {\n" +
  "  constructor(message: string) {\n" +
  "    super(message);\n" +
  "    this.name = this.constructor.name;\n" +
  "  }\n" +
  "}\n" +
  "export class HighMemoryUsageError extends PerformanceError {}\n" +
  "export class IPCPerformanceError extends PerformanceError {}\n" +
  "export class SlowStartupError extends PerformanceError {}\n" +
  "export class CacheOverflowError extends PerformanceError {}\n" +
  "export class ResourceLeakError extends PerformanceError {}\n"
);

// 2. Services
write('electron/performance/MemoryManager.ts',
  "export class MemoryManager {\n" +
  "  static getUsage() {\n" +
  "    const mem = process.memoryUsage();\n" +
  "    return {\n" +
  "      rss: Math.round(mem.rss / 1024 / 1024),\n" +
  "      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),\n" +
  "      heapUsed: Math.round(mem.heapUsed / 1024 / 1024)\n" +
  "    };\n" +
  "  }\n" +
  "  static collectGarbage() {\n" +
  "    if (global.gc) {\n" +
  "      global.gc();\n" +
  "      return true;\n" +
  "    }\n" +
  "    return false;\n" +
  "  }\n" +
  "}\n"
);

write('electron/performance/CacheManager.ts',
  "export class CacheManager {\n" +
  "  private static cache = new Map<string, { value: any, expires: number }>();\n\n" +
  "  static set(key: string, value: any, ttlMs: number = 60000) {\n" +
  "    this.cache.set(key, { value, expires: Date.now() + ttlMs });\n" +
  "  }\n\n" +
  "  static get(key: string): any {\n" +
  "    const item = this.cache.get(key);\n" +
  "    if (!item) return null;\n" +
  "    if (Date.now() > item.expires) {\n" +
  "      this.cache.delete(key);\n" +
  "      return null;\n" +
  "    }\n" +
  "    return item.value;\n" +
  "  }\n\n" +
  "  static clear() {\n" +
  "    this.cache.clear();\n" +
  "  }\n" +
  "  static getSize() { return this.cache.size; }\n" +
  "}\n"
);

write('electron/performance/BenchmarkService.ts',
  "export class BenchmarkService {\n" +
  "  static async runBenchmark() {\n" +
  "    const start = Date.now();\n" +
  "    // Simulate work\n" +
  "    await new Promise(r => setTimeout(r, 500));\n" +
  "    const end = Date.now();\n" +
  "    return {\n" +
  "      durationMs: end - start,\n" +
  "      score: Math.round(10000 / (end - start + 1))\n" +
  "    };\n" +
  "  }\n" +
  "}\n"
);

write('electron/performance/StartupOptimizer.ts', "export class StartupOptimizer {}");
write('electron/performance/ProcessManager.ts', "export class ProcessManager {}");
write('electron/performance/IPCOptimizer.ts', "export class IPCOptimizer {}");
write('electron/performance/ResourceManager.ts', "export class ResourceManager {}");
write('electron/performance/IdleTaskManager.ts', "export class IdleTaskManager {}");
write('electron/performance/Profiler.ts', "export class Profiler {}");

write('electron/performance/PerformanceManager.ts',
  "import { MemoryManager } from './MemoryManager.js';\n" +
  "import { CacheManager } from './CacheManager.js';\n" +
  "import { BenchmarkService } from './BenchmarkService.js';\n\n" +
  "export class PerformanceManager {\n" +
  "  static getMetrics() {\n" +
  "    return {\n" +
  "      memory: MemoryManager.getUsage(),\n" +
  "      cacheSize: CacheManager.getSize(),\n" +
  "      uptime: process.uptime()\n" +
  "    };\n" +
  "  }\n" +
  "  static clearCache() {\n" +
  "    CacheManager.clear();\n" +
  "    return MemoryManager.collectGarbage();\n" +
  "  }\n" +
  "  static async runBenchmark() {\n" +
  "    return await BenchmarkService.runBenchmark();\n" +
  "  }\n" +
  "}\n"
);

write('electron/performance/index.ts',
  "export * from './PerformanceManager.js';\n" +
  "export * from './MemoryManager.js';\n" +
  "export * from './CacheManager.js';\n" +
  "export * from './BenchmarkService.js';\n"
);

// 3. IPC
write('electron/ipc/performance/performance.channels.ts',
  "export const PERFORMANCE_CHANNELS = {\n" +
  "  GET_METRICS: 'performance:getMetrics',\n" +
  "  CLEAR_CACHE: 'performance:clearCache',\n" +
  "  RUN_BENCHMARK: 'performance:runBenchmark'\n" +
  "} as const;\n"
);

write('electron/ipc/performance/performance.handlers.ts',
  "import { ipcMain } from 'electron';\n" +
  "import { PERFORMANCE_CHANNELS } from './performance.channels.js';\n" +
  "import { PerformanceManager } from '../../performance/index.js';\n\n" +
  "export function registerPerformanceHandlers(): void {\n" +
  "  ipcMain.handle(PERFORMANCE_CHANNELS.GET_METRICS, () => PerformanceManager.getMetrics());\n" +
  "  ipcMain.handle(PERFORMANCE_CHANNELS.CLEAR_CACHE, () => PerformanceManager.clearCache());\n" +
  "  ipcMain.handle(PERFORMANCE_CHANNELS.RUN_BENCHMARK, () => PerformanceManager.runBenchmark());\n" +
  "}\n"
);

console.log('Fichiers Phase 15 générés.');
