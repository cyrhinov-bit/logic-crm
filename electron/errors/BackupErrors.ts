export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class BackupFailedError extends BackupError {}
export class RestoreFailedError extends BackupError {}
export class BackupCorruptedError extends BackupError {}
export class BackupVersionMismatchError extends BackupError {}
export class BackupEncryptionError extends BackupError {}
export class InsufficientDiskSpaceError extends BackupError {}
