import React from 'react';
import { X, ShieldCheck, History, User } from 'lucide-react';
import { useAppContext, type Prime } from '../context/AppContext';
import './PrimeAuditModal.css';

interface PrimeAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  prime: Prime | null;
}

export function PrimeAuditModal({ isOpen, onClose, prime }: PrimeAuditModalProps) {
  const { primeAuditLogs, users } = useAppContext();

  if (!isOpen || !prime) return null;

  const logs = primeAuditLogs
    .filter(l => l.primeId === prime.id)
    .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());

  const getUserName = (userId: string) => {
    const u = users.find(user => user.id === userId);
    return u ? `${u.name} (${u.role})` : userId;
  };

  return (
    <div className="audit-modal-overlay">
      <div className="audit-modal-container">
        <div className="audit-modal-header">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} color="#0D9488" />
            <div>
              <h3>Journal d'Audit Immuable — {prime.reference}</h3>
              <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
                Montant : <strong>{prime.amount.toLocaleString('fr-FR')} FCFA</strong> — Statut actuel : <strong>{prime.status}</strong>
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="audit-modal-body">
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94A3B8' }}>
              <History size={36} style={{ margin: '0 auto 0.5rem auto' }} />
              <p>Aucun événement d'audit enregistré pour cette prime.</p>
            </div>
          ) : (
            <div className="audit-timeline">
              {logs.map(log => (
                <div key={log.id} className="audit-timeline-item">
                  <div className="audit-item-header">
                    <span className={`audit-action-badge audit-action-${log.action}`}>
                      {log.action}
                    </span>
                    <span className="audit-item-meta">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString('fr-FR') : 'Date inconnue'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-slate-600 mb-1">
                    <User size={13} />
                    <span>Acteur : <strong>{getUserName(log.actorId)}</strong></span>
                  </div>

                  {log.comment && (
                    <div className="audit-comment">
                      <strong>Commentaire / Motif :</strong> {log.comment}
                    </div>
                  )}

                  {log.previousState && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>État précédent :</span>
                      <pre className="audit-state-diff">
                        {JSON.stringify(log.previousState, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="audit-modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

