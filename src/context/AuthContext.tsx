import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { isValidPin, normalizeEmail } from '@/shared';
import { supabase } from '../lib/supabase';
import { queueSyncAction } from '../lib/sync';
import type { User } from './AppContext';
import { getUserThemeColor, applyTheme } from '../lib/theme';

interface AuthState {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  loginAsTestUser: (role: User['role']) => void;
  logout: () => Promise<void>;
  updatePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; error?: string }>;
  updateCurrentUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const AUTH_STORAGE_KEY = 'auth_last_user';

// Helper de timeout pour éviter les blocages réseau infinis
const withAuthTimeout = async <T = any,>(promiseOrThenable: any, ms: number = 2500): Promise<T> => {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Délai réseau dépassé')), ms);
  });
  try {
    return await Promise.race([
      Promise.resolve(promiseOrThenable),
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // Récupération synchrone immédiate du dernier profil connecté pour un démarrage 0ms
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  
  // Si un profil était déjà en cache, l'application est immédiatement interactive
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(AUTH_STORAGE_KEY);
    } catch {
      return true;
    }
  });

  // Déconnexion explicite demandée par l'utilisateur (bouton logout).
  // Tant qu'elle n'est pas demandée, un événement SIGNED_OUT Supabase (ex :
  // refresh token expiré après fermeture prolongée de la PWA mobile) ne doit
  // PAS effacer le cache local ni renvoyer vers /login : on reste connecté
  // en mode dégradé/hors-ligne jusqu'à la prochaine connexion réussie.
  const logoutRequestedRef = useRef(false);

  // Appliquer automatiquement le thème de l'utilisateur connecté
  useEffect(() => {
    const userColor = getUserThemeColor(currentUser?.id);
    applyTheme(userColor);
  }, [currentUser?.id]);

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        // Tentative de récupération de la session Supabase avec timeout de 2.5s
        const result = await withAuthTimeout(supabase.auth.getSession(), 2500);
        const session = result?.data?.session;
        if (session && isMounted) {
          await fetchUserProfile(session.user.id);
        } else if (isMounted) {
          // Si aucune session active Supabase et pas d'utilisateur en cache local
          if (!localStorage.getItem(AUTH_STORAGE_KEY)) {
            setCurrentUser(null);
          }
          setLoading(false);
        }
      } catch {
        // Hors-ligne au démarrage : on conserve l'utilisateur en cache s'il existe
        console.warn('[AuthContext] Mode hors-ligne détecté au démarrage.');
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string, session: { user: { id: string } } | null) => {
      if (!isMounted) return;
      if (session) {
        // Moteur sync du main-process (desktop) : lui transmettre le token de
        // session pour ses appels authentifiés (jamais persisté côté main).
        try {
          const { platform } = await import('../platform');
          const token = (session as any)?.access_token || null;
          if (platform.isDesktop && token) {
            await platform.sync.setAuthToken(token).catch(() => {});
          }
        } catch {}
        await fetchUserProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        if (logoutRequestedRef.current) {
          // Déconnexion explicite : on efface tout et on laisse les guards
          // rediriger vers /login.
          logoutRequestedRef.current = false;
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setCurrentUser(null);
        } else {
          // SIGNED_OUT subi (session expirée, refresh rejeté...) : on garde
          // l'utilisateur en cache pour ne pas le renvoyer au login.
          console.warn('[AuthContext] Session perdue sans déconnexion explicite, conservation du cache local.');
        }
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      // 1. Tenter la récupération en ligne avec un timeout court de 2.5s
      const response = await withAuthTimeout(
        supabase.from('profiles').select('*').eq('id', userId).single(),
        2500
      );
      
      const data = response?.data;
      const error = (response as any)?.error;

      if (data && !error) {
        let cachedUser: User | undefined;
        try {
          const { db } = await import('../lib/db');
          const cachedList = await db.profiles.getItem<User[]>('data');
          cachedUser = cachedList?.find(u => u.id === data.id);
        } catch {}

        const isDir = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(data.role);
        // Défaut modules CRM : jamais pour Caissier/Gerant/Encaisseur (rôles POS), sinon activé sauf désactivation explicite
        const crmDefault = !['Caissier', 'Gerant', 'Encaisseur'].includes(data.role);
        const resolveBool = (dbVal: any, localVal: any, defaultVal: boolean) => {
          if (dbVal === true) return true;
          if (dbVal === false) return false;
          if (localVal === true) return true;
          if (localVal === false) return false;
          return defaultVal;
        };

        const userObj: User = {
          id: data.id,
          name: data.name,
          email: data.email,
          role: data.role as User['role'],
          serviceId: data.service_id,
          pin: data.pin,
          lastLogin: data.last_login,
          active: data.active !== false,
          photo: data.photo || undefined,
          posReturnsEnabled: resolveBool(data.pos_returns_enabled, cachedUser?.posReturnsEnabled, false),
          posCatalogueEnabled: resolveBool(data.pos_catalogue_enabled, cachedUser?.posCatalogueEnabled, false),
          posSupplyEnabled: resolveBool(data.pos_supply_enabled, cachedUser?.posSupplyEnabled, false),
          posInventoryEnabled: resolveBool(data.pos_inventory_enabled, cachedUser?.posInventoryEnabled, false),
          posStockEnabled: resolveBool(data.pos_stock_enabled, cachedUser?.posStockEnabled, false),
          posRole: data.pos_role || cachedUser?.posRole || null,
          crmPrestationsEnabled: resolveBool(data.crm_prestations_enabled, cachedUser?.crmPrestationsEnabled, crmDefault),
          crmCaisseEnabled: resolveBool(data.crm_caisse_enabled, cachedUser?.crmCaisseEnabled, crmDefault),
          crmMaintenanceEnabled: resolveBool(data.crm_maintenance_enabled, cachedUser?.crmMaintenanceEnabled, crmDefault),
          crmStocksEnabled: resolveBool(data.crm_stocks_enabled, cachedUser?.crmStocksEnabled, crmDefault),
          crmTiersEnabled: resolveBool(data.crm_tiers_enabled, cachedUser?.crmTiersEnabled, crmDefault),
          crmCommerciauxEnabled: resolveBool(data.crm_commerciaux_enabled, cachedUser?.crmCommerciauxEnabled, crmDefault),
          crmCommissionsEnabled: resolveBool(data.crm_commissions_enabled, cachedUser?.crmCommissionsEnabled, crmDefault),
          crmFacturationEnabled: resolveBool(data.crm_facturation_enabled, cachedUser?.crmFacturationEnabled, crmDefault),
          crmSupFacturesEnabled: resolveBool(data.crm_sup_factures_enabled, cachedUser?.crmSupFacturesEnabled, isDir),
          crmReportsEnabled: resolveBool(data.crm_reports_enabled, cachedUser?.crmReportsEnabled, !isDir),
          crmTeamReportsEnabled: resolveBool(data.crm_team_reports_enabled, cachedUser?.crmTeamReportsEnabled, isDir)
        };

        setCurrentUser(userObj);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userObj));
        setLoading(false);
        return;
      }

      // En ligne mais profil introuvable (0 ligne, pas d'erreur réseau/RLS) :
      // compte fantôme (auth sans profil, ou profil supprimé). PAS de repli local :
      // déconnexion + retour à l'écran de connexion. M GBA reste seule caissière.
      if (error && ((error as any)?.code === 'PGRST116' || String((error as any)?.message || '').includes('0 rows'))) {
        console.warn('[AuthContext] Compte inconnu du serveur, déconnexion forcée.');
        try {
          await supabase.auth.signOut();
        } catch {}
        try {
          localStorage.removeItem(AUTH_STORAGE_KEY);
        } catch {}
        setCurrentUser(null);
        setLoading(false);
        return;
      }
    } catch {
      console.warn('[AuthContext] Échec réseau lors du chargement du profil, bascule sur le cache local.');
    }

    // 2. Fallback Hors-Ligne immédiat : Lecture depuis IndexedDB ou LocalStorage
    try {
      const { db } = await import('../lib/db');
      const cachedUsers = await db.profiles.getItem<User[]>('data');
      if (cachedUsers) {
        const cachedUser = cachedUsers.find(u => u.id === userId);
        if (cachedUser) {
          setCurrentUser(cachedUser);
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(cachedUser));
          setLoading(false);
          return;
        }
      }
    } catch (cacheErr) {
      console.error('[AuthContext] Erreur lecture cache profil :', cacheErr);
    }
    
    setLoading(false);
  };

  const login = async (emailInput: string, pinInput: string): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = normalizeEmail(emailInput);
    const cleanPin = pinInput.trim();

    if (!isValidPin(cleanPin)) {
      return { success: false, error: 'Le mot de passe / code PIN ne peut pas être vide.' };
    }

    // Fonction interne d'authentification hors-ligne de secours
    const attemptOfflineLogin = async (): Promise<{ success: boolean; error?: string }> => {
      try {
        const { db } = await import('../lib/db');
        const cachedUsers = await db.profiles.getItem<User[]>('data');
        if (cachedUsers && cachedUsers.length > 0) {
          const matchedUser = cachedUsers.find(u => 
            normalizeEmail(u.email) === cleanEmail || 
            u.name.toLowerCase() === cleanEmail.toLowerCase()
          );

          if (!matchedUser) {
            return { success: false, error: 'Utilisateur introuvable dans la base locale hors-ligne.' };
          }

          if (matchedUser.active === false) {
            return { success: false, error: 'Ce compte a été désactivé.' };
          }

          if (matchedUser.pin && matchedUser.pin === cleanPin) {
            console.log('[AuthContext] Connexion hors-ligne réussie pour :', matchedUser.name);
            logoutRequestedRef.current = false;
            setCurrentUser(matchedUser);
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(matchedUser));
            setLoading(false);
            return { success: true };
          } else {
            return { success: false, error: 'Code PIN incorrect (mode hors-ligne).' };
          }
        }
      } catch (err) {
        console.error('[AuthContext] Erreur vérification login hors-ligne :', err);
      }
      return { success: false, error: 'Impossible de se connecter hors-ligne (aucun utilisateur en cache).' };
    };

    // 1. Si déconnecté d'Internet de manière évidente, tenter directement le login hors-ligne
    if (!navigator.onLine) {
      return await attemptOfflineLogin();
    }

    // 2. Tentative de connexion en ligne avec timeout de 3.5s
    try {
      const signInPromise = supabase.auth.signInWithPassword({ 
        email: cleanEmail, 
        password: cleanPin 
      });

      const { data, error } = await withAuthTimeout(signInPromise, 3500);

      if (error || !data?.user) {
        // Si erreur d'identifiants côté serveur
        if (error && (error.message.includes('Invalid login credentials') || error.message.includes('Email not confirmed'))) {
          return { success: false, error: 'Identifiants ou code PIN incorrects.' };
        }
        // Pour les autres erreurs, tenter le repli hors-ligne
        return await attemptOfflineLogin();
      }

      // Vérifier si le compte est actif — et s'il existe encore côté serveur.
      // Timeout réseau : on ne conclut pas (repli hors-ligne plus bas).
      let profileRes: any = null;
      let profileTimedOut = false;
      try {
        profileRes = await withAuthTimeout(
          supabase.from('profiles').select('*').eq('id', data.user.id).single(),
          2500
        );
      } catch {
        profileTimedOut = true;
      }

      const profile = profileRes?.data;
      // Compte inconnu du serveur (supprimé ou jamais créé) : refus net, sans repli.
      if (!profileTimedOut && !profile) {
        await supabase.auth.signOut().catch(() => {});
        return { success: false, error: 'Compte inconnu du serveur. Contactez la direction.' };
      }
      if (profile && profile.active === false) {
        await supabase.auth.signOut().catch(() => {});
        return { success: false, error: 'Votre compte a été désactivé par le Directeur.' };
      }

      // Mettre à jour last_login en tâche de fond non-bloquante
      void supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', data.user.id);
      
      if (profile) {
        let cachedUser: User | undefined;
        try {
          const { db } = await import('../lib/db');
          const cachedList = await db.profiles.getItem<User[]>('data');
          cachedUser = cachedList?.find(u => u.id === profile.id);
        } catch {}

        const isDir = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(profile.role);
        const crmDefault = !['Caissier', 'Gerant'].includes(profile.role);
        const resolveBool = (dbVal: any, localVal: any, defaultVal: boolean) => {
          if (dbVal === true) return true;
          if (dbVal === false) return false;
          if (localVal === true) return true;
          if (localVal === false) return false;
          return defaultVal;
        };

        const userObj: User = {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role as User['role'],
          serviceId: profile.service_id,
          pin: profile.pin,
          lastLogin: new Date().toISOString(),
          active: profile.active !== false,
          photo: profile.photo || undefined,
          posReturnsEnabled: resolveBool(profile.pos_returns_enabled, cachedUser?.posReturnsEnabled, false),
          posCatalogueEnabled: resolveBool(profile.pos_catalogue_enabled, cachedUser?.posCatalogueEnabled, false),
          posSupplyEnabled: resolveBool(profile.pos_supply_enabled, cachedUser?.posSupplyEnabled, false),
          posInventoryEnabled: resolveBool(profile.pos_inventory_enabled, cachedUser?.posInventoryEnabled, false),
          posStockEnabled: resolveBool(profile.pos_stock_enabled, cachedUser?.posStockEnabled, false),
          posRole: profile.pos_role || cachedUser?.posRole || null,
          crmPrestationsEnabled: resolveBool(profile.crm_prestations_enabled, cachedUser?.crmPrestationsEnabled, crmDefault),
          crmCaisseEnabled: resolveBool(profile.crm_caisse_enabled, cachedUser?.crmCaisseEnabled, crmDefault),
          crmMaintenanceEnabled: resolveBool(profile.crm_maintenance_enabled, cachedUser?.crmMaintenanceEnabled, crmDefault),
          crmStocksEnabled: resolveBool(profile.crm_stocks_enabled, cachedUser?.crmStocksEnabled, crmDefault),
          crmTiersEnabled: resolveBool(profile.crm_tiers_enabled, cachedUser?.crmTiersEnabled, crmDefault),
          crmCommerciauxEnabled: resolveBool(profile.crm_commerciaux_enabled, cachedUser?.crmCommerciauxEnabled, crmDefault),
          crmCommissionsEnabled: resolveBool(profile.crm_commissions_enabled, cachedUser?.crmCommissionsEnabled, crmDefault),
          crmFacturationEnabled: resolveBool(profile.crm_facturation_enabled, cachedUser?.crmFacturationEnabled, crmDefault),
          crmSupFacturesEnabled: resolveBool(profile.crm_sup_factures_enabled, cachedUser?.crmSupFacturesEnabled, isDir),
          crmReportsEnabled: resolveBool(profile.crm_reports_enabled, cachedUser?.crmReportsEnabled, !isDir),
          crmTeamReportsEnabled: resolveBool(profile.crm_team_reports_enabled, cachedUser?.crmTeamReportsEnabled, isDir)
        };
        logoutRequestedRef.current = false;
        setCurrentUser(userObj);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userObj));
      }

      setLoading(false);
      // Moteur sync desktop : configuration base + token de session (une fois
      // connecté en ligne ; le renderer garde sa propre synchro métier).
      try {
        const { platform } = await import('../platform');
        if (platform.isDesktop) {
          const url = (import.meta as any)?.env?.VITE_SUPABASE_URL;
          const anonKey = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY;
          if (url && anonKey) {
            await platform.sync.configure({ url, anonKey }).catch(() => {});
          }
          const token = (data as any)?.session?.access_token || null;
          if (token) {
            await platform.sync.setAuthToken(token).catch(() => {});
          }
        }
      } catch {}
      return { success: true };
    } catch {
      // Si timeout ou défaillance réseau -> bascule automatique sur le mode hors-ligne
      console.warn('[AuthContext] Connexion en ligne indisponible, tentative hors-ligne...');
      return await attemptOfflineLogin();
    }
  };

  const loginAsTestUser = (role: User['role']) => {
    const isDir = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(role);
    const isCashierRole = role === 'Caissier' || role === 'Gerant';
    const crmDefault = !isCashierRole;
    const testUser: User = {
      id: 'test-' + role.toLowerCase(),
      name: role === 'Caissier' ? 'Caissier Test' : role === 'Gerant' ? 'Gérant Test' : role + ' Test',
      email: 'test@hinov.com',
      role,
      pin: '000000',
      lastLogin: new Date().toISOString(),
      active: true,
      posReturnsEnabled: true,
      posCatalogueEnabled: true,
      crmPrestationsEnabled: crmDefault,
      crmCaisseEnabled: crmDefault,
      crmMaintenanceEnabled: crmDefault,
      crmStocksEnabled: crmDefault,
      crmTiersEnabled: crmDefault,
      crmCommerciauxEnabled: crmDefault,
      crmCommissionsEnabled: crmDefault,
      crmFacturationEnabled: crmDefault,
      crmSupFacturesEnabled: isDir,
      crmReportsEnabled: !isDir,
      crmTeamReportsEnabled: isDir,
    };
    setCurrentUser(testUser);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(testUser));
    setLoading(false);
  };

  const logout = async () => {
    logoutRequestedRef.current = true;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setCurrentUser(null);
    try {
      const { platform } = await import('../platform');
      if (platform.isDesktop) {
        await platform.sync.setAuthToken(null).catch(() => {});
      }
    } catch {}
    try {
      await withAuthTimeout(supabase.auth.signOut(), 2000);
    } catch {
      // Ignorer les erreurs réseau à la déconnexion
    }
  };

  const updatePin = async (currentPin: string, newPin: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Non connecté' };
    if (!isValidPin(newPin)) return { success: false, error: 'Le nouveau PIN doit contenir exactement 6 chiffres.' };
    if (currentPin !== currentUser.pin) return { success: false, error: 'Code PIN actuel incorrect.' };

    const updatedUser = { ...currentUser, pin: newPin };
    setCurrentUser(updatedUser);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedUser));

    // Mettre à jour en local dans db.profiles
    try {
      const { db } = await import('../lib/db');
      const cached = (await db.profiles.getItem<User[]>('data')) || [];
      const updated = cached.map(u => u.id === currentUser.id ? updatedUser : u);
      await db.profiles.setItem('data', updated);
    } catch {}

    // Synchronisation en ligne si disponible (les deux stores doivent rester coherents)
    if (navigator.onLine) {
      try {
        const { error: authErr } = await supabase.auth.updateUser({ password: newPin });
        if (authErr) throw authErr;
        const { error: pinErr } = await supabase.from('profiles').update({ pin: newPin }).eq('id', currentUser.id);
        if (pinErr) throw pinErr;
      } catch (err) {
        console.warn('[AuthContext] Synchro nouveau PIN serveur en attente :', err);
        await queueSyncAction('UPDATE_PROFILE', { id: currentUser.id, pin: newPin }).catch(() => {});
        return { success: false, error: 'PIN modifié localement, synchronisation serveur en attente. Reconnectez-vous pour finaliser.' };
      }
    } else {
      await queueSyncAction('UPDATE_PROFILE', { id: currentUser.id, pin: newPin }).catch(() => {});
    }
    return { success: true };
  };

  const updateCurrentUser = (updates: Partial<User>) => {
    setCurrentUser(prev => {
      if (!prev) return null;
      const next = { ...prev, ...updates };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, loginAsTestUser, logout, updatePin, updateCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
