export class BenchmarkService {
  static async runBenchmark() {
    const start = Date.now();
    // Simulate work
    await new Promise(r => setTimeout(r, 500));
    const end = Date.now();
    return {
      durationMs: end - start,
      score: Math.round(10000 / (end - start + 1))
    };
  }
}
