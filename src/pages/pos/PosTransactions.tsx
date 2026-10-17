import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../components/ConfirmModal';
import { Search, RotateCcw, XCircle, ArrowLeft, Trash2, Calendar, Archive, ChevronDown, ChevronRight, Printer, RefreshCw, Wallet, Smartphone, TrendingUp, Eraser } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import ReceiptTicket from '../../components/pos/ReceiptTicket';
import type { ReceiptData } from '../../components/pos/ReceiptTicket';
import { printReceiptViaIframe } from '../../lib/receiptHtml';
import type { PosTransaction } from '../../context/AppContext';
import { matchesSearchQuery } from '../../lib/searchUtils';
import { getWeekKey, formatWeekLabel, isCurrentWeek, todayLocalKey, toLocalDayKey } from '../../lib/dates';
import { platform } from '../../platform';
import { toast } from 'react-hot-toast';
import { purgePosBrowserToServerTruth, formatPurgeReport, PURGE_TARGET_DAY } from '../../lib/posBrowserPurge';

export default function PosTransactions() {
  const { posTransactions, posCashSessions, voidPosTransaction, clearPosSalesHistory, posSettings, settings: crmSettings, users, refreshData } = useAppContext();
  const { currentUser } = useAuth();
  const { confirm } = useConfirm();
  const [search, setSearch] = useState('');
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<string>('all');
  const [selectedReceiptData, setSelectedReceiptData] = useState<ReceiptData | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    refreshData().catch(() => {});
  }, [refreshData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
      toast.success('Historique actualisé');
    } catch {
      toast.error('Erreur de synchronisation');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePurgeBrowser = () => {
    confirm({
      title: 'Épurer le navigateur du poste de vente',
      message: `Le cache local sera realigné sur la vérité serveur, puis vérifié sur le ${PURGE_TARGET_DAY} (référence : 15 ventes, CA 73 940 FCFA). Les ventes locales absentes du serveur sont remises en file de synchronisation (jamais supprimées) ; le panier en cours est préservé. Continuer ?`,
      variant: 'warning',
      confirmLabel: 'Épurer le navigateur',
      onConfirm: async () => {
        setIsPurging(true);
        try {
          const report = await purgePosBrowserToServerTruth(PURGE_TARGET_DAY);
          console.log('[Purge navigateur]', formatPurgeReport(report));
          await refreshData();
          if (report.ok) {
            toast.success(`Navigateur épuré : ${report.after.dayTx} ventes le ${report.day}, CA ${report.after.dayCa.toLocaleString('fr-FR')} FCFA — conforme serveur.`);
          } else {
            toast.error(formatPurgeReport(report), { duration: 9000 });
          }
        } catch (e: any) {
          toast.error('Épuration impossible : ' + (e?.message || e));
        } finally {
          setIsPurging(false);
        }
      },
    });
  };

  const currentWeekKey = getWeekKey(new Date());

  const openSession = posCashSessions.find(s => s.status === 'Ouverte' && toLocalDayKey(s.openedAt) === todayLocalKey() && s.cashierId === currentUser?.id);

  const filtered = useMemo(() => {
    return posTransactions.filter(t => {
      if (!search || !search.trim()) return true;
      return matchesSearchQuery([
        t.transactionNumber, 
        t.date, 
        t.status, 
        String(t.total),
        t.lines?.map(l => l.description).join(' ')
      ], search);
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [posTransactions, search]);

  // H4 : une vente sans ligne de paiement n'est JAMAIS imputée aux espèces par
  // défaut (tiroir surévalué) — elle est marquée « Non ventilé » et comptée à 0.
  const hasPayments = (t: PosTransaction) => (t.payments?.length || 0) > 0;
  const getTxCash = (t: PosTransaction) => {
    const cashPayments = (t.payments || [])
      .filter(p => p.method === 'Espèces' || p.method === 'Mixte')
      .reduce((a, p) => a + p.amount, 0);
    return cashPayments;
  };

  const getTxMobile = (t: PosTransaction) => {
    return (t.payments || [])
      .filter(p => p.method === 'Mobile Money')
      .reduce((a, p) => a + p.amount, 0);
  };

  const renderPaymentBadge = (t: PosTransaction) => {
    if (!hasPayments(t)) return <Badge variant="warning">Non ventilé</Badge>;
    const payments = t.payments || [];
    if (payments.length > 1) {
      const methods = Array.from(new Set(payments.map(p => p.method)));
      if (methods.includes('Espèces') && methods.includes('Mobile Money')) {
        return (
          <Badge variant="neutral">
            Mixte (Espèces + Mobile)
          </Badge>
        );
      }
      return (
        <Badge variant="neutral">
          Mixte ({methods.join(' + ')})
        </Badge>
      );
    }
    return <Badge variant="info">{payments[0]?.method || 'Espèces'}</Badge>;
  };

  // Regroupement des ventes par semaine (du lundi au dimanche)
  const transactionsByWeek = useMemo(() => {
    const map = new Map<string, PosTransaction[]>();

    filtered.forEach(t => {
      const key = getWeekKey(t.date);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(t);
    });

    const sortedKeys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    return sortedKeys.map(key => {
      const list = map.get(key)!;
      const validTxs = list.filter(t => t.status === 'Validée');
      const voidedTxs = list.filter(t => t.status === 'Annulée');
      const totalRevenue = validTxs.reduce((sum, t) => sum + t.total, 0);
      const cashRevenue = validTxs.reduce((sum, t) => sum + getTxCash(t), 0);
      const mobileRevenue = validTxs.reduce((sum, t) => sum + getTxMobile(t), 0);

      return {
        weekKey: key,
        label: formatWeekLabel(list[0].date),
        isCurrent: key === currentWeekKey,
        transactions: list,
        txCount: list.length,
        validCount: validTxs.length,
        voidCount: voidedTxs.length,
        totalRevenue,
        cashRevenue,
        mobileRevenue,
      };
    });
  }, [filtered, currentWeekKey]);

  // Filtrage selon le sélecteur de semaine
  const displayedWeekGroups = useMemo(() => {
    if (selectedWeekFilter === 'all') return transactionsByWeek;
    return transactionsByWeek.filter(w => w.weekKey === selectedWeekFilter);
  }, [transactionsByWeek, selectedWeekFilter]);

  // Statistiques consolidées de la sélection active
  const summaryStats = useMemo(() => {
    let validCount = 0;
    let totalRevenue = 0;
    let cashRevenue = 0;
    let mobileRevenue = 0;

    displayedWeekGroups.forEach(w => {
      validCount += w.validCount;
      totalRevenue += w.totalRevenue;
      cashRevenue += w.cashRevenue;
      mobileRevenue += w.mobileRevenue;
    });

    return { validCount, totalRevenue, cashRevenue, mobileRevenue };
  }, [displayedWeekGroups]);

  // État des semaines dépliées : par défaut la semaine en cours est ouverte
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>(() => {
    return { [currentWeekKey]: true };
  });

  // Si l'utilisateur fait une recherche, déplier automatiquement toutes les semaines qui contiennent des résultats
  useEffect(() => {
    if (search && search.trim() !== '') {
      const next: Record<string, boolean> = {};
      transactionsByWeek.forEach(w => { next[w.weekKey] = true; });
      setExpandedWeeks(next);
    }
  }, [search, transactionsByWeek]);

  const toggleWeek = (weekKey: string) => {
    setExpandedWeeks(prev => ({
      ...prev,
      [weekKey]: !prev[weekKey],
    }));
  };

  const expandAllWeeks = () => {
    const next: Record<string, boolean> = {};
    displayedWeekGroups.forEach(w => { next[w.weekKey] = true; });
    setExpandedWeeks(next);
  };

  const collapseAllWeeks = () => {
    setExpandedWeeks({});
  };

  const role = currentUser?.role;

  const canVoid = (t: PosTransaction) => {
    if (t.status !== 'Validée') return false;
    // H1 : session clôturée = annulation interdite pour tout le monde (écart figé ;
    // le service refuse de toute façon). Le bouton n'est plus proposé — passer par un retour.
    const sess = posCashSessions.find(s => s.id === t.sessionId);
    if (sess && sess.status !== 'Ouverte') return false;
    if (role === 'Directeur' || role === 'Directeur adjoint' || role === 'SuperAdmin' || role === 'Gerant') return true;
    if (role === 'Caissier') {
      return !!openSession && t.cashierId === currentUser?.id && t.sessionId === openSession.id;
    }
    return false;
  };

  const canReturn = (t: PosTransaction) => {
    return t.status === 'Validée' && (role === 'Directeur' || role === 'Gerant');
  };

  const handleVoid = (t: PosTransaction) => {
    confirm({
      title: 'Annuler la vente',
      message: `Voulez-vous annuler la vente ${t.transactionNumber} d'un montant de ${t.total.toLocaleString()} FCFA ? Le stock sera restauré et la transaction passera en « Annulée ».`,
      variant: 'warning',
      confirmLabel: 'Annuler la vente',
      onConfirm: async () => {
        const ok = await voidPosTransaction(t.id);
        if (!ok) {
          toast.error("Annulation impossible : vente déjà traitée ou session de caisse clôturée.");
          await refreshData();
        }
      },
    });
  };

  const handleReprint = (t: PosTransaction) => {
    const cashier = users?.find(u => u.id === t.cashierId);
    const cashierName = cashier ? cashier.name : (t.cashierId === currentUser?.id ? currentUser?.name : undefined);
    // H2 : « Espèces reçues » = part espèces seule (pas receivedAmount qui inclut le mobile en Mixte).
    const cashOnly = t.payments?.find(p => p.method === 'Espèces')?.amount ?? (t.payments?.[0]?.method === 'Espèces' ? t.total : 0);
    const isMixed = (t.payments && t.payments.length > 1);
    const data: ReceiptData = {
      transaction: t,
      cart: (t.lines || []).map(l => ({
        id: l.id,
        productId: l.productId,
        name: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent || 0,
        discountAmount: l.discountAmount || 0,
        total: l.total
      })),
      paymentMethod: isMixed ? 'Mixte' : (t.payments?.[0]?.method || 'Espèces'),
      cashAmount: cashOnly,
      changeAmount: t.changeAmount ?? 0,
      total: t.total,
      subtotal: t.subtotal || t.total,
      globalDiscount: t.discountAmount || 0,
      cashierName,
      settings: posSettings,
      crmSettings
    };
    setSelectedReceiptData(data);
    setShowReceiptModal(true);
  };

  const handlePrintAction = async () => {
    if (!selectedReceiptData) return;
    if (platform.isDesktop) {
      try {
        await platform.pos.printReceipt({
          ...selectedReceiptData,
          settings: posSettings,
          crmSettings
        });
        toast.success('Ticket envoyé à l\'imprimante');
      } catch (err: any) {
        toast.error("Erreur d'impression: " + (err.message || err));
      }
    } else {
      // Iframe dédiée (hors DOM React) : pas de page blanche liée aux re-renders.
      try {
        await printReceiptViaIframe({ ...selectedReceiptData, settings: posSettings, crmSettings });
      } catch (err: any) {
        toast.error("Erreur d'impression: " + (err.message || err));
      }
    }
  };

  // H3 : purge réservée au SuperAdmin + double confirmation explicite (export
  // préalable exigé dans le libellé). Irréversible local + serveur.
  const [clearArmed, setClearArmed] = useState(false);
  const handleClearHistory = () => {
    if (role !== 'SuperAdmin') {
      toast.error("Suppression de l'historique réservée au SuperAdmin.");
      return;
    }
    if (!clearArmed) {
      setClearArmed(true);
      toast.error("Cliquez à nouveau pour confirmer la suppression DÉFINITIVE (exportez d'abord vos données via Export).", { duration: 6000 });
      setTimeout(() => setClearArmed(false), 10000);
      return;
    }
    setClearArmed(false);
    confirm({
      title: "Supprimer l'historique des ventes",
      message: "DERNIÈRE CONFIRMATION — IRRÉVERSIBLE : supprime définitivement toutes les transactions, lignes, paiements et retours EN LOCAL ET SUR LE SERVEUR. Confirmez avoir exporté vos données.",
      variant: 'danger',
      confirmLabel: "Supprimer tout l'historique",
      onConfirm: async () => {
        await clearPosSalesHistory();
      },
    });
  };

  return (
    <div className="pos-page">
      {/* Zone d'impression cachée (print seul) : sans elle, window.print() sort une page
          blanche car le ticket du modal est en mode preview (sans classe print-zone).
          Même pattern que PosTerminal. */}
      {selectedReceiptData && (
        <ReceiptTicket data={selectedReceiptData} settings={posSettings} crmSettings={crmSettings} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/pos')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', color: 'var(--color-text)' }} title="Retour au tableau de bord">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Historique des Ventes</h1>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {posTransactions.length} transaction(s) archivée(s) par semaine
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button 
            variant="secondary" 
            icon={<RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />}
            onClick={handleRefresh}
            disabled={isRefreshing || isPurging}
          >
            {isRefreshing ? 'Actualisation...' : 'Actualiser'}
          </Button>
          <Button
            variant="secondary"
            icon={<Eraser size={16} className={isPurging ? "animate-spin" : ""} />}
            onClick={handlePurgeBrowser}
            disabled={isRefreshing || isPurging}
            title={`Remplace le cache navigateur par la vérité serveur et vérifie le ${PURGE_TARGET_DAY} (15 ventes, 73 940 FCFA)`}
          >
            {isPurging ? 'Épuration...' : 'Épurer le navigateur'}
          </Button>
          {role === 'SuperAdmin' && posTransactions.length > 0 && (
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={handleClearHistory}>
              {clearArmed ? 'Confirmer la suppression DÉFINITIVE' : "Vider l'historique des ventes"}
            </Button>
          )}
        </div>
      </div>

      {/* Cartes de synthèse financière pour la sélection active */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Chiffre d'Affaires Net</span>
            <TrendingUp size={16} color="var(--color-primary)" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary)' }}>
            {summaryStats.totalRevenue.toLocaleString()} FCFA
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {summaryStats.validCount} vente(s) validée(s)
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-lg)', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534' }}>Attendu Espèces (Tiroir)</span>
            <Wallet size={16} color="#16a34a" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#15803d' }}>
            {summaryStats.cashRevenue.toLocaleString()} FCFA
          </div>
          <div style={{ fontSize: '11px', color: '#166534', marginTop: '2px' }}>
            {summaryStats.totalRevenue > 0 ? ((summaryStats.cashRevenue / summaryStats.totalRevenue) * 100).toFixed(1) : 0}% du total
          </div>
        </div>

        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-lg)', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>Attendu Mobile Money</span>
            <Smartphone size={16} color="#d97706" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#b45309' }}>
            {summaryStats.mobileRevenue.toLocaleString()} FCFA
          </div>
          <div style={{ fontSize: '11px', color: '#92400e', marginTop: '2px' }}>
            {summaryStats.totalRevenue > 0 ? ((summaryStats.mobileRevenue / summaryStats.totalRevenue) * 100).toFixed(1) : 0}% du total
          </div>
        </div>
      </div>

      {/* Barre de recherche et filtres de semaine */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 300px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            autoFocus
            style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}
            placeholder="Rechercher par n° de ticket, date, article, montant..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {transactionsByWeek.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              value={selectedWeekFilter}
              onChange={e => setSelectedWeekFilter(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'white',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">Toutes les semaines ({transactionsByWeek.length})</option>
              {transactionsByWeek.map(w => (
                <option key={w.weekKey} value={w.weekKey}>
                  {w.label} {w.isCurrent ? '(En cours)' : ''}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={expandAllWeeks}
              style={{
                background: 'white',
                border: '1px solid var(--color-border)',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                color: 'var(--color-text)'
              }}
            >
              Tout déplier
            </button>
            <button
              type="button"
              onClick={collapseAllWeeks}
              style={{
                background: 'white',
                border: '1px solid var(--color-border)',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                color: 'var(--color-text)'
              }}
            >
              Tout replier
            </button>
          </div>
        )}
      </div>

      {/* Liste des semaines archivées */}
      {displayedWeekGroups.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-muted)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <Archive size={36} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          <div style={{ fontSize: '15px', fontWeight: 500 }}>Aucune transaction trouvée</div>
          {search && <div style={{ fontSize: '13px', marginTop: '4px' }}>Essayez d'ajuster votre recherche.</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {displayedWeekGroups.map(weekGroup => {
            const isExpanded = !!expandedWeeks[weekGroup.weekKey];
            return (
              <div
                key={weekGroup.weekKey}
                style={{
                  background: 'white',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  border: '1px solid var(--color-border)'
                }}
              >
                {/* Entête accordéon de la semaine */}
                <div
                  onClick={() => toggleWeek(weekGroup.weekKey)}
                  style={{
                    padding: '14px 18px',
                    background: weekGroup.isCurrent ? 'rgba(59, 130, 246, 0.05)' : 'var(--color-surface-alt)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    borderBottom: isExpanded ? '1px solid var(--color-border)' : 'none',
                    userSelect: 'none',
                    transition: 'background 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ color: isExpanded ? 'var(--color-primary)' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={18} color="var(--color-primary)" />
                      <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>
                        {weekGroup.label}
                      </span>
                    </div>
                    {weekGroup.isCurrent ? (
                      <Badge variant="info">Cette semaine</Badge>
                    ) : (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#64748b', fontWeight: 500 }}>
                        Archivée
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      <strong>{weekGroup.txCount}</strong> vente(s) {weekGroup.voidCount > 0 && `(${weekGroup.voidCount} annulée)`}
                    </span>
                    <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                      💵 Espèces: <strong>{weekGroup.cashRevenue.toLocaleString()} FCFA</strong>
                    </span>
                    <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                      📱 Mobile: <strong>{weekGroup.mobileRevenue.toLocaleString()} FCFA</strong>
                    </span>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-primary-tint)',
                        color: 'var(--color-primary)',
                      }}
                    >
                      CA Total : {weekGroup.totalRevenue.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>

                {/* Tableau des transactions de la semaine */}
                {isExpanded && (
                  <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', background: '#fafafa' }}>
                          <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>N° Transaction</th>
                          <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Date & Heure</th>
                          <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Articles</th>
                          <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Paiement</th>
                          <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Statut</th>
                          <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Total</th>
                          <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weekGroup.transactions.map(t => (
                          <tr key={t.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                            <td style={{ padding: '12px 16px', fontSize: '14px', fontFamily: 'monospace' }}>{t.transactionNumber}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px' }}>{new Date(t.date).toLocaleString('fr-FR')}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px' }}>{t.lines.length} article(s)</td>
                            <td style={{ padding: '12px 16px' }}>{renderPaymentBadge(t)}</td>
                            <td style={{ padding: '12px 16px' }}><Badge variant={t.status === 'Validée' ? 'success' : 'danger'}>{t.status}</Badge></td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right', fontWeight: 600 }}>{t.total.toLocaleString()} FCFA</td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                <button onClick={() => handleReprint(t)} style={{ padding: '4px 8px', background: 'var(--color-primary-tint)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--color-primary)', fontWeight: 500 }}>
                                  <Printer size={12} /> Ticket
                                </button>
                                {canReturn(t) && (
                                  <button onClick={() => navigate('/pos/returns', { state: { selectedTxId: t.id } })} style={{ padding: '4px 8px', background: 'var(--color-warning-tint)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--color-warning-strong)' }}>
                                    <RotateCcw size={12} /> Retour
                                  </button>
                                )}
                                {canVoid(t) && (
                                  <button onClick={() => handleVoid(t)} style={{ padding: '4px 8px', background: 'var(--color-error-tint)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--color-error)' }}>
                                    <XCircle size={12} /> Annuler
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal d'aperçu / réimpression du Ticket */}
      {showReceiptModal && selectedReceiptData && (
        <Modal
          open={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          title={`Ticket ${selectedReceiptData.transaction?.transactionNumber || ''}`}
          footer={
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
              <Button variant="secondary" onClick={() => setShowReceiptModal(false)}>
                Fermer
              </Button>
              <Button variant="primary" icon={<Printer size={16} />} onClick={handlePrintAction}>
                Imprimer le ticket
              </Button>
            </div>
          }
        >
          <div style={{ maxHeight: '70vh', overflowY: 'auto', background: '#f8fafc', padding: '16px', borderRadius: 'var(--radius-md)' }}>
            <ReceiptTicket data={selectedReceiptData} settings={posSettings} crmSettings={crmSettings} preview={true} />
          </div>
        </Modal>
      )}
    </div>
  );
}