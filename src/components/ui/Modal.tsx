import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

export interface ModalProps {
  open: boolean;
  title?: string;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ open, title, onClose, children, footer, width }: ModalProps) {
  if (!open) return null;

  return (
    <div className="ui-modal-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="ui-modal" style={width ? { width } : undefined} role="dialog" aria-modal="true">
        {onClose && (
          <button className="ui-modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        )}
        {title && <div className="ui-modal-header"><h3>{title}</h3></div>}
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
