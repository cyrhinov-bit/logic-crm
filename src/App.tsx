import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildAppConfig, getPlatformLabel } from '@/shared';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { DashboardDirecteur } from './pages/DashboardDirecteur';
import { DashboardResponsable } from './pages/DashboardResponsable';
import { DashboardCommercial } from './pages/DashboardCommercial';
import { QuoteCreation } from './pages/QuoteCreation';

import { Clients } from './pages/Clients';
import { Services } from './pages/Services';
import { Prestations } from './pages/Prestations';
import { Devis } from './pages/Devis';
import { Factures } from './pages/Factures';
import { CommercialClients } from './pages/CommercialClients';
import { Documents } from './pages/Documents';
import { Utilisateurs } from './pages/Utilisateurs';
import { Parametres } from './pages/Parametres';
import { GeminiSettings } from './pages/GeminiSettings';
import { Login } from './pages/Login';
import { PublicCatalog } from './pages/public/PublicCatalog';
import TestDashboard from './pages/TestDashboard';

// CRM Modules Responsables
import { CrmPrestations } from './pages/crm/CrmPrestations';
import { CrmCaisse } from './pages/crm/CrmCaisse';
import { CrmMaintenance } from './pages/crm/CrmMaintenance';
import { CrmStocks } from './pages/crm/CrmStocks';
import { CrmTiers } from './pages/crm/CrmTiers';
import { CrmCommerciaux } from './pages/crm/CrmCommerciaux';
import { CrmCommissions } from './pages/crm/CrmCommissions';
import CrmModulesManager from './pages/crm/CrmModulesManager';
import { CrmWeeklyReports } from './pages/crm/CrmWeeklyReports';

// POS Pages (lazy loaded)
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
const DirectorCopilotPage = lazy(() => import('./features/director/presentation/DirectorCopilotPage'));
const DirectorAuditPage = lazy(() => import('./features/director/presentation/DirectorAuditPage'));
const DashboardPos = lazy(() => import('./pages/pos/DashboardPos'));
const PosSettings = lazy(() => import('./pages/pos/PosSettings'));
const PosUsers = lazy(() => import('./pages/pos/PosUsers'));
const PosDiscounts = lazy(() => import('./pages/pos/PosDiscounts'));
const PosReports = lazy(() => import('./pages/pos/PosReports'));
const PosFinance = lazy(() => import('./pages/pos/PosFinance'));
const PosReturns = lazy(() => import('./pages/pos/PosReturns'));
const PosProducts = lazy(() => import('./pages/pos/PosProducts'));
const PosStockMovements = lazy(() => import('./pages/pos/PosStockMovements'));
const CashierModulesManager = lazy(() => import('./pages/pos/CashierModulesManager'));
const PosSyncErrors = lazy(() => import('./pages/pos/PosSyncErrors'));
const PosCategories = lazy(() => import('./pages/pos/PosCategories'));
const PosBrands = lazy(() => import('./pages/pos/PosBrands'));
const PosSuppliers = lazy(() => import('./pages/pos/PosSuppliers'));
const PosStock = lazy(() => import('./pages/pos/PosStock'));
const PosSupply = lazy(() => import('./pages/pos/PosSupply'));
const PosInventory = lazy(() => import('./pages/pos/PosInventory'));
const PosTerminal = lazy(() => import('./pages/pos/PosTerminal'));
const PosTransactions = lazy(() => import('./pages/pos/PosTransactions'));
const PosCash = lazy(() => import('./pages/pos/PosCash'));
const VersementsEncaisseur = lazy(() => import('./pages/pos/VersementsEncaisseur'));
const VersementsCaissier = lazy(() => import('./pages/pos/VersementsCaissier'));
const VersementsAdmin = lazy(() => import('./pages/pos/VersementsAdmin'));
const DataExport = lazy(() => import('./pages/DataExport'));
const SupFactures = lazy(() => import('./pages/SupFactures'));

// Diagnostic pages (lazy loaded)
const DiagnosticPage = lazy(() => import('./components/DiagnosticPage'));
const PrinterDiagnosticPage = lazy(() => import('./components/PrinterDiagnosticPage'));
const ScannerDiagnosticPage = lazy(() => import('./components/ScannerDiagnosticPage'));
const PosDiagnosticPage = lazy(() => import('./components/PosDiagnosticPage'));
const PerformanceDiagnosticPage = lazy(() => import('./components/PerformanceDiagnosticPage'));
const BackupDiagnosticPage = lazy(() => import('./components/BackupDiagnosticPage'));
const FileDiagnosticPage = lazy(() => import('./components/FileDiagnosticPage'));
const SyncDiagnosticPage = lazy(() => import('./components/SyncDiagnosticPage'));
const SupportDiagnosticPage = lazy(() => import('./components/SupportDiagnosticPage'));
const SecurityDiagnosticPage = lazy(() => import('./components/SecurityDiagnosticPage'));
const UpdaterDiagnosticPage = lazy(() => import('./components/UpdaterDiagnosticPage'));
const HardwareDiagnosticPage = lazy(() => import('./components/HardwareDiagnosticPage'));

