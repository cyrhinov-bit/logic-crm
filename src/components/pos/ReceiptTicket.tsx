import React from 'react';
import type { PosSettings, AppSettings } from '../../context/AppContext';

export interface ReceiptData {
  transaction: any;
  cart: any[];
  paymentMethod: string;
  cashAmount: number;
  changeAmount: number;
  total: number;
  subtotal: number;
  globalDiscount: number;
  cashierName?: string;
  settings?: PosSettings;
  crmSettings?: AppSettings;
}

interface ReceiptTicketProps {
  data: ReceiptData | null;
  settings: PosSettings;
  crmSettings?: AppSettings;
  preview?: boolean;
}

export default function ReceiptTicket({ data, settings, crmSettings, preview = false }: ReceiptTicketProps) {
  if (!data) return null;

  const { transaction, paymentMethod, cashAmount, changeAmount, total, subtotal, globalDiscount, cashierName } = data;
  const activeSettings = settings || data.settings || { libraryName: 'Ma Librairie', currency: 'FCFA' };
  const activeCrmSettings = crmSettings || data.crmSettings;

  const rawCart = data.cart;
  const cart = (rawCart && Array.isArray(rawCart) && rawCart.length > 0)
    ? rawCart
    : (transaction?.lines?.map((l: any) => ({
        id: l.id,
        productId: l.productId,
        name: l.description || l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent || 0,
        discountAmount: l.discountAmount || 0,
        total: l.total
      })) || []);

  const formatDate = (isoString?: string) => {
    if (!isoString) return new Date().toLocaleString('fr-FR');
    const d = new Date(isoString);
    return d.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const totalUnits = (cart || []).reduce((sum: number, item: any) => sum + Number(item.quantity ?? item.qty ?? 1), 0);
  const totalArticles = (cart || []).length;

  const paymentsList = (transaction?.payments && Array.isArray(transaction.payments) && transaction.payments.length > 0)
    ? transaction.payments
    : [{ method: paymentMethod || 'Espèces', amount: total }];

  // I2 : bandeau visible quand des replis ont masqué des données incomplètes
  // (vente à 0 ligne, paiements manquants) — jamais un ticket « normal » silencieux.
  const cartFromFallback = !(rawCart && Array.isArray(rawCart) && rawCart.length > 0);
  const paymentsFromFallback = !(transaction?.payments && Array.isArray(transaction.payments) && transaction.payments.length > 0);
  const incomplete = (cartFromFallback && cart.length === 0) || paymentsFromFallback;

  return (
    <div className={preview ? "" : "receipt-print-zone"} style={{ width: '80mm', boxSizing: 'border-box', padding: '10px', fontSize: '12px', fontFamily: 'monospace', color: '#000', margin: '0 auto', background: '#fff' }}>
      {incomplete && (
        <div style={{ border: '2px solid #000', padding: '6px', marginBottom: '10px', textAlign: 'center', fontWeight: 700 }}>
          ⚠ DONNÉES INCOMPLÈTES — CONTRÔLE REQUIS
        </div>
      )}
      {/* En-tête */}
      <div style={{ textAlign: 'center', marginBottom: '14px' }}>
        <h2 style={{ fontSize: '16px', margin: '0 0 4px 0', textTransform: 'uppercase', fontWeight: 700 }}>{activeSettings.libraryName}</h2>
        {activeSettings.address && <div style={{ marginBottom: '2px' }}>{activeSettings.address}</div>}
        {activeSettings.phone && <div style={{ marginBottom: '2px' }}>Tel: {activeSettings.phone}</div>}
        {activeSettings.email && <div style={{ marginBottom: '2px' }}>Email: {activeSettings.email}</div>}
        {activeCrmSettings?.companySiret && <div style={{ fontSize: '10px', color: '#444' }}>RCCM/SIRET: {activeCrmSettings.companySiret}</div>}
        {activeCrmSettings?.companyTva && <div style={{ fontSize: '10px', color: '#444' }}>TVA/IFU: {activeCrmSettings.companyTva}</div>}
        
        <div style={{ marginTop: '8px', borderTop: '1px dashed #000', paddingTop: '6px', fontWeight: 600 }}>
          TICKET : {transaction?.transactionNumber || transaction?.id || 'TICKET'}
        </div>
        <div>Date : {formatDate(transaction?.date)}</div>
        {cashierName && <div>Caissier : {cashierName}</div>}
      </div>

      {/* Lignes de commande en DataTable */}
      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '8px 0', marginBottom: '10px' }}>
        <div className="table-responsive">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th style={{ textAlign: 'left', paddingBottom: '4px', width: '38%' }}>Désignation</th>
                <th style={{ textAlign: 'center', paddingBottom: '4px', width: '14%' }}>Qté</th>
                <th style={{ textAlign: 'right', paddingBottom: '4px', width: '24%' }}>P.U.</th>
                <th style={{ textAlign: 'right', paddingBottom: '4px', width: '24%' }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {(cart || []).map((item: any, i: number) => {
                const name = item.name || item.description || item.productName || 'Article';
                const qty = Number(item.quantity ?? item.qty ?? 1);
                const unitPrice = Number(item.unitPrice ?? item.unit_price ?? (item.total && qty ? Math.round(item.total / qty) : 0));
                const lineTotal = Number(item.total ?? (qty * unitPrice));
                const hasDiscount = (item.discountPercent && item.discountPercent > 0) || (item.discountAmount && item.discountAmount > 0);

                return (
                  <React.Fragment key={i}>
                    <tr>
                      <td style={{ verticalAlign: 'top', paddingTop: '4px', wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                        {name}
                      </td>
                      <td style={{ verticalAlign: 'top', paddingTop: '4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {qty}
                      </td>
                      <td style={{ verticalAlign: 'top', paddingTop: '4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {unitPrice.toLocaleString('fr-FR')}
                      </td>
                      <td style={{ verticalAlign: 'top', paddingTop: '4px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {lineTotal.toLocaleString('fr-FR')}
                      </td>
                    </tr>
                    {hasDiscount && (
                      <tr>
                        <td colSpan={4} style={{ fontSize: '9px', color: '#555', paddingLeft: '6px', paddingBottom: '2px', wordBreak: 'break-word' }}>
                          └ Remise : {item.discountPercent ? `-${item.discountPercent}%` : `-${Number(item.discountAmount).toLocaleString('fr-FR')} ${activeSettings.currency}`}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: '10px', color: '#555', marginTop: '6px', textAlign: 'right' }}>
          {totalArticles} article(s) &bull; {totalUnits} unité(s)
        </div>
      </div>

      {/* Totaux */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Sous-total :</span>
          <span>{Number(subtotal || total).toLocaleString('fr-FR')} {activeSettings.currency}</span>
        </div>
        {globalDiscount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', color: '#555' }}>
            <span>Remise globale :</span>
            <span>-{Number(globalDiscount).toLocaleString('fr-FR')} {activeSettings.currency}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '15px', fontWeight: 'bold' }}>
          <span>NET À PAYER :</span>
          <span>{Number(total).toLocaleString('fr-FR')} {activeSettings.currency}</span>
        </div>
      </div>

      {/* Paiement */}
      <div style={{ borderTop: '1px dashed #000', paddingTop: '8px', marginBottom: '14px' }}>
        {paymentsList.map((p: any, idx: number) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>Payé en ({p.method || paymentMethod}) :</span>
            <span>{Number(p.amount || 0).toLocaleString('fr-FR')} {activeSettings.currency}</span>
          </div>
        ))}
        {cashAmount > 0 && paymentMethod !== 'Mobile Money' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', color: '#555' }}>
            <span>Espèces reçues :</span>
            <span>{Number(cashAmount).toLocaleString('fr-FR')} {activeSettings.currency}</span>
          </div>
        )}
        {changeAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontWeight: 600 }}>
            <span>Monnaie rendue :</span>
            <span>{Number(changeAmount).toLocaleString('fr-FR')} {activeSettings.currency}</span>
          </div>
        )}
      </div>

      {/* Message de fin */}
      <div style={{ textAlign: 'center', marginTop: '12px', borderTop: '1px dashed #000', paddingTop: '10px', whiteSpace: 'pre-wrap', fontSize: '11px' }}>
        {activeSettings.ticketMessage || 'Merci de votre visite !'}
      </div>
    </div>
  );
}
