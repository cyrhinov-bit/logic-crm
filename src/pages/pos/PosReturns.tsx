import { useEffect, useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../components/ConfirmModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus, RotateCcw, Eye, X, XCircle, Trash2, ArrowLeftRight, CheckCircle2, ShieldAlert, Banknote, ListRestart, ArrowLeft } from 'lucide-react';
import { todayLocalKey, toLocalDayKey } from '../../lib/dates';
import type { ExchangeLine } from '../../context/AppContext';
import { matchesSearchQuery, matchesProductSearch, cleanCode } from '../../lib/searchUtils';

interface ReturnLine {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reason: string;
  maxQuantity: number;
}

export default function PosReturns() {
  const { posReturns, posTransactions, addPosReturn, cancelPosReturn, posProducts, posCashSessions, addPosTransaction, voidPosTransaction, updatePosReturn } = useAppContext();
  const { currentUser } = useAuth();
  const today = todayLocalKey();
  const openSession = posCashSessions.find(s => s.status === 'Ouverte' && toLocalDayKey(s.openedAt) === today && s.cashierId === currentUser?.id);
  const { confirm } = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('Tous');
  const [filterStatus, setFilterStatus] = useState<string>('Tous');
  
  const [showForm, setShowForm] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState('');
  const [returnType, setReturnType] = useState<'Retour simple' | 'Retour avec échange'>('Retour simple');
  
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [exchangeLines, setExchangeLines] = useState<ExchangeLine[]>([]);
  const [notes, setNotes] = useState('');
  const [refundMethod, setRefundMethod] = useState<'Espèces' | 'Mobile Money'>('Espèces');
  const [complementMethod, setComplementMethod] = useState<'Espèces' | 'Mobile Money'>('Espèces');
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  
  // Nouveaux états pour la recherche de ticket
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketSearchResults, setTicketSearchResults] = useState<typeof posTransactions>([]);
  const [ticketSearched, setTicketSearched] = useState(false);
  const [ticketSearchMessage, setTicketSearchMessage] = useState('');
  
  const [detailReturn, setDetailReturn] = useState<string | null>(null);
  
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const role = currentUser?.role;
  const posRole = (currentUser as any)?.posRole;
  const isReturnManager = role === 'Directeur' || role === 'Directeur adjoint' || role === 'SuperAdmin' || role === 'Gerant' || posRole === 'Gerant';
  // Aligné sur la route (Directeur, Gerant, Caissier) : Caissier (rôle ou posRole) uniquement avec module Retours
  const canHandleReturns = isReturnManager || ((role === 'Caissier' || posRole === 'Caissier') && !!currentUser?.posReturnsEnabled);

  const filteredReturns = useMemo(() => {
    return posReturns.filter(r => {
      const matchSearch = !search || matchesSearchQuery([r.returnNumber, r.type, r.status, r.notes, r.createdBy, r.date], search);
      const matchType = filterType === 'Tous' || r.type === filterType;
      const matchStatus = filterStatus === 'Tous' || r.status === filterStatus;
      return matchSearch && matchType && matchStatus;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [posReturns, search, filterType, filterStatus]);

  // KPI Calculations
  const stats = useMemo(() => {
    let processed = 0;
    let totalRefunds = 0;
    let exchanges = 0;
    
    posReturns.forEach(r => {
      if (r.status === 'Traité') {
        processed++;
        totalRefunds += r.totalRefund || 0;
        if (r.type === 'Retour avec échange') {
          exchanges++;
        }
      }
    });
    
    return {
      total: posReturns.length,
      processed,
      totalRefunds,
      exchanges
    };
  }, [posReturns]);

  const selectedTx = posTransactions.find(t => t.id === selectedTxId);

  useEffect(() => {
    const preselected = (location.state as { selectedTxId?: string } | null)?.selectedTxId;
    if (preselected) {
      setShowForm(true);
      handleSelectTransaction(preselected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const getAlreadyReturned = (txId: string, line: { productId?: string; description: string }) => {
    return posReturns
      .filter(r => r.transactionId === txId && r.status === 'Traité')
      .reduce((sum, r) => sum + r.lines
        .filter(l => (l.productId && l.productId === line.productId) || (!l.productId && l.description === line.description))
        .reduce((a, l) => a + l.quantity, 0), 0);
  };

  const handleSearchTicket = () => {
    setTicketSearched(true);
    setTicketSearchMessage('');
    const term = ticketSearch.trim();
    
    if (!term) {
      setTicketSearchResults([]);
      return;
    }

    const cleanTerm = cleanCode(term);

    // Priorité : correspondance exacte ou nettoyée
    let exactMatches = posTransactions.filter(t => {
      if (t.status !== 'Validée' && t.status !== 'Retournée') return false;
      return cleanCode(t.transactionNumber) === cleanTerm;
    });
    let partialMatches = posTransactions.filter(t => {
      if (t.status !== 'Validée' && t.status !== 'Retournée') return false;
      return cleanCode(t.transactionNumber).includes(cleanTerm) && cleanCode(t.transactionNumber) !== cleanTerm;
    });
    
    let allMatches = [...exactMatches, ...partialMatches];
    
    // Filtrer les tickets déjà entièrement retournés
    const availableMatches = allMatches.filter(tx => {
      const remainingItems = tx.lines.reduce((total, l) => {
        const returned = getAlreadyReturned(tx.id, l);
        return total + Math.max(0, l.quantity - returned);
      }, 0);
      return remainingItems > 0;
    });

    setTicketSearchResults(availableMatches);

    if (allMatches.length > 0 && availableMatches.length === 0) {
      setTicketSearchMessage("Ce ticket a déjà été entièrement retourné.");
    } else if (availableMatches.length === 0) {
      setTicketSearchMessage(`Aucun ticket trouvé pour « ${ticketSearch} ».`);
    }
  };

  const handleSelectTransaction = (txId: string) => {
    setSelectedTxId(txId);
    setExchangeLines([]);
    setTicketSearchResults([]); // Cacher les résultats de recherche après sélection
    const tx = posTransactions.find(t => t.id === txId);
    if (tx) {
      // R5 : méthode de remboursement pré-remplie avec celle d'origine (pas Espèces
      // par défaut — sinon une vente 100 % mobile débite le tiroir à tort).
      const originMethod = tx.payments?.[0]?.method;
      setRefundMethod(originMethod === 'Mobile Money' ? 'Mobile Money' : 'Espèces');
      setComplementMethod(originMethod === 'Mobile Money' ? 'Mobile Money' : 'Espèces');
      setReturnLines(tx.lines.map(l => {
        const returned = getAlreadyReturned(tx.id, l);
        const maxQuantity = Math.max(0, l.quantity - returned);
        
        return {
          productId: l.productId,
          description: l.description,
          quantity: 0,
          unitPrice: l.unitPrice, // STRICTEMENT LE PRIX DU TICKET (RÈGLE 1, 2, 4)
          total: 0,
          reason: '',
          maxQuantity,
        };
      }));
    }
  };

  const updateLineQuantity = (idx: number, qty: number) => {
    setReturnLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const q = Math.max(0, Math.min(qty, l.maxQuantity));
      return { ...l, quantity: q, total: Math.round(q * l.unitPrice) };
    }));
  };

  const updateLineReason = (idx: number, reason: string) => {
    setReturnLines(prev => prev.map((l, i) => i === idx ? { ...l, reason } : l));
  };

  const addExchangeLine = (product: typeof posProducts[0]) => {
    // Contrôle stock (M10) : pas d'échange au-delà du disponible (les services ne sont pas stockés)
    const isService = product.family === 'Service' || product.reference?.startsWith('SRV-');
    if (!isService) {
      const already = exchangeLines.find(l => l.productId === product.id)?.quantity || 0;
      if (already + 1 > (product.quantity ?? 0)) {
        alert(`Stock insuffisant pour ${product.name} : ${product.quantity ?? 0} disponible(s).`);
        return;
      }
    }
    setExchangeLines(prev => {
      const existing = prev.find(l => l.productId === product.id);
      if (existing) {
        return prev.map(l => l.productId === product.id ? { ...l, quantity: l.quantity + 1, total: Math.round((l.quantity + 1) * l.unitPrice) } : l);
      }
      return [...prev, {
        id: '',
        productId: product.id,
        description: product.name,
        quantity: 1,
        unitPrice: product.sellingPrice, // STRICTEMENT LE PRIX DU CATALOGUE ACTUEL (RÈGLE 12)
        total: product.sellingPrice
      }];
    });
    setShowProductSearch(false);
    setProductSearch('');
  };

  const updateExchangeLineQuantity = (idx: number, qty: number) => {
    if (qty <= 0) {
      setExchangeLines(prev => prev.filter((_, i) => i !== idx));
      return;
    }
    const line = exchangeLines[idx];
    const product = line?.productId ? posProducts.find(p => p.id === line.productId) : undefined;
    const isService = !product || product.family === 'Service' || product.reference?.startsWith('SRV-');
    if (!isService && product && qty > (product.quantity ?? 0)) {
      alert(`Stock insuffisant pour ${product.name} : ${product.quantity ?? 0} disponible(s).`);
      return;
    }
    setExchangeLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      return { ...l, quantity: qty, total: Math.round(qty * l.unitPrice) };
    }));
  };

  const removeExchangeLine = (idx: number) => {
    setExchangeLines(prev => prev.filter((_, i) => i !== idx));
  };

  const totalRefundAmount = returnLines.reduce((s, l) => s + l.total, 0);
  const totalExchangeAmount = returnType === 'Retour avec échange' ? exchangeLines.reduce((s, l) => s + l.total, 0) : 0;
  const difference = totalExchangeAmount - totalRefundAmount;

  const handleCloseForm = () => {
    setShowForm(false);
    setSelectedTxId('');
    setReturnLines([]);
    setExchangeLines([]);
    setNotes('');
    setRefundMethod('Espèces');
    setComplementMethod('Espèces');
    setTicketSearch('');
    setTicketSearchResults([]);
    setTicketSearched(false);
    setTicketSearchMessage('');
  };

  const handleSubmit = async () => {
    if (isSubmittingReturn) return;
    if (!canHandleReturns) { alert('Traitement des retours réservé à la Direction, aux Gérants et aux Caissiers habilités.'); return; }
    if (!selectedTxId) { alert('Sélectionnez la transaction d\'origine du retour.'); return; }
    
    // RÈGLE 13: Sécuriser la validation
    const originalTx = posTransactions.find(t => t.id === selectedTxId);
    if (!originalTx) {
      alert("La transaction d'origine est introuvable.");
      return;
    }

    const validLines = returnLines.filter(l => l.quantity > 0);
    // R6 : validation silencieuse interdite — message explicite.
    if (!validLines.length) {
      alert('Sélectionnez au moins un article avec une quantité supérieure à 0.');
      return;
    }
    // R4 : recontrôle frais des quantités déjà retournées au moment de valider
    // (un autre retour a pu être traité entre la sélection du ticket et la validation).
    for (const line of validLines) {
      const freshMax = Math.max(0, (originalTx.lines.find(l =>
        (l.productId && l.productId === line.productId) || (!l.productId && l.description === line.description)
      )?.quantity || 0) - getAlreadyReturned(originalTx.id, line));
      if (line.quantity > freshMax) {
        alert(`Quantité invalide pour ${line.description} : déjà retournée entre-temps (reste : ${freshMax}).`);
        return;
      }
    }

    for (const line of validLines) {
      const originalLine = originalTx.lines.find(l => 
        (l.productId && l.productId === line.productId) || (!l.productId && l.description === line.description)
      );
      if (!originalLine) {
        alert(`L'article ${line.description} n'existe pas dans le ticket d'origine.`);
        return;
      }
      if (line.unitPrice !== originalLine.unitPrice) {
        alert(`Erreur de sécurité : le prix de l'article ${line.description} ne correspond pas au prix du ticket.`);
        return;
      }
      if (line.quantity > line.maxQuantity) {
        alert(`Erreur : quantité invalide pour l'article ${line.description}.`);
        return;
      }
    }

    if (returnType === 'Retour avec échange' && !exchangeLines.length) {
      alert('Veuillez sélectionner au moins un nouvel article pour l\'échange.');
      return;
    }

    const returnNumber = `RET-${Date.now().toString(36).toUpperCase()}`;
    const returnId = uuidv4();
    const totalRefund = difference < 0 ? Math.abs(difference) : 0;
    const amountToPay = difference > 0 ? difference : 0;

    // R1 : un remboursement en espèces sort du tiroir → session ouverte exigée
    // (comme pour le complément). Sans session, la sortie serait invisible en caisse.
    if (totalRefund > 0 && refundMethod === 'Espèces' && !openSession) {
      alert("Remboursement en espèces impossible : ouvrez d'abord votre session de caisse pour imputer la sortie du tiroir.");
      return;
    }

    // Complément d'échange (B7) : de l'argent est ENCAISSÉ → session obligatoire + transaction dédiée
    if (amountToPay > 0 && !openSession) {
      alert("Un complément est dû par le client : ouvrez d'abord votre session de caisse pour l'encaisser.");
      return;
    }

    setIsSubmittingReturn(true);
    try {
      let complementTransactionId: string | undefined;
      if (amountToPay > 0 && openSession) {
        const complementId = uuidv4();
        await addPosTransaction({
          id: complementId,
          transactionNumber: `CMP-${Date.now().toString(36).toUpperCase()}`,
          cashierId: currentUser?.id,
          sessionId: openSession.id,
          date: new Date().toISOString(),
          subtotal: amountToPay,
          vat: 0,
          discountAmount: 0,
          total: amountToPay,
          receivedAmount: amountToPay,
          changeAmount: 0,
          status: 'Validée',
          // Ligne descriptive sans produit : le stock a déjà été mouvementé via les lignes d'échange
          lines: [{
            id: uuidv4(),
            description: `Complément d'échange ${returnNumber}`,
            quantity: 1,
            unitPrice: amountToPay,
            discountPercent: 0,
            discountAmount: 0,
            total: amountToPay
          }],
          payments: [{ id: uuidv4(), method: complementMethod, amount: amountToPay }]
        });
        complementTransactionId = complementId;
      }

      await addPosReturn({
        id: returnId,
        returnNumber,
        transactionId: selectedTxId,
        sessionId: openSession?.id,
        date: new Date().toISOString(),
        type: returnType,
        totalRefund,
        totalExchange: returnType === 'Retour avec échange' ? totalExchangeAmount : 0,
        amountToPay,
        refundMethod: totalRefund > 0 ? refundMethod : undefined,
        complementTransactionId,
        status: 'Traité',
        // RÈGLE 14: Les lignes sauvegardées utilisent le prix historique stocké dans returnLines
        lines: validLines.map(l => ({ id: uuidv4(), ...l })),
        exchangeLines: returnType === 'Retour avec échange' ? exchangeLines.map(l => ({ ...l, id: uuidv4() })) : undefined,
        notes,
        createdBy: currentUser?.id || currentUser?.name
      });

      handleCloseForm();
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const detailObj = detailReturn ? posReturns.find(r => r.id === detailReturn) : null;

  const handleCancelReturn = (r: typeof posReturns[number]) => {
    if (!canHandleReturns) { alert('Annulation des retours réservée à la Direction, aux Gérants et aux Caissiers habilités.'); return; }
    confirm({
      title: 'Annuler le retour',
      message: `Voulez-vous annuler le retour ${r.returnNumber} ? Les stocks seront ré-inversés et les impacts financiers annulés.`,
      variant: 'warning',
      confirmLabel: 'Annuler le retour',
      onConfirm: async () => {
        const ok = await cancelPosReturn(r.id);
        if (ok) toast.success('Retour annulé, stocks ré-inversés.');
      },
    });
  };

  const filteredProducts = posProducts.filter(p => {
    if (p.isActive === false || p.status === 'Inactive') return false;
    if (!productSearch || !productSearch.trim()) return true;
    return matchesProductSearch(p, productSearch);
  });

  return (
    <div className="pos-page" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <button onClick={() => navigate('/pos')} style={{ marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', color: 'var(--color-text)' }} title="Retour au tableau de bord">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <RotateCcw size={24} color="var(--color-primary)" />
              Retours & Échanges
            </h1>
            <p style={{ color: 'var(--color-text-muted)', marginTop: '4px', fontSize: '14px' }}>
              Gérez les retours clients, remboursements et échanges de produits.
            </p>
          </div>
        </div>
        {canHandleReturns && (
          <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'var(--color-primary)', color: 'white', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 500, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <Plus size={16} /> Nouveau retour
          </button>
        )}
      </div>

      {/* BANNIÈRE CAISSIER */}
      {!canHandleReturns && (
        <div style={{ padding: '16px', background: 'var(--color-warning-tint)', border: '1px solid var(--color-warning)', color: 'var(--color-warning-strong)', borderRadius: 'var(--radius-md)', marginBottom: '24px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <ShieldAlert size={20} style={{ marginTop: '2px' }} />
          <div>
            <h3 style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Accès limité</h3>
            <p style={{ fontSize: '13px' }}>Vous êtes connecté en tant que Caissier. Vous pouvez consulter l'historique, mais vous n'avez pas les droits nécessaires pour traiter ou annuler un retour.</p>
          </div>
        </div>
      )}

      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'white', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Total retours</span>
            <RotateCcw size={16} color="var(--color-text-muted)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{stats.total}</div>
        </div>
        
        <div style={{ background: 'white', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Traités</span>
            <CheckCircle2 size={16} color="var(--color-success)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{stats.processed}</div>
        </div>

        <div style={{ background: 'white', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Remboursements</span>
            <Banknote size={16} color="var(--color-error)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{stats.totalRefunds.toLocaleString()} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-muted)' }}>FCFA</span></div>
        </div>

        <div style={{ background: 'white', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Échanges</span>
            <ArrowLeftRight size={16} color="var(--color-primary)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{stats.exchanges}</div>
        </div>
      </div>

      {/* FILTRES & RECHERCHE */}
      <div style={{ background: 'white', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 300px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input autoFocus style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }} placeholder="Rechercher un retour, un ticket..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none', background: 'white' }}>
            <option value="Tous">Tous les types</option>
            <option value="Retour simple">Retour simple</option>
            <option value="Retour avec échange">Retour avec échange</option>
          </select>
          
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none', background: 'white' }}>
            <option value="Tous">Tous les statuts</option>
            <option value="Traité">Traité</option>
            <option value="Annulé">Annulé</option>
          </select>

          {(search || filterType !== 'Tous' || filterStatus !== 'Tous') && (
            <button onClick={() => { setSearch(''); setFilterType('Tous'); setFilterStatus('Tous'); }} style={{ padding: '10px 16px', background: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-muted)' }}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* TABLEAU */}
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        {filteredReturns.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead><tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', background: 'var(--color-surface)' }}>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Retour</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Transaction</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Date</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Type</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Statut</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Remboursement</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>À payer</th>
                <th style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center' }}>Actions</th>
              </tr></thead>
              <tbody>
                {filteredReturns.map(r => {
                  const tx = posTransactions.find(t => t.id === r.transactionId);
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--color-surface-alt)', transition: 'background 0.2s' }}>
                      <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 600, fontFamily: 'monospace' }}>{r.returnNumber}</td>
                      <td style={{ padding: '14px 16px', fontSize: '14px', color: 'var(--color-text-muted)' }}>{tx?.transactionNumber || '-'}</td>
                      <td style={{ padding: '14px 16px', fontSize: '14px' }}>{new Date(r.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-lg)', fontSize: '12px', fontWeight: 500, background: r.type === 'Retour simple' ? 'var(--color-warning-tint)' : 'var(--color-primary-tint)', color: r.type === 'Retour simple' ? 'var(--color-warning-strong)' : 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {r.type === 'Retour simple' ? <RotateCcw size={12} /> : <ArrowLeftRight size={12} />}
                          {r.type}
                        </span>
                      </td>
                      
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-lg)', fontSize: '12px', fontWeight: 500, background: r.status === 'Traité' ? 'var(--color-success-tint)' : r.status === 'Annulé' ? 'var(--color-error-tint)' : 'var(--color-surface-alt)', color: r.status === 'Traité' ? 'var(--color-success)' : r.status === 'Annulé' ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
                          {r.status}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px', fontSize: '14px', textAlign: 'right', fontWeight: 600, color: r.totalRefund > 0 ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
                        {r.totalRefund > 0 ? `${r.totalRefund.toLocaleString()} FCFA` : '-'}
                      </td>
                      
                      <td style={{ padding: '14px 16px', fontSize: '14px', textAlign: 'right', fontWeight: 600, color: r.amountToPay > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                        {r.amountToPay > 0 ? `${r.amountToPay.toLocaleString()} FCFA` : '-'}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button onClick={() => setDetailReturn(r.id)} title="Voir les détails" style={{ padding: '6px', background: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}>
                            <Eye size={16} color="var(--color-text-muted)" />
                          </button>
                          {r.status === 'Traité' && canHandleReturns && (
                            <button onClick={() => handleCancelReturn(r)} title="Annuler le retour" style={{ padding: '6px', background: 'var(--color-error-tint)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}>
                              <XCircle size={16} color="var(--color-error)" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
</div>
          </div>
        ) : (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-surface-alt)', marginBottom: '16px' }}>
              <ListRestart size={32} color="var(--color-text-muted)" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Aucun retour trouvé</h3>
            <p style={{ color: 'var(--color-text-muted)', maxWidth: '400px', margin: '0 auto', fontSize: '14px' }}>
              Aucun retour ou échange ne correspond à votre recherche.
            </p>
            {canHandleReturns && posReturns.length === 0 && (
              <button onClick={() => setShowForm(true)} style={{ marginTop: '24px', padding: '10px 20px', background: 'var(--color-primary)', color: 'white', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                Créer un retour
              </button>
            )}
          </div>
        )}
      </div>

      {/* FORMULAIRE NOUVEAU RETOUR (5 ÉTAPES) */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '900px', maxHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface)' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Nouveau retour / échange</h2>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Sélectionnez une vente puis indiquez les articles retournés.</p>
              </div>
              <button onClick={handleCloseForm} style={{ background: 'var(--color-surface-alt)', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              
              {/* ETAPE 1 */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ background: 'var(--color-surface-alt)', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>1</span> Type d'opération</h3>
                <div className="responsive-form-grid">
                  <div onClick={() => setReturnType('Retour simple')} style={{ padding: '16px', border: `2px solid ${returnType === 'Retour simple' ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', background: returnType === 'Retour simple' ? 'var(--color-primary-tint)' : 'white' }}>
                    <div style={{ fontWeight: 600, fontSize: '15px', color: returnType === 'Retour simple' ? 'var(--color-primary)' : 'var(--color-text)' }}>Retour simple</div>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Rembourser les articles retournés.</div>
                  </div>
                  <div onClick={() => setReturnType('Retour avec échange')} style={{ padding: '16px', border: `2px solid ${returnType === 'Retour avec échange' ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', background: returnType === 'Retour avec échange' ? 'var(--color-primary-tint)' : 'white' }}>
                    <div style={{ fontWeight: 600, fontSize: '15px', color: returnType === 'Retour avec échange' ? 'var(--color-primary)' : 'var(--color-text)' }}>Retour avec échange</div>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Remplacer les articles par d'autres produits.</div>
                  </div>
                </div>
              </div>

              {/* ETAPE 2 */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ background: 'var(--color-surface-alt)', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>2</span> Rechercher le ticket de vente</h3>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input 
                      type="text" 
                      placeholder="Ex : hnv1790426658400 ou derniers chiffres..." 
                      value={ticketSearch} 
                      onChange={e => setTicketSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearchTicket()}
                      style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}
                    />
                  </div>
                  <button onClick={handleSearchTicket} style={{ padding: '10px 16px', background: 'var(--color-primary)', color: 'white', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                    Rechercher
                  </button>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                  Indiquez le numéro de ticket (ex : <strong>hnv1790...</strong>) imprimé sur le reçu client ou visible dans l'historique des ventes.
                </div>
                
                {ticketSearched && ticketSearchResults.length === 0 && (
                  <div style={{ padding: '12px', background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-md)', fontSize: '14px', textAlign: 'center' }}>
                    {ticketSearchMessage || 'Aucun résultat.'}
                  </div>
                )}

                {ticketSearchResults.length > 0 && !selectedTxId && (
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    {ticketSearchResults.map(t => (
                      <div key={t.id} style={{ padding: '16px', borderBottom: '1px solid var(--color-surface-alt)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{t.transactionNumber}</div>
                          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                            {new Date(t.date).toLocaleDateString('fr-FR')} &bull; Total : {t.total.toLocaleString()} FCFA &bull; Articles : {t.lines.reduce((s,l) => s + l.quantity, 0)}
                          </div>
                        </div>
                        <button onClick={() => handleSelectTransaction(t.id)} style={{ padding: '6px 12px', background: 'var(--color-surface-alt)', color: 'var(--color-text)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', cursor: 'pointer', fontWeight: 500, fontSize: '13px' }}>
                          Sélectionner
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {selectedTx && (
                  <div style={{ marginTop: '16px', padding: '16px', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>Ticket sélectionné</h4>
                      <button onClick={() => setSelectedTxId('')} style={{ fontSize: '12px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>Changer le ticket</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                      <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Ticket</div><div style={{ fontSize: '14px', fontWeight: 600 }}>{selectedTx.transactionNumber}</div></div>
                      <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Date</div><div style={{ fontSize: '14px', fontWeight: 500 }}>{new Date(selectedTx.date).toLocaleDateString('fr-FR')}</div></div>
                      <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Total de la vente</div><div style={{ fontSize: '14px', fontWeight: 500 }}>{selectedTx.total.toLocaleString()} FCFA</div></div>
                      <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Articles originaux</div><div style={{ fontSize: '14px', fontWeight: 500 }}>{selectedTx.lines.reduce((s,l) => s + l.quantity, 0)}</div></div>
                    </div>
                  </div>
                )}
              </div>

              {/* ETAPE 3 */}
              {returnLines.length > 0 && selectedTx && (
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ background: 'var(--color-surface-alt)', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>3</span> Articles retournables</h3>
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: 'var(--color-surface-alt)' }}>
                        <tr style={{ textAlign: 'left' }}>
                          <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Produit</th>
                          <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Prix ticket</th>
                          <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center' }}>Restante</th>
                          <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center' }}>Retour</th>
                          <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Total retour</th>
                          <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Motif</th>
                        </tr>
                      </thead>
                      <tbody>
                        {returnLines.map((line, idx) => {
                          const originalLine = selectedTx.lines.find(l => (l.productId && l.productId === line.productId) || (!l.productId && l.description === line.description));
                          const qtyVendue = originalLine?.quantity || 0;
                          return (
                            <tr key={idx} style={{ borderTop: '1px solid var(--color-border)', background: line.quantity > 0 ? 'var(--color-primary-tint)' : 'white' }}>
                              <td style={{ padding: '12px', fontSize: '14px', fontWeight: 500 }}>
                                {line.description}
                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Qté vendue : {qtyVendue}</div>
                              </td>
                              <td style={{ padding: '12px', fontSize: '13px' }}>{line.unitPrice.toLocaleString()} FCFA</td>
                              <td style={{ padding: '12px', fontSize: '13px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{line.maxQuantity}</td>
                              <td style={{ padding: '12px', textAlign: 'center' }}>
                                <input type="number" min={0} max={line.maxQuantity} value={line.quantity} onChange={e => updateLineQuantity(idx, parseInt(e.target.value) || 0)} style={{ width: '60px', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '14px', textAlign: 'center', outline: 'none' }} />
                              </td>
                              <td style={{ padding: '12px', fontSize: '14px', textAlign: 'right', fontWeight: 600 }}>{line.total.toLocaleString()} FCFA</td>
                              <td style={{ padding: '12px' }}>
                                <input type="text" placeholder="Ex: Produit défectueux..." value={line.reason} onChange={e => updateLineReason(idx, e.target.value)} disabled={line.quantity === 0} style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '13px', outline: 'none', background: line.quantity === 0 ? 'var(--color-surface-alt)' : 'white' }} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
</div>
                  </div>
                  <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
                    Valeur totale retournée : <strong style={{ color: 'var(--color-text)', fontSize: '16px' }}>{totalRefundAmount.toLocaleString()} FCFA</strong>
                  </div>
                </div>
              )}

              {/* ETAPE 4 */}
              {returnType === 'Retour avec échange' && selectedTx && (
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ background: 'var(--color-surface-alt)', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>4</span> Nouveaux articles</h3>
                    <button onClick={() => setShowProductSearch(true)} style={{ padding: '6px 12px', background: 'white', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Plus size={14} /> Ajouter un article
                    </button>
                  </div>
                  
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', minHeight: '60px', display: 'flex', flexDirection: 'column' }}>
                    {exchangeLines.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>Aucun article sélectionné pour l'échange.</div>
                    ) : (
                      <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'var(--color-surface-alt)' }}>
                          <tr style={{ textAlign: 'left' }}>
                            <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Produit</th>
                            <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Prix actuel</th>
                            <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center' }}>Quantité</th>
                            <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Total</th>
                            <th style={{ padding: '12px', width: '40px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {exchangeLines.map((line, idx) => (
                            <tr key={idx} style={{ borderTop: '1px solid var(--color-border)' }}>
                              <td style={{ padding: '12px', fontSize: '14px', fontWeight: 500 }}>{line.description}</td>
                              <td style={{ padding: '12px', fontSize: '13px' }}>{line.unitPrice.toLocaleString()} FCFA</td>
                              <td style={{ padding: '12px', textAlign: 'center' }}>
                                <input type="number" min={1} value={line.quantity} onChange={e => updateExchangeLineQuantity(idx, parseInt(e.target.value) || 0)} style={{ width: '60px', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '14px', textAlign: 'center', outline: 'none' }} />
                              </td>
                              <td style={{ padding: '12px', fontSize: '14px', textAlign: 'right', fontWeight: 600 }}>{line.total.toLocaleString()} FCFA</td>
                              <td style={{ padding: '12px', textAlign: 'center' }}>
                                <button onClick={() => removeExchangeLine(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }} title="Retirer"><Trash2 size={16} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
</div>
                    )}
                  </div>
                  {exchangeLines.length > 0 && (
                    <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
                      Valeur totale échangée : <strong style={{ color: 'var(--color-primary)', fontSize: '16px' }}>{totalExchangeAmount.toLocaleString()} FCFA</strong>
                    </div>
                  )}
                </div>
              )}

              {/* NOTES + MODES DE RÈGLEMENT */}
              {selectedTx && (
                <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '2 1 260px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text)' }}>Notes internes (optionnel)</label>
                    <textarea placeholder="Ajouter une remarque concernant cette opération..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', resize: 'vertical', outline: 'none' }} />
                  </div>
                  <div style={{ flex: '1 1 180px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text)' }}>Mode de remboursement</label>
                    <select value={refundMethod} onChange={e => setRefundMethod(e.target.value as any)} style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}>
                      <option value="Espèces">Espèces (tiroir)</option>
                      <option value="Mobile Money">Mobile Money</option>
                    </select>
                    {difference > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text)' }}>Encaissement du complément</label>
                        <select value={complementMethod} onChange={e => setComplementMethod(e.target.value as any)} style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}>
                          <option value="Espèces">Espèces (tiroir)</option>
                          <option value="Mobile Money">Mobile Money</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* ETAPE 5: FOOTER & RESUME */}
            {selectedTx && (
              <div style={{ padding: '20px 24px', background: 'var(--color-surface-alt)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {returnType === 'Retour simple' ? (
                    <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
                      Montant à rembourser : <strong style={{ fontSize: '18px', color: 'var(--color-error)' }}>{totalRefundAmount.toLocaleString()} FCFA</strong>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Valeur retournée : {totalRefundAmount.toLocaleString()} FCFA &bull; Valeur nouvel article : {totalExchangeAmount.toLocaleString()} FCFA</div>
                      {difference > 0 && <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Complément à payer : <strong style={{ fontSize: '18px', color: 'var(--color-primary)' }}>{difference.toLocaleString()} FCFA</strong></div>}
                      {difference < 0 && <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Remboursement à effectuer : <strong style={{ fontSize: '18px', color: 'var(--color-error)' }}>{Math.abs(difference).toLocaleString()} FCFA</strong></div>}
                      {difference === 0 && <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Échange : <strong style={{ fontSize: '18px', color: 'var(--color-success)' }}>Équilibré (0 FCFA)</strong></div>}
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={handleCloseForm} style={{ padding: '10px 20px', background: 'white', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
                    Annuler
                  </button>
                  <button onClick={handleSubmit} disabled={isSubmittingReturn || !returnLines.length || returnLines.every(l => l.quantity === 0)} style={{ padding: '10px 20px', background: 'var(--color-primary)', color: 'white', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 500, opacity: (isSubmittingReturn || !returnLines.length || returnLines.every(l => l.quantity === 0)) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RotateCcw size={16} />
                    {isSubmittingReturn ? 'Traitement...' : (returnType === 'Retour simple' ? 'Valider le retour' : 'Valider l\'échange')}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MODALE CATALOGUE (NOUVEAUX ARTICLES) */}
      {showProductSearch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '24px' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '600px', height: '600px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Ajouter un article à l'échange</h3>
              <button onClick={() => setShowProductSearch(false)} style={{ background: 'var(--color-surface-alt)', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>
            
            <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input style={{ width: '100%', padding: '12px 12px 12px 36px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }} placeholder="Rechercher par nom, référence ou code-barres..." value={productSearch} onChange={e => setProductSearch(e.target.value)} autoFocus />
              </div>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredProducts.slice(0, 30).map(p => (
                <div key={p.id} onClick={() => addExchangeLine(p)} style={{ padding: '16px', borderBottom: '1px solid var(--color-surface-alt)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-alt)'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>{p.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Réf. : {p.reference} &nbsp;&bull;&nbsp; Stock : <span style={{ color: p.quantity > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>{p.quantity}</span></div>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-primary)' }}>{p.sellingPrice.toLocaleString()} FCFA</div>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  <Search size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <div>Aucun produit ne correspond à votre recherche.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODALE DÉTAIL DU RETOUR */}
      {detailObj && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '700px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Détail du retour</h2>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>{detailObj.returnNumber} &bull; {new Date(detailObj.date).toLocaleString('fr-FR')}</div>
              </div>
              <button onClick={() => setDetailReturn(null)} style={{ background: 'var(--color-surface-alt)', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', background: 'var(--color-surface-alt)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>
                <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Statut</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: detailObj.status === 'Traité' ? 'var(--color-success)' : detailObj.status === 'Annulé' ? 'var(--color-error)' : 'var(--color-text)' }}>{detailObj.status}</div>
                </div>
                <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Type</div><div style={{ fontSize: '13px', fontWeight: 500 }}>{detailObj.type}</div></div>
                <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Transaction originale</div><div style={{ fontSize: '13px', fontWeight: 500, fontFamily: 'monospace' }}>{posTransactions.find(t => t.id === detailObj.transactionId)?.transactionNumber || '-'}</div></div>
                <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Opérateur</div><div style={{ fontSize: '13px', fontWeight: 500 }}>{detailObj.createdBy || '-'}</div></div>
              </div>

              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: 'var(--color-text)' }}>Articles retournés</h3>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '24px' }}>
                <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--color-surface-alt)' }}>
                    <tr style={{ textAlign: 'left' }}>
                      <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Article</th>
                      <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center' }}>Qté</th>
                      <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Prix Unitaire</th>
                      <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Total</th>
                      <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailObj.lines.map((l, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '12px', fontSize: '13px', fontWeight: 500 }}>{l.description}</td>
                        <td style={{ padding: '12px', fontSize: '13px', textAlign: 'center' }}>{l.quantity}</td>
                        <td style={{ padding: '12px', fontSize: '13px', textAlign: 'right' }}>{l.unitPrice.toLocaleString()} FCFA</td>
                        <td style={{ padding: '12px', fontSize: '13px', textAlign: 'right', fontWeight: 600 }}>{l.total.toLocaleString()} FCFA</td>
                        <td style={{ padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }}>{l.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
</div>
              </div>

              {detailObj.exchangeLines && detailObj.exchangeLines.length > 0 && (
                <>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: 'var(--color-text)' }}>Articles remis en échange</h3>
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '24px' }}>
                    <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: 'var(--color-surface-alt)' }}>
                        <tr style={{ textAlign: 'left' }}>
                          <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Article</th>
                          <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center' }}>Qté</th>
                          <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Prix Unitaire</th>
                          <th style={{ padding: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailObj.exchangeLines.map((l, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '12px', fontSize: '13px', fontWeight: 500 }}>{l.description}</td>
                            <td style={{ padding: '12px', fontSize: '13px', textAlign: 'center' }}>{l.quantity}</td>
                            <td style={{ padding: '12px', fontSize: '13px', textAlign: 'right' }}>{l.unitPrice.toLocaleString()} FCFA</td>
                            <td style={{ padding: '12px', fontSize: '13px', textAlign: 'right', fontWeight: 600 }}>{l.total.toLocaleString()} FCFA</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
</div>
                  </div>
                </>
              )}

              <div style={{ background: 'var(--color-surface-alt)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Valeur retournée :</span>
                    <span style={{ fontWeight: 600 }}>{detailObj.lines.reduce((s,l) => s + l.total, 0).toLocaleString()} FCFA</span>
                  </div>
                  {detailObj.type === 'Retour avec échange' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Valeur échangée :</span>
                      <span style={{ fontWeight: 600 }}>{(detailObj.exchangeLines || []).reduce((s,l) => s + l.total, 0).toLocaleString()} FCFA</span>
                    </div>
                  )}
                  
                  <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />
                  
                  {detailObj.totalRefund > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', color: 'var(--color-error)' }}>
                      <span style={{ fontWeight: 600 }}>Remboursement :</span>
                      <span style={{ fontWeight: 700 }}>{detailObj.totalRefund.toLocaleString()} FCFA</span>
                    </div>
                  )}
                  {detailObj.amountToPay > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', color: 'var(--color-primary)' }}>
                      <span style={{ fontWeight: 600 }}>Complément payé :</span>
                      <span style={{ fontWeight: 700 }}>{detailObj.amountToPay.toLocaleString()} FCFA</span>
                    </div>
                  )}
                  {detailObj.amountToPay === 0 && detailObj.totalRefund === 0 && detailObj.type === 'Retour avec échange' && (
                    <div style={{ textAlign: 'center', fontSize: '16px', color: 'var(--color-success)', fontWeight: 700, marginTop: '4px' }}>
                      Échange équilibré
                    </div>
                  )}
                </div>
              </div>

              {detailObj.notes && (
                <div style={{ marginTop: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: 'var(--color-text)' }}>Notes</h3>
                  <div style={{ background: 'var(--color-surface-alt)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    {detailObj.notes}
                  </div>
                </div>
              )}
            </div>
            
            <div style={{ padding: '20px 24px', background: 'var(--color-surface-alt)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setDetailReturn(null)} style={{ padding: '10px 20px', background: 'white', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
