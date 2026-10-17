import { PrintJob } from './PrintJob.js';

export class PrintQueue {
  private static queue: PrintJob[] = [];

  static addJob(job: PrintJob): void { this.queue.push(job); }
  static getQueue(): PrintJob[] { return this.queue; }
  static updateStatus(id: string, status: PrintJob['status'], error?: string) {
    const job = this.queue.find(j => j.id === id);
    if (job) { job.status = status; if (error) job.error = error; }
  }
  static clear(): void { this.queue = []; }
}
