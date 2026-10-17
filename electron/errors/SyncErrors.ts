export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class SyncFailedError extends SyncError {}
export class NetworkOfflineError extends SyncError {}
export class ConflictResolutionError extends SyncError {}
export class QueueFullError extends SyncError {}
