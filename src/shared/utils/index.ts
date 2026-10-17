import type { PlatformTarget, SharedRole } from '../index';
import { sharedNavigation } from '../index';

export function buildAppConfig(target: PlatformTarget) {
  const apiBaseUrl =
    target === 'mobile'
      ? 'https://api-mobile.hinov.local'
      : 'https://api.hinov.local';

  return {
    appName: 'Hinov Business Suite',
    target,
    apiBaseUrl,
  };
}

export function getPlatformLabel(target: PlatformTarget): string {
  switch (target) {
    case 'desktop':
      return 'Desktop';
    case 'mobile':
      return 'Mobile';
    default:
      return 'Web';
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidPin(value: string): boolean {
  return value.trim().length > 0;
}

export function validateCredentials(email: string, pin: string): { valid: boolean; normalizedEmail?: string; error?: string } {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { valid: false, error: 'Email invalide.' };
  }

  if (!isValidPin(pin)) {
    return { valid: false, error: 'Le mot de passe ne peut pas être vide.' };
  }

  return {
    valid: true,
    normalizedEmail,
  };
}

export function getDefaultRouteForRole(role: SharedRole): string {
  switch (role) {
    case 'Directeur':
      return '/';
    case 'Responsable':
      return '/';
    case 'Commercial':
      return '/commercial';
    case 'Gerant':
      return '/pos';
    case 'Caissier':
      return '/pos/terminal';
    default:
      return '/';
  }
}

export function getRouteLabel(path: string): string {
  const item = sharedNavigation.find((entry) => entry.path === path);
  return item?.label ?? 'Accueil';
}
