// Page indépendante : suivi des factures fournisseurs.
// N'utilise QUE le store propre du module (SupInvoiceContext) + Auth (identité).
// Aucune lecture/écriture vers AppContext, Caisse, Coûts, Tiers ou Factures clients.
import { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Download,
  Wallet,
  Paperclip,
  Filter,
  RotateCcw,
  Truck,
  Receipt,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../components/ConfirmModal';
import { MonthlyBars } from '../components/MonthlyBars';
import { SupInvoiceProvider, useSupInvoices } from '../features/supplierInvoices/SupInvoiceContext';
import type { SupInvoice, SupInvoiceStatus, SupSupplier } from '../features/supplierInvoices/types';
import { SUP_INVOICE_STATUSES, SUP_PAYMENT_METHODS, SUP_ATTACHMENT_MAX_BYTES } from '../features/supplierInvoices/types';

type Tab = 'invoices' | 'suppliers';

const MONTH_NAMES = [
  { num: 1, name: 'Janvier', short: 'Jan' },
  { num: 2, name: 'Février', short: 'Fév' },
  { num: 3, name: 'Mars', short: 'Mar' },
  { num: 4, name: 'Avril', short: 'Avr' },
  { num: 5, name: 'Mai', short: 'Mai' },
  { num: 6, name: 'Juin', short: 'Juin' },
  { num: 7, name: 'Juillet', short: 'Juil' },
  { num: 8, name: 'Août', short: 'Août' },
  { num: 9, name: 'Septembre', short: 'Sept' },
  { num: 10, name: 'Octobre', short: 'Oct' },
  { num: 11, name: 'Novembre', short: 'Nov' },
  { num: 12, name: 'Décembre', short: 'Déc' },
];

const todayStr = () => new Date().toISOString().split('T')[0];

function badgeClass(status: string): string {
  switch (status) {
    case 'PAYÉE':
      return 'bg-success';
    case 'EN_RETARD':
    case 'LITIGE':
      return 'bg-error';
    case 'PARTIELLEMENT_PAYÉE':
      return 'bg-warning';
    case 'REÇUE':
    case 'VALIDÉE':
      return 'bg-primary';
    default:
      return 'bg-secondary';
  }
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

function SupFacturesInner() {
  const { currentUser } = useAuth();
  const { confirm } = useConfirm();
  const {
    suppliers,
    invoices,
    payments,
    loading,
    error,
    refresh,
    saveSupplier,
    deleteSupplier,
    saveInvoice,
    deleteInvoice,
    addPayment,
    deletePayment,
    paidForInvoice,
  } = useSupInvoices();

  const nowRef = new Date();
  const nowYear = nowRef.getFullYear();
  const nowMonth = nowRef.getMonth() + 1;

  const [tab, setTab] = useState<Tab>('invoices');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  // Organisation mois/année (miroir du Suivi factures clients) — rattachement = date d'émission
  const [selectedYear, setSelectedYear] = useState(nowYear);
  const [selectedMonth, setSelectedMonth] = useState(nowMonth);
  const [showAnnual, setShowAnnual] = useState(true);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<SupInvoice | null>(null);
  const [savingInvoice, setSavingInvoice] = useState(false);

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupSupplier | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [payFor, setPayFor] = useState<SupInvoice | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState(todayStr());
  const [payMethod, setPayMethod] = useState<string>('Espèces');
  const [payRef, setPayRef] = useState('');
  const [savingPay, setSavingPay] = useState(false);

  // Formulaire facture
  const [fSupplierId, setFSupplierId] = useState('');
  const [fNumber, setFNumber] = useState('');
  const [fIssue, setFIssue] = useState(todayStr());
  const [fDue, setFDue] = useState('');
  const [fAmount, setFAmount] = useState<number>(0);
  const [fStatus, setFStatus] = useState<SupInvoiceStatus>('REÇUE');
  const [fMethod, setFMethod] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fFileName, setFFileName] = useState('');
  const [fFileMime, setFFileMime] = useState('');
  const [fFileData, setFFileData] = useState('');

  // Formulaire fournisseur
  const [sName, setSName] = useState('');
  const [sContact, setSContact] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sNif, setSNif] = useState('');
  const [sAddress, setSAddress] = useState('');
  const [sNotes, setSNotes] = useState('');

  const supplierNameOf = (id?: string) => suppliers.find((s) => s.id === id)?.name || '';

  // Statut effectif : PAYÉE auto si soldée, EN_RETARD si échéance dépassée
  const effectiveStatus = (inv: SupInvoice): SupInvoiceStatus => {
    if (inv.status === 'PAYÉE' || inv.status === 'ANNULÉE' || inv.status === 'LITIGE' || inv.status === 'BROUILLON') return inv.status;
    const paid = paidForInvoice(inv.id);
    if (inv.amountTtc > 0 && paid >= inv.amountTtc) return 'PAYÉE';
    if (inv.dueDate && inv.dueDate < todayStr()) return 'EN_RETARD';
    return inv.status;
  };

  const issuePeriod = (issueDate?: string): { y: number; m: number } => {
    const d = new Date(issueDate || '');
    if (isNaN(d.getTime())) return { y: nowYear, m: nowMonth };
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  };

  const availableYears = useMemo(() => {
    const set = new Set<number>([nowYear]);
    for (const inv of invoices) set.add(issuePeriod(inv.issueDate).y);
    return Array.from(set).sort((a, b) => a - b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices]);

  // Niveau 1 : exercice puis mois (rattachement = date d'émission)
  const yearInvoices = useMemo(
    () => invoices.filter((inv) => issuePeriod(inv.issueDate).y === selectedYear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, selectedYear],
  );

  const monthCounts = useMemo(() => {
    const counts = new Array(12).fill(0);
    for (const inv of yearInvoices) counts[issuePeriod(inv.issueDate).m - 1] += 1;
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearInvoices]);

  const monthInvoices = useMemo(
    () => yearInvoices.filter((inv) => issuePeriod(inv.issueDate).m === selectedMonth),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearInvoices, selectedMonth],
  );

  // Niveau 2 : filtres secondaires (recherche, fournisseur, statut)
  const filteredInvoices = useMemo(() => {
    return monthInvoices
      .filter((inv) => {
        if (supplierFilter && inv.supplierId !== supplierFilter) return false;
        if (statusFilter && effectiveStatus(inv) !== statusFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const hay = `${inv.invoiceNumber} ${inv.supplierName} ${inv.description || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthInvoices, payments, supplierFilter, statusFilter, search]);

  // KPIs du mois sélectionné
  const kpis = useMemo(() => {
    const active = filteredInvoices.filter((i) => i.status !== 'ANNULÉE');
    const totalTtc = active.reduce((s, i) => s + (Number(i.amountTtc) || 0), 0);
    const totalPaid = active.reduce((s, i) => s + paidForInvoice(i.id), 0);
    const late = active.filter((i) => effectiveStatus(i) === 'EN_RETARD');
    const lateAmount = late.reduce((s, i) => s + Math.max(0, (Number(i.amountTtc) || 0) - paidForInvoice(i.id)), 0);
    return { count: filteredInvoices.length, totalTtc, totalPaid, rest: Math.max(0, totalTtc - totalPaid), lateCount: late.length, lateAmount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredInvoices, payments]);

  // KPIs annuels globaux (exercice sélectionné, tous mois confondus)
  const annual = useMemo(() => {
    const active = yearInvoices.filter((i) => i.status !== 'ANNULÉE');
    const total = active.reduce((s, i) => s + (Number(i.amountTtc) || 0), 0);
    const paid = active.reduce((s, i) => s + paidForInvoice(i.id), 0);
    const late = active.filter((i) => effectiveStatus(i) === 'EN_RETARD');
    const lateAmount = late.reduce((s, i) => s + Math.max(0, (Number(i.amountTtc) || 0) - paidForInvoice(i.id)), 0);
    const avg = active.length > 0 ? total / active.length : 0;
    const series = MONTH_NAMES.map((m) => {
      const inMonth = active.filter((i) => issuePeriod(i.issueDate).m === m.num);
      const v1 = inMonth.reduce((s, i) => s + (Number(i.amountTtc) || 0), 0);
      const prefix = `${selectedYear}-${String(m.num).padStart(2, '0')}`;
      const v2 = payments
        .filter((p) => (p.paymentDate || '').startsWith(prefix))
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      return { label: m.short, v1, v2 };
    });
    const bySupplier = new Map<string, { name: string; total: number; paid: number; count: number }>();
    for (const i of active) {
      const key = i.supplierName || '—';
      const cur = bySupplier.get(key) || { name: key, total: 0, paid: 0, count: 0 };
      cur.total += Number(i.amountTtc) || 0;
      cur.paid += paidForInvoice(i.id);
      cur.count += 1;
      bySupplier.set(key, cur);
    }
    const topSuppliers = Array.from(bySupplier.values())
      .map((t) => ({ ...t, rest: Math.max(0, t.total - t.paid) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    return {
      count: active.length,
      total,
      paid,
      rest: Math.max(0, total - paid),
      lateCount: late.length,
      lateAmount,
      avg,
      series,
      topSuppliers,
      recoveryRate: total > 0 ? ((paid / total) * 100).toFixed(1) : '0',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearInvoices, payments, selectedYear]);

  const selectedMonthName = MONTH_NAMES.find((m) => m.num === selectedMonth)?.name || '';

  const hasActiveFilters = search !== '' || statusFilter !== '' || supplierFilter !== '';
  const resetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSupplierFilter('');
  };

  // ── Facture : ouvrir / enregistrer ──────────────────────────────────────────
  const openNewInvoice = () => {
    setEditingInvoice(null);
    setFSupplierId(supplierFilter || '');
    setFNumber('');
    setFIssue(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`);
    setFDue('');
    setFAmount(0);
    setFStatus('REÇUE');
    setFMethod('');
    setFDesc('');
    setFFileName('');
    setFFileMime('');
    setFFileData('');
    setShowInvoiceModal(true);
  };

  const openEditInvoice = (inv: SupInvoice) => {
    setEditingInvoice(inv);
    setFSupplierId(inv.supplierId || '');
    setFNumber(inv.invoiceNumber);
    setFIssue(inv.issueDate);
    setFDue(inv.dueDate || '');
    setFAmount(inv.amountTtc);
    setFStatus(inv.status);
    setFMethod(inv.paymentMethod || '');
    setFDesc(inv.description || '');
    setFFileName(inv.attachmentName || '');
    setFFileMime(inv.attachmentMime || '');
    setFFileData(inv.attachmentData || '');
    setShowInvoiceModal(true);
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > SUP_ATTACHMENT_MAX_BYTES) {
      alert('Pièce trop lourde (max 2,5 Mo).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const b64 = res.includes(',') ? res.split(',')[1] : res;
      setFFileName(file.name);
      setFFileMime(file.type || 'application/octet-stream');
      setFFileData(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveInvoice = async () => {
    if (savingInvoice) return;
    const supplierName = supplierNameOf(fSupplierId) || '';
    if (!fSupplierId || !supplierName) {
      alert('Sélectionnez un fournisseur (onglet Fournisseurs pour en créer un).');
      return;
    }
    if (!fNumber.trim()) {
      alert('N° de facture fournisseur requis.');
      return;
    }
    const dupe = invoices.find(
      (i) => i.supplierId === fSupplierId && i.invoiceNumber.trim().toLowerCase() === fNumber.trim().toLowerCase() && i.id !== editingInvoice?.id,
    );
    if (dupe) {
      alert(`Facture déjà suivie pour ce fournisseur : « ${dupe.invoiceNumber} ».`);
      return;
    }
    const amount = Number(fAmount) || 0;
    if (!(amount > 0)) {
      alert('Le montant de la facture doit être supérieur à zéro.');
      return;
    }
    if (!fIssue) {
      alert("Date d'émission invalide.");
      return;
    }
    setSavingInvoice(true);
    try {
      await saveInvoice({
        id: editingInvoice?.id || '',
        supplierId: fSupplierId,
        supplierName,
        invoiceNumber: fNumber.trim(),
        issueDate: fIssue,
        dueDate: fDue || undefined,
        amountHt: amount,
        vatAmount: 0,
        amountTtc: amount,
        status: editingInvoice ? fStatus : 'REÇUE',
        paymentMethod: fMethod || undefined,
        description: fDesc.trim() || undefined,
        attachmentName: fFileName || undefined,
        attachmentMime: fFileMime || undefined,
        attachmentData: fFileData || undefined,
        createdBy: editingInvoice?.createdBy || currentUser?.id,
        createdByName: editingInvoice?.createdByName || (currentUser as any)?.name,
        createdAt: editingInvoice?.createdAt,
      });
      setShowInvoiceModal(false);
      // Bascule la sélection sur le mois de la facture (miroir du Suivi clients)
      const d = new Date(fIssue);
      if (!isNaN(d.getTime())) {
        setSelectedYear(d.getFullYear());
        setSelectedMonth(d.getMonth() + 1);
      }
    } finally {
      setSavingInvoice(false);
    }
  };

  const handleDeleteInvoice = (inv: SupInvoice) => {
    confirm({
      title: 'Supprimer la facture',
      message: `Supprimer la facture « ${inv.invoiceNumber} » (${(inv.amountTtc || 0).toLocaleString('fr-FR')} FCFA) ? Les paiements liés seront aussi supprimés.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
      onConfirm: () => {
        const res: any = deleteInvoice(inv.id);
        if (res && typeof res.catch === 'function') res.catch((e: any) => alert(e?.message || 'Suppression impossible.'));
      },
    });
  };

  const downloadAttachment = (inv: SupInvoice) => {
    if (!inv.attachmentData) return;
    try {
      const blob = base64ToBlob(inv.attachmentData, inv.attachmentMime || 'application/octet-stream');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = inv.attachmentName || `piece_${inv.invoiceNumber}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      alert('Pièce illisible.');
    }
  };

  // ── Fournisseur : ouvrir / enregistrer ──────────────────────────────────────
  const openNewSupplier = () => {
    setEditingSupplier(null);
    setSName('');
    setSContact('');
    setSPhone('');
    setSEmail('');
    setSNif('');
    setSAddress('');
    setSNotes('');
    setShowSupplierModal(true);
  };

  const openEditSupplier = (s: SupSupplier) => {
    setEditingSupplier(s);
    setSName(s.name);
    setSContact(s.contact || '');
    setSPhone(s.phone || '');
    setSEmail(s.email || '');
    setSNif(s.nif || '');
    setSAddress(s.address || '');
    setSNotes(s.notes || '');
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async () => {
    if (savingSupplier) return;
    const name = sName.trim();
    if (!name) {
      alert('Nom du fournisseur requis.');
      return;
    }
    const dupe = suppliers.find((s) => s.name.trim().toLowerCase() === name.toLowerCase() && s.id !== editingSupplier?.id);
    if (dupe) {
      alert(`Fournisseur déjà existant : « ${dupe.name} ».`);
      return;
    }
    setSavingSupplier(true);
    try {
      await saveSupplier({
        id: editingSupplier?.id || '',
        name,
        contact: sContact.trim() || undefined,
        phone: sPhone.trim() || undefined,
        email: sEmail.trim() || undefined,
        nif: sNif.trim() || undefined,
        address: sAddress.trim() || undefined,
        notes: sNotes.trim() || undefined,
        createdBy: editingSupplier?.createdBy || currentUser?.id,
        createdByName: editingSupplier?.createdByName || (currentUser as any)?.name,
        createdAt: editingSupplier?.createdAt,
      });
      setShowSupplierModal(false);
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = (s: SupSupplier) => {
    const linked = invoices.filter((i) => i.supplierId === s.id).length;
    confirm({
      title: 'Supprimer le fournisseur',
      message:
        linked > 0
          ? `Supprimer « ${s.name} » ? Ses ${linked} facture(s) seront conservées (nom gardé en snapshot).`
          : `Supprimer « ${s.name} » ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
      onConfirm: () => {
        const res: any = deleteSupplier(s.id);
        if (res && typeof res.catch === 'function') res.catch((e: any) => alert(e?.message || 'Suppression impossible.'));
      },
    });
  };

  // ── Paiements ───────────────────────────────────────────────────────────────
  const openPayments = (inv: SupInvoice) => {
    setPayFor(inv);
    setPayAmount(Math.max(0, (Number(inv.amountTtc) || 0) - paidForInvoice(inv.id)));
    setPayDate(todayStr());
    setPayMethod('Espèces');
    setPayRef('');
  };

  const handleAddPayment = async () => {
    if (!payFor || savingPay) return;
    const rest = Math.max(0, (Number(payFor.amountTtc) || 0) - paidForInvoice(payFor.id));
    if (!(payAmount > 0)) {
      alert('Montant du paiement requis.');
      return;
    }
    if (payAmount - rest > 0.5) {
      alert(`Montant supérieur au reste dû (${rest.toLocaleString('fr-FR')} FCFA).`);
      return;
    }
    setSavingPay(true);
    try {
      await addPayment({
        id: '',
        invoiceId: payFor.id,
        paymentDate: payDate,
        amount: payAmount,
        method: payMethod,
        reference: payRef.trim() || undefined,
        createdBy: currentUser?.id,
        createdByName: (currentUser as any)?.name,
      });
      setPayFor(invoices.find((i) => i.id === payFor.id) || payFor);
      setPayAmount(0);
      setPayRef('');
    } finally {
      setSavingPay(false);
    }
  };

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = [
      ['N° facture', 'Fournisseur', 'Emission', 'Echeance', 'Montant', 'Payé', 'Reste', 'Statut'],
      ...filteredInvoices.map((i) => {
        const paid = paidForInvoice(i.id);
        return [
          i.invoiceNumber,
          i.supplierName,
          i.issueDate,
          i.dueDate || '',
          String(i.amountTtc),
          String(paid),
          String(Math.max(0, (Number(i.amountTtc) || 0) - paid)),
          effectiveStatus(i),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FACTURES_FOURNISSEURS_${selectedMonthName.toUpperCase()}_${selectedYear}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const supplierStats = (id: string) => {
    const list = invoices.filter((i) => i.supplierId === id && i.status !== 'ANNULÉE');
    const ttc = list.reduce((s, i) => s + (Number(i.amountTtc) || 0), 0);
    const paid = list.reduce((s, i) => s + paidForInvoice(i.id), 0);
    return { count: list.length, ttc, paid, rest: Math.max(0, ttc - paid) };
  };

  // Permission : Direction toujours admise, autres rôles selon activation du module
  const isDirector = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes((currentUser as any)?.role || '');
  if (!isDirector && (currentUser as any)?.crmSupFacturesEnabled === false) {
    return (
      <div className="dashboard" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Receipt size={48} color="var(--color-error)" style={{ margin: '0 auto 16px' }} />
        <h2>Module Factures Fournisseurs non activé</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Ce module n'est pas activé sur votre profil utilisateur. Veuillez contacter la Direction.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Factures Fournisseurs</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
            Module autonome — fournisseurs, factures, paiements et pièces jointes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => void refresh()} title="Recharger">
            <RotateCcw size={16} /> Actualiser
          </button>
          {tab === 'invoices' ? (
            <>
              <button className="btn btn-secondary" onClick={handleExport} title="Exporter la sélection en CSV">
                <Download size={16} /> Export CSV
              </button>
              <button className="btn btn-primary" onClick={openNewInvoice} disabled={savingInvoice}>
                <Plus size={16} /> Nouvelle facture
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={openNewSupplier} disabled={savingSupplier}>
              <Plus size={16} /> Nouveau fournisseur
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: '16px', padding: '10px 16px', borderLeft: '4px solid #F59E0B', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={() => void refresh()}>
            <RotateCcw size={12} /> Réessayer
          </button>
        </div>
      )}

      {/* Onglets */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button className={`btn ${tab === 'invoices' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('invoices')}>
          <Receipt size={16} /> Factures ({invoices.length})
        </button>
        <button className={`btn ${tab === 'suppliers' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('suppliers')}>
          <Truck size={16} /> Fournisseurs ({suppliers.length})
        </button>
      </div>

      {tab === 'invoices' && (
        <>
          {/* ─── SÉLECTEUR D'ANNÉE ET ONGLETS MENSUELS (miroir Suivi clients) ─── */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Exercice :</span>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--color-surface-alt)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
                {availableYears.map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setSelectedYear(yr)}
                    style={{
                      padding: '4px 12px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      background: selectedYear === yr ? 'var(--color-primary)' : 'transparent',
                      color: selectedYear === yr ? '#ffffff' : 'var(--color-text)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(75px, 1fr))', gap: '6px' }}>
              {MONTH_NAMES.map((m) => {
                const isSelected = selectedMonth === m.num;
                const countInMonth = monthCounts[m.num - 1] || 0;
                return (
                  <button
                    key={m.num}
                    onClick={() => setSelectedMonth(m.num)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px 4px',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: isSelected ? 'rgba(60, 125, 175, 0.1)' : 'var(--color-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--color-primary)' : 'var(--color-text)' }}>
                      {m.name}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      marginTop: '3px',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      fontWeight: 600,
                      background: countInMonth > 0 ? (isSelected ? 'var(--color-primary)' : 'var(--color-surface-alt)') : 'transparent',
                      color: countInMonth > 0 ? (isSelected ? '#fff' : 'var(--color-text-muted)') : 'var(--color-text-muted)',
                    }}>
                      {countInMonth > 0 ? `${countInMonth}` : '-'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* KPIs du mois sélectionné */}
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
            KPIs — {selectedMonthName} {selectedYear}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #3B82F6' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Factures suivies</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{kpis.count}</div>
              <div style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 600 }}>{kpis.totalTtc.toLocaleString('fr-FR')} FCFA</div>
            </div>
            <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #10B981' }}>
              <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, textTransform: 'uppercase' }}>Payé</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>{kpis.totalPaid.toLocaleString('fr-FR')} FCFA</div>
            </div>
            <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #F59E0B' }}>
              <div style={{ fontSize: '0.72rem', color: '#D97706', fontWeight: 600, textTransform: 'uppercase' }}>Reste dû</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#D97706' }}>{kpis.rest.toLocaleString('fr-FR')} FCFA</div>
            </div>
            <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #EF4444' }}>
              <div style={{ fontSize: '0.72rem', color: '#DC2626', fontWeight: 600, textTransform: 'uppercase' }}>En retard</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#DC2626' }}>{kpis.lateCount}</div>
              <div style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 600 }}>{kpis.lateAmount.toLocaleString('fr-FR')} FCFA</div>
            </div>
          </div>

          {/* ─── VUE ANNUELLE GLOBALE ─── */}
          <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
            <div
              onClick={() => setShowAnnual(!showAnnual)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
              title={showAnnual ? 'Replier la vue annuelle' : 'Déplier la vue annuelle'}
            >
              {showAnnual ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              <span>Vue annuelle {selectedYear} — données globales ({annual.count} facture(s))</span>
            </div>
            {showAnnual && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-surface-alt)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Facturé année</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{annual.total.toLocaleString('fr-FR')} F</div>
                  </div>
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.08)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>Payé année ({annual.recoveryRate}%)</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>{annual.paid.toLocaleString('fr-FR')} F</div>
                  </div>
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.08)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#D97706', textTransform: 'uppercase' }}>Reste dû année</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#D97706' }}>{annual.rest.toLocaleString('fr-FR')} F</div>
                  </div>
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.08)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>En retard ({annual.lateCount})</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#DC2626' }}>{annual.lateAmount.toLocaleString('fr-FR')} F</div>
                  </div>
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-surface-alt)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Moyenne / facture</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{Math.round(annual.avg).toLocaleString('fr-FR')} F</div>
                  </div>
                </div>
                <MonthlyBars data={annual.series} legend1="Facturé" legend2="Payé" color1="#EA580C" color2="#10B981" />
                {annual.topSuppliers.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '8px' }}>Top 5 fournisseurs {selectedYear}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {annual.topSuppliers.map((t) => (
                        <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem' }}>
                          <span style={{ flex: '0 0 180px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                          <div style={{ flex: 1, height: '10px', borderRadius: '5px', background: 'var(--color-surface-alt)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${annual.total > 0 ? Math.round((t.total / annual.total) * 100) : 0}%`, background: '#EA580C', borderRadius: '5px' }} />
                          </div>
                          <span style={{ flex: '0 0 auto', fontWeight: 700 }}>{t.total.toLocaleString('fr-FR')} F</span>
                          <span style={{ flex: '0 0 auto', color: t.rest > 0 ? '#D97706' : '#059669' }}>
                            ({t.count}, reste {t.rest.toLocaleString('fr-FR')})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Filtres */}
          <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px' }}>
              <Filter size={16} color="var(--color-primary)" /> Filtres
              {hasActiveFilters && (
                <button className="btn btn-secondary" onClick={resetFilters} style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                  <RotateCcw size={12} /> Réinitialiser
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input type="text" className="table-input" placeholder="N° facture, fournisseur..." style={{ paddingLeft: '32px', width: '100%' }} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="table-input" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
                <option value="">Tous les fournisseurs</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select className="table-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Tous les statuts</option>
                {SUP_INVOICE_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tableau — registre du mois */}
          <div className="card">
            <div style={{ padding: '12px 20px 0', fontSize: '0.85rem', fontWeight: 700 }}>
              Registre : {selectedMonthName} {selectedYear} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>— {filteredInvoices.length} facture(s)</span>
            </div>
            <div className="table-responsive">
              <table className="data-table responsive-table">
                <thead>
                  <tr>
                    <th>N° Facture</th>
                    <th>Fournisseur</th>
                    <th>Émission</th>
                    <th>Échéance</th>
                    <th style={{ textAlign: 'right' }}>Montant</th>
                    <th style={{ textAlign: 'right' }}>Payé</th>
                    <th style={{ textAlign: 'right' }}>Reste</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && invoices.length === 0 && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '24px' }}>Chargement…</td></tr>
                  )}
                  {filteredInvoices.map((inv) => {
                    const paid = paidForInvoice(inv.id);
                    const rest = Math.max(0, (Number(inv.amountTtc) || 0) - paid);
                    const st = effectiveStatus(inv);
                    return (
                      <tr key={inv.id}>
                        <td data-label="N° Facture"><strong style={{ color: 'var(--color-primary)' }}>{inv.invoiceNumber}</strong></td>
                        <td data-label="Fournisseur"><strong>{inv.supplierName}</strong></td>
                        <td data-label="Émission">{inv.issueDate}</td>
                        <td data-label="Échéance">{inv.dueDate || '-'}</td>
                        <td data-label="Montant" style={{ textAlign: 'right', fontWeight: 700 }}>{(Number(inv.amountTtc) || 0).toLocaleString('fr-FR')} FCFA</td>
                        <td data-label="Payé" style={{ textAlign: 'right' }}>{paid.toLocaleString('fr-FR')} FCFA</td>
                        <td data-label="Reste" style={{ textAlign: 'right', fontWeight: 700 }}>{rest.toLocaleString('fr-FR')} FCFA</td>
                        <td data-label="Statut">
                          <span className={`badge-status ${badgeClass(st)}`}>{st}</span>
                          {inv.attachmentData && <Paperclip size={14} style={{ marginLeft: '6px', verticalAlign: '-2px' }} />}
                        </td>
                        <td data-label="Actions">
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button className="icon-button" style={{ color: '#059669' }} title="Encaisser / payer" onClick={() => openPayments(inv)}><Wallet size={16} /></button>
                            <button className="icon-button" style={{ color: 'var(--color-primary)' }} title="Modifier" onClick={() => openEditInvoice(inv)}><Edit2 size={16} /></button>
                            {inv.attachmentData && (
                              <button className="icon-button" style={{ color: '#0D9488' }} title="Télécharger la pièce" onClick={() => downloadAttachment(inv)}><Download size={16} /></button>
                            )}
                            <button className="icon-button" style={{ color: 'var(--color-error)' }} title="Supprimer" onClick={() => handleDeleteInvoice(inv)}><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredInvoices.length === 0 && !loading && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>Aucune facture pour {selectedMonthName} {selectedYear}.</td></tr>
                  )}
                </tbody>
                {filteredInvoices.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--color-surface-alt)', fontWeight: 800 }}>
                      <td colSpan={4}>TOTAL DU MOIS ({selectedMonthName.toUpperCase()} {selectedYear})</td>
                      <td style={{ textAlign: 'right' }}>{kpis.totalTtc.toLocaleString('fr-FR')} FCFA</td>
                      <td style={{ textAlign: 'right' }}>{kpis.totalPaid.toLocaleString('fr-FR')} FCFA</td>
                      <td style={{ textAlign: 'right' }}>{kpis.rest.toLocaleString('fr-FR')} FCFA</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'suppliers' && (
        <div className="card">
          <div className="table-responsive">
            <table className="data-table responsive-table">
              <thead>
                <tr>
                  <th>Fournisseur</th>
                  <th>Contact</th>
                  <th>Téléphone</th>
                  <th>NIF</th>
                  <th style={{ textAlign: 'right' }}>Facturé</th>
                  <th style={{ textAlign: 'right' }}>Reste dû</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => {
                  const st = supplierStats(s.id);
                  return (
                    <tr key={s.id}>
                      <td data-label="Fournisseur"><strong>{s.name}</strong></td>
                      <td data-label="Contact">{s.contact || '-'}</td>
                      <td data-label="Téléphone">{s.phone || '-'}</td>
                      <td data-label="NIF">{s.nif || '-'}</td>
                      <td data-label="Facturé" style={{ textAlign: 'right' }}>{st.ttc.toLocaleString('fr-FR')} FCFA ({st.count})</td>
                      <td data-label="Reste dû" style={{ textAlign: 'right', fontWeight: 700 }}>{st.rest.toLocaleString('fr-FR')} FCFA</td>
                      <td data-label="Actions">
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button className="icon-button" style={{ color: 'var(--color-primary)' }} title="Modifier" onClick={() => openEditSupplier(s)}><Edit2 size={16} /></button>
                          <button className="icon-button" style={{ color: 'var(--color-error)' }} title="Supprimer" onClick={() => handleDeleteSupplier(s)}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {suppliers.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>Aucun fournisseur. Créez le premier avec « Nouveau fournisseur ».</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modale facture ── */}
      {showInvoiceModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>{editingInvoice ? 'Modifier la facture' : 'Nouvelle facture fournisseur'}</h3>
              <button className="icon-button" onClick={() => setShowInvoiceModal(false)}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Fournisseur *</label>
                <select className="table-input" style={{ width: '100%' }} value={fSupplierId} onChange={(e) => setFSupplierId(e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>N° facture *</label>
                <input className="table-input" style={{ width: '100%' }} value={fNumber} onChange={(e) => setFNumber(e.target.value)} placeholder="Ex : F-2026-118" />
              </div>
              {editingInvoice && (
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Statut</label>
                  <select className="table-input" style={{ width: '100%' }} value={fStatus} onChange={(e) => setFStatus(e.target.value as SupInvoiceStatus)}>
                    {SUP_INVOICE_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Date émission *</label>
                <input type="date" className="table-input" style={{ width: '100%' }} value={fIssue} onChange={(e) => setFIssue(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Date échéance</label>
                <input type="date" className="table-input" style={{ width: '100%' }} value={fDue} onChange={(e) => setFDue(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Montant (FCFA) *</label>
                <input type="number" min={0} className="table-input" style={{ width: '100%' }} value={fAmount || ''} onChange={(e) => setFAmount(Number(e.target.value) || 0)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Mode de paiement prévu</label>
                <select className="table-input" style={{ width: '100%' }} value={fMethod} onChange={(e) => setFMethod(e.target.value)}>
                  <option value="">—</option>
                  {SUP_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Description</label>
                <textarea className="table-input" style={{ width: '100%' }} rows={2} value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Objet de la facture…" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Pièce jointe (max 2,5 Mo)</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="file" accept="image/*,.pdf" onChange={(e) => handleFile(e.target.files?.[0])} />
                  {fFileName && <span style={{ fontSize: '0.8rem' }}>{fFileName} <button className="icon-button" title="Retirer" onClick={() => { setFFileName(''); setFFileMime(''); setFFileData(''); }}><X size={14} /></button></span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setShowInvoiceModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={() => void handleSaveInvoice()} disabled={savingInvoice}>
                {savingInvoice ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale fournisseur ── */}
      {showSupplierModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>{editingSupplier ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h3>
              <button className="icon-button" onClick={() => setShowSupplierModal(false)}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Nom *</label>
                <input className="table-input" style={{ width: '100%' }} value={sName} onChange={(e) => setSName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Contact</label>
                <input className="table-input" style={{ width: '100%' }} value={sContact} onChange={(e) => setSContact(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Téléphone</label>
                <input className="table-input" style={{ width: '100%' }} value={sPhone} onChange={(e) => setSPhone(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Email</label>
                <input className="table-input" style={{ width: '100%' }} value={sEmail} onChange={(e) => setSEmail(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>NIF / RCCM</label>
                <input className="table-input" style={{ width: '100%' }} value={sNif} onChange={(e) => setSNif(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Adresse</label>
                <input className="table-input" style={{ width: '100%' }} value={sAddress} onChange={(e) => setSAddress(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Notes</label>
                <textarea className="table-input" style={{ width: '100%' }} rows={2} value={sNotes} onChange={(e) => setSNotes(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setShowSupplierModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={() => void handleSaveSupplier()} disabled={savingSupplier}>
                {savingSupplier ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale paiements ── */}
      {payFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0 }}>Paiements — {payFor.invoiceNumber}</h3>
              <button className="icon-button" onClick={() => setPayFor(null)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Montant : {(Number(payFor.amountTtc) || 0).toLocaleString('fr-FR')} FCFA — Payé : {paidForInvoice(payFor.id).toLocaleString('fr-FR')} FCFA — Reste : {Math.max(0, (Number(payFor.amountTtc) || 0) - paidForInvoice(payFor.id)).toLocaleString('fr-FR')} FCFA
            </p>
            {payments.filter((p) => p.invoiceId === payFor.id).map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
                <span>{p.paymentDate} — <strong>{(Number(p.amount) || 0).toLocaleString('fr-FR')} FCFA</strong> ({p.method || '-'}){p.reference ? ` — ${p.reference}` : ''}</span>
                <button
                  className="icon-button"
                  style={{ color: 'var(--color-error)' }}
                  onClick={() => {
                    confirm({
                      title: 'Supprimer le paiement',
                      message: `Supprimer ce paiement de ${(Number(p.amount) || 0).toLocaleString('fr-FR')} FCFA ?`,
                      confirmLabel: 'Supprimer',
                      variant: 'danger',
                      onConfirm: () => void deletePayment(p.id),
                    });
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {payments.filter((p) => p.invoiceId === payFor.id).length === 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Aucun paiement enregistré.</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Montant *</label>
                <input type="number" min={0} className="table-input" style={{ width: '100%' }} value={payAmount || ''} onChange={(e) => setPayAmount(Number(e.target.value) || 0)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Date</label>
                <input type="date" className="table-input" style={{ width: '100%' }} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Mode</label>
                <select className="table-input" style={{ width: '100%' }} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  {SUP_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Référence</label>
                <input className="table-input" style={{ width: '100%' }} value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="N° reçu, virement…" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setPayFor(null)}>Fermer</button>
              <button className="btn btn-primary" onClick={() => void handleAddPayment()} disabled={savingPay}>
                <Wallet size={16} /> {savingPay ? 'Ajout…' : 'Ajouter le paiement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SupFactures() {
  return (
    <SupInvoiceProvider>
      <SupFacturesInner />
    </SupInvoiceProvider>
  );
}

export default SupFactures;
