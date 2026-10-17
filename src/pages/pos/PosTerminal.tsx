import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Search, Trash2, Plus, Minus, Clock, ArrowLeft, Package, RefreshCw, AlertTriangle, Info, ShieldCheck, Printer, Wallet, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { barcodeScannerService } from '../../features/products/services/BarcodeScannerService';
import ProductImage from '../../features/products/images/ProductImage';
import ReceiptTicket from '../../components/pos/ReceiptTicket';
import type { ReceiptData } from '../../components/pos/ReceiptTicket';
import { printReceiptViaIframe } from '../../lib/receiptHtml';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { toast } from 'react-hot-toast';
import { platform } from '../../platform';
import { todayLocalKey, toLocalDayKey } from '../../lib/dates';
import { matchesProductSearch } from '../../lib/searchUtils';
import { calculateCartMargin } from '../../features/pos/services/PosAiService';

interface CartItem { id: string; productId: string; name: string; reference: string; unitPrice: number; quantity: number; discountType: 'none' | 'percent' | 'amount'; discountPercent: number; discountAmount: number; total: number; }

export default function PosTerminal() {
  const navigate = useNavigate();
  const { posProducts, posSettings, posCashSessions, posTransactions, posReturns, addPosTransaction, addPosCashSession, suspendedCarts, addSuspendedCart, removeSuspendedCart, settings: crmSettings, refreshData, posDiscounts } = useAppContext();
  const { currentUser } = useAuth();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (posProducts.length <= 7) {
      refreshData();
    }
  }, [posProducts.length, refreshData]);

  const [cart, setCart] = useState<CartItem[]>(() => {
    if (!currentUser) return [];
    try { const saved = localStorage.getItem(`pos_active_cart_${currentUser.id}`); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>(() => {
    if (!currentUser) return 'none';
    return (localStorage.getItem(`pos_active_discount_type_${currentUser.id}`) as any) || 'none';
  });
  const [discountValue, setDiscountValue] = useState(() => {
    if (!currentUser) return 0;
    return Number(localStorage.getItem(`pos_active_discount_value_${currentUser.id}`)) || 0;
  });

  useEffect(() => { if (currentUser) localStorage.setItem(`pos_active_cart_${currentUser.id}`, JSON.stringify(cart)); }, [cart, currentUser]);
  useEffect(() => { if (currentUser) localStorage.setItem(`pos_active_discount_type_${currentUser.id}`, discountType); }, [discountType, currentUser]);
  useEffect(() => { if (currentUser) localStorage.setItem(`pos_active_discount_value_${currentUser.id}`, String(discountValue)); }, [discountValue, currentUser]);

  const [paymentMethod, setPaymentMethod] = useState<'Espèces' | 'Mobile Money' | 'Mixte'>('Espèces');
  const [cashAmount, setCashAmount] = useState<number | ''>('');
  const [mobileAmount, setMobileAmount] = useState<number | ''>('');
  const [showPayment, setShowPayment] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const paymentInProgressRef = useRef(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [initialFund, setInitialFund] = useState('');
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReference, setSuspendReference] = useState('');
  const [showSuspendedList, setShowSuspendedList] = useState(false);
  const [selectedCartIndex, setSelectedCartIndex] = useState(0);
  
  const [selectedFamily, setSelectedFamily] = useState<'all' | 'Livre' | 'Fourniture'>('all');
  const [showCashierBreakdownModal, setShowCashierBreakdownModal] = useState(false);
  const today = todayLocalKey();
  // T3 : session strictement personnelle — une session sans caissier n'est plus
  // réutilisée par un autre caissier (tiroirs mélangés).
  const openSession = posCashSessions.find(s => s.status === 'Ouverte' && toLocalDayKey(s.openedAt) === today && s.cashierId === currentUser?.id);

  const sessionTxs = useMemo(() => {
    if (!openSession) return [];
    return posTransactions.filter(t => t.sessionId === openSession.id && t.status === 'Validée');
  }, [posTransactions, openSession]);

  // H4 : vente sans paiement → 0 espèces (jamais le total imputé par défaut).
  const sessionCashSales = useMemo(() => {
    return sessionTxs.reduce((sum, t) => {
      const cash = (t.payments || [])
        .filter(p => p.method === 'Espèces' || p.method === 'Mixte')
        .reduce((a, p) => a + p.amount, 0);
      return sum + cash;
    }, 0);
  }, [sessionTxs]);

  const sessionMobileSales = useMemo(() => {
    return sessionTxs.reduce((sum, t) => {
      const mob = (t.payments || [])
        .filter(p => p.method === 'Mobile Money')
        .reduce((a, p) => a + p.amount, 0);
      return sum + mob;
    }, 0);
  }, [sessionTxs]);

  const sessionGrandTotal = sessionCashSales + sessionMobileSales;

  // Seuls les remboursements en espèces sortent du tiroir (B8) — legacy sans méthode = espèces
  const sessionReturns = useMemo(() => {
    if (!openSession) return 0;
    return posReturns
      .filter(r => r.sessionId === openSession.id && r.status === 'Traité' && r.refundMethod !== 'Mobile Money')
      .reduce((sum, r) => sum + r.totalRefund, 0);
  }, [posReturns, openSession]);

  const expectedDrawerCash = (openSession?.initialFund || 0) + sessionCashSales - sessionReturns;

  const isLivre = (p: typeof posProducts[0]) => (p.family && p.family.toLowerCase().startsWith('livre')) || !!(p.isbn && p.isbn.trim());
  const isFourniture = (p: typeof posProducts[0]) => !isLivre(p);

  const filteredProducts = posProducts.filter(p => {
    if (p.status === 'Inactive' || p.isActive === false) return false;
    if (selectedFamily === 'Livre' && !isLivre(p)) return false;
    if (selectedFamily === 'Fourniture' && !isFourniture(p)) return false;
    if (!search || !search.trim()) return true;
    return matchesProductSearch(p, search);
  });

  const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const addToCart = (product: typeof posProducts[0], qtyToAdd: number = 1) => {
    const isService = product.family === 'Service' || product.reference?.startsWith('SRV-');
    const availableStock = isService ? 999999 : Number(product.quantity ?? 0);

    if (availableStock <= 0) {
      toast.error(`"${product.name}" est en rupture de stock.`);
      return;
    }

    const quantityToAdd = Math.max(1, qtyToAdd);
    let blocked = false;

    setCart(prev => {
      const existing = prev.find(c => c.productId === product.id);
      const currentQty = existing ? existing.quantity : 0;
      const targetQty = currentQty + quantityToAdd;

      if (!isService && targetQty > availableStock) {
        blocked = true;
        return prev;
      }

      if (existing) {
        let total: number;
        if (existing.discountType === 'percent') {
          total = targetQty * existing.unitPrice * (1 - existing.discountPercent / 100);
        } else if (existing.discountType === 'amount') {
          total = targetQty * existing.unitPrice - existing.discountAmount;
        } else {
          total = targetQty * existing.unitPrice;
        }
        return prev.map(c => c.productId === product.id ? { ...c, quantity: targetQty, total } : c);
      }
      return [...prev, { id: uuidv4(), productId: product.id, name: product.name, reference: product.reference, unitPrice: product.sellingPrice, quantity: quantityToAdd, discountType: 'none' as const, discountPercent: 0, discountAmount: 0, total: product.sellingPrice * quantityToAdd }];
    });

    if (blocked) {
      toast.error(`Stock maximal atteint pour "${product.name}" (${availableStock} disponible${availableStock > 1 ? 's' : ''}).`);
    } else {
      setSearch('');
    }
  };

  const handleProductClick = (product: typeof posProducts[0]) => {
    // Anti-rebond : ignore les doubles-clics accidentels espacés de moins de 350ms
    const now = Date.now();
    if (lastClickRef.current.id === product.id && now - lastClickRef.current.time < 350) {
      return;
    }
    lastClickRef.current = { id: product.id, time: now };
    addToCart(product, 1);
  };

  useEffect(() => {
    barcodeScannerService.startKeyboardListener();
    const unsubscribe = barcodeScannerService.subscribe((barcode: string) => {
      const result = barcodeScannerService.searchProduct(barcode, posProducts.filter(p => p.isActive !== false));
      if (result.products.length === 1) {
        addToCart(result.products[0]);
      } else {
        setSearch(barcode);
      }
    });
    return () => {
      unsubscribe();
      barcodeScannerService.stopKeyboardListener();
    };
  }, [posProducts]);

  const updateCartQty = useCallback((id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      const product = posProducts.find(p => p.id === c.productId);
      const isService = product?.family === 'Service' || product?.reference?.startsWith('SRV-');
      const maxStock = isService ? 999999 : Number(product?.quantity ?? 999999);

      if (delta > 0 && !isService && c.quantity + delta > maxStock) {
        toast.error(`Stock maximal atteint (${maxStock} disponible${maxStock > 1 ? 's' : ''})`);
        return c;
      }

      const newQty = Math.max(1, c.quantity + delta);
      const lineDiscount = c.discountType === 'percent' ? c.discountPercent / 100 : 0;
      const lineAmount = c.discountType === 'amount' ? c.discountAmount : 0;
      return { ...c, quantity: newQty, total: newQty * c.unitPrice * (1 - lineDiscount) - lineAmount };
    }));
  }, [posProducts]);

  const setExactCartQty = useCallback((id: string, qty: number) => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      const product = posProducts.find(p => p.id === c.productId);
      const isService = product?.family === 'Service' || product?.reference?.startsWith('SRV-');
      const maxStock = isService ? 999999 : Number(product?.quantity ?? 999999);

      let targetQty = Math.max(1, qty || 1);
      if (!isService && targetQty > maxStock) {
        targetQty = Math.max(1, maxStock);
        toast.error(`Quantité ajustée au stock disponible (${maxStock})`);
      }

      const lineDiscount = c.discountType === 'percent' ? c.discountPercent / 100 : 0;
      const lineAmount = c.discountType === 'amount' ? c.discountAmount : 0;
      return { ...c, quantity: targetQty, total: targetQty * c.unitPrice * (1 - lineDiscount) - lineAmount };
    }));
  }, [posProducts]);

  const updateCartDiscountType = (id: string, type: 'none' | 'percent' | 'amount') => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      if (type === 'none') return { ...c, discountType: type, discountPercent: 0, discountAmount: 0, total: c.quantity * c.unitPrice };
      if (type === 'percent') return { ...c, discountType: type, discountPercent: Math.min(c.discountPercent || 0, percentDiscountCap), discountAmount: 0, total: c.quantity * c.unitPrice * (1 - Math.min(c.discountPercent || 0, percentDiscountCap) / 100) };
      return { ...c, discountType: type, discountPercent: 0, discountAmount: Math.min(c.discountAmount || 0, c.quantity * c.unitPrice, amountDiscountCap), total: c.quantity * c.unitPrice - Math.min(c.discountAmount || 0, c.quantity * c.unitPrice, amountDiscountCap) };
    }));
  };

  const updateCartDiscount = (id: string, type: 'percent' | 'amount', value: number) => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      if (type === 'percent') {
        const disc = Math.min(Math.max(0, value), percentDiscountCap);
        return { ...c, discountType: 'percent', discountPercent: disc, discountAmount: 0, total: c.quantity * c.unitPrice * (1 - disc / 100) };
      }
      const cap = Math.min(Math.max(0, value), c.quantity * c.unitPrice, amountDiscountCap);
      return { ...c, discountType: 'amount', discountPercent: 0, discountAmount: cap, total: c.quantity * c.unitPrice - cap };
    }));
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.id !== id));

  const subtotal = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);
  const cartDiscount = cart.reduce((sum, c) => sum + c.discountAmount + (c.unitPrice * c.quantity * c.discountPercent / 100), 0);
  const afterCartDiscount = subtotal - cartDiscount;
  // Plafonds issus des règles configurées (PosDiscounts, actives) : sans règle, 100 % / sous-total
  const activeRules = (posDiscounts || []).filter(d => d.active !== false);
  const percentRules = activeRules.filter(d => d.type === 'Pourcentage');
  const amountRules = activeRules.filter(d => d.type === 'Montant');
  const percentDiscountCap = percentRules.length > 0 ? Math.min(...percentRules.map(d => Math.max(0, d.maxPercent ?? 100))) : 100;
  const amountDiscountCap = amountRules.length > 0 ? Math.min(...amountRules.map(d => Math.max(0, d.maxAmount ?? Number.MAX_SAFE_INTEGER))) : Number.MAX_SAFE_INTEGER;
  let globalDiscount = 0;
  if (discountType === 'percent') globalDiscount = afterCartDiscount * Math.min(Math.max(0, discountValue), percentDiscountCap) / 100;
  else if (discountType === 'amount') globalDiscount = Math.min(Math.max(0, discountValue), afterCartDiscount, amountDiscountCap);
  const total = Math.max(0, afterCartDiscount - globalDiscount);
  // Valeur globale effectivement appliquée (pour l'affichage marge et la persistance cohérente)
  const effectiveDiscountValue = discountType === 'percent'
    ? Math.min(Math.max(0, discountValue), percentDiscountCap)
    : (discountType === 'amount' ? Math.min(Math.max(0, discountValue), afterCartDiscount, amountDiscountCap) : 0);

  const marginInfo = calculateCartMargin(cart, posProducts, discountType, effectiveDiscountValue);

  const handlePayment = async () => {
    // Idempotence (B1) : garde synchrone anti double-clic / double Enter
    if (paymentInProgressRef.current) return;
    paymentInProgressRef.current = true;
    setIsPaying(true);
    try {
    if (!openSession) { alert('Aucune session caisse ouverte.'); return; }
    if (cart.length === 0) { alert('Panier vide.'); return; }
    // T2 : revalider la session juste avant l'écriture (clôture sur un 2e onglet
    // entre l'ouverture du modal et le paiement → vente orpheline sinon).
    try {
      const latest = posCashSessions.find(s => s.id === openSession.id);
      if (!latest || latest.status !== 'Ouverte') {
        alert('Session de caisse clôturée entre-temps. Rouvrez une session pour encaisser.');
        await refreshData().catch(() => {});
        return;
      }
    } catch { /* garde best-effort sur l'état local */ }

    if (marginInfo.isLoss) {
      const confirmLoss = window.confirm(
        `⚠️ ALERTE RENTABILITÉ : VENTE À PERTE !\n\nCette commande dégage une perte estimée à ${Math.abs(marginInfo.grossMarginAmount).toLocaleString()} FCFA (Marge négative de ${marginInfo.grossMarginRate.toFixed(1)}%).\n\nSouhaitez-vous tout de même forcer la validation du paiement ?`
      );
      if (!confirmLoss) return;
    }

    const receivedCash = Number(cashAmount) || 0;
    const receivedMobile = Number(mobileAmount) || 0;
    
    let receivedTotal = 0;
    if (paymentMethod === 'Espèces') receivedTotal = receivedCash;
    else if (paymentMethod === 'Mobile Money') receivedTotal = receivedMobile;
    else if (paymentMethod === 'Mixte') receivedTotal = receivedCash + receivedMobile;

    if (receivedTotal < total) {
      alert(`Montant reçu insuffisant : l'encaissement (${receivedTotal.toLocaleString()} FCFA) doit être supérieur ou égal au total (${total.toLocaleString()} FCFA).`);
      return;
    }

    const outOfStock = cart.filter(c => {
      const product = posProducts.find(p => p.id === c.productId);
      if (!product) return false;
      const isService = product.family === 'Service' || product.reference?.startsWith('SRV-');
      if (isService) return false;
      return Number(c.quantity) > Number(product.quantity ?? 0);
    });
    if (outOfStock.length > 0) {
      alert(`Stock insuffisant :\n\n` + outOfStock.map(c => {
        const prod = posProducts.find(p => p.id === c.productId);
        return `• ${c.name} : ${c.quantity} demandé(s) dans le panier, mais seulement ${prod?.quantity ?? 0} en stock`;
      }).join('\n'));
      return;
    }
    const txNumber = `hnv${Date.now()}${Math.floor(100 + Math.random() * 900)}`;

    // T1 : la monnaie rendue n'existe qu'en espèces. En Mixte, seul l'excédent
    // des espèces versées (au-delà du reste dû après le mobile) est rendu —
    // jamais un excédent mobile (sinon le tiroir perd de l'argent réel).
    const mobileCover = paymentMethod === 'Mixte' ? Math.min(receivedMobile, total) : 0;
    const cashChange = (paymentMethod === 'Espèces' || paymentMethod === 'Mixte')
      ? Math.max(0, receivedCash - Math.max(0, total - mobileCover))
      : 0;
    const changeAmount = paymentMethod === 'Espèces' ? Math.max(0, receivedTotal - total) : cashChange;

    const payments: any[] = [];
    if (paymentMethod === 'Mixte') {
      // Déduire la monnaie rendue de la part espèces pour que la somme des paiements égale le montant net de la vente
      const netCash = Math.max(0, receivedCash - changeAmount);
      const netMobile = Math.min(receivedMobile, total - netCash);
      if (netCash > 0) payments.push({ id: uuidv4(), method: 'Espèces', amount: netCash });
      if (netMobile > 0) payments.push({ id: uuidv4(), method: 'Mobile Money', amount: netMobile });
    } else {
      payments.push({ id: uuidv4(), method: paymentMethod, amount: total });
    }

    const tx = {
      id: uuidv4(),
      transactionNumber: txNumber,
      cashierId: currentUser?.id,
      sessionId: openSession.id,
      date: new Date().toISOString(),
      subtotal,
      vat: 0,
      discountAmount: cartDiscount + globalDiscount,
      total,
      receivedAmount: receivedTotal,
      changeAmount,
      status: 'Validée' as const,
      lines: cart.map(c => ({
        id: uuidv4(),
        productId: c.productId || undefined,
        description: c.name || (c as any).description || 'Article',
        quantity: Number(c.quantity) || 1,
        unitPrice: Number(c.unitPrice) || 0,
        discountPercent: Number(c.discountPercent) || 0,
        discountAmount: Number(c.discountAmount) || 0,
        total: Number(c.total) || ((Number(c.quantity) || 1) * (Number(c.unitPrice) || 0)),
        // Coût d'achat figé à la vente (marges historiques stables même si le prix d'achat évolue)
        costPrice: (() => { const p = posProducts.find(pp => pp.id === c.productId); return p ? (p.purchasePrice || 0) : 0; })()
      })),
      payments
    };

    await addPosTransaction(tx);

    const currentReceiptData = {
      transaction: tx,
      cart: [...cart],
      paymentMethod,
      cashAmount: receivedCash,
      changeAmount,
      total,
      subtotal,
      globalDiscount,
      cashierName: currentUser?.name || 'Caissier',
      settings: posSettings,
      crmSettings: crmSettings
    };

    setReceiptData(currentReceiptData);
    
    setCart([]);
    setShowPayment(false);
    setDiscountType('none');
    setDiscountValue(0);
    setCashAmount('');
    setMobileAmount('');

    if (currentUser) {
      localStorage.removeItem(`pos_active_cart_${currentUser.id}`);
      localStorage.removeItem(`pos_active_discount_type_${currentUser.id}`);
      localStorage.removeItem(`pos_active_discount_value_${currentUser.id}`);
    }

    toast.success('Paiement validé avec succès !');
    setShowPreviewModal(true);
    } finally {
      paymentInProgressRef.current = false;
      setIsPaying(false);
    }
  };

  const handleSuspendCart = () => {
    if (cart.length === 0) return;
    // T5 : la remise globale est persistée avec le ticket (sinon perdue à la reprise).
    addSuspendedCart({
      id: uuidv4(),
      reference: suspendReference || `Ticket ${suspendedCarts.length + 1}`,
      date: new Date().toISOString(),
      cart: [...cart],
      discountType,
      discountValue
    } as any);
    setCart([]);
    setDiscountType('none');
    setDiscountValue(0);
    setShowSuspendModal(false);
    setSuspendReference('');
  };

  const handleResumeCart = (suspendedCart: any) => {
    if (cart.length > 0) {
      if (!window.confirm("Attention, le panier actuel n'est pas vide. Voulez-vous l'écraser ?")) {
        return;
      }
    }
    // T5 : revalidation catalogue/stock/existence à la reprise (produit désactivé
    // ou supprimé entre-temps, stock insuffisant devenu).
    const revived: typeof cart = [];
    const dropped: string[] = [];
    for (const c of (suspendedCart.cart || [])) {
      const product = posProducts.find(p => p.id === c.productId);
      if (!product || product.status === 'Inactive' || (product as any).isActive === false) {
        dropped.push(c.name || 'Article');
        continue;
      }
      const isService = product.family === 'Service' || product.reference?.startsWith('SRV-');
      const available = isService ? 999999 : Number(product.quantity ?? 0);
      if (!isService && Number(c.quantity) > available) {
        dropped.push(`${c.name} (stock restant : ${available})`);
        continue;
      }
      revived.push({ ...c, unitPrice: product.sellingPrice ?? c.unitPrice });
    }
    if (dropped.length > 0) {
      alert('Articles non repris (produit indisponible ou stock insuffisant) :\n• ' + dropped.join('\n• '));
    }
    if (revived.length === 0) {
      alert('Aucun article du ticket en attente ne peut être repris.');
      return;
    }
    setCart(revived);
    if (suspendedCart.discountType) setDiscountType(suspendedCart.discountType);
    if (suspendedCart.discountValue !== undefined) setDiscountValue(suspendedCart.discountValue);
    removeSuspendedCart(suspendedCart.id);
    setShowSuspendedList(false);
  };

  // T6+T7 : ouverture unique (une session Ouverte par caissier/jour) et fonds ≥ 0.
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const handleOpenSession = async () => {
    if (isOpeningSession) return;
    if (openSession) {
      alert('Une session est déjà ouverte pour cette caisse.');
      setShowOpenModal(false);
      return;
    }
    if (initialFund === '') return;
    const fund = Number(initialFund);
    if (isNaN(fund) || fund < 0) {
      alert('Fonds de caisse invalide : saisissez un montant positif ou zéro.');
      return;
    }
    setIsOpeningSession(true);
    try {
      await addPosCashSession({ id: uuidv4(), cashierId: currentUser?.id, openedAt: new Date().toISOString(), initialFund: fund, status: 'Ouverte' });
      setShowOpenModal(false);
      setInitialFund('');
    } finally {
      setIsOpeningSession(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Modals Enter handling
      if (showPreviewModal && e.key === 'Enter') {
        e.preventDefault();
        if (platform.isDesktop && receiptData) {
          platform.pos.printReceipt({
            ...receiptData,
            settings: posSettings
          }).catch((err: any) => toast.error("Erreur d'impression: " + (err.message || err)));
        } else if (receiptData) {
          // Iframe dédiée (hors DOM React) : pas de page blanche liée aux re-renders.
          printReceiptViaIframe({ ...receiptData, settings: posSettings, crmSettings })
            .catch((err: any) => toast.error("Erreur d'impression: " + (err.message || err)));
        }
        setShowPreviewModal(false);
        return;
      }
      if (showPayment && e.key === 'Enter') {
        e.preventDefault();
        handlePayment();
        return;
      }
      if (showOpenModal && e.key === 'Enter') {
        e.preventDefault();
        handleOpenSession();
        return;
      }

      // Cart navigation
      if (cart.length > 0 && !showPayment && !showPreviewModal && !showOpenModal && !showSuspendModal && !showSuspendedList) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedCartIndex(prev => Math.max(0, prev - 1));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedCartIndex(prev => Math.min(cart.length - 1, prev + 1));
        } else if (e.key === 'ArrowLeft') {
          const isInputFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT';
          if (!isInputFocused) {
            e.preventDefault();
            const item = cart[selectedCartIndex];
            if (item) updateCartQty(item.id, -1);
          }
        } else if (e.key === 'ArrowRight') {
          const isInputFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT';
          if (!isInputFocused) {
            e.preventDefault();
            const item = cart[selectedCartIndex];
            if (item) updateCartQty(item.id, 1);
          }
        } else if (e.key === 'Enter') {
          const isSearchFocused = document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).placeholder.includes('Scanner');
          if (!isSearchFocused && openSession) {
            e.preventDefault();
            setShowPayment(true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, selectedCartIndex, showPayment, showPreviewModal, showOpenModal, showSuspendModal, showSuspendedList, initialFund, openSession, currentUser, cashAmount, mobileAmount, paymentMethod, discountType, discountValue, updateCartQty]);

  useEffect(() => {
    if (selectedCartIndex >= cart.length && cart.length > 0) {
      setSelectedCartIndex(cart.length - 1);
    } else if (cart.length === 0 && selectedCartIndex !== 0) {
      setSelectedCartIndex(0);
    }
  }, [cart.length, selectedCartIndex]);

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' };

  return (
    <>
      <ReceiptTicket data={receiptData} settings={posSettings} crmSettings={crmSettings} />
      <div className="pos-terminal-container" style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: '16px', padding: '0 24px 24px' }}>
        {/* Left: Product catalog */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        {/* Top search & family filters */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => navigate('/pos')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', color: 'var(--color-text)' }} title="Retour au tableau de bord">
              <ArrowLeft size={18} />
            </button>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input 
                autoFocus 
                style={{ ...inputStyle, paddingLeft: '36px', paddingRight: '36px', fontSize: '16px' }} 
                placeholder="Scanner code-barres ou rechercher par nom, réf, ISBN..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                onKeyDown={e => { 
                  if (e.key === 'Enter') {
                    if (barcodeScannerService.isScannerActive()) return;
                    const query = search.trim();
                    if (query) {
                      if (filteredProducts.length === 1) {
                        addToCart(filteredProducts[0]);
                        setSearch('');
                      } else if (filteredProducts.length === 0) {
                        toast.error(`Produit introuvable : ${query}`, { duration: 3000 });
                        setSearch('');
                      }
                    }
                  } 
                }} 
              />
              {search && (
                <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                  <button 
                    type="button"
                    onClick={() => setSearch('')} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600, padding: '4px' }}
                    title="Effacer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {openSession && (
              <button
                type="button"
                onClick={() => setShowCashierBreakdownModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '0 14px',
                  borderRadius: 'var(--radius-md)',
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  color: '#166534',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s'
                }}
                title="Consulter la répartition financière de la session de caisse"
              >
                <Wallet size={16} color="#16a34a" />
                <span>Ma Caisse : {sessionGrandTotal.toLocaleString()} FCFA</span>
              </button>
            )}
          </div>

          {/* Family selection tabs */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
            <button
              onClick={() => setSelectedFamily('all')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid',
                borderColor: selectedFamily === 'all' ? 'var(--color-primary)' : 'var(--color-border)',
                background: selectedFamily === 'all' ? 'var(--color-primary)' : 'var(--color-surface-alt)',
                color: selectedFamily === 'all' ? 'white' : 'var(--color-text)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              Tous ({posProducts.filter(p => p.status !== 'Inactive').length})
            </button>
            <button
              onClick={() => setSelectedFamily('Livre')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid',
                borderColor: selectedFamily === 'Livre' ? 'var(--color-primary)' : 'var(--color-border)',
                background: selectedFamily === 'Livre' ? 'var(--color-primary)' : 'var(--color-surface-alt)',
                color: selectedFamily === 'Livre' ? 'white' : 'var(--color-text)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              📚 Livres ({posProducts.filter(p => p.status !== 'Inactive' && isLivre(p)).length})
            </button>
            <button
              onClick={() => setSelectedFamily('Fourniture')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid',
                borderColor: selectedFamily === 'Fourniture' ? 'var(--color-primary)' : 'var(--color-border)',
                background: selectedFamily === 'Fourniture' ? 'var(--color-primary)' : 'var(--color-surface-alt)',
                color: selectedFamily === 'Fourniture' ? 'white' : 'var(--color-text)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              ✏️ Fournitures ({posProducts.filter(p => p.status !== 'Inactive' && isFourniture(p)).length})
            </button>
          </div>
        </div>

        {/* Product grid / List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--color-text-muted)' }}>
              <div style={{ background: 'var(--color-surface-alt)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Package size={32} color="var(--color-text-muted)" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
                {search ? `Aucun produit pour « ${search} »` : 'Aucun produit disponible'}
              </div>
              <div style={{ fontSize: '13px', marginBottom: '16px' }}>
                {search ? 'Vérifiez l\'orthographe ou scannez le code-barres / ISBN de l\'article.' : 'Le catalogue est actuellement vide ou tous les articles sont inactifs.'}
              </div>
              {search ? (
                <Button variant="secondary" onClick={() => setSearch('')}>
                  Réinitialiser la recherche
                </Button>
              ) : (
                <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => { toast.loading('Actualisation...', { duration: 1000 }); refreshData(); }}>
                  Actualiser le catalogue
                </Button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', alignContent: 'start' }}>
              {filteredProducts.map(p => {
                const isOutOfStock = p.quantity <= 0;
                const isLowStock = p.quantity > 0 && p.quantity <= (p.minStock || 10);
                return (
                  <button 
                    key={p.id} 
                    onClick={() => handleProductClick(p)} 
                    disabled={isOutOfStock} 
                    style={{ 
                      padding: '12px', 
                      borderRadius: 'var(--radius-md)', 
                      border: '1px solid var(--color-border)', 
                      background: isOutOfStock ? 'var(--color-surface-alt)' : 'white', 
                      cursor: isOutOfStock ? 'not-allowed' : 'pointer', 
                      textAlign: 'left', 
                      opacity: isOutOfStock ? 0.6 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      transition: 'transform 0.1s, box-shadow 0.1s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px', position: 'relative' }}>
                      <ProductImage product={p} size={56} rounded />
                      {p.family && (
                        <span style={{ 
                          position: 'absolute', 
                          top: 0, 
                          right: 0, 
                          fontSize: '10px', 
                          background: p.family === 'Livre' ? 'var(--color-primary-tint)' : 'var(--color-success-tint)', 
                          color: p.family === 'Livre' ? 'var(--color-primary)' : 'var(--color-success)', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          fontWeight: 600 
                        }}>
                          {p.family}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px', lineHeight: '1.25', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: '32px' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px', fontFamily: 'monospace' }}>
                      {p.reference}
                    </div>
                    <div style={{ marginTop: 'auto' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-primary)' }}>
                        {p.sellingPrice.toLocaleString()} FCFA
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px' }}>
                        <span style={{ 
                          fontWeight: 600,
                          color: isOutOfStock ? 'var(--color-error)' : isLowStock ? 'var(--color-warning-strong)' : 'var(--color-success)'
                        }}>
                          {isOutOfStock ? 'Rupture' : `Stock: ${p.quantity}`}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div style={{ width: '420px', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Panier ({cart.length})</h3>
            <button onClick={() => setShowSuspendedList(true)} style={{ background: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-lg)', padding: '4px 8px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--color-text)' }}>
              <Clock size={12} /> {suspendedCarts?.length || 0} en attente
            </button>
          </div>
          {cart.length > 0 && <button onClick={() => setCart([])} style={{ fontSize: '13px', color: 'var(--color-error)', background: 'none', border: 'none', cursor: 'pointer' }}>Vider</button>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>Panier vide</div>
          ) : (
            cart.map((item, index) => (
              <div key={item.id} style={{ padding: '12px', borderBottom: '1px solid var(--color-surface-alt)', background: index === selectedCartIndex ? 'var(--color-primary-tint)' : 'transparent', borderRadius: index === selectedCartIndex ? 'var(--radius-md)' : '0', transition: 'background 0.2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '14px', fontWeight: index === selectedCartIndex ? 600 : 500, flex: 1, color: index === selectedCartIndex ? 'var(--color-primary-strong)' : 'inherit' }}>
                    {index === selectedCartIndex && <span style={{ marginRight: '8px' }}>▶</span>}
                    {item.name}
                  </div>
                  <button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}><Trash2 size={14} /></button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <button onClick={() => updateCartQty(item.id, -1)} style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-alt)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                  <input type="number" min="1" value={item.quantity} onChange={(e) => setExactCartQty(item.id, parseInt(e.target.value) || 1)} style={{ width: '48px', height: '28px', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0 4px', fontSize: '14px', fontWeight: 500 }} />
                  <button onClick={() => updateCartQty(item.id, 1)} style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-alt)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginLeft: '4px' }}>x {item.unitPrice.toLocaleString()} FCFA</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, marginLeft: 'auto' }}>{item.total.toLocaleString()} FCFA</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }} value={item.discountType} onChange={e => updateCartDiscountType(item.id, e.target.value as any)}>
                    <option value="none">Sans remise</option>
                    <option value="percent">% remise</option>
                    <option value="amount">Remise montant</option>
                  </select>
                  {item.discountType === 'percent' && <input style={{ ...inputStyle, width: '60px', fontSize: '12px', padding: '4px 8px' }} type="number" min="0" max="100" placeholder="%" value={item.discountPercent} onChange={e => updateCartDiscount(item.id, 'percent', Number(e.target.value))} />}
                  {item.discountType === 'amount' && <input style={{ ...inputStyle, width: '90px', fontSize: '12px', padding: '4px 8px' }} type="number" min="0" placeholder="FCFA" value={item.discountAmount} onChange={e => updateCartDiscount(item.id, 'amount', Number(e.target.value))} />}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}><span>Sous-total</span><span>{subtotal.toLocaleString()} FCFA</span></div>
          {cartDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: 'var(--color-success)' }}><span>Remises articles</span><span>-{cartDiscount.toLocaleString()} FCFA</span></div>}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select style={{ ...inputStyle, width: 'auto', fontSize: '13px' }} value={discountType} onChange={e => setDiscountType(e.target.value as any)}>
              <option value="none">Pas de remise globale</option>
              <option value="percent">Remise %</option>
              <option value="amount">Remise montant</option>
            </select>
            {discountType !== 'none' && <input style={{ ...inputStyle, width: '80px', fontSize: '13px' }} type="number" min="0" value={discountValue} onChange={e => setDiscountValue(Number(e.target.value))} />}
          </div>
          {globalDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: 'var(--color-success)' }}><span>Remise globale</span><span>-{globalDiscount.toLocaleString()} FCFA</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', fontWeight: 700, paddingTop: '8px', borderTop: '2px solid var(--color-border)' }}><span>Total</span><span>{total.toLocaleString()} FCFA</span></div>

          {/* Real-time Profitability & Margin Shield */}
          {cart.length > 0 && marginInfo.totalPurchaseCost > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: marginInfo.isLoss ? '#fef2f2' : marginInfo.isLowMargin ? '#fffbeb' : '#f0fdf4',
              border: `1px solid ${marginInfo.isLoss ? '#fecaca' : marginInfo.isLowMargin ? '#fde68a' : '#bbf7d0'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: marginInfo.isLoss ? '#b91c1c' : marginInfo.isLowMargin ? '#b45309' : '#15803d' }}>
                  {marginInfo.isLoss ? <AlertTriangle size={14} /> : marginInfo.isLowMargin ? <Info size={14} /> : <ShieldCheck size={14} />}
                  <span>{marginInfo.isLoss ? 'Alerte : Vente à perte !' : marginInfo.isLowMargin ? 'Marge faible' : 'Rentabilité saine'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Marge brute :</span>
                <span style={{ fontWeight: 700, color: marginInfo.isLoss ? '#dc2626' : marginInfo.isLowMargin ? '#d97706' : '#16a34a' }}>
                  {marginInfo.grossMarginAmount > 0 ? '+' : ''}{marginInfo.grossMarginAmount.toLocaleString()} FCFA ({marginInfo.grossMarginRate.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Payment button */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {!openSession ? (
            <Button variant="warning" size="block" onClick={() => setShowOpenModal(true)}>Ouvrir la caisse</Button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="ghost" style={{ flex: 1, border: '1px solid var(--color-border)', background: 'white' }} disabled={cart.length === 0} onClick={() => setShowSuspendModal(true)}>En attente</Button>
              <Button variant="primary" style={{ flex: 2 }} disabled={cart.length === 0} onClick={() => setShowPayment(true)}>Payer</Button>
            </div>
          )}
        </div>
      </div>

      {/* Payment modal */}
      <Modal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        title="Paiement"
        width={400}
        footer={
          <>
            <Button variant="success" onClick={handlePayment} disabled={isPaying}>{isPaying ? 'Encaissement...' : 'Valider'}</Button>
            <Button variant="ghost" onClick={() => setShowPayment(false)} disabled={isPaying}>Annuler</Button>
          </>        }
      >
        <div style={{ fontSize: '32px', fontWeight: 700, textAlign: 'center', marginBottom: '24px', color: 'var(--color-primary)' }}>{total.toLocaleString()} FCFA</div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Mode de paiement</div>
          <select style={inputStyle} value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value as any); setCashAmount(''); setMobileAmount(''); }}>
            <option value="Espèces">Espèces</option>
            <option value="Mobile Money">Mobile Money</option>
            <option value="Mixte">Mixte (Espèces + Mobile Money)</option>
          </select>
        </div>

        {(paymentMethod === 'Espèces' || paymentMethod === 'Mixte') && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Montant reçu (Espèces)</div>
            <input 
              style={inputStyle} 
              type="text" 
              inputMode="numeric"
              placeholder="0"
              value={cashAmount} 
              onChange={e => { const val = e.target.value.replace(/[^0-9]/g, ''); setCashAmount(val ? Number(val) : ''); }} 
              autoFocus
            />
          </div>
        )}

        {(paymentMethod === 'Mobile Money' || paymentMethod === 'Mixte') && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Montant reçu (Mobile Money)</div>
            <input 
              style={inputStyle} 
              type="text" 
              inputMode="numeric"
              placeholder="0"
              value={mobileAmount} 
              onChange={e => { const val = e.target.value.replace(/[^0-9]/g, ''); setMobileAmount(val ? Number(val) : ''); }} 
              autoFocus={paymentMethod === 'Mobile Money'}
            />
          </div>
        )}

        {(() => {
          // Monnaie uniquement en espèces (M15) : jamais sur Mobile Money pur
          const change = (paymentMethod === 'Espèces' || paymentMethod === 'Mixte')
            ? Math.max(0, ((Number(cashAmount) || 0) + (paymentMethod === 'Mixte' ? (Number(mobileAmount) || 0) : 0)) - total)
            : 0;
          return (
            <div style={{ 
              marginTop: '24px', 
              padding: '16px', 
              borderRadius: 'var(--radius-md)', 
              background: change > 0 ? '#f0fdf4' : 'var(--color-surface-alt)', 
              border: change > 0 ? '1px solid #bbf7d0' : '1px solid var(--color-border)',
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center' 
            }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: change > 0 ? '#166534' : 'var(--color-text-muted)' }}>
                Monnaie à rendre :
              </span>
              <span style={{ fontSize: '24px', fontWeight: 800, color: change > 0 ? '#15803d' : 'var(--color-text-muted)' }}>
                {change.toLocaleString()} FCFA
              </span>
            </div>
          );
        })()}
      </Modal>

      {/* Open Cash Modal */}
      <Modal
        open={showOpenModal}
        onClose={() => { setShowOpenModal(false); setInitialFund(''); }}
        title="Ouvrir la caisse"
        width={400}
        footer={
          <>
            <Button 
              variant="success" 
              onClick={handleOpenSession}
              disabled={isOpeningSession}
            >{isOpeningSession ? 'Ouverture...' : 'Ouvrir'}</Button>
            <Button variant="ghost" onClick={() => { setShowOpenModal(false); setInitialFund(''); }}>Annuler</Button>
          </>
        }
      >
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', marginBottom: '4px', display: 'block', fontWeight: 500 }}>Fonds de caisse initial (FCFA)</label>
          <input 
            type="text" 
            inputMode="numeric"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }} 
            value={initialFund} 
            onChange={e => setInitialFund(e.target.value.replace(/\D/g, ''))}
            onKeyDown={async e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleOpenSession();
              }
            }}
            autoFocus 
          />
        </div>
      </Modal>

      {/* Suspend Modal */}
      <Modal
        open={showSuspendModal}
        onClose={() => setShowSuspendModal(false)}
        title="Mettre le ticket en attente"
        width={400}
        footer={
          <>
            <Button variant="primary" onClick={handleSuspendCart}>Sauvegarder</Button>
            <Button variant="ghost" onClick={() => setShowSuspendModal(false)}>Annuler</Button>
          </>
        }
      >
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', marginBottom: '4px', display: 'block', fontWeight: 500 }}>Libellé (optionnel)</label>
          <input 
            type="text" 
            placeholder="Ex: Client pull rouge"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }} 
            value={suspendReference} 
            onChange={e => setSuspendReference(e.target.value)} 
            autoFocus 
          />
        </div>
      </Modal>

      {/* Suspended List Modal */}
      <Modal
        open={showSuspendedList}
        onClose={() => setShowSuspendedList(false)}
        title="Tickets en attente"
        width={600}
      >
        {(!suspendedCarts || suspendedCarts.length === 0) ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>Aucun ticket en attente.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
            {suspendedCarts.map(sCart => {
              const totalAmount = sCart.cart.reduce((sum, item) => sum + item.total, 0);
              const itemsCount = sCart.cart.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <div key={sCart.id} style={{ padding: '16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{sCart.reference}</div>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                      {new Date(sCart.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} &bull; {itemsCount} article(s) &bull; <strong style={{ color: 'var(--color-text)' }}>{totalAmount.toLocaleString()} FCFA</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="danger" size="sm" onClick={() => removeSuspendedCart(sCart.id)}>Supprimer</Button>
                    <Button variant="success" size="sm" onClick={() => handleResumeCart(sCart)}>Reprendre</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
      {/* Modal d'aperçu du Ticket avant impression */}
      <Modal
        open={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title="Aperçu du ticket de caisse"
        width={420}
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="secondary" onClick={() => setShowPreviewModal(false)}>
              Fermer sans imprimer
            </Button>
            <Button variant="primary" icon={<Printer size={16} />} onClick={async () => { 
              if (platform.isDesktop) {
                try {
                  await platform.pos.printReceipt({
                    ...receiptData,
                    settings: posSettings
                  });
                  toast.success('Ticket envoyé à l\'imprimante');
                } catch (e: any) {
                  toast.error("Erreur d'impression: " + (e.message || e));
                }
              } else if (receiptData) {
                // Iframe dédiée (hors DOM React) : pas de page blanche liée aux re-renders.
                try {
                  await printReceiptViaIframe({ ...receiptData, settings: posSettings, crmSettings });
                } catch (e: any) {
                  toast.error("Erreur d'impression: " + (e.message || e));
                }
              }
              setShowPreviewModal(false); 
            }}>
              Imprimer le ticket (Entrée)
            </Button>
          </div>
        }
      >
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px', background: '#f8fafc', maxHeight: '65vh', overflowY: 'auto' }}>
          <ReceiptTicket data={receiptData} settings={posSettings} crmSettings={crmSettings} preview={true} />
        </div>
      </Modal>

      {/* Cashier Financial Breakdown Modal */}
      <Modal
        open={showCashierBreakdownModal}
        onClose={() => setShowCashierBreakdownModal(false)}
        title="Répartition Financière de la Caisse"
        width={640}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="primary" onClick={() => setShowCashierBreakdownModal(false)}>Fermer</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header Info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface-alt)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: '13px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <span style={{ color: 'var(--color-text-muted)' }}>Caissier(ère) : </span>
              <strong>{currentUser?.name || 'Caissier'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)' }}>Session ouverte le : </span>
              <strong>{openSession ? new Date(openSession.openedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</strong>
            </div>
          </div>

          {/* Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Fonds initial d'ouverture</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{(openSession?.initialFund || 0).toLocaleString()} FCFA</div>
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', padding: '14px' }}>
              <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: 600, marginBottom: '4px' }}>Attendu physique dans le tiroir</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#1e40af' }}>{expectedDrawerCash.toLocaleString()} FCFA</div>
              <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '2px' }}>Fonds initial + Espèces - Retours</div>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', padding: '14px' }}>
              <div style={{ fontSize: '12px', color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <Wallet size={15} /> Ventes en Espèces
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#15803d' }}>+{sessionCashSales.toLocaleString()} FCFA</div>
            </div>

            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)', padding: '14px' }}>
              <div style={{ fontSize: '12px', color: '#92400e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <Smartphone size={15} /> Ventes Mobile Money
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#b45309' }}>+{sessionMobileSales.toLocaleString()} FCFA</div>
            </div>
          </div>

          {sessionReturns > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
              <span style={{ color: '#991b1b', fontWeight: 500 }}>Remboursements / Retours déduits du tiroir :</span>
              <strong style={{ color: '#b91c1c' }}>-{sessionReturns.toLocaleString()} FCFA</strong>
            </div>
          )}

          {/* Grand Total Bar */}
          <div style={{ background: 'var(--color-primary-tint)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-primary-strong)', fontSize: '14px' }}>Chiffre d'Affaires Total de la Session :</span>
            <strong style={{ fontSize: '20px', color: 'var(--color-primary-strong)' }}>{sessionGrandTotal.toLocaleString()} FCFA</strong>
          </div>

          {/* Recent Sales List */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text)' }}>
              Ventes de la session ({sessionTxs.length} ticket{sessionTxs.length > 1 ? 's' : ''})
            </div>
            {sessionTxs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                Aucune vente réalisée dans cette session pour l'instant.
              </div>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-surface-alt)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Heure</th>
                      <th style={{ padding: '8px 12px' }}>Ticket</th>
                      <th style={{ padding: '8px 12px' }}>Mode de règlement</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionTxs.map(t => {
                      const payMethod = t.payments?.[0]?.method || 'Espèces';
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                          <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>
                            {new Date(t.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 500 }}>{t.transactionNumber}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: payMethod === 'Espèces' ? '#dcfce7' : payMethod === 'Mobile Money' ? '#fef3c7' : '#e0e7ff',
                              color: payMethod === 'Espèces' ? '#166534' : payMethod === 'Mobile Money' ? '#92400e' : '#3730a3'
                            }}>
                              {payMethod}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                            {t.total.toLocaleString()} FCFA
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>
      </div>
    </>
  );
}
