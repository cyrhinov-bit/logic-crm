export class PermissionManager {
  static hasPermission(_module: string, _action: string): boolean {
    // Squelette: par défaut, on autorise tout pour le MVP, 
    // mais l'architecture est prête.
    return true;
  }
}
