import { PrinterManager } from '../services/printer/PrinterManager.js';

export class ReceiptEngine {
  static async printReceipt(data: any): Promise<string> {
    // Données minimales exigées : jamais de ticket vide à 0 FCFA d'apparence valable.
    const tx = data?.transaction || data;
    const cart = (Array.isArray(data?.cart) && data.cart.length > 0) ? data.cart : (tx?.lines || []);
    const total = Number(data?.total ?? tx?.total ?? 0);
    if (!data || cart.length === 0 || !(total > 0)) {
      throw new Error('Ticket invalide : panier vide ou total nul (impression refusée).');
    }
    const html = ReceiptEngine.buildReceiptHtml(data);
    if (!html) {
      throw new Error('Ticket invalide : génération impossible.');
    }
    try {
      await PrinterManager.printHtml(html, data?.printerName);
      return 'receipt_printed';
    } catch (err: any) {
      // Échec remonté en exception (le renderer affiche un fallback au lieu
      // d'un faux succès).
      throw new Error(`Échec d'impression : ${String(err?.message || err)}`);
    }
  }

  private static esc(s: any): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private static fmt(n: any): string {
    const num = Number(n) || 0;
    return num.toLocaleString('fr-FR');
  }

  private static buildReceiptHtml(data: any): string {
    const tx = data?.transaction || data;
    const cart = (Array.isArray(data?.cart) && data.cart.length > 0) ? data.cart : (tx?.lines || []);
    const total = data?.total ?? tx?.total ?? 0;
    const subtotal = data?.subtotal ?? tx?.subtotal ?? total;
    const currency = data?.currency ?? data?.settings?.currency ?? 'FCFA';
    const paymentMethod = data?.paymentMethod ?? 'Espèces';
    const cashAmount = data?.cashAmount ?? total;
    const changeAmount = data?.changeAmount ?? 0;
    const cashierName = data?.cashierName || tx?.cashierName || '';
    const date = tx?.date ? new Date(tx.date).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR');

    const header = data?.settings?.libraryName || 'LIBRAIRIE';
    const address = data?.settings?.address;
    const phone = data?.settings?.phone;
    const email = data?.settings?.email;
    const companySiret = data?.crmSettings?.companySiret;
    const companyTva = data?.crmSettings?.companyTva;

    const totalUnits = cart.reduce((sum: number, item: any) => sum + Number(item.quantity ?? item.qty ?? 1), 0);
    const totalArticles = cart.length;
    const globalDiscount = Number(data?.globalDiscount ?? tx?.discountAmount ?? 0);

    const paymentsList = (tx?.payments && Array.isArray(tx.payments) && tx.payments.length > 0)
      ? tx.payments
      : [{ method: paymentMethod || 'Espèces', amount: total }];

    const lines = cart.map((item: any) => {
      const name = item.name || item.description || item.productName || 'Article';
      const qty = Number(item.quantity ?? item.qty ?? 1);
      const unitPrice = Number(item.unitPrice ?? item.unit_price ?? (item.total && qty ? Math.round(item.total / qty) : 0));
      const lineTotal = Number(item.total ?? (qty * unitPrice));
      const hasDiscount = (item.discountPercent && item.discountPercent > 0) || (item.discountAmount && item.discountAmount > 0);

      let row = `
        <tr>
          <td>${ReceiptEngine.esc(name)}</td>
          <td style="text-align:center">${ReceiptEngine.esc(qty)}</td>
          <td style="text-align:right">${ReceiptEngine.fmt(unitPrice)}</td>
          <td style="text-align:right;font-weight:bold">${ReceiptEngine.fmt(lineTotal)}</td>
        </tr>`;

      if (hasDiscount) {
        const discountText = item.discountPercent ? `-${item.discountPercent}%` : `-${ReceiptEngine.fmt(item.discountAmount)} ${ReceiptEngine.esc(currency)}`;
        row += `
        <tr>
          <td colspan="4" style="font-size:10px;color:#555;padding-left:6px;padding-bottom:2px">
            └ Remise : ${ReceiptEngine.esc(discountText)}
          </td>
        </tr>`;
      }

      return row;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: 'Consolas', 'Courier New', monospace; font-size: 11px; color: #000; margin: 0; padding: 4px; width: 72mm; box-sizing: border-box; }
  .center { text-align: center; }
  h2 { font-size: 15px; margin: 0 0 4px 0; text-transform: uppercase; }
  .dash { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  .items-table { table-layout: fixed; width: 100%; }
  .items-table th, .items-table td { padding: 2px 0; }
  .items-table th { border-bottom: 1px solid #000; font-size: 11px; }
  .items-table th:nth-child(1), .items-table td:nth-child(1) { width: 38%; text-align: left; word-break: break-word; overflow-wrap: break-word; white-space: normal; }
  .items-table th:nth-child(2), .items-table td:nth-child(2) { width: 14%; text-align: center; white-space: nowrap; }
  .items-table th:nth-child(3), .items-table td:nth-child(3) { width: 24%; text-align: right; white-space: nowrap; }
  .items-table th:nth-child(4), .items-table td:nth-child(4) { width: 24%; text-align: right; white-space: nowrap; }
  td { vertical-align: top; }
</style>
</head>
<body>
  <div class="center">
    <h2>${ReceiptEngine.esc(header)}</h2>
    ${address ? `<div>${ReceiptEngine.esc(address)}</div>` : ''}
    ${phone ? `<div>Tel: ${ReceiptEngine.esc(phone)}</div>` : ''}
    ${email ? `<div>Email: ${ReceiptEngine.esc(email)}</div>` : ''}
    ${companySiret ? `<div style="font-size:10px;color:#444">RCCM/SIRET: ${ReceiptEngine.esc(companySiret)}</div>` : ''}
    ${companyTva ? `<div style="font-size:10px;color:#444">TVA/IFU: ${ReceiptEngine.esc(companyTva)}</div>` : ''}
    <div style="margin-top:6px;border-top:1px dashed #000;padding-top:4px;font-weight:bold">TICKET : ${ReceiptEngine.esc(tx?.transactionNumber || tx?.id || '')}</div>
    <div>Date : ${ReceiptEngine.esc(date)}</div>
    ${cashierName ? `<div>Caissier : ${ReceiptEngine.esc(cashierName)}</div>` : ''}
  </div>
  <div class="dash"></div>
  <table class="items-table">
    <thead>
      <tr>
        <th style="text-align:left">Désignation</th>
        <th style="text-align:center">Qté</th>
        <th style="text-align:right">P.U.</th>
        <th style="text-align:right">Montant</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
  <div style="font-size:10px;color:#555;margin-top:4px;text-align:right">
    ${totalArticles} article(s) &bull; ${totalUnits} unité(s)
  </div>
  <div class="dash"></div>
  <table>
    <tr><td>Sous-total</td><td style="text-align:right">${ReceiptEngine.fmt(subtotal)} ${ReceiptEngine.esc(currency)}</td></tr>
    ${globalDiscount > 0 ? `<tr><td>Remise globale</td><td style="text-align:right">-${ReceiptEngine.fmt(globalDiscount)} ${ReceiptEngine.esc(currency)}</td></tr>` : ''}
    <tr style="font-size:13px;font-weight:bold"><td>TOTAL</td><td style="text-align:right">${ReceiptEngine.fmt(total)} ${ReceiptEngine.esc(currency)}</td></tr>
  </table>
  <div class="dash"></div>
  <table>
    ${paymentsList.map((p: any) => `<tr><td>Payé en (${ReceiptEngine.esc(p.method || paymentMethod)})</td><td style="text-align:right">${ReceiptEngine.fmt(p.amount || 0)} ${ReceiptEngine.esc(currency)}</td></tr>`).join('')}
    ${cashAmount > 0 && paymentMethod !== 'Mobile Money' ? `<tr><td>Espèces reçues</td><td style="text-align:right">${ReceiptEngine.fmt(cashAmount)} ${ReceiptEngine.esc(currency)}</td></tr>` : ''}
    ${changeAmount > 0 ? `<tr style="font-weight:bold"><td>Monnaie rendue</td><td style="text-align:right">${ReceiptEngine.fmt(changeAmount)} ${ReceiptEngine.esc(currency)}</td></tr>` : ''}
  </table>
  <div class="center" style="margin-top:10px;border-top:1px dashed #000;padding-top:6px">
    ${ReceiptEngine.esc(data?.settings?.ticketMessage || 'Merci de votre visite !')}
  </div>
</body>
</html>`;
  }
}