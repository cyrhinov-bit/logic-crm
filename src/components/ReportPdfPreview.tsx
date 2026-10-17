import { useState, useEffect, useRef } from 'react';
import { Download, Printer, FileText, ExternalLink, Mail } from 'lucide-react';
import { Modal } from './ui/Modal';
import { downloadDataUrl } from '../lib/pdfUtils';

export interface ReportPdfPreviewData {
  dataUrl?: string;
  blobUrl?: string;
  filename: string;
  title: string;
  onDownload?: () => void;
  /** Si fourni, un bouton "Envoyer par mail" est affiché (ex : envoi du devis via Outlook). */
  onSendByMail?: () => void | Promise<unknown>;
}

interface ReportPdfPreviewProps {
  preview: ReportPdfPreviewData | null;
  onClose: () => void;
}

export function ReportPdfPreview({ preview, onClose }: ReportPdfPreviewProps) {
  const [activeUrl, setActiveUrl] = useState<string>('');
  const blobUrlRef = useRef<string>('');

  const revokeTrackedBlob = () => {
    if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
      try { URL.revokeObjectURL(blobUrlRef.current); } catch { /* ignore */ }
    }
    blobUrlRef.current = '';
  };

  useEffect(() => {
    // Révoque l'ancienne URL blob avant d'en afficher une nouvelle (anti-fuite mémoire)
    revokeTrackedBlob();
    if (preview) {
      const url = preview.blobUrl || preview.dataUrl || '';
      if (url.startsWith('blob:')) blobUrlRef.current = url;
      setActiveUrl(url);
    } else {
      setActiveUrl('');
    }
  }, [preview]);

  useEffect(() => {
    // Sécurité : révoque à la destruction du composant
    return () => { revokeTrackedBlob(); };
  }, []);

  const handleDownload = () => {
    if (!preview) return;
    if (preview.onDownload) {
      preview.onDownload();
    } else if (preview.blobUrl) {
      const a = document.createElement('a');
      a.href = preview.blobUrl;
      a.download = preview.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (preview.dataUrl) {
      downloadDataUrl(preview.dataUrl, preview.filename);
    }
  };

  const handlePrint = () => {
    if (!activeUrl) return;
    const iframe = document.getElementById('report-pdf-iframe') as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        return;
      } catch (err) {
        console.warn('Iframe print failed, falling back to window.open', err);
      }
    }
    const printWin = window.open(activeUrl, '_blank');
    printWin?.focus();
    printWin?.print();
  };

  const handleOpenExternal = () => {
    if (activeUrl) {
      window.open(activeUrl, '_blank');
    }
  };

  return (
    <Modal
      open={!!preview}
      title={preview?.title || 'Lecture du document PDF'}
      onClose={onClose}
      width={960}
      footer={
        preview && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              <FileText size={16} />
              <span>{preview.filename}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {preview.onSendByMail && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => preview.onSendByMail?.()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0D9488', borderColor: '#0D9488' }}
                  title="Envoyer ce devis par e-mail (ouvre votre application de messagerie)"
                >
                  <Mail size={15} /> Envoyer par mail
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleOpenExternal}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Ouvrir dans un nouvel onglet"
              >
                <ExternalLink size={15} /> Ouvrir plein écran
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handlePrint}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Imprimer le document"
              >
                <Printer size={15} /> Imprimer
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDownload}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Télécharger une copie PDF"
              >
                <Download size={15} /> Télécharger PDF
              </button>
            </div>
          </div>
        )
      }
    >
      {preview && activeUrl ? (
        <div style={{ width: '100%', height: '75vh', backgroundColor: '#525659', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
          <iframe
            id="report-pdf-iframe"
            src={activeUrl}
            title={preview.title}
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#ffffff', display: 'block' }}
          />
        </div>
      ) : (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Chargement du document PDF en cours...
        </div>
      )}
    </Modal>
  );
}