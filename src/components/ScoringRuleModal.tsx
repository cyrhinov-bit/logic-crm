import React, { useState, useEffect } from 'react';
import { X, Check, Sliders, AlertTriangle } from 'lucide-react';
import { useAppContext, type ScoringRule } from '../context/AppContext';
import './ScoringRuleModal.css';

interface ScoringRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceId?: string;
}

export function ScoringRuleModal({ isOpen, onClose, serviceId }: ScoringRuleModalProps) {
  const { scoringRules, updateScoringRule } = useAppContext();

  const currentRule = scoringRules.find(r => (!serviceId && !r.serviceId) || (r.serviceId === serviceId));

  const [weightMargin, setWeightMargin] = useState<number>(40);
  const [weightRevenue, setWeightRevenue] = useState<number>(30);
  const [weightVolume, setWeightVolume] = useState<number>(15);
  const [weightConversion, setWeightConversion] = useState<number>(15);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (currentRule) {
      setWeightMargin(currentRule.weightMargin);
      setWeightRevenue(currentRule.weightRevenue);
      setWeightVolume(currentRule.weightVolume);
      setWeightConversion(currentRule.weightConversion);
    } else {
      setWeightMargin(40);
      setWeightRevenue(30);
      setWeightVolume(15);
      setWeightConversion(15);
    }
    setError(null);
  }, [isOpen, currentRule]);

  const totalWeight = weightMargin + weightRevenue + weightVolume + weightConversion;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalWeight !== 100) {
      setError(`La somme des pondérations doit être égale exactement à 100% (actuel: ${totalWeight}%).`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (currentRule) {
        await updateScoringRule(currentRule.id, {
          weightMargin,
          weightRevenue,
          weightVolume,
          weightConversion
        });
      }
      onClose();
    } catch (err: any) {
      console.error('Erreur mise à jour règles scoring :', err);
      setError(err?.message || 'Une erreur est survenue.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rule-modal-overlay">
      <div className="rule-modal-container">
        <div className="rule-modal-header">
          <div className="flex items-center gap-2">
            <Sliders size={20} color="#0D9488" />
            <h3>Pondérations du Score Commercial</h3>
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
          <div className="rule-modal-body">
            {error && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#991B1B',
                padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center'
              }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
              Définissez l'importance relative de chaque indicateur dans le calcul du score de performance des commerciaux (sur 100 points).
            </p>

            <div className="rule-form-group">
              <label>
                <span>Marge Brute HT Réalisée</span>
                <span className="font-bold text-teal-700">{weightMargin}%</span>
              </label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="5"
                value={weightMargin}
                onChange={e => setWeightMargin(Number(e.target.value))}
              />
            </div>

            <div className="rule-form-group">
              <label>
                <span>Chiffre d'Affaires HT Facturé</span>
                <span className="font-bold text-teal-700">{weightRevenue}%</span>
              </label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="5"
                value={weightRevenue}
                onChange={e => setWeightRevenue(Number(e.target.value))}
              />
            </div>

            <div className="rule-form-group">
              <label>
                <span>Volume d'Affaires Gagnées</span>
                <span className="font-bold text-teal-700">{weightVolume}%</span>
              </label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="5"
                value={weightVolume}
                onChange={e => setWeightVolume(Number(e.target.value))}
              />
            </div>

            <div className="rule-form-group">
              <label>
                <span>Taux de Conversion des Prospects</span>
                <span className="font-bold text-teal-700">{weightConversion}%</span>
              </label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="5"
                value={weightConversion}
                onChange={e => setWeightConversion(Number(e.target.value))}
              />
            </div>

            <div className={`rule-total-pill ${totalWeight === 100 ? 'rule-total-valid' : 'rule-total-invalid'}`}>
              <span>Total des Pondérations :</span>
              <span>{totalWeight} % {totalWeight === 100 ? '✓ (Équilibré)' : '✗ (Doit être 100%)'}</span>
            </div>
          </div>

          <div className="rule-modal-footer">
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
              disabled={isSubmitting || totalWeight !== 100}
            >
              <Check size={16} style={{ marginRight: '6px' }} />
              {isSubmitting ? 'Enregistrement...' : 'Appliquer les Pondérations'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

