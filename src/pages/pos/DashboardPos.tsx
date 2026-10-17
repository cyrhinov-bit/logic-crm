import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { 
  Package, Warehouse, TrendingUp, AlertTriangle, DollarSign, RotateCcw, 
  ShoppingBag, RefreshCw, CloudUpload, Calendar, ArrowUpRight, ArrowDownRight, 
  BarChart2, Activity, Zap, PackageCheck, PackageOpen, Boxes, ShoppingCart, Truck
} from 'lucide-react';
import { todayLocalKey, toLocalDayKey } from '../../lib/dates';
import { Button } from '../../components/ui/Button';
import { PosEvolutionChart, type DataPoint } from '../../components/pos/PosEvolutionChart';
import { PosHourlyChart, type HourlyDataPoint } from '../../components/pos/PosHourlyChart';
import { PosFamilyDistributionChart, type FamilyBreakdown, type PaymentBreakdown } from '../../components/pos/PosFamilyDistributionChart';
import { toast } from 'react-hot-toast';

type PeriodType = 'today' | '7d' | '30d' | '12m';

// G2 : parse une clé jour locale (YYYY-MM-DD) en Date locale — new Date('YYYY-MM-DD')
// parse en UTC et décale le libellé autour de minuit.
function parseDayKey(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

export default function DashboardPos() {
  const { posProducts, posTransactions, posCashSessions, posReturns, posStockEntries, posStockMovements, refreshData, reconcilePosData } = useAppContext();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [period, setPeriod] = useState<PeriodType>('today');
  const navigate = useNavigate();

  useEffect(() => {
    refreshData().catch(() => {});
  }, [refreshData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
      toast.success('Données synchronisées avec succès');
    } catch {
      toast.error('Erreur lors de la synchronisation');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleReconcile = async () => {
    setIsReconciling(true);
    const toastId = toast.loading('Réconciliation globale avec le serveur Cloud...');
    try {
      const res = await reconcilePosData({ force: true });
      await refreshData(true);
      if (res?.success) {
        toast.success(res.message || 'Synchronisation d\'urgence réussie !', { id: toastId, duration: 6000 });
      } else {
        toast.error(res?.message || 'Erreur lors de la synchronisation', { id: toastId, duration: 6000 });
      }
    } catch (e: any) {
      toast.error('Erreur : ' + (e?.message || e), { id: toastId });
    } finally {
      setIsReconciling(false);
    }
  };

  // 1. Stock global & alertes
  const totalProducts = posProducts.length;
  const physicalProducts = posProducts.filter(p => p.family !== 'Service');
  const totalPurchaseStockValue = physicalProducts.reduce((sum, p) => sum + (p.purchasePrice || 0) * (p.quantity || 0), 0);
  const totalSellingStockValue = physicalProducts.reduce((sum, p) => sum + (p.sellingPrice || 0) * (p.quantity || 0), 0);
  const globalStockMargin = totalSellingStockValue - totalPurchaseStockValue;
  const globalStockMarginRate = totalSellingStockValue > 0 ? ((globalStockMargin / totalSellingStockValue) * 100).toFixed(1) : '0';
  const lowStockProducts = physicalProducts.filter(p => p.quantity <= p.minStock && p.minStock > 0);

  // 2. Session caisse du jour
  const today = todayLocalKey();
  const openSession = posCashSessions.find(s => s.status === 'Ouverte' && toLocalDayKey(s.openedAt) === today);
  const staleOpenSession = posCashSessions.find(s => s.status === 'Ouverte' && toLocalDayKey(s.openedAt) < today);

  // Map rapide des prix d'achat par produit pour calculer la marge exacte
  const productPurchasePriceMap = useMemo(() => {
    const map = new Map<string, number>();
    posProducts.forEach(p => {
      map.set(p.id, p.purchasePrice || 0);
    });
    return map;
  }, [posProducts]);

  // 3. Calculs d'évolution selon la période sélectionnée
  const { evolutionData, currentTotalRevenue, currentTotalMargin, currentTicketCount, avgBasket, growthRate, previousRevenue, periodRefunds } = useMemo(() => {
    // G5 : les compléments d'échange (CMP-) sont des encaissements de soulte, pas du
    // CA plein (les articles échangés sont déjà comptés) → neutralisés ici.
    const validTransactions = posTransactions.filter(t => t.status === 'Validée' && !t.transactionNumber?.startsWith('CMP-'));
    const now = new Date();

    const calculateMarginForTx = (tx: typeof posTransactions[0]) => {
      let margin = 0;
      tx.lines.forEach(l => {
        // Coût figé à la vente si disponible, sinon prix actuel (lignes legacy)
        const purchasePrice = (l.costPrice !== undefined && l.costPrice !== null)
          ? l.costPrice
          : (l.productId ? (productPurchasePriceMap.get(l.productId) || 0) : 0);
        const lineCost = purchasePrice * l.quantity;
        margin += (l.total - lineCost);
      });
      return margin;
    };

    let dataPoints: DataPoint[] = [];
    let curRev = 0;
    let curMargin = 0;
    let curTickets = 0;
    let prevRev = 0;
    let prevRef = 0;
    const prevRefundsOf = (pred: (r: (typeof posReturns)[number]) => boolean) =>
      posReturns.filter(r => r.status === 'Traité' && pred(r)).reduce((s, r) => s + (r.totalRefund || 0), 0);

    if (period === 'today') {
      // Tranche horaire (8h à 20h)
      for (let hour = 8; hour <= 20; hour++) {
        const hourLabel = `${hour.toString().padStart(2, '0')}h`;
        const txsInHour = validTransactions.filter(t => {
          if (toLocalDayKey(t.date) !== today) return false;
          const txDate = new Date(t.date);
          return txDate.getHours() === hour;
        });

        const rev = txsInHour.reduce((s, t) => s + t.total, 0);
        const margin = txsInHour.reduce((s, t) => s + calculateMarginForTx(t), 0);
        const count = txsInHour.length;

        curRev += rev;
        curMargin += margin;
        curTickets += count;

        dataPoints.push({
          label: hourLabel,
          subLabel: `Aujourd'hui à ${hourLabel}`,
          value1: rev,
          value2: margin,
          secondary: count
        });
      }

      // Comparaison avec hier (G2 : clé locale, pas UTC — sinon décalage autour de minuit)
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayKey = toLocalDayKey(yesterdayDate);
      prevRev = validTransactions
        .filter(t => toLocalDayKey(t.date) === yesterdayKey)
        .reduce((s, t) => s + t.total, 0);
      prevRef = prevRefundsOf(r => toLocalDayKey(r.date) === yesterdayKey);

    } else if (period === '7d') {
      // 7 derniers jours (G2 : clés locales)
      const days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        days.push(toLocalDayKey(d));
      }

      dataPoints = days.map(dayKey => {
        const dObj = parseDayKey(dayKey);
        const dayLabel = dObj.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
        const txs = validTransactions.filter(t => toLocalDayKey(t.date) === dayKey);
        const rev = txs.reduce((s, t) => s + t.total, 0);
        const margin = txs.reduce((s, t) => s + calculateMarginForTx(t), 0);
        const count = txs.length;

        curRev += rev;
        curMargin += margin;
        curTickets += count;

        return {
          label: dayLabel,
          subLabel: dObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
          dateKey: dayKey,
          value1: rev,
          value2: margin,
          secondary: count
        };
      });

      // 7 jours précédents pour la comparaison
      const prevDays: string[] = [];
      for (let i = 13; i >= 7; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        prevDays.push(toLocalDayKey(d));
      }
      prevRev = validTransactions
        .filter(t => prevDays.includes(toLocalDayKey(t.date)))
        .reduce((s, t) => s + t.total, 0);
      prevRef = prevRefundsOf(r => prevDays.includes(toLocalDayKey(r.date)));

    } else if (period === '30d') {
      // 30 derniers jours (G2 : clés locales)
      const days: string[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        days.push(toLocalDayKey(d));
      }

      dataPoints = days.map(dayKey => {
        const dObj = parseDayKey(dayKey);
        const dayLabel = `${dObj.getDate()}/${dObj.getMonth() + 1}`;
        const txs = validTransactions.filter(t => toLocalDayKey(t.date) === dayKey);
        const rev = txs.reduce((s, t) => s + t.total, 0);
        const margin = txs.reduce((s, t) => s + calculateMarginForTx(t), 0);
        const count = txs.length;

        curRev += rev;
        curMargin += margin;
        curTickets += count;

        return {
          label: dayLabel,
          subLabel: dObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
          dateKey: dayKey,
          value1: rev,
          value2: margin,
          secondary: count
        };
      });

      // 30 jours précédents
      const prevDays: string[] = [];
      for (let i = 59; i >= 30; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        prevDays.push(toLocalDayKey(d));
      }
      prevRev = validTransactions
        .filter(t => prevDays.includes(toLocalDayKey(t.date)))
        .reduce((s, t) => s + t.total, 0);
      prevRef = prevRefundsOf(r => prevDays.includes(toLocalDayKey(r.date)));

    } else if (period === '12m') {
      // 12 derniers mois
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthYear = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        const monthLabel = d.toLocaleDateString('fr-FR', { month: 'short' });

        const txs = validTransactions.filter(t => {
          const tMonth = t.date.substring(0, 7);
          return tMonth === monthYear;
        });

        const rev = txs.reduce((s, t) => s + t.total, 0);
        const margin = txs.reduce((s, t) => s + calculateMarginForTx(t), 0);
        const count = txs.length;

        curRev += rev;
        curMargin += margin;
        curTickets += count;

        dataPoints.push({
          label: monthLabel,
          subLabel: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
          dateKey: monthYear,
          value1: rev,
          value2: margin,
          secondary: count
        });
      }

      // Année précédente
      const prevYearMonth = `${now.getFullYear() - 1}`;
      prevRev = validTransactions
        .filter(t => t.date.startsWith(prevYearMonth))
        .reduce((s, t) => s + t.total, 0);
      prevRef = prevRefundsOf(r => r.date.startsWith(prevYearMonth));
    }

    // G1 : CA et marge NETS — déduire les remboursements Traités de la période
    // (revenus rendus - coûts réintégrés en stock).
    const periodKeys = new Set<string>(
      period === 'today' ? [today] : dataPoints.map(d => d.dateKey).filter(Boolean) as string[]
    );
    const periodReturnList = posReturns.filter(r => {
      if (r.status !== 'Traité') return false;
      const k = toLocalDayKey(r.date);
      return period === '12m' ? periodKeys.has(k.substring(0, 7)) : periodKeys.has(k);
    });
    const refundsTotal = periodReturnList.reduce((s, r) => s + (r.totalRefund || 0), 0);
    let refundsMargin = 0;
    for (const r of periodReturnList) {
      for (const l of (r.lines || [])) {
        const cost = l.productId ? (productPurchasePriceMap.get(l.productId) || 0) : 0;
        refundsMargin += (l.total || 0) - cost * (l.quantity || 0);
      }
    }

    const netCur = curRev - refundsTotal;
    const netPrev = prevRev - prevRef;
    const growth = netPrev > 0 ? (((netCur - netPrev) / netPrev) * 100).toFixed(1) : netCur > 0 ? '+100' : '0';
    const basket = curTickets > 0 ? Math.round(curRev / curTickets) : 0;

    return {
      evolutionData: dataPoints,
      currentTotalRevenue: netCur,
      currentTotalMargin: curMargin - refundsMargin,
      currentTicketCount: curTickets,
      avgBasket: basket,
      growthRate: growth,
      previousRevenue: netPrev,
      periodRefunds: refundsTotal
    };
  }, [posTransactions, posReturns, period, today, productPurchasePriceMap]);

  // 4. Distribution horaire pour la journée en cours
  const hourlyData: HourlyDataPoint[] = useMemo(() => {
    const validTransactions = posTransactions.filter(t => t.status === 'Validée');
    const result: HourlyDataPoint[] = [];

    for (let h = 8; h <= 20; h++) {
      const label = `${h.toString().padStart(2, '0')}h`;
      const txs = validTransactions.filter(t => {
        if (toLocalDayKey(t.date) !== today) return false;
        const txDate = new Date(t.date);
        return txDate.getHours() === h;
      });

      const rev = txs.reduce((s, t) => s + t.total, 0);
      result.push({
        hour: h,
        label,
        revenue: rev,
        count: txs.length
      });
    }
    return result;
  }, [posTransactions, today]);

  // 5. Répartition des familles et modes de paiement sur la période filtrée
  const { familyBreakdown, paymentBreakdown } = useMemo(() => {
    // G5 : compléments d'échange exclus (soulte, pas CA plein).
    const validTransactions = posTransactions.filter(t => t.status === 'Validée' && !t.transactionNumber?.startsWith('CMP-'));
    const selectedDateKeys = new Set(evolutionData.map(d => d.dateKey).filter(Boolean));

    const filteredTxs = period === 'today'
      ? validTransactions.filter(t => toLocalDayKey(t.date) === today)
      : validTransactions.filter(t => {
          if (period === '12m') {
            return selectedDateKeys.has(t.date.substring(0, 7));
          }
          return selectedDateKeys.has(toLocalDayKey(t.date));
        });

    // Familles
    let revLivres = 0;
    let qtyLivres = 0;
    let revFournitures = 0;
    let qtyFournitures = 0;
    filteredTxs.forEach(t => {
      t.lines.forEach(l => {
        const p = l.productId ? posProducts.find(prod => prod.id === l.productId) : undefined;
        const isLiv = (p && ((p.family && p.family.toLowerCase().startsWith('livre')) || !!(p.isbn && p.isbn.trim()))) ||
                      (l.description && l.description.toLowerCase().includes('livre'));

        if (isLiv) {
          revLivres += l.total;
          qtyLivres += l.quantity;
        } else {
          revFournitures += l.total;
          qtyFournitures += l.quantity;
        }
      });
    });

    const families: FamilyBreakdown[] = [
      { name: 'Fournitures & Papeterie', revenue: revFournitures, quantity: qtyFournitures, color: '#0D9488' },
      { name: 'Livres & Manuels', revenue: revLivres, quantity: qtyLivres, color: '#3B82F6' },
    ];

    // Modes de paiement — G3 : taxonomie unifiée (Mixte = espèces tiroir, cohérent
    // caisse) et jamais d'imputation par défaut (sans paiement → Autre).
    const paymentMap: Record<string, { amount: number; count: number; color: string }> = {
      'Espèces': { amount: 0, count: 0, color: '#10B981' },
      'Wave / Mobile Money': { amount: 0, count: 0, color: '#06B6D4' },
      'Carte Bancaire': { amount: 0, count: 0, color: '#6366F1' },
      'Autre': { amount: 0, count: 0, color: '#94A3B8' }
    };

    filteredTxs.forEach(t => {
      if (t.payments && t.payments.length > 0) {
        t.payments.forEach(p => {
          const method = p.method || 'Autre';
          const low = method.toLowerCase();
          let key = 'Autre';
          if (low.includes('esp') || low.includes('mixte')) key = 'Espèces';
          else if (low.includes('wave') || low.includes('orange') || low.includes('moov') || low.includes('mtn') || low.includes('mobile') || low.includes('money')) key = 'Wave / Mobile Money';
          else if (low.includes('carte') || low.includes('visa') || low.includes('cb')) key = 'Carte Bancaire';

          if (!paymentMap[key]) {
            paymentMap[key] = { amount: 0, count: 0, color: '#64748B' };
          }
          paymentMap[key].amount += p.amount;
          paymentMap[key].count += 1;
        });
      } else {
        paymentMap['Autre'].amount += t.total;
        paymentMap['Autre'].count += 1;
      }
    });

    const payments: PaymentBreakdown[] = Object.entries(paymentMap)
      .filter(([_, v]) => v.amount > 0 || v.count > 0)
      .map(([method, v]) => ({
        method,
        amount: v.amount,
        count: v.count,
        color: v.color
      }));

    return { familyBreakdown: families, paymentBreakdown: payments };
  }, [posTransactions, posProducts, evolutionData, period, today]);

  // 6. KPIs Mouvements de Stock
  const stockKpis = useMemo(() => {
    // --- Snapshot actuel du stock (indépendant de la période) ---
    const physProd = posProducts.filter(p => p.family !== 'Service');
    const stockValAchat = physProd.reduce((s, p) => s + (p.purchasePrice || 0) * (p.quantity || 0), 0);
    const stockValVente = physProd.reduce((s, p) => s + (p.sellingPrice || 0) * (p.quantity || 0), 0);
    const stockBenefice = stockValVente - stockValAchat;
    const stockMarginRate = stockValVente > 0 ? ((stockBenefice / stockValVente) * 100).toFixed(1) : '0';
    const criticalProducts = physProd.filter(p => p.minStock > 0 && (p.quantity || 0) <= p.minStock);

    // --- Filtre de date unifié et robuste (aligné sur evolutionData et toLocalDayKey) ---
    const selectedDateKeys = new Set(evolutionData.map(d => d.dateKey).filter(Boolean));
    const isDateInPeriod = (dateStr?: string): boolean => {
      if (!dateStr) return false;
      if (period === 'today') {
        return toLocalDayKey(dateStr) === today;
      }
      if (period === '12m') {
        return selectedDateKeys.has(dateStr.substring(0, 7));
      }
      return selectedDateKeys.has(toLocalDayKey(dateStr));
    };

    // --- Entrées de stock validées ---
    const validEntries = posStockEntries.filter(e => e.status === 'Validé' && isDateInPeriod(e.date));
    const entreesValeur = validEntries.reduce((s, e) => s + (e.totalAmount || 0), 0);
    const entreesCount = validEntries.length;

    // --- Mouvements de stock explicites dans la période ---
    const explicitMovements = posStockMovements.filter(m => isDateInPeriod(m.date));
    const explicitSaleRefs = new Set(explicitMovements.filter(m => m.type === 'Vente').map(m => m.reference).filter(Boolean));
    const explicitApproRefs = new Set(explicitMovements.filter(m => m.type === 'Approvisionnement').map(m => m.reference).filter(Boolean));
    const explicitReturnRefs = new Set(explicitMovements.filter(m => m.type === 'Retour').map(m => m.reference).filter(Boolean));

    // --- Ventes dans la période (consolidation automatique si non doublonnées) ---
    // G5 : compléments d'échange (CMP-) exclus : soulte déjà comptée, pas des lignes vendues.
    const validTransactions = posTransactions.filter(t => t.status === 'Validée' && isDateInPeriod(t.date) && !t.transactionNumber?.startsWith('CMP-'));
    let ventesCount = explicitMovements.filter(m => m.type === 'Vente').length;
    validTransactions.forEach(t => {
      if (!explicitSaleRefs.has(t.transactionNumber)) {
        const physicalLines = t.lines.filter(l => {
          const prod = l.productId ? posProducts.find(p => p.id === l.productId) : undefined;
          return prod?.family !== 'Service';
        });
        ventesCount += physicalLines.length > 0 ? physicalLines.length : (t.lines.length || 1);
      }
    });

    // --- Approvisionnements (consolidation) ---
    let approCount = explicitMovements.filter(m => m.type === 'Approvisionnement').length;
    validEntries.forEach(e => {
      if (!explicitApproRefs.has(e.reference)) {
        approCount += e.lines?.length || 1;
      }
    });

    // --- Retours (consolidation) ---
    let retourCount = explicitMovements.filter(m => m.type === 'Retour').length;
    (posReturns || []).filter(r => r.status !== 'Annulé' && isDateInPeriod(r.date)).forEach(r => {
      if (!explicitReturnRefs.has(r.returnNumber)) {
        retourCount += r.lines?.length || 1;
      }
    });

    // --- Ajustements & Inventaires ---
    const ajustCount = explicitMovements.filter(m => m.type === 'Ajustement Manuel' || m.type === 'Inventaire').length;

    const mouvementsTotal = ventesCount + approCount + retourCount + ajustCount;

    return {
      stockValAchat,
      stockValVente,
      stockBenefice,
      stockMarginRate,
      criticalCount: criticalProducts.length,
      entreesValeur,
      entreesCount,
      mouvementsTotal,
      mouvementsVente: ventesCount,
      mouvementsAppro: approCount,
      mouvementsRetour: retourCount,
      mouvementsAjust: ajustCount,
    };
  }, [posProducts, posStockEntries, posStockMovements, posTransactions, posReturns, period, today, evolutionData]);

  const periodLabels: Record<PeriodType, string> = {
    'today': "Aujourd'hui",
    '7d': '7 Derniers Jours',
    '30d': '30 Derniers Jours',
    '12m': '12 Derniers Mois'
  };

  const isPositiveGrowth = Number(growthRate) >= 0;

  return (
    <div className="pos-page" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Barre supérieure : Titre, Synchronisation et Sélecteur de Période */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#0F172A' }}>Tableau de Bord Administrateur POS</h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted, #64748B)', margin: '4px 0 0' }}>
            Suivi des ventes, marges, affluence horaire et diagrammes d'évolution en temps réel.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Sélecteur de période interactif */}
          <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '4px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
            {(['today', '7d', '30d', '12m'] as PeriodType[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  background: period === p ? 'white' : 'transparent',
                  color: period === p ? 'var(--color-primary, #0D9488)' : '#64748B',
                  boxShadow: period === p ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>

          <Button 
            variant="primary" 
            icon={<CloudUpload size={16} className={isReconciling ? "animate-pulse" : ""} />}
            onClick={handleReconcile}
            disabled={isReconciling}
          >
            {isReconciling ? 'Rapprochement...' : 'Forcer Réconciliation Cloud'}
          </Button>
          <Button 
            variant="secondary" 
            icon={<RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Actualisation...' : 'Actualiser'}
          </Button>
        </div>
      </div>
      {/* Styles interactifs et animations pour les cartes KPI */}
      <style>{`
        .pos-kpi-card {
          border-radius: var(--radius-lg, 12px);
          padding: 18px 20px;
          border-width: 1px;
          border-style: solid;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.22s ease;
          cursor: default;
          position: relative;
          overflow: hidden;
        }
        .pos-kpi-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 22px -6px rgba(0, 0, 0, 0.08), 0 4px 8px -2px rgba(0, 0, 0, 0.04);
        }
        .pos-kpi-card .kpi-icon-box {
          transition: transform 0.22s ease;
          border-radius: 8px;
          padding: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .pos-kpi-card:hover .kpi-icon-box {
          transform: scale(1.12) rotate(2deg);
        }
      `}</style>

      {/* Cartes de synthèse dynamique selon la période choisie */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {/* CA Période */}
        <div 
          className="pos-kpi-card"
          style={{ 
            background: 'linear-gradient(135deg, #ECFDF5 0%, #FFFFFF 100%)', 
            borderColor: '#A7F3D0' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#047857' }}>
                CA RÉALISÉ NET ({periodLabels[period].toUpperCase()})
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#064E3B', marginTop: '4px' }}>
                {currentTotalRevenue.toLocaleString('fr-FR')} FCFA
              </div>
              <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                Période précédente : {previousRevenue.toLocaleString('fr-FR')} FCFA
                {periodRefunds > 0 && <> • retours déduits : −{periodRefunds.toLocaleString('fr-FR')} FCFA</>}
              </div>
            </div>
            <div className="kpi-icon-box" style={{ background: '#D1FAE5' }}>
              <TrendingUp size={22} color="#059669" />
            </div>
          </div>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
            <span style={{ 
              color: isPositiveGrowth ? '#059669' : '#DC2626', 
              display: 'inline-flex', 
              alignItems: 'center',
              backgroundColor: isPositiveGrowth ? '#D1FAE5' : '#FEE2E2',
              padding: '2px 6px',
              borderRadius: '4px'
            }}>
              {isPositiveGrowth ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {isPositiveGrowth ? `+${growthRate}%` : `${growthRate}%`}
            </span>
            <span style={{ color: '#6B7280' }}>vs période précédente</span>
          </div>
        </div>

        {/* Marge Brute Période */}
        <div 
          className="pos-kpi-card"
          style={{ 
            background: 'linear-gradient(135deg, #F0FDFA 0%, #FFFFFF 100%)', 
            borderColor: '#99F6E4' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F766E' }}>
                MARGE BRUTE ESTIMÉE
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#134E4A', marginTop: '4px' }}>
                {currentTotalMargin.toLocaleString('fr-FR')} FCFA
              </div>
            </div>
            <div className="kpi-icon-box" style={{ background: '#CCFBF1' }}>
              <DollarSign size={22} color="#0D9488" />
            </div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748B' }}>
            Taux de marge moyen : <strong style={{ color: '#0F766E' }}>{currentTotalRevenue > 0 ? ((currentTotalMargin / currentTotalRevenue) * 100).toFixed(1) : 0}%</strong>
          </div>
        </div>

        {/* Volume Tickets */}
        <div 
          className="pos-kpi-card"
          style={{ 
            background: 'linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 100%)', 
            borderColor: '#BFDBFE' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#1D4ED8' }}>
                TRANSACTIONS / TICKETS
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#1E3A8A', marginTop: '4px' }}>
                {currentTicketCount}
              </div>
            </div>
            <div className="kpi-icon-box" style={{ background: '#DBEAFE' }}>
              <Activity size={22} color="#2563EB" />
            </div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748B' }}>
            Passages en caisse enregistrés
          </div>
        </div>

        {/* Panier Moyen */}
        <div 
          className="pos-kpi-card"
          style={{ 
            background: 'linear-gradient(135deg, #F5F3FF 0%, #FFFFFF 100%)', 
            borderColor: '#DDD6FE' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6D28D9' }}>
                PANIER MOYEN
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#4C1D95', marginTop: '4px' }}>
                {avgBasket.toLocaleString('fr-FR')} FCFA
              </div>
            </div>
            <div className="kpi-icon-box" style={{ background: '#EDE9FE' }}>
              <Zap size={22} color="#7C3AED" />
            </div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748B' }}>
            Moyenne dépensée par client
          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          📦 SECTION : KPIs MOUVEMENTS DE STOCK
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div>
        {/* Titre de section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ background: '#FFF7ED', borderRadius: '8px', padding: '6px 8px' }}>
            <Boxes size={18} color="#EA580C" />
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Gestion & Mouvements du Stock</h2>
            <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>Valorisation instantanée du stock physique + flux sur la période sélectionnée</p>
          </div>
        </div>

        {/* Rangée 1 : Snapshot du stock actuel (4 cartes) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>

          {/* Valeur Achat Stock */}
          <div 
            className="pos-kpi-card"
            style={{ 
              background: 'linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 100%)', 
              borderColor: '#FED7AA' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#C2410C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valeur Achat Stock</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#7C2D12', marginTop: '4px' }}>
                  {stockKpis.stockValAchat.toLocaleString('fr-FR')} FCFA
                </div>
              </div>
              <div className="kpi-icon-box" style={{ background: '#FFEDD5' }}>
                <PackageOpen size={20} color="#EA580C" />
              </div>
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#78716C' }}>
              Coût d'acquisition du stock actuel
            </div>
          </div>

          {/* Valeur Vente Estimée */}
          <div 
            className="pos-kpi-card"
            style={{ 
              background: 'linear-gradient(135deg, #F0F9FF 0%, #FFFFFF 100%)', 
              borderColor: '#BAE6FD' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valeur Vente Estimée</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#0C4A6E', marginTop: '4px' }}>
                  {stockKpis.stockValVente.toLocaleString('fr-FR')} FCFA
                </div>
              </div>
              <div className="kpi-icon-box" style={{ background: '#E0F2FE' }}>
                <ShoppingCart size={20} color="#0284C7" />
              </div>
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748B' }}>
              Potentiel de CA si tout est vendu
            </div>
          </div>

          {/* Bénéfice Potentiel */}
          <div 
            className="pos-kpi-card"
            style={{ 
              background: 'linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%)', 
              borderColor: '#BBF7D0' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bénéfice Potentiel</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#14532D', marginTop: '4px' }}>
                  {stockKpis.stockBenefice.toLocaleString('fr-FR')} FCFA
                </div>
              </div>
              <div className="kpi-icon-box" style={{ background: '#DCFCE7' }}>
                <TrendingUp size={20} color="#16A34A" />
              </div>
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748B' }}>
              Marge brute potentielle : <strong style={{ color: '#15803D' }}>{stockKpis.stockMarginRate}%</strong>
            </div>
          </div>

          {/* Produits en Stock Critique */}
          <div 
            className="pos-kpi-card"
            style={{ 
              background: stockKpis.criticalCount > 0 
                ? 'linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 100%)' 
                : 'linear-gradient(135deg, #ECFDF5 0%, #FFFFFF 100%)', 
              borderColor: stockKpis.criticalCount > 0 ? '#FECACA' : '#A7F3D0' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ 
                  fontSize: '11px', 
                  fontWeight: 600, 
                  color: stockKpis.criticalCount > 0 ? '#B91C1C' : '#047857', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.04em' 
                }}>
                  Stock Critique
                </div>
                <div style={{ 
                  fontSize: '20px', 
                  fontWeight: 800, 
                  color: stockKpis.criticalCount > 0 ? '#991B1B' : '#064E3B', 
                  marginTop: '4px' 
                }}>
                  {stockKpis.criticalCount} produit{stockKpis.criticalCount !== 1 ? 's' : ''}
                </div>
              </div>
              <div 
                className="kpi-icon-box" 
                style={{ background: stockKpis.criticalCount > 0 ? '#FEE2E2' : '#D1FAE5' }}
              >
                <AlertTriangle size={20} color={stockKpis.criticalCount > 0 ? '#DC2626' : '#10B981'} />
              </div>
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: stockKpis.criticalCount > 0 ? '#991B1B' : '#065F46' }}>
              {stockKpis.criticalCount > 0 ? 'En-dessous du stock minimum' : 'Tous les stocks sont à un niveau optimal'}
            </div>
          </div>
        </div>

        {/* Rangée 2 : Flux sur la période (2 cartes) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>

          {/* Entrées de stock sur la période */}
          <div 
            className="pos-kpi-card"
            style={{ 
              background: 'linear-gradient(135deg, #EEF2FF 0%, #FFFFFF 100%)', 
              borderColor: '#C7D2FE' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#4338CA', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Entrées de Stock ({periodLabels[period]})
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#312E81', marginTop: '4px' }}>
                  {stockKpis.entreesValeur.toLocaleString('fr-FR')} FCFA
                </div>
              </div>
              <div className="kpi-icon-box" style={{ background: '#E0E7FF' }}>
                <Truck size={20} color="#4F46E5" />
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              <strong style={{ color: '#312E81' }}>{stockKpis.entreesCount}</strong> bon{stockKpis.entreesCount !== 1 ? 's' : ''} d'entrée validé{stockKpis.entreesCount !== 1 ? 's' : ''} sur la période
            </div>
          </div>

          {/* Mouvements de stock sur la période */}
          <div 
            className="pos-kpi-card"
            style={{ 
              background: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)', 
              borderColor: '#CBD5E1' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Mouvements de Stock ({periodLabels[period]})
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {stockKpis.mouvementsTotal} mouvement{stockKpis.mouvementsTotal !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="kpi-icon-box" style={{ background: '#E2E8F0' }}>
                <PackageCheck size={20} color="#334155" />
              </div>
            </div>
            {/* Détail par type */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {stockKpis.mouvementsVente > 0 && (
                <span style={{ fontSize: '11px', background: '#ECFDF5', color: '#059669', padding: '2px 8px', borderRadius: '99px', fontWeight: 600, border: '1px solid #A7F3D0' }}>
                  🛒 {stockKpis.mouvementsVente} vente{stockKpis.mouvementsVente !== 1 ? 's' : ''}
                </span>
              )}
              {stockKpis.mouvementsAppro > 0 && (
                <span style={{ fontSize: '11px', background: '#EFF6FF', color: '#2563EB', padding: '2px 8px', borderRadius: '99px', fontWeight: 600, border: '1px solid #BFDBFE' }}>
                  📦 {stockKpis.mouvementsAppro} appro
                </span>
              )}
              {stockKpis.mouvementsRetour > 0 && (
                <span style={{ fontSize: '11px', background: '#FFF7ED', color: '#EA580C', padding: '2px 8px', borderRadius: '99px', fontWeight: 600, border: '1px solid #FED7AA' }}>
                  ↩️ {stockKpis.mouvementsRetour} retour{stockKpis.mouvementsRetour !== 1 ? 's' : ''}
                </span>
              )}
              {stockKpis.mouvementsAjust > 0 && (
                <span style={{ fontSize: '11px', background: '#F5F3FF', color: '#7C3AED', padding: '2px 8px', borderRadius: '99px', fontWeight: 600, border: '1px solid #DDD6FE' }}>
                  🔧 {stockKpis.mouvementsAjust} ajust.
                </span>
              )}
              {stockKpis.mouvementsTotal === 0 && (
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>Aucun mouvement enregistré sur la période</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 📊 GRAPHIQUE ÉVOLUTIF PRINCIPAL : CA & MARGE */}
      <PosEvolutionChart
        data={evolutionData}
        title={`📈 Diagramme d'Évolution des Ventes & Marges (${periodLabels[period]})`}
        subtitle="Courbe de progression temporelle du Chiffre d'Affaires et de la Marge Brute générée"
        series1Name="Chiffre d'Affaires"
        series2Name="Marge Brute"
        color1="#0D9488"
        color2="#3B82F6"
        height={300}
      />

      {/* ⏰ GRAPHIQUES D'AFFLUENCE ET RÉPARTITIONS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
        <PosHourlyChart data={hourlyData} />
      </div>

      {/* 🍩 RÉPARTITION PAR FAMILLE ET MIX DE PAIEMENT */}
      <PosFamilyDistributionChart
        families={familyBreakdown}
        payments={paymentBreakdown}
        totalRevenue={currentTotalRevenue}
      />

      {/* BLOC ÉTAT SESSION DE CAISSE */}
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg, 12px)', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid var(--color-border, #E2E8F0)' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: '#0F172A' }}>Session Caisse du Jour</h3>
        {openSession ? (
          <div style={{ color: 'var(--color-success)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10B981' }} />
            Session ouverte aujourd'hui — Fond initial : {openSession.initialFund.toLocaleString('fr-FR')} FCFA
          </div>
        ) : staleOpenSession ? (
          <div>
            <div style={{ color: 'var(--color-warning-strong)', fontWeight: 600 }}>⚠️ Session antérieure du {new Date(staleOpenSession.openedAt).toLocaleDateString('fr-FR')} non clôturée</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Rendez-vous dans la Gestion de caisse pour la clôturer et ouvrir la caisse d'aujourd'hui.</div>
          </div>
        ) : (
          <div style={{ color: 'var(--color-text-muted)' }}>Aucune session ouverte pour aujourd'hui</div>
        )}
      </div>

      {/* LIENS VERS LES MODULES AVANCÉS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        {/* Lien vers module stock */}
        <div
          style={{
            background: 'white',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            border: '1px solid var(--color-border, #E2E8F0)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={() => navigate('/pos/stock')}
          onMouseOver={e => e.currentTarget.style.borderColor = '#F97316'}
          onMouseOut={e => e.currentTarget.style.borderColor = 'var(--color-border, #E2E8F0)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: '#FFF7ED', borderRadius: '10px', padding: '12px' }}>
              <Warehouse size={24} color="#F97316" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>Module Gestion du Stock</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Entrées, réapprovisionnements, inventaires et mouvements détaillés.</div>
            </div>
            <div style={{ marginLeft: 'auto', color: '#F97316', fontWeight: 700, fontSize: '14px' }}>
              Accéder →
            </div>
          </div>
        </div>

        {/* Lien vers module finance */}
        <div 
          style={{ 
            background: 'white', 
            borderRadius: 'var(--radius-lg, 12px)', 
            padding: '20px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', 
            border: '1px solid var(--color-border, #E2E8F0)', 
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }} 
          onClick={() => navigate('/pos/finance')}
          onMouseOver={e => e.currentTarget.style.borderColor = 'var(--color-primary, #0D9488)'}
          onMouseOut={e => e.currentTarget.style.borderColor = 'var(--color-border, #E2E8F0)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: 'var(--color-success-tint, #ECFDF5)', borderRadius: '10px', padding: '12px' }}>
              <DollarSign size={24} color="var(--color-success, #10B981)" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>Module Finance Avancé</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Mouvements financiers, rapprochement de caisse et rentabilité.</div>
            </div>
            <div style={{ marginLeft: 'auto', color: 'var(--color-primary, #0D9488)', fontWeight: 700, fontSize: '14px' }}>
              Accéder →
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
