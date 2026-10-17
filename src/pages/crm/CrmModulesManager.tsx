import { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import type { User } from '../../context/AppContext';
import { 
  Shield, 
  Search, 
  ShoppingBag, 
  DollarSign, 
  Wrench, 
  Package, 
  Users, 
  UserCheck, 
  Award,
  Check,
  X,
  Sparkles,
  Layers,
  Filter,
  Receipt,
  ClipboardList,
  ClipboardCheck,
  Truck
} from 'lucide-react';

interface ModuleDef {
  key: keyof Pick<User, 
    'crmPrestationsEnabled' | 
    'crmCaisseEnabled' | 
    'crmMaintenanceEnabled' | 
    'crmStocksEnabled' | 
    'crmTiersEnabled' | 
    'crmCommerciauxEnabled' | 
    'crmCommissionsEnabled' |
    'crmFacturationEnabled' |
    'crmSupFacturesEnabled' |
    'crmReportsEnabled' |
    'crmTeamReportsEnabled'
  >;
  label: string;
  shortDesc: string;
  icon: React.ReactNode;
  color: string;
  badge: string;
}

const CRM_MODULES: ModuleDef[] = [
  {
    key: 'crmPrestationsEnabled',
    label: 'Commandes & Prestations',
    shortDesc: 'Grille financière 11 colonnes, devis, marges, encaissement automatique',
    icon: <ShoppingBag size={18} />,
    color: '#10B981',
    badge: 'Module 1'
  },
  {
    key: 'crmCaisseEnabled',
    label: 'Dépenses & Caisse',
    shortDesc: 'Journal de trésorerie, suivi entrées/sorties en direct et soldes',
    icon: <DollarSign size={18} />,
    color: '#EF4444',
    badge: 'Module 2'
  },
  {
    key: 'crmMaintenanceEnabled',
    label: 'Maintenance & Tickets',
    shortDesc: 'Interventions sur site/agence, gestion des pannes et techniciens',
    icon: <Wrench size={18} />,
    color: '#F59E0B',
    badge: 'Module 3'
  },
  {
    key: 'crmStocksEnabled',
    label: 'Stocks & Consommables',
    shortDesc: 'Valorisation Achat/Vente, alertes de rupture de stock en temps réel',
    icon: <Package size={18} />,
    color: '#6366F1',
    badge: 'Module 4'
  },
  {
    key: 'crmTiersEnabled',
    label: 'Clients, Fournisseurs & Partenaires',
    shortDesc: 'Annuaire unifié multi-utilisateurs et gestion des tiers rattachés',
    icon: <Users size={18} />,
    color: '#8B5CF6',
    badge: 'Module 5'
  },
  {
    key: 'crmCommerciauxEnabled',
    label: 'Agents Commerciaux',
    shortDesc: 'Fiches négociateurs, volume de vente négocié et contrats clos',
    icon: <UserCheck size={18} />,
    color: '#0D9488',
    badge: 'Module 6'
  },
  {
    key: 'crmCommissionsEnabled',
    label: 'Gestion des Commissions',
    shortDesc: 'Calcul, validation et liquidation avec décaissement automatique',
    icon: <Award size={18} />,
    color: '#D97706',
    badge: 'Module 7'
  },
  {
    key: 'crmFacturationEnabled',
    label: 'Suivi des factures clients',
    shortDesc: 'Registre mensuel de suivi des factures, coûts, primes et rentabilité',
    icon: <Receipt size={18} />,
    color: '#0284C7',
    badge: 'Module 8'
  },
  {
    key: 'crmSupFacturesEnabled',
    label: 'Factures Fournisseurs',
    shortDesc: 'Suivi autonome des factures fournisseurs, paiements et pièces jointes',
    icon: <Truck size={18} />,
    color: '#EA580C',
    badge: 'Module 11'
  },
  {
    key: 'crmReportsEnabled',
    label: 'Rapports Hebdo (Collaborateurs)',
    shortDesc: 'Saisie journalière des activités, consolidation hebdomadaire et soumission',
    icon: <ClipboardList size={18} />,
    color: '#059669',
    badge: 'Module 9'
  },
  {
    key: 'crmTeamReportsEnabled',
    label: 'Rapports Équipe (Supervision Direction)',
    shortDesc: 'Cockpit de supervision d\'équipe, KPIs, réception, relance et validation des rapports',
    icon: <ClipboardCheck size={18} />,
    color: '#7C3AED',
    badge: 'Module 10'
  }
];

export default function CrmModulesManager() {
  const { users, services, updateUser } = useAppContext();
  const { currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const isAdmin = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');

  if (!isAdmin) {
    return (
      <div className="dashboard" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Shield size={48} color="var(--color-error)" style={{ margin: '0 auto 16px' }} />
        <h2>Accès restreint</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Seul un Directeur ou Administrateur peut configurer l'activation des modules CRM.
        </p>
      </div>
    );
  }

  // Filtrer les utilisateurs (les Caissiers/Gérants purs relèvent du POS, pas du CRM)
  const eligibleUsers = users.filter(u => {
    if (u.active === false) return false;
    if (u.role === 'Caissier' || u.role === 'Gerant') return false;
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchService = serviceFilter === 'ALL' || u.serviceId === serviceFilter;
    return matchSearch && matchRole && matchService;
  });

  const toggleModule = async (user: User, moduleKey: ModuleDef['key']) => {
    setSavingUserId(user.id);
    const currentValue = !!user[moduleKey];
    // Coherent avec setAllModules : 'Rapports Equipe' reserve a la Direction.
    const isDir = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(user.role);
    const nextValue = (moduleKey === 'crmTeamReportsEnabled' && !isDir) ? false : !currentValue;
    try {
      await updateUser(user.id, {
        name: user.name,
        role: user.role,
        serviceId: user.serviceId,
        [moduleKey]: nextValue
      });
    } finally {
      setSavingUserId(null);
    }
  };

  const setAllModules = async (user: User, state: boolean) => {
    setSavingUserId(user.id);
    const isDir = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(user.role);
    try {
      await updateUser(user.id, {
        name: user.name,
        role: user.role,
        serviceId: user.serviceId,
        crmPrestationsEnabled: state,
        crmCaisseEnabled: state,
        crmMaintenanceEnabled: state,
        crmStocksEnabled: state,
        crmTiersEnabled: state,
        crmCommerciauxEnabled: state,
        crmCommissionsEnabled: state,
        crmFacturationEnabled: state,
        crmSupFacturesEnabled: state,
        crmReportsEnabled: isDir ? false : state,
        crmTeamReportsEnabled: isDir ? state : false
      });
    } finally {
      setSavingUserId(null);
    }
  };

  const getServiceName = (id?: string) => {
    if (!id) return 'Service non assigné';
    return services.find(s => s.id === id)?.name || 'Service inconnu';
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
              <Layers size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Activation des Modules CRM</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                Activez ou désactivez les {CRM_MODULES.length} modules de gestion par collaborateur (Responsables de service, Commerciaux, etc.)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Barre de filtres et recherche */}
      <div className="card" style={{ marginBottom: '24px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div style={{ flex: '1 1 260px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="table-input"
              style={{ paddingLeft: '36px', width: '100%' }}
              placeholder="Rechercher un collaborateur par nom ou email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} color="var(--color-text-muted)" />
            <select className="table-input" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="ALL">Tous les rôles</option>
              <option value="Responsable">Responsables</option>
              <option value="Commercial">Commerciaux</option>
              <option value="Directeur">Directeurs</option>
              <option value="Directeur adjoint">Directeurs adjoints</option>
            </select>
          </div>

          <div>
            <select className="table-input" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}>
              <option value="ALL">Tous les services</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Bannière explicative Supervision Directeur */}
      <div style={{
        padding: '14px 18px',
        borderRadius: '8px',
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '0.88rem',
        color: '#1E40AF'
      }}>
        <Sparkles size={20} style={{ flexShrink: 0, color: '#2563EB' }} />
        <span>
          <strong>Personnalisation & Supervision Direction :</strong> Vous pouvez activer ou désactiver les modules pour les <strong>Directeurs</strong> afin de configurer leurs accès opérationnels directs (menu latéral). <strong>Le Directeur conserve en permanence la supervision totale (Dashboard 360°, KPIs, analytiques et consultation) sur l'ensemble des modules et des collaborateurs.</strong>
        </span>
      </div>

      {/* Liste des utilisateurs et matrice d'activation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {eligibleUsers.map(user => {
          const isUserAdmin = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(user.role);
          const activeCount = CRM_MODULES.filter(m => !!user[m.key]).length;
          // Rapports Hebdo (saisie) reserve aux collaborateurs, Rapports Equipe a la Direction :
          // le plein attendu est donc total - 1 dans les deux cas.
          const expectedTotal = CRM_MODULES.length - 1;
          const isFull = activeCount >= expectedTotal;

          return (
            <div 
              key={user.id} 
              className="card" 
              style={{ 
                padding: '20px 24px', 
                borderLeft: `4px solid ${isFull ? '#10B981' : activeCount > 0 ? '#3B82F6' : '#94A3B8'}`,
                transition: 'all 0.2s ease'
              }}
            >
              {/* Entête de l'utilisateur */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ 
                    width: '44px', 
                    height: '44px', 
                    borderRadius: '50%', 
                    background: 'var(--color-surface-alt)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '15px', 
                    fontWeight: 700, 
                    color: 'var(--color-primary)',
                    border: '2px solid var(--color-border)'
                  }}>
                    {(user.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{user.name}</h3>
                      <span className="badge-status" style={{ 
                        background: user.role === 'Directeur' ? '#FEE2E2' : user.role === 'Responsable' ? '#DBEAFE' : '#E0F2FE',
                        color: user.role === 'Directeur' ? '#DC2626' : user.role === 'Responsable' ? '#1D4ED8' : '#0369A1',
                        fontSize: '11px'
                      }}>
                        {user.role}
                      </span>
                      {isUserAdmin && (
                        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.12)', color: '#2563EB', fontWeight: 600 }}>
                          Supervision 360° permanente
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      <span>{user.email}</span>
                      <span>•</span>
                      <span>{getServiceName(user.serviceId)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions globales pour l'utilisateur */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginRight: '8px' }}>
                    <strong>{activeCount}</strong> / {expectedTotal} modules actifs
                  </span>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                    disabled={savingUserId === user.id}
                    onClick={() => setAllModules(user, true)}
                  >
                    <Check size={14} style={{ marginRight: '4px' }} /> Tout activer
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ fontSize: '0.8rem', padding: '6px 12px', color: 'var(--color-error)' }}
                    disabled={savingUserId === user.id}
                    onClick={() => setAllModules(user, false)}
                  >
                    <X size={14} style={{ marginRight: '4px' }} /> Tout désactiver
                  </button>
                </div>
              </div>

              {/* Grille des 7 modules pour cet utilisateur */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {CRM_MODULES.filter(mod => isUserAdmin || mod.key !== 'crmTeamReportsEnabled').map(mod => {
                  const isEnabled = !!user[mod.key];
                  return (
                    <div 
                      key={mod.key}
                      onClick={() => toggleModule(user, mod.key)}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '12px 14px', 
                        borderRadius: '8px', 
                        background: isEnabled ? 'rgba(59, 130, 246, 0.05)' : 'var(--color-surface-alt)', 
                        border: isEnabled ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--color-border)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <div style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '6px', 
                          background: isEnabled ? `${mod.color}18` : '#E2E8F0', 
                          color: isEnabled ? mod.color : '#94A3B8',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          flexShrink: 0
                        }}>
                          {mod.icon}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: isEnabled ? 'var(--color-text)' : 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {mod.label}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {mod.shortDesc}
                          </div>
                        </div>
                      </div>

                      {/* Switch toggle */}
                      <div style={{ marginLeft: '10px', flexShrink: 0 }}>
                        <div 
                          style={{
                            width: '40px',
                            height: '22px',
                            borderRadius: '12px',
                            background: isEnabled ? '#2563EB' : '#CBD5E1',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background 0.2s ease'
                          }}
                        >
                          <div 
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              background: '#FFF',
                              position: 'absolute',
                              top: '3px',
                              left: isEnabled ? '21px' : '3px',
                              transition: 'left 0.2s ease',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                            }} 
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {eligibleUsers.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)' }}>
            Aucun collaborateur ne correspond aux critères de recherche.
          </div>
        )}
      </div>
    </div>
  );
}
