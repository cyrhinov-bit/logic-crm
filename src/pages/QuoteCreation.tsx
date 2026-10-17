import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Save, FileText, Trash2, Percent, ArrowLeft, TrendingUp, 
  Calendar, ShieldCheck, CreditCard, Clock, FileCheck2, UserCheck, Eye, Mail
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import type { QuoteLine } from '../context/AppContext';
import { canReadAllClients } from '../lib/scope';
import { generateQuotePdf, downloadBlob, ensureDevisPdfAssets } from '../lib/pdfUtils';
import { sendQuoteByMail } from '../lib/mailUtils';
import { ReportPdfPreview, type ReportPdfPreviewData } from '../components/ReportPdfPreview';
import './QuoteCreation.css';

const COMMON_UNITS = [
  'Forfait',
  'Heure',
  'Jour',
  'Mois',
  'Session',
  'Unité',
  'Lot',
  'Page',
  'Projet',
  'Prestation'
];

const COMMON_PAYMENT_TERMS = [
  '50% à la commande, solde à la livraison',
  '30% à la commande, 70% à la livraison',
  '100% à la commande',
  'Comptant à réception de facture',
  'Paiement à 30 jours',
  'Paiement à 30 jours fin de mois',
  'Paiement en 3 échéances mensuelles'
];

