import React, { useState, useEffect } from 'react';
import { X, Check, AlertTriangle, Briefcase, Building2 } from 'lucide-react';
import { useAppContext, type Cout, type CostType, type CostCategory } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import './CoutModal.css';

interface CoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  coutToEdit?: Cout | null;
  defaultServiceId?: string;
}

export const CoutModal: React.FC<CoutModalProps> = ({
  isOpen,
  onClose,
  coutToEdit,
  defaultServiceId
}) => {
  const { services, addCout, updateCout } = useAppContext();
  const { currentUser } = useAuth();

  const [costType, setCostType] = useState<CostType>(coutToEdit?.costType || 'DIRECT');
  const [serviceId, setServiceId] = useState<string>(coutToEdit?.serviceId || defaultServiceId || '');
  const [category, setCategory] = useState<CostCategory>(coutToEdit?.category || 'SOUS_TRAITANCE');
  const [amountHt, setAmountHt] = useState<number>(coutToEdit?.amountHt || 0);
  const [vatRate, setVatRate] = useState<number>(coutToEdit?.vatRate !== undefined ? coutToEdit.vatRate : 0);
  const [date, setDate] = useState<string>(coutToEdit?.date || new Date().toISOString().split('T')[0]);
  const [supplierName, setSupplierName] = useState<string>(coutToEdit?.supplierName || '');
  const [invoiceRef, setInvoiceRef] = useState<string>(coutToEdit?.invoiceRef || '');
  const [description, setDescription] = useState<string>(coutToEdit?.description || '');
  const [status, setStatus] = useState<'ENGAGE' | 'VALIDE' | 'PAYE' | 'ANNULE'>(coutToEdit?.status || 'VALIDE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync if coutToEdit changes
  useEffect(() => {
    if (coutToEdit) {
      setCostType(coutToEdit.costType);
      setServiceId(coutToEdit.serviceId || '');
      setCategory(coutToEdit.category);
      setAmountHt(coutToEdit.amountHt);
      setVatRate(coutToEdit.vatRate);
      setDate(coutToEdit.date);
      setSupplierName(coutToEdit.supplierName || '');
      setInvoiceRef(coutToEdit.invoiceRef || '');
      setDescription(coutToEdit.description);
      setStatus(coutToEdit.status);
    } else {
      setCostType('DIRECT');
      setServiceId(defaultServiceId || (currentUser?.role === 'Responsable' ? currentUser.serviceId || '' : ''));
      setCategory('SOUS_TRAITANCE');
      setAmountHt(0);
      setVatRate(0);
      setDate(new Date().toISOString().split('T')[0]);
      setSupplierName('');
      setInvoiceRef('');
      setDescription('');
      setStatus('VALIDE');
    }
  }, [coutToEdit, defaultServiceId, currentUser]);

  const vatAmount = Math.round(amountHt * (vatRate / 100));
  const amountTtc = amountHt + vatAmount;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('La description du coût est obligatoire.');
      return;
    }
    if (!amountHt || amountHt <= 0) {
      setError('Le montant HT doit être strictement supérieur à 0.');
      return;
    }
    if (!serviceId) {
      setError('Le service responsable du coût est obligatoire.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (coutToEdit) {
        await updateCout(coutToEdit.id, {
          costType,
          category,
          amountHt: Number(amountHt),
          vatRate: Number(vatRate),
          vatAmount,
          amountTtc,
          date,
          affaireId: undefined,
          serviceId,
          supplierName: supplierName.trim() || undefined,
          invoiceRef: invoiceRef.trim() || undefined,
          description: description.trim(),
          status
        });
      } else {
        await addCout({
          costType,
          category,
          amountHt: Number(amountHt),
          vatRate: Number(vatRate),
          date,
          affaireId: undefined,
          serviceId,
          supplierName: supplierName.trim() || undefined,
          invoiceRef: invoiceRef.trim() || undefined,
          description: description.trim(),
          status,
          createdBy: currentUser?.id
        });
      }
      onClose();
    } catch (err: any) {
      console.error('Erreur enregistrement coût :', err);
      setError(err?.message || 'Une erreur est survenue lors de l\'enregistrement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="cout-modal-overlay">
      <div className="cout-modal-container">
        <div className="cout-modal-header">
          <h3>{coutToEdit ? `Modifier la Dépense ${coutToEdit.reference}` : 'Enregistrer une Dépense / Coût'}</h3>
          <button 
            type="button" 
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="cout-modal-body">
            {error && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#991B1B',
                padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center'
              }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Type de coût : DIRECT vs INDIRECT */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Nature Analytique du Coût *
              </label>
              <div className="cout-type-selector">
                <div
                  className={`cout-type-card ${costType === 'DIRECT' ? 'selected-direct' : ''}`}
                  onClick={() => setCostType('DIRECT')}
                >
                  <div className="cout-type-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Briefcase size={15} color={costType === 'DIRECT' ? '#0D9488' : '#64748B'} />
                    Coût Direct
                  </div>
                  <div className="cout-type-desc">
                    Affecté directement au service (impacte sa marge brute).
                  </div>
                </div>

                <div
                  className={`cout-type-card ${costType === 'INDIRECT' ? 'selected-indirect' : ''}`}
                  onClick={() => {
                    setCostType('INDIRECT');
                  }}
                >
                  <div className="cout-type-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 size={15} color={costType === 'INDIRECT' ? '#3B82F6' : '#64748B'} />
                    Coût Indirect de Service
                  </div>
                  <div className="cout-type-desc">
                    Frais généraux ou structure affectés globalement au département/service.
                  </div>
                </div>
              </div>
            </div>

            {/* Affectation Service */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Service / Département *
                </label>
                <select
                  className="table-input"
                  style={{ width: '100%' }}
                  value={serviceId}
                  onChange={e => setServiceId(e.target.value)}
                  required
                >
                  <option value="">Sélectionner un service...</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Catégorie & Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Catégorie de dépense *
                </label>
                <select
                  className="table-input"
                  style={{ width: '100%' }}
                  value={category}
                  onChange={e => setCategory(e.target.value as CostCategory)}
                >
                  <option value="SOUS_TRAITANCE">Sous-traitance / Prestataires</option>
                  <option value="ACHAT_MATERIEL">Achat Matériel / Fournitures</option>
                  <option value="TRANSPORT">Transport & Déplacements</option>
                  <option value="LOGICIEL_LICENCE">Logiciels & Licences</option>
                  <option value="HONORAIRES">Honoraires & Conseils</option>
                  <option value="LOYER_CHARGES">Loyer & Charges locatives</option>
                  <option value="TELECOM">Télécom & Internet</option>
                  <option value="AUTRE">Autre dépense</option>
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Date d'engagement *
                </label>
                <input
                  type="date"
                  className="table-input"
                  style={{ width: '100%' }}
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Statut de paiement
                </label>
                <select
                  className="table-input"
                  style={{ width: '100%' }}
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                >
                  <option value="ENGAGE">Engagé (À payer)</option>
                  <option value="VALIDE">Validé</option>
                  <option value="PAYE">Payé</option>
                  <option value="ANNULE">Annulé</option>
                </select>
              </div>
            </div>

            {/* Fournisseur & Réf Facture */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Fournisseur / Bénéficiaire
                </label>
                <input
                  type="text"
                  className="table-input"
                  style={{ width: '100%' }}
                  placeholder="Ex: Imprimerie Nationale, AWS, Société X..."
                  value={supplierName}
                  onChange={e => setSupplierName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  N° Facture / Pièce justificative
                </label>
                <input
                  type="text"
                  className="table-input"
                  style={{ width: '100%' }}
                  placeholder="Ex: FACT-2026-8802"
                  value={invoiceRef}
                  onChange={e => setInvoiceRef(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Description / Motif de la dépense *
              </label>
              <input
                type="text"
                className="table-input"
                style={{ width: '100%' }}
                placeholder="Ex: Impression de 500 brochures couleur 300g..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
              />
            </div>

            {/* Boîte Financière : Montant HT, TVA, Montant TTC */}
            <div className="cout-financial-box">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Montant HT (FCFA) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="table-input"
                  style={{ width: '100%', fontSize: '0.95rem', fontWeight: 700 }}
                  value={amountHt || ''}
                  onChange={e => setAmountHt(Number(e.target.value))}
                  placeholder="0"
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Taux TVA (%)
                </label>
                <select
                  className="table-input"
                  style={{ width: '100%' }}
                  value={vatRate}
                  onChange={e => setVatRate(Number(e.target.value))}
                >
                  <option value={0}>0% (Exonéré)</option>
                  <option value={18}>18% (Standard)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>
                  Montant TVA
                </label>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569', padding: '6px 0' }}>
                  {vatAmount.toLocaleString('fr-FR')} F
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                  Total TTC (FCFA)
                </label>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0D9488', padding: '5px 0' }}>
                  {amountTtc.toLocaleString('fr-FR')} F
                </div>
              </div>
            </div>
          </div>

          <div className="cout-modal-footer">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              <Check size={16} style={{ marginRight: '6px' }} />
              {isSubmitting ? 'Enregistrement...' : coutToEdit ? 'Mettre à jour' : 'Enregistrer la Dépense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
