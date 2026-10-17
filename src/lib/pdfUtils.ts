import { jsPDF } from 'jspdf';
import type { Quote, Sale, Client, AppSettings, ActivityReport, WeeklyReport, User, Prospect, Service, Category, Invoice, InvoicePayment } from '../context/AppContext';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function drawHeader(doc: jsPDF, settings: AppSettings, x: number, y: number): number {
  if (settings.headerLogoBase64) {
    try {
      const isPng = settings.headerLogoBase64.includes('image/png');
      const format = isPng ? 'PNG' : 'JPEG';
      doc.addImage(settings.headerLogoBase64, format, x, y, 60, 20);
      return y + 26;
    } catch {
      try {
        doc.addImage(settings.headerLogoBase64, 'JPEG', x, y, 60, 20);
        return y + 26;
      } catch {
        try {
          doc.addImage(settings.headerLogoBase64, 'PNG', x, y, 60, 20);
          return y + 26;
        } catch {
          // fallback to text
        }
      }
    }
  }
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.companyName || 'Entreprise', x, y + 6);
  return y + 12;
}

const REPORT_COLOR: [number, number, number] = [0, 150, 136];
const REPORT_LIGHT: [number, number, number] = [224, 242, 241];
const REPORT_GREY: [number, number, number] = [240, 244, 247];
const REPORT_DARK: [number, number, number] = [30, 34, 42];
const REPORT_MUTED: [number, number, number] = [110, 120, 130];


function drawExpHeader(doc: jsPDF, author: User | null | undefined, weekLabel: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const headerH = 34;

  doc.setFillColor(...REPORT_COLOR);
  doc.rect(0, 0, pageW, 8, 'F');
  doc.rect(0, 0, pageW, headerH + 8, 'F');

  const cx = margin;
  const cy = 8 + headerH / 2;
  const r = 12;

  if (author?.photo) {
    try {
      doc.saveGraphicsState();
      doc.circle(cx, cy, r, 'S');
      doc.clip();
      doc.addImage(author.photo, 'PNG', cx - r, cy - r, r * 2, r * 2);
      doc.restoreGraphicsState();
    } catch {
      doc.setFillColor(255, 255, 255);
      doc.circle(cx, cy, r, 'F');
      doc.setFillColor(...REPORT_COLOR);
      doc.circle(cx, cy, r, 'S');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      const initials = (author?.name || '?')
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      doc.text(initials, cx, cy + 4, { align: 'center' });
    }
  } else {
    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, r, 'F');
    doc.setFillColor(...REPORT_COLOR);
    doc.circle(cx, cy, r, 'S');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    const initials = (author?.name || '?')
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    doc.text(initials, cx, cy + 4, { align: 'center' });
  }

  const tx = cx + r + 8;
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(author?.name || 'Expéditeur', tx, cy - 4);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(author?.role || '', tx, cy + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('RAPPORT HEBDOMADAIRE', pageW - margin, cy - 4, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(weekLabel, pageW - margin, cy + 4, { align: 'right' });

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  doc.line(margin, headerH + 8 + 2, pageW - margin, headerH + 8 + 2);

  return headerH + 8 + 18;
}

function drawKpiCards(doc: jsPDF, kpis: Record<string, number>, yStart: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const gap = 5;
  const cols = 4;
  const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  const cardH = 22;
  let y = yStart;

  const defs: { key: string; label: string }[] = [
    { key: 'prospectsCrees', label: 'PROSPECTS CRÉÉS' },
    { key: 'prospectsConvertis', label: 'CONVERSIONS' },
    { key: 'relancesTerminees', label: 'RELANCES TERMINÉES' },
    { key: 'appels', label: 'APPELS' },
  ];

  defs.forEach((d, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (cardW + gap);
    const yy = y + row * (cardH + gap);

    doc.setFillColor(...REPORT_LIGHT);
    doc.roundedRect(x, yy, cardW, cardH, 2, 2, 'F');
    doc.setFillColor(...REPORT_COLOR);
    doc.rect(x, yy, 2.5, cardH, 'F');

    doc.setTextColor(...REPORT_COLOR);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(String(kpis[d.key] || 0), x + 7, yy + 10);

    doc.setTextColor(...REPORT_MUTED);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(d.label, x + 7, yy + 17);
  });

  return y + (rowsFor(defs.length, cols) * (cardH + gap)) + 4;
}

function rowsFor(count: number, cols: number) {
  return Math.ceil(count / cols);
}

function drawSynthesisTable(doc: jsPDF, kpis: Record<string, number>, yStart: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = yStart;

  const rows: { label: string; value: string }[] = [
    { label: 'Taux de conversion prospects', value: `${Math.round(((kpis.prospectsConvertis || 0) / (kpis.prospectsCrees || 1)) * 100)}%` },
    { label: 'Relances terminées', value: String(kpis.relancesTerminees || 0) },
    { label: 'Emails envoyés', value: String(kpis.emails || 0) },
    { label: 'Réunions et démos', value: String((kpis.reunions || 0) + (kpis.demos || 0)) },
  ];

  doc.setFillColor(...REPORT_COLOR);
  doc.rect(margin, y, contentW, 8, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('SYNTHÈSE DE LA SEMAINE', margin + 4, y + 5.5);
  y += 8;

rows.forEach((row, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(...REPORT_GREY);
    }
    doc.rect(margin, y, contentW, 8, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...REPORT_DARK);
    doc.text(row.label, margin + 4, y + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.text(row.value, pageW - margin - 4, y + 5.5, { align: 'right' });
    y += 8;
  });

  return y + 8;
}

export function buildWeeklyReportPdf(
  report: WeeklyReport,
  dailyReports: ActivityReport[],
  kpis: Record<string, number>,
  author: User | null | undefined,
  settings: AppSettings,
  weeklyProspects: Prospect[] = [],
  services: Service[] = [],
  categories: Category[] = []
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;

  const dayNames: Record<string, string> = {
    Mon: 'Lundi', Tue: 'Mardi', Wed: 'Mercredi', Thu: 'Jeudi', Fri: 'Vendredi', Sat: 'Samedi', Sun: 'Dimanche',
  };
  const start = new Date(report.weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmtDay = (d: Date) => `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  const weekLabel = `Semaine du ${fmtDay(start)} au ${fmtDay(end)}`;

  let y = drawExpHeader(doc, author, weekLabel);

  const companyLine = settings.companyName ? (settings.companyAddress ? `${settings.companyName} - ${settings.companyAddress}` : settings.companyName) : '';
  if (companyLine) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...REPORT_MUTED);
    doc.text(companyLine, margin, y);
    y += 6;
  }

  // KPI cards
  y = drawKpiCards(doc, kpis, y);

  // Synthesis table
  y = drawSynthesisTable(doc, kpis, y);

  // Daily detail
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...REPORT_COLOR);
  doc.text('1. RAPPORT D\'ACTIVITÉ', margin, y);
  doc.setDrawColor(...REPORT_COLOR);
  doc.setLineWidth(0.6);
  doc.line(margin, y + 2.5, pageW - margin, y + 2.5);
  y += 9;

  const sorted = [...dailyReports].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...REPORT_MUTED);
    doc.text('Aucun rapport journalier pour cette période.', margin, y + 4);
    y += 12;
  }

  for (const r of sorted) {
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
    }
    const d = new Date(r.date + 'T00:00:00');
    const dayLabel = `${dayNames[d.toLocaleDateString('en-US', { weekday: 'short' })] || d.toLocaleDateString('fr-FR')} ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}`;

    doc.setFillColor(...REPORT_COLOR);
    doc.roundedRect(margin, y, contentW, 9, 1.5, 1.5, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`${dayLabel} — ${r.type}`, margin + 4, y + 6);
    y += 13;

    const sections: { label: string; value: string }[] = [
      { label: 'Réalisations', value: r.realisations },
      { label: 'Difficultés', value: r.difficultes },
      { label: 'Remarques', value: r.remarques },
    ];

    for (const s of sections) {
      if (!s.value) continue;
      if (y > pageH - 40) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...REPORT_COLOR);
      doc.text(s.label, margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...REPORT_DARK);
      const lines = doc.splitTextToSize(s.value, contentW);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 4;
    }
    y += 2;
  }

  // Prospection detail
  if (weeklyProspects.length > 0) {
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
    } else {
      y += 10;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...REPORT_COLOR);
    doc.text('2. RAPPORT DE PROSPECTION', margin, y);
    doc.setDrawColor(...REPORT_COLOR);
    doc.setLineWidth(0.6);
    doc.line(margin, y + 2.5, pageW - margin, y + 2.5);
    y += 9;

    const groupedProspects: Record<string, Prospect[]> = {};
    for (const p of weeklyProspects) {
      const d = p.createdAt ? p.createdAt.split('T')[0] : '';
      if (d) {
        if (!groupedProspects[d]) groupedProspects[d] = [];
        groupedProspects[d].push(p);
      }
    }
    const sortedDates = Object.keys(groupedProspects).sort();

    for (const dStr of sortedDates) {
      const d = new Date(dStr + 'T00:00:00');
      const dayLabel = `${dayNames[d.toLocaleDateString('en-US', { weekday: 'short' })] || d.toLocaleDateString('fr-FR')} ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}`;
      const dayProspects = groupedProspects[dStr];

      if (y > pageH - 30) {
        doc.addPage();
        y = margin;
      }
      doc.setFillColor(...REPORT_COLOR);
      doc.roundedRect(margin, y, contentW, 9, 1.5, 1.5, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(`${dayLabel} — ${dayProspects.length} prospect${dayProspects.length > 1 ? 's' : ''}`, margin + 4, y + 6);
      y += 13;

      for (const p of dayProspects) {
        if (y > pageH - 40) {
          doc.addPage();
          y = margin;
        }
        
        const serviceName = services.find(s => s.id === p.serviceId)?.name || '-';
        const categoryName = categories.find(c => c.id === p.categoryId)?.name || '-';
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...REPORT_DARK);
        doc.text(`${p.prospectNumber} - ${p.name}`, margin, y);
        y += 5;
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        const details = [
          `Type: ${p.type}`,
          `Société: ${p.company || '-'}`,
          `Téléphone: ${p.phone || '-'}`,
          `Email: ${p.email || '-'}`,
          `Adresse: ${p.address || '-'}`,
          `Ville: ${p.city || '-'}`,
          `Service: ${serviceName}`,
          `Catégorie: ${categoryName}`,
          `Niveau d'intérêt: ${p.interestLevel}`,
          `Source: ${p.source || '-'}`,
          `Statut: ${p.status}`
        ];
        
        for (const line of details) {
          if (y > pageH - 20) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin + 4, y);
          y += 5;
        }
        
        if (p.need || p.comments) {
          y += 2;
          if (p.need) {
             if (y > pageH - 25) { doc.addPage(); y = margin; }
             doc.setFont('helvetica', 'bold');
             doc.text('Besoin exprimé:', margin + 4, y);
             doc.setFont('helvetica', 'normal');
             y += 5;
             const lines = doc.splitTextToSize(p.need, contentW - 8);
             doc.text(lines, margin + 8, y);
             y += lines.length * 5;
          }
          if (p.comments) {
             y += 2;
             if (y > pageH - 25) { doc.addPage(); y = margin; }
             doc.setFont('helvetica', 'bold');
             doc.text('Commentaires:', margin + 4, y);
             doc.setFont('helvetica', 'normal');
             y += 5;
             const lines = doc.splitTextToSize(p.comments, contentW - 8);
             doc.text(lines, margin + 8, y);
             y += lines.length * 5;
          }
        }
        
        y += 4;
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, y, pageW - margin, y);
        y += 6;
      }
    }
    
    // Total prospects
    if (y > pageH - 25) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...REPORT_DARK);
    doc.text(`TOTAL : ${weeklyProspects.length} prospect${weeklyProspects.length > 1 ? 's' : ''} créé${weeklyProspects.length > 1 ? 's' : ''}`, margin, y);
    y += 10;
  }


  // Signature
  if (y > pageH - 40) {
    doc.addPage();
    y = margin;
  }
  y = pageH - 32;
  doc.setDrawColor(170, 170, 170);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin, y, margin + 60, y);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...REPORT_DARK);
  doc.text(`Signature de ${author?.name || 'Expéditeur'}`, margin, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...REPORT_MUTED);
  doc.text(`Rapport généré le ${new Date().toLocaleDateString('fr-FR')} — ${settings.companyName || ''}`, margin, pageH - 8);

  return doc;
}

