/**
 * Classe de base pour toutes les erreurs liées à la plateforme.
 */
export class PlatformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformError';
  }
}

/**
 * Erreur levée lorsqu'un service natif n'est pas disponible.
 */
export class PlatformUnavailableError extends PlatformError {
  constructor(service: string) {
    super(`Le service "${service}" n'est pas disponible sur cette plateforme.`);
    this.name = 'PlatformUnavailableError';
  }
}

/**
 * Erreur spécifique levée lors de l'appel d'une fonctionnalité purement Desktop depuis un navigateur.
 */
export class DesktopOnlyFeatureError extends PlatformError {
  constructor(feature: string) {
    super(`La fonctionnalité "${feature}" est uniquement disponible en mode Desktop (Electron).`);
    this.name = 'DesktopOnlyFeatureError';
  }
}

/**
 * Erreur liée au dysfonctionnement du Bridge IPC.
 */
export class BridgeError extends PlatformError {
  constructor(message: string) {
    super(`Erreur du Bridge Electron : ${message}`);
    this.name = 'BridgeError';
  }
}
