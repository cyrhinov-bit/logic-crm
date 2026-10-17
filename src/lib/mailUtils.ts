import toast from 'react-hot-toast';
import type { Client, Quote, AppSettings, Prestation } from '../context/AppContext';
import { platform } from '../platform';
import type { MailComposeResult } from '../platform';
import { generateQuotePdf, ensureDevisPdfAssets } from './pdfUtils';

/** Convertit un Blob en base64 brut (sans le préfixe "data:...;base64,"). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error('Lecture du PDF impossible.'));
      reader.readAsDataURL(blob);
    } catch (err) {
      reject(err);
    }
  });
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAmount(n: number): string {
  return `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;
}

function formatDateFr(value?: string): string {
  if (!value) return '';
  const parts = value.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return value;
}

export interface QuoteMailContent {
  to: string;
  subject: string;
  body: string;
  htmlBody: string;
  filename: string;
}

/** Construit le destinataire, l'objet, le corps texte ET HTML du mail de devis. */
export function buildQuoteMailContent(quote: Quote, client: Client | undefined, settings: AppSettings): QuoteMailContent {
  const companyName = settings.companyName || 'HINOV GROUP';
  const clientLabel = client?.company || client?.name || 'Madame, Monsieur';
  const clientEmail = (client?.email || '').trim();
  const dateFr = formatDateFr(quote.date);
  const validity = quote.validUntil
    ? `Valable jusqu'au ${formatDateFr(quote.validUntil)}`
    : `Valable ${settings.defaultValidity || 30} jours`;
  const subject = `Devis N° ${quote.quoteNumber}${quote.subject ? ` — ${quote.subject}` : ''}`;
  const filename = `Devis_${quote.quoteNumber}.pdf`;

  // --- Corps texte brut (secours / mode mailto) ---
  const textLines: string[] = [
    `Bonjour${client?.contact ? ` ${client.contact}` : ''},`,
    '',
    `Veuillez trouver ci-joint notre devis N° ${quote.quoteNumber}${quote.subject ? ` concernant : ${quote.subject}` : ''}.`,
    '',
    `• Montant total : ${formatAmount(quote.total)}`,
    `• Date d'émission : ${dateFr || '-'}`,
    `• Validité : ${validity}`,
  ];
  if (quote.paymentTerms) textLines.push(`• Conditions de règlement : ${quote.paymentTerms}`);
  if (quote.notes) textLines.push('', quote.notes);
  textLines.push(
    '',
    'Nous restons à votre disposition pour toute information complémentaire.',
    '',
    'Cordialement,',
    quote.signatoryName || companyName,
    quote.signatoryRole || '',
    `${companyName}${settings.companyPhone ? ` — ${settings.companyPhone}` : ''}${settings.companyEmail ? ` — ${settings.companyEmail}` : ''}`,
  );
  const body = textLines.filter(l => l !== undefined).join('\n');

  // --- Corps HTML ---
  const paymentRow = quote.paymentTerms
    ? `<tr><td style="padding:6px 0;color:#64748B;">Conditions de règlement</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1E293B;">${escapeHtml(quote.paymentTerms)}</td></tr>`
    : '';
  const notesBlock = quote.notes
    ? `<div style="margin-top:16px;padding:12px 14px;background:#F8FAFC;border-left:3px solid #22A06B;border-radius:4px;color:#334155;font-size:13px;">${escapeHtml(quote.notes)}</div>`
    : '';
  const htmlBody = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1E293B;line-height:1.55;max-width:640px;">
  <p>Bonjour${client?.contact ? ` ${escapeHtml(client.contact)}` : ''},</p>
  <p>Veuillez trouver ci-joint notre devis <strong>N° ${escapeHtml(quote.quoteNumber)}</strong>${quote.subject ? ` concernant : <em>${escapeHtml(quote.subject)}</em>` : ''}.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #E2E8F0;border-radius:6px;">
    <tbody>
      <tr style="background:#E0F2F1;"><td style="padding:8px 12px;font-weight:700;color:#1F3A5F;">Récapitulatif</td><td style="padding:8px 12px;text-align:right;font-weight:700;color:#1F3A5F;">${escapeHtml(clientLabel)}</td></tr>
      <tr><td style="padding:6px 12px;color:#64748B;">Montant total</td><td style="padding:6px 12px;text-align:right;font-weight:700;color:#1F3A5F;">${escapeHtml(formatAmount(quote.total))}</td></tr>
      <tr style="background:#F8FAFC;"><td style="padding:6px 12px;color:#64748B;">Date d'émission</td><td style="padding:6px 12px;text-align:right;font-weight:600;">${escapeHtml(dateFr || '-')}</td></tr>
      <tr><td style="padding:6px 12px;color:#64748B;">Validité</td><td style="padding:6px 12px;text-align:right;font-weight:600;">${escapeHtml(validity)}</td></tr>
      ${paymentRow}
    </tbody>
  </table>
  ${notesBlock}
  <p>Nous restons à votre disposition pour toute information complémentaire.</p>
  <p style="margin-bottom:2px;">Cordialement,</p>
  <p style="margin:0;font-weight:700;color:#1F3A5F;">${escapeHtml(quote.signatoryName || companyName)}</p>
  ${quote.signatoryRole ? `<p style="margin:0;color:#64748B;font-size:13px;">${escapeHtml(quote.signatoryRole)}</p>` : ''}
  <p style="margin:10px 0 0;color:#64748B;font-size:12px;border-top:1px solid #E2E8F0;padding-top:8px;">
    ${escapeHtml(companyName)}${settings.companyPhone ? ` — Tél : ${escapeHtml(settings.companyPhone)}` : ''}${settings.companyEmail ? ` — ${escapeHtml(settings.companyEmail)}` : ''}
  </p>
</div>`.trim();

  return { to: clientEmail, subject, body, htmlBody, filename };
}

/**
 * Génère le PDF du devis puis l'envoie par e-mail depuis la boîte de l'utilisateur.
 * Ne bloque jamais : retourne toujours un résultat exploitable.
 */
export async function composeQuoteMail(
  quote: Quote,
  client: Client | undefined,
  settings: AppSettings,
  prestations?: Prestation[],
): Promise<MailComposeResult & { filename?: string }> {
  try {
    await ensureDevisPdfAssets();
    const blob = generateQuotePdf(quote, client, settings, prestations);
    const base64 = await blobToBase64(blob);
    const content = buildQuoteMailContent(quote, client, settings);
    const attachments = [{ filename: content.filename, base64, mimeType: 'application/pdf' }];

    // 1) Boîte de l'utilisateur (SMTP local) : envoi direct depuis SA propre adresse.
    try {
      const smtpStatus = await platform.mail.smtp.getStatus();
      if (smtpStatus.configured) {
        const smtpResult = await platform.mail.smtp.send({
          to: content.to,
          subject: content.subject,
          body: content.body,
          htmlBody: content.htmlBody,
          attachments,
        });
        if (smtpResult.ok || smtpResult.errorCode !== 'NOT_CONFIGURED') {
          return { ...smtpResult, filename: content.filename };
        }
      }
    } catch { /* SMTP local indisponible → étape suivante */ }

    // 2) Aucune boîte configurée : sur l'application de bureau, on invite l'utilisateur à
    //    configurer SA boîte (aucun envoi depuis une autre adresse).
    if (platform.isDesktop) {
      return {
        ok: false,
        mode: 'smtp',
        errorCode: 'NOT_CONFIGURED',
        error: "Aucune boîte d'envoi configurée. Ouvrez « Devis → Paramètres envoi devis par e-mail » "
          + "et renseignez le mot de passe de votre boîte pour envoyer vos devis.",
        filename: content.filename,
      };
    }

    // 3) Repli (mode navigateur uniquement) : ouvre la messagerie par défaut, PDF dans le presse-papiers.
    const result = await platform.mail.openInDefaultMailApp({
      to: content.to,
      subject: content.subject,
      body: content.body,
      htmlBody: content.htmlBody,
      attachments,
      send: false,
    });

    return { ...result, filename: content.filename };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Erreur lors de la préparation du mail.' };
  }
}

/**
 * Envoi d'un devis par mail avec retours utilisateur (toasts).
 * Gère le cas "client sans e-mail" et le repli navigateur (mailto sans pièce jointe).
 */
export async function sendQuoteByMail(
  quote: Quote,
  client: Client | undefined,
  settings: AppSettings,
  prestations?: Prestation[],
): Promise<boolean> {
  const missingEmail = !(client?.email || '').trim();
  const toastId = toast.loading('Préparation du devis et envoi de l’e-mail...');
  const result = await composeQuoteMail(quote, client, settings, prestations);
  toast.dismiss(toastId);

  if (!result.ok) {
    toast.error(result.error || "Impossible d'envoyer l'e-mail.", { duration: 9000 });
    return false;
  }

  const emailWarning = missingEmail
    ? " ⚠️ Ce client n'a pas d'adresse e-mail : renseignez le destinataire."
    : '';

  if (result.mode === 'smtp') {
    toast.success(
      `Le devis a été envoyé par e-mail, avec le PDF joint.${emailWarning}`,
      { duration: 9000 }
    );
  } else if (result.mode === 'mailto' && result.copiedToClipboard) {
    toast.success(
      `Votre Outlook est ouvert. Le PDF est déjà dans le presse-papiers : faites Ctrl+V pour le joindre.${emailWarning}`,
      { duration: 11000 }
    );
  } else if (result.mode === 'mailto' && result.filePath) {
    toast.success(
      `Votre Outlook est ouvert. Joignez le PDF enregistré dans : ${result.filePath}${emailWarning}`,
      { duration: 11000 }
    );
  } else if (result.mode === 'mailto') {
    toast.success(
      `Votre application de messagerie est ouverte. Pensez à joindre le PDF du devis.${emailWarning}`,
      { duration: 10000 }
    );
  } else {
    toast.success('Devis prêt dans Outlook. Vérifiez le message puis cliquez sur Envoyer.', { duration: 6000 });
  }
  return true;
}
