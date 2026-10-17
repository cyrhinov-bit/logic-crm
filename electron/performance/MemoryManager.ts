export class MemoryManager {
  static getUsage() {
    const mem = process.memoryUsage();
    return {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024)
    };
  }
  static collectGarbage() {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }
}
