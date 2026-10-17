import { useState, useMemo } from 'react';
import { 
  FileText, 
  Briefcase, 
  Clock, 
  Building2, 
  Users, 
  CheckCircle, 
  Filter, 
  RotateCcw, 
  Search,
  ArrowUpRight,
  TrendingUp,
  BarChart3,
  ShoppingBag,
  Wrench,
  DollarSign,
  Package,
  Award,
  Wallet,
  Layers,
  Receipt
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  DonutChart, 
  BarComparisonChart, 
  TrendBarsChart,
  UserMultiModuleSupervisionCard,
  type DonutDataPoint,
  type BarComparisonItem,
  type TrendPeriodItem,
  type UserModuleSummary
} from '../components/analytics/DashboardCharts';
import './DashboardDirecteur.css'; 

type PeriodFilter = 'ALL' | 'TODAY' | '7_DAYS' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR';

export function DashboardResponsable() {
  const { 
    quotes, 
    invoices,
    prestations, 
    clients, 
    services, 
    users, 
    crmPrestations, 
    crmCaisse, 
    crmMaintenance, 
    crmArticles, 
    crmTiers, 
    crmCommissions 
  } = useAppContext();
  
  const { currentUser: authUser } = useAuth();
  const currentUser = users.find(u => u.id === authUser?.id) || authUser;
  const navigate = useNavigate();

  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('ALL');
  const [selectedCommercialFilter, setSelectedCommercialFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'TEAM_ANALYTICS' | 'OPERATIONS'>('OVERVIEW');

  const currentService = services.find(s => s.id === currentUser?.serviceId);
  const serviceName = currentService?.name || 'Mon Pôle d\'Activité';

  const isDateInPeriod = (dateStr?: string, period: PeriodFilter = selectedPeriod): boolean => {
    if (period === 'ALL') return true;
    if (!dateStr) return true;
    
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return true;
    const now = new Date();
    
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (period) {
      case 'TODAY':
        return d >= startOfToday;
      case '7_DAYS': {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return d >= weekAgo;
      }
      case 'THIS_MONTH':
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      case 'THIS_QUARTER': {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const itemQuarter = Math.floor(d.getMonth() / 3);
        return itemQuarter === currentQuarter && d.getFullYear() === now.getFullYear();
      }
      case 'THIS_YEAR':
        return d.getFullYear() === now.getFullYear();
      default:
        return true;
    }
  };

  // Scopage strict : chacun ne voit que ses propres données (Responsable inclus).
  const selfId = currentUser?.id;
  const serviceCommercials = users.filter(u => u.id === selfId && (u.role === 'Commercial' || u.role === 'Responsable'));

  // 1. Mes devis
  const filteredServiceQuotes = useMemo(() => {
    return quotes.filter(q => {
      if (q.commercialId !== selfId) return false;
      if (!isDateInPeriod(q.date)) return false;
      if (selectedCommercialFilter !== 'ALL' && q.commercialId !== selectedCommercialFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const cName = (clients.find(c => c.id === q.clientId)?.name || '').toLowerCase();
        const aName = (users.find(u => u.id === q.commercialId)?.name || '').toLowerCase();
        const sub = (q.subject || '').toLowerCase();
        const num = (q.quoteNumber || '').toLowerCase();
        if (!cName.includes(query) && !aName.includes(query) && !sub.includes(query) && !num.includes(query)) return false;
      }
      return true;
    });
  }, [quotes, selfId, selectedPeriod, selectedCommercialFilter, searchQuery, clients, users]);

  // 2. Mes commandes / prestations (créées, commerciales ou apportées par moi)
  const filteredServicePrestations = useMemo(() => {
    return crmPrestations.filter(p => {
      const isMine = p.cree_par === selfId || p.commercial_id === selfId || p.apporteur_id === selfId;
      if (!isMine) return false;
      if (!isDateInPeriod(p.date_commande || p.date_creation || p.created_at)) return false;
      if (selectedCommercialFilter !== 'ALL' && p.cree_par !== selectedCommercialFilter && p.commercial_id !== selectedCommercialFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const ref = (p.reference || '').toLowerCase();
        const client = (p.client_nom || '').toLowerCase();
        const des = (p.designation || '').toLowerCase();
        if (!ref.includes(query) && !client.includes(query) && !des.includes(query)) return false;
      }
      return true;
    });
  }, [crmPrestations, selfId, selectedPeriod, selectedCommercialFilter, searchQuery]);

  // 3. Mes tickets de maintenance
  const filteredServiceMaintenance = useMemo(() => {
    return crmMaintenance.filter(ticket => {
      if (ticket.cree_par !== selfId) return false;
      if (!isDateInPeriod(ticket.date_intervention || ticket.created_at)) return false;
      if (selectedCommercialFilter !== 'ALL' && ticket.cree_par !== selectedCommercialFilter) return false;
      return true;
    });
  }, [crmMaintenance, selfId, selectedPeriod, selectedCommercialFilter]);

  // Mes factures
  const filteredServiceInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const invDate = inv.issueDate || inv.issue_date || inv.createdAt || inv.created_at || '';
      if (!isDateInPeriod(invDate)) return false;
      const isMine = inv.commercialId === selfId || (inv as any).commercial_id === selfId || (inv as any).createdBy === selfId;
      if (!isMine) return false;
      if (selectedCommercialFilter !== 'ALL' && inv.commercialId !== selectedCommercialFilter && inv.commercial_id !== selectedCommercialFilter && inv.createdBy !== selectedCommercialFilter) return false;
      return true;
    });
  }, [invoices, selfId, selectedPeriod, selectedCommercialFilter]);

  const serviceInvoicesTotal = filteredServiceInvoices.filter(i => (i.status as string) !== 'ANNULEE' && (i.status as string) !== 'Annulée').reduce((sum, i) => sum + (i.totalAmount || 0), 0);
  const serviceInvoicesPaid = filteredServiceInvoices.reduce((sum, i) => sum + (i.payments || []).reduce((ps, p) => ps + (p.amount || 0), 0), 0);
  const serviceInvoicesRetardCount = filteredServiceInvoices.filter(i => {
    const paid = (i.payments || []).reduce((ps, p) => ps + (p.amount || 0), 0);
    const due = i.dueDate || i.due_date;
    return (i.status as string) === 'EN_RETARD' || (paid < (i.totalAmount || 0) && due && new Date(due) < new Date());
  }).length;

  // KPIs — même règle que la page Prestations : brouillons et annulées exclus du CA piloté
  const countedPrestations = filteredServicePrestations.filter(p => p.statut !== 'ANNULEE' && p.statut !== 'BROUILLON');
  const totalCommandesVente = countedPrestations.reduce((sum, p) => sum + (p.prix_client_final || p.montant_total_vente || 0), 0);
  const totalMargeInterne = countedPrestations.reduce((sum, p) => sum + (p.marge_interne || 0), 0);
  const totalBeneficeNet = countedPrestations.reduce((sum, p) => sum + (p.benefice_net || p.benefice_reel || 0), 0);

  const totalQuotesVal = filteredServiceQuotes.filter(q => q.status !== 'Refusé').reduce((sum, q) => sum + q.total, 0);
  const acceptedQuotes = filteredServiceQuotes.filter(q => q.status === 'Accepté');
  const acceptedQuotesVal = acceptedQuotes.reduce((sum, q) => sum + q.total, 0);
  const quotesAcceptanceRate = filteredServiceQuotes.length > 0 ? Math.round((acceptedQuotes.length / filteredServiceQuotes.length) * 100) : 0;

  // Donut Status
  const donutData: DonutDataPoint[] = [
    ...(currentUser?.crmPrestationsEnabled ? [
      { label: 'Commandes Payées', value: filteredServicePrestations.filter(p => p.statut === 'PAYEE').length, color: '#10B981' },
      { label: 'Commandes En cours', value: filteredServicePrestations.filter(p => p.statut !== 'PAYEE' && p.statut !== 'BROUILLON' && p.statut !== 'ANNULEE' && p.statut !== 'CLOTUREE').length, color: '#3B82F6' }
    ] : []),
    { label: 'Devis Acceptés', value: acceptedQuotes.length, color: '#059669' },
    ...(currentUser?.crmMaintenanceEnabled ? [
      { label: 'Tickets Maintenance', value: filteredServiceMaintenance.length, color: '#F59E0B' }
    ] : [])
  ].filter(d => d.value > 0);

  // Summaries des membres du service
  const serviceMemberSummaries: UserModuleSummary[] = useMemo(() => {
    return serviceCommercials.map(u => {
      const uQuotes = filteredServiceQuotes.filter(q => q.commercialId === u.id);
      const uAccQuotes = uQuotes.filter(q => q.status === 'Accepté');
      const uQVal = uQuotes.filter(q => q.status !== 'Refusé').reduce((sum, q) => sum + q.total, 0);
      const uQAccVal = uAccQuotes.reduce((sum, q) => sum + q.total, 0);
      const uRate = uQuotes.length > 0 ? Math.round((uAccQuotes.length / uQuotes.length) * 100) : 0;

      const uPrestAll = filteredServicePrestations.filter(p => p.cree_par === u.id || p.commercial_id === u.id);
      const uPrest = uPrestAll.filter(p => p.statut !== 'ANNULEE' && p.statut !== 'BROUILLON');
      const uVente = uPrest.reduce((sum, p) => sum + (p.prix_client_final || p.montant_total_vente || 0), 0);
      const uMarge = uPrest.reduce((sum, p) => sum + (p.marge_interne || 0), 0);
      const uBenef = uPrest.reduce((sum, p) => sum + (p.benefice_net || p.benefice_reel || 0), 0);

      const uMaint = filteredServiceMaintenance.filter(t => t.cree_par === u.id || t.technicien_assigne?.includes(u.name));

      return {
        user: {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          serviceName: serviceName,
          activeModulesCount: [
            u.crmPrestationsEnabled !== false, u.crmCaisseEnabled !== false,
            u.crmMaintenanceEnabled !== false, u.crmStocksEnabled !== false,
            u.crmTiersEnabled !== false, u.crmCommerciauxEnabled !== false,
            u.crmCommissionsEnabled !== false, u.crmFacturationEnabled !== false
          ].filter(Boolean).length,
          enabled: {
            prestations: u.crmPrestationsEnabled !== false,
            caisse: u.crmCaisseEnabled !== false,
            maintenance: u.crmMaintenanceEnabled !== false,
            stocks: u.crmStocksEnabled !== false,
            tiers: u.crmTiersEnabled !== false,
            commerciaux: u.crmCommerciauxEnabled !== false,
            commissions: u.crmCommissionsEnabled !== false,
            facturation: u.crmFacturationEnabled !== false
          }
        },
        quotes: {
          count: uQuotes.length,
          totalValue: uQVal,
          acceptedValue: uQAccVal,
          rate: uRate
        },
        prestations: {
          count: uPrest.length,
          totalVente: uVente,
          margeInterne: uMarge,
          beneficeNet: uBenef,
          payeeCount: uPrest.filter(p => p.statut === 'PAYEE').length
        },
        caisse: {
          mouvementsCount: 0,
          totalEntrees: 0,
          totalSorties: 0,
          solde: 0
        },
        maintenance: {
          ticketsCount: uMaint.length,
          urgentsCount: uMaint.filter(t => t.priorite === 'URGENTE').length,
          totalFacturation: uMaint.reduce((s, t) => s + (t.prix_total || 0), 0),
          resolusCount: uMaint.filter(t => t.statut === 'CLOTURE').length
        },
        tiers: {
          totalTiers: 0,
          clientsCount: 0,
          partenairesCount: 0
        },
        commissions: {
          count: 0,
          totalMontant: 0,
          payeeMontant: 0,
          attenteMontant: 0
        }
      };
    });
  }, [serviceCommercials, filteredServiceQuotes, filteredServicePrestations, filteredServiceMaintenance, serviceName]);

  const hasActiveFilters = selectedPeriod !== 'ALL' || selectedCommercialFilter !== 'ALL' || searchQuery !== '';

  const resetFilters = () => {
    setSelectedPeriod('ALL');
    setSelectedCommercialFilter('ALL');
    setSearchQuery('');
  };

  return (
    <div className="dashboard">
      {/* Hero Banner du Service */}
      <div className="responsable-hero-banner">
        <div className="hero-badge">
          <Building2 size={15} />
          <span>MON ACTIVITÉ PERSONNELLE</span>
        </div>
        <h1 className="hero-title">{serviceName}</h1>
        <p className="hero-subtitle">
          {currentService?.description || 'Pilotage de vos commandes, devis et interventions.'}
        </p>
        <div className="hero-meta-tags">
          {currentUser?.crmPrestationsEnabled && (
            <span className="hero-tag">
              <ShoppingBag size={14} color="#10B981" />
              <strong>{filteredServicePrestations.length}</strong> Commande(s)
            </span>
          )}
          <span className="hero-tag">
            <FileText size={14} color="#3B82F6" />
            <strong>{filteredServiceQuotes.length}</strong> Devis émis
          </span>
          {currentUser?.crmMaintenanceEnabled && (
            <span className="hero-tag">
              <Wrench size={14} color="#F59E0B" />
              <strong>{filteredServiceMaintenance.length}</strong> Intervention(s)
            </span>
          )}
        </div>
      </div>

      {/* ─── FILTRES RESPONSABLE ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px', border: hasActiveFilters ? '1.5px solid rgba(37, 99, 235, 0.4)' : '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 700 }}>
            <Filter size={16} color="var(--color-primary)" />
            <span>Filtres de supervision du pôle</span>
            {hasActiveFilters && (
              <span className="badge-status" style={{ background: 'rgba(37, 99, 235, 0.12)', color: '#2563EB', fontSize: '11px' }}>
                Filtres appliqués
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <button 
              className="btn btn-secondary" 
              onClick={resetFilters}
              style={{ fontSize: '0.8rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <RotateCcw size={12} />
              <span>Réinitialiser</span>
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="table-input"
              style={{ paddingLeft: '32px', width: '100%', fontSize: '0.85rem' }}
              placeholder="Rechercher client, référence..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div>
            <select
              className="table-input"
              style={{ width: '100%', fontSize: '0.85rem' }}
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(e.target.value as PeriodFilter)}
            >
              <option value="ALL">📅 Toute la période</option>
              <option value="TODAY">Aujourd'hui</option>
              <option value="7_DAYS">7 derniers jours</option>
              <option value="THIS_MONTH">Ce mois-ci</option>
              <option value="THIS_QUARTER">Ce trimestre</option>
              <option value="THIS_YEAR">Cette année</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── KPIS DU SERVICE (CONDITIONNÉS PAR LES MODULES ACTIFS) ─────────────────── */}
      <div className="widgets-grid" style={{ marginBottom: '20px' }}>
        {/* Module Commandes / Prestations */}
        {(selectedCommercialFilter === 'ALL' ? !!currentUser?.crmPrestationsEnabled : !!users.find(u => u.id === selectedCommercialFilter)?.crmPrestationsEnabled) && (
          <div className="widget-card" style={{ borderLeft: '4px solid #10B981', cursor: 'pointer' }} onClick={() => setActiveTab('OPERATIONS')}>
            <div className="widget-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
              <ShoppingBag size={24} />
            </div>
            <div className="widget-content">
              <div className="widget-label">COMMANDES VENTES</div>
              <div className="widget-value">{totalCommandesVente.toLocaleString('fr-FR')} F</div>
              <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, marginTop: '2px' }}>
                Marge: {totalMargeInterne.toLocaleString('fr-FR')} F ({filteredServicePrestations.length} cmds)
              </div>
            </div>
          </div>
        )}

        {/* Module Devis */}
        <div className="widget-card" style={{ borderLeft: '4px solid #3B82F6', cursor: 'pointer' }} onClick={() => navigate('/devis')}>
          <div className="widget-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#2563EB' }}>
            <FileText size={24} />
          </div>
          <div className="widget-content">
            <div className="widget-label">DEVIS ACCEPTÉS</div>
            <div className="widget-value">{acceptedQuotesVal.toLocaleString('fr-FR')} F</div>
            <div style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
              {acceptedQuotes.length}/{filteredServiceQuotes.length} devis ({quotesAcceptanceRate}%)
            </div>
          </div>
        </div>

        {/* Module Facturation */}
        {(selectedCommercialFilter === 'ALL' ? !!currentUser?.crmFacturationEnabled : !!users.find(u => u.id === selectedCommercialFilter)?.crmFacturationEnabled) && (
          <div className="widget-card" style={{ borderLeft: '4px solid #0284C7', cursor: 'pointer' }} onClick={() => navigate('/factures')}>
            <div className="widget-icon" style={{ background: 'rgba(2, 132, 199, 0.1)', color: '#0284C7' }}>
              <Receipt size={24} />
            </div>
            <div className="widget-content">
              <div className="widget-label">FACTURES & RECOUVREMENT</div>
              <div className="widget-value">{serviceInvoicesTotal.toLocaleString('fr-FR')} F</div>
              <div style={{ fontSize: '0.75rem', color: '#0284C7', fontWeight: 600, marginTop: '2px' }}>
                Encaissé: {serviceInvoicesPaid.toLocaleString('fr-FR')} F {serviceInvoicesRetardCount > 0 ? `• ${serviceInvoicesRetardCount} retard` : ''}
              </div>
            </div>
          </div>
        )}

        {/* Module Bénéfice / Rentabilité (Prestations) */}
        {(selectedCommercialFilter === 'ALL' ? !!currentUser?.crmPrestationsEnabled : !!users.find(u => u.id === selectedCommercialFilter)?.crmPrestationsEnabled) && (
          <div className="widget-card" style={{ borderLeft: '4px solid #059669' }}>
            <div className="widget-icon" style={{ background: 'rgba(5, 150, 105, 0.1)', color: '#059669' }}>
              <Award size={24} />
            </div>
            <div className="widget-content">
              <div className="widget-label">MON BÉNÉFICE NET</div>
              <div className="widget-value">{totalBeneficeNet.toLocaleString('fr-FR')} F</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                Rendement financier net
              </div>
            </div>
          </div>
        )}

        {/* Module Maintenance */}
        {(selectedCommercialFilter === 'ALL' ? !!currentUser?.crmMaintenanceEnabled : !!users.find(u => u.id === selectedCommercialFilter)?.crmMaintenanceEnabled) && (
          <div className="widget-card" style={{ borderLeft: '4px solid #F59E0B', cursor: 'pointer' }} onClick={() => navigate('/crm/maintenance')}>
            <div className="widget-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#D97706' }}>
              <Wrench size={24} />
            </div>
            <div className="widget-content">
              <div className="widget-label">MAINTENANCE</div>
              <div className="widget-value">{filteredServiceMaintenance.length} tickets</div>
              <div style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 600, marginTop: '2px' }}>
                Interventions techniques
              </div>
            </div>
          </div>
        )}

        {/* Module Caisse (si activé pour le responsable ou collaborateur) */}
        {(selectedCommercialFilter === 'ALL' ? !!currentUser?.crmCaisseEnabled : !!users.find(u => u.id === selectedCommercialFilter)?.crmCaisseEnabled) && (
          <div className="widget-card" style={{ borderLeft: '4px solid #EF4444', cursor: 'pointer' }} onClick={() => navigate('/crm/caisse')}>
            <div className="widget-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#DC2626' }}>
              <Wallet size={24} />
            </div>
            <div className="widget-content">
              <div className="widget-label">CAISSE & DÉPENSES</div>
              <div className="widget-value">
                {crmCaisse.filter(m => m.cree_par === (selectedCommercialFilter !== 'ALL' ? selectedCommercialFilter : currentUser?.id)).reduce((s, m) => s + (m.type === 'SORTIE' ? -m.montant : m.montant), 0).toLocaleString('fr-FR')} F
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                Solde de caisse actif
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── ONGLETS DE NAVIGATION ───────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--color-border)', paddingBottom: '10px' }}>
        <button
          className={`btn ${activeTab === 'OVERVIEW' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('OVERVIEW')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 16px' }}
        >
          <BarChart3 size={16} />
          <span>Vue Synthèse</span>
        </button>

        <button
          className={`btn ${activeTab === 'TEAM_ANALYTICS' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('TEAM_ANALYTICS')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 16px' }}
        >
          <Users size={16} />
          <span>Mon activité ({serviceMemberSummaries.length})</span>
        </button>

        {currentUser?.crmPrestationsEnabled && (
          <button
            className={`btn ${activeTab === 'OPERATIONS' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('OPERATIONS')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 16px' }}
          >
            <Layers size={16} />
            <span>Détail des Commandes ({filteredServicePrestations.length})</span>
          </button>
        )}
      </div>

      {/* ─── VUE 1 : SYNTHÈSE ─────────────────────────────────── */}
      {activeTab === 'OVERVIEW' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
          <div className="card" style={{ padding: '20px' }}>
            <DonutChart
              data={donutData}
              title="Distribution de mes activités"
              subTitle="Commandes, devis et interventions"
              centerLabel="Opérations"
              centerValue={donutData.reduce((s, d) => s + d.value, 0)}
              size={160}
              strokeWidth={22}
            />
          </div>

          <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Raccourcis Opérationnels du Service</h4>
              <p style={{ margin: '2px 0 16px', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Accès direct aux modules CRM du responsable</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {currentUser?.crmPrestationsEnabled && (
                  <button className="btn btn-outline" style={{ justifyContent: 'space-between', padding: '10px 14px' }} onClick={() => navigate('/crm/prestations')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ShoppingBag size={16} color="#10B981" /> Commandes (Grille 11 col.)</span>
                    <ArrowUpRight size={14} />
                  </button>
                )}
                {currentUser?.crmMaintenanceEnabled && (
                  <button className="btn btn-outline" style={{ justifyContent: 'space-between', padding: '10px 14px' }} onClick={() => navigate('/crm/maintenance')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Wrench size={16} color="#F59E0B" /> Tickets d'intervention</span>
                    <ArrowUpRight size={14} />
                  </button>
                )}
                {currentUser?.crmCaisseEnabled && (
                  <button className="btn btn-outline" style={{ justifyContent: 'space-between', padding: '10px 14px' }} onClick={() => navigate('/crm/caisse')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Wallet size={16} color="#EF4444" /> Journal de caisse</span>
                    <ArrowUpRight size={14} />
                  </button>
                )}
                {currentUser?.crmFacturationEnabled && (
                  <button className="btn btn-outline" style={{ justifyContent: 'space-between', padding: '10px 14px' }} onClick={() => navigate('/factures')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Receipt size={16} color="#0284C7" /> Suivi des factures</span>
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── VUE 2 : ÉQUIPE DU SERVICE ────────────────────────── */}
      {activeTab === 'TEAM_ANALYTICS' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {serviceMemberSummaries.map(summary => (
            <UserMultiModuleSupervisionCard
              key={summary.user.id}
              summary={summary}
            />
          ))}

          {serviceMemberSummaries.length === 0 && (
            <div className="card" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Aucune donnée pour le moment.
            </div>
          )}
        </div>
      )}

      {/* ─── VUE 3 : OPÉRATIONS COMMANDES ─────────────────────── */}
      {activeTab === 'OPERATIONS' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0 }}>Commandes & Prestations ({filteredServicePrestations.length})</h3>
            <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '6px 14px' }} onClick={() => navigate('/crm/prestations')}>
              + Nouvelle commande
            </button>
          </div>
          <div className="table-responsive">
            <table className="data-table responsive-table">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Client</th>
                  <th>Désignation</th>
                  <th style={{ textAlign: 'right' }}>Prix Vente</th>
                  <th style={{ textAlign: 'right' }}>Marge</th>
                  <th style={{ textAlign: 'right' }}>Bénéfice Net</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filteredServicePrestations.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/crm/prestations')}>
                    <td data-label="Réf."><strong>{p.reference}</strong></td>
                    <td data-label="Client">{p.client_nom}</td>
                    <td data-label="Désignation">{p.designation}</td>
                    <td data-label="Prix Vente" style={{ textAlign: 'right', fontWeight: 700 }}>
                      {(p.prix_client_final || 0).toLocaleString('fr-FR')} F
                    </td>
                    <td data-label="Marge" style={{ textAlign: 'right', color: '#2563EB', fontWeight: 600 }}>
                      {(p.marge_interne || 0).toLocaleString('fr-FR')} F
                    </td>
                    <td data-label="Bénéfice Net" style={{ textAlign: 'right', color: '#059669', fontWeight: 700 }}>
                      {(p.benefice_net || 0).toLocaleString('fr-FR')} F
                    </td>
                    <td data-label="Statut">
                      <span className="badge-status" style={{ background: p.statut === 'PAYEE' ? '#D1FAE5' : '#DBEAFE', color: p.statut === 'PAYEE' ? '#059669' : '#1D4ED8' }}>
                        {p.statut}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredServicePrestations.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                      Aucune commande enregistrée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