export function generateWeeklyReportPdf(
  report: WeeklyReport,
  dailyReports: ActivityReport[],
  kpis: Record<string, number>,
  author: User | null | undefined,
  settings: AppSettings,
  weeklyProspects: Prospect[] = [],
  services: Service[] = [],
  categories: Category[] = []
) {
  const doc = buildWeeklyReportPdf(report, dailyReports, kpis, author, settings, weeklyProspects, services, categories);
  const blob = doc.output('blob');
  downloadBlob(blob, `Rapport_Hebdomadaire_${report.weekStart}.pdf`);
}

export interface DailyReportInput {
  type: 'Activité' | 'Prospection';
  date: string;
  realisations: string;
  difficultes: string;
  remarques: string;
}

export function buildDailyReportPdf(
  report: DailyReportInput,
  author: User | null | undefined,
  settings: AppSettings
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;

  const start = new Date(report.date + 'T00:00:00');
  const dayLabel = `${start.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`;
  const weekLabel = `Rapport du ${dayLabel}`;

  let y = drawExpHeader(doc, author, weekLabel);

  const companyLine = settings.companyName ? (settings.companyAddress ? `${settings.companyName} - ${settings.companyAddress}` : settings.companyName) : '';
  if (companyLine) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...REPORT_MUTED);
    doc.text(companyLine, margin, y);
    y += 6;
  }

  // Type badge
  doc.setFillColor(...REPORT_COLOR);
  doc.roundedRect(margin, y, 40, 8, 1.5, 1.5, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`RAPPORT ${report.type.toUpperCase()}`, margin + 4, y + 5.5);
  y += 14;

  const sections: { label: string; value: string }[] = [
    { label: 'Réalisations du jour', value: report.realisations },
    { label: 'Difficultés rencontrées', value: report.difficultes },
    { label: 'Remarques / observations', value: report.remarques },
  ];

  for (const s of sections) {
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFillColor(...REPORT_LIGHT);
    doc.roundedRect(margin, y, contentW, 9, 1.5, 1.5, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...REPORT_COLOR);
    doc.text(s.label, margin + 4, y + 6);
    y += 14;

    if (s.value) {
      if (y > pageH - 40) {
        doc.addPage();
        y = margin;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...REPORT_DARK);
      const lines = doc.splitTextToSize(s.value, contentW) as string[];
      doc.text(lines, margin, y);
      y += lines.length * 5 + 4;
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...REPORT_MUTED);
      doc.text('— Aucune information renseignée —', margin, y);
      y += 8;
    }
    y += 4;
  }

  // Signature
  if (y > pageH - 40) {
    doc.addPage();
    y = margin;
  }
  y = Math.max(y + 12, pageH - 48);
  if (y > pageH - 40) y = pageH - 40;
  doc.setDrawColor(170, 170, 170);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin, y, margin + 60, y);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...REPORT_DARK);
  doc.text(`Signature de ${author?.name || 'Expéditeur'}`, margin, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...REPORT_MUTED);
  doc.text(`Rapport généré le ${new Date().toLocaleDateString('fr-FR')} — ${settings.companyName || ''}`, margin, pageH - 8);

  return doc;
}

export function generateDailyReportPdf(
  report: DailyReportInput,
  author: User | null | undefined,
  settings: AppSettings
) {
  const doc = buildDailyReportPdf(report, author, settings);
  const blob = doc.output('blob');
  downloadBlob(blob, `Rapport_Journalier_${report.date}.pdf`);
}

function parseHexColor(hex: string): [number, number, number] {
  const clean = (hex || '#009688').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (isNaN(num)) return [0, 150, 136];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function mixWithWhite(rgb: [number, number, number], ratio: number): [number, number, number] {
  return rgb.map(c => Math.round(c + (255 - c) * ratio)) as [number, number, number];
}

function formatAmount(n: number): string {
  return Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
}

function formatDateFr(d: string): string {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function cleanPdfText(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2022\u25E6\u2023]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[^\x00-\xFF]/g, '');
}

function drawAutoText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, baseSize: number, align: 'left' | 'right' = 'right') {
  let size = baseSize;
  doc.setFontSize(size);
  const clean = cleanPdfText(text);
  while (size > 5 && doc.getTextWidth(clean) > maxWidth) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  doc.text(clean, x, y, { align });
}

/** Texte garanti sans débordement : réduit la taille puis tronque avec "...". */
function fitText(doc: jsPDF, text: string, maxW: number, baseSize: number, minSize = 6.5): { text: string; size: number } {
  const clean = cleanPdfText(text);
  let size = baseSize;
  doc.setFontSize(size);
  while (size > minSize && doc.getTextWidth(clean) > maxW) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  let t = clean;
  while (t.length > 7 && doc.getTextWidth(t) > maxW) {
    t = t.slice(0, -4) + '...';
  }
  return { text: t, size };
}

// ====================== DEVIS PDF — design moderne HINOV (devis.jpeg) ======================
// Reproduction du visuel couleur : bannière photo, titre + badge client navy,
// barre d'infos à pastilles, tableau 6 colonnes aux filets couleur, cartes de
// totaux, signature en pointillés, 3 blocs bas à icônes, pied de page navy.
// Style unique pour tous les devis.
import devisBannerUrl from '../assets/devis_banner.jpg';
import devisCachetUrl from '../assets/devis_cachet.jpg';

const devisPdfAssets: { banner?: string; cachet?: string } = {};
let devisPdfAssetsPromise: Promise<void> | null = null;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new Error('read'));
      fr.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

/** Précharge (une fois) bannière + cachet. À appeler avant generateQuotePdf. */
export function ensureDevisPdfAssets(): Promise<void> {
  if (!devisPdfAssetsPromise) {
    devisPdfAssetsPromise = (async () => {
      try {
        const res = await fetch(devisBannerUrl);
        if (res.ok) devisPdfAssets.banner = await blobToDataUrl(await res.blob());
      } catch { /* bannière ignorée si inaccessible */ }
      try {
        const res = await fetch(devisCachetUrl);
        if (res.ok) devisPdfAssets.cachet = await blobToDataUrl(await res.blob());
      } catch { /* cachet ignoré si inaccessible */ }
    })();
  }
  return devisPdfAssetsPromise;
}

