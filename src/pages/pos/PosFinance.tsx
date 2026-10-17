import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { 
  TrendingUp, ShoppingCart, RotateCcw, Wallet, 
  Smartphone, Layers, ChevronDown, ChevronRight, DollarSign,
  Trash2, AlertTriangle, Calendar, X, Check, Printer, BookOpen, PenTool, RefreshCw
} from 'lucide-react';
import { todayLocalKey, toLocalDayKey } from '../../lib/dates';
import { toast } from 'react-hot-toast';
import { Button } from '../../components/ui/Button';

type Period = 'today' | '7days' | '30days' | 'custom';

export default function PosFinance() {
  const { 
    posTransactions, posCashSessions, posProducts, 
    posReturns, deletePosMovementsByDateRange, refreshData, users 
  } = useAppContext();
  const { currentUser } = useAuth();

  const [period, setPeriod] = useState<Period>('today');
  const [startDate, setStartDate] = useState(todayLocalKey());
  const [endDate, setEndDate] = useState(todayLocalKey());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    refreshData().catch(() => {});
  }, [refreshData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
      toast.success('Données financières actualisées');
    } catch {
      toast.error('Erreur de synchronisation');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Modal Purge Période
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeStartDate, setPurgeStartDate] = useState('2026-08-09');
  const [purgeEndDate, setPurgeEndDate] = useState('2026-08-31');
  const [isPurging, setIsPurging] = useState(false);
  const [confirmPurgeCheck, setConfirmPurgeCheck] = useState(false);

  const getDateRange = (): { start: string; end: string } => {
    const today = new Date();
    switch (period) {
      case 'today': return { start: todayLocalKey(), end: todayLocalKey() };
      case '7days': {
        const d = new Date(today); d.setDate(d.getDate() - 6);
        return { start: toLocalDayKey(d), end: todayLocalKey() };
      }
      case '30days': {
        const d = new Date(today); d.setDate(d.getDate() - 29);
        return { start: toLocalDayKey(d), end: todayLocalKey() };
      }
      case 'custom': return { start: startDate, end: endDate };
    }
  };

  const { start, end } = getDateRange();

  const validTx = posTransactions.filter(t => t.status === 'Validée');
  const activeReturns = posReturns.filter(r => r.status === 'Traité');

  const inRange = (dateStr: string) => toLocalDayKey(dateStr) >= start && toLocalDayKey(dateStr) <= end;

  const rangeValidTx = validTx.filter(t => inRange(t.date));
  const rangeReturns = activeReturns.filter(r => inRange(r.date));

  const totalRevenue = rangeValidTx.reduce((s, t) => s + t.total, 0);
  const totalReturns = rangeReturns.reduce((s, r) => s + r.totalRefund, 0);
  const totalReturnCount = rangeReturns.length;
  const netRevenue = totalRevenue - totalReturns;
  const totalTxCount = rangeValidTx.length;
  const avgBasket = totalTxCount > 0 ? Math.round(totalRevenue / totalTxCount) : 0;

  // F1 : répartition depuis les paiements embarqués des transactions (t.payments),
  // pas depuis le registre posPayments (alimenté seulement pour les nouvelles ventes).
  const rangePayments = rangeValidTx.flatMap(t => (t.payments || []).map(p => ({ ...p, transactionId: t.id })));
  const paymentTotals: Record<string, number> = { 'Espèces': 0, 'Mobile Money': 0, 'Mixte': 0 };
  rangePayments.forEach(p => {
    if (p.method === 'Espèces' || p.method === 'Mobile Money' || p.method === 'Mixte') {
      paymentTotals[p.method] = (paymentTotals[p.method] || 0) + p.amount;
    } else if (p.method) {
      // F3 : méthode inconnue/legacy — isolée au lieu d'être perdue.
      paymentTotals['Autres'] = (paymentTotals['Autres'] || 0) + p.amount;
    }
  });

  const isServiceProd = (p?: typeof posProducts[0], desc?: string) => 
    (p && (p.family === 'Service' || (p.reference && p.reference.startsWith('SRV-')))) ||
    (desc && (desc.toLowerCase().includes('photocopie') || desc.toLowerCase().includes('impression') || desc.toLowerCase().includes('scan') || desc.toLowerCase().includes('reliure') || desc.toLowerCase().includes('plastification')));

  const isLivreProd = (p?: typeof posProducts[0]) => 
    p && ((p.family && p.family.toLowerCase().startsWith('livre')) || !!(p.isbn && p.isbn.trim()));

  let rawLivresRev = 0;
  let rawFournituresRev = 0;

  // F2 : familles NETTES — les remboursements sont ventilés au prorata des lignes
  // (par famille produit) au lieu d'être imputés aux fournitures. Les ventes sans
  // lignes (données incomplètes) vont dans un bucket « Non ventilé » isolé.
  let unventilatedRev = 0;
  rangeValidTx.forEach(t => {
    const lines = t.lines || [];
    if (lines.length === 0) {
      unventilatedRev += t.total;
    } else {
      const linesGross = lines.reduce((s, l) => s + (l.total || 0), 0);
      const ratio = linesGross > 0 ? t.total / linesGross : 1;
      lines.forEach(l => {
        const p = l.productId ? posProducts.find(x => x.id === l.productId) : undefined;
        const lineNet = (l.total || 0) * ratio;
        if (isLivreProd(p)) {
          rawLivresRev += lineNet;
        } else {
          rawFournituresRev += lineNet;
        }
      });
    }
  });

  let refundLivres = 0;
  let refundFournitures = 0;
  rangeReturns.forEach(r => {
    (r.lines || []).forEach(l => {
      const p = l.productId ? posProducts.find(x => x.id === l.productId) : undefined;
      if (isLivreProd(p)) refundLivres += (l.total || 0);
      else refundFournitures += (l.total || 0);
    });
  });
  const periodLivresRev = Math.max(0, Math.round(rawLivresRev - refundLivres));
  const periodFournituresRev = Math.max(0, Math.round(rawFournituresRev - refundFournitures));

  const rangeSessions = posCashSessions.filter(s => inRange(s.openedAt));
  const closedSessions = rangeSessions.filter(s => s.status === 'Fermée');

  const productMargins: Record<string, { name: string; qtySold: number; totalRevenue: number; totalCost: number; purchasePrice: number; sellingPrice: number }> = {};
  // Retours de la période : à déduire des marges (quantités et revenus rendus)
  rangeReturns.forEach(r => {
    r.lines.forEach(l => {
      if (!l.productId) return;
      const prod = posProducts.find(p => p.id === l.productId);
      if (!productMargins[l.productId]) {
        productMargins[l.productId] = {
          name: prod?.name || l.description,
          qtySold: 0, totalRevenue: 0, totalCost: 0,
          purchasePrice: prod?.purchasePrice || 0,
          sellingPrice: prod?.sellingPrice || l.unitPrice,
        };
      }
      productMargins[l.productId].qtySold -= l.quantity;
      productMargins[l.productId].totalRevenue -= l.total;
      productMargins[l.productId].totalCost -= (prod?.purchasePrice || 0) * l.quantity;
    });
  });
  rangeValidTx.forEach(t => {
    t.lines.forEach(l => {
      const key = l.productId || `custom_${l.description || 'Divers'}`;
      const prod = l.productId ? posProducts.find(p => p.id === l.productId) : null;
      if (!productMargins[key]) {
        productMargins[key] = {
          name: prod?.name || l.description || 'Article personnalisé / Service',
          qtySold: 0, totalRevenue: 0, totalCost: 0,
          purchasePrice: prod?.purchasePrice || 0,
          sellingPrice: prod?.sellingPrice || l.unitPrice,
        };
      }
      productMargins[key].qtySold += l.quantity;
      productMargins[key].totalRevenue += l.total;
      productMargins[key].totalCost += (prod?.purchasePrice || 0) * l.quantity;
    });
  });
  const margins = Object.values(productMargins).sort((a, b) => (b.totalRevenue - b.totalCost) - (a.totalRevenue - a.totalCost));
  const totalMargin = margins.reduce((s, m) => s + (m.totalRevenue - m.totalCost), 0);

  // Daily movements
  const dailyMap = new Map<string, { ventes: number; retours: number; nbVentes: number; nbRetours: number; payments: Record<string, number> }>();
  const dStart = new Date(`${start}T00:00:00`);
  const dEnd = new Date(`${end}T00:00:00`);
  for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
    const key = toLocalDayKey(d);
    dailyMap.set(key, { ventes: 0, retours: 0, nbVentes: 0, nbRetours: 0, payments: { 'Espèces': 0, 'Mobile Money': 0, 'Mixte': 0 } });
  }
  rangeValidTx.forEach(t => {
    const key = toLocalDayKey(t.date);
    const entry = dailyMap.get(key);
    if (entry) { entry.ventes += t.total; entry.nbVentes++; }
  });
  rangeReturns.forEach(r => {
    const key = toLocalDayKey(r.date);
    const entry = dailyMap.get(key);
    if (entry) { entry.retours += r.totalRefund; entry.nbRetours++; }
  });
  rangePayments.forEach(p => {
    const tx = rangeValidTx.find(t => t.id === p.transactionId);
    if (tx) {
      const key = toLocalDayKey(tx.date);
      const entry = dailyMap.get(key);
      if (entry) entry.payments[p.method] += p.amount;
    }
  });

  const dailyEntries = Array.from(dailyMap.entries())
    .filter(([_, data]) => data.nbVentes > 0 || data.nbRetours > 0 || data.ventes > 0)
    .sort((a, b) => b[0].localeCompare(a[0]));

  const cardStyle: React.CSSProperties = { background: 'white', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });

  // Calcul d'impact de la purge sur la période sélectionnée
  const purgeTxs = posTransactions.filter(t => {
    const d = toLocalDayKey(t.date);
    return d >= purgeStartDate && d <= purgeEndDate;
  });
  const purgeReturns = posReturns.filter(r => {
    const d = toLocalDayKey(r.date);
    return d >= purgeStartDate && d <= purgeEndDate;
  });
  const purgeSessions = posCashSessions.filter(s => {
    const d = toLocalDayKey(s.openedAt);
    return d >= purgeStartDate && d <= purgeEndDate;
  });
  const purgeTotalSales = purgeTxs.reduce((s, t) => s + (t.status === 'Validée' ? t.total : 0), 0);

  const handleExecutePurge = async () => {
    if (!confirmPurgeCheck) {
      toast.error('Veuillez cocher la case de confirmation pour valider la purge.');
      return;
    }
    setIsPurging(true);
    try {
      await deletePosMovementsByDateRange(purgeStartDate, purgeEndDate);
      toast.success(`Mouvements du ${purgeStartDate} au ${purgeEndDate} supprimés avec succès.`);
      setShowPurgeModal(false);
      setConfirmPurgeCheck(false);
    } catch (err) {
      console.error('Erreur purge:', err);
      toast.error('Erreur lors de la suppression des mouvements.');
    } finally {
      setIsPurging(false);
    }
  };

  // F4 : purge réservée au SuperAdmin. Le stock physique n'est PAS réajusté par la
  // purge (les quantités restent décrémentées) : le libellé l'impose explicitement
  // et un export préalable est exigé.
  const purgeRoles = ['SuperAdmin'];
  const isAuthorized = !!currentUser && (purgeRoles.includes(currentUser.role) || (!!currentUser.posRole && purgeRoles.includes(currentUser.posRole)));

  return (
    <div className="pos-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Finance POS</h1>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button 
            variant="secondary" 
            icon={<RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Actualisation...' : 'Actualiser'}
          </Button>

          {isAuthorized && (
            <button
              type="button"
              onClick={() => {
                setPurgeStartDate('2026-08-09');
                setPurgeEndDate('2026-08-31');
                setConfirmPurgeCheck(false);
                setShowPurgeModal(true);
              }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              border: '1px solid #FECACA',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'background 0.15s'
            }}
            title="Supprimer les écritures financières sur une plage de dates"
          >
            <Trash2 size={16} />
            <span>Purger une période (ex: 9 au 31 août)</span>
          </button>
        )}
        </div>
      </div>

      {/* Period filter */}
      <div style={{ ...cardStyle, marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '14px' }}>Période :</span>
        {(['today', '7days', '30days', 'custom'] as Period[]).map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            padding: '6px 16px', borderRadius: 'var(--radius-md)', border: '1px solid', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
            borderColor: period === p ? 'var(--color-primary)' : 'var(--color-border)',
            backgroundColor: period === p ? 'var(--color-primary)' : 'white',
            color: period === p ? 'white' : 'var(--color-text)',
          }}>
            {p === 'today' ? "Aujourd'hui" : p === '7days' ? '7 derniers jours' : p === '30days' ? '30 derniers jours' : 'Personnalisé'}
          </button>
        ))}
        {period === 'custom' && (
          <>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px' }} />
            <span style={{ color: 'var(--color-text-muted)' }}>à</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px' }} />
          </>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', fontSize: '13px' }}>{start} → {end}</span>
      </div>

      {/* KPI Cards */}
      <div className="pos-kpi-grid">
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--color-success-tint)', borderRadius: 'var(--radius-md)', padding: '10px' }}><TrendingUp size={22} color="var(--color-success)" /></div>
            <div><div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>CA Net</div><div style={{ fontSize: '22px', fontWeight: 700 }}>{netRevenue.toLocaleString()} FCFA</div></div>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--color-primary-tint)', borderRadius: 'var(--radius-md)', padding: '10px' }}><ShoppingCart size={22} color="var(--color-primary)" /></div>
            <div><div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Transactions</div><div style={{ fontSize: '22px', fontWeight: 700 }}>{totalTxCount}</div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Panier moyen: {avgBasket.toLocaleString()} FCFA</div></div>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--color-warning-tint)', borderRadius: 'var(--radius-md)', padding: '10px' }}><RotateCcw size={22} color="var(--color-warning)" /></div>
            <div><div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Retours</div><div style={{ fontSize: '22px', fontWeight: 700 }}>{totalReturnCount}</div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>-{totalReturns.toLocaleString()} FCFA</div></div>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--color-success-tint)', borderRadius: 'var(--radius-md)', padding: '10px' }}><DollarSign size={22} color="var(--color-success)" /></div>
            <div><div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Marge brute</div><div style={{ fontSize: '22px', fontWeight: 700 }}>{totalMargin.toLocaleString()} FCFA</div></div>
          </div>
        </div>
      </div>

      {/* Family CA Breakdown */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📊 Répartition du Chiffre d'Affaires par Famille (Période sélectionnée)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e40af' }}>📚 LIVRES</span>
              <BookOpen size={16} color="#2563eb" />
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e3a8a' }}>{periodLivresRev.toLocaleString()} FCFA</div>
            <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '2px' }}>
              {totalRevenue > 0 ? ((periodLivresRev / totalRevenue) * 100).toFixed(1) : 0}% des ventes
            </div>
          </div>

          <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534' }}>✏️ FOURNITURES</span>
              <PenTool size={16} color="#16a34a" />
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#14532d' }}>{periodFournituresRev.toLocaleString()} FCFA</div>
            <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '2px' }}>
              {totalRevenue > 0 ? ((periodFournituresRev / totalRevenue) * 100).toFixed(1) : 0}% des ventes
            </div>
          </div>
          {unventilatedRev > 0 && (
            <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: '#fef3c7', border: '1px solid #fcd34d' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>⚠️ NON VENTILÉ (lignes manquantes)</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#92400e' }}>{Math.round(unventilatedRev).toLocaleString()} FCFA</div>
              <div style={{ fontSize: '11px', color: '#92400e', marginTop: '2px' }}>Ventes à reconstituer — exclues des familles</div>
            </div>
          )}
        </div>
      </div>

      {/* Payment methods */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Répartition par mode de paiement</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Espèces', value: paymentTotals['Espèces'], icon: <Wallet size={18} />, color: 'var(--color-success)', bg: 'var(--color-success-tint)' },
            { label: 'Mobile Money', value: paymentTotals['Mobile Money'], icon: <Smartphone size={18} />, color: 'var(--color-warning)', bg: 'var(--color-warning-tint)' },
            { label: 'Mixte', value: paymentTotals['Mixte'], icon: <Layers size={18} />, color: 'var(--color-secondary)', bg: 'var(--color-secondary-tint)' },
            ...((paymentTotals['Autres'] || 0) > 0 ? [{ label: 'Autres (à ventiler)', value: paymentTotals['Autres'], icon: <Layers size={18} />, color: '#92400e', bg: '#fef3c7' }] : []),
          ].map(p => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: 'var(--radius-md)', background: p.bg }}>
              <span style={{ color: p.color }}>{p.icon}</span>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{p.label}</div>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>{p.value.toLocaleString()} FCFA</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily movements */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Mouvements journaliers</h3>
        <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Date</th>
              <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Ventes</th>
              <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Retours</th>
              <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>CA Net</th>
              <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Espèces</th>
              <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Mobile Money</th>
              <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}></th>
            </tr>
          </thead>
          <tbody>
            {dailyEntries.map(([date, data]) => {
              const daySessions = rangeSessions.filter(s => toLocalDayKey(s.openedAt) === date);
              const isExpanded = expandedDay === date;
              return (
                <React.Fragment key={date}>
                  <tr style={{ borderBottom: '1px solid var(--color-surface-alt)', cursor: 'pointer' }} onClick={() => setExpandedDay(isExpanded ? null : date)}>
                    <td style={{ padding: '10px 12px', fontSize: '14px', fontWeight: 500 }}>{formatDate(date)}</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', color: 'var(--color-success)' }}>{data.ventes.toLocaleString()} FCFA</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', color: data.retours > 0 ? 'var(--color-error)' : 'var(--color-text-muted)' }}>{data.retours > 0 ? `-${data.retours.toLocaleString()} FCFA` : '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', fontWeight: 600 }}>{(data.ventes - data.retours).toLocaleString()} FCFA</td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--color-text-muted)' }}>{data.payments['Espèces'].toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--color-text-muted)' }}>{data.payments['Mobile Money'].toLocaleString()}</td>
                    <td style={{ padding: '10px 12px' }}>{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${date}-detail`}>
                      <td colSpan={7} style={{ padding: '0 12px 12px 12px', background: 'var(--color-surface-alt)' }}>
                        <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'white', border: '1px solid var(--color-border)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Transactions du jour ({data.nbVentes} vente{data.nbVentes > 1 ? 's' : ''})</div>
                          {daySessions.length > 0 && (
                            <div style={{ marginBottom: '8px' }}>
                              {daySessions.map(s => (
                                <div key={s.id} style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                                  <span>Session: fond {s.initialFund.toLocaleString()} FCFA</span>
                                  {s.status === 'Fermée' && (
                                    <>
                                      <span>Clôturé: {s.finalAmount?.toLocaleString()} FCFA</span>
                                      <span style={{ color: (s.difference || 0) === 0 ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 600 }}>
                                        Écart: {s.difference?.toLocaleString() || 0} FCFA
                                      </span>
                                    </>
                                  )}
                                  {s.status === 'Ouverte' && <span style={{ color: 'var(--color-warning)' }}>En cours</span>}
                                </div>
                              ))}
                            </div>
                          )}
                          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Espèces: {data.payments['Espèces'].toLocaleString()} | Mobile: {data.payments['Mobile Money'].toLocaleString()}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {dailyEntries.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucune donnée pour cette période</td></tr>
            )}
          </tbody>
        </table>
</div>
      </div>

      {/* Rapprochement caisse exhaustif (Vue Administrateur / Directeur) */}
      {closedSessions.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Rapprochement & Clôtures de caisse</h3>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {closedSessions.length} session(s) de caisse clôturée(s) sur la période
            </span>
          </div>

          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', background: '#fafafa' }}>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Session & Caissier</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Horaires</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Fond initial</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>CA Net (Ventes)</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Attendu Mobile</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Attendu Tiroir</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Réel Compté</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Écart Tiroir</th>
                </tr>
              </thead>
              <tbody>
                {closedSessions.map(s => {
                  const sessionTx = validTx.filter(t => t.sessionId === s.id);
                  const sessionReturns = activeReturns.filter(r => r.sessionId === s.id || (r.transactionId && posTransactions.find(t => t.id === r.transactionId)?.sessionId === s.id));
                  
                  const cashSales = sessionTx.reduce((sum, t) => {
                    const cashPayments = (t.payments || []).filter(p => p.method === 'Espèces' || p.method === 'Mixte').reduce((a, p) => a + p.amount, 0);
                    return sum + (cashPayments > 0 ? cashPayments : (t.payments?.length === 0 ? t.total : 0));
                  }, 0);
                  
                  const mobileSales = sessionTx.reduce((sum, t) => {
                    return sum + (t.payments || []).filter(p => p.method === 'Mobile Money').reduce((a, p) => a + p.amount, 0);
                  }, 0);
                  
                  const totalSales = sessionTx.reduce((sum, t) => sum + t.total, 0);
                  const totalRefunds = sessionReturns.reduce((sum, r) => sum + r.totalRefund, 0);
                  const cashRefunds = sessionReturns.reduce((sum, r) => sum + (r.refundMethod === 'Mobile Money' ? 0 : (r.totalRefund || 0)), 0);
                  const netSales = totalSales - totalRefunds;
                  const expectedCashDrawer = s.expectedAmount ?? (s.initialFund + cashSales - cashRefunds);
                  const diff = s.difference ?? ((s.finalAmount || 0) - expectedCashDrawer);
                  const cashier = users?.find(u => u.id === s.cashierId);

                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{cashier?.name || 'Caissier'}</div>
                        <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>#{s.id.slice(0, 8)}</div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        <div>Ouv : {new Date(s.openedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ({new Date(s.openedAt).toLocaleDateString('fr-FR')})</div>
                        <div>Clôt : {s.closedAt ? `${new Date(s.closedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '—'}</div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right' }}>
                        {s.initialFund.toLocaleString()} FCFA
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>+{netSales.toLocaleString()} FCFA</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          💵 {cashSales.toLocaleString()} • 📱 {mobileSales.toLocaleString()}
                          {totalRefunds > 0 && <span> • ↩️ -{totalRefunds.toLocaleString()}</span>}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', fontWeight: 600, color: '#b45309' }}>
                        {mobileSales.toLocaleString()} FCFA
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', fontWeight: 600, color: '#1e40af' }}>
                        {expectedCashDrawer.toLocaleString()} FCFA
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', fontWeight: 600 }}>
                        {(s.finalAmount || 0).toLocaleString()} FCFA
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', fontWeight: 600, color: diff === 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                        {diff === 0 ? (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--color-success-tint)', color: 'var(--color-success)', fontSize: '11px' }}>Équilibré</span>
                        ) : (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--color-error-tint)', color: 'var(--color-error)', fontSize: '11px' }}>
                            {diff > 0 ? '+' : ''}{diff.toLocaleString()} FCFA
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Marges */}
      {margins.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Analyse des marges</h3>
          <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Produit</th>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Qté</th>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Revenu</th>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Coût</th>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Marge</th>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>% Marge</th>
              </tr>
            </thead>
            <tbody>
              {margins.map((m, i) => {
                const margin = m.totalRevenue - m.totalCost;
                const marginPct = m.totalRevenue > 0 ? Math.round((margin / m.totalRevenue) * 100) : 0;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                    <td style={{ padding: '10px 12px', fontSize: '14px' }}>{m.name}</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right' }}>{m.qtySold}</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right' }}>{m.totalRevenue.toLocaleString()} FCFA</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', color: 'var(--color-text-muted)' }}>{m.totalCost.toLocaleString()} FCFA</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', fontWeight: 600, color: margin >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {margin.toLocaleString()} FCFA
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', fontWeight: 500 }}>{marginPct}%</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: '2px solid var(--color-border)', fontWeight: 700 }}>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>TOTAL</td>
                <td></td>
                <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right' }}>{margins.reduce((s, m) => s + m.totalRevenue, 0).toLocaleString()} FCFA</td>
                <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right' }}>{margins.reduce((s, m) => s + m.totalCost, 0).toLocaleString()} FCFA</td>
                <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', color: totalMargin >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>{totalMargin.toLocaleString()} FCFA</td>
                <td></td>
              </tr>
            </tbody>
          </table>
</div>
        </div>
      )}
      {/* Modale de Purge de Période Sécurisée */}
      {showPurgeModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(3px)'
          }}
          onClick={e => e.target === e.currentTarget && !isPurging && setShowPurgeModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              animation: 'scaleUp 0.15s ease-out'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', padding: '8px', borderRadius: '10px' }}>
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#1E293B' }}>
                    Purger les Mouvements Financiers
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>
                    Nettoyage financier pur (stock physique non altéré)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isPurging && setShowPurgeModal(false)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Plage de dates */}
            <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
                Sélectionner la période à supprimer :
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Date début :</span>
                  <input
                    type="date"
                    value={purgeStartDate}
                    onChange={e => setPurgeStartDate(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <span style={{ color: '#94A3B8', marginTop: '14px' }}>→</span>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Date fin :</span>
                  <input
                    type="date"
                    value={purgeEndDate}
                    onChange={e => setPurgeEndDate(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>
            </div>

            {/* Récapitulatif d'impact */}
            <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#991B1B', fontWeight: 700, fontSize: '13px' }}>
                <AlertTriangle size={16} />
                <span>Éléments identifiés sur la période ({purgeStartDate} au {purgeEndDate}) :</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#7F1D1D', lineHeight: '1.6' }}>
                <li><strong>{purgeTxs.length}</strong> transaction{purgeTxs.length > 1 ? 's' : ''} de vente ({purgeTotalSales.toLocaleString()} FCFA)</li>
                <li><strong>{purgeReturns.length}</strong> retour{purgeReturns.length > 1 ? 's' : ''} de marchandise</li>
                <li><strong>{purgeSessions.length}</strong> session{purgeSessions.length > 1 ? 's' : ''} de caisse</li>
                <li>Les écritures seront retirées des totaux financiers et des mouvements journaliers.</li>
              </ul>
            </div>

            {/* Case à cocher de confirmation */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', marginBottom: '20px', fontSize: '12px', color: '#334155' }}>
              <input
                type="checkbox"
                checked={confirmPurgeCheck}
                onChange={e => setConfirmPurgeCheck(e.target.checked)}
                style={{ marginTop: '2px' }}
              />
              <span>
                Je confirme vouloir supprimer définitivement les mouvements de vente et d'encaissement de la période du <strong>{purgeStartDate}</strong> au <strong>{purgeEndDate}</strong>.
                J'ai exporté les données au préalable (menu Export) et je comprends que <strong>le stock physique n'est PAS réajusté</strong> par cette purge.
              </span>
            </label>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowPurgeModal(false)}
                disabled={isPurging}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#E2E8F0',
                  color: '#334155',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isPurging ? 'not-allowed' : 'pointer'
                }}
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={handleExecutePurge}
                disabled={!confirmPurgeCheck || isPurging}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  backgroundColor: !confirmPurgeCheck || isPurging ? '#FCA5A5' : '#DC2626',
                  color: 'white',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: !confirmPurgeCheck || isPurging ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.3)'
                }}
              >
                {isPurging ? 'Suppression en cours...' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
