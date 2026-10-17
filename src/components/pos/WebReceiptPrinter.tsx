import { useEffect, useRef, useState } from 'react';
import ReceiptTicket from './ReceiptTicket';
import type { PosSettings } from '../../context/AppContext';
import { WEB_PRINT_EVENT, takeWebPrint, settleWebPrint } from '../../lib/webPrintBus';
import type { WebPrintRequest } from '../../lib/webPrintBus';

const FALLBACK_SETTINGS: PosSettings = {
  libraryName: 'Ma Librairie',
  address: '',
  phone: '',
  email: '',
  currency: 'FCFA',
  ticketMessage: 'Merci de votre visite !',
  printerType: 'Thermique 80mm',
};

/**
 * Imprimante web globale (montée une fois dans le Layout).
 * Rend le ticket demandé via browserBridge.pos.printReceipt() dans la zone
 * d'impression (visible uniquement à l'impression, format 80mm), déclenche
 * window.print(), puis résout la promesse d'impression.
 */
export default function WebReceiptPrinter() {
  const [job, setJob] = useState<WebPrintRequest | null>(null);
  const settledRef = useRef(false);

  // Réception des demandes + signal de disponibilité pour le bus.
  useEffect(() => {
    window.__hinovWebPrinterReady = true;
    const onRequest = () => {
      const req = takeWebPrint();
      if (!req) return;
      settledRef.current = false;
      setJob(req);
    };
    window.addEventListener(WEB_PRINT_EVENT, onRequest);
    return () => {
      window.removeEventListener(WEB_PRINT_EVENT, onRequest);
      window.__hinovWebPrinterReady = false;
    };
  }, []);

  // Résolution unique (afterprint + filet de sécurité), puis job suivant de la file.
  useEffect(() => {
    if (!job) return;
    const settle = (result: string) => {
      if (settledRef.current) return;
      settledRef.current = true;
      try {
        settleWebPrint(result);
      } finally {
        setJob(null);
      }
    };
    const onAfterPrint = () => settle('receipt_printed_web');
    window.addEventListener('afterprint', onAfterPrint);
    // Laisse React peindre la zone cachée avant d'ouvrir le dialogue.
    const t1 = setTimeout(() => {
      requestAnimationFrame(() => {
        setTimeout(() => window.print(), 100);
      });
    }, 50);
    // Filet : si afterprint ne se déclenche pas (aperçu fermé autrement), on libère quand même.
    const t2 = setTimeout(() => settle('receipt_printed_web'), 15000);
    return () => {
      window.removeEventListener('afterprint', onAfterPrint);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [job]);

  if (!job) return null;
  const data = job.data || {};
  return (
    <ReceiptTicket
      data={data}
      settings={data.settings || FALLBACK_SETTINGS}
      crmSettings={data.crmSettings}
    />
  );
}
