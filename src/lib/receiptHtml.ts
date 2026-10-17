// Impression ticket de caisse côté navigateur (PWA / web) via iframe dédiée.
//
// Contexte (audit tickets blancs) : l'ancien chemin utilisait window.print() sur
// la page POS avec la technique CSS `body * { visibility: hidden }` +
// `.receipt-print-zone { visibility: visible }`. Toute mutation React autour de
// l'appel (fermeture de modale, toast) ou un instantané pris trop tôt par le
// navigateur produit une page VIDE — le ticket « sort tout blanc » sans erreur.
// L'iframe ci-dessous isole le ticket du DOM React : le snapshot d'impression
// ne dépend plus ni des re-renders ni du CSS global.
//
// Le HTML généré reprend exactement les règles de ReceiptEngine (Electron) :
// mêmes replis (cart → transaction.lines, payments → fallback), même refus
// d'imprimer un ticket vide ou à total nul.

export interface ReceiptPrintData {
  transaction?: any;
  cart?: any[];
  paymentMethod?: string;
  cashAmount?: number;
  changeAmount?: number;
  total?: number;
  subtotal?: number;
  globalDiscount?: number;
  cashierName?: string;
  settings?: any;
  crmSettings?: any;
  currency?: string;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n: unknown): string {
  const num = Number(n) || 0;
  return num.toLocaleString('fr-FR');
}

function pickCart(data: ReceiptPrintData): any[] {
  if (Array.isArray(data?.cart) && data.cart.length > 0) return data.cart;
  const lines = data?.transaction?.lines;
  return Array.isArray(lines) ? lines : [];
}

function pickTotal(data: ReceiptPrintData): number {
  return Number(data?.total ?? data?.transaction?.total ?? 0);
}

/** Garde anti-vide : mêmes critères que ReceiptEngine côté Electron. */
export function isPrintableReceipt(data: ReceiptPrintData | null | undefined): boolean {
  if (!data) return false;
  return pickCart(data).length > 0 && pickTotal(data) > 0;
}

/**
 * Construit le HTML autonome du ticket (80mm, thermique).
 * Retourne null si le ticket n'est pas imprimable (panier vide / total nul).
 */
