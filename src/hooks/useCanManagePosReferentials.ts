import { useAuth } from '../context/AuthContext';

// F26 : seuls Direction/Gérance modifient les référentiels (catégories, marques,
// fournisseurs, remises, paramètres). Les Caissiers voient en lecture seule.
export function useCanManagePosReferentials(): boolean {
  const { currentUser } = useAuth();
  if (!currentUser) return false;
  const roles = [currentUser.role, currentUser.posRole].filter(Boolean);
  return roles.some(r => ['Directeur', 'Directeur adjoint', 'SuperAdmin', 'Gerant'].includes(r as string));
}
