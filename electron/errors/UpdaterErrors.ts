export class UpdaterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class UpdateCheckFailedError extends UpdaterError {}
export class DownloadFailedError extends UpdaterError {}
export class InstallFailedError extends UpdaterError {}
export class RollbackFailedError extends UpdaterError {}
export class InvalidVersionError extends UpdaterError {}
export class NetworkUnavailableError extends UpdaterError {}
