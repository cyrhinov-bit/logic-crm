import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Receipt, 
  Calendar, 
  Download, 
  CreditCard, 
  Trash2, 
  Edit3, 
  X, 
  Building2, 
  Upload, 
  FileSpreadsheet, 
  Share2, 
  Filter, 
  RotateCcw,
  CheckCircle2,
  TrendingUp,
  Award,
  DollarSign,
  User,
  ChevronDown,
  ChevronUp,
  Check
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAppContext } from '../context/AppContext';
import { visibleTo } from '../lib/scope';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../components/ConfirmModal';
import { MonthlyBars } from '../components/MonthlyBars';
import type { Invoice, InvoiceStatus } from '../types/crmModules';
import toast from 'react-hot-toast';

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

export function Factures() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser: authUser } = useAuth();
  const { 
    invoices, 
    invoicePayments,
    clients, 
    services, 
    users, 
    settings,
    addInvoice, 
    updateInvoice, 
    deleteInvoice, 
    addInvoicePayment,
    deleteInvoicePayment
  } = useAppContext();

  const currentUser = users.find(u => u.id === authUser?.id) || authUser;
  const { confirm } = useConfirm();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Période de suivi (Année & Mois)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(9); // Défaut Septembre

  // Filtres & Recherche
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [commercialFilter, setCommercialFilter] = useState<string>('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  // Vue annuelle globale (repliable)
  const [showAnnual, setShowAnnual] = useState(true);

  // Form State for Invoice / Tracking row
  const [formPeriodYear, setFormPeriodYear] = useState<number>(2026);
  const [formPeriodMonth, setFormPeriodMonth] = useState<number>(9);
  const [formQuoteId, setFormQuoteId] = useState<string>('');
  const [formClientId, setFormClientId] = useState<string>('');
  const [formClientName, setFormClientName] = useState<string>('');
  const [formCommercialId, setFormCommercialId] = useState<string>('');
  const [formCommercialName, setFormCommercialName] = useState<string>('');
  const [formServiceId, setFormServiceId] = useState<string>('');
  const [formServiceName, setFormServiceName] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('');
  const [formDeliveryDate, setFormDeliveryDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formPaymentDate, setFormPaymentDate] = useState<string>('');
  const [formAmountToPay, setFormAmountToPay] = useState<number>(0);
  const [formAmountUsed, setFormAmountUsed] = useState<number>(0);
  const [formCommissionRate, setFormCommissionRate] = useState<number>(10);
  const [formCommissionAmount, setFormCommissionAmount] = useState<number>(0);
  const [formAmountPaid, setFormAmountPaid] = useState<number>(0);
  const [formNotes, setFormNotes] = useState<string>('');

  // Form State for Payment Modal
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState<string>('Espèces');
  const [payRef, setPayRef] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');

  // Commercial Search Dropdown State
  const [commercialSearchTerm, setCommercialSearchTerm] = useState<string>('');
  const [isCommercialDropdownOpen, setIsCommercialDropdownOpen] = useState<boolean>(false);
  const commercialDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (commercialDropdownRef.current && !commercialDropdownRef.current.contains(event.target as Node)) {
        setIsCommercialDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredUsersForModal = useMemo(() => {
    if (!commercialSearchTerm.trim()) return users;
    const term = commercialSearchTerm.toLowerCase();
    return users.filter(u => 
      u.name.toLowerCase().includes(term) || 
      (u.role && u.role.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term))
    );
  }, [users, commercialSearchTerm]);

  const handleSelectCommercial = (user: { id: string; name: string }) => {
    setFormCommercialId(user.id);
    setFormCommercialName(user.name);
    setIsCommercialDropdownOpen(false);
    setCommercialSearchTerm('');
  };

  const handleClearCommercial = () => {
    setFormCommercialId('');
    setFormCommercialName('');
    setIsCommercialDropdownOpen(false);
    setCommercialSearchTerm('');
  };

  const isDirector = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');

  // Helper functions
  const getClient = (id?: string) => clients.find(c => c.id === id);
  const getClientDisplayName = (inv: Invoice) => {
    if (inv.clientName) return inv.clientName;
    if (inv.clientId) {
      const c = getClient(inv.clientId);
      return c?.company || c?.name || 'Client';
    }
    return inv.notes?.split(' - ')[0] || 'Client divers';
  };

  const getCommercialDisplayName = (inv: Invoice) => {
    if (inv.commercialName) return inv.commercialName;
    if (inv.commercialId) {
      const u = users.find(user => user.id === inv.commercialId);
      return u?.name || 'Commercial';
    }
    return '-';
  };

  const getServiceDisplayName = (inv: Invoice) => {
    if (inv.serviceName) return inv.serviceName;
    if (inv.serviceId) {
      const s = services.find(srv => srv.id === inv.serviceId);
      return s?.name || '-';
    }
    return 'GÉNÉRAL';
  };

  // Liste STRICTE des services créés dans le module Services
  const createdServices = useMemo(() => {
    return (services || []).filter(s => s && s.name && s.name.trim() !== '');
  }, [services]);

  // Helper de formatage avec séparateurs de milliers (ex: 1 000 000)
  const handleFormattedNumberChange = (setter: (val: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\s/g, '').replace(/[^0-9]/g, '');
    const num = raw === '' ? 0 : parseInt(raw, 10);
    setter(num);
  };

  const formatNumberDisplay = (num?: number): string => {
    if (num === undefined || num === null || num === 0) return '';
    return num.toLocaleString('fr-FR');
  };

  // Live calculations for Form (Marge brute, Marge HINOV, Reste)
  const formGrossMargin = useMemo(() => {
    return Math.max(0, formAmountToPay - formAmountUsed);
  }, [formAmountToPay, formAmountUsed]);

  const formHinovMargin = useMemo(() => {
    return formGrossMargin - formCommissionAmount;
  }, [formGrossMargin, formCommissionAmount]);

  const formRemainingAmount = useMemo(() => {
    return Math.max(0, formAmountToPay - formAmountPaid);
  }, [formAmountToPay, formAmountPaid]);

  // Ouverture création d'une nouvelle ligne de suivi
  const handleOpenNewTrackingRow = () => {
    setEditingInvoiceId(null);
    setFormPeriodYear(selectedYear);
    setFormPeriodMonth(selectedMonth);
    setFormQuoteId('');
    setFormClientId('');
    setFormClientName('');
    setFormCommercialId(currentUser?.id || '');
    setFormCommercialName(currentUser?.name || '');
    const currentSrv = services.find(s => s.id === currentUser?.serviceId);
    setFormServiceId(currentSrv?.id || (createdServices.length > 0 ? createdServices[0].id : ''));
    setFormServiceName(currentSrv?.name || (createdServices.length > 0 ? createdServices[0].name : ''));
    setFormCategory('');
    const defaultDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    setFormDeliveryDate(defaultDate);
    setFormPaymentDate('');
    setFormAmountToPay(0);
    setFormAmountUsed(0);
    setFormCommissionAmount(0);
    setFormCommissionRate(10);
    setFormAmountPaid(0);
    setFormNotes('');
    setIsCreateModalOpen(true);
  };

  const handleEditTrackingRow = (inv: Invoice) => {
    setEditingInvoiceId(inv.id);
    const year = inv.periodYear || (inv.deliveryDate ? new Date(inv.deliveryDate).getFullYear() : selectedYear);
    const month = inv.periodMonth || (inv.deliveryDate ? new Date(inv.deliveryDate).getMonth() + 1 : selectedMonth);
    setFormPeriodYear(year);
    setFormPeriodMonth(month);
    setFormQuoteId(inv.quoteId || '');
    setFormClientId(inv.clientId || '');
    setFormClientName(getClientDisplayName(inv));
    setFormCommercialId(inv.commercialId || '');
    setFormCommercialName(getCommercialDisplayName(inv));
    setFormServiceId(inv.serviceId || '');
    setFormServiceName(getServiceDisplayName(inv));
    setFormCategory(inv.category || '');
    setFormDeliveryDate(inv.deliveryDate || inv.issueDate || new Date().toISOString().split('T')[0]);
    setFormPaymentDate(inv.paymentDate || '');
    setFormAmountToPay(inv.totalAmount || 0);
    setFormAmountUsed(inv.costAmount || 0);
    setFormCommissionAmount(inv.commissionAmount !== undefined ? inv.commissionAmount : 0);
    setFormCommissionRate(inv.commissionRate ?? 10);
    setFormAmountPaid(inv.amountPaid ?? 0);
    setFormNotes(inv.notes || '');
    setIsCreateModalOpen(true);
  };

  // Enregistrement / Mise à jour
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formClientName.trim()) {
      toast.error('Veuillez renseigner le Client.');
      return;
    }

    if (formAmountToPay <= 0) {
      toast.error('Le montant à payer doit être supérieur à zéro.');
      return;
    }

    const periodYear = Number(formPeriodYear) || selectedYear;
    const periodMonth = Number(formPeriodMonth) || selectedMonth;

    const grossMargin = Math.max(0, formAmountToPay - formAmountUsed);
    const commissionAmount = Number(formCommissionAmount) || 0;
    const hinovMargin = Math.max(0, grossMargin - commissionAmount);
    const remainingAmount = Math.max(0, formAmountToPay - formAmountPaid);
    const commissionRate = grossMargin > 0 ? Math.round((commissionAmount / grossMargin) * 100) : 0;

    const baseNumber = `FAC-${periodYear}-${String(periodMonth).padStart(2, '0')}`;
    const existingNumbers = new Set(invoices.map(i => i.invoiceNumber));
    const makeNumber = () => `${baseNumber}-${Math.floor(1000 + Math.random() * 9000)}`;
    let invoiceNumber: string;
    if (editingInvoiceId) {
      invoiceNumber = invoices.find(i => i.id === editingInvoiceId)?.invoiceNumber || makeNumber();
    } else {
      // Anti-collision (même principe que CMD-/MNT-/ART- côté CRM)
      invoiceNumber = makeNumber();
      let guard = 0;
      while (existingNumbers.has(invoiceNumber) && guard < 50) {
        invoiceNumber = makeNumber();
        guard++;
      }
    }

    const matchedService = createdServices.find(s => s.name === formServiceName || s.id === formServiceId);

    const invoicePayload: Partial<Invoice> = {
      invoiceNumber,
      quoteId: formQuoteId || undefined,
      clientId: formClientId || undefined,
      clientName: formClientName.trim(),
      commercialId: formCommercialId || undefined,
      commercialName: formCommercialName.trim() || undefined,
      serviceId: formServiceId || matchedService?.id || undefined,
      serviceName: formServiceName.trim() || matchedService?.name || undefined,
      category: formCategory.trim() || undefined,
      periodYear,
      periodMonth,
      deliveryDate: formDeliveryDate,
      issueDate: formDeliveryDate,
      paymentDate: formPaymentDate || undefined,
      dueDate: formDeliveryDate,
      paymentTerms: '30 jours',
      subtotal: formAmountToPay,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: formAmountToPay,
      costAmount: formAmountUsed,
      commissionRate,
      commissionAmount,
      grossMargin,
      hinovMargin,
      amountPaid: formAmountPaid,
      remainingAmount,
      status: remainingAmount === 0 ? 'PAYÉE' : (formAmountPaid > 0 ? 'PARTIELLEMENT_PAYÉE' : 'ÉMISE'),
      notes: formNotes || undefined,
      createdBy: currentUser?.id
    };

    try {
      if (editingInvoiceId) {
        await updateInvoice(editingInvoiceId, invoicePayload);
        toast.success(`Ligne mise à jour avec succès !`);
      } else {
        await addInvoice(invoicePayload as Invoice);
        toast.success(`Facture ajoutée avec succès pour ${MONTH_NAMES[periodMonth - 1]?.name} ${periodYear} !`);
      }

      // Basculer l'affichage vers le mois et l'année choisis
      setSelectedYear(periodYear);
      setSelectedMonth(periodMonth);

      setIsCreateModalOpen(false);
      setEditingInvoiceId(null);
    } catch (err) {
      console.error('Erreur sauvegarde suivi:', err);
      toast.error('Une erreur est survenue lors de l\'enregistrement.');
    }
  };

  // Suppression
  const handleDelete = (inv: Invoice) => {
    confirm({
      title: 'Supprimer cette facture du suivi ?',
      message: `Êtes-vous sûr de vouloir supprimer la facture pour le client "${getClientDisplayName(inv)}" (Montant : ${inv.totalAmount.toLocaleString('fr-FR')} FCFA) ?`,
      confirmLabel: 'Supprimer définitivement',
      cancelLabel: 'Annuler',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteInvoice(inv.id);
          toast.success('Ligne supprimée du registre.');
        } catch (err) {
          toast.error('Erreur lors de la suppression.');
        }
      }
    });
  };

  // Paiement Modal
  const handleOpenPaymentModal = (inv: Invoice) => {
    setSelectedInvoice(inv);
    const remaining = inv.remainingAmount !== undefined ? inv.remainingAmount : Math.max(0, inv.totalAmount - (inv.amountPaid || 0));
    setPayAmount(remaining);
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayMethod('Espèces');
    setPayRef('');
    setPayNotes('');
    setIsPaymentModalOpen(true);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    if (payAmount <= 0) {
      toast.error('Veuillez saisir un montant supérieur à zéro.');
      return;
    }
    // Facture « live » (le state a pu évoluer si un encaissement vient d'être supprimé
    // dans cette même modale) pour une garde anti-surpaiement toujours juste.
    const live = invoices.find(i => i.id === selectedInvoice.id) ?? selectedInvoice;
    // Garde anti-surpaiement : le modèle n'a pas de notion d'avoir/trop-perçu ;
    // tout excédent serait silencieusement absorbé (statut PAYÉE, reste 0).
    const remainingBefore = live.remainingAmount !== undefined
      ? live.remainingAmount
      : Math.max(0, live.totalAmount - (live.amountPaid || 0));
    if (payAmount > remainingBefore) {
      toast.error(`Montant supérieur au reste dû (${remainingBefore.toLocaleString('fr-FR')} FCFA). Ajustez d'abord le total de la facture si c'est un avoir.`);
      return;
    }

    try {
      // Écriture unique : addInvoicePayment enregistre la ligne datée ET met à jour
      // les totaux / le statut / la date de dernier règlement en une action synchro.
      await addInvoicePayment({
        invoiceId: live.id,
        amount: payAmount,
        paymentDate: payDate,
        paymentMethod: payMethod,
        reference: payRef || undefined,
        notes: payNotes || undefined,
        createdBy: currentUser?.id
      });

      toast.success(`Paiement de ${payAmount.toLocaleString('fr-FR')} FCFA enregistré !`);
      setIsPaymentModalOpen(false);
      setSelectedInvoice(null);
    } catch (err) {
      console.error('Erreur paiement:', err);
      toast.error('Erreur lors de l\'enregistrement du règlement.');
    }
  };

  // WhatsApp Relance
  const handleSendWhatsApp = (inv: Invoice) => {
    const client = clients.find(c => c.id === inv.clientId) || clients.find(c => c.name.toLowerCase() === (inv.clientName || '').toLowerCase());
    const phone = client?.phone || '';
    if (!phone) {
      toast.error('Aucun numéro de téléphone enregistré pour ce client. Renseignez-le dans le module Clients.');
      return;
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const remaining = inv.remainingAmount !== undefined ? inv.remainingAmount : Math.max(0, inv.totalAmount - (inv.amountPaid || 0));
    const message = `Bonjour ${getClientDisplayName(inv)},\n\nNous vous contactons au sujet du suivi de votre facture pour les prestations (${inv.serviceName || 'HINOV'} - ${inv.category || 'Prestation'}).\nMontant restant à régler : ${remaining.toLocaleString('fr-FR')} FCFA.\nDate de livraison : ${inv.deliveryDate || '-'}.\n\nMerci de bien vouloir procéder au règlement.\nCordialement,\n${settings.companyName || 'HINOV SARL'}`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // Import Excel (.xlsx) handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        
        let importedCount = 0;

        for (const sheetName of wb.SheetNames) {
          const upperSheet = sheetName.trim().toUpperCase();
          const monthIdx = MONTH_NAMES.findIndex(m => upperSheet.includes(m.name.toUpperCase()));
          const periodMonth = monthIdx !== -1 ? monthIdx + 1 : selectedMonth;
          const periodYear = selectedYear;

          const ws = wb.Sheets[sheetName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

          for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length === 0) continue;

            const col0 = String(row[0] || '').trim();
            const col0Upper = col0.toUpperCase();
            if (col0Upper.includes('CLIENT') || col0Upper.includes('TOTAL') || col0Upper === '' || col0Upper.includes('PAGE')) {
              continue;
            }

            const clientName = col0;
            const commercialName = String(row[1] || '').trim();
            
            let deliveryDate = '';
            if (row[2] instanceof Date) {
              deliveryDate = row[2].toISOString().split('T')[0];
            } else if (typeof row[2] === 'string' && row[2].trim()) {
              deliveryDate = row[2].trim();
            } else {
              deliveryDate = `${periodYear}-${String(periodMonth).padStart(2, '0')}-01`;
            }

            let paymentDate = '';
            if (row[3] instanceof Date) {
              paymentDate = row[3].toISOString().split('T')[0];
            } else if (typeof row[3] === 'string' && row[3].trim()) {
              paymentDate = row[3].trim();
            }

            const serviceName = String(row[4] || 'INFORMATIQUE').trim().toUpperCase();
            const category = String(row[5] || '').trim();
            const amountToPay = Number(row[6]) || 0;
            const amountUsed = Number(row[7]) || 0;
            const amountPaid = Number(row[11]) || 0;

            if (amountToPay > 0 || clientName.length > 1) {
              const grossMargin = Math.max(0, amountToPay - amountUsed);
              const hasCommercial = commercialName.trim() !== '';
              const commissionRate = hasCommercial ? 10 : 0;
              const commissionAmount = hasCommercial ? Math.round(grossMargin * 0.1) : 0;
              const hinovMargin = Math.max(0, grossMargin - commissionAmount);
              const remainingAmount = Math.max(0, amountToPay - amountPaid);

              await addInvoice({
                invoiceNumber: `FAC-${periodYear}-${String(periodMonth).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
                clientName,
                commercialName: commercialName || undefined,
                serviceName: serviceName || 'INFORMATIQUE',
                category: category || undefined,
                periodYear,
                periodMonth,
                deliveryDate,
                issueDate: deliveryDate,
                paymentDate: paymentDate || undefined,
                dueDate: deliveryDate,
                paymentTerms: '30 jours',
                subtotal: amountToPay,
                taxAmount: 0,
                discountAmount: 0,
                totalAmount: amountToPay,
                costAmount: amountUsed,
                commissionRate,
                commissionAmount,
                grossMargin,
                hinovMargin,
                amountPaid,
                remainingAmount,
                status: remainingAmount === 0 && amountToPay > 0 ? 'PAYÉE' : (amountPaid > 0 ? 'PARTIELLEMENT_PAYÉE' : 'ÉMISE'),
                createdBy: currentUser?.id
              } as Invoice);

              importedCount++;
            }
          }
        }

        toast.success(`Importation réussie : ${importedCount} factures ajoutées au registre !`);
      } catch (err) {
        console.error('Erreur import Excel:', err);
        toast.error('Erreur lors de la lecture du fichier Excel.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // Quick Seed Septembre 2026
  const handleSeedSeptembre2026 = async () => {
    const defaultData = [
      {
        clientName: 'CORIS',
        commercialName: 'BOSSO',
        deliveryDate: '2026-09-14',
        paymentDate: '',
        serviceName: 'INFORMATIQUE',
        category: 'CARTOUCHE',
        amountToPay: 670000,
        amountUsed: 502000,
        amountPaid: 0
      },
      {
        clientName: 'MEDLOG',
        commercialName: '',
        deliveryDate: '2026-09-15',
        paymentDate: '',
        serviceName: 'INFORMATIQUE',
        category: 'CASQUE',
        amountToPay: 255000,
        amountUsed: 180000,
        amountPaid: 0
      },
      {
        clientName: 'MEHI',
        commercialName: '',
        deliveryDate: '2026-09-18',
        paymentDate: '',
        serviceName: 'IMPRIMERIE',
        category: 'MACARON',
        amountToPay: 150000,
        amountUsed: 75000,
        amountPaid: 0
      }
    ];

    try {
      for (const item of defaultData) {
        const grossMargin = Math.max(0, item.amountToPay - item.amountUsed);
        const hasCommercial = item.commercialName.trim() !== '';
        const commissionRate = hasCommercial ? 10 : 0;
        const commissionAmount = hasCommercial ? Math.round(grossMargin * 0.1) : 0;
        const hinovMargin = Math.max(0, grossMargin - commissionAmount);
        const remainingAmount = Math.max(0, item.amountToPay - item.amountPaid);

        await addInvoice({
          invoiceNumber: `FAC-2026-09-${Math.floor(1000 + Math.random() * 9000)}`,
          clientName: item.clientName,
          commercialName: item.commercialName || undefined,
          serviceName: item.serviceName,
          category: item.category,
          periodYear: 2026,
          periodMonth: 9,
          deliveryDate: item.deliveryDate,
          issueDate: item.deliveryDate,
          dueDate: item.deliveryDate,
          paymentTerms: '30 jours',
          subtotal: item.amountToPay,
          taxAmount: 0,
          discountAmount: 0,
          totalAmount: item.amountToPay,
          costAmount: item.amountUsed,
          commissionRate,
          commissionAmount,
          grossMargin,
          hinovMargin,
          amountPaid: item.amountPaid,
          remainingAmount,
          status: 'ÉMISE',
          createdBy: currentUser?.id
        } as Invoice);
      }
      setSelectedYear(2026);
      setSelectedMonth(9);
      toast.success('Données de référence Septembre 2026 importées avec succès !');
    } catch (err) {
      toast.error('Erreur lors de l\'initialisation.');
    }
  };

  // Export to Excel 13-columns
  const handleExportExcel = () => {
    const monthLabel = MONTH_NAMES.find(m => m.num === selectedMonth)?.name || `Mois_${selectedMonth}`;
    const fileName = `SUIVI_FACTURES_CLIENTS_${monthLabel.toUpperCase()}_${selectedYear}.xlsx`;

    const headers = [
      'CLIENT',
      'COMMERCIAL',
      'DATE LIVRAISON',
      'DATE DE PAYEMENT',
      'SERVICE',
      'CATEGORIE',
      'MONTANT À PAYER',
      'MONTANT UTILISÉ',
      'MARGE AVEC PRIME',
      'PRIME 10%',
      'MARGE HINOV',
      'PAYÉ',
      'RESTE'
    ];

    const rows = filteredInvoices.map(inv => [
      getClientDisplayName(inv),
      getCommercialDisplayName(inv),
      inv.deliveryDate || '-',
      inv.paymentDate || '-',
      getServiceDisplayName(inv),
      inv.category || '-',
      inv.totalAmount || 0,
      inv.costAmount || 0,
      inv.grossMargin || (inv.totalAmount - (inv.costAmount || 0)),
      inv.commissionAmount || 0,
      inv.hinovMargin || 0,
      inv.amountPaid || 0,
      inv.remainingAmount !== undefined ? inv.remainingAmount : Math.max(0, inv.totalAmount - (inv.amountPaid || 0))
    ]);

    rows.push([
      'TOTAL DU MOIS',
      '',
      '',
      '',
      '',
      '',
      monthlyTotals.totalToPay,
      monthlyTotals.totalUsed,
      monthlyTotals.totalGrossMargin,
      monthlyTotals.totalCommission,
      monthlyTotals.totalHinovMargin,
      monthlyTotals.totalPaid,
      monthlyTotals.totalRemaining
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, monthLabel.toUpperCase());
    XLSX.writeFile(wb, fileName);
    toast.success(`Export Excel généré : ${fileName}`);
  };

  // Filtering
  // Scopage : direction = tout, autres rôles (Responsable inclus) = propres factures uniquement
  const allowedInvoices = useMemo(() => {
    // Scopage aligné sur le RLS (owner = commercial assigné OU créateur)
    return visibleTo(invoices, currentUser?.role, currentUser?.id, i => [i.commercialId, (i as any).commercial_id, (i as any).createdBy, (i as any).created_by]);
  }, [invoices, currentUser]);

  const monthInvoices = useMemo(() => {
    return allowedInvoices.filter(inv => {
      // Même règle que getInvoicePeriod : période comptable saisie en priorité,
      // repli sur livraison puis émission, avec garde anti-dates invalides.
      const d = inv.deliveryDate || inv.issueDate;
      const parsed = d ? new Date(d) : new Date(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`);
      const fallbackValid = !isNaN(parsed.getTime());
      const year = inv.periodYear || (fallbackValid ? parsed.getFullYear() : selectedYear);
      const month = inv.periodMonth || (fallbackValid ? parsed.getMonth() + 1 : selectedMonth);
      return year === selectedYear && month === selectedMonth;
    });
  }, [allowedInvoices, selectedYear, selectedMonth]);

  const filteredInvoices = useMemo(() => {
    return monthInvoices.filter(inv => {
      const clientName = getClientDisplayName(inv).toLowerCase();
      const commercial = getCommercialDisplayName(inv).toLowerCase();
      const srv = getServiceDisplayName(inv).toLowerCase();
      const cat = (inv.category || '').toLowerCase();
      const num = (inv.invoiceNumber || '').toLowerCase();

      const matchSearch = !searchTerm || 
        clientName.includes(searchTerm.toLowerCase()) ||
        commercial.includes(searchTerm.toLowerCase()) ||
        srv.includes(searchTerm.toLowerCase()) ||
        cat.includes(searchTerm.toLowerCase()) ||
        num.includes(searchTerm.toLowerCase());

      if (!matchSearch) return false;

      const rem = inv.remainingAmount !== undefined ? inv.remainingAmount : Math.max(0, inv.totalAmount - (inv.amountPaid || 0));
      const isPaid = rem === 0 && inv.totalAmount > 0;
      const isPartial = rem > 0 && (inv.amountPaid || 0) > 0;
      const isUnpaid = (inv.amountPaid || 0) === 0;

      if (statusFilter === 'PAID' && !isPaid) return false;
      if (statusFilter === 'PARTIAL' && !isPartial) return false;
      if (statusFilter === 'UNPAID' && !isUnpaid) return false;

      if (serviceFilter && inv.serviceName !== serviceFilter && inv.serviceId !== serviceFilter) return false;
      if (commercialFilter && inv.commercialName !== commercialFilter && inv.commercialId !== commercialFilter) return false;

      return true;
    });
  }, [monthInvoices, searchTerm, statusFilter, serviceFilter, commercialFilter]);

  // Monthly totals
  const monthlyTotals = useMemo(() => {
    let totalToPay = 0;
    let totalUsed = 0;
    let totalGrossMargin = 0;
    let totalCommission = 0;
    let totalHinovMargin = 0;
    let totalPaid = 0;
    let totalRemaining = 0;

    filteredInvoices.forEach(inv => {
      const toPay = inv.totalAmount || 0;
      const used = inv.costAmount || 0;
      const grossMargin = inv.grossMargin !== undefined ? inv.grossMargin : Math.max(0, toPay - used);
      const commission = inv.commissionAmount !== undefined ? inv.commissionAmount : (inv.commercialName || inv.commercialId ? Math.round(grossMargin * 0.1) : 0);
      const hinovMargin = inv.hinovMargin !== undefined ? inv.hinovMargin : (grossMargin - commission);
      const paid = inv.amountPaid || 0;
      const remaining = inv.remainingAmount !== undefined ? inv.remainingAmount : Math.max(0, toPay - paid);

      totalToPay += toPay;
      totalUsed += used;
      totalGrossMargin += grossMargin;
      totalCommission += commission;
      totalHinovMargin += hinovMargin;
      totalPaid += paid;
      totalRemaining += remaining;
    });

    const marginRate = totalToPay > 0 ? ((totalGrossMargin / totalToPay) * 100).toFixed(1) : '0';
    const recoveryRate = totalToPay > 0 ? ((totalPaid / totalToPay) * 100).toFixed(1) : '0';

    return {
      totalToPay,
      totalUsed,
      totalGrossMargin,
      totalCommission,
      totalHinovMargin,
      totalPaid,
      totalRemaining,
      marginRate,
      recoveryRate
    };
  }, [filteredInvoices]);

  const selectedMonthName = MONTH_NAMES.find(m => m.num === selectedMonth)?.name || 'Septembre';

  // Période de rattachement d'une facture (priorité au mois comptable saisi,
  // repli sur livraison puis émission) — même règle que monthInvoices.
  const getInvoicePeriod = (inv: Invoice): { y: number; m: number } => {
    const yRaw = inv.periodYear || (inv.deliveryDate ? new Date(inv.deliveryDate).getFullYear() : (inv.issueDate ? new Date(inv.issueDate).getFullYear() : 2026));
    const mRaw = inv.periodMonth || (inv.deliveryDate ? new Date(inv.deliveryDate).getMonth() + 1 : (inv.issueDate ? new Date(inv.issueDate).getMonth() + 1 : 9));
    return {
      y: Number.isFinite(yRaw) ? (yRaw as number) : 2026,
      m: mRaw >= 1 && mRaw <= 12 ? mRaw : 9,
    };
  };

  // Totaux annuels globaux (exercice sélectionné, tous mois confondus)
  const annualTotals = useMemo(() => {
    const yearList = allowedInvoices.filter(inv => getInvoicePeriod(inv).y === selectedYear);
    let totalToPay = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let totalGrossMargin = 0;
    let totalCommission = 0;
    let totalHinovMargin = 0;

    yearList.forEach(inv => {
      const toPay = inv.totalAmount || 0;
      const used = inv.costAmount || 0;
      const grossMargin = inv.grossMargin !== undefined ? inv.grossMargin : Math.max(0, toPay - used);
      const commission = inv.commissionAmount !== undefined ? inv.commissionAmount : (inv.commercialName || inv.commercialId ? Math.round(grossMargin * 0.1) : 0);
      const hinovMargin = inv.hinovMargin !== undefined ? inv.hinovMargin : (grossMargin - commission);
      const paid = inv.amountPaid || 0;
      const remaining = inv.remainingAmount !== undefined ? inv.remainingAmount : Math.max(0, toPay - paid);
      totalToPay += toPay;
      totalPaid += paid;
      totalRemaining += remaining;
      totalGrossMargin += grossMargin;
      totalCommission += commission;
      totalHinovMargin += hinovMargin;
    });

    const series = MONTH_NAMES.map(m => {
      const inMonth = yearList.filter(inv => getInvoicePeriod(inv).m === m.num);
      return {
        label: m.short,
        v1: inMonth.reduce((s, inv) => s + (inv.totalAmount || 0), 0),
        v2: inMonth.reduce((s, inv) => s + (inv.amountPaid || 0), 0),
      };
    });

    return {
      count: yearList.length,
      totalToPay,
      totalPaid,
      totalRemaining,
      totalGrossMargin,
      totalCommission,
      totalHinovMargin,
      avg: yearList.length > 0 ? totalToPay / yearList.length : 0,
      marginRate: totalToPay > 0 ? ((totalGrossMargin / totalToPay) * 100).toFixed(1) : '0',
      recoveryRate: totalToPay > 0 ? ((totalPaid / totalToPay) * 100).toFixed(1) : '0',
      series,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedInvoices, selectedYear]);

  // Permission Check
  if (!isDirector && currentUser?.crmFacturationEnabled === false) {
    return (
      <div className="dashboard" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Receipt size={48} color="var(--color-error)" style={{ margin: '0 auto 16px' }} />
        <h2>Module Suivi des Factures non activé</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Ce module n'est pas activé sur votre profil utilisateur. Veuillez contacter la Direction.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      
      {/* ─── EN-TÊTE PRINCIPALE ─────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Receipt size={24} color="var(--color-primary)" />
            <span>Suivi des Factures Clients</span>
            <span className="badge-status" style={{ background: 'rgba(60, 125, 175, 0.12)', color: 'var(--color-primary)', fontSize: '11px', fontWeight: 700 }}>
              Registre Mensuel
            </span>
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
            Suivi de la rentabilité, coûts engagés, marges HINOV, primes et règlements par mois
          </p>
        </div>

        {/* Boutons d'actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".xlsx, .xls, .csv" 
            style={{ display: 'none' }} 
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
            title="Importer un fichier Excel de suivi"
          >
            <Upload size={14} color="var(--color-success)" />
            <span>Importer Excel</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
            title="Exporter le registre mensuel en Excel"
          >
            <Download size={14} />
            <span>Exporter Excel</span>
          </button>

          <button
            onClick={handleOpenNewTrackingRow}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
          >
            <Plus size={16} />
            <span>+ Ajouter une facture</span>
          </button>
        </div>
      </div>

      {/* ─── SÉLECTEUR D'ANNÉE ET ONGLETS MENSUELS ───────────────── */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Exercice :</span>
            <div style={{ display: 'flex', gap: '4px', background: 'var(--color-surface-alt)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
              {[2024, 2025, 2026, 2027].map(yr => (
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
                    transition: 'all 0.15s ease'
                  }}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>

          {monthInvoices.length === 0 && selectedYear === 2026 && selectedMonth === 9 && (
            <button
              onClick={handleSeedSeptembre2026}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
            >
              <FileSpreadsheet size={14} />
              <span>Charger les données de Septembre 2026</span>
            </button>
          )}
        </div>

        {/* 12 Onglets Mensuels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(75px, 1fr))', gap: '6px' }}>
          {MONTH_NAMES.map(m => {
            const isSelected = selectedMonth === m.num;
            const countInMonth = allowedInvoices.filter(i => {
              const d = i.deliveryDate || i.issueDate;
              const parsed = d ? new Date(d) : null;
              const valid = parsed && !isNaN(parsed.getTime());
              const y = i.periodYear || (valid ? (parsed as Date).getFullYear() : selectedYear);
              const mon = i.periodMonth || (valid ? (parsed as Date).getMonth() + 1 : m.num);
              return y === selectedYear && mon === m.num;
            }).length;

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
                  transition: 'all 0.15s ease'
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
                  color: countInMonth > 0 ? (isSelected ? '#fff' : 'var(--color-text-muted)') : 'var(--color-text-muted)'
                }}>
                  {countInMonth > 0 ? `${countInMonth}` : '-'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 7 CARTES KPI DU MOIS SÉLECTIONNÉ ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {/* 1. Total à Payer */}
        <div className="card" style={{ padding: '14px', borderLeft: '4px solid #1E293B' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Total à Payer</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)' }}>
            {monthlyTotals.totalToPay.toLocaleString('fr-FR')} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>F</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {filteredInvoices.length} dossier(s)
          </div>
        </div>

        {/* 2. Total Utilisé (Coût) */}
        <div className="card" style={{ padding: '14px', borderLeft: '4px solid #D97706' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#D97706', textTransform: 'uppercase', marginBottom: '2px' }}>Montant Utilisé</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#D97706' }}>
            {monthlyTotals.totalUsed.toLocaleString('fr-FR')} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>F</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#D97706', marginTop: '2px' }}>
            Coûts engagés
          </div>
        </div>

        {/* 3. Marge Brute */}
        <div className="card" style={{ padding: '14px', borderLeft: '4px solid #10B981', background: 'rgba(16, 185, 129, 0.03)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', marginBottom: '2px' }}>Marge Brute</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>
            {monthlyTotals.totalGrossMargin.toLocaleString('fr-FR')} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>F</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, marginTop: '2px' }}>
            Taux marge : {monthlyTotals.marginRate}%
          </div>
        </div>

        {/* 4. Prime 10% */}
        <div className="card" style={{ padding: '14px', borderLeft: '4px solid #8B5CF6' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8B5CF6', textTransform: 'uppercase', marginBottom: '2px' }}>Prime (10%)</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#8B5CF6' }}>
            {monthlyTotals.totalCommission.toLocaleString('fr-FR')} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>F</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            Commerciaux
          </div>
        </div>

        {/* 5. Marge Nette HINOV */}
        <div className="card" style={{ padding: '14px', borderLeft: '4px solid var(--color-primary)', background: 'rgba(60, 125, 175, 0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', marginBottom: '2px' }}>Marge HINOV</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary)' }}>
            {monthlyTotals.totalHinovMargin.toLocaleString('fr-FR')} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>F</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600, marginTop: '2px' }}>
            Bénéfice Net HINOV
          </div>
        </div>

        {/* 6. Total Payé */}
        <div className="card" style={{ padding: '14px', borderLeft: '4px solid #1879C8' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1879C8', textTransform: 'uppercase', marginBottom: '2px' }}>Total Payé</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1879C8' }}>
            {monthlyTotals.totalPaid.toLocaleString('fr-FR')} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>F</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#1879C8', marginTop: '2px' }}>
            Recouvré : {monthlyTotals.recoveryRate}%
          </div>
        </div>

        {/* 7. Total Reste */}
        <div className="card" style={{ padding: '14px', borderLeft: '4px solid #E11D48', background: 'rgba(225, 29, 72, 0.03)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#E11D48', textTransform: 'uppercase', marginBottom: '2px' }}>Reste à Payer</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#E11D48' }}>
            {monthlyTotals.totalRemaining.toLocaleString('fr-FR')} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>F</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#E11D48', fontWeight: 600, marginTop: '2px' }}>
            À recouvrer
          </div>
        </div>
      </div>

      {/* ─── VUE ANNUELLE GLOBALE ─────────────────────────────── */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div
          onClick={() => setShowAnnual(!showAnnual)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
          title={showAnnual ? 'Replier la vue annuelle' : 'Déplier la vue annuelle'}
        >
          {showAnnual ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span>Vue annuelle {selectedYear} — données globales ({annualTotals.count} dossier(s))</span>
        </div>
        {showAnnual && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-surface-alt)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Facturé année</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{annualTotals.totalToPay.toLocaleString('fr-FR')} F</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(24, 121, 200, 0.08)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1879C8', textTransform: 'uppercase' }}>Encaissé ({annualTotals.recoveryRate}%)</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1879C8' }}>{annualTotals.totalPaid.toLocaleString('fr-FR')} F</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(225, 29, 72, 0.06)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#E11D48', textTransform: 'uppercase' }}>Reste à recouvrer</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#E11D48' }}>{annualTotals.totalRemaining.toLocaleString('fr-FR')} F</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.06)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>Marge brute ({annualTotals.marginRate}%)</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>{annualTotals.totalGrossMargin.toLocaleString('fr-FR')} F</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.08)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8B5CF6', textTransform: 'uppercase' }}>Commissions</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#8B5CF6' }}>{annualTotals.totalCommission.toLocaleString('fr-FR')} F</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(60, 125, 175, 0.08)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' }}>Marge HINOV</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-primary)' }}>{annualTotals.totalHinovMargin.toLocaleString('fr-FR')} F</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-surface-alt)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Moyenne / dossier</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{Math.round(annualTotals.avg).toLocaleString('fr-FR')} F</div>
              </div>
            </div>
            <MonthlyBars data={annualTotals.series} legend1="Facturé" legend2="Encaissé" color1="#7C3AED" color2="#1879C8" />
          </div>
        )}
      </div>

      {/* ─── FILTRES & BARRE DE RECHERCHE ───────────────────────── */}
      <div className="card" style={{ padding: '12px 18px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '220px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              placeholder="Rechercher client, service, catégorie..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="table-input"
              style={{ width: '100%', paddingLeft: '32px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="table-input"
              style={{ padding: '6px 10px', minWidth: '130px' }}
            >
              <option value="ALL">Tous les statuts</option>
              <option value="PAID">Totalement Payé</option>
              <option value="PARTIAL">Partiellement Payé</option>
              <option value="UNPAID">Non Payé</option>
            </select>

            <select
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
              className="table-input"
              style={{ padding: '6px 10px', minWidth: '140px' }}
            >
              <option value="">Tous les services</option>
              {createdServices.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>

            <select
              value={commercialFilter}
              onChange={e => setCommercialFilter(e.target.value)}
              className="table-input"
              style={{ padding: '6px 10px', minWidth: '130px' }}
            >
              <option value="">Tous les commerciaux</option>
              {users.map(u => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ─── TABLEAU DU SUIVI MENSUEL (13 COLONNES CONFORMES EXCEL) ─── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid #CBD5E1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)', borderRadius: '10px' }}>
        <div style={{ padding: '14px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A', letterSpacing: '-0.01em' }}>
              Registre : {selectedMonthName} {selectedYear}
            </span>
            <span style={{ background: '#E2E8F0', color: '#334155', fontWeight: 700, fontSize: '0.75rem', padding: '3px 8px', borderRadius: '12px' }}>
              {filteredInvoices.length} dossier(s)
            </span>
          </div>

          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>
            PÉRIODE D'EXERCICE : <strong style={{ color: 'var(--color-primary)' }}>{selectedMonthName.toUpperCase()} {selectedYear}</strong>
          </span>
        </div>

        <div className="table-container" style={{ margin: 0, border: 'none', overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', scrollbarWidth: 'thin' }}>
          <table style={{ width: '100%', minWidth: '1450px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(180deg, #125B96 0%, #152E46 100%)', color: '#FFFFFF', borderBottom: '2px solid #152E46' }}>
                <th style={{ minWidth: '150px', padding: '12px 10px', color: '#F8FAFC', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>CLIENT</th>
                <th style={{ minWidth: '110px', padding: '12px 10px', color: '#F8FAFC', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>COMMERCIAL</th>
                <th style={{ minWidth: '95px', padding: '12px 8px', color: '#E0F2FE', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>DATE LIVR.</th>
                <th style={{ minWidth: '95px', padding: '12px 8px', color: '#E0F2FE', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>DATE PAIEM.</th>
                <th style={{ minWidth: '110px', padding: '12px 10px', color: '#F8FAFC', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>SERVICE</th>
                <th style={{ minWidth: '110px', padding: '12px 10px', color: '#F8FAFC', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>CATÉGORIE</th>
                <th style={{ minWidth: '125px', padding: '12px 10px', textAlign: 'right', color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>TOTAL À PAYER</th>
                <th style={{ minWidth: '115px', padding: '12px 10px', textAlign: 'right', color: '#FDE047', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>MONTANT UTILISÉ</th>
                <th style={{ minWidth: '115px', padding: '12px 10px', textAlign: 'right', color: '#6EE7B7', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>MARGE BRUTE</th>
                <th style={{ minWidth: '100px', padding: '12px 10px', textAlign: 'right', color: '#DDD6FE', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>PRIME 10%</th>
                <th style={{ minWidth: '120px', padding: '12px 10px', textAlign: 'right', color: '#93C5FD', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>MARGE HINOV</th>
                <th style={{ minWidth: '110px', padding: '12px 10px', textAlign: 'right', color: '#8FC4EA', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>TOTAL PAYÉ</th>
                <th style={{ minWidth: '120px', padding: '12px 10px', textAlign: 'right', color: '#FDA4AF', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.1)' }}>RESTE À PAYER</th>
                <th style={{ minWidth: '100px', padding: '12px 8px', textAlign: 'center', color: '#F8FAFC', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ textAlign: 'center', padding: '48px 20px', color: '#64748B', background: '#FFFFFF' }}>
                    <Receipt size={40} color="#94A3B8" style={{ margin: '0 auto 10px', opacity: 0.7 }} />
                    <p style={{ fontWeight: 700, fontSize: '1rem', color: '#334155', margin: 0 }}>Aucune facture enregistrée pour {selectedMonthName} {selectedYear}</p>
                    <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '6px' }}>Cliquez sur « + Ajouter une facture » ou « Importer Excel » pour commencer.</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv, index) => {
                  const clientName = getClientDisplayName(inv);
                  const commercialName = getCommercialDisplayName(inv);
                  const serviceName = getServiceDisplayName(inv);
                  const toPay = inv.totalAmount || 0;
                  const used = inv.costAmount || 0;
                  const grossMargin = inv.grossMargin !== undefined ? inv.grossMargin : Math.max(0, toPay - used);
                  const commission = inv.commissionAmount !== undefined ? inv.commissionAmount : (commercialName !== '-' ? Math.round(grossMargin * 0.1) : 0);
                  const hinovMargin = inv.hinovMargin !== undefined ? inv.hinovMargin : (grossMargin - commission);
                  const paid = inv.amountPaid || 0;
                  const remaining = inv.remainingAmount !== undefined ? inv.remainingAmount : Math.max(0, toPay - paid);

                  const isFullyPaid = remaining === 0 && toPay > 0;
                  const isPartiallyPaid = remaining > 0 && paid > 0;
                  const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';

                  return (
                    <tr
                      key={inv.id}
                      style={{
                        background: rowBg,
                        borderBottom: '1px solid #E2E8F0',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
 {/* 1. Client */}
                      <td style={{ padding: '10px', borderRight: '1px solid #F1F5F9' }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '0.88rem' }}>{clientName}</div>
                        {inv.quoteId && (
                          <span style={{ fontSize: '10px', color: '#64748B', background: '#EEF2F6', padding: '1px 5px', borderRadius: '4px', display: 'inline-block', marginTop: '2px' }}>Devis lié</span>
                        )}
                      </td>

                      {/* 2. Commercial */}
                      <td style={{ padding: '10px', fontWeight: 600, color: '#334155', borderRight: '1px solid #F1F5F9' }}>
                        {commercialName}
                      </td>

                      {/* 3. Date Livraison */}
                      <td style={{ padding: '10px 8px', fontSize: '0.8rem', fontFamily: 'monospace', color: '#475569', borderRight: '1px solid #F1F5F9' }}>
                        {inv.deliveryDate || '-'}
                      </td>

                      {/* 4. Date Paiement */}
                      <td style={{ padding: '10px 8px', fontSize: '0.8rem', fontFamily: 'monospace', color: '#475569', borderRight: '1px solid #F1F5F9' }}>
                        {inv.paymentDate || '-'}
                      </td>

                      {/* 5. Service */}
                      <td style={{ padding: '10px', borderRight: '1px solid #F1F5F9' }}>
                        <span style={{ background: '#E0F2FE', color: '#0369A1', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', display: 'inline-block' }}>
                          {serviceName}
                        </span>
                      </td>

                      {/* 6. Catégorie */}
                      <td style={{ padding: '10px', borderRight: '1px solid #F1F5F9' }}>
                        <span style={{ fontSize: '0.82rem', color: '#475569' }}>{inv.category || '-'}</span>
                      </td>

                      {/* 7. Total à payer */}
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace', fontSize: '0.88rem', borderRight: '1px solid #F1F5F9' }}>
                        {toPay.toLocaleString('fr-FR')} F
                      </td>

                      {/* 8. Montant utilisé */}
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#D97706', fontFamily: 'monospace', borderRight: '1px solid #F1F5F9' }}>
                        {used.toLocaleString('fr-FR')} F
                      </td>

                      {/* 9. Marge Brute */}
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#059669', background: 'rgba(16, 185, 129, 0.05)', fontFamily: 'monospace', borderRight: '1px solid #F1F5F9' }}>
                        {grossMargin.toLocaleString('fr-FR')} F
                      </td>

                      {/* 10. Prime 10% */}
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#7C3AED', fontFamily: 'monospace', borderRight: '1px solid #F1F5F9' }}>
                        {commission.toLocaleString('fr-FR')} F
                      </td>

                      {/* 11. Marge HINOV */}
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: 'var(--color-primary)', background: 'rgba(37, 99, 235, 0.05)', fontFamily: 'monospace', borderRight: '1px solid #F1F5F9' }}>
                        {hinovMargin.toLocaleString('fr-FR')} F
                      </td>

                      {/* 12. Total Payé */}
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#1879C8', fontFamily: 'monospace', borderRight: '1px solid #F1F5F9' }}>
                        {paid.toLocaleString('fr-FR')} F
                      </td>

                      {/* 13. Reste à Payer */}
                      <td style={{ padding: '10px', textAlign: 'right', borderRight: '1px solid #F1F5F9' }}>
                        <div style={{ fontWeight: 800, fontFamily: 'monospace', color: remaining === 0 ? '#059669' : '#E11D48', fontSize: '0.88rem' }}>
                          {remaining.toLocaleString('fr-FR')} F
                        </div>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          display: 'inline-block',
                          marginTop: '2px',
                          background: isFullyPaid ? 'rgba(16, 185, 129, 0.15)' : (isPartiallyPaid ? 'rgba(217, 119, 6, 0.15)' : 'rgba(225, 29, 72, 0.15)'),
                          color: isFullyPaid ? '#059669' : (isPartiallyPaid ? '#B45309' : '#BE123C')
                        }}>
                          {isFullyPaid ? 'PAYÉ' : (isPartiallyPaid ? 'PARTIEL' : 'NON PAYÉ')}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          {remaining > 0 && (
                            <button
                              onClick={() => handleOpenPaymentModal(inv)}
                              className="btn btn-secondary"
                              style={{ padding: '5px 7px', color: '#1879C8', borderRadius: '6px' }}
                              title="Encaisser un règlement"
                            >
                              <CreditCard size={13} />
                            </button>
                          )}
                          {remaining > 0 && (
                            <button
                              onClick={() => handleSendWhatsApp(inv)}
                              className="btn btn-secondary"
                              style={{ padding: '5px 7px', color: '#059669', borderRadius: '6px' }}
                              title="Relance WhatsApp"
                            >
                              <Share2 size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => handleEditTrackingRow(inv)}
                            className="btn btn-secondary"
                            style={{ padding: '5px 7px', color: 'var(--color-primary)', borderRadius: '6px' }}
                            title="Modifier"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(inv)}
                            className="btn btn-secondary"
                            style={{ padding: '5px 7px', color: '#E11D48', borderRadius: '6px' }}
                            title="Supprimer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* ─── LIGNE DE TOTAL DU MOIS (FOOTER PERMANENT CONFORME EXCEL) ─── */}
            <tfoot>
              <tr style={{ background: 'linear-gradient(180deg, #125B96 0%, #152E46 100%)', color: '#FFFFFF', fontWeight: 800, fontSize: '0.85rem', borderTop: '2px solid #152E46' }}>
                <td colSpan={6} style={{ padding: '14px 12px', color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.5px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  TOTAL DU MOIS ({selectedMonthName.toUpperCase()} {selectedYear})
                </td>
                <td style={{ textAlign: 'right', padding: '14px 10px', color: '#FFFFFF', fontFamily: 'monospace', fontSize: '0.9rem', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  {monthlyTotals.totalToPay.toLocaleString('fr-FR')} F
                </td>
                <td style={{ textAlign: 'right', padding: '14px 10px', color: '#FDE047', fontFamily: 'monospace', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  {monthlyTotals.totalUsed.toLocaleString('fr-FR')} F
                </td>
                <td style={{ textAlign: 'right', padding: '14px 10px', color: '#6EE7B7', background: 'rgba(16, 185, 129, 0.18)', fontFamily: 'monospace', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  {monthlyTotals.totalGrossMargin.toLocaleString('fr-FR')} F
                </td>
                <td style={{ textAlign: 'right', padding: '14px 10px', color: '#DDD6FE', fontFamily: 'monospace', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  {monthlyTotals.totalCommission.toLocaleString('fr-FR')} F
                </td>
                <td style={{ textAlign: 'right', padding: '14px 10px', color: '#93C5FD', background: 'rgba(59, 130, 246, 0.18)', fontFamily: 'monospace', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  {monthlyTotals.totalHinovMargin.toLocaleString('fr-FR')} F
                </td>
                <td style={{ textAlign: 'right', padding: '14px 10px', color: '#8FC4EA', fontFamily: 'monospace', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  {monthlyTotals.totalPaid.toLocaleString('fr-FR')} F
                </td>
                <td style={{ textAlign: 'right', padding: '14px 10px', color: '#FDA4AF', fontFamily: 'monospace', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  {monthlyTotals.totalRemaining.toLocaleString('fr-FR')} F
                </td>
                <td style={{ padding: '14px 8px' }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ─── MODAL D'AJOUT / MODIFICATION DE LIGNE DE SUIVI ───────────── */}
      {isCreateModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="modal-content" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '24px', maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-1)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Receipt size={20} color="var(--color-primary)" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                  {editingInvoiceId ? 'Modifier la ligne de suivi' : 'Ajouter une facture au suivi'}
                </h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Période d'imputation (Mois et Année de suivi) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'rgba(60, 125, 175, 0.08)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(60, 125, 175, 0.3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: '6px' }}>
                    📅 Mois de suivi (Registre) *
                  </label>
                  <select
                    required
                    value={formPeriodMonth}
                    onChange={e => setFormPeriodMonth(Number(e.target.value))}
                    className="table-input"
                    style={{ width: '100%', padding: '8px 12px', fontWeight: 700, fontSize: '0.9rem', borderColor: 'var(--color-primary)' }}
                  >
                    {MONTH_NAMES.map(m => (
                      <option key={m.num} value={m.num}>
                        {m.name} (Mois {m.num})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: '6px' }}>
                    📅 Année d'exercice *
                  </label>
                  <select
                    required
                    value={formPeriodYear}
                    onChange={e => setFormPeriodYear(Number(e.target.value))}
                    className="table-input"
                    style={{ width: '100%', padding: '8px 12px', fontWeight: 700, fontSize: '0.9rem', borderColor: 'var(--color-primary)' }}
                  >
                    {[2024, 2025, 2026, 2027, 2028].map(yr => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Client & Commercial */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Client *
                  </label>
                  <input
                    type="text"
                    required
                    list="clients-list-modal"
                    value={formClientName}
                    onChange={e => {
                      setFormClientName(e.target.value);
                      const matching = clients.find(c => c.name.toLowerCase() === e.target.value.toLowerCase() || c.company.toLowerCase() === e.target.value.toLowerCase());
                      if (matching) {
                        setFormClientId(matching.id);
                        if (matching.commercialId) setFormCommercialId(matching.commercialId);
                      }
                    }}
                    placeholder="Ex: CORIS, MEDLOG, MEHI..."
                    className="table-input"
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                  <datalist id="clients-list-modal">
                    {clients.map(c => (
                      <option key={c.id} value={c.company || c.name} />
                    ))}
                  </datalist>
                </div>

                {/* ─── CHAMP COMMERCIAL AVEC RECHERCHE ET SÉLECTION D'UTILISATEURS ─── */}
                <div style={{ position: 'relative' }} ref={commercialDropdownRef}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Commercial (Utilisateur)
                  </label>
                  
                  <div
                    onClick={() => setIsCommercialDropdownOpen(!isCommercialDropdownOpen)}
                    className="table-input"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--color-surface)',
                      borderColor: isCommercialDropdownOpen ? 'var(--color-primary)' : undefined,
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <User size={15} color={formCommercialName ? 'var(--color-primary)' : 'var(--color-text-muted)'} />
                      <span style={{ fontWeight: formCommercialName ? 700 : 400, color: formCommercialName ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                        {formCommercialName || 'Sélectionner un commercial...'}
                      </span>
                      {formCommercialName && (
                        <span style={{ fontSize: '10px', background: 'rgba(60, 125, 175, 0.12)', color: 'var(--color-primary)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          {users.find(u => u.name === formCommercialName || u.id === formCommercialId)?.role || 'Commercial'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {formCommercialName && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearCommercial();
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--color-text-muted)', display: 'flex' }}
                          title="Effacer la sélection"
                        >
                          <X size={14} />
                        </button>
                      )}
                      <ChevronDown size={15} color="var(--color-text-muted)" style={{ transform: isCommercialDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </div>
                  </div>

                  {/* Menu déroulant avec barre de recherche filtrée */}
                  {isCommercialDropdownOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 60,
                      marginTop: '4px',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.12), 0 4px 6px -2px rgba(0,0,0,0.06)',
                      maxHeight: '280px',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden'
                    }}>
                      {/* Champ de recherche d'utilisateur */}
                      <div style={{ padding: '8px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-alt)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Search size={14} color="var(--color-text-muted)" />
                        <input
                          type="text"
                          autoFocus
                          placeholder="Filtrer par nom, rôle ou email..."
                          value={commercialSearchTerm}
                          onChange={e => setCommercialSearchTerm(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="table-input"
                          style={{ width: '100%', padding: '5px 8px', fontSize: '0.8rem', background: 'var(--color-surface)' }}
                        />
                        {commercialSearchTerm && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setCommercialSearchTerm(''); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px' }}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      {/* Liste déroulante des utilisateurs */}
                      <div style={{ overflowY: 'auto', maxHeight: '220px' }}>
                        <div
                          onClick={handleClearCommercial}
                          style={{
                            padding: '8px 12px',
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            color: 'var(--color-text-muted)',
                            borderBottom: '1px dashed var(--color-border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          <span>— Aucun commercial (Non assigné)</span>
                        </div>

                        {filteredUsersForModal.length === 0 ? (
                          <div style={{ padding: '14px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            Aucun utilisateur trouvé pour « {commercialSearchTerm} »
                          </div>
                        ) : (
                          filteredUsersForModal.map(u => {
                            const isSelected = formCommercialId === u.id || formCommercialName === u.name;
                            return (
                              <div
                                key={u.id}
                                onClick={() => handleSelectCommercial(u)}
                                style={{
                                  padding: '8px 12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  cursor: 'pointer',
                                  background: isSelected ? 'rgba(60, 125, 175, 0.08)' : 'transparent',
                                  borderBottom: '1px solid #F1F5F9',
                                  transition: 'background-color 0.15s'
                                }}
                                onMouseEnter={e => { if (!isSelected) (e.currentTarget.style.backgroundColor = '#F8FAFC'); }}
                                onMouseLeave={e => { if (!isSelected) (e.currentTarget.style.backgroundColor = 'transparent'); }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    background: isSelected ? 'var(--color-primary)' : '#E2E8F0',
                                    color: isSelected ? '#FFFFFF' : '#475569',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: 700
                                  }}>
                                    {u.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: isSelected ? 700 : 600, color: isSelected ? 'var(--color-primary)' : 'var(--color-text)' }}>
                                      {u.name}
                                    </div>
                                    {u.email && (
                                      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                                        {u.email}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: isSelected ? 'var(--color-primary)' : '#EEF2F6',
                                    color: isSelected ? '#FFFFFF' : '#64748B',
                                    fontWeight: 600
                                  }}>
                                    {u.role || 'Utilisateur'}
                                  </span>
                                  {isSelected && <Check size={14} color="var(--color-primary)" />}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Service & Catégorie */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Service *
                  </label>
                  <select
                    required
                    value={formServiceName}
                    onChange={e => {
                      const selectedName = e.target.value;
                      setFormServiceName(selectedName);
                      const matching = createdServices.find(s => s.name.toUpperCase() === selectedName.toUpperCase());
                      if (matching) {
                        setFormServiceId(matching.id);
                      } else {
                        setFormServiceId('');
                      }
                    }}
                    className="table-input"
                    style={{ width: '100%', padding: '8px 12px', fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-primary)' }}
                  >
                    <option value="">Sélectionner un service...</option>
                    {createdServices.length === 0 ? (
                      <option value="" disabled>Aucun service créé dans le module Services</option>
                    ) : (
                      createdServices.map(s => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Catégorie / Désignation
                  </label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    placeholder="Ex: CARTOUCHE, CASQUE, MACARON..."
                    className="table-input"
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Date de Livraison *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDeliveryDate}
                    onChange={e => setFormDeliveryDate(e.target.value)}
                    className="table-input"
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Date de Paiement (Optionnel)
                  </label>
                  <input
                    type="date"
                    value={formPaymentDate}
                    onChange={e => setFormPaymentDate(e.target.value)}
                    className="table-input"
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>
              </div>

              {/* Bloc Montants & Coûts avec séparateurs de milliers */}
              <div className="card" style={{ padding: '16px', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                  
                  {/* 1. Total à Payer */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                      Total à Payer (FCFA) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={formatNumberDisplay(formAmountToPay)}
                      onChange={handleFormattedNumberChange(setFormAmountToPay)}
                      placeholder="Ex: 1 000 000"
                      className="table-input"
                      style={{ width: '100%', padding: '8px 10px', fontWeight: 800, fontSize: '1.05rem', color: '#0F172A' }}
                    />
                  </div>

                  {/* 2. Montant Utilisé */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px', color: '#D97706' }}>
                      Montant Utilisé / Coût (FCFA)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNumberDisplay(formAmountUsed)}
                      onChange={handleFormattedNumberChange(setFormAmountUsed)}
                      placeholder="Ex: 500 000"
                      className="table-input"
                      style={{ width: '100%', padding: '8px 10px', fontWeight: 700, color: '#D97706', fontSize: '1.05rem' }}
                    />
                  </div>

                  {/* 3. Prime Commercial (Saisie manuelle libre) */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#7C3AED' }}>
                        Prime Commercial (FCFA)
                      </label>
                      {formGrossMargin > 0 && (
                        <button
                          type="button"
                          onClick={() => setFormCommissionAmount(Math.round(formGrossMargin * 0.1))}
                          style={{
                            background: 'rgba(124, 58, 237, 0.1)',
                            color: '#7C3AED',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '1px 6px',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                          title="Calculer 10% de la marge brute"
                        >
                          Auto 10%
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNumberDisplay(formCommissionAmount)}
                      onChange={handleFormattedNumberChange(setFormCommissionAmount)}
                      placeholder="Ex: 50 000"
                      className="table-input"
                      style={{ width: '100%', padding: '8px 10px', fontWeight: 700, color: '#7C3AED', fontSize: '1.05rem' }}
                    />
                  </div>

                  {/* 4. Total Payé */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px', color: '#1879C8' }}>
                      Total Déjà Payé (FCFA)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNumberDisplay(formAmountPaid)}
                      onChange={handleFormattedNumberChange(setFormAmountPaid)}
                      placeholder="Ex: 300 000"
                      className="table-input"
                      style={{ width: '100%', padding: '8px 10px', fontWeight: 700, color: '#1879C8', fontSize: '1.05rem' }}
                    />
                  </div>
                </div>

                {/* Synthèse des calculs automatiques en temps réel */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                  <div style={{ background: 'var(--color-surface)', padding: '8px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Marge Brute (Auto)</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>{formGrossMargin.toLocaleString('fr-FR')} F</span>
                  </div>

                  <div style={{ background: 'var(--color-surface)', padding: '8px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Prime Saisie</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#7C3AED', fontFamily: 'monospace' }}>{formCommissionAmount.toLocaleString('fr-FR')} F</span>
                  </div>

                  <div style={{ background: 'var(--color-surface)', padding: '8px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Marge HINOV (Auto)</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-primary)', fontFamily: 'monospace' }}>{formHinovMargin.toLocaleString('fr-FR')} F</span>
                  </div>

                  <div style={{ background: 'var(--color-surface)', padding: '8px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Reste à Payer (Auto)</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: formRemainingAmount === 0 ? '#059669' : '#E11D48', fontFamily: 'monospace' }}>{formRemainingAmount.toLocaleString('fr-FR')} F</span>
                  </div>
                </div>
              </div>



              {/* Boutons d'action */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontWeight: 700 }}
                >
                  {editingInvoiceId ? 'Enregistrer les modifications' : 'Ajouter au suivi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL D'ENREGISTREMENT D'UN PAIEMENT ─────────────────── */}
      {isPaymentModalOpen && selectedInvoice && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="modal-content" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '24px', maxWidth: '450px', width: '100%', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-1)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={18} color="#1879C8" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                  Encaisser un règlement
                </h3>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: 'var(--color-surface-alt)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block' }}>Client :</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-primary)' }}>
                  {getClientDisplayName(invoices.find(i => i.id === selectedInvoice.id) ?? selectedInvoice)}
                </span>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--color-border)', fontSize: '0.8rem' }}>
                  <span>Total : <b>{(invoices.find(i => i.id === selectedInvoice.id) ?? selectedInvoice).totalAmount.toLocaleString('fr-FR')} F</b></span>
                  <span style={{ color: '#E11D48' }}>Reste : <b>{(() => {
                    const live = invoices.find(i => i.id === selectedInvoice.id) ?? selectedInvoice;
                    return (live.remainingAmount ?? (live.totalAmount - (live.amountPaid || 0))).toLocaleString('fr-FR');
                  })()} F</b></span>
                </div>
              </div>

              {/* ── Historique daté des encaissements de cette facture ── */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', color: '#1879C8' }}>
                  Encaissements enregistrés ({invoicePayments.filter(p => p.invoiceId === selectedInvoice.id).length})
                </div>
                {invoicePayments
                  .filter(p => p.invoiceId === selectedInvoice.id)
                  .sort((a, b) => (a.paymentDate || '').localeCompare(b.paymentDate || ''))
                  .map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.82rem' }}>
                      <span>
                        <strong style={{ fontFamily: 'monospace' }}>{p.paymentDate}</strong>
                        {' — '}<strong>{(Number(p.amount) || 0).toLocaleString('fr-FR')} F</strong>
                        {` (${p.paymentMethod || '-'})`}{p.reference ? ` — ${p.reference}` : ''}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        style={{ color: 'var(--color-error)' }}
                        title="Supprimer cet encaissement"
                        onClick={() => {
                          confirm({
                            title: "Supprimer l'encaissement",
                            message: `Supprimer l'encaissement du ${p.paymentDate} de ${(Number(p.amount) || 0).toLocaleString('fr-FR')} FCFA ? Les totaux de la facture seront recalculés.`,
                            confirmLabel: 'Supprimer',
                            cancelLabel: 'Annuler',
                            variant: 'danger',
                            onConfirm: async () => {
                              try {
                                await deleteInvoicePayment(p.id);
                                toast.success('Encaissement supprimé.');
                              } catch {
                                toast.error("Erreur lors de la suppression.");
                              }
                            }
                          });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                {invoicePayments.filter(p => p.invoiceId === selectedInvoice.id).length === 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                    Aucun encaissement enregistré — seul le champ « Total Déjà Payé » fait foi pour l'instant.
                  </p>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                  Montant encaissé (FCFA) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={formatNumberDisplay(payAmount)}
                  onChange={handleFormattedNumberChange(setPayAmount)}
                  placeholder="Ex: 300 000"
                  className="table-input"
                  style={{ width: '100%', padding: '8px 10px', fontWeight: 700, fontSize: '1.05rem', color: '#1879C8' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                  Date d'encaissement
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="table-input"
                  style={{ width: '100%', padding: '8px 10px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                  Mode de règlement
                </label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value)}
                  className="table-input"
                  style={{ width: '100%', padding: '8px 10px' }}
                >
                  <option value="Espèces">Espèces</option>
                  <option value="Virement">Virement bancaire</option>
                  <option value="Chèque">Chèque</option>
                  <option value="Mobile Money">Mobile Money (Wave / Orange)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Référence / N° Pièce (Optionnel)
                </label>
                <input
                  type="text"
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                  placeholder="N° chèque, réf virement..."
                  className="table-input"
                  style={{ width: '100%', padding: '8px 10px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: '#1879C8', borderColor: '#1879C8', fontWeight: 700 }}
                >
                  Valider le règlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
