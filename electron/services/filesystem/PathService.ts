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
    if (!base) throw new Error(`Base folder '${baseFolder}' inconnu.`);
    return path.join(base, relativePath);
  }
}
