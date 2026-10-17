const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. Erreurs
write('electron/errors/FileSystemErrors.ts', `
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
`);

// 2. PathService
write('electron/services/filesystem/PathService.ts', `
import { app } from 'electron';
import path from 'path';

export class PathService {
  static getBasePaths() {
    return {
      userData: app.getPath('userData'),
      documents: app.getPath('documents'),
      downloads: app.getPath('downloads'),
      desktop: app.getPath('desktop'),
      temp: app.getPath('temp'),
      logs: path.join(app.getPath('userData'), 'logs'),
      backups: path.join(app.getPath('userData'), 'backups'),
      exports: path.join(app.getPath('userData'), 'exports'),
      imports: path.join(app.getPath('userData'), 'imports'),
      tickets: path.join(app.getPath('userData'), 'tickets'),
      reports: path.join(app.getPath('userData'), 'reports'),
      images: path.join(app.getPath('userData'), 'images'),
      attachments: path.join(app.getPath('userData'), 'attachments'),
    };
  }

  static resolvePath(baseFolder: string, relativePath: string): string {
    const paths = this.getBasePaths();
    const base = (paths as any)[baseFolder];
    if (!base) throw new Error(\`Base folder '\${baseFolder}' inconnu.\`);
    return path.join(base, relativePath);
  }
}
`);

// 3. FileValidator
write('electron/services/filesystem/FileValidator.ts', `
import path from 'path';
import { PathTraversalSecurityError, InvalidFileNameError } from '../../errors/FileSystemErrors.js';
import { PathService } from './PathService.js';

export class FileValidator {
  static validateSafePath(baseFolder: string, targetPath: string): string {
    const paths = PathService.getBasePaths();
    const base = (paths as any)[baseFolder];
    if (!base) throw new Error(\`Base folder '\${baseFolder}' inconnu.\`);
    
    const resolvedPath = path.resolve(base, targetPath);
    if (!resolvedPath.startsWith(base)) {
      throw new PathTraversalSecurityError(\`Accès refusé : Tentative de Path Traversal détectée (\${targetPath})\`);
    }
    
    return resolvedPath;
  }

  static validateFileName(fileName: string): void {
    const invalidChars = /[<>:"/\\\\|?*]/;
    if (invalidChars.test(fileName)) {
      throw new InvalidFileNameError(\`Le nom du fichier contient des caractères interdits : \${fileName}\`);
    }
  }
}
`);

// 4. FileSystemService
write('electron/services/filesystem/FileSystemService.ts', `
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { FileValidator } from './FileValidator.js';
import { FileNotFoundError, PermissionDeniedError } from '../../errors/FileSystemErrors.js';
import { PathService } from './PathService.js';
import path from 'path';

export class FileSystemService {
  static getPaths() {
    return PathService.getBasePaths();
  }

  static async readFile(baseFolder: string, relativePath: string): Promise<string> {
    const safePath = FileValidator.validateSafePath(baseFolder, relativePath);
    if (!existsSync(safePath)) throw new FileNotFoundError(\`Fichier introuvable : \${safePath}\`);
    try {
      return await fs.readFile(safePath, 'utf-8');
    } catch (e: any) {
      throw new PermissionDeniedError(\`Erreur de lecture : \${e.message}\`);
    }
  }

  static async writeFile(baseFolder: string, relativePath: string, content: string): Promise<boolean> {
    const safePath = FileValidator.validateSafePath(baseFolder, relativePath);
    try {
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content, 'utf-8');
      return true;
    } catch (e: any) {
      throw new PermissionDeniedError(\`Erreur d'écriture : \${e.message}\`);
    }
  }

  static async deleteFile(baseFolder: string, relativePath: string): Promise<boolean> {
    const safePath = FileValidator.validateSafePath(baseFolder, relativePath);
    if (!existsSync(safePath)) return false;
    try {
      await fs.unlink(safePath);
      return true;
    } catch (e: any) {
      throw new PermissionDeniedError(\`Erreur de suppression : \${e.message}\`);
    }
  }

  static async exists(baseFolder: string, relativePath: string): Promise<boolean> {
    const safePath = FileValidator.validateSafePath(baseFolder, relativePath);
    return existsSync(safePath);
  }

  static async listDir(baseFolder: string, relativePath: string = ''): Promise<string[]> {
    const safePath = FileValidator.validateSafePath(baseFolder, relativePath);
    if (!existsSync(safePath)) return [];
    try {
      return await fs.readdir(safePath);
    } catch (e: any) {
      throw new PermissionDeniedError(\`Erreur de lecture du dossier : \${e.message}\`);
    }
  }
}
`);

// 5. TempFileService
write('electron/services/filesystem/TempFileService.ts', `
import { PathService } from './PathService.js';
import { FileValidator } from './FileValidator.js';
import path from 'path';
import fs from 'fs/promises';

export class TempFileService {
  static async createTempFile(prefix: string, content: string): Promise<string> {
    const fileName = \`\${prefix}-\${Date.now()}-\${Math.floor(Math.random() * 10000)}.tmp\`;
    const safePath = FileValidator.validateSafePath('temp', fileName);
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf-8');
    return safePath;
  }
  
  static async cleanupOldTempFiles(maxAgeMs: number = 86400000): Promise<void> {
    // Logique de nettoyage à implémenter plus tard
  }
}
`);

// 6. Interfaces / Mocks
const mockClass = (name) => "export class " + name + "Service { static async test() { return 'not_implemented'; } }\n";
['Download', 'Export', 'Import', 'Mime', 'FileWatcher'].forEach(name => {
  write("electron/services/filesystem/" + name + "Service.ts", mockClass(name));
});

// 7. Index
write('electron/services/filesystem/index.ts', `
export * from './PathService.js';
export * from './FileValidator.js';
export * from './FileSystemService.js';
export * from './TempFileService.js';
export * from './DownloadService.js';
export * from './ExportService.js';
export * from './ImportService.js';
export * from './MimeService.js';
export * from './FileWatcher.js';
`);

console.log('Fichiers FS générés.');