export function QuoteCreation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('editId');
  const clientIdParam = searchParams.get('clientId');
  const serviceIdParam = searchParams.get('serviceId');
  const { clients, prestations, addQuote, updateQuote, services, quotes, settings, users } = useAppContext();
  const { currentUser: authUser } = useAuth();
  const currentUser = users.find(u => u.id === authUser?.id) || authUser;

  const isDirector = currentUser?.role === 'Directeur' || currentUser?.role === 'SuperAdmin' || currentUser?.role === 'Directeur adjoint';

  const sourceQuote = editId ? quotes.find(q => q.id === editId) : null;

  // Conserve l'identité du devis après un premier enregistrement : évite de créer un
  // doublon (nouvel id / nouveau numéro) si l'on enregistre ou envoie plusieurs fois.
  const persistedRef = useRef<{ id: string; quoteNumber: string } | null>(
    sourceQuote ? { id: sourceQuote.id, quoteNumber: sourceQuote.quoteNumber } : null
  );

  const allowedClients = useMemo(() => {
    if (canReadAllClients(currentUser?.role)) return clients;
    return clients.filter(c => c.commercialId === currentUser?.id || c.id === (sourceQuote?.clientId || clientIdParam));
  }, [clients, isDirector, currentUser, sourceQuote, clientIdParam]);

  // Numérotation séquentielle anti-collision locale.
  // Le serveur impose UNIQUE(quote_number) ; en cas de conflit multi-poste,
  // sync.ts régénère un numéro (-bisXXXX) et le répercute en local.
  const nextSequentialNumber = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const prefix = `DV-${currentYear}-`;
    const existing = new Set(quotes.map(q => q.quoteNumber));
    const yearQuotes = quotes.filter(q => q.quoteNumber && q.quoteNumber.startsWith(prefix));
    let maxSeq = 0;
    yearQuotes.forEach(q => {
      const parts = q.quoteNumber.split('-');
      if (parts.length >= 3) {
        const num = parseInt(parts[2], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    });
    let candidate = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
    let guard = 0;
    while (existing.has(candidate) && guard < 10000) {
      maxSeq += 1;
      candidate = `${prefix}${String(maxSeq).padStart(4, '0')}`;
      guard += 1;
    }
    return candidate;
  }, [quotes]);

  // Brouillon persistant par utilisateur (évite collisions multi-comptes / multi-onglets)
  const draftKey = `quoteCreationDraft_${currentUser?.id || 'anon'}`;
  const loadDraft = () => {
    try {
      const data = localStorage.getItem(draftKey);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  };

  // Form states
  const [clientId, setClientId] = useState(sourceQuote?.clientId || clientIdParam || '');
  const [subject, setSubject] = useState(sourceQuote?.subject || '');
  const [serviceId, setServiceId] = useState(sourceQuote?.serviceId || serviceIdParam || (currentUser?.role === 'Responsable' ? (currentUser?.serviceId || '') : ''));
  const [style, setStyle] = useState<'Classique' | 'Moderne' | 'Minimaliste'>(sourceQuote?.style as any || 'Classique');
  const [accentColor, setAccentColor] = useState(sourceQuote?.accentColor || '#009688');
  const [discountPercent, setDiscountPercent] = useState<number>(sourceQuote?.discountPercent || 0);
  const [preview, setPreview] = useState<ReportPdfPreviewData | null>(null);

  // Date and Validity
  const todayStr = new Date().toISOString().split('T')[0];
  const [quoteDate, setQuoteDate] = useState(sourceQuote?.date || todayStr);
  const [validityDays, setValidityDays] = useState<number>(settings.defaultValidity || 30);
  
  // Calculate validUntil based on quoteDate + validityDays
  const computeValidUntil = (baseDate: string, days: number) => {
    const d = new Date(baseDate || todayStr);
    d.setDate(d.getDate() + (Number(days) || 30));
    return d.toISOString().split('T')[0];
  };

  const [validUntil, setValidUntil] = useState(sourceQuote?.validUntil || computeValidUntil(sourceQuote?.date || todayStr, settings.defaultValidity || 30));

  // Payment terms, Notes, Signatory
  const [paymentTerms, setPaymentTerms] = useState(sourceQuote?.paymentTerms || '50% à la commande, solde à la livraison');
  const [notes, setNotes] = useState(sourceQuote?.notes || '');
  const [signatoryName, setSignatoryName] = useState(sourceQuote?.signatoryName || currentUser?.name || '');
  const [signatoryRole, setSignatoryRole] = useState(sourceQuote?.signatoryRole || currentUser?.role || 'Directeur Général');

  // Lines
  const [lines, setLines] = useState<Omit<QuoteLine, 'id'>[]>(
    sourceQuote?.lines.map(l => ({
      prestationId: l.prestationId,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit || 'Forfait',
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent || 0,
      total: l.total
    })) || []
  );

  // costPrice per line — UI only, never persisted into PDF
  const [lineCosts, setLineCosts] = useState<number[]>(
    sourceQuote?.lines.map(l => {
      const prestation = prestations.find(p => p.id === l.prestationId);
      return prestation?.costPrice || 0;
    }) || []
  );

  // Draft state persistence
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    if (!draftLoaded && !editId) {
      const draft = loadDraft();
      if (draft) {
        setClientId(draft.clientId || '');
        setSubject(draft.subject || '');
        setServiceId(draft.serviceId || '');
        setStyle(draft.style || 'Classique');
        setAccentColor(draft.accentColor || '#009688');
        setDiscountPercent(draft.discountPercent ?? 0);
        setQuoteDate(draft.quoteDate || todayStr);
        setValidityDays(draft.validityDays || 30);
        setValidUntil(draft.validUntil || computeValidUntil(draft.quoteDate || todayStr, draft.validityDays || 30));
        setPaymentTerms(draft.paymentTerms || '50% à la commande, solde à la livraison');
        setNotes(draft.notes || '');
        setSignatoryName(draft.signatoryName || currentUser?.name || '');
        setSignatoryRole(draft.signatoryRole || currentUser?.role || 'Directeur Général');
        setLines(draft.lines || []);
        setLineCosts(draft.lineCosts || []);
      }
      setDraftLoaded(true);
    }
  }, [draftLoaded]);

  // Save draft on any change
  useEffect(() => {
    if (draftLoaded) {
      const draft = {
        clientId,
        subject,
        serviceId,
        style,
        accentColor,
        discountPercent,
        quoteDate,
        validityDays,
        validUntil,
        paymentTerms,
        notes,
        signatoryName,
        signatoryRole,
        lines,
        lineCosts
      };
      try {
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {}
    }
  }, [clientId, subject, serviceId, style, accentColor, discountPercent, quoteDate, validityDays, validUntil, paymentTerms, notes, signatoryName, signatoryRole, lines, lineCosts, draftLoaded]);

  const handleValidityPreset = (days: number) => {
    setValidityDays(days);
    setValidUntil(computeValidUntil(quoteDate, days));
  };

  const handleAddLine = () => {
    setLines([...lines, { 
      prestationId: '', 
      description: '', 
      quantity: 1, 
      unit: 'Forfait', 
      unitPrice: '' as any, 
      discountPercent: 0, 
      total: 0 
    }]);
    setLineCosts([...lineCosts, 0]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tr = e.currentTarget.closest('tr');
      if (!tr) return;
      const inputs = Array.from(tr.querySelectorAll('input, select'));
      const index = inputs.indexOf(e.currentTarget);
      if (index > -1 && index < inputs.length - 1) {
        (inputs[index + 1] as HTMLElement).focus();
      }
    }
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
    setLineCosts(lineCosts.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof QuoteLine, value: any) => {
    const newLines = [...lines];
    const line = { ...newLines[index] };

    // @ts-ignore
    line[field] = value;

    if (field === 'prestationId') {
      const prestation = availablePrestations.find(p => p.id === value);
      if (prestation) {
        line.description = prestation.name;
        line.unitPrice = prestation.price;
        if (prestation.unit) {
          line.unit = prestation.unit;
        }
        // Auto-fill cost price from catalogue (UI-only)
        const newCosts = [...lineCosts];
        newCosts[index] = prestation.costPrice || 0;
        setLineCosts(newCosts);
      }
    }

    const q = Math.max(0, Number(line.quantity) || 0);
    const p = Math.max(0, Number(line.unitPrice) || 0);
    line.quantity = q;
    line.unitPrice = p;
    line.discountPercent = Math.min(100, Math.max(0, Number(line.discountPercent) || 0));
    const rawTotal = q * p;
    const lineDiscount = Math.round((rawTotal * (line.discountPercent || 0)) / 100);
    line.total = Math.max(0, rawTotal - lineDiscount);
    newLines[index] = line;
    setLines(newLines);
  };

  const canChooseService = currentUser?.role === 'Directeur' || currentUser?.role === 'SuperAdmin' || currentUser?.role === 'Directeur adjoint';
  const availablePrestations = canChooseService
    ? (serviceId ? prestations.filter(p => p.serviceId === serviceId) : prestations)
    : (currentUser?.serviceId ? prestations.filter(p => p.serviceId === currentUser.serviceId) : prestations);

  // Calculations
  const grossSubtotal = lines.reduce((acc, line) => acc + line.total, 0);
  const discountAmount = Math.round((grossSubtotal * (discountPercent || 0)) / 100);
  const netSubtotal = Math.max(0, grossSubtotal - discountAmount);
  const total = netSubtotal;

  // Margin calculations (UI-only, never in PDF)
  const totalCost = lines.reduce((acc, line, idx) => acc + (lineCosts[idx] || 0) * (Number(line.quantity) || 0), 0);
  const globalMargin = total - totalCost;
  const getMarginColor = (margin: number) => margin >= 0 ? 'var(--color-success)' : 'var(--color-error)';

  const buildCurrentQuoteData = (statusOverride?: any) => {
    const newId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
    const quoteNumber = sourceQuote?.quoteNumber || persistedRef.current?.quoteNumber || nextSequentialNumber;
    // En édition on conserve le commercial d'origine (pas de vol de propriété)
    const resolvedServiceId =
      currentUser?.role === 'Directeur' || currentUser?.role === 'SuperAdmin' || currentUser?.role === 'Directeur adjoint'
        ? serviceId
        : (currentUser?.serviceId || serviceId || '');

    return {
      id: sourceQuote?.id || persistedRef.current?.id || newId,
      quoteNumber,
      clientId,
      commercialId: sourceQuote?.commercialId || currentUser?.id || '',
      serviceId: resolvedServiceId,
      subject: subject.trim(),
      lines: lines.map((l, idx) => ({
        ...l,
        description: (l.description || '').trim(),
        quantity: Math.max(0, Number(l.quantity) || 0),
        unitPrice: Math.max(0, Number(l.unitPrice) || 0),
        discountPercent: Math.min(100, Math.max(0, Number(l.discountPercent) || 0)),
        costPrice: lineCosts[idx] || (l as any).costPrice || 0,
        id: (l as any).id || (crypto.randomUUID ? crypto.randomUUID() : `ql-${Date.now()}-${idx}`),
      })),
      subtotal: netSubtotal,
      discountPercent: discountPercent || 0,
      discountAmount,
      total,
      status: statusOverride || (sourceQuote ? sourceQuote.status : 'Brouillon'),
      date: quoteDate || todayStr,
      validUntil: validUntil || undefined,
      paymentTerms: paymentTerms || undefined,
      notes: notes || undefined,
      signatoryName: signatoryName || undefined,
      signatoryRole: signatoryRole || undefined,
      style,
      accentColor
    };
  };

  const handleInstantPreview = async () => {
    if (lines.length === 0) {
      alert("Veuillez ajouter au moins une ligne d'article ou prestation pour prévisualiser le devis.");
      return;
    }
    const quoteData = buildCurrentQuoteData(sourceQuote?.status || 'Brouillon');
    const client = clients.find(c => c.id === clientId);
    await ensureDevisPdfAssets();
    const pdfBlob = generateQuotePdf(quoteData, client, settings, prestations);
    const blobUrl = URL.createObjectURL(pdfBlob);
    setPreview({
      blobUrl,
      filename: `Devis_${quoteData.quoteNumber}.pdf`,
      title: `Aperçu en direct : Devis N° ${quoteData.quoteNumber}`,
      onDownload: () => downloadBlob(pdfBlob, `Devis_${quoteData.quoteNumber}.pdf`),
      onSendByMail: () => handleSendByMail()
    });
  };

  const persistQuote = async (status: 'Brouillon' | 'Envoyé' | 'Accepté') => {
    const quoteData = buildCurrentQuoteData(status);
    const isUpdate = !!sourceQuote || !!persistedRef.current;
    if (isUpdate) {
      await updateQuote(quoteData.id, quoteData);
    } else {
      await addQuote(quoteData);
    }
    persistedRef.current = { id: quoteData.id, quoteNumber: quoteData.quoteNumber };
    localStorage.removeItem(draftKey);
    return quoteData;
  };

  const handleSendByMail = async () => {
    const err = validateQuoteForm();
    if (err) {
      alert(err);
      return;
    }
    try {
      const quoteData = await persistQuote('Envoyé');
      const client = clients.find(c => c.id === clientId);
      await sendQuoteByMail(quoteData, client, settings, prestations);
    } catch (e) {
      console.error("Erreur lors de l'envoi du devis:", e);
      alert("Une erreur est survenue lors de l'envoi du devis.");
    }
  };

  const validateQuoteForm = (): string | null => {
    if (!clientId || !clients.some(c => c.id === clientId)) return 'Veuillez sélectionner un client valide.';
    const effectiveServiceId =
      currentUser?.role === 'Directeur' || currentUser?.role === 'SuperAdmin' || currentUser?.role === 'Directeur adjoint'
        ? serviceId
        : (currentUser?.serviceId || serviceId);
    if (!effectiveServiceId) return 'Aucun service rattaché : sélectionnez un service (ou rattachez l’utilisateur à un service).';
    if (!subject.trim()) return 'Veuillez renseigner l’objet / titre du devis.';
    if (lines.length === 0) return 'Veuillez ajouter au moins une ligne de prestation au devis.';
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!(l.description || '').trim()) return `Ligne ${i + 1} : description obligatoire.`;
      if (!(Number(l.quantity) > 0)) return `Ligne ${i + 1} : quantité doit être > 0.`;
      if (!(Number(l.unitPrice) >= 0)) return `Ligne ${i + 1} : prix unitaire invalide.`;
      if (Number(l.discountPercent) < 0 || Number(l.discountPercent) > 100) return `Ligne ${i + 1} : remise 0-100 %.`;
    }
    if (total <= 0) return 'Le total du devis doit être supérieur à zéro.';
    if (!quoteDate) return 'Date d’émission invalide.';
    if (validUntil && quoteDate && validUntil < quoteDate) return 'La fin de validité doit être postérieure à la date d’émission.';
    return null;
  };

  const handleSave = async (openPreviewModal: boolean = false) => {
    const err = validateQuoteForm();
    if (err) {
      alert(err);
      return;
    }

    try {
      const quoteData = await persistQuote('Accepté');

      if (openPreviewModal) {
        const client = clients.find(c => c.id === clientId);
        await ensureDevisPdfAssets();
        const pdfBlob = generateQuotePdf(quoteData, client, settings, prestations);
        const blobUrl = URL.createObjectURL(pdfBlob);
        setPreview({
          blobUrl,
          filename: `Devis_${quoteData.quoteNumber}.pdf`,
          title: `Devis enregistré N° ${quoteData.quoteNumber}`,
          onDownload: () => downloadBlob(pdfBlob, `Devis_${quoteData.quoteNumber}.pdf`),
          onSendByMail: () => handleSendByMail()
        });
      } else {
        navigate('/devis');
      }
    } catch (err) {
      console.error('Erreur lors de la sauvegarde du devis:', err);
      alert('Une erreur est survenue lors de la sauvegarde du devis.');
    }
  };

  return (
    <div className="quote-creation">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="btn btn-outline" onClick={() => navigate(-1)} style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Retour">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 style={{ margin: 0 }}>{sourceQuote ? `Modifier le devis ${sourceQuote.quoteNumber}` : 'Créer un nouveau devis'}</h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                N° de référence prévu : <strong style={{ color: 'var(--color-primary)' }}>{sourceQuote?.quoteNumber || nextSequentialNumber}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card form-card">
        {/* 1. INFORMATIONS GÉNÉRALES */}
        <section className="form-section">
          <h3>
            <FileText size={18} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
            Informations Générales
          </h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Client *</label>
              <select className="form-control" value={clientId} onChange={e => {
                setClientId(e.target.value);
              }}>
                <option value="">Sélectionner un client...</option>
                {allowedClients.map(c => <option key={c.id} value={c.id}>{c.name || c.contact}</option>)}
              </select>
            </div>

            {canChooseService && (
              <div className="form-group">
                <label>Service concerné *</label>
                <select className="form-control" value={serviceId} onChange={e => setServiceId(e.target.value)}>
                  <option value="">Sélectionner un service...</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Objet / Titre du devis</label>
              <input type="text" className="form-control" placeholder="Ex: Prestation d'assistance comptable annuelle" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
          </div>
        </section>

        {/* 2. DATES & VALIDITÉ DU DEVIS */}
        <section className="form-section">
          <h3>
            <Calendar size={18} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
            Dates & Validité de l'Offre
          </h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Date d'émission</label>
              <input 
                type="date" 
                className="form-control" 
                value={quoteDate} 
                onChange={e => {
                  setQuoteDate(e.target.value);
                  setValidUntil(computeValidUntil(e.target.value, validityDays));
                }} 
              />
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Date d'échéance / Fin de validité</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[15, 30, 60, 90].map(days => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => handleValidityPreset(days)}
                      style={{
                        padding: '2px 6px',
                        fontSize: '0.72rem',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)',
                        background: validityDays === days ? 'var(--color-primary-tint)' : 'transparent',
                        color: validityDays === days ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        cursor: 'pointer'
                      }}
                    >
                      {days}j
                    </button>
                  ))}
                </div>
              </label>
              <input 
                type="date" 
                className="form-control" 
                value={validUntil} 
                onChange={e => setValidUntil(e.target.value)} 
              />
            </div>
          </div>
        </section>

        {/* 3. TABLEAU DES PRESTATIONS & LIGNES */}
        <section className="form-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>
              <FileCheck2 size={18} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
              Prestations & Services
            </h3>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
              Navigation clavier : <strong>Entrée</strong> passe à la cellule suivante
            </span>
          </div>

          <div className="table-responsive">
            <table className="prestations-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '180px' }}>Service (Catalogue)</th>
                  <th style={{ minWidth: '200px' }}>Description détaillée</th>
                  <th style={{ width: '80px' }}>Qté</th>
                  <th style={{ width: '110px' }}>Unité</th>
                  <th style={{ width: '120px' }}>Prix Unit. (FCFA)</th>
                  <th style={{ width: '90px' }}>Remise (%)</th>
                  <th style={{ width: '130px' }}>Total Net</th>
                  <th style={{ width: '130px', background: 'color-mix(in srgb, var(--color-success) 8%, var(--color-surface))' }} title="Colonne interne — masquée sur le PDF client">Marge 🔒</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const costPrice = lineCosts[idx] || 0;
                  const lineCostTotal = costPrice * (Number(line.quantity) || 0);
                  const lineMargin = line.total - lineCostTotal;
                  return (
                    <tr key={idx}>
                      <td>
                        <select className="table-input" value={line.prestationId} onChange={e => updateLine(idx, 'prestationId', e.target.value)} onKeyDown={handleKeyDown}>
                          <option value="">{availablePrestations.length === 0 ? 'Choisir...' : 'Catalogue...'}</option>
                          {availablePrestations.map(p => <option key={p.id} value={p.id}>{p.code ? `[${p.code}] ` : ''}{p.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="text" className="table-input" placeholder="Détails de la prestation" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} onKeyDown={handleKeyDown} />
                      </td>
                      <td>
                        <input type="number" className="table-input" value={line.quantity} min="1" onChange={e => updateLine(idx, 'quantity', e.target.value === '' ? '' : Number(e.target.value))} onKeyDown={handleKeyDown} />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          list={`units-list-${idx}`} 
                          className="table-input" 
                          value={line.unit || ''} 
                          placeholder="Forfait"
                          onChange={e => updateLine(idx, 'unit', e.target.value)} 
                          onKeyDown={handleKeyDown} 
                        />
                        <datalist id={`units-list-${idx}`}>
                          {COMMON_UNITS.map(u => <option key={u} value={u} />)}
                        </datalist>
                      </td>
                      <td>
                        <input type="number" className="table-input" value={line.unitPrice} step="1" onChange={e => updateLine(idx, 'unitPrice', e.target.value === '' ? '' : Number(e.target.value))} onKeyDown={handleKeyDown} />
                      </td>
                      <td>
                        <input type="number" className="table-input" value={line.discountPercent || ''} min="0" max="100" placeholder="0%" onChange={e => updateLine(idx, 'discountPercent', Math.min(100, Math.max(0, Number(e.target.value))))} onKeyDown={handleKeyDown} />
                      </td>
                      <td>
                        <strong>{line.total.toLocaleString('fr-FR')} FCFA</strong>
                        {line.discountPercent && line.discountPercent > 0 ? (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-secondary)' }}>(-{line.discountPercent}%)</div>
                        ) : null}
                      </td>
                      <td style={{ background: 'color-mix(in srgb, var(--color-success) 8%, var(--color-surface))', verticalAlign: 'top', paddingTop: '8px' }}>
                        <input
                          type="number"
                          className="table-input"
                          placeholder="Coût unitaire"
                          min="0"
                          step="1"
                          value={lineCosts[idx] || ''}
                          onChange={e => {
                            const newCosts = [...lineCosts];
                            newCosts[idx] = Math.max(0, Number(e.target.value));
                            setLineCosts(newCosts);
                          }}
                          onKeyDown={handleKeyDown}
                          style={{ marginBottom: '4px', fontSize: '0.82rem' }}
                          title="Coût de revient unitaire (usage interne pour calcul de marge)"
                        />
                        {costPrice > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.80rem', color: getMarginColor(lineMargin) }}>
                              {lineMargin >= 0 ? '+' : ''}{lineMargin.toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                        )}
                      </td>

                      <td>
                        <button className="icon-button text-error" onClick={() => handleRemoveLine(idx)} title="Supprimer la ligne"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)' }}>
                      Aucune prestation ajoutée. Cliquez sur le bouton ci-dessous pour ajouter une ligne.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <button className="btn btn-outline" style={{ marginTop: '16px' }} onClick={handleAddLine}>
            <Plus size={16} style={{ marginRight: '8px' }} /> Ajouter une ligne de prestation
          </button>

          {/* Margin summary — UI only, never in the PDF */}
          {totalCost > 0 && (
            <div style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--color-success) 8%, var(--color-surface))',
              border: `1px solid color-mix(in srgb, ${getMarginColor(globalMargin)} 30%, transparent)`,
              display: 'flex', flexDirection: 'column', gap: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500, marginBottom: '2px' }}>
                <TrendingUp size={14} />
                Analyse de rentabilité prévisionnelle (usage interne — non visible sur le devis client)
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>Montant de vente total (TTC/Net)</span>
                <span style={{ fontWeight: 600 }}>{total.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>Coût de revient global</span>
                <span style={{ fontWeight: 600 }}>{totalCost.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', borderTop: '1px solid var(--color-border)', paddingTop: '6px', marginTop: '2px' }}>
                <span style={{ fontWeight: 600 }}>Marge brute prévisionnelle</span>
                <span style={{ fontWeight: 700, fontSize: '1.05rem', color: getMarginColor(globalMargin) }}>
                  {globalMargin >= 0 ? '+' : ''}{globalMargin.toLocaleString('fr-FR')} FCFA
                  {total > 0 && ` (${Math.round((globalMargin / total) * 100)}%)`}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* 4. REMISE GLOBALE */}
        <section className="form-section">
          <h3>
            <Percent size={18} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
            Remise Commerciale Globale
          </h3>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
            <div className="form-group">
              <label>Réduction globale (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                className="form-control"
                placeholder="Ex: 5"
                value={discountPercent || ''}
                onChange={e => {
                  const val = Math.min(100, Math.max(0, Number(e.target.value)));
                  setDiscountPercent(val);
                }}
              />
            </div>
            {discountPercent > 0 && (
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: '24px' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--color-secondary)', fontWeight: 500 }}>
                  Montant de la remise accordée : <strong>-{discountAmount.toLocaleString('fr-FR')} FCFA</strong> ({discountPercent}%)
                </span>
              </div>
            )}
          </div>
        </section>

        {/* 5. MODALITÉS DE PAIEMENT & CONDITIONS PARTICULIÈRES */}
        <section className="form-section">
          <h3>
            <CreditCard size={18} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
            Modalités de Règlement & Conditions Particulières
          </h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Conditions de règlement</label>
              <input 
                type="text" 
                list="payment-terms-list" 
                className="form-control" 
                value={paymentTerms} 
                placeholder="Ex: 50% à la commande, solde à la livraison"
                onChange={e => setPaymentTerms(e.target.value)} 
              />
              <datalist id="payment-terms-list">
                {COMMON_PAYMENT_TERMS.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>

            <div className="form-group">
              <label>Notes ou clauses particulières (visibles sur le devis)</label>
              <textarea 
                className="form-control" 
                rows={2} 
                placeholder="Ex: Frais de déplacement inclus. Délai d'exécution : 15 jours ouvrés dès validation."
                value={notes} 
                onChange={e => setNotes(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
        </section>

        {/* 6. SIGNATAIRE & DESIGN */}
        <section className="form-section">
          <h3>
            <UserCheck size={18} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
            Signataire & Paramètres de Design
          </h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Nom du signataire responsable</label>
              <input 
                type="text" 
                list="signatories-list"
                className="form-control" 
                placeholder="Ex: M. GNONSKAN EVARISTE" 
                value={signatoryName} 
                onChange={e => setSignatoryName(e.target.value)} 
              />
              <datalist id="signatories-list">
                {users.map(u => <option key={u.id} value={u.name} />)}
              </datalist>
            </div>

            <div className="form-group">
              <label>Fonction / Rôle du signataire</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Ex: Directeur Général" 
                value={signatoryRole} 
                onChange={e => setSignatoryRole(e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label>Style visuel (PDF / Portail)</label>
              <select className="form-control" value={style} onChange={e => setStyle(e.target.value as any)}>
                <option value="Classique">Classique (Standard)</option>
                <option value="Moderne">Moderne (Épuré et coloré)</option>
                <option value="Minimaliste">Minimaliste (Noir & Blanc)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Couleur principale</label>
              <input type="color" className="form-control" style={{ height: '42px', cursor: 'pointer' }} value={accentColor} onChange={e => setAccentColor(e.target.value)} />
            </div>
          </div>
        </section>

        {/* 7. TOTAUX */}
        <div className="totals-section">
          <div className="total-row">
            <span>Montant Brut</span>
            <span>{grossSubtotal.toLocaleString('fr-FR')} FCFA</span>
          </div>
          {discountPercent > 0 && (
            <div className="total-row" style={{ color: 'var(--color-secondary)' }}>
              <span>Remise ({discountPercent}%)</span>
              <span>-{discountAmount.toLocaleString('fr-FR')} FCFA</span>
            </div>
          )}
          <div className="total-row grand-total">
            <span>Total Net</span>
            <span>{total.toLocaleString('fr-FR')} FCFA</span>
          </div>
        </div>

        {/* 8. ACTIONS */}
        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => {
            if (confirm("Réinitialiser tous les champs du devis ?")) {
              setClientId('');
              setSubject('');
              setServiceId('');
              setStyle('Classique');
              setAccentColor('#009688');
              setDiscountPercent(0);
              setQuoteDate(todayStr);
              setValidityDays(30);
              setValidUntil(computeValidUntil(todayStr, 30));
              setPaymentTerms('50% à la commande, solde à la livraison');
              setNotes('');
              setSignatoryName(currentUser?.name || '');
              setSignatoryRole(currentUser?.role || 'Directeur Général');
              setLines([]);
              setLineCosts([]);
              localStorage.removeItem(draftKey);
            }
          }} style={{ marginRight: '8px' }}>
            <Trash2 size={16} style={{ marginRight: '4px' }} /> Réinitialiser
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleInstantPreview} style={{ marginRight: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Eye size={16} /> Aperçu en direct
          </button>
          <button className="btn btn-primary" onClick={() => handleSave(false)}>
            <Save size={16} style={{ marginRight: '8px' }} /> Enregistrer le devis
          </button>
          <button className="btn btn-primary" onClick={() => handleSave(true)} style={{ marginLeft: '8px', background: '#0D9488', borderColor: '#0D9488' }}>
            <FileText size={16} style={{ marginRight: '8px' }} /> Enregistrer & Prévisualiser PDF
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSendByMail}
            style={{ marginLeft: '8px', background: '#2563EB', borderColor: '#2563EB', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title="Enregistrer le devis et ouvrir votre messagerie (PDF copié pour pièce jointe)"
          >
            <Mail size={16} /> Enregistrer & Envoyer par mail
          </button>
        </div>
      </div>
      <ReportPdfPreview 
        preview={preview} 
        onClose={() => {
          if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl);
          setPreview(null);
        }} 
      />
    </div>
  );
}
