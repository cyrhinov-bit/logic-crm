export class FileSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class FileNotFoundError extends FileSystemError {}
export class PermissionDeniedError extends FileSystemError {}
export class InvalidFileTypeError extends FileSystemError {}
export class InvalidFileNameError extends FileSystemError {}
export class FileTooLargeError extends FileSystemError {}
export class PathTraversalSecurityError extends FileSystemError {}
