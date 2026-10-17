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
const DataExport = lazy(() => import('./pages/DataExport'));
const SupFactures = lazy(() => import('./pages/SupFactures'));

// Diagnostic pages (lazy loaded)
const DiagnosticPage = lazy(() => import('./components/DiagnosticPage'));
const PrinterDiagnosticPage = lazy(() => import('./components/PrinterDiagnosticPage'));
const ScannerDiagnosticPage = lazy(() => import('./components/ScannerDiagnosticPage'));
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

  return <DashboardDirecteur />;
}

// Garde de route par rôle
type Role = 'SuperAdmin' | 'Directeur' | 'Directeur adjoint' | 'Responsable' | 'Commercial';
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" replace />;

  if (!roles.includes(currentUser.role as Role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Garde de module CRM : tous les rôles selon le flag
// (défaut cohérent Sidebar opt-out : seul `false` explicite bloque)
type CrmModuleKey = 'crmPrestationsEnabled' | 'crmCaisseEnabled' | 'crmMaintenanceEnabled' | 'crmStocksEnabled' | 'crmTiersEnabled' | 'crmCommerciauxEnabled' | 'crmCommissionsEnabled' | 'crmFacturationEnabled' | 'crmSupFacturesEnabled' | 'crmReportsEnabled' | 'crmTeamReportsEnabled';
function RequireCrmModule({ moduleKey, children }: { moduleKey: CrmModuleKey; children: ReactNode }) {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  // SuperAdmin : accès total permanent (l'activation des modules ne s'y applique pas).
  if (currentUser.role === 'SuperAdmin') return <>{children}</>;
  // Directeur / Directeur adjoint : l'activation s'applique réellement (menu latéral ET accès direct).
  // Cohérent avec le Sidebar : seuls les `false` explicites bloquent (défaut = activé).
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
                    <Route path="export" element={<Suspense fallback={<div style={{ padding: 20 }}>Chargement...</div>}><RequireRole roles={['Directeur', 'Directeur adjoint', 'Responsable', 'SuperAdmin']}><DataExport /></RequireRole></Suspense>} />
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
