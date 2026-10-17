import type { ImportReport, ImportSession } from '../../../context/AppContext';

export class ImportReportService {
  generateReport(session: ImportSession): ImportReport {
    const productsCreated = session.successfulCreations;
    const productsUpdated = session.successfulUpdates;
    const productsIgnored = session.ignoredRows + session.errors.length;
    const totalErrors = session.errors.filter(e => e.severity === 'error').length;
    const totalWarnings = session.errors.filter(e => e.severity === 'warning').length;

    return {
      session,
      productsCreated,
      productsUpdated,
      productsIgnored: productsIgnored - totalErrors, // Subtract errors from ignored (they were already counted)
      brandsCreated: 0,
      suppliersCreated: 0,
      totalErrors,
      totalWarnings,
      importDurationMs: 0
    };
  }

  exportReportToPDF(_report: ImportReport): void {
    // Implementation will use jsPDF (already installed in the project)
    // This would generate a PDF report of the import
  }

  exportReportToExcel(report: ImportReport): Blob {
    const headers = [
      'Statistique',
      'Valeur'
    ];

    const rows = [
      ['Session ID', report.session.id],
      ['Fichier', report.session.filename],
      ['Statut', report.session.status],
      ['Produits créés', report.productsCreated.toString()],
      ['Produits mis à jour', report.productsUpdated.toString()],
      ['Produits ignorés', report.productsIgnored.toString()],
      ['Marques créées', report.brandsCreated.toString()],
      ['Fournisseurs créés', report.suppliersCreated.toString()],
      ['Erreurs totales', report.totalErrors.toString()],
      ['Avertissements', report.totalWarnings.toString()],
      ['Durée (ms)', report.importDurationMs.toString()],
      ['Créé le', report.session.createdAt],
      ['Terminé le', report.session.completedAt || 'N/A']
    ];

    const csvContent = [
      headers.join('\t'),
      ...rows.map(row => row.join('\t')),
      '',
      '',
      'Détails des erreurs :',
      ...(report.session.errors.length > 0
        ? ['Ligne\tChamp\tValeur\tErreur\tSévérité']
        : ['Aucune erreur']),
      ...report.session.errors.map(e =>
        [e.row.toString(), e.field, e.value, e.error, e.severity].join('\t')
      )
    ].join('\n');

    return new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  }

  downloadReport(report: ImportReport, format: 'pdf' | 'excel'): void {
    if (format === 'excel') {
      const blob = this.exportReportToExcel(report);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport-import-${report.session.filename}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    // PDF export would use jsPDF here
  }
}

export const importReportService = new ImportReportService();
