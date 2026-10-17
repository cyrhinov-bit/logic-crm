import { app } from 'electron';

export class VersionService {
  static getCurrentVersion(): string {
    try {
      return app.isPackaged ? app.getVersion() : (process.env.npm_package_version || app.getVersion());
    } catch {
      return '1.0.0';
    }
  }

  static isNewer(current: string, target: string): boolean {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const c = parse(current);
    const t = parse(target);
    for (let i = 0; i < Math.max(c.length, t.length); i++) {
      const ci = c[i] ?? 0;
      const ti = t[i] ?? 0;
      if (ti > ci) return true;
      if (ti < ci) return false;
    }
    return false;
  }
}
