import { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Wallet, Plus, AlertTriangle, CheckCircle2, Calendar, Archive, ChevronDown, ChevronRight, Smartphone, Layers } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { todayLocalKey, toLocalDayKey, getWeekKey, formatWeekLabel, isCurrentWeek } from '../../lib/dates';

export default function PosCash() {
  const { posCashSessions, posTransactions, posReturns, addPosCashSession, updatePosCashSession, users } = useAppContext();
  const { currentUser } = useAuth();

  const [showOpen, setShowOpen] = useState(false);
  const [initialFund, setInitialFund] = useState('');
  const [showClose, setShowClose] = useState(false);
  const [finalAmount, setFinalAmount] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  // Session ciblée par la clôture (session du jour par défaut, ou session antérieure à régulariser)
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);

  const today = todayLocalKey();
  // Même règle que le terminal (T3) : session strictement personnelle.
  const openSession = posCashSessions.find(s => s.status === 'Ouverte' && toLocalDayKey(s.openedAt) === today && s.cashierId === currentUser?.id);
  // Direction : voit les AUTRES sessions ouvertes du jour (ex : compte fantôme,
  // session oubliée) pour les clôturer — M GBA reste seule caissière active.
  const isDirection = !!currentUser && ['Directeur', 'Directeur adjoint', 'SuperAdmin', 'Gerant'].includes(currentUser.role);
  const otherOpenSessions = isDirection
    ? posCashSessions.filter(s => s.status === 'Ouverte' && toLocalDayKey(s.openedAt) === today && s.id !== openSession?.id)
    : [];
  const staleOpenSessions = posCashSessions.filter(s => s.status === 'Ouverte' && toLocalDayKey(s.openedAt) < today);
  const closedSessions = posCashSessions
    .filter(s => s.status === 'Fermée')
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  const validTx = posTransactions.filter(t => t.status === 'Validée');

  // Seule la part encaissée en espèces (ou mixte) doit apparaître dans la caisse physique.
  // Les paiements Mobile Money ne passent pas par le tiroir-caisse physique.
  // H4 : vente sans paiement → 0 (jamais imputée aux espèces par défaut).
  const cashOfTransaction = (t: typeof posTransactions[number]) => {
    const cashPayments = (t.payments || [])
      .filter(p => p.method === 'Espèces' || p.method === 'Mixte')
      .reduce((a, p) => a + p.amount, 0);
    return cashPayments;
  };

  const mobileOfTransaction = (t: typeof posTransactions[number]) => {
    return (t.payments || [])
      .filter(p => p.method === 'Mobile Money')
      .reduce((a, p) => a + p.amount, 0);
  };

  // Seuls les remboursements en espèces sortent du tiroir physique (B8) — legacy = espèces
  const cashRefundOf = (r: typeof posReturns[number]) => r.refundMethod === 'Mobile Money' ? 0 : (r.totalRefund || 0);
  const sessionReturns = openSession ? posReturns
    .filter(r => r.status === 'Traité' && r.sessionId === openSession.id)
    .reduce((s, r) => s + cashRefundOf(r), 0) : 0;
  const sessionCashSales = openSession ? validTx.filter(t => t.sessionId === openSession.id).reduce((s, t) => s + cashOfTransaction(t), 0) : 0;
  const sessionMobileSales = openSession ? validTx.filter(t => t.sessionId === openSession.id).reduce((s, t) => s + mobileOfTransaction(t), 0) : 0;
  const sessionGrandTotal = sessionCashSales + sessionMobileSales;
  const expectedAmount = openSession ? openSession.initialFund + sessionCashSales - sessionReturns : 0;

  const closingSession = closingSessionId
    ? posCashSessions.find(s => s.id === closingSessionId && s.status === 'Ouverte') || null
    : openSession || null;

  const handleCloseStale = async (staleSession: typeof posCashSessions[number]) => {
    // Régularisation honnête (M2) : la clôture d'une session antérieure exige le comptage réel,
    // via le même modal que la session du jour — plus aucun écart forcé à 0.
    setClosingSessionId(staleSession.id);
    setFinalAmount('');
    setShowClose(true);
  };

  const handleOpen = async () => {
    if (isBusy) return;
    const fund = Number(initialFund);
    if (isNaN(fund) || fund < 0 || initialFund === '') {
      alert('Le fonds de caisse doit être supérieur ou égal à 0.');
      return;
    }
    // T6 : une seule session ouverte par caissier et par jour.
    const existing = posCashSessions.find(s => s.status === 'Ouverte' && toLocalDayKey(s.openedAt) === today && s.cashierId === currentUser?.id);
    if (existing) {
      alert('Une session est déjà ouverte pour cette caisse.');
      return;
    }
    setIsBusy(true);
    try {
      await addPosCashSession({
        id: uuidv4(),
        cashierId: currentUser?.id,
        openedAt: new Date().toISOString(),
        initialFund: fund,
        status: 'Ouverte',
      });
      setShowOpen(false);
      setInitialFund('');
    } finally {
      setIsBusy(false);
    }
  };

  const handleClose = async () => {
    if (isBusy) return;
    const target = closingSession;
    if (!target) return;
    const final = Number(finalAmount);
    // C2 : montant réel négatif refusé + champ obligatoire (comptage aveugle).
    if (finalAmount === '' || Number.isNaN(final) || final < 0) {
      alert('Veuillez saisir le montant réel compté en caisse (0 ou plus).');
      return;
    }
    setIsBusy(true);
    try {
      const expected = sessionExpected(target);
      const difference = final - expected;
      await updatePosCashSession(target.id, {
        closedAt: new Date().toISOString(),
        finalAmount: final,
        expectedAmount: expected,
        difference,
        status: 'Fermée',
      });
      setShowClose(false);
      setFinalAmount('');
      setClosingSessionId(null);
    } finally {
      setIsBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    fontSize: '14px',
    outline: 'none',
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString('fr-FR');
  const formatMoney = (v: number) => `${v.toLocaleString()} FCFA`;

  const sessionExpected = (s: typeof posCashSessions[number]) => {
    const tx = validTx.filter(t => t.sessionId === s.id).reduce((sum, t) => sum + cashOfTransaction(t), 0);
    const rt = posReturns
      .filter(r => r.status === 'Traité' && r.sessionId === s.id)
      .reduce((sum, r) => sum + cashRefundOf(r), 0);
    return s.expectedAmount ?? s.initialFund + tx - rt;
  };
  const sessionDiff = (s: typeof posCashSessions[number]) => s.difference ?? (s.finalAmount || 0) - sessionExpected(s);

  // Session effectivement clôturée par le modal (jour ou antérieure) + montants associés
  const closingExpected = closingSession ? sessionExpected(closingSession) : expectedAmount;
  const closingDiffPreview = Number(finalAmount || 0) - closingExpected;

  const sessionSales = (s: typeof posCashSessions[number]) => {
    const tx = validTx.filter(t => t.sessionId === s.id);
    const cash = tx.reduce((sum, t) => sum + cashOfTransaction(t), 0);
    const mobile = tx.reduce((sum, t) => sum + mobileOfTransaction(t), 0);
    return { cash, mobile, total: cash + mobile, count: tx.length };
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  };

  const currentWeekKey = getWeekKey(new Date());

  // Regroupement des sessions clôturées par semaine (du lundi au dimanche)
  const sessionsByWeek = useMemo(() => {
    const map = new Map<string, typeof closedSessions>();

    closedSessions.forEach(s => {
      const key = getWeekKey(s.openedAt);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(s);
    });

    // Trier les clés de semaine de la plus récente à la plus ancienne
    const sortedKeys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    return sortedKeys.map(key => {
      const list = map.get(key)!;
      const totalInitialFund = list.reduce((sum, s) => sum + s.initialFund, 0);
      const totalRevenue = list.reduce((sum, s) => sum + sessionSales(s).total, 0);
      const totalExpected = list.reduce((sum, s) => sum + sessionExpected(s), 0);
      const totalFinal = list.reduce((sum, s) => sum + (s.finalAmount || 0), 0);
      const totalDiff = totalFinal - totalExpected;

      return {
        weekKey: key,
        label: formatWeekLabel(list[0].openedAt),
        isCurrent: key === currentWeekKey,
        sessions: list,
        totalInitialFund,
        totalRevenue,
        totalExpected,
        totalFinal,
        totalDiff,
      };
    });
  }, [closedSessions, validTx, posReturns, currentWeekKey]);

  // État des semaines dépliées : par défaut la semaine courante (ou la première) est ouverte
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>(() => {
    return { [currentWeekKey]: true };
  });

  const toggleWeek = (weekKey: string) => {
    setExpandedWeeks(prev => ({
      ...prev,
      [weekKey]: !prev[weekKey],
    }));
  };

  const expandAllWeeks = () => {
    const next: Record<string, boolean> = {};
    sessionsByWeek.forEach(w => { next[w.weekKey] = true; });
    setExpandedWeeks(next);
  };

  const collapseAllWeeks = () => {
    setExpandedWeeks({});
  };

  return (
    <div className="pos-page">
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '20px' }}>Gestion de caisse</h1>

      {/* Alerte sessions antérieures non fermées */}
      {staleOpenSessions.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '8px' }}>
                <AlertTriangle size={20} color="#d97706" />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#92400e' }}>
                  {staleOpenSessions.length} session(s) de caisse d'un jour antérieur non clôturée(s)
                </div>
                <div style={{ fontSize: '13px', color: '#b45309', marginTop: '2px' }}>
                  Des sessions précédentes (ex: {formatDate(staleOpenSessions[0].openedAt)}) sont restées ouvertes. Clôturez-les pour utiliser exclusivement la caisse d'aujourd'hui.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {staleOpenSessions.map(s => (
                <Button key={s.id} variant="warning" onClick={() => handleCloseStale(s)} style={{ fontSize: '13px' }}>
                  Compter et clôturer ({new Date(s.openedAt).toLocaleDateString('fr-FR')})
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Autres sessions ouvertes du jour (direction) : à clôturer (comptes fantômes, oublis) */}
      {otherOpenSessions.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: '#fee2e2', borderRadius: '8px', padding: '8px' }}>
              <AlertTriangle size={20} color="#dc2626" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#991b1b' }}>
                {otherOpenSessions.length} autre(s) session(s) ouverte(s) aujourd'hui
              </div>
              <div style={{ fontSize: '13px', color: '#b91c1c', marginTop: '2px' }}>
                Vérifiez le caissier puis clôturez après comptage réel du tiroir.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {otherOpenSessions.map(s => {
              const cashier = users?.find(u => u.id === s.cashierId);
              return (
                <Button key={s.id} variant="danger" onClick={() => handleCloseStale(s)} style={{ fontSize: '13px' }}>
                  Clôturer : {cashier ? cashier.name : `compte inconnu (${String(s.cashierId || '?').slice(0, 8)})`} ({formatDate(s.openedAt)})
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Session en cours */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        {openSession ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ background: 'var(--color-warning-tint)', borderRadius: '10px', padding: '10px' }}>
                <Wallet size={22} color="var(--color-warning)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>Session ouverte</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  Ouverte le {formatDate(openSession.openedAt)}
                </div>
              </div>
              <Badge variant="warning">En cours</Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Fond initial</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{formatMoney(openSession.initialFund)}</div>
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                <div style={{ fontSize: '12px', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Wallet size={14} /> Espèces (Tiroir)
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-success)' }}>+{formatMoney(sessionCashSales)}</div>
              </div>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                <div style={{ fontSize: '12px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Smartphone size={14} /> Mobile Money
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-warning-strong)' }}>+{formatMoney(sessionMobileSales)}</div>
              </div>
              <div style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Total Chiffre d'Affaires</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-primary)' }}>{formatMoney(sessionGrandTotal)}</div>
              </div>
              {sessionReturns > 0 && (
                <div style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Retours déduits</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-error)' }}>-{formatMoney(sessionReturns)}</div>
                </div>
              )}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: 600 }}>Attendu physique tiroir</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e40af' }}>{formatMoney(expectedAmount)}</div>
              </div>
            </div>

            {/* C1 : comptage aveugle — le champ reste vide, aucun ancrage sur l'attendu. */}
            <Button variant="warning" onClick={() => { setClosingSessionId(null); setFinalAmount(''); setShowClose(true); }}>
              Fermer la caisse
            </Button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ background: 'var(--color-primary-tint)', borderRadius: '50%', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Wallet size={28} color="var(--color-primary)" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Aucune session ouverte</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>Ouvrez la caisse pour commencer à encaisser les ventes.</div>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowOpen(true)}>Ouvrir la caisse</Button>
          </div>
        )}
      </div>

      {/* Historique des sessions archivées par semaine */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Historique des sessions</h3>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {closedSessions.length} session(s) clôturée(s) archivée(s) sur {sessionsByWeek.length} semaine(s)
            </div>
          </div>
          {sessionsByWeek.length > 1 && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={expandAllWeeks}
                style={{
                  background: 'var(--color-surface-alt)',
                  border: '1px solid var(--color-border)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
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
                  background: 'var(--color-surface-alt)',
                  border: '1px solid var(--color-border)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
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

        {sessionsByWeek.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-muted)' }}>
            <Archive size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <div>Aucune session clôturée</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {sessionsByWeek.map(weekGroup => {
              const isExpanded = !!expandedWeeks[weekGroup.weekKey];
              return (
                <div
                  key={weekGroup.weekKey}
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    background: 'white',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}
                >
                  {/* Entête accordéon de la semaine */}
                  <div
                    onClick={() => toggleWeek(weekGroup.weekKey)}
                    style={{
                      padding: '12px 16px',
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
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={16} color="var(--color-primary)" />
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
                          {weekGroup.label}
                        </span>
                      </div>
                      {weekGroup.isCurrent ? (
                        <Badge variant="info">Cette semaine</Badge>
                      ) : (
                        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', color: '#64748b', fontWeight: 500 }}>
                          Archivée
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        <strong>{weekGroup.sessions.length}</strong> session(s)
                      </span>
                      <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: 'var(--color-primary-tint)', color: 'var(--color-primary)', fontWeight: 600 }}>
                        Ventes : {formatMoney(weekGroup.totalRevenue)}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Réel Tiroir : <strong>{formatMoney(weekGroup.totalFinal)}</strong>
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: weekGroup.totalDiff === 0 ? 'var(--color-success-tint)' : 'var(--color-error-tint)',
                          color: weekGroup.totalDiff === 0 ? 'var(--color-success)' : 'var(--color-error)',
                        }}
                      >
                        {weekGroup.totalDiff === 0 ? 'Équilibré' : `Écart : ${weekGroup.totalDiff > 0 ? '+' : ''}${formatMoney(weekGroup.totalDiff)}`}
                      </span>
                    </div>
                  </div>

                  {/* Tableau des sessions de la semaine */}
                  {isExpanded && (
                    <div className="table-responsive">
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', background: '#fafafa' }}>
                            <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Ouverture</th>
                            <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Clôture</th>
                            <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Fond initial</th>
                            <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Ventes (CA Total)</th>
                            <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Attendu (Tiroir)</th>
                            <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Réel (Tiroir)</th>
                            <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Écart</th>
                            <th style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weekGroup.sessions.map(s => {
                            const expected = sessionExpected(s);
                            const diff = sessionDiff(s);
                            const sales = sessionSales(s);
                            return (
                              <tr key={s.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                                <td style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--color-text-muted)' }}>{formatDate(s.openedAt)}</td>
                                <td style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--color-text-muted)' }}>{s.closedAt ? formatDate(s.closedAt) : '—'}</td>
                                <td style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'right' }}>{formatMoney(s.initialFund)}</td>
                                <td style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'right' }}>
                                  <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>+{formatMoney(sales.total)}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                    💵 {formatMoney(sales.cash)} • 📱 {formatMoney(sales.mobile)}
                                  </div>
                                </td>
                                <td style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'right', fontWeight: 600, color: '#1e40af' }}>{formatMoney(expected)}</td>
                                <td style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'right', fontWeight: 600 }}>{(s.finalAmount || 0).toLocaleString()} FCFA</td>
                                <td style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'right', fontWeight: 600, color: diff === 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                                  {diff === 0 ? 'Équilibré' : `${diff > 0 ? '+' : ''}${formatMoney(diff)}`}
                                </td>
                                <td style={{ padding: '10px 14px' }}><Badge variant="success">Clôturée</Badge></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal ouverture */}
      <Modal
        open={showOpen}
        onClose={() => setShowOpen(false)}
        title="Ouvrir la caisse"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowOpen(false)} disabled={isBusy}>Annuler</Button>
            <Button variant="primary" onClick={handleOpen} disabled={isBusy}>{isBusy ? 'Ouverture...' : 'Ouvrir'}</Button>
          </>
        }
      >
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Fonds de caisse initial (FCFA)</div>
          <input
            autoFocus
            style={inputStyle}
            type="text"
            inputMode="numeric"
            value={initialFund}
            onChange={e => setInitialFund(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') handleOpen(); }}
            placeholder="Ex : 50000"
          />
        </div>
      </Modal>

      {/* Modal fermeture */}
      <Modal
        open={showClose}
        onClose={() => { if (!isBusy) { setShowClose(false); setClosingSessionId(null); } }}
        title={closingSession && closingSession.id !== openSession?.id ? `Régulariser la session du ${new Date(closingSession.openedAt).toLocaleDateString('fr-FR')}` : 'Fermer la caisse'}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowClose(false); setClosingSessionId(null); }} disabled={isBusy}>Annuler</Button>
            <Button variant="warning" onClick={handleClose} disabled={isBusy}>{isBusy ? 'Clôture...' : 'Fermer la caisse'}</Button>
          </>
        }
      >
        <div style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', padding: '12px', marginBottom: '16px', fontSize: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Montant attendu</span>
            <span style={{ fontWeight: 600 }}>{formatMoney(closingExpected)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Écart prévisionnel</span>
            <span style={{ fontWeight: 600, color: closingDiffPreview === 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
              {closingDiffPreview === 0 ? 'Équilibré' : `${closingDiffPreview > 0 ? '+' : ''}${formatMoney(closingDiffPreview)}`}
            </span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Montant réel en caisse (FCFA)</div>
          <input
            autoFocus
            style={inputStyle}
            type="text"
            inputMode="numeric"
            value={finalAmount}
            onChange={e => setFinalAmount(e.target.value.replace(/\D/g, ''))}
            placeholder="Ex : 150000"
          />
        </div>
      </Modal>
    </div>
  );
}
