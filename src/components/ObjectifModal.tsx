import React, { useState, useEffect } from 'react';
import { X, Check, Target, AlertTriangle } from 'lucide-react';
import { useAppContext, type Objectif, type PeriodType } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import './ObjectifModal.css';

interface ObjectifModalProps {
  isOpen: boolean;
  onClose: () => void;
  objectifToEdit?: Objectif | null;
  defaultProfileId?: string;
  defaultServiceId?: string;
}

export function ObjectifModal({
  isOpen,
  onClose,
  objectifToEdit,
  defaultProfileId,
  defaultServiceId
}: ObjectifModalProps) {
  const { users, services, addObjectif, updateObjectif } = useAppContext();
  const { currentUser } = useAuth();

  const [profileId, setProfileId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [periodType, setPeriodType] = useState<PeriodType>('MENSUEL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targetRevenueHt, setTargetRevenueHt] = useState<number>(0);
  const [targetMarginHt, setTargetMarginHt] = useState<number>(0);
  const [targetDealsCount, setTargetDealsCount] = useState<number>(5);
  const [targetNewClients, setTargetNewClients] = useState<number>(3);
  const [status, setStatus] = useState<'EN_COURS' | 'ATTEINT' | 'NON_ATTEINT' | 'ANNULE'>('EN_COURS');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter commercials and salespeople
  const commercials = users.filter(u => 
    ['Commercial', 'Responsable', 'Directeur'].includes(u.role)
  );

  useEffect(() => {
    if (!isOpen) return;

    if (objectifToEdit) {
      setProfileId(objectifToEdit.profileId);
      setServiceId(objectifToEdit.serviceId);
      setPeriodType(objectifToEdit.periodType);
      setStartDate(objectifToEdit.startDate);
      setEndDate(objectifToEdit.endDate);
      setTargetRevenueHt(objectifToEdit.targetRevenueHt);
      setTargetMarginHt(objectifToEdit.targetMarginHt);
      setTargetDealsCount(objectifToEdit.targetDealsCount);
      setTargetNewClients(objectifToEdit.targetNewClients);
      setStatus(objectifToEdit.status);
    } else {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      setProfileId(defaultProfileId || (commercials[0]?.id || ''));
      setServiceId(defaultServiceId || (services[0]?.id || ''));
      setPeriodType('MENSUEL');
      setStartDate(firstDay);
      setEndDate(lastDay);
      setTargetRevenueHt(5000000);
      setTargetMarginHt(1500000);
      setTargetDealsCount(5);
      setTargetNewClients(3);
      setStatus('EN_COURS');
    }
    setError(null);
  }, [isOpen, objectifToEdit, defaultProfileId, defaultServiceId, services, users]);

  // Adjust dates when periodType changes
  const handlePeriodTypeChange = (newType: PeriodType) => {
    setPeriodType(newType);
    const now = new Date();
    if (newType === 'MENSUEL') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      setStartDate(first);
      setEndDate(last);
    } else if (newType === 'TRIMESTRIEL') {
      const q = Math.floor(now.getMonth() / 3);
      const first = new Date(now.getFullYear(), q * 3, 1).toISOString().split('T')[0];
      const last = new Date(now.getFullYear(), (q + 1) * 3, 0).toISOString().split('T')[0];
      setStartDate(first);
      setEndDate(last);
    } else if (newType === 'ANNUEL') {
      const first = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      const last = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
      setStartDate(first);
      setEndDate(last);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) {
      setError('Veuillez sélectionner un commercial.');
      return;
    }
    if (!serviceId) {
      setError('Veuillez sélectionner un département / service métier.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Veuillez définir les dates de début et de fin de la période.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (objectifToEdit) {
        await updateObjectif(objectifToEdit.id, {
          profileId,
          serviceId,
          periodType,
          startDate,
          endDate,
          targetRevenueHt,
          targetMarginHt,
          targetDealsCount,
          targetNewClients,
          status
        });
      } else {
        await addObjectif({
          profileId,
          serviceId,
          periodType,
          startDate,
          endDate,
          targetRevenueHt,
          targetMarginHt,
          targetDealsCount,
          targetNewClients,
          status: 'EN_COURS',
          createdBy: currentUser?.id
        });
      }

      onClose();
    } catch (err: any) {
      console.error('Erreur sauvegarde objectif :', err);
      setError(err?.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="obj-modal-overlay">
      <div className="obj-modal-container">
        <div className="obj-modal-header">
          <div className="flex items-center gap-2">
            <Target size={20} color="#0D9488" />
            <h3>{objectifToEdit ? "Modifier l'Objectif Commercial" : 'Définir un Objectif Commercial'}</h3>
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
          <div className="obj-modal-body">
            {error && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#991B1B',
                padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center'
              }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="obj-form-grid">
              <div className="obj-form-group">
                <label>Collaborateur / Commercial *</label>
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

              <div className="obj-form-group">
                <label>Département / Service *</label>
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

            <div className="obj-form-grid">
              <div className="obj-form-group">
                <label>Type de Période</label>
                <select 
                  value={periodType} 
                  onChange={e => handlePeriodTypeChange(e.target.value as PeriodType)}
                >
                  <option value="MENSUEL">Mensuel</option>
                  <option value="TRIMESTRIEL">Trimestriel</option>
                  <option value="ANNUEL">Annuel</option>
                </select>
              </div>

              {objectifToEdit && (
                <div className="obj-form-group">
                  <label>Statut</label>
                  <select 
                    value={status} 
                    onChange={e => setStatus(e.target.value as any)}
                  >
                    <option value="EN_COURS">En cours</option>
                    <option value="ATTEINT">Atteint (Validé)</option>
                    <option value="NON_ATTEINT">Non atteint</option>
                    <option value="ANNULE">Annulé</option>
                  </select>
                </div>
              )}
            </div>

            <div className="obj-form-grid">
              <div className="obj-form-group">
                <label>Date Début *</label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={e => setStartDate(e.target.value)} 
                  required 
                />
              </div>

              <div className="obj-form-group">
                <label>Date Fin (Échéance) *</label>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={e => setEndDate(e.target.value)} 
                  required 
                />
              </div>
            </div>

            <div className="obj-form-grid">
              <div className="obj-form-group">
                <label>Objectif Chiffre d'Affaires HT (FCFA) *</label>
                <input 
                  type="number" 
                  min="0" 
                  step="10000"
                  value={targetRevenueHt} 
                  onChange={e => setTargetRevenueHt(Number(e.target.value))} 
                  required 
                />
              </div>

              <div className="obj-form-group">
                <label>Objectif Marge Brute HT (FCFA) *</label>
                <input 
                  type="number" 
                  min="0" 
                  step="10000"
                  value={targetMarginHt} 
                  onChange={e => setTargetMarginHt(Number(e.target.value))} 
                  required 
                />
              </div>
            </div>

            <div className="obj-form-grid">
              <div className="obj-form-group">
                <label>Nombre d'Affaires Cibles à Gagner</label>
                <input 
                  type="number" 
                  min="0" 
                  value={targetDealsCount} 
                  onChange={e => setTargetDealsCount(Number(e.target.value))} 
                />
              </div>

              <div className="obj-form-group">
                <label>Nouveaux Clients Cibles</label>
                <input 
                  type="number" 
                  min="0" 
                  value={targetNewClients} 
                  onChange={e => setTargetNewClients(Number(e.target.value))} 
                />
              </div>
            </div>
          </div>

          <div className="obj-modal-footer">
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
              {isSubmitting ? 'Enregistrement...' : (objectifToEdit ? 'Mettre à jour' : "Créer l'Objectif")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

