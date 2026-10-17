export class PerformanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class HighMemoryUsageError extends PerformanceError {}
export class IPCPerformanceError extends PerformanceError {}
export class SlowStartupError extends PerformanceError {}
export class CacheOverflowError extends PerformanceError {}
export class ResourceLeakError extends PerformanceError {}