/** 123456 -> "123 456" (sans devise, comme le modèle). */
function formatMontant(n: number): string {
  return Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 260000 -> "DEUX CENT SOIXANTE MILLE" (majuscules, sans devise). */
function nombreEnLettres(n: number): string {
  const N = Math.round(Math.abs(n || 0));
  if (N === 0) return 'ZÉRO';
  const U = ['', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF', 'DIX', 'ONZE', 'DOUZE', 'TREIZE', 'QUATORZE', 'QUINZE', 'SEIZE', 'DIX-SEPT', 'DIX-HUIT', 'DIX-NEUF'];
  const T = ['', 'DIX', 'VINGT', 'TRENTE', 'QUARANTE', 'CINQUANTE', 'SOIXANTE', 'SOIXANTE', 'QUATRE-VINGT', 'QUATRE-VINGT'];
  const under100 = (x: number): string => {
    if (x < 20) return U[x];
    const t = Math.floor(x / 10);
    const r = x % 10;
    if (t === 7 || t === 9) {
      const rest = x - (t === 7 ? 60 : 80);
      if (t === 7 && rest === 11) return 'SOIXANTE ET ONZE';
      return T[t] + '-' + U[rest];
    }
    if (r === 0) return t === 8 ? 'QUATRE-VINGTS' : T[t];
    if (r === 1 && t !== 8) return T[t] + ' ET UN';
    return T[t] + '-' + U[r];
  };
  const under1000 = (x: number): string => {
    const c = Math.floor(x / 100);
    const r = x % 100;
    if (c === 0) return under100(r);
    let s = c > 1 ? U[c] + ' CENT' : 'CENT';
    if (r === 0) {
      if (c > 1) s += 'S';
      return s;
    }
    return s + ' ' + under100(r);
  };
  const parts: string[] = [];
  const M = Math.floor(N / 1000000);
  const restM = N % 1000000;
  const K = Math.floor(restM / 1000);
  const rest = restM % 1000;
  if (M > 0) parts.push(M === 1 ? 'UN MILLION' : under1000(M) + ' MILLIONS');
  if (K > 0) parts.push(K === 1 ? 'MILLE' : under1000(K) + ' MILLE');
  if (rest > 0) parts.push(under1000(rest));
  return parts.join(' ');
}

// ---- Palette du modèle ----
const DV_NAVY: [number, number, number] = [31, 58, 95];
const DV_GREEN: [number, number, number] = [34, 160, 107];
const DV_PURPLE: [number, number, number] = [124, 58, 237];
const DV_ORANGE: [number, number, number] = [245, 158, 11];
const DV_BLUE: [number, number, number] = [37, 99, 235];
const DV_BG: [number, number, number] = [241, 245, 249];
const DV_GRAY: [number, number, number] = [100, 116, 139];
const DV_LINE: [number, number, number] = [226, 232, 240];
const DV_DARK: [number, number, number] = [30, 34, 42];
const DV_WHITE: [number, number, number] = [255, 255, 255];

/** Pastille couleur + glyphe blanc simplifié. */
function dvBadge(doc: jsPDF, cx: number, cy: number, r: number, color: [number, number, number], glyph: 'cal' | 'user' | 'receipt' | 'coins' | 'pct' | 'doc' | 'bank', glyphColor: [number, number, number] = DV_WHITE) {
  doc.setFillColor(...color);
  doc.circle(cx, cy, r, 'F');
  doc.setDrawColor(...glyphColor);
  doc.setFillColor(...glyphColor);
  doc.setLineWidth(0.5);
  const u = r / 5; // unité
  if (glyph === 'cal') {
    doc.rect(cx - 2 * u, cy - 1.2 * u, 4 * u, 3.4 * u, 'F');
    doc.setFillColor(...color);
    doc.rect(cx - 2 * u, cy - 1.2 * u, 4 * u, 1 * u, 'F');
    doc.setFillColor(...glyphColor);
    doc.rect(cx - 1.2 * u, cy - 1.8 * u, 0.7 * u, 1.4 * u, 'F');
    doc.rect(cx + 0.5 * u, cy - 1.8 * u, 0.7 * u, 1.4 * u, 'F');
  } else if (glyph === 'user') {
    doc.circle(cx, cy - 1 * u, 1.3 * u, 'F');
    doc.ellipse(cx, cy + 1.8 * u, 2.1 * u, 1.5 * u, 'F');
  } else if (glyph === 'receipt') {
    doc.rect(cx - 1.7 * u, cy - 2.2 * u, 3.4 * u, 4.4 * u, 'F');
    doc.setFillColor(...color);
    doc.triangle(cx + 0.2 * u, cy - 2.2 * u, cx + 1.7 * u, cy - 2.2 * u, cx + 1.7 * u, cy - 0.7 * u, 'F');
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    doc.line(cx - 1 * u, cy - 0.5 * u, cx + 1 * u, cy - 0.5 * u);
    doc.line(cx - 1 * u, cy + 0.6 * u, cx + 1 * u, cy + 0.6 * u);
  } else if (glyph === 'coins') {
    doc.ellipse(cx, cy - 1.3 * u, 1.9 * u, 0.9 * u, 'F');
    doc.ellipse(cx, cy, 1.9 * u, 0.9 * u, 'F');
    doc.ellipse(cx, cy + 1.3 * u, 1.9 * u, 0.9 * u, 'F');
  } else if (glyph === 'pct') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(r * 1.15);
    doc.setTextColor(...glyphColor);
    doc.text('%', cx, cy + r * 0.42, { align: 'center' });
  } else if (glyph === 'doc') {
    doc.rect(cx - 1.7 * u, cy - 2.2 * u, 3.4 * u, 4.4 * u, 'F');
    doc.setFillColor(...color);
    doc.triangle(cx + 0.2 * u, cy - 2.2 * u, cx + 1.7 * u, cy - 2.2 * u, cx + 1.7 * u, cy - 0.7 * u, 'F');
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    doc.line(cx - 1 * u, cy - 0.6 * u, cx + 0.4 * u, cy - 0.6 * u);
    doc.line(cx - 1 * u, cy + 0.5 * u, cx + 0.4 * u, cy + 0.5 * u);
    doc.line(cx - 1 * u, cy + 1.6 * u, cx - 0.2 * u, cy + 1.6 * u);
  } else if (glyph === 'bank') {
    doc.triangle(cx - 2.4 * u, cy - 0.6 * u, cx + 2.4 * u, cy - 0.6 * u, cx, cy - 2.4 * u, 'F');
    doc.setLineWidth(0.55);
    doc.line(cx - 1.6 * u, cy + 0.2 * u, cx - 1.6 * u, cy + 1.8 * u);
    doc.line(cx, cy + 0.2 * u, cx, cy + 1.8 * u);
    doc.line(cx + 1.6 * u, cy + 0.2 * u, cx + 1.6 * u, cy + 1.8 * u);
    doc.line(cx - 2.4 * u, cy + 2.2 * u, cx + 2.4 * u, cy + 2.2 * u);
  }
}

export function generateQuotePdf(
  quote: Quote,
  client: Client | undefined,
  settings: AppSettings,
  _prestations?: Array<{ id: string; code?: string }>
): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const companyName = (settings.companyName || 'HINOV GROUP').toUpperCase();
  const clientName = client?.company || client?.name || 'Client comptant';
  const upClient = cleanPdfText(clientName.toUpperCase());
  const dateFr = formatDateFr(quote.date);
  const validUntilFr = quote.validUntil ? formatDateFr(quote.validUntil) : '';
  const validityText = quote.validUntil
    ? `Valable jusqu'au ${validUntilFr}`
    : `Valable ${settings.defaultValidity || 30} jours`;

  // ---- Montants : Total H.T. net, TVA 0, Total = H.T. (comme le modèle) ----
  const netHt = Math.round(quote.total || 0);
  const discountAmount = Math.round(quote.discountAmount || 0);
  const discountPercent = quote.discountPercent || 0;
  const tva = 0;
  const ttc = netHt;
  const hasDiscount = discountPercent > 0 && discountAmount > 0;

  // ---- Lignes normalisées (mêmes alias que l'ancien générateur) ----
  const rawLines: any[] = Array.isArray(quote.lines)
    ? quote.lines
    : Array.isArray((quote as any).quote_lines)
      ? (quote as any).quote_lines
      : Array.isArray((quote as any).items)
        ? (quote as any).items
        : [];
  const lines = rawLines.map((line: any) => {
    const descRaw = line.description || line.designation || line.name || line.prestation_name || line.label || 'Article sans désignation';
    const qty = Number(line.quantity ?? line.qte ?? line.qty ?? 1);
    const unitPrice = Number(line.unitPrice ?? line.unit_price ?? line.price ?? line.pu ?? 0);
    const disc = Number(line.discountPercent ?? line.discount_percent ?? line.remise ?? 0);
    let totalVal = line.total !== undefined && line.total !== null ? Number(line.total) : undefined;
    if (totalVal === undefined || isNaN(totalVal)) {
      if (line.total_price !== undefined) totalVal = Number(line.total_price);
      else if (line.totalPrice !== undefined) totalVal = Number(line.totalPrice);
      else {
        const rawTotal = qty * unitPrice;
        totalVal = Math.max(0, rawTotal - Math.round((rawTotal * disc) / 100));
      }
    }
    return { desc: cleanPdfText(descRaw) || 'Article sans désignation', qty, unitPrice, disc, total: totalVal || 0 };
  });

  // ---- Coordonnées entreprise (paramètres, sinon valeurs du modèle) ----
  const capital = settings.companyCapital || '2.000.000';
  const address = settings.companyAddress || "Yopougon Cite CIE, Rue S259 - ABIDJAN - COTE D'IVOIRE";
  const phone = settings.companyPhone || '(225) 27 23 22 79 92';
  const email = settings.companyEmail || 'hinovgroup@hinovgroup.com';
  const rccm = settings.companySiret || 'CI-ABJ-03-2024-B13-02088';
  const ibanFull = (settings.bankIban || 'CI93 CI16 6010 0701 1527 1241 0180').replace(/\s+/g, ' ').trim();
  const iban1 = ibanFull.slice(0, 24).trim();
  const iban2 = ibanFull.slice(24).trim();

  const setNavy = () => doc.setTextColor(...DV_NAVY);
  const setGray = () => doc.setTextColor(...DV_GRAY);
  const setDark = () => doc.setTextColor(...DV_DARK);

  // ---- Pied de page (chaque page) ----
  const drawFooter = (pageNum: number, totalPages: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setNavy();
    doc.text(cleanPdfText(`${companyName} au capital de ${capital} FCFA`), 105, 280.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setNavy();
    doc.text(cleanPdfText(`Siège social: ${address} - ${phone}`), 105, 284.5, { align: 'center' });
    doc.text(cleanPdfText(`${email} ; N° RCCM : ${rccm}`), 105, 288, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setGray();
    doc.text(`Page ${pageNum} de ${totalPages}`, 200, 288, { align: 'right' });
  };

  // ---- Tableau : colonnes (mm) ----
  const CX = [10, 42, 128, 142, 163, 178, 200];
  const COL_ACCENTS: Array<[number, number, number]> = [DV_GREEN, DV_PURPLE, DV_ORANGE, DV_BLUE, DV_GREEN, DV_NAVY];
  const drawTableHead = (top: number): number => {
    doc.setFillColor(252, 253, 255);
    doc.setDrawColor(...DV_LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(CX[0], top, CX[6] - CX[0], 9, 1.5, 1.5, 'FD');
    doc.setLineWidth(1.2);
    for (let i = 0; i < 6; i++) {
      doc.setDrawColor(...COL_ACCENTS[i]);
      doc.line(CX[i] + 0.5, top + 0.4, CX[i + 1] - 0.5, top + 0.4);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setNavy();
    const ty = top + 6;
    const heads = ['Référence', 'Désignation', 'Qté', 'P. Unitaire', 'Remise', 'Montant H.T.'];
    for (let i = 0; i < 6; i++) doc.text(heads[i], (CX[i] + CX[i + 1]) / 2, ty, { align: 'center' });
    return top + 9;
  };

  const drawRow = (ln: { desc: string; qty: number; unitPrice: number; disc: number; total: number }, ref: string, top: number, h: number) => {
    doc.setDrawColor(...DV_LINE);
    doc.setLineWidth(0.25);
    for (let i = 0; i < 7; i++) doc.line(CX[i], top, CX[i], top + h);
    doc.line(CX[0], top + h, CX[6], top + h);
    const baseY = top + 6.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setDark();
    doc.text(ref, (CX[0] + CX[1]) / 2, baseY, { align: 'center' });
    // Désignation sur une seule ligne : police réduite si longue
    const rFit = fitText(doc, ln.desc, CX[2] - CX[1] - 3, 9, 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(rFit.size);
    setDark();
    doc.text(rFit.text, CX[1] + 2, baseY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setDark();
    doc.text(String(ln.qty), (CX[2] + CX[3]) / 2, baseY, { align: 'center' });
    doc.text(formatMontant(ln.unitPrice), (CX[3] + CX[4]) / 2, baseY, { align: 'center' });
    doc.text(ln.disc > 0 ? `${ln.disc}%` : '—', (CX[4] + CX[5]) / 2, baseY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setNavy();
    doc.text(formatMontant(ln.total), (CX[5] + CX[6]) / 2, baseY, { align: 'center' });
  };

  // ============================ PAGE 1 ============================
  // Bannière photo pleine largeur (devi_banner.jpg)
  if (devisPdfAssets.banner) {
    try {
      doc.addImage(devisPdfAssets.banner, 'JPEG', 0, 0, 210, 52.9);
    } catch { /* sans bannière si illisible */ }
  } else {
    doc.setFillColor(...DV_NAVY);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...DV_WHITE);
    doc.text(companyName, 10, 18);
  }

  // Titre + date + numéro (sans fond, style d'origine avec icônes)
  const titleY = 68;
  doc.setDrawColor(...DV_GREEN);
  doc.setLineWidth(0.8);
  doc.roundedRect(10, titleY - 8, 10, 10, 2, 2, 'S');
  doc.setLineWidth(0.6);
  doc.line(12.5, titleY - 5, 17.5, titleY - 5);
  doc.line(12.5, titleY - 3, 17.5, titleY - 3);
  doc.line(12.5, titleY - 1, 15.5, titleY - 1);
  const titleFit = fitText(doc, `DEVIS ${quote.subject || ''}`.trim() || 'DEVIS', 92, 12, 8.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFit.size);
  const wDevis = doc.getTextWidth('DEVIS ');
  setNavy();
  doc.text('DEVIS', 24, titleY);
  doc.setTextColor(...DV_DARK);
  doc.text(titleFit.text.slice(6), 24 + wDevis, titleY);
  doc.setLineWidth(1.1);
  const ulSegs: Array<[number, number, number]> = [DV_GREEN, DV_PURPLE, DV_ORANGE, DV_BLUE];
  const ulW = 72;
  ulSegs.forEach((c, i) => {
    doc.setDrawColor(...c);
    doc.line(24 + (ulW / 4) * i, titleY + 3, 24 + (ulW / 4) * (i + 1) - 0.8, titleY + 3);
  });
  // Date + numéro avec pastilles (uniquement ici)
  dvBadge(doc, 15, titleY + 12, 3, DV_GREEN, 'cal');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  setDark();
  doc.text(cleanPdfText(`Date : ${dateFr}`), 21, titleY + 13.5);
  dvBadge(doc, 15, titleY + 20, 3, DV_ORANGE, 'receipt');
  doc.setFont('helvetica', 'bold');
  const numFit = fitText(doc, `N° ${quote.quoteNumber}`, 92, 9.5, 7);
  doc.setFontSize(numFit.size);
  setNavy();
  doc.text(numFit.text, 21, titleY + 21.5);
  // Badge client vert (droite)
  const badgeY = titleY - 9;
  doc.setFillColor(...DV_GREEN);
  doc.roundedRect(128, badgeY, 72, 17, 3, 3, 'F');
  doc.setFillColor(...DV_WHITE);
  doc.circle(139, badgeY + 8.5, 5.5, 'F');
  dvBadge(doc, 139, badgeY + 8.5, 5.5, DV_WHITE, 'user', DV_NAVY);
  // Nom client entier : 1 ligne si ça tient, sinon 2 lignes (jamais tronqué sauf extrême)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const badgeLines = doc.splitTextToSize(upClient, 44) as string[];
  if (badgeLines.length <= 1) {
    const badgeFit = fitText(doc, upClient, 44, 12, 8);
    doc.setFontSize(badgeFit.size);
    doc.setTextColor(...DV_WHITE);
    doc.text(badgeFit.text, 172, badgeY + 10.5, { align: 'center' });
    doc.setDrawColor(...DV_WHITE);
    doc.setLineWidth(0.6);
    doc.line(150, badgeY + 13.5, 194, badgeY + 13.5);
  } else {
    let bSize = 9;
    doc.setFontSize(bSize);
    let two = doc.splitTextToSize(upClient, 44) as string[];
    if (two.length > 2) {
      bSize = 8;
      doc.setFontSize(bSize);
      two = doc.splitTextToSize(upClient, 44) as string[];
    }
    if (two.length > 2) {
      two = [two[0], two[1]];
      while (two[1].length > 7 && doc.getTextWidth(two[1]) > 44) two[1] = two[1].slice(0, -4) + '...';
    }
    doc.setFontSize(bSize);
    doc.setTextColor(...DV_WHITE);
    doc.text(two[0], 172, badgeY + 7, { align: 'center' });
    if (two[1]) doc.text(two[1], 172, badgeY + 13, { align: 'center' });
    doc.setDrawColor(...DV_WHITE);
    doc.setLineWidth(0.6);
    doc.line(150, badgeY + 15.5, 194, badgeY + 15.5);
  }

  // Tableau : en-tête + lignes (pagination si long)
  let y = drawTableHead(98);
  const rowH = 10;
  const rowLimit = 222;
  const newTablePage = () => {
    doc.addPage();
    y = drawTableHead(14);
  };
  lines.forEach((ln, idx) => {
    if (y + rowH > rowLimit) newTablePage();
    drawRow(ln, String(idx + 1), y, rowH);
    y += rowH;
  });
  if (lines.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    setGray();
    doc.text('Aucune prestation spécifiée dans ce devis.', CX[0] + 3, y + 6);
    y += 10;
    doc.setDrawColor(...DV_LINE);
    doc.setLineWidth(0.25);
    doc.line(CX[0], y, CX[6], y);
  }

  // ---- Cartes de totaux ----
  const totRows: Array<{ icon: 'coins' | 'pct' | null; color: [number, number, number]; label: string; value: string; bar: boolean }> = [
    { icon: 'coins', color: DV_BLUE, label: 'Total H.T. :', value: formatMontant(netHt), bar: false },
  ];
  if (hasDiscount) totRows.push({ icon: null, color: DV_BLUE, label: `Remise (${discountPercent}%) :`, value: `-${formatMontant(discountAmount)}`, bar: false });
  totRows.push({ icon: 'pct', color: DV_GREEN, label: 'TVA 18% :', value: formatMontant(tva), bar: false });
  totRows.push({ icon: null, color: DV_GREEN, label: 'Total H.T. :', value: formatMontant(ttc), bar: true });
  const cardH = 12 + totRows.length * 9;
  if (y + cardH + 8 > 232) {
    doc.addPage();
    y = 20;
  }
  y += 6;
  // Carte gauche : montant en lettres
  doc.setFillColor(...DV_BG);
  doc.roundedRect(10, y, 100, cardH, 2, 2, 'F');
  dvBadge(doc, 21, y + cardH / 2, 6, DV_GREEN, 'coins');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setGray();
  const wordsTitle = doc.splitTextToSize('Soit la présente facture arrêtée à la somme de :', 84) as string[];
  doc.text(wordsTitle, 31, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setNavy();
  const words = doc.splitTextToSize(`${nombreEnLettres(ttc)} FRANCS CFA`, 84) as string[];
  doc.text(words.slice(0, 4), 31, y + 7 + wordsTitle.length * 4 + 5);
  // Carte droite : lignes de totaux
  doc.setFillColor(...DV_BG);
  doc.roundedRect(116, y, 84, cardH, 2, 2, 'F');
  let try_ = y + 9;
  totRows.forEach(r => {
    if (r.bar) {
      doc.setFillColor(...DV_GREEN);
      doc.rect(116, try_ - 5.5, 2.5, 9, 'F');
    }
    if (r.icon) dvBadge(doc, 125, try_ - 1.5, 3.5, r.color, r.icon);
    doc.setFont('helvetica', r.bar ? 'bold' : 'normal');
    doc.setFontSize(r.bar ? 9.5 : 8.5);
    setNavy();
    doc.text(cleanPdfText(r.label), 132, try_);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(r.bar ? 11 : 10);
    setNavy();
    doc.text(r.value, 196, try_, { align: 'right' });
    try_ += 9;
  });
  y += cardH;

  // ---- Signature (pointillés) ----
  y += 12;
  if (y + 48 > 232) {
    doc.addPage();
    y = 20;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setNavy();
  doc.text(cleanPdfText(`Signature ${companyName}`), 105, y, { align: 'center' });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  setGray();
  doc.text('Cachet et signature', 105, y + 6, { align: 'center' });
  doc.setDrawColor(...DV_GRAY);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([2, 2], 0);
  doc.roundedRect(50, y + 9, 110, 30, 3, 3, 'S');
  doc.setLineDashPattern([], 0);
  // Cachet centré dans le rectangle, taille augmentée (paramètre entreprise sinon modèle)
  const stampSrc = settings.companyStampBase64 || devisPdfAssets.cachet;
  if (stampSrc) {
    try {
      const fmt = stampSrc.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(stampSrc, fmt, 91, y + 10.3, 28, 27.4);
    } catch {
      try { doc.addImage(stampSrc, 'JPEG', 91, y + 10.3, 28, 27.4); } catch { /* sans cachet */ }
    }
  }
  y += 43;

  // ---- 3 blocs bas à icônes ----
  if (y + 34 > 262) {
    doc.addPage();
    y = 20;
  }
  doc.setDrawColor(...DV_LINE);
  doc.setLineWidth(0.3);
  doc.line(72, y, 72, y + 32);
  doc.line(140, y, 140, y + 32);
  // 1. Échéance
  dvBadge(doc, 18, y + 5, 5, DV_PURPLE, 'cal');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...DV_PURPLE);
  doc.text('Échéance', 27, y + 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setGray();
  doc.text('Montant', 10, y + 15);
  doc.setFillColor(229, 231, 235);
  doc.roundedRect(10, y + 18, 56, 9, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  setNavy();
  doc.text(formatMontant(ttc), 38, y + 24.5, { align: 'center' });
  // 2. CGV
  dvBadge(doc, 80, y + 5, 5, DV_GREEN, 'doc');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setNavy();
  const cgvTitleFit = fitText(doc, 'Conditions générales de vente', 52, 9, 7.5);
  doc.setFontSize(cgvTitleFit.size);
  doc.text(cgvTitleFit.text, 89, y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray();
  const cgvLines: string[] = [cleanPdfText(validityText)];
  if (quote.paymentTerms) cgvLines.push(cleanPdfText(`Paiement : ${quote.paymentTerms}`));
  if (quote.notes) cgvLines.push(cleanPdfText(quote.notes));
  const cgvWrapped: string[] = [];
  cgvLines.forEach(l => (doc.splitTextToSize(l, 58) as string[]).slice(0, 3 - cgvWrapped.length).forEach(w => cgvWrapped.push(w)));
  cgvWrapped.slice(0, 3).forEach((wl, i) => doc.text(wl, 78, y + 13 + i * 4.2));
  // 3. Banque
  dvBadge(doc, 148, y + 5, 5, DV_BLUE, 'bank', DV_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setNavy();
  doc.text('Coordonnées bancaires', 157, y + 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setDark();
  doc.text('IBAN:', 148, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setDark();
  const ibanWrapped = doc.splitTextToSize(`${iban1}${iban2 ? ' ' + iban2 : ''}`.trim(), 50) as string[];
  ibanWrapped.slice(0, 2).forEach((wl, i) => doc.text(wl, 148, y + 14 + (i + 1) * 4.2));
  y += 36;

  // ---- Pied de page + numérotation (toutes pages) ----
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  const blob = doc.output('blob');
  return blob;
}

export function generateSalePdf(sale: Sale, client: Client | undefined, settings: AppSettings) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Header
  y = drawHeader(doc, settings, margin, y);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(settings.companyAddress || '', margin, y);
  y += 5;
  doc.text(`RCCM: ${settings.companySiret || ''}`, margin, y);
  y += 10;

  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('BON DE VENTE', margin, y);
  y += 8;

  // Sale number & dates
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`N° ${sale.saleNumber}`, margin, y);
  doc.text(`Date: ${sale.date}`, pageW - margin, y, { align: 'right' });
  y += 4;

  // Client info box
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(pageW - margin - 70, y - 5, 70, 28, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('Client:', pageW - margin - 65, y + 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60);
  const clientLines = [
    client?.name || 'Inconnu',
    client?.contact || '',
    client?.email || '',
    client?.company || '',
  ].filter(Boolean);
  clientLines.forEach((line, i) => {
    doc.text(line, pageW - margin - 65, y + 7 + i * 5);
  });
  y += 15;

  // Table header
  const colWidths = [contentW * 0.50, contentW * 0.12, contentW * 0.19, contentW * 0.19];
  const headers = ['Description', 'Qté', 'Prix Unitaire', 'Total'];
  doc.setFillColor(230, 230, 230);
  doc.rect(margin, y, contentW, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  let x = margin;
  headers.forEach((h, i) => {
    doc.text(h, x + 2, y + 5.5);
    x += colWidths[i];
  });
  y += 8;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  sale.lines.forEach((line) => {
    doc.setDrawColor(220);
    doc.line(margin, y, pageW - margin, y);
    y += 2;
    x = margin;
    const cells = [
      line.description,
      String(line.quantity),
      `${line.unitPrice.toLocaleString('fr-FR')} FCFA`,
      `${line.total.toLocaleString('fr-FR')} FCFA`,
    ];
    cells.forEach((cell, i) => {
      doc.text(cell, x + 2, y + 4);
      x += colWidths[i];
    });
    y += 8;
  });

  // Separator
  y += 2;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Totals
  const totalsX = pageW - margin - 60;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Sous-total', totalsX, y);
  doc.text(`${sale.subtotal.toLocaleString('fr-FR')} FCFA`, pageW - margin, y, { align: 'right' });
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total', totalsX, y);
  doc.text(`${sale.total.toLocaleString('fr-FR')} FCFA`, pageW - margin, y, { align: 'right' });

  const blob = doc.output('blob');
  downloadBlob(blob, `Vente_${sale.saleNumber}.pdf`);
}

export function generateInvoicePdf(
  invoice: Invoice,
  client: Client | undefined,
  quote: Quote | undefined,
  settings: AppSettings,
  payments: InvoicePayment[] = []
): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageW - margin * 2; // 178 mm
  const accent: [number, number, number] = [2, 132, 199]; // Bleu Facture #0284C7
  const accentLight = mixWithWhite(accent, 0.92);
  const accentSoft = mixWithWhite(accent, 0.75);
  const dark: [number, number, number] = [30, 34, 42];
  const muted: [number, number, number] = [100, 112, 125];
  const neutralLight: [number, number, number] = [246, 248, 250];
  const neutralBorder: [number, number, number] = [222, 226, 230];
  const companyName = settings.companyName || 'HINOV';
  const dateFr = formatDateFr(invoice.issueDate);
  const dueDateFr = formatDateFr(invoice.dueDate);
  const deliveryDateFr = invoice.deliveryDate ? formatDateFr(invoice.deliveryDate) : '-';
  let y = 0;

  // 1. EN-TÊTE
  if (settings.headerLogoBase64) {
    const bannerH = 34;
    let rendered = false;
    try {
      const isPng = settings.headerLogoBase64.includes('image/png');
      const format = isPng ? 'PNG' : 'JPEG';
      doc.addImage(settings.headerLogoBase64, format, 0, 0, pageW, bannerH);
      rendered = true;
    } catch {
      try {
        doc.addImage(settings.headerLogoBase64, 'JPEG', 0, 0, pageW, bannerH);
        rendered = true;
      } catch {}
    }
    if (!rendered) {
      doc.setFillColor(...accent);
      doc.rect(0, 0, pageW, 36, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text(companyName.toUpperCase(), margin, 18);
    }
    y = bannerH + 14;
  } else {
    doc.setFillColor(...accent);
    doc.rect(0, 0, pageW, 38, 'F');
    doc.setFillColor(...mixWithWhite(accent, 0.2));
    doc.rect(0, 38, pageW, 1.5, 'F');

    // Gauche : Société
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(companyName, margin, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(230, 242, 245);
    if (settings.companyAddress) doc.text(settings.companyAddress, margin, 21);
    const taxInfo = [
      settings.companySiret ? `RCCM : ${settings.companySiret}` : '',
      settings.companyTva ? `IFU/TVA : ${settings.companyTva}` : ''
    ].filter(Boolean).join(' • ');
    if (taxInfo) doc.text(taxInfo, margin, 26);

    // Droite : Facture
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('FACTURE', pageW - margin, 15, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`N° ${invoice.invoiceNumber}`, pageW - margin, 22, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(230, 242, 245);
    doc.text(`Date : ${dateFr}`, pageW - margin, 27, { align: 'right' });
    doc.text(`Échéance : ${dueDateFr}`, pageW - margin, 32, { align: 'right' });
    y = 52;
  }

  // 2. ENCADRÉS CLIENT & FACTURE
  const cardGap = 8;
  const cardW = (contentW - cardGap) / 2;
  const cardH = 36;
  const cardLeftX = margin;
  const cardRightX = margin + cardW + cardGap;
  const cardY = y;

  // Gauche : CLIENT
  doc.setFillColor(...neutralLight);
  doc.roundedRect(cardLeftX, cardY, cardW, cardH, 2, 2, 'F');
  doc.setDrawColor(...neutralBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(cardLeftX, cardY, cardW, cardH, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...accent);
  doc.text('FACTURÉ À (CLIENT)', cardLeftX + 5, cardY + 6.5);

  const clientName = client?.company || client?.name || 'Client';
  const clientContact = client?.contact ? `Attn : ${client.contact}` : '';
  const clientPhone = client?.phone ? `Tél : ${client.phone}` : (client?.email ? `Email : ${client.email}` : '');
  const clientAddr = client?.address || '';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  const clientNameWrapped = doc.splitTextToSize(clientName, cardW - 10) as string[];
  doc.text(clientNameWrapped[0], cardLeftX + 5, cardY + 13.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  let cOffsetY = cardY + 19.5;
  if (clientContact) {
    doc.text(clientContact, cardLeftX + 5, cOffsetY);
    cOffsetY += 5.5;
  }
  if (clientPhone) {
    doc.text(clientPhone, cardLeftX + 5, cOffsetY);
    cOffsetY += 5.5;
  } else if (clientAddr) {
    doc.text(clientAddr, cardLeftX + 5, cOffsetY);
  }

  // Droite : DÉTAILS FACTURE
  doc.setFillColor(...neutralLight);
  doc.roundedRect(cardRightX, cardY, cardW, cardH, 2, 2, 'F');
  doc.setDrawColor(...neutralBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(cardRightX, cardY, cardW, cardH, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...accent);
  doc.text(`FACTURE N° ${invoice.invoiceNumber}`, cardRightX + 5, cardY + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...dark);
  doc.text(`Date d'émission : ${dateFr}`, cardRightX + 5, cardY + 13.5);
  doc.text(`Date de livraison : ${deliveryDateFr}`, cardRightX + 5, cardY + 19);
  doc.text(`Date d'échéance : ${dueDateFr} (${invoice.paymentTerms || '30 jours'})`, cardRightX + 5, cardY + 24.5);
  if (quote?.quoteNumber || invoice.quoteId) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Réf. Devis : ${quote?.quoteNumber || invoice.quoteId}`, cardRightX + 5, cardY + 30);
  }

  y += cardH + 9;

  // 3. TABLEAU DES LIGNES DE FACTURE
  const colW = {
    desc: 82,
    qty: 22,
    unitPrice: 28,
    discount: 18,
    total: 28
  };
  const tableX = margin;

  const drawTableHeader = () => {
    const thH = 8.5;
    doc.setFillColor(...accent);
    doc.rect(tableX, y, contentW, thH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);

    doc.text('DÉSIGNATION', tableX + 3, y + 5.5);
    doc.text('QTÉ', tableX + colW.desc + colW.qty / 2, y + 5.5, { align: 'center' });
    doc.text('P.U. (FCFA)', tableX + colW.desc + colW.qty + colW.unitPrice - 3, y + 5.5, { align: 'right' });
    doc.text('REMISE', tableX + colW.desc + colW.qty + colW.unitPrice + colW.discount / 2, y + 5.5, { align: 'center' });
    doc.text('TOTAL (FCFA)', tableX + contentW - 3, y + 5.5, { align: 'right' });

    y += thH;
  };

  drawTableHeader();

  const lines = invoice.items || [];
  if (lines.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text('Prestations facturées selon devis validé.', tableX + 3, y + 6);
    y += 10;
    doc.setDrawColor(...neutralBorder);
    doc.setLineWidth(0.2);
    doc.line(tableX, y, tableX + contentW, y);
  } else {
    lines.forEach((line, idx) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      const descClean = cleanPdfText(line.description) || 'Prestation';
      const qty = Number(line.quantity || 1);
      const unitPrice = Number(line.unitPrice || 0);
      const discountPercent = Number(line.discountPercent || 0);
      const totalVal = Number(line.total || qty * unitPrice);

      const descLines = doc.splitTextToSize(descClean, colW.desc - 6) as string[];
      const rowH = Math.max(7.5, descLines.length * 4.2 + 3.5);

      if (y + rowH > pageH - 45) {
        doc.addPage();
        y = margin + 4;
        drawTableHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(...accentLight);
        doc.rect(tableX, y, contentW, rowH, 'F');
      }

      doc.setTextColor(...dark);
      descLines.forEach((dLine, dIdx) => {
        doc.text(dLine, tableX + 3, y + 4.8 + dIdx * 4.2);
      });

      doc.text(String(qty), tableX + colW.desc + colW.qty / 2, y + 4.8, { align: 'center' });
      doc.text(formatAmount(unitPrice), tableX + colW.desc + colW.qty + colW.unitPrice - 3, y + 4.8, { align: 'right' });

      const discountText = discountPercent > 0 ? `-${discountPercent}%` : '-';
      doc.setTextColor(...(discountPercent > 0 ? accent : muted));
      doc.text(discountText, tableX + colW.desc + colW.qty + colW.unitPrice + colW.discount / 2, y + 4.8, { align: 'center' });

      doc.setTextColor(...dark);
      doc.setFont('helvetica', 'bold');
      doc.text(formatAmount(totalVal), tableX + contentW - 3, y + 4.8, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      y += rowH;

      doc.setDrawColor(...neutralBorder);
      doc.setLineWidth(0.2);
      doc.line(tableX, y, tableX + contentW, y);
    });
  }

  y += 5;

  // 4. TOTAUX & ÉTAT DE PAIEMENT
  if (y > pageH - 68) {
    doc.addPage();
    y = margin + 4;
  }

  const totalsW = 76;
  const totalsX = pageW - margin - totalsW;
  const notesW = contentW - totalsW - 8;
  const notesX = margin;

  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remaining = Math.max(0, (invoice.totalAmount || 0) - totalPaid);

  // Bloc gauche : Historique paiements / Notes
  doc.setFillColor(...neutralLight);
  doc.roundedRect(notesX, y, notesW, 36, 1.5, 1.5, 'F');
  doc.setDrawColor(...neutralBorder);
  doc.setLineWidth(0.2);
  doc.roundedRect(notesX, y, notesW, 36, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...accent);
  doc.text('RÈGLEMENT & ACOMPTES ENCAISSÉS', notesX + 4, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...dark);
  let pOffsetY = y + 11;

  if (payments.length > 0) {
    payments.slice(0, 3).forEach(p => {
      doc.text(`• ${formatDateFr(p.paymentDate)} : ${formatAmount(p.amount)} (${p.paymentMethod || 'Espèces'})`, notesX + 4, pOffsetY);
      pOffsetY += 4.5;
    });
    if (payments.length > 3) {
      doc.text(`(+ ${payments.length - 3} autre(s) paiement(s))`, notesX + 4, pOffsetY);
    }
  } else {
    doc.text('Aucun paiement enregistré pour cette facture.', notesX + 4, pOffsetY);
    pOffsetY += 5;
    if (invoice.notes) {
      doc.text(cleanPdfText(invoice.notes), notesX + 4, pOffsetY);
    }
  }

  // Bloc droit : Totaux
  const totBoxH = 36;
  doc.setFillColor(...accentLight);
  doc.roundedRect(totalsX, y, totalsW, totBoxH, 2, 2, 'F');
  doc.setDrawColor(...accentSoft);
  doc.setLineWidth(0.3);
  doc.roundedRect(totalsX, y, totalsW, totBoxH, 2, 2, 'S');

  let totY = y + 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...muted);
  doc.text('Montant Total TTC :', totalsX + 4, totY);
  doc.setTextColor(...dark);
  doc.setFont('helvetica', 'bold');
  doc.text(formatAmount(invoice.totalAmount || 0), pageW - margin - 4, totY, { align: 'right' });
  totY += 6;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);
  doc.text('Total Déjà Payé :', totalsX + 4, totY);
  doc.setTextColor(22, 163, 74); // Vert
  doc.setFont('helvetica', 'bold');
  doc.text(formatAmount(totalPaid), pageW - margin - 4, totY, { align: 'right' });
  totY += 7;

  // Ligne NET RESTANT À PAYER
  const totalBannerH = 9.5;
  const bannerColor: [number, number, number] = remaining === 0 ? [22, 163, 74] : accent;
  doc.setFillColor(...bannerColor);
  doc.roundedRect(totalsX, y + totBoxH - totalBannerH, totalsW, totalBannerH, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(remaining === 0 ? 'FACTURE PAYÉE' : 'RESTE À PAYER', totalsX + 4, y + totBoxH - 3.2);
  doc.text(formatAmount(remaining), pageW - margin - 4, y + totBoxH - 3.2, { align: 'right' });

  y += totBoxH + 6;

  // 5. MENTIONS & SIGNATURES
  if (y > pageH - 42) {
    doc.addPage();
    y = margin + 4;
  }

  const condH = 6;
  doc.setFillColor(...neutralLight);
  doc.rect(margin, y, contentW, condH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...accent);
  doc.text('CONDITIONS DE PAIEMENT & MENTIONS LÉGALES', margin + 4, y + 4.2);
  y += condH + 3.5;

  const conditionsList = [
    `- Date limite de règlement : ${dueDateFr} (${invoice.paymentTerms || '30 jours'}).`,
    `- En cas de retard de paiement, des pénalités d'un taux égal au taux d'intérêt légal seront exigibles de plein droit.`,
    settings.defaultTerms ? `- ${cleanPdfText(settings.defaultTerms)}` : `- Merci pour votre confiance !`
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...dark);
  conditionsList.forEach(cond => {
    const wrapped = doc.splitTextToSize(cond, contentW - 8) as string[];
    wrapped.forEach(wl => {
      doc.text(wl, margin + 4, y);
      y += 3.8;
    });
  });

  y += 4;

  // Signature / Cachet
  const sigW = 85;
  const sigH = 22;
  const sigX = pageW - margin - sigW;
  doc.setDrawColor(...neutralBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(sigX, y, sigW, sigH, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...accent);
  doc.text('Pour l\'entreprise - Cachet & Signature', sigX + 4, y + 5);

  if (settings.companyStampBase64) {
    try {
      doc.addImage(settings.companyStampBase64, 'PNG', sigX + sigW - 32, y + 2, 28, 18);
    } catch {}
  }

  return doc.output('blob');
}