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
    if (!existsSync(safePath)) throw new FileNotFoundError(`Fichier introuvable : ${safePath}`);
    try {
      return await fs.readFile(safePath, 'utf-8');
    } catch (e: any) {
      throw new PermissionDeniedError(`Erreur de lecture : ${e.message}`);
    }
  }

  static async writeFile(baseFolder: string, relativePath: string, content: string): Promise<boolean> {
    const safePath = FileValidator.validateSafePath(baseFolder, relativePath);
    try {
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content, 'utf-8');
      return true;
    } catch (e: any) {
      throw new PermissionDeniedError(`Erreur d'écriture : ${e.message}`);
    }
  }

  static async deleteFile(baseFolder: string, relativePath: string): Promise<boolean> {
    const safePath = FileValidator.validateSafePath(baseFolder, relativePath);
    if (!existsSync(safePath)) return false;
    try {
      await fs.unlink(safePath);
      return true;
    } catch (e: any) {
      throw new PermissionDeniedError(`Erreur de suppression : ${e.message}`);
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
      throw new PermissionDeniedError(`Erreur de lecture du dossier : ${e.message}`);
    }
  }

  static async writeBinaryFile(baseFolder: string, relativePath: string, base64Content: string): Promise<boolean> {
    const safePath = FileValidator.validateSafePath(baseFolder, relativePath);
    try {
      const buffer = Buffer.from(base64Content, 'base64');
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, buffer);
      return true;
    } catch (e: any) {
      throw new PermissionDeniedError(`Erreur d'écriture binaire : ${e.message}`);
    }
  }

  static async readBinaryFile(baseFolder: string, relativePath: string): Promise<string> {
    const safePath = FileValidator.validateSafePath(baseFolder, relativePath);
    if (!existsSync(safePath)) throw new FileNotFoundError(`Fichier introuvable : ${safePath}`);
    try {
      const buffer = await fs.readFile(safePath);
      return buffer.toString('base64');
    } catch (e: any) {
      throw new PermissionDeniedError(`Erreur de lecture binaire : ${e.message}`);
    }
  }
}
