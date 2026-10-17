import React, { useState, useEffect } from 'react';
import { X, Check, Award, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useAppContext, type PrimeType } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import './PrimeModal.css';

interface PrimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProfileId?: string;
  defaultServiceId?: string;
}

export function PrimeModal({
  isOpen,
  onClose,
  defaultProfileId,
  defaultServiceId
}: PrimeModalProps) {
  const { users, services, proposePrime } = useAppContext();
  const { currentUser } = useAuth();

  const [profileId, setProfileId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [periodKey, setPeriodKey] = useState('');
  const [primeType, setPrimeType] = useState<PrimeType>('PERFORMANCE');
  const [amount, setAmount] = useState<number>(100000);
  const [justification, setJustification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter commercials and salespeople
  const commercials = users.filter(u => 
    ['Commercial', 'Responsable', 'Directeur'].includes(u.role)
  );

  useEffect(() => {
    if (!isOpen) return;

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    setProfileId(defaultProfileId || (commercials[0]?.id || ''));
    setServiceId(defaultServiceId || (services[0]?.id || ''));
    setPeriodKey(currentMonthKey);
    setPrimeType('PERFORMANCE');
    setAmount(100000);
    setJustification('');
    setError(null);
  }, [isOpen, defaultProfileId, defaultServiceId, services, users]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) {
      setError('Veuillez désigner le collaborateur bénéficiaire.');
      return;
    }
    if (!serviceId) {
      setError('Veuillez sélectionner le département / service.');
      return;
    }
    if (!amount || amount <= 0) {
      setError('Le montant de la prime doit être strictement supérieur à zéro.');
      return;
    }
    if (!justification.trim() || justification.trim().length < 10) {
      setError('Une justification détaillée (minimum 10 caractères) est obligatoire pour la traçabilité et validation.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await proposePrime({
        profileId,
        serviceId,
        periodKey,
        primeType,
        amount,
        calculatedBy: currentUser?.id,
        justification: justification.trim()
      }, justification.trim());

      onClose();
    } catch (err: any) {
      console.error('Erreur proposition prime :', err);
      setError(err?.message || "Une erreur est survenue lors de l'enregistrement de la prime.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="prime-modal-overlay">
      <div className="prime-modal-container">
        <div className="prime-modal-header">
          <div className="flex items-center gap-2">
            <Award size={20} color="#0D9488" />
            <h3>Proposer / Attribuer une Prime</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="prime-modal-body">
            {error && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#991B1B',
                padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center'
              }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div style={{
              background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: '8px',
              padding: '0.75rem 1rem', display: 'flex', gap: '8px', alignItems: 'center'
            }}>
              <ShieldAlert size={18} color="#0D9488" style={{ flexShrink: 0 }} />
              <p style={{ fontSize: '0.75rem', color: '#0F766E', margin: 0, lineHeight: 1.4 }}>
                <strong>Circuit de validation & Traçabilité :</strong> La prime sera créée avec le statut <code>PROPOSÉE</code> et soumise à l'approbation de la Direction. Toutes les actions seront enregistrées dans le journal d'audit immuable.
              </p>
            </div>

            <div className="prime-form-grid">
              <div className="prime-form-group">
                <label>Bénéficiaire *</label>
                <select 
                  value={profileId} 
                  onChange={e => setProfileId(e.target.value)}
                  required
                >
                  <option value="">Sélectionner un collaborateur...</option>
                  {commercials.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="prime-form-group">
                <label>Service / Département *</label>
                <select 
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

            <div className="prime-form-grid">
              <div className="prime-form-group">
                <label>Période de Référence *</label>
                <input 
                  type="text" 
                  placeholder="Ex: 2026-08 ou 2026-T3" 
                  value={periodKey} 
                  onChange={e => setPeriodKey(e.target.value)} 
                  required 
                />
              </div>

              <div className="prime-form-group">
                <label>Nature de la Prime *</label>
                <select 
                  value={primeType} 
                  onChange={e => setPrimeType(e.target.value as PrimeType)}
                >
                  <option value="PERFORMANCE">Performance (Objectifs atteints)</option>
                  <option value="CHALLENGE">Challenge Commercial</option>
                  <option value="EXCEPTIONNELLE">Prime Exceptionnelle</option>
                </select>
              </div>
            </div>

            <div className="prime-form-group full-width">
              <label>Montant de la Prime (FCFA) *</label>
              <input 
                type="number" 
                min="1000" 
                step="5000"
                value={amount} 
                onChange={e => setAmount(Number(e.target.value))} 
                required 
              />
            </div>

            <div className="prime-form-group full-width">
              <label>Motif & Justification Détaillée *</label>
              <textarea 
                rows={3}
                placeholder="Préciser les faits générateurs, affaires exceptionnelles ou objectifs dépassés..."
                value={justification}
                onChange={e => setJustification(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="prime-modal-footer">
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
              {isSubmitting ? 'Enregistrement...' : 'Soumettre la Prime'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

