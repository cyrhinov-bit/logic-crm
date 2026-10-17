import React, { useState, useEffect } from 'react';
import { db } from '../lib/db';
import { 
  Home, Users, Briefcase, FileText, Folder, Shield, PieChart, Settings, 
  UserCircle, LogOut, Receipt, Coins, Target, ShoppingCart, Package, Truck, 
  ClipboardList, ClipboardCheck, Warehouse, Tag, BarChart3, DollarSign, RotateCcw, 
  FileSpreadsheet, Wallet, ToggleRight, Trophy, Sparkles, Bot, Building2, ShieldAlert,
  History, ShoppingBag, Wrench, UserCheck, Award
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { InstallButton } from './InstallButton';
import './Sidebar.css';
import type { User } from '../context/AppContext';

interface NavItemConfig {
  label: string;
  icon: React.ElementType;
  path: string;
  color: string;
  bg: string;
  roles: Array<'Directeur' | 'Responsable' | 'Commercial' | 'Directeur adjoint' | 'SuperAdmin'>;
  permissionKey?: keyof User;
}

export function Sidebar({ mobileOpen, setMobileOpen }: { mobileOpen?: boolean; setMobileOpen?: (val: boolean) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser: authUser, logout } = useAuth();
  const { services, users, notifications } = useAppContext();
  const currentUser = users.find(u => u.id === authUser?.id) || authUser;
  const [clickedPath, setClickedPath] = useState<string | null>(null);
  const [syncErrorsCount, setSyncErrorsCount] = useState<number>(0);

  const isDirection = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');

  // Compteur Direction : uniquement les nouveaux rapports reçus (pas les rappels/validations)
  const unreadDirectionReportsCount = React.useMemo(() => {
    if (!currentUser || !isDirection) return 0;
    return (notifications || []).filter(n =>
      n.user_id === currentUser.id &&
      !n.is_read &&
      (n.title === "Nouveau rapport d'activité reçu" || (n.link?.includes('rapports-equipe') ?? false))
    ).length;
  }, [notifications, currentUser, isDirection]);

  // Compteur collaborateur : rappels Direction + validations de ses rapports
  const unreadMyReportsCount = React.useMemo(() => {
    if (!currentUser || isDirection) return 0;
    return (notifications || []).filter(n =>
      n.user_id === currentUser.id &&
      !n.is_read &&
      ((n.link?.startsWith('/crm/rapports?') ?? false) && !n.link?.includes('rapports-equipe'))
    ).length;
  }, [notifications, currentUser, isDirection]);

  useEffect(() => {
    const checkErrors = async () => {
      try {
        const stored = (await db.syncErrors.getItem<any[]>('errors')) || [];
        setSyncErrorsCount(stored.length);
      } catch {
        setSyncErrorsCount(0);
      }
    };

    checkErrors();

    const handleErrorsUpdated = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && typeof detail.count === 'number') {
        setSyncErrorsCount(detail.count);
      } else {
        checkErrors();
      }
    };

    window.addEventListener('sync-errors-updated', handleErrorsUpdated);
    window.addEventListener('sync-critical-error', checkErrors);
    const interval = setInterval(checkErrors, 10000);

    return () => {
      window.removeEventListener('sync-errors-updated', handleErrorsUpdated);
      window.removeEventListener('sync-critical-error', checkErrors);
      clearInterval(interval);
    };
  }, []);

  const currentService = services.find(s => s.id === currentUser?.serviceId);
  const serviceName = currentService?.name || null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleItemClick = (path: string) => {
    setClickedPath(path);
    setTimeout(() => {
      setClickedPath(null);
    }, 500);

    if (setMobileOpen) {
      setMobileOpen(false);
    }
  };

  // CRM nav items
  const crmNavItems: NavItemConfig[] = [
    { label: 'Dashboard', icon: Home, path: '/', color: '#2563EB', bg: '#EFF6FF', roles: ['Directeur', 'Responsable', 'Directeur adjoint', 'SuperAdmin'] },
    { label: 'Dashboard', icon: Home, path: '/commercial', color: '#2563EB', bg: '#EFF6FF', roles: ['Commercial'] },
    // Bascule SuperAdmin vers le dashboard Responsable (l'espace commercial lui est interdit)
    { label: 'Dashboard Responsable', icon: Home, path: '/responsable', color: '#7C3AED', bg: '#FAF5FF', roles: ['SuperAdmin'] },
    // Modules CRM Responsables de Service & Collaborateurs
    { label: 'Commandes', icon: ShoppingBag, path: '/crm/prestations', color: '#10B981', bg: '#ECFDF5', roles: ['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin'], permissionKey: 'crmPrestationsEnabled' },
    { label: 'Caisse & Dépenses', icon: Wallet, path: '/crm/caisse', color: '#EF4444', bg: '#FEF2F2', roles: ['Directeur', 'Responsable', 'Directeur adjoint', 'SuperAdmin'], permissionKey: 'crmCaisseEnabled' },
    { label: 'Maintenance', icon: Wrench, path: '/crm/maintenance', color: '#F59E0B', bg: '#FFFBEB', roles: ['Directeur', 'Responsable', 'Directeur adjoint', 'SuperAdmin'], permissionKey: 'crmMaintenanceEnabled' },
    { label: 'Stocks Métier', icon: Package, path: '/crm/stocks', color: '#6366F1', bg: '#EEF2FF', roles: ['Directeur', 'Responsable', 'Directeur adjoint', 'SuperAdmin'], permissionKey: 'crmStocksEnabled' },
    { label: 'Tiers & Apporteurs', icon: Users, path: '/crm/tiers', color: '#8B5CF6', bg: '#F5F3FF', roles: ['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin'], permissionKey: 'crmTiersEnabled' },
    { label: 'Commerciaux', icon: UserCheck, path: '/crm/commerciaux', color: '#0D9488', bg: '#F0FDFA', roles: ['Directeur', 'Responsable', 'Directeur adjoint', 'SuperAdmin'], permissionKey: 'crmCommerciauxEnabled' },
    { label: 'Commissions', icon: Award, path: '/crm/commissions', color: '#D97706', bg: '#FFFBEB', roles: ['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin'], permissionKey: 'crmCommissionsEnabled' },
    // Modules CRM Standard
    { label: 'Devis', icon: FileText, path: '/devis', color: '#D97706', bg: '#FFFBEB', roles: ['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin'] },
    { label: 'Suivi des factures', icon: Receipt, path: '/factures', color: '#0284C7', bg: '#F0F9FF', roles: ['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin'], permissionKey: 'crmFacturationEnabled' },
    { label: 'Factures Fournisseurs', icon: Truck, path: '/fournisseurs-factures', color: '#EA580C', bg: '#FFF7ED', roles: ['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin'], permissionKey: 'crmSupFacturesEnabled' },
    { label: 'Rapports Hebdo', icon: ClipboardList, path: '/crm/rapports', color: '#059669', bg: '#ECFDF5', roles: ['Responsable', 'Commercial', 'Directeur', 'Directeur adjoint', 'SuperAdmin'], permissionKey: 'crmReportsEnabled' },
    { label: 'Rapports Equipe', icon: ClipboardCheck, path: '/crm/rapports-equipe', color: '#7C3AED', bg: '#FAF5FF', roles: ['Directeur', 'Directeur adjoint', 'SuperAdmin', 'Responsable', 'Commercial'], permissionKey: 'crmTeamReportsEnabled' },
    { label: 'Clients', icon: Users, path: '/clients', color: '#8B5CF6', bg: '#F5F3FF', roles: ['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin'] },
    { label: 'Services', icon: Briefcase, path: '/services', color: '#4F46E5', bg: '#EEF2FF', roles: ['Directeur', 'Directeur adjoint', 'SuperAdmin'] },
    { label: 'Prestations', icon: FileText, path: '/prestations', color: '#6366F1', bg: '#EEF2FF', roles: ['Directeur', 'Directeur adjoint', 'SuperAdmin'] },
    { label: 'Documents (GED)', icon: Folder, path: '/documents', color: '#0284C7', bg: '#F0F9FF', roles: ['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin'] },
    { label: 'Activation Modules', icon: ToggleRight, path: '/crm/modules', color: '#3B82F6', bg: '#EFF6FF', roles: ['Directeur', 'Directeur adjoint', 'SuperAdmin'] },
    { label: 'Exports Excel', icon: FileSpreadsheet, path: '/export', color: '#059669', bg: '#ECFDF5', roles: ['Directeur', 'Responsable', 'Directeur adjoint', 'SuperAdmin'] },
    { label: 'Utilisateurs', icon: Shield, path: '/utilisateurs', color: '#475569', bg: '#F8FAFC', roles: ['Directeur', 'SuperAdmin'] },
    { label: 'Paramètres', icon: Settings, path: '/parametres', color: '#64748B', bg: '#F1F5F9', roles: ['Directeur'] },
  ];

  const normalizeRole = (role?: string | null): string => {
    if (!role) return '';
    const r = role.toLowerCase().trim();
    if (r.includes('commercial')) return 'Commercial';
    if (r.includes('directeur adjoint') || r.includes('adjoint')) return 'Directeur adjoint';
    if (r.includes('directeur')) return 'Directeur';
    if (r.includes('responsable')) return 'Responsable';
    if (r.includes('superadmin') || r.includes('admin')) return 'SuperAdmin';
    return role;
  };

  const userRole = normalizeRole(currentUser?.role);
  const isCommercial = userRole === 'Commercial';

  const isCrmRoute = location.pathname.startsWith('/commercial') ||
                     location.pathname.startsWith('/responsable') || 
                     location.pathname.startsWith('/crm') || 
                     location.pathname.startsWith('/devis') || 
                     location.pathname.startsWith('/clients') || 
                     location.pathname.startsWith('/documents') || 
                      location.pathname.startsWith('/factures') ||
                      location.pathname.startsWith('/fournisseurs-factures') ||
                     location.pathname.startsWith('/services') ||
                     location.pathname.startsWith('/prestations') ||
                     location.pathname.startsWith('/utilisateurs') ||
                     location.pathname.startsWith('/parametres');

  // POS retiré de l'interface : navigation CRM uniquement
  const navItems = crmNavItems;
  const effectiveRole = userRole;

  // Filtrer les éléments selon le rôle de l'utilisateur connecté et ses permissions
  const visibleNavItems = navItems.filter(item => {
    if (!currentUser) return false;

    // Espace Commercial (Commercial connecté uniquement)
    if (isCommercial) {
      if (item.path === '/') return false;
      const hasCommercialRole = item.roles.some(r => r.toLowerCase() === 'commercial');
      if (!hasCommercialRole) return false;

      // Par défaut actif pour les commerciaux sauf si explicitement désactivé à false
      if (item.permissionKey) {
        if (currentUser[item.permissionKey] === false) return false;
        if (item.permissionKey === 'crmTeamReportsEnabled' && !currentUser.crmTeamReportsEnabled) return false;
      }
      return true;
    }

    // Vue SuperAdmin standard (l'espace commercial lui est interdit : cf. rôles des routes)
    const hasRole = item.roles.some(r => r.toLowerCase() === effectiveRole.toLowerCase());
    if (!hasRole) return false;

    // Permissions CRM granulaires pour tous les collaborateurs
    if (item.permissionKey) {
      if (currentUser[item.permissionKey] === false) return false;
      if (item.permissionKey === 'crmTeamReportsEnabled' && !currentUser.crmTeamReportsEnabled) return false;
    }

    return true;
  });

  // Unique paths for POS (some items share the same path for different roles)
  const uniqueVisibleNavItems = visibleNavItems.filter((item, index, self) => 
    index === self.findIndex(i => i.path === item.path)
  );

  return (
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="user-profile">
        <div className="avatar">
          <UserCircle size={44} />
        </div>
        <div className="user-info">
          <div className="user-name">{currentUser?.name || 'Utilisateur'}</div>
          <div className="user-role">{currentUser?.role || 'Aucun rôle'}</div>
          {serviceName && (
            <div className="sidebar-service-badge" title={`Pôle / Service rattaché : ${serviceName}`}>
              <Building2 size={12} style={{ flexShrink: 0 }} />
              <span>{serviceName}</span>
            </div>
          )}
        </div>
      </div>

      <nav className="nav-menu">
        <ul className="nav-list">
          {uniqueVisibleNavItems.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path === '/crm/rapports-equipe' && (location.pathname === '/crm/rapports-equipe' || (location.pathname === '/crm/rapports' && location.search.includes('tab=supervision')))) ||
              (item.path === '/crm/rapports' && location.pathname === '/crm/rapports' && !location.search.includes('tab=supervision')) ||
              (item.path !== '/' && item.path !== '/crm/rapports' && item.path !== '/crm/rapports-equipe' && location.pathname.startsWith(item.path));
            const isClicked = clickedPath === item.path;

            return (
              <li key={item.path} className={`nav-item ${isActive ? 'active' : ''}`}>
                <Link 
                  to={item.path} 
                  className={`nav-link ${isClicked ? 'clicked' : ''}`}
                  onClick={() => handleItemClick(item.path)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span 
                      className="nav-icon-badge" 
                      style={{ 
                        backgroundColor: item.bg, 
                        color: item.color,
                        boxShadow: isActive ? `0 4px 12px ${item.color}35` : undefined
                      }}
                    >
                      <item.icon size={18} />
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {item.path === '/pos/sync-errors' && syncErrorsCount > 0 && (
                    <span className="sidebar-sync-badge" title={`${syncErrorsCount} action(s) en erreur`}>
                      {syncErrorsCount > 99 ? '99+' : syncErrorsCount}
                    </span>
                  )}
                  {item.path === '/crm/rapports-equipe' && unreadDirectionReportsCount > 0 && (
                    <span className="sidebar-report-badge" title={`${unreadDirectionReportsCount} nouveau(x) rapport(s) d'activité reçu(s)`}>
                      {unreadDirectionReportsCount > 99 ? '99+' : unreadDirectionReportsCount}
                    </span>
                  )}
                  {item.path === '/crm/rapports' && unreadMyReportsCount > 0 && (
                    <span className="sidebar-report-badge" title={`${unreadMyReportsCount} notification(s) : rappel ou retour Direction`}>
                      {unreadMyReportsCount > 99 ? '99+' : unreadMyReportsCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div style={{ padding: '16px', marginTop: 'auto', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <InstallButton />
        <button 
          onClick={handleLogout}
          style={{ 
            width: '100%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '8px', 
            padding: '10px',
            backgroundColor: 'var(--color-primary, #1879C8)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'opacity 0.2s, transform 0.1s'
          }}
          onMouseOver={e => e.currentTarget.style.opacity = '0.92'}
          onMouseOut={e => e.currentTarget.style.opacity = '1'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <LogOut size={16} /> Déconnexion
        </button>
      </div>
    </aside>
  );
}
