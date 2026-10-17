export class CacheManager {
  private static cache = new Map<string, { value: any, expires: number }>();

  static set(key: string, value: any, ttlMs: number = 60000) {
    this.cache.set(key, { value, expires: Date.now() + ttlMs });
  }

  static get(key: string): any {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  static clear() {
    this.cache.clear();
  }
  static getSize() { return this.cache.size; }
}