import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfirmProvider } from './components/ConfirmModal';
import { ProductImagesProvider } from './features/products/images/ProductImagesContext';

const queryClient = new QueryClient();
const webAppConfig = buildAppConfig('web');

function ProtectedRoute() {
  const { currentUser, loading } = useAuth();
  
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--color-background)', color: 'var(--color-primary)' }}>
        <h2>{webAppConfig.appName}</h2>
        <small>{getPlatformLabel(webAppConfig.target)}</small>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// Composant pour rediriger automatiquement vers le bon dashboard selon le rôle
function RoleBasedDashboard() {
  const { currentUser, loading } = useAuth();
  
  if (loading) return null;

  if (!currentUser) return <Navigate to="/login" replace />;
  
  if (currentUser.role === 'SuperAdmin') return <Navigate to="/utilisateurs" replace />;
  if (currentUser.role === 'Directeur') return <DashboardDirecteur />;
  if (currentUser.role === 'Responsable') return <DashboardResponsable />;
  if (currentUser.role === 'Commercial') return <Navigate to="/commercial" replace />;
  if (currentUser.role === 'Gerant') return <Navigate to="/pos" replace />;
  if (currentUser.role === 'Caissier') return <Navigate to="/pos/terminal" replace />;
  if (currentUser.role === 'Encaisseur') return <Navigate to="/pos/versements" replace />;
  
  return <DashboardDirecteur />;
}

// Garde de route par rôle
type Role = 'SuperAdmin' | 'Directeur' | 'Directeur adjoint' | 'Responsable' | 'Commercial' | 'Gerant' | 'Caissier' | 'Encaisseur';
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  
  const hasRole = roles.includes(currentUser.role as Role);
  const hasPosRole = currentUser.posRole ? roles.includes(currentUser.posRole as Role) : false;
  
  if (!hasRole && !hasPosRole) return <Navigate to="/pos" replace />;
  return <>{children}</>;
}

