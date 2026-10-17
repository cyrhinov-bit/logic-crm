/**
 * Activation des modules CRM — source unique de vérité pour l'affichage
 * conditionnel (menu latéral, gardes de routes, cartes KPI des dashboards).
 *
 * Sémantique « opt-out » : un module est actif par défaut ; seul un `false`
 * explicite le désactive. Le `SuperAdmin` est exempté (accès total permanent).
 */

export type CrmModuleKey =
  | 'crmPrestationsEnabled'
  | 'crmCaisseEnabled'
  | 'crmMaintenanceEnabled'
  | 'crmStocksEnabled'
  | 'crmTiersEnabled'
  | 'crmCommerciauxEnabled'
  | 'crmCommissionsEnabled'
  | 'crmFacturationEnabled'
  | 'crmSupFacturesEnabled'
  | 'crmReportsEnabled'
  | 'crmTeamReportsEnabled';

export const CRM_MODULE_KEYS: CrmModuleKey[] = [
  'crmPrestationsEnabled',
  'crmCaisseEnabled',
  'crmMaintenanceEnabled',
  'crmStocksEnabled',
  'crmTiersEnabled',
  'crmCommerciauxEnabled',
  'crmCommissionsEnabled',
  'crmFacturationEnabled',
  'crmSupFacturesEnabled',
  'crmReportsEnabled',
  'crmTeamReportsEnabled',
];

/** Utilisateur minimal nécessaire pour résoudre l'activation d'un module. */
export type CrmModuleUser =
  | ({ role?: string | null } & Partial<Record<CrmModuleKey, boolean | null | undefined>>)
  | null
  | undefined;

/** Un module est-il actif pour cet utilisateur ? */
export function isCrmModuleEnabled(user: CrmModuleUser, key: CrmModuleKey): boolean {
  if (!user) return false;
  if (user.role === 'SuperAdmin') return true;
  return (user as Record<string, unknown>)[key] !== false;
}

/** Nombre de modules activés pour un utilisateur (0 si inconnu). */
export function countEnabledCrmModules(user: CrmModuleUser): number {
  if (!user) return 0;
  return CRM_MODULE_KEYS.filter(key => isCrmModuleEnabled(user, key)).length;
}
