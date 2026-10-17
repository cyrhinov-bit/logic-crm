/**
 * Scopage d'accès par rôle — règle unique pour tous les modules :
 * - Direction (Directeur, Directeur adjoint, SuperAdmin) : voit tout.
 * - Tous les autres rôles (Responsable, Commercial, ...) : uniquement leurs
 *   propres données (lignes dont ils sont propriétaires : commercial_id,
 *   cree_par, beneficiaire_id, authorId, ...).
 * Les référentiels partagés (catalogues, services, utilisateurs) restent
 * visibles par tous (nécessaires à la saisie).
 * Les clients sont aussi en lecture partagée : tout rôle authentifié peut
 * sélectionner un client existant (Devis / Factures / Documents).
 * La gestion (création / modification / suppression) reste propriétaire.
 */

export const DIRECTOR_ROLES = ['Directeur', 'Directeur adjoint', 'SuperAdmin'] as const;

export function isDirectorLike(role?: string | null): boolean {
  return DIRECTOR_ROLES.includes((role || '') as (typeof DIRECTOR_ROLES)[number]);
}

/** true si l'utilisateur peut voir toutes les données (direction). */
export function canViewAll(role?: string | null): boolean {
  return isDirectorLike(role);
}

/** Ne garde que les lignes dont `userId` est (l'un des) propriétaire(s). */
export function filterOwned<T>(items: T[], userId: string | undefined, ownersOf: (item: T) => Array<string | undefined | null>): T[] {
  if (!userId) return [];
  return items.filter(item => ownersOf(item).some(o => o === userId));
}

/** Liste visible selon le rôle : tout pour la direction, sinon possessions. */
export function visibleTo<T>(items: T[], role: string | undefined, userId: string | undefined, ownersOf: (item: T) => Array<string | undefined | null>): T[] {
  if (canViewAll(role)) return items;
  return filterOwned(items, userId, ownersOf);
}

/** true si `userId` est (l'un des) propriétaire(s) de la ligne. */
export function isOwnerOf<T>(item: T, userId: string | undefined, ownersOf: (item: T) => Array<string | undefined | null>): boolean {
  if (!userId) return false;
  return ownersOf(item).some(o => o === userId);
}

/** Peut gérer (modifier / changer statut / supprimer) : direction ou propriétaire. */
export function canManageOwned<T>(item: T, role: string | undefined, userId: string | undefined, ownersOf: (item: T) => Array<string | undefined | null>): boolean {
  if (canViewAll(role)) return true;
  return isOwnerOf(item, userId, ownersOf);
}

/**
 * Lecture partagée du référentiel clients : Direction + Responsable voient
 * tous les clients (sélections Devis / Factures / Documents).
 * Les autres rôles (Commercial, ...) restent scopés à leurs propres clients.
 */
export function canReadAllClients(role?: string | null): boolean {
  return canViewAll(role) || role === 'Responsable';
}
