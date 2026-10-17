import { useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { Upload, Download, FileSpreadsheet, CheckCircle, XCircle, Clock } from 'lucide-react';
import { excelImportService } from '../services/ExcelImportService';
import { excelExportService } from '../services/ExcelExportService';
import { importReportService } from '../services/ImportReportService';
import { stockService } from '../services/StockService';
import type { PosProduct, ImportSession, ImportReport, ImportError } from '../../../context/AppContext';
import type { ImportAnalysis } from '../services/ExcelImportService';
import { parseProductsJson, analyzeJsonImport } from '../data/productJsonParser';

export default function ImportExportPanel() {
  const { posProducts, addPosProduct, updatePosProduct, addPosStockMovement, addImportSession, updateImportSession, addImportError, importSessions } = useAppContext();
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [importAnalysis, setImportAnalysis] = useState<ImportAnalysis | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentReport, setCurrentReport] = useState<ImportReport | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const analysis = await excelImportService.analyzeFile(file, posProducts);
      setImportAnalysis(analysis);
      setSelectedFile(file);
      setCurrentReport(null);
    } catch (error) {
      console.error('Error analyzing file:', error);
      alert("Erreur lors de l'analyse du fichier : " + (error as Error).message);
    }

    e.target.value = '';
  };

  const handleJsonSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      const parsedRows = parseProductsJson(jsonData);
      const analysis = analyzeJsonImport(parsedRows, posProducts, file.name);
      
      setImportAnalysis(analysis);
      setSelectedFile(file);
      setCurrentReport(null);
    } catch (error) {
      console.error('Error analyzing JSON:', error);
      alert("Erreur lors de l'analyse du JSON : " + (error as Error).message);
    } finally {
      e.target.value = '';
    }
  };

  const confirmImport = async () => {
    if (!selectedFile || !importAnalysis) return;

    setIsImporting(true);
    setIsProcessing(true);
    setProcessProgress(0);
    setCurrentReport(null);

    try {
      // F5 : revalider chaque ligne contre le catalogue FRAIS au moment de confirmer
      // (créations/updates décidées à la sélection du fichier sinon périmées).
      // Repli sur l'analyse initiale si le fichier n'est pas ré-analysable (ex : JSON).
      let items = importAnalysis.items;
      try {
        const freshAnalysis = await excelImportService.analyzeFile(selectedFile, posProducts);
        setImportAnalysis(freshAnalysis);
        items = freshAnalysis.items;
      } catch { /* conserve l'analyse initiale */ }
      const report = await excelImportService.importExcel(
        selectedFile,
        [...posProducts],
        items,
        async (product: PosProduct, mode: 'create' | 'update') => {
          if (mode === 'create') {
            const initialQuantity = product.quantity || 0;
            await addPosProduct({ ...product, quantity: initialQuantity });
            if (initialQuantity > 0) {
              await addPosStockMovement({
                productId: product.id,
                type: 'Ajustement Manuel',
                quantity: initialQuantity,
                reference: `IMPORT-${product.reference}`,
                notes: 'Import catalogue'
              });
            }
          } else {
            await updatePosProduct(product.id, product);
          }
        },
        async (session: ImportSession) => {
          await addImportSession(session);
        },
        async (session: ImportSession) => {
          await updateImportSession(session.id, session);
          setProcessProgress(session.totalRows > 0 ? (session.processedRows / session.totalRows) * 100 : 0);
        },
        async (error: ImportError) => {
          await addImportError(error);
        }
      );

      setCurrentReport(report);
      setImportAnalysis(null);
      setSelectedFile(null);
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsImporting(false);
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await excelExportService.exportToExcel(posProducts);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    excelExportService.downloadTemplate();
  };

  const handleExportReport = (format: 'pdf' | 'excel') => {
    if (!currentReport) return;
    importReportService.downloadReport(currentReport, format);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={16} color="var(--color-success)" />;
      case 'failed': return <XCircle size={16} color="var(--color-error)" />;
      case 'in_progress': return <Clock size={16} color="var(--color-warning)" />;
      default: return <Clock size={16} color="var(--color-text-muted)" />;
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>Import / Export</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
          <Upload size={32} color="var(--color-primary)" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Importer Excel</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>Importer votre catalogue depuis un fichier Excel</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              id="excel-file-input"
            />
            <label
              htmlFor="excel-file-input"
              style={{
                padding: '8px 16px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Choisir fichier
            </label>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
            <input
              type="file"
              accept=".json"
              onChange={handleJsonSelect}
              style={{ display: 'none' }}
              id="json-file-input"
            />
            <label
              htmlFor="json-file-input"
              style={{
                padding: '8px 16px',
                border: '1px solid var(--color-primary)',
                color: 'var(--color-primary)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              Importer products.json
            </label>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
          <Download size={32} color="var(--color-success)" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Exporter Catalogue</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>Exporter le catalogue produit en Excel</p>
          <button
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={isExporting || posProducts.length === 0}
          >
            {isExporting ? 'Exportation...' : 'Exporter'}
          </button>
        </div>

        <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
          <FileSpreadsheet size={32} color="var(--color-warning)" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Modèle Excel</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>Télécharger le modèle pour importer votre catalogue</p>
          <button
            className="btn btn-secondary"
            onClick={handleDownloadTemplate}
            style={{ fontSize: '13px' }}
          >
            Télécharger le modèle
          </button>
        </div>
      </div>

      {isProcessing && (
        <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Import en cours...</h3>
          <div style={{ width: '100%', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', height: '8px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${processProgress}%`,
                background: 'var(--color-primary)',
                height: '8px',
                borderRadius: '4px',
                transition: 'width 0.3s'
              }}
            />
          </div>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            {Math.round(processProgress)}% - Importation en cours...
          </p>
        </div>
      )}

      {currentReport && (
        <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Rapport d'import</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => handleExportReport('excel')}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                Exporter Excel
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => handleExportReport('pdf')}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                Exporter PDF
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div style={{ background: 'var(--color-success-tint)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-success)' }}>{currentReport.productsCreated}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Produits créés</div>
            </div>
            <div style={{ background: 'var(--color-primary-tint)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary)' }}>{currentReport.productsUpdated}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Produits mis à jour</div>
            </div>
            <div style={{ background: 'var(--color-error-tint)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-error)' }}>{currentReport.totalErrors}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Erreurs</div>
            </div>
            <div style={{ background: 'var(--color-surface-alt)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text)' }}>{currentReport.importDurationMs}ms</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Durée</div>
            </div>
          </div>

          {currentReport.session.errors.length > 0 && (
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Détails des erreurs</h4>
              <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: 'var(--color-text-muted)' }}>Ligne</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: 'var(--color-text-muted)' }}>Champ</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: 'var(--color-text-muted)' }}>Erreur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReport.session.errors.slice(0, 20).map((err, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                        <td style={{ padding: '8px', fontSize: '13px' }}>{err.row}</td>
                        <td style={{ padding: '8px', fontSize: '13px' }}>{err.field}</td>
                        <td style={{ padding: '8px', fontSize: '13px', color: 'var(--color-error)' }}>{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
</div>
              </div>
              {currentReport.session.errors.length > 20 && (
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                  +{currentReport.session.errors.length - 20} autres erreurs
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {importAnalysis && (
        <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Validation de l'import : {importAnalysis.filename}</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>{importAnalysis.totalRows}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Produits détectés</div>
            </div>
            <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--color-success-tint)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-success)' }}>{importAnalysis.validCount}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Valides</div>
            </div>
            <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--color-error-tint)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-error)' }}>{importAnalysis.invalidCount}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Invalides (Ignorés)</div>
            </div>
            <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-tint)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-warning)' }}>{importAnalysis.duplicateCount}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Doublons (intra-fichier)</div>
            </div>
          </div>

          <div style={{ marginBottom: '24px', background: '#fff3cd', color: '#856404', padding: '16px', borderRadius: '8px' }}>
            <h4 style={{ fontWeight: 600, marginBottom: '8px' }}>Avertissements :</h4>
            <ul style={{ paddingLeft: '20px', fontSize: '13px' }}>
              {importAnalysis.missingBarcodeCount > 0 && <li>⚠ {importAnalysis.missingBarcodeCount} produits n'ont pas de code-barres / ISBN</li>}
              {importAnalysis.missingPurchasePriceCount > 0 && <li>⚠ {importAnalysis.missingPurchasePriceCount} produits n'ont pas de prix d'achat</li>}
              {importAnalysis.missingSellingPriceCount > 0 && <li>⚠ {importAnalysis.missingSellingPriceCount} produits n'ont pas de prix de vente</li>}
              {importAnalysis.missingStockCount > 0 && <li>⚠ {importAnalysis.missingStockCount} produits n'ont pas de stock</li>}
            </ul>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={() => { setImportAnalysis(null); setSelectedFile(null); }}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={confirmImport} disabled={isImporting || importAnalysis.validCount === 0}>
              Confirmer l'import ({importAnalysis.newCount} créations, {importAnalysis.updateCount} mises à jour)
            </button>
          </div>
        </div>
      )}

      {importSessions.length > 0 && (
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Historique des imports</h3>
          <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: 'var(--color-text-muted)' }}>Statut</th>
                <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: 'var(--color-text-muted)' }}>Fichier</th>
                <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: 'var(--color-text-muted)' }}>Date</th>
                <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-muted)' }}>Produits créés</th>
                <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-muted)' }}>Produits mis à jour</th>
                <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-muted)' }}>Erreurs</th>
              </tr>
            </thead>
            <tbody>
              {importSessions.slice(0, 10).map(session => (
                <tr key={session.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                  <td style={{ padding: '8px' }}>{getStatusIcon(session.status)}</td>
                  <td style={{ padding: '8px', fontSize: '13px' }}>{session.filename}</td>
                  <td style={{ padding: '8px', fontSize: '13px' }}>{new Date(session.createdAt).toLocaleDateString('fr-FR')}</td>
                  <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right' }}>{session.successfulCreations}</td>
                  <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right' }}>{session.successfulUpdates}</td>
                  <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right', color: session.errors.length > 0 ? 'var(--color-error)' : 'var(--color-text-muted)' }}>{session.errors.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
</div>
        </div>
      )}
    </div>
  );
}