// Garde de module POS : rôles Sidebar + SuperAdmin, et pour les caissiers le flag du module
// (miroir du filtrage Sidebar : seul `false` explicite bloque un caissier)
type PosModuleKey = 'posCatalogueEnabled' | 'posReturnsEnabled' | 'posSupplyEnabled' | 'posInventoryEnabled' | 'posStockEnabled' | null;
function RequirePosModule({ roles, moduleKey = null, children }: { roles: Role[]; moduleKey?: PosModuleKey; children: ReactNode }) {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  const allowedByRole = roles.includes(currentUser.role as Role)
    || (currentUser.posRole ? roles.includes(currentUser.posRole as Role) : false)
    || currentUser.role === 'SuperAdmin';
  if (!allowedByRole) return <Navigate to="/pos" replace />;
  const effRole = currentUser.posRole || currentUser.role;
  if (effRole === 'Caissier' && moduleKey && (currentUser as unknown as Record<string, unknown>)[moduleKey] === false) {
    return <Navigate to="/pos" replace />;
  }
  return <>{children}</>;
}
// Garde de module CRM : Caissier/Gerant jamais admis, autres rôles selon le flag
// (miroir des gardes in-page ; défaut cohérent Sidebar opt-out : seul `false` explicite bloque)
type CrmModuleKey = 'crmPrestationsEnabled' | 'crmCaisseEnabled' | 'crmMaintenanceEnabled' | 'crmStocksEnabled' | 'crmTiersEnabled' | 'crmCommerciauxEnabled' | 'crmCommissionsEnabled' | 'crmFacturationEnabled' | 'crmSupFacturesEnabled' | 'crmReportsEnabled' | 'crmTeamReportsEnabled';
function RequireCrmModule({ moduleKey, children }: { moduleKey: CrmModuleKey; children: ReactNode }) {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role === 'Caissier' || currentUser.role === 'Gerant') return <Navigate to="/" replace />;
  if (['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser.role)) return <>{children}</>;
  if ((currentUser as unknown as Record<string, unknown>)[moduleKey] === false) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <ProductImagesProvider>
        <ConfirmProvider>
          <QueryClientProvider client={queryClient}>
            <HashRouter>
              <Toaster position="top-center" />
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/catalogue" element={<PublicCatalog />} />
                <Route path="/catalog" element={<Navigate to="/catalogue" replace />} />
                <Route path="/boutique" element={<Navigate to="/catalogue" replace />} />

                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<Layout />}>
                    <Route index element={<RoleBasedDashboard />} />

                    {/* Diagnostics : authentification + Direction requises (ex-publiques) */}
                    <Route path="/test" element={<RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><TestDashboard /></RequireRole>} />
                    <Route path="/diagnostics" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><DiagnosticPage /></RequireRole></Suspense>} />
                    <Route path="/diagnostics/printer" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><PrinterDiagnosticPage /></RequireRole></Suspense>} />
                    <Route path="/diagnostics/scanner" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><ScannerDiagnosticPage /></RequireRole></Suspense>} />
                    <Route path="/diagnostics/pos" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><PosDiagnosticPage /></RequireRole></Suspense>} />
                    <Route path="/diagnostics/performance" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><PerformanceDiagnosticPage /></RequireRole></Suspense>} />
                    <Route path="/diagnostics/backup" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><BackupDiagnosticPage /></RequireRole></Suspense>} />
                    <Route path="/diagnostics/files" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><FileDiagnosticPage /></RequireRole></Suspense>} />
                    <Route path="/diagnostics/sync" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><SyncDiagnosticPage /></RequireRole></Suspense>} />
                    <Route path="/diagnostics/support" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><SupportDiagnosticPage /></RequireRole></Suspense>} />
                    <Route path="/diagnostics/security" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><SecurityDiagnosticPage /></RequireRole></Suspense>} />
                    <Route path="/diagnostics/updater" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><UpdaterDiagnosticPage /></RequireRole></Suspense>} />
                    <Route path="/diagnostics/hardware" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><HardwareDiagnosticPage /></RequireRole></Suspense>} />

                    <Route path="clients" element={<RequireRole roles={['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin']}><Clients /></RequireRole>} />
                    <Route path="services" element={<RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><Services /></RequireRole>} />
                    <Route path="prestations" element={<RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><Prestations /></RequireRole>} />
                    <Route path="devis" element={<RequireRole roles={['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin']}><Devis /></RequireRole>} />
                    <Route path="devis/nouveau" element={<RequireRole roles={['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin']}><QuoteCreation /></RequireRole>} />
                    <Route path="factures" element={<RequireCrmModule moduleKey="crmFacturationEnabled"><Factures /></RequireCrmModule>} />
                    <Route path="fournisseurs-factures" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireCrmModule moduleKey="crmSupFacturesEnabled"><SupFactures /></RequireCrmModule></Suspense>} />
                    <Route path="documents" element={<RequireRole roles={['Directeur', 'Responsable', 'Commercial', 'Directeur adjoint', 'SuperAdmin']}><Documents /></RequireRole>} />
                    <Route path="export" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'Responsable', 'Gerant', 'SuperAdmin']}><DataExport /></RequireRole></Suspense>} />
                    <Route path="utilisateurs" element={<RequireRole roles={['Directeur', 'SuperAdmin']}><Utilisateurs /></RequireRole>} />
                    <Route path="parametres" element={<RequireRole roles={['Directeur']}><Parametres /></RequireRole>} />

                    {/* CRM Modules Responsables de Service */}
                    <Route path="crm/prestations" element={<RequireCrmModule moduleKey="crmPrestationsEnabled"><CrmPrestations /></RequireCrmModule>} />
                    <Route path="crm/caisse" element={<RequireCrmModule moduleKey="crmCaisseEnabled"><CrmCaisse /></RequireCrmModule>} />
                    <Route path="crm/maintenance" element={<RequireCrmModule moduleKey="crmMaintenanceEnabled"><CrmMaintenance /></RequireCrmModule>} />
                    <Route path="crm/stocks" element={<RequireCrmModule moduleKey="crmStocksEnabled"><CrmStocks /></RequireCrmModule>} />
                    <Route path="crm/tiers" element={<RequireCrmModule moduleKey="crmTiersEnabled"><CrmTiers /></RequireCrmModule>} />
                    <Route path="crm/commerciaux" element={<RequireCrmModule moduleKey="crmCommerciauxEnabled"><CrmCommerciaux /></RequireCrmModule>} />
                    <Route path="crm/commissions" element={<RequireCrmModule moduleKey="crmCommissionsEnabled"><CrmCommissions /></RequireCrmModule>} />
                    <Route path="crm/rapports" element={<RequireCrmModule moduleKey="crmReportsEnabled"><CrmWeeklyReports /></RequireCrmModule>} />
                    <Route path="crm/rapports-equipe" element={<RequireCrmModule moduleKey="crmTeamReportsEnabled"><CrmWeeklyReports /></RequireCrmModule>} />
                    <Route path="rapports-equipe" element={<Navigate to="/crm/rapports-equipe" replace />} />
                    <Route path="rapports-hebdo" element={<Navigate to="/crm/rapports" replace />} />
                    <Route path="crm/modules" element={<RequireRole roles={['Directeur', 'Directeur adjoint', 'SuperAdmin']}><CrmModulesManager /></RequireRole>} />

                    {/* Commercial routes (Commercial uniquement : le SuperAdmin n'y bascule plus) */}
                    <Route path="commercial" element={<RequireRole roles={['Commercial']}><DashboardCommercial /></RequireRole>} />
                    <Route path="commercial/clients" element={<RequireRole roles={['Commercial']}><CommercialClients /></RequireRole>} />
                    <Route path="commercial/documents" element={<RequireRole roles={['Commercial']}><Documents /></RequireRole>} />

                    {/* Dashboard Responsable : Responsable + bascule SuperAdmin */}
                    <Route path="responsable" element={<RequireRole roles={['Responsable', 'SuperAdmin']}><DashboardResponsable /></RequireRole>} />

                    {/* POS routes */}
                    <Route path="pos" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Gerant']}><DashboardPos /></RequireRole></Suspense>} />
                    <Route path="pos/copilot-ia" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Gerant']}><DirectorCopilotPage /></RequireRole></Suspense>} />
                    <Route path="pos/audit-ia" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Gerant']}><DirectorAuditPage /></RequireRole></Suspense>} />
                    <Route path="pos/settings" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur']}><PosSettings /></RequirePosModule></Suspense>} />
                    <Route path="pos/users" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant']}><PosUsers /></RequirePosModule></Suspense>} />
                    <Route path="pos/cashier-modules" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Gerant']}><CashierModulesManager /></RequireRole></Suspense>} />
          <Route path="pos/sync-errors" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Gerant', 'Caissier']}><PosSyncErrors /></RequireRole></Suspense>} />
                    <Route path="pos/discounts" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur']}><PosDiscounts /></RequirePosModule></Suspense>} />
                    <Route path="pos/reports" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur']}><PosReports /></RequirePosModule></Suspense>} />
                    <Route path="pos/finance" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant']}><PosFinance /></RequirePosModule></Suspense>} />
                    <Route path="pos/returns" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant', 'Caissier']} moduleKey="posReturnsEnabled"><PosReturns /></RequirePosModule></Suspense>} />
                    <Route path="pos/products" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant', 'Caissier']} moduleKey="posCatalogueEnabled"><PosProducts /></RequirePosModule></Suspense>} />
                    <Route path="pos/stock-movements" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant', 'Caissier']} moduleKey="posStockEnabled"><PosStockMovements /></RequirePosModule></Suspense>} />
                    <Route path="pos/categories" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant']}><PosCategories /></RequirePosModule></Suspense>} />
                    <Route path="pos/brands" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant']}><PosBrands /></RequirePosModule></Suspense>} />
                    <Route path="pos/suppliers" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant']}><PosSuppliers /></RequirePosModule></Suspense>} />
                    <Route path="pos/stock" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant', 'Caissier']} moduleKey="posStockEnabled"><PosStock /></RequirePosModule></Suspense>} />
                    <Route path="pos/supply" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant', 'Caissier']} moduleKey="posSupplyEnabled"><PosSupply /></RequirePosModule></Suspense>} />
                    <Route path="pos/inventory" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant', 'Caissier']} moduleKey="posInventoryEnabled"><PosInventory /></RequirePosModule></Suspense>} />
                    <Route path="pos/terminal" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant', 'Caissier']}><PosTerminal /></RequirePosModule></Suspense>} />
                    <Route path="pos/transactions" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant', 'Caissier']}><PosTransactions /></RequirePosModule></Suspense>} />
                    <Route path="pos/cash" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant', 'Caissier']}><PosCash /></RequirePosModule></Suspense>} />
                    <Route path="pos/versements" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Encaisseur']}><VersementsEncaisseur /></RequireRole></Suspense>} />
                    <Route path="pos/versements/caissier" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequirePosModule roles={['Directeur', 'Gerant', 'Caissier']}><VersementsCaissier /></RequirePosModule></Suspense>} />
                    <Route path="pos/versements/admin" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'SuperAdmin']}><VersementsAdmin /></RequireRole></Suspense>} />
                    <Route path="pos/parametres-ia" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Gerant', 'Caissier']}><GeminiSettings /></RequireRole></Suspense>} />
                    
                    <Route path="*" element={<div style={{ padding: '20px' }}><h1>Page introuvable</h1></div>} />
                  </Route>
                </Route>
              </Routes>
            </HashRouter>
          </QueryClientProvider>
        </ConfirmProvider>
        </ProductImagesProvider>
      </AppProvider>
    </AuthProvider>
  );
}

export default App;
