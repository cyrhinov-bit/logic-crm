import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Trash2, CheckCircle2, Info, X } from 'lucide-react';
import './ConfirmModal.css';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  onConfirm: () => void | Promise<void>;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => void;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [modalOptions, setModalOptions] = useState<ConfirmOptions | null>(null);
  const [loading, setLoading] = useState(false);

  const confirm = (options: ConfirmOptions) => {
    setModalOptions(options);
  };

  const handleClose = () => {
    if (loading) return;
    setModalOptions(null);
  };

  const handleConfirm = async () => {
    if (!modalOptions) return;
    try {
      setLoading(true);
      await modalOptions.onConfirm();
    } catch (error) {
      console.error('Action confirmation failure:', error);
    } finally {
      setLoading(false);
      setModalOptions(null);
    }
  };

  const getIcon = (variant?: ConfirmOptions['variant']) => {
    switch (variant) {
      case 'warning':
        return <AlertTriangle size={24} />;
      case 'info':
        return <Info size={24} />;
      case 'success':
        return <CheckCircle2 size={24} />;
      case 'danger':
      default:
        return <Trash2 size={24} />;
    }
  };

  const getConfirmButtonStyle = (variant?: ConfirmOptions['variant']) => {
    switch (variant) {
      case 'warning':
        return { backgroundColor: 'var(--color-warning)', color: '#fff' };
      case 'info':
        return { backgroundColor: 'var(--color-info)', color: '#fff' };
      case 'success':
        return { backgroundColor: 'var(--color-success)', color: '#fff' };
      case 'danger':
      default:
        return { backgroundColor: 'var(--color-error)', color: '#fff' };
    }
  };

  const variant = modalOptions?.variant || 'danger';

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {modalOptions && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && handleClose()}>
          <div className="confirm-modal card">
            <button className="confirm-modal-close" onClick={handleClose} disabled={loading}>
              <X size={18} />
            </button>
            <div className="confirm-modal-header">
              <div className={`confirm-modal-icon variant-${variant}`}>
                {getIcon(variant)}
              </div>
              <div>
                <h3 className="confirm-modal-title">{modalOptions.title || 'Confirmation'}</h3>
              </div>
            </div>

            <div className="confirm-modal-body">
              <p>{modalOptions.message}</p>
            </div>

            <div className="confirm-modal-actions">
              <button className="btn btn-secondary" onClick={handleClose} disabled={loading}>
                {modalOptions.cancelLabel || 'Annuler'}
              </button>
              <button
                className="btn"
                style={getConfirmButtonStyle(variant)}
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? 'Traitement...' : modalOptions.confirmLabel || 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within a ConfirmProvider');
  return context;
};
