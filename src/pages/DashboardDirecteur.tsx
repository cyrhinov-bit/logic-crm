import { useState, useMemo } from 'react';
import { 
  FileText, 
  CheckCircle, 
  Clock, 
  Users, 
  UserCheck, 
  ArrowUpRight, 
  Search, 
  Filter, 
  RotateCcw,
  Calendar,
  Building2,
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  Layers,
  ChevronDown,
  ShoppingBag,
  DollarSign,
  Wrench,
  Package,
  Award,
  Wallet,
  Activity,
  Sparkles,
  Receipt
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
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
type ModuleScope = 'ALL' | 'PRESTATIONS' | 'DEVIS' | 'FACTURES' | 'CAISSE' | 'MAINTENANCE' | 'STOCKS' | 'TIERS' | 'COMMISSIONS';

export function DashboardDirecteur() {
  const { 
    quotes, 
    invoices,
    clients, 
    services, 
    users, 
    crmPrestations, 
    crmCaisse, 
    crmMaintenance, 
    crmArticles, 
    crmTiers, 
    crmCommerciaux, 
    crmCommissions 
  } = useAppContext();
  
  const navigate = useNavigate();

  // Filtres
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('ALL');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('ALL');
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>('ALL');
  const [selectedModuleScope, setSelectedModuleScope] = useState<ModuleScope>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'USERS_ANALYTICS' | 'DETAILED_TABLES'>('OVERVIEW');
  const [inspectedUserId, setInspectedUserId] = useState<string | null>(null);

  // Helper date filtering
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

  // 1. Filtrage Devis
  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      if (!isDateInPeriod(q.date)) return false;
      if (selectedUserFilter !== 'ALL') {
        const matchUser = q.commercialId === selectedUserFilter || 
          (!q.commercialId && users.find(u => u.id === selectedUserFilter)?.serviceId === q.serviceId);
        if (!matchUser) return false;
      }
      if (selectedServiceFilter !== 'ALL' && q.serviceId !== selectedServiceFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const clientName = (clients.find(c => c.id === q.clientId)?.name || '').toLowerCase();
        const authorName = (users.find(u => u.id === q.commercialId)?.name || '').toLowerCase();
        const subject = (q.subject || '').toLowerCase();
        const qNum = (q.quoteNumber || '').toLowerCase();
        if (!clientName.includes(query) && !authorName.includes(query) && !subject.includes(query) && !qNum.includes(query)) return false;
      }
      return true;
    });
  }, [quotes, selectedPeriod, selectedUserFilter, selectedServiceFilter, searchQuery, clients, users]);

  // 2. Filtrage Prestations & Commandes
  const filteredPrestations = useMemo(() => {
    return crmPrestations.filter(p => {
      if (!isDateInPeriod(p.date_commande || p.date_creation || p.created_at)) return false;
      if (selectedUserFilter !== 'ALL') {
        const match = p.cree_par === selectedUserFilter || 
          p.commercial_id === selectedUserFilter || 
          p.resp_service_id === selectedUserFilter ||
          p.responsable_service_id === selectedUserFilter ||
          p.apporteur_id === selectedUserFilter;
        if (!match) return false;
      }
      if (selectedServiceFilter !== 'ALL') {
        const user = users.find(u => u.id === p.cree_par || u.id === p.resp_service_id || u.id === p.responsable_service_id);
        if (user && user.serviceId !== selectedServiceFilter) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const ref = (p.reference || '').toLowerCase();
        const client = (p.client_nom || '').toLowerCase();
        const des = (p.designation || '').toLowerCase();
        if (!ref.includes(query) && !client.includes(query) && !des.includes(query)) return false;
      }
      return true;
    });
  }, [crmPrestations, selectedPeriod, selectedUserFilter, selectedServiceFilter, searchQuery, users]);

  // 3. Filtrage Caisse & Mouvements
  const filteredCaisse = useMemo(() => {
    return crmCaisse.filter(m => {
      if (!isDateInPeriod(m.date_mouvement || m.date || m.created_at)) return false;
      if (selectedUserFilter !== 'ALL' && m.cree_par !== selectedUserFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const motif = (m.motif || '').toLowerCase();
        const cat = (m.categorie || '').toLowerCase();
        if (!motif.includes(query) && !cat.includes(query)) return false;
      }
      return true;
    });
  }, [crmCaisse, selectedPeriod, selectedUserFilter, searchQuery]);

  // 4. Filtrage Maintenance
  const filteredMaintenance = useMemo(() => {
    return crmMaintenance.filter(ticket => {
      if (!isDateInPeriod(ticket.date_intervention || ticket.created_at)) return false;
      if (selectedUserFilter !== 'ALL') {
        const match = ticket.cree_par === selectedUserFilter || 
          ticket.technicien_assigne?.toLowerCase().includes((users.find(u => u.id === selectedUserFilter)?.name || '').toLowerCase());
        if (!match) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const ref = (ticket.reference || '').toLowerCase();
        const eq = (ticket.equipement || '').toLowerCase();
        const site = (ticket.site_agence || '').toLowerCase();
        if (!ref.includes(query) && !eq.includes(query) && !site.includes(query)) return false;
      }
      return true;
    });
  }, [crmMaintenance, selectedPeriod, selectedUserFilter, searchQuery, users]);

  // 5. Filtrage Tiers
  const filteredTiers = useMemo(() => {
    return crmTiers.filter(t => {
      if (selectedUserFilter !== 'ALL' && t.cree_par !== selectedUserFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nom = (t.nom || '').toLowerCase();
        const tel = (t.telephone || '').toLowerCase();
        const email = (t.email || '').toLowerCase();
        if (!nom.includes(query) && !tel.includes(query) && !email.includes(query)) return false;
      }
      return true;
    });
  }, [crmTiers, selectedUserFilter, searchQuery]);

  // 6. Filtrage Commissions
  const filteredCommissions = useMemo(() => {
    return crmCommissions.filter(c => {
      if (!isDateInPeriod(c.date_reglement || c.created_at)) return false;
      if (selectedUserFilter !== 'ALL') {
        const userName = (users.find(u => u.id === selectedUserFilter)?.name || '').toLowerCase();
        const match = c.beneficiaire_id === selectedUserFilter || 
          c.cree_par === selectedUserFilter || 
          (c.beneficiaire_nom && c.beneficiaire_nom.toLowerCase().includes(userName));
        if (!match) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const ben = (c.beneficiaire_nom || '').toLowerCase();
        const ref = (c.prestation_ref || '').toLowerCase();
        if (!ben.includes(query) && !ref.includes(query)) return false;
      }
      return true;
    });
  }, [crmCommissions, selectedPeriod, selectedUserFilter, searchQuery, users]);

  // 7. Filtrage Factures
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const invDate = inv.issueDate || inv.issue_date || inv.createdAt || inv.created_at || '';
      if (!isDateInPeriod(invDate)) return false;
      if (selectedUserFilter !== 'ALL') {
        const match = inv.commercialId === selectedUserFilter || 
          inv.commercial_id === selectedUserFilter || 
          inv.createdBy === selectedUserFilter || 
          inv.created_by === selectedUserFilter;
        if (!match) return false;
      }
      if (selectedServiceFilter !== 'ALL') {
        if (inv.serviceId !== selectedServiceFilter && inv.service_id !== selectedServiceFilter) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const num = (inv.invoiceNumber || inv.invoice_number || '').toLowerCase();
        const client = clients.find(c => c.id === (inv.clientId || inv.client_id));
        const cName = (client?.name || '').toLowerCase();
        if (!num.includes(query) && !cName.includes(query)) return false;
      }
      return true;
    });
  }, [invoices, selectedPeriod, selectedUserFilter, selectedServiceFilter, searchQuery, clients]);

  // ─── Synthèses Financières & Quantitatives Multi-Modules ───────
  // Prestations KPIs — brouillons et annulées exclus du CA piloté (même règle que la page Prestations)
  const isCountedPresta = (p: any) => p.statut !== 'ANNULEE' && p.statut !== 'BROUILLON';
  const totalCommandesVente = filteredPrestations.filter(isCountedPresta).reduce((sum, p) => sum + (p.prix_client_final || p.montant_total_vente || 0), 0);
  const totalMargeInterne = filteredPrestations.filter(isCountedPresta).reduce((sum, p) => sum + (p.marge_interne || 0), 0);
  const totalBeneficeNet = filteredPrestations.filter(isCountedPresta).reduce((sum, p) => sum + (p.benefice_net || p.benefice_reel || 0), 0);
  const totalCommandesPayees = filteredPrestations.filter(p => p.statut === 'PAYEE' || p.statut === 'CLOTUREE').length;

  // Devis KPIs
  const totalQuotes = filteredQuotes.length;
  const acceptedQuotes = filteredQuotes.filter(q => q.status === 'Accepté');
  const acceptedQuotesValue = acceptedQuotes.reduce((sum, q) => sum + q.total, 0);
  const pendingQuotesValue = filteredQuotes.filter(q => q.status === 'Envoyé' || q.status === 'Brouillon' || q.status === 'Révision').reduce((sum, q) => sum + q.total, 0);
  const quotesAcceptanceRate = totalQuotes > 0 ? Math.round((acceptedQuotes.length / totalQuotes) * 100) : 0;

  // Factures KPIs
  const totalFacturesCount = filteredInvoices.length;
  const totalFactureMontant = filteredInvoices.filter(i => (i.status as string) !== 'ANNULEE' && (i.status as string) !== 'Annulée').reduce((sum, i) => sum + (i.totalAmount || 0), 0);
  const totalFacturePaye = filteredInvoices.filter(i => (i.status as string) !== 'ANNULEE' && (i.status as string) !== 'Annulée').reduce((sum, i) => sum + (i.payments || []).reduce((ps, p) => ps + (p.amount || 0), 0), 0);
  const facturesEnRetardCount = filteredInvoices.filter(i => {
    const paid = (i.payments || []).reduce((ps, p) => ps + (p.amount || 0), 0);
    const due = i.dueDate || i.due_date;
    return (i.status as string) === 'EN_RETARD' || (paid < (i.totalAmount || 0) && due && new Date(due) < new Date());
  }).length;

  // Caisse KPIs
  const totalCaisseEntrees = filteredCaisse.filter(m => m.type === 'ENTREE').reduce((sum, m) => sum + (m.montant || 0), 0);
  const totalCaisseSorties = filteredCaisse.filter(m => m.type === 'SORTIE').reduce((sum, m) => sum + (m.montant || 0), 0);
  const soldeNetCaisse = totalCaisseEntrees - totalCaisseSorties;

  // Maintenance KPIs
  const totalTickets = filteredMaintenance.length;
  const ticketsUrgents = filteredMaintenance.filter(t => t.priorite === 'URGENTE' || t.priorite === 'HAUTE').length;
  const totalFacturationMaintenance = filteredMaintenance.filter(t => t.statut !== 'ANNULE' && t.statut !== 'ANNULEE').reduce((sum, t) => sum + (t.prix_total || t.prix || (t.quantite * t.prix_unitaire) || 0), 0);
  const ticketsTermines = filteredMaintenance.filter(t => t.statut === 'CLOTURE' || t.statut === 'TERMINE_A_FACTURER' || t.statut === 'TERMINEE').length;

  // Stocks KPIs
  const totalArticlesStock = crmArticles.length;
  const stockAlertesCount = crmArticles.filter(s => (s.quantite_stock ?? 0) <= (s.seuil_alerte ?? 0)).length;
  const valorisationStockAchat = crmArticles.reduce((sum: number, s) => sum + ((s.quantite_stock || 0) * (s.cout_unitaire_achat || 0)), 0);
  const valorisationStockVente = crmArticles.reduce((sum: number, s) => sum + ((s.quantite_stock || 0) * (s.prix_unitaire_vente || 0)), 0);

  // Commissions KPIs
  const totalCommissionsMontant = filteredCommissions.filter(c => c.statut !== 'ANNULEE').reduce((sum, c) => sum + (c.montant || c.montant_commission || 0), 0);
  const totalCommissionsPayees = filteredCommissions.filter(c => c.statut === 'PAYEE').reduce((sum, c) => sum + (c.montant || c.montant_commission || 0), 0);
  const totalCommissionsEnAttente = filteredCommissions.filter(c => c.statut !== 'PAYEE' && c.statut !== 'ANNULEE').reduce((sum, c) => sum + (c.montant || c.montant_commission || 0), 0);

  // ─── Synthèse par Utilisateur (Multi-Module 360°) ───────────────
  const userMultiModuleSummaries: UserModuleSummary[] = useMemo(() => {
    return users.map(u => {
      const uService = services.find(s => s.id === u.serviceId);

      // Devis — attribution stricte au commercial assigné (pas de diffusion au service :
      // un devis sans commercial n'est attribué à personne plutôt qu'à tout le service)
      const uQuotes = filteredQuotes.filter(q => q.commercialId === u.id);
      const uAcceptedQuotes = uQuotes.filter(q => q.status === 'Accepté');
      const uTotalQuotesVal = uQuotes.filter(q => q.status !== 'Refusé').reduce((sum, q) => sum + q.total, 0);
      const uAcceptedQuotesVal = uAcceptedQuotes.reduce((sum, q) => sum + q.total, 0);
      const uQuotesRate = uQuotes.length > 0 ? Math.round((uAcceptedQuotes.length / uQuotes.length) * 100) : 0;

      // Prestations (brouillons et annulées exclus du CA piloté — même règle que la page Prestations)
      const uPrestations = filteredPrestations.filter(p =>
        (p.cree_par === u.id || p.commercial_id === u.id || p.resp_service_id === u.id || p.responsable_service_id === u.id)
        && p.statut !== 'ANNULEE' && p.statut !== 'BROUILLON'
      );
      const uVente = uPrestations.reduce((sum, p) => sum + (p.prix_client_final || p.montant_total_vente || 0), 0);
      const uMarge = uPrestations.reduce((sum, p) => sum + (p.marge_interne || 0), 0);
      const uBenef = uPrestations.reduce((sum, p) => sum + (p.benefice_net || p.benefice_reel || 0), 0);
      const uPayees = uPrestations.filter(p => p.statut === 'PAYEE' || p.statut === 'CLOTUREE').length;

      // Caisse
      const uCaisse = filteredCaisse.filter(m => m.cree_par === u.id);
      const uEntrees = uCaisse.filter(m => m.type === 'ENTREE').reduce((sum, m) => sum + (m.montant || 0), 0);
      const uSorties = uCaisse.filter(m => m.type === 'SORTIE').reduce((sum, m) => sum + (m.montant || 0), 0);

      // Maintenance — assignation exacte au technicien (égalité stricte, pas de sous-chaîne)
      const uMaint = filteredMaintenance.filter(t =>
        t.cree_par === u.id || (t.technicien_assigne || '').trim().toLowerCase() === (u.name || '').trim().toLowerCase()
      );
      const uUrgents = uMaint.filter(t => t.priorite === 'URGENTE' || t.priorite === 'HAUTE').length;
      const uFact = uMaint.reduce((sum, t) => sum + (t.prix_total || t.prix || (t.quantite * t.prix_unitaire) || 0), 0);
      const uResolus = uMaint.filter(t => t.statut === 'CLOTURE' || t.statut === 'TERMINE_A_FACTURER' || t.statut === 'TERMINEE').length;

      // Tiers
      const uTiers = filteredTiers.filter(t => t.cree_par === u.id);
      const uClientsCount = uTiers.filter(t => t.type === 'CLIENT').length;
      const uPartenairesCount = uTiers.filter(t => t.type === 'PARTENAIRE').length;

      // Commissions — rattachement strict (id ou créateur, repli nom exact ; jamais de sous-chaîne)
      const uComms = filteredCommissions.filter(c =>
        c.beneficiaire_id === u.id || c.cree_par === u.id || (c.beneficiaire_nom && (u.name || '') !== '' && c.beneficiaire_nom.trim().toLowerCase() === (u.name || '').trim().toLowerCase())
      );
      const uCommTotal = uComms.reduce((sum, c) => sum + (c.montant || c.montant_commission || 0), 0);
      const uCommPayee = uComms.filter(c => c.statut === 'PAYEE').reduce((sum, c) => sum + (c.montant || c.montant_commission || 0), 0);
      const uCommAttente = uComms.filter(c => c.statut !== 'PAYEE' && c.statut !== 'ANNULEE').reduce((sum, c) => sum + (c.montant || c.montant_commission || 0), 0);

      // Cohérence opt-out globale (Sidebar, gardes) : seul `false` explicite désactive
      const activeMods = [
        u.crmPrestationsEnabled !== false,
        u.crmCaisseEnabled !== false,
        u.crmMaintenanceEnabled !== false,
        u.crmStocksEnabled !== false,
        u.crmTiersEnabled !== false,
        u.crmCommerciauxEnabled !== false,
        u.crmCommissionsEnabled !== false,
        u.crmFacturationEnabled !== false
      ].filter(Boolean).length;

      return {
        user: {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          serviceName: uService?.name || 'Direction / Tous services',
          activeModulesCount: activeMods,
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
          totalValue: uTotalQuotesVal,
          acceptedValue: uAcceptedQuotesVal,
          rate: uQuotesRate
        },
        prestations: {
          count: uPrestations.length,
          totalVente: uVente,
          margeInterne: uMarge,
          beneficeNet: uBenef,
          payeeCount: uPayees
        },
        caisse: {
          mouvementsCount: uCaisse.length,
          totalEntrees: uEntrees,
          totalSorties: uSorties,
          solde: uEntrees - uSorties
        },
        maintenance: {
          ticketsCount: uMaint.length,
          urgentsCount: uUrgents,
          totalFacturation: uFact,
          resolusCount: uResolus
        },
        tiers: {
          totalTiers: uTiers.length,
          clientsCount: uClientsCount,
          partenairesCount: uPartenairesCount
        },
        commissions: {
          count: uComms.length,
          totalMontant: uCommTotal,
          payeeMontant: uCommPayee,
          attenteMontant: uCommAttente
        }
      };
    }).sort((a, b) => (b.prestations.totalVente + b.quotes.totalValue) - (a.prestations.totalVente + a.quotes.totalValue));
  }, [users, services, filteredQuotes, filteredPrestations, filteredCaisse, filteredMaintenance, filteredTiers, filteredCommissions]);

  // Bar comparison items for the active scope
  const barComparisonItems: BarComparisonItem[] = useMemo(() => {
    return userMultiModuleSummaries.map(s => {
      let totalVal = 0;
      let accVal = 0;
      let count = 0;
      let accCount = 0;

      if (selectedModuleScope === 'PRESTATIONS') {
        totalVal = s.prestations.totalVente;
        accVal = s.prestations.beneficeNet;
        count = s.prestations.count;
        accCount = s.prestations.payeeCount;
      } else if (selectedModuleScope === 'CAISSE') {
        totalVal = s.caisse.totalEntrees;
        accVal = s.caisse.totalSorties;
        count = s.caisse.mouvementsCount;
        accCount = s.caisse.mouvementsCount;
      } else if (selectedModuleScope === 'MAINTENANCE') {
        totalVal = s.maintenance.totalFacturation;
        accVal = s.maintenance.totalFacturation;
        count = s.maintenance.ticketsCount;
        accCount = s.maintenance.resolusCount;
      } else {
        // Consolidated ALL or DEVIS
        totalVal = s.prestations.totalVente + s.quotes.totalValue;
        accVal = s.prestations.beneficeNet + s.quotes.acceptedValue;
        count = s.prestations.count + s.quotes.count;
        accCount = s.prestations.payeeCount + (s.quotes.count > 0 ? Math.round((s.quotes.rate / 100) * s.quotes.count) : 0);
      }

      const rate = totalVal > 0 ? Math.min(100, Math.round((accVal / totalVal) * 100)) : 0;

      return {
        id: s.user.id,
        name: s.user.name,
        role: s.user.role,
        serviceName: s.user.serviceName,
        totalValue: totalVal,
        acceptedValue: accVal,
        pendingValue: totalVal - accVal,
        quoteCount: count,
        acceptedCount: accCount,
        rate: rate
      };
    }).filter(item => item.totalValue > 0 || item.quoteCount > 0);
  }, [userMultiModuleSummaries, selectedModuleScope]);

  // Donut data global
  const donutScopeData: DonutDataPoint[] = useMemo(() => {
    if (selectedModuleScope === 'PRESTATIONS') {
      const payees = filteredPrestations.filter(p => p.statut === 'PAYEE' || p.statut === 'CLOTUREE').length;
      const validees = filteredPrestations.filter(p => p.statut === 'VALIDE' || p.statut === 'CONFIRMEE' || p.statut === 'EN_COURS').length;
      const attente = filteredPrestations.filter(p => p.statut === 'EN_ATTENTE_VALIDATION' || p.statut === 'DEVIS').length;
      const brouillon = filteredPrestations.filter(p => p.statut === 'BROUILLON').length;
      return [
        { label: 'Payées / Clôturées', value: payees, color: '#10B981' },
        { label: 'Validées / En cours', value: validees, color: '#3B82F6' },
        { label: 'En attente', value: attente, color: '#F59E0B' },
        { label: 'Brouillons', value: brouillon, color: '#94A3B8' }
      ];
    } else if (selectedModuleScope === 'CAISSE') {
      const entrees = filteredCaisse.filter(m => m.type === 'ENTREE').length;
      const sorties = filteredCaisse.filter(m => m.type === 'SORTIE').length;
      return [
        { label: 'Entrées de fonds', value: entrees, color: '#10B981' },
        { label: 'Sorties / Dépenses', value: sorties, color: '#EF4444' }
      ];
    } else if (selectedModuleScope === 'MAINTENANCE') {
      const urgentes = filteredMaintenance.filter(t => t.priorite === 'URGENTE').length;
      const hautes = filteredMaintenance.filter(t => t.priorite === 'HAUTE').length;
      const moyennes = filteredMaintenance.filter(t => t.priorite === 'MOYENNE' || t.priorite === 'BASSE').length;
      const cloturees = filteredMaintenance.filter(t => t.statut === 'CLOTURE' || t.statut === 'TERMINEE').length;
      return [
        { label: 'Urgentes', value: urgentes, color: '#EF4444' },
        { label: 'Priorité Haute', value: hautes, color: '#F59E0B' },
        { label: 'Normales / Basses', value: moyennes, color: '#3B82F6' },
        { label: 'Clôturées', value: cloturees, color: '#10B981' }
      ];
    } else {
      // 360 Consolidated Activity
      return [
        { label: 'Commandes Prestations', value: filteredPrestations.length, color: '#10B981' },
        { label: 'Devis Clients', value: filteredQuotes.length, color: '#3B82F6' },
        { label: 'Mouvements Caisse', value: filteredCaisse.length, color: '#EF4444' },
        { label: 'Interventions Maintenance', value: filteredMaintenance.length, color: '#F59E0B' },
        { label: 'Tiers Référencés', value: filteredTiers.length, color: '#8B5CF6' }
      ].filter(d => d.value > 0);
    }
  }, [selectedModuleScope, filteredPrestations, filteredCaisse, filteredMaintenance, filteredQuotes, filteredTiers]);

  const resetFilters = () => {
    setSelectedPeriod('ALL');
    setSelectedUserFilter('ALL');
    setSelectedServiceFilter('ALL');
    setSelectedModuleScope('ALL');
    setSearchQuery('');
    setInspectedUserId(null);
  };

  const hasActiveFilters = selectedPeriod !== 'ALL' || selectedUserFilter !== 'ALL' || selectedServiceFilter !== 'ALL' || selectedModuleScope !== 'ALL' || searchQuery !== '';

  const inspectedUserSummary = userMultiModuleSummaries.find(s => s.user.id === inspectedUserId);

  return (
    <div className="dashboard">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(37, 99, 235, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
              <TrendingUp size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Supervision Direction Multi-Modules</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
                Pilotage analytique global et supervision individuelle de chaque collaborateur sur tous les modules actifs.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => navigate('/crm/modules')} 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <Layers size={16} />
            <span>Gestion des Accès Modules</span>
          </button>
          <button 
            className="btn btn-primary" 
            onClick={() => navigate('/crm/prestations')} 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <ShoppingBag size={16} />
            <span>Nouvelle Commande</span>
          </button>
        </div>
      </div>

      {/* ─── FILTRES MULTI-CRITÈRES ÉLÉGANTS ───────────────────── */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px', border: hasActiveFilters ? '1.5px solid rgba(37, 99, 235, 0.4)' : '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 700 }}>
            <Filter size={16} color="var(--color-primary)" />
            <span>Filtres de supervision globale</span>
            {hasActiveFilters && (
              <span className="badge-status" style={{ background: 'rgba(37, 99, 235, 0.12)', color: '#2563EB', fontSize: '11px' }}>
                Filtres actifs
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <button 
              className="btn btn-secondary" 
              onClick={resetFilters}
              style={{ fontSize: '0.8rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={13} />
              <span>Réinitialiser</span>
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'center' }}>
          {/* Recherche */}
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="table-input"
              style={{ paddingLeft: '32px', width: '100%', fontSize: '0.85rem' }}
              placeholder="Rechercher client, référence, collaborateur..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Période */}
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

          {/* Responsable / Collaborateur */}
          <div>
            <select
              className="table-input"
              style={{ width: '100%', fontSize: '0.85rem' }}
              value={selectedUserFilter}
              onChange={e => {
                setSelectedUserFilter(e.target.value);
                if (e.target.value !== 'ALL') {
                  setInspectedUserId(e.target.value);
                }
              }}
            >
              <option value="ALL">👤 Tous les collaborateurs ({users.length})</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>

          {/* Service / Pôle */}
          <div>
            <select
              className="table-input"
              style={{ width: '100%', fontSize: '0.85rem' }}
              value={selectedServiceFilter}
              onChange={e => setSelectedServiceFilter(e.target.value)}
            >
              <option value="ALL">🏢 Tous les services / pôles</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Périmètre Module */}
          <div>
            <select
              className="table-input"
              style={{ width: '100%', fontSize: '0.85rem', fontWeight: 600 }}
              value={selectedModuleScope}
              onChange={e => setSelectedModuleScope(e.target.value as ModuleScope)}
            >
              <option value="ALL">🌟 Synthèse 360° (Tous modules)</option>
              <option value="PRESTATIONS">💼 Commandes (11 colonnes)</option>
              <option value="DEVIS">📄 Devis Clients</option>
              <option value="FACTURES">🧾 Factures & Recouvrement</option>
              <option value="CAISSE">💰 Caisse & Dépenses</option>
              <option value="MAINTENANCE">🛠️ Maintenance & Tickets</option>
              <option value="STOCKS">📦 Stocks & Consommables</option>
              <option value="TIERS">👥 Tiers & Partenaires</option>
              <option value="COMMISSIONS">🏆 Commissions & Apporteurs</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── KPIS CONSOLIDÉS MULTI-MODULES (FILTRÉS SELON ACCÈS MODULES) ──────────────────── */}
      {(() => {
        const targetUserObj = selectedUserFilter !== 'ALL' ? users.find(u => u.id === selectedUserFilter) : null;
        return (
          <div className="widgets-grid" style={{ marginBottom: '20px' }}>
            {/* KPI 1 : Commandes Prestations */}
            {(selectedUserFilter === 'ALL' || !!targetUserObj?.crmPrestationsEnabled) && (
              <div className="widget-card" style={{ borderLeft: '4px solid #10B981', cursor: 'pointer' }} onClick={() => setSelectedModuleScope('PRESTATIONS')}>
                <div className="widget-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
                  <ShoppingBag size={24} />
                </div>
                <div className="widget-content">
                  <div className="widget-label">COMMANDES VENTES</div>
                  <div className="widget-value">{totalCommandesVente.toLocaleString('fr-FR')} F</div>
                  <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, marginTop: '2px' }}>
                    Marge: {totalMargeInterne.toLocaleString('fr-FR')} F ({filteredPrestations.length} cmds)
                  </div>
                </div>
              </div>
            )}

            {/* KPI 2 : Devis Clients */}
            <div className="widget-card" style={{ borderLeft: '4px solid #3B82F6', cursor: 'pointer' }} onClick={() => setSelectedModuleScope('DEVIS')}>
              <div className="widget-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#2563EB' }}>
                <FileText size={24} />
              </div>
              <div className="widget-content">
                <div className="widget-label">DEVIS ACCEPTÉS</div>
                <div className="widget-value">{acceptedQuotesValue.toLocaleString('fr-FR')} F</div>
                <div style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
                  {acceptedQuotes.length}/{totalQuotes} devis ({quotesAcceptanceRate}%)
                </div>
              </div>
            </div>

            {/* KPI 3 : Facturation & Encaissements */}
            {(selectedUserFilter === 'ALL' || !!targetUserObj?.crmFacturationEnabled) && (
              <div className="widget-card" style={{ borderLeft: '4px solid #0284C7', cursor: 'pointer' }} onClick={() => navigate('/factures')}>
                <div className="widget-icon" style={{ background: 'rgba(2, 132, 199, 0.1)', color: '#0284C7' }}>
                  <Receipt size={24} />
                </div>
                <div className="widget-content">
                  <div className="widget-label">SUIVI DES FACTURES</div>
                  <div className="widget-value">{totalFactureMontant.toLocaleString('fr-FR')} F</div>
                  <div style={{ fontSize: '0.75rem', color: '#0284C7', fontWeight: 600, marginTop: '2px' }}>
                    Encaissé: {totalFacturePaye.toLocaleString('fr-FR')} F {facturesEnRetardCount > 0 ? `• ${facturesEnRetardCount} retard` : ''}
                  </div>
                </div>
              </div>
            )}

            {/* KPI 4 : Caisse Trésorerie */}
            {(selectedUserFilter === 'ALL' || !!targetUserObj?.crmCaisseEnabled) && (
              <div className="widget-card" style={{ borderLeft: '4px solid #EF4444', cursor: 'pointer' }} onClick={() => setSelectedModuleScope('CAISSE')}>
                <div className="widget-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#DC2626' }}>
                  <Wallet size={24} />
                </div>
                <div className="widget-content">
                  <div className="widget-label">FLUX CAISSE NET</div>
                  <div className="widget-value" style={{ color: soldeNetCaisse >= 0 ? '#059669' : '#DC2626' }}>
                    {soldeNetCaisse.toLocaleString('fr-FR')} F
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    Entrées: {totalCaisseEntrees.toLocaleString('fr-FR')} | Sorties: {totalCaisseSorties.toLocaleString('fr-FR')}
                  </div>
                </div>
              </div>
            )}

            {/* KPI 5 : Maintenance */}
            {(selectedUserFilter === 'ALL' || !!targetUserObj?.crmMaintenanceEnabled) && (
              <div className="widget-card" style={{ borderLeft: '4px solid #F59E0B', cursor: 'pointer' }} onClick={() => setSelectedModuleScope('MAINTENANCE')}>
                <div className="widget-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#D97706' }}>
                  <Wrench size={24} />
                </div>
                <div className="widget-content">
                  <div className="widget-label">MAINTENANCE & PANNES</div>
                  <div className="widget-value">{totalTickets} tickets</div>
                  <div style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 600, marginTop: '2px' }}>
                    {ticketsUrgents} urgents • Facturé: {totalFacturationMaintenance.toLocaleString('fr-FR')} F
                  </div>
                </div>
              </div>
            )}

            {/* KPI 6 : Commissions */}
            {(selectedUserFilter === 'ALL' || !!targetUserObj?.crmCommissionsEnabled) && (
              <div className="widget-card" style={{ borderLeft: '4px solid #8B5CF6', cursor: 'pointer' }} onClick={() => setSelectedModuleScope('COMMISSIONS')}>
                <div className="widget-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' }}>
                  <Award size={24} />
                </div>
                <div className="widget-content">
                  <div className="widget-label">COMMISSIONS & PRIMES</div>
                  <div className="widget-value">{totalCommissionsMontant.toLocaleString('fr-FR')} F</div>
                  <div style={{ fontSize: '0.75rem', color: '#8B5CF6', fontWeight: 600, marginTop: '2px' }}>
                    Payé: {totalCommissionsPayees.toLocaleString('fr-FR')} F • En attente: {totalCommissionsEnAttente.toLocaleString('fr-FR')} F
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── ONGLETS DE VUE DU DASHBOARD ───────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--color-border)', paddingBottom: '10px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'OVERVIEW' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('OVERVIEW')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 16px' }}
        >
          <BarChart3 size={16} />
          <span>Vue Globale & Diagrammes</span>
        </button>

        <button
          className={`btn ${activeTab === 'USERS_ANALYTICS' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('USERS_ANALYTICS')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 16px' }}
        >
          <Users size={16} />
          <span>Supervision par Collaborateur ({userMultiModuleSummaries.length})</span>
        </button>

        <button
          className={`btn ${activeTab === 'DETAILED_TABLES' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('DETAILED_TABLES')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 16px' }}
        >
          <Layers size={16} />
          <span>Opérations Détaillées</span>
        </button>
      </div>

      {/* ─── FOCUS COLLABORATEUR INSPECTÉ ───────────────────────── */}
      {inspectedUserSummary && (
        <div style={{ marginBottom: '24px' }}>
          <UserMultiModuleSupervisionCard
            summary={inspectedUserSummary}
            onInspect={() => {}}
          />
        </div>
      )}

      {/* ─── 1. VUE GLOBALE & DIAGRAMMES ────────────────────────── */}
      {activeTab === 'OVERVIEW' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Grille Diagrammes 1 & 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
            {/* Bar Comparison Chart */}
            <div className="card" style={{ padding: '20px' }}>
              <BarComparisonChart
                items={barComparisonItems}
                title={
                  selectedModuleScope === 'PRESTATIONS' ? 'Commandes & Marges par Responsable' :
                  selectedModuleScope === 'CAISSE' ? 'Mouvements Caisse par Initiateur' :
                  selectedModuleScope === 'MAINTENANCE' ? 'Interventions par Technicien / Auteur' :
                  'Performance Multi-Modules par Collaborateur'
                }
                subTitle="Volume généré vs montant finalisé (cliquez pour inspecter)"
                primaryLabel={selectedModuleScope === 'CAISSE' ? 'Entrées' : 'Volume Total'}
                secondaryLabel={selectedModuleScope === 'CAISSE' ? 'Sorties' : selectedModuleScope === 'PRESTATIONS' ? 'Bénéfice Net' : 'Validé'}
                primaryColor={selectedModuleScope === 'CAISSE' ? '#10B981' : '#3B82F6'}
                secondaryColor={selectedModuleScope === 'CAISSE' ? '#EF4444' : '#10B981'}
                selectedUserId={inspectedUserId || undefined}
                onSelectUser={(uid) => setInspectedUserId(uid === inspectedUserId ? null : uid)}
              />
            </div>

            {/* Donut Chart */}
            <div className="card" style={{ padding: '20px' }}>
              <DonutChart
                data={donutScopeData}
                title={
                  selectedModuleScope === 'PRESTATIONS' ? 'Répartition Statuts des Commandes' :
                  selectedModuleScope === 'CAISSE' ? 'Flux de Trésorerie' :
                  selectedModuleScope === 'MAINTENANCE' ? 'Niveau d\'Urgence des Tickets' :
                  'Répartition des Activités CRM Consolidées'
                }
                subTitle="Distribution proportionnelle des opérations"
                centerLabel="Total flux"
                centerValue={donutScopeData.reduce((acc, d) => acc + d.value, 0)}
                size={180}
                strokeWidth={24}
              />
            </div>
          </div>

          {/* Synthèse additionnelle : Stocks & Commissions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Carte Stocks & Consommables */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={20} color="#6366F1" />
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Inventaire & Stocks Métier</h4>
                </div>
                <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '4px 8px' }} onClick={() => navigate('/crm/stocks')}>
                  Consulter →
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div style={{ padding: '10px', borderRadius: '8px', background: 'var(--color-surface-alt)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Articles en Stock</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text)', marginTop: '2px' }}>{totalArticlesStock}</div>
                  <div style={{ fontSize: '0.7rem', color: stockAlertesCount > 0 ? '#DC2626' : '#059669', fontWeight: 600 }}>
                    {stockAlertesCount} article(s) en alerte
                  </div>
                </div>

                <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.08)' }}>
                  <div style={{ fontSize: '0.7rem', color: '#4F46E5', textTransform: 'uppercase' }}>Valorisation Vente</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#4F46E5', marginTop: '2px' }}>
                    {valorisationStockVente.toLocaleString('fr-FR')} F
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#4F46E5' }}>
                    Achat: {valorisationStockAchat.toLocaleString('fr-FR')} F
                  </div>
                </div>
              </div>
            </div>

            {/* Carte Commissions & Apporteurs */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={20} color="#D97706" />
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Commissions & Rétributions</h4>
                </div>
                <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '4px 8px' }} onClick={() => navigate('/crm/commissions')}>
                  Consulter →
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(217, 119, 6, 0.08)' }}>
                  <div style={{ fontSize: '0.7rem', color: '#B45309', textTransform: 'uppercase' }}>Commissions Dues</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#B45309', marginTop: '2px' }}>
                    {totalCommissionsMontant.toLocaleString('fr-FR')} F
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#B45309' }}>{filteredCommissions.length} rétribution(s)</div>
                </div>

                <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.08)' }}>
                  <div style={{ fontSize: '0.7rem', color: '#059669', textTransform: 'uppercase' }}>Déjà Payées</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                    {totalCommissionsPayees.toLocaleString('fr-FR')} F
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#DC2626' }}>
                    {totalCommissionsEnAttente.toLocaleString('fr-FR')} F en attente
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 2. SUPERVISION PAR COLLABORATEUR (MULTI-MODULE 360°) ─── */}
      {activeTab === 'USERS_ANALYTICS' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {userMultiModuleSummaries.map(summary => (
            <UserMultiModuleSupervisionCard
              key={summary.user.id}
              summary={summary}
              onInspect={() => setInspectedUserId(summary.user.id === inspectedUserId ? null : summary.user.id)}
            />
          ))}

          {userMultiModuleSummaries.length === 0 && (
            <div className="card" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Aucun collaborateur ne correspond aux critères de filtre.
            </div>
          )}
        </div>
      )}

      {/* ─── 3. TABLEAUX D'OPÉRATIONS DÉTAILLÉES ─────────────────── */}
      {activeTab === 'DETAILED_TABLES' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0 }}>Opérations Commandes & Prestations ({filteredPrestations.length})</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                Grille financière rigoureuse à 11 colonnes.
              </p>
            </div>
            <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={() => navigate('/crm/prestations')}>
              + Ouvrir le module Commandes
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table responsive-table">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Client</th>
                  <th>Désignation</th>
                  <th>Resp. / Commercial</th>
                  <th style={{ textAlign: 'right' }}>Prix Vente</th>
                  <th style={{ textAlign: 'right' }}>Marge Interne</th>
                  <th style={{ textAlign: 'right' }}>Bénéfice Net</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrestations.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/crm/prestations')}>
                    <td data-label="Réf."><strong style={{ color: 'var(--color-primary)' }}>{p.reference}</strong></td>
                    <td data-label="Client">{p.client_nom}</td>
                    <td data-label="Désignation">{p.designation}</td>
                    <td data-label="Responsable">{p.resp_service_nom || p.responsable_service_nom || p.commercial_nom || p.cree_par_nom || 'Non assigné'}</td>
                    <td data-label="Prix Vente" style={{ textAlign: 'right', fontWeight: 700 }}>
                      {(p.prix_client_final || p.montant_total_vente || 0).toLocaleString('fr-FR')} F
                    </td>
                    <td data-label="Marge" style={{ textAlign: 'right', color: '#2563EB', fontWeight: 600 }}>
                      {(p.marge_interne || 0).toLocaleString('fr-FR')} F
                    </td>
                    <td data-label="Bénéfice Net" style={{ textAlign: 'right', color: '#059669', fontWeight: 700 }}>
                      {(p.benefice_net || p.benefice_reel || 0).toLocaleString('fr-FR')} F
                    </td>
                    <td data-label="Statut">
                      <span className="badge-status" style={{ background: p.statut === 'PAYEE' ? '#D1FAE5' : '#DBEAFE', color: p.statut === 'PAYEE' ? '#059669' : '#1D4ED8' }}>
                        {p.statut}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredPrestations.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>Aucune commande enregistrée pour ces critères.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
