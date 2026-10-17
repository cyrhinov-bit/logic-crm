import { MemoryManager } from './MemoryManager.js';
import { CacheManager } from './CacheManager.js';
import { BenchmarkService } from './BenchmarkService.js';

export class PerformanceManager {
  static getMetrics() {
    return {
      memory: MemoryManager.getUsage(),
      cacheSize: CacheManager.getSize(),
      uptime: process.uptime()
    };
  }
  static clearCache() {
    CacheManager.clear();
    return MemoryManager.collectGarbage();
  }
  static async runBenchmark() {
    return await BenchmarkService.runBenchmark();
  }
}