export function buildReceiptHtml(data: ReceiptPrintData): string | null {
  if (!isPrintableReceipt(data)) return null;

  const tx = data?.transaction || data;
  const cart = pickCart(data);
  const total = pickTotal(data);
  const subtotal = Number(data?.subtotal ?? tx?.subtotal ?? total);
  const currency = data?.currency ?? data?.settings?.currency ?? 'FCFA';
  const paymentMethod = data?.paymentMethod ?? 'Espèces';
  const cashAmount = Number(data?.cashAmount ?? total);
  const changeAmount = Number(data?.changeAmount ?? 0);
  const cashierName = data?.cashierName || tx?.cashierName || '';
  const date = tx?.date ? new Date(tx.date).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR');

  const header = data?.settings?.libraryName || 'LIBRAIRIE';
  const address = data?.settings?.address;
  const phone = data?.settings?.phone;
  const email = data?.settings?.email;
  const companySiret = data?.crmSettings?.companySiret;
  const companyTva = data?.crmSettings?.companyTva;
  const ticketMessage = data?.settings?.ticketMessage || 'Merci de votre visite !';

  const totalUnits = cart.reduce((sum: number, item: any) => sum + Number(item.quantity ?? item.qty ?? 1), 0);
  const globalDiscount = Number(data?.globalDiscount ?? tx?.discountAmount ?? 0);

  const paymentsList =
    tx?.payments && Array.isArray(tx.payments) && tx.payments.length > 0
      ? tx.payments
      : [{ method: paymentMethod || 'Espèces', amount: total }];

  const lines = cart
    .map((item: any) => {
      const name = item.name || item.description || item.productName || 'Article';
      const qty = Number(item.quantity ?? item.qty ?? 1);
      const unitPrice = Number(item.unitPrice ?? item.unit_price ?? (item.total && qty ? Math.round(item.total / qty) : 0));
      const lineTotal = Number(item.total ?? qty * unitPrice);
      const hasDiscount = (item.discountPercent && item.discountPercent > 0) || (item.discountAmount && item.discountAmount > 0);

      let row = `
        <tr>
          <td>${esc(name)}</td>
          <td style="text-align:center">${esc(qty)}</td>
          <td style="text-align:right">${fmt(unitPrice)}</td>
          <td style="text-align:right;font-weight:bold">${fmt(lineTotal)}</td>
        </tr>`;
      if (hasDiscount) {
        const discountText = item.discountPercent
          ? `-${item.discountPercent}%`
          : `-${fmt(item.discountAmount)} ${esc(currency)}`;
        row += `
        <tr>
          <td colspan="4" style="font-size:10px;color:#555;padding-left:6px;padding-bottom:2px">
            &#9492; Remise : ${esc(discountText)}
          </td>
        </tr>`;
      }
      return row;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Ticket de caisse</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: 'Consolas', 'Courier New', monospace; font-size: 11px; color: #000; width: 80mm; padding: 4px 8px; }
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
    <h2>${esc(header)}</h2>
    ${address ? `<div>${esc(address)}</div>` : ''}
    ${phone ? `<div>Tel: ${esc(phone)}</div>` : ''}
    ${email ? `<div>Email: ${esc(email)}</div>` : ''}
    ${companySiret ? `<div style="font-size:10px;color:#444">RCCM/SIRET: ${esc(companySiret)}</div>` : ''}
    ${companyTva ? `<div style="font-size:10px;color:#444">TVA/IFU: ${esc(companyTva)}</div>` : ''}
    <div style="margin-top:6px;border-top:1px dashed #000;padding-top:4px;font-weight:bold">TICKET : ${esc(tx?.transactionNumber || tx?.id || '')}</div>
    <div>Date : ${esc(date)}</div>
    ${cashierName ? `<div>Caissier : ${esc(cashierName)}</div>` : ''}
  </div>
  <div class="dash"></div>
  <table class="items-table">
    <thead>
      <tr>
        <th style="text-align:left">D&eacute;signation</th>
        <th style="text-align:center">Qt&eacute;</th>
        <th style="text-align:right">P.U.</th>
        <th style="text-align:right">Montant</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
  <div style="font-size:10px;color:#555;margin-top:4px;text-align:right">
    ${cart.length} article(s) &bull; ${totalUnits} unit&eacute;(s)
  </div>
  <div class="dash"></div>
  <table>
    <tr><td>Sous-total</td><td style="text-align:right">${fmt(subtotal)} ${esc(currency)}</td></tr>
    ${globalDiscount > 0 ? `<tr><td>Remise globale</td><td style="text-align:right">-${fmt(globalDiscount)} ${esc(currency)}</td></tr>` : ''}
    <tr style="font-size:13px;font-weight:bold"><td>TOTAL</td><td style="text-align:right">${fmt(total)} ${esc(currency)}</td></tr>
  </table>
  <div class="dash"></div>
  <table>
    ${paymentsList.map((p: any) => `<tr><td>Pay&eacute; en (${esc(p.method || paymentMethod)})</td><td style="text-align:right">${fmt(p.amount || 0)} ${esc(currency)}</td></tr>`).join('')}
    ${cashAmount > 0 && paymentMethod !== 'Mobile Money' ? `<tr><td>Esp&egrave;ces re&ccedil;ues</td><td style="text-align:right">${fmt(cashAmount)} ${esc(currency)}</td></tr>` : ''}
    ${changeAmount > 0 ? `<tr style="font-weight:bold"><td>Monnaie rendue</td><td style="text-align:right">${fmt(changeAmount)} ${esc(currency)}</td></tr>` : ''}
  </table>
  <div class="center" style="margin-top:10px;border-top:1px dashed #000;padding-top:6px">
    ${esc(ticketMessage)}
  </div>
</body>
</html>`;
}

/**
 * Imprime le ticket dans une iframe cachée dédiée (jamais bloquée comme un popup).
 * Résout après l'envoi à l'imprimante, rejette si le ticket est vide/invalide.
 *
 * L'iframe est positionnée hors écran (jamais display:none : certains navigateurs
 * refusent d'imprimer un cadre non rendu — autre source classique de page blanche).
 */
export function printReceiptViaIframe(data: ReceiptPrintData): Promise<void> {
  const html = buildReceiptHtml(data);
  if (!html) {
    return Promise.reject(new Error('Ticket invalide : panier vide ou total nul (impression refusée).'));
  }

  return new Promise<void>((resolve, reject) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('title', 'Impression ticket de caisse');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      iframe.style.width = '80mm';
      iframe.style.height = '100px';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const cleanup = () => {
        window.removeEventListener('afterprint', cleanup);
        // Laisse le dialogue d'impression partir avant de retirer le cadre.
        setTimeout(() => {
          try {
            iframe.remove();
          } catch {
            /* ignore */
          }
        }, 1500);
      };
      window.addEventListener('afterprint', cleanup);
      // Filet si afterprint ne se déclenche pas.
      setTimeout(cleanup, 15000);

      const doc = iframe.contentDocument;
      if (!doc) {
        cleanup();
        reject(new Error("Impression impossible : cadre d'impression inaccessible."));
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();

      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        reject(new Error("Impression impossible : fenêtre d'impression inaccessible."));
        return;
      }

      // Imprime après chargement + un frame peint : jamais de snapshot vide.
      let printed = false;
      const doPrint = () => {
        if (printed) return;
        printed = true;
        try {
          requestAnimationFrame(() => {
            setTimeout(() => {
              try {
                win.focus();
                win.print();
                resolve();
              } catch (e: any) {
                cleanup();
                reject(e instanceof Error ? e : new Error(String(e)));
              }
            }, 120);
          });
        } catch (e: any) {
          cleanup();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      };

      // doc.write() + close() est synchrone : le load peut déjà être passé.
      if (doc.readyState === 'complete') {
        doPrint();
      } else {
        win.addEventListener('load', doPrint, { once: true });
        // Filet si l'événement load ne vient jamais.
        setTimeout(() => {
          if (doc.readyState === 'complete') doPrint();
        }, 1000);
      }
    } catch (e: any) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
