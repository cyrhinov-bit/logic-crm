import { browserBridge } from './adapters/browserBridge';
import { electronBridge } from './adapters/electronBridge';
import type { PlatformBridge } from './types';

// Détection fiable de l'environnement Electron
const isElectronEnv = typeof window !== 'undefined' && typeof (window as any).electron !== 'undefined';

/**
 * Interface unique pour accéder aux services natifs.
 * La factory sélectionne automatiquement la bonne implémentation.
 */
export const platform: PlatformBridge = isElectronEnv ? electronBridge : browserBridge;

export * from './types';
export * from './errors';
