import * as XLSX from 'xlsx';
import type {
  PosProduct, PosTransaction, PosPayment, PosReturn, PosStockMovement,
  PosCashSession, PosSupplier, ClientFournisseur, AgentCommercial,
  PrestationCommande, MouvementCaisse, CommissionPrestation, CatalogueArticle,
  InterventionMaintenance, TechnicienMaintenance, Invoice, Client, Quote, Sale,
} from '../../../context/AppContext';

export type ExportKey =
  | 'pos_produits'
  | 'pos_transactions'
  | 'pos_lignes_vente'
  | 'pos_paiements'
  | 'pos_retours'
  | 'pos_mouvements_stock'
  | 'pos_sessions_caisse'
  | 'pos_fournisseurs'
  | 'crm_tiers'
  | 'crm_commerciaux'
  | 'crm_prestations'
  | 'crm_caisse'
  | 'crm_commissions'
  | 'crm_catalogue'
  | 'crm_maintenance'
  | 'crm_techniciens'
  | 'crm_factures'
  | 'crm_clients'
  | 'crm_devis'
  | 'crm_ventes';

export interface PosCrmExportData {
  posProducts: PosProduct[];
  posTransactions: PosTransaction[];
  posPayments: PosPayment[];
  posReturns: PosReturn[];
  posStockMovements: PosStockMovement[];
  posCashSessions: PosCashSession[];
  posSuppliers: PosSupplier[];
  crmTiers: ClientFournisseur[];
  crmCommerciaux: AgentCommercial[];
  crmPrestations: PrestationCommande[];
  crmCaisse: MouvementCaisse[];
  crmCommissions: CommissionPrestation[];
  crmArticles: CatalogueArticle[];
  crmMaintenance: InterventionMaintenance[];
  crmTechniciens: TechnicienMaintenance[];
  invoices: Invoice[];
  clients: Client[];
  quotes: Quote[];
  sales: Sale[];
  productNameById?: Map<string, string>;
}

export const EXPORT_LABELS: Record<ExportKey, { label: string; group: 'POS' | 'CRM'; sheet: string }> = {
  pos_produits: { label: 'Produits (catalogue POS)', group: 'POS', sheet: 'POS_Produits' },
  pos_transactions: { label: 'Transactions (entêtes)', group: 'POS', sheet: 'POS_Transactions' },
  pos_lignes_vente: { label: 'Lignes de vente (détail)', group: 'POS', sheet: 'POS_Lignes_Vente' },
  pos_paiements: { label: 'Paiements POS', group: 'POS', sheet: 'POS_Paiements' },
  pos_retours: { label: 'Retours POS', group: 'POS', sheet: 'POS_Retours' },
  pos_mouvements_stock: { label: 'Mouvements de stock', group: 'POS', sheet: 'POS_Mouvements_Stock' },
  pos_sessions_caisse: { label: 'Sessions de caisse', group: 'POS', sheet: 'POS_Sessions_Caisse' },
  pos_fournisseurs: { label: 'Fournisseurs POS', group: 'POS', sheet: 'POS_Fournisseurs' },
  crm_tiers: { label: 'Tiers & apporteurs', group: 'CRM', sheet: 'CRM_Tiers' },
  crm_commerciaux: { label: 'Commerciaux', group: 'CRM', sheet: 'CRM_Commerciaux' },
  crm_prestations: { label: 'Prestations / Commandes', group: 'CRM', sheet: 'CRM_Prestations' },
  crm_caisse: { label: 'Caisse & dépenses (CRM)', group: 'CRM', sheet: 'CRM_Caisse' },
  crm_commissions: { label: 'Commissions', group: 'CRM', sheet: 'CRM_Commissions' },
  crm_catalogue: { label: 'Catalogue articles métier', group: 'CRM', sheet: 'CRM_Catalogue' },
  crm_maintenance: { label: 'Interventions maintenance', group: 'CRM', sheet: 'CRM_Maintenance' },
  crm_techniciens: { label: 'Techniciens', group: 'CRM', sheet: 'CRM_Techniciens' },
  crm_factures: { label: 'Factures clients', group: 'CRM', sheet: 'CRM_Factures' },
  crm_clients: { label: 'Clients (CRM classique)', group: 'CRM', sheet: 'CRM_Clients' },
  crm_devis: { label: 'Devis', group: 'CRM', sheet: 'CRM_Devis' },
  crm_ventes: { label: 'Ventes', group: 'CRM', sheet: 'CRM_Ventes' },
};

export const ALL_EXPORT_KEYS = Object.keys(EXPORT_LABELS) as ExportKey[];

const fmtDate = (v?: string) => {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toLocaleString('fr-FR');
  } catch { return v; }
};
const fmt = (v: unknown) => (v === undefined || v === null ? '' : v as string | number);

function addSheet(wb: XLSX.WorkBook, sheetName: string, headers: string[], rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const widths = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.slice(0, 500).map(r => String(r[i] ?? '').length));
    return { wch: Math.min(42, Math.max(12, maxLen + 2)) };
  });
  ws['!cols'] = widths;
  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
}

export function buildPosCrmWorkbook(data: PosCrmExportData, keys: ExportKey[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const nameById = data.productNameById
    ?? new Map((data.posProducts || []).map(p => [p.id, (p.name || p.reference) as string]));
  const set = new Set(keys);

  if (set.has('pos_produits')) {
    addSheet(wb, EXPORT_LABELS.pos_produits.sheet,
      ['Référence', 'Désignation', 'Code-barres', 'ISBN', 'Famille', 'Catégorie', 'Marque', 'Fournisseur', 'Prix achat', 'Prix vente', 'Stock', 'Stock min', 'Actif'],
      (data.posProducts || []).map(p => [fmt(p.reference), fmt(p.name), fmt(p.barcode), fmt(p.isbn), fmt(p.family), fmt(p.categoryId), fmt(p.brandId), fmt(p.supplierId), p.purchasePrice ?? 0, p.sellingPrice ?? 0, p.quantity ?? 0, p.minStock ?? 0, p.isActive === false ? 'Non' : 'Oui']));
  }
  if (set.has('pos_transactions')) {
    addSheet(wb, EXPORT_LABELS.pos_transactions.sheet,
      ['N° Transaction', 'Date', 'Statut', 'Caissier', 'Session', 'Sous-total', 'Remise', 'TVA', 'Total', 'Montant reçu', 'Monnaie rendue', 'Nb lignes'],
      (data.posTransactions || []).map(t => [fmt(t.transactionNumber), fmtDate(t.date), fmt(t.status), fmt(t.cashierId), fmt(t.sessionId), t.subtotal ?? 0, t.discountAmount ?? 0, t.vat ?? 0, t.total ?? 0, t.receivedAmount ?? 0, t.changeAmount ?? 0, t.lines?.length ?? 0]));
  }
  if (set.has('pos_lignes_vente')) {
    const rows: (string | number)[][] = [];
    (data.posTransactions || []).forEach(t => {
      (t.lines || []).forEach(l => {
        rows.push([fmt(t.transactionNumber), fmtDate(t.date), fmt(t.status), fmt(l.description), nameById.get(l.productId || '') || fmt(l.productId), l.quantity ?? 0, l.unitPrice ?? 0, l.discountPercent ?? 0, l.discountAmount ?? 0, l.total ?? 0, l.costPrice ?? 0]);
      });
    });
    addSheet(wb, EXPORT_LABELS.pos_lignes_vente.sheet,
      ['N° Transaction', 'Date', 'Statut', 'Désignation', 'Produit', 'Qté', 'PU', 'Remise %', 'Remise montant', 'Total ligne', 'Coût unitaire'], rows);
  }
  if (set.has('pos_paiements')) {
    const fromTx: (string | number)[][] = [];
    (data.posTransactions || []).forEach(t => {
      (t.payments || []).forEach(p => {
        fromTx.push([fmt(t.transactionNumber), fmtDate(t.date), fmt(p.method), p.amount ?? 0, fmt(p.reference)]);
      });
    });
    const standalone = (data.posPayments || []).map(p => [fmt(p.transactionId), '', fmt(p.method), p.amount ?? 0, fmt(p.reference)]);
    addSheet(wb, EXPORT_LABELS.pos_paiements.sheet,
      ['N° Transaction', 'Date', 'Moyen', 'Montant', 'Référence'], [...fromTx, ...standalone]);
  }
  if (set.has('pos_retours')) {
    addSheet(wb, EXPORT_LABELS.pos_retours.sheet,
      ['N° Retour', 'Date', 'Transaction origine', 'Type', 'Statut', 'Total remboursé', 'Total échange', 'Reste à payer', 'Méthode', 'Motif lignes'],
      (data.posReturns || []).map(r => [fmt(r.returnNumber), fmtDate(r.date), fmt(r.transactionId), fmt(r.type), fmt(r.status), r.totalRefund ?? 0, r.totalExchange ?? 0, r.amountToPay ?? 0, fmt(r.refundMethod), (r.lines || []).map(l => `${l.description} x${l.quantity} (${l.reason})`).join(' | ')]));
  }
  if (set.has('pos_mouvements_stock')) {
    addSheet(wb, EXPORT_LABELS.pos_mouvements_stock.sheet,
      ['Date', 'Produit', 'Type', 'Quantité', 'Référence', 'Créé par', 'Notes'],
      (data.posStockMovements || []).map(m => [fmtDate(m.date), nameById.get(m.productId) || fmt(m.productId), fmt(m.type), m.quantity ?? 0, fmt(m.reference), fmt(m.createdBy), fmt(m.notes)]));
  }
  if (set.has('pos_sessions_caisse')) {
    addSheet(wb, EXPORT_LABELS.pos_sessions_caisse.sheet,
      ['Ouverte le', 'Fermée le', 'Caissier', 'Fond initial', 'Montant final', 'Montant attendu', 'Écart', 'Statut'],
      (data.posCashSessions || []).map(s => [fmtDate(s.openedAt), fmtDate(s.closedAt), fmt(s.cashierId), s.initialFund ?? 0, s.finalAmount ?? 0, s.expectedAmount ?? 0, s.difference ?? 0, fmt(s.status)]));
  }
  if (set.has('pos_fournisseurs')) {
    addSheet(wb, EXPORT_LABELS.pos_fournisseurs.sheet,
      ['Nom', 'Contact', 'Téléphone', 'Email', 'Adresse'],
      (data.posSuppliers || []).map(s => [fmt(s.name), fmt(s.contact), fmt(s.phone), fmt(s.email), fmt(s.address)]));
  }
  if (set.has('crm_tiers')) {
    addSheet(wb, EXPORT_LABELS.crm_tiers.sheet,
      ['Type', 'Nom', 'Téléphone', 'Email', 'Adresse', 'Ville', 'Créé par', 'Créé le'],
      (data.crmTiers || []).map(t => [fmt(t.type), fmt(t.nom), fmt(t.telephone), fmt(t.email), fmt(t.adresse), fmt(t.ville), fmt(t.cree_par_nom), fmtDate(t.created_at)]));
  }
  if (set.has('crm_commerciaux')) {
    addSheet(wb, EXPORT_LABELS.crm_commerciaux.sheet,
      ['Nom', 'Téléphone', 'Email', 'Taux commission défaut %', 'Total ventes', 'Contrats clos'],
      (data.crmCommerciaux || []).map(c => [fmt(c.nom), fmt(c.telephone), fmt(c.email), c.taux_commission_defaut ?? 0, c.total_ventes ?? 0, c.contrats_clos_count ?? 0]));
  }
  if (set.has('crm_prestations')) {
    addSheet(wb, EXPORT_LABELS.crm_prestations.sheet,
      ['Référence', 'Client', 'Commercial', 'Apporteur', 'Désignation', 'Qté', 'Coût unitaire', 'Coût final', 'PU vente', 'Prix final', 'Marge interne', 'Taux apporteur % (prix final)', 'Comm. apporteur', 'Mode resp.', 'Taux resp. % (marge)', 'Comm. resp.', 'Mode commercial', 'Taux commercial % (marge)', 'Comm. commercial', 'Bénéfice net', 'Statut', 'Date commande', 'Date validation'],
      (data.crmPrestations || []).map(p => [fmt(p.reference), fmt(p.client_nom), fmt(p.commercial_nom), fmt(p.apporteur_nom), fmt(p.designation), p.quantite ?? 0, p.cout_unitaire_achat ?? 0, p.cout_final_achat ?? 0, p.prix_vente_unitaire ?? 0, p.prix_client_final ?? 0, p.marge_interne ?? 0, p.taux_commission_app ?? 0, p.commission_apporteur ?? 0, fmt((p as any).mode_commission_resp), (p as any).taux_commission_resp ?? 0, p.commission_resp_service ?? 0, fmt((p as any).mode_commission_agent), (p as any).taux_commission_agent ?? 0, p.commission_agent ?? 0, p.benefice_net ?? 0, fmt(p.statut), fmtDate(p.date_commande), fmtDate(p.date_validation)]));
  }
  if (set.has('crm_caisse')) {
    addSheet(wb, EXPORT_LABELS.crm_caisse.sheet,
      ['Date', 'Type', 'Catégorie', 'Motif', 'Montant', 'Mode règlement', 'Bénéficiaire / Émetteur', 'Réf pièce', 'Créé par'],
      (data.crmCaisse || []).map(m => [fmtDate(m.date_mouvement || m.date), fmt(m.type), fmt(m.categorie), fmt(m.motif), m.montant ?? 0, fmt(m.mode_reglement), fmt(m.beneficiaire_emetteur), fmt(m.reference_piece), fmt(m.cree_par_nom)]));
  }
  if (set.has('crm_commissions')) {
    addSheet(wb, EXPORT_LABELS.crm_commissions.sheet,
      ['Prestation', 'Bénéficiaire', 'Type bénéficiaire', 'Montant', 'Statut', 'Date règlement', 'Mode règlement'],
      (data.crmCommissions || []).map(c => [fmt(c.prestation_ref || c.prestation_id), fmt(c.beneficiaire_nom), fmt(c.type_beneficiaire || c.type), c.montant ?? c.montant_commission ?? 0, fmt(c.statut), fmtDate(c.date_reglement), fmt(c.mode_reglement)]));
  }
  if (set.has('crm_catalogue')) {
    addSheet(wb, EXPORT_LABELS.crm_catalogue.sheet,
      ['Code', 'Désignation', 'Catégorie', 'Type', 'Stock', 'Seuil alerte', 'Coût achat', 'PU vente', 'Unité'],
      (data.crmArticles || []).map(a => [fmt(a.code_article), fmt(a.designation), fmt(a.categorie), fmt(a.type_article), a.quantite_stock ?? 0, a.seuil_alerte ?? 0, a.cout_unitaire_achat ?? 0, a.prix_unitaire_vente ?? 0, fmt(a.unite)]));
  }
  if (set.has('crm_maintenance')) {
    addSheet(wb, EXPORT_LABELS.crm_maintenance.sheet,
      ['Référence', 'Client', 'Site / Agence', 'Équipement', 'Priorité', 'Qté', 'PU', 'Total', 'Technicien', 'Statut', 'Date intervention'],
      (data.crmMaintenance || []).map(m => [fmt(m.reference), fmt(m.client_nom), fmt(m.site_agence), fmt(m.equipement), fmt(m.priorite), m.quantite ?? 0, m.prix_unitaire ?? m.prix ?? 0, m.prix_total ?? 0, fmt(m.technicien_assigne), fmt(m.statut), fmtDate(m.date_intervention)]));
  }
  if (set.has('crm_techniciens')) {
    addSheet(wb, EXPORT_LABELS.crm_techniciens.sheet,
      ['Nom', 'Téléphone', 'Email', 'Spécialité', 'Statut'],
      (data.crmTechniciens || []).map(t => [fmt(t.nom), fmt(t.telephone), fmt(t.email), fmt(t.specialite), fmt(t.statut)]));
  }
  if (set.has('crm_factures')) {
    addSheet(wb, EXPORT_LABELS.crm_factures.sheet,
      ['N° Facture', 'Client', 'Commercial', 'Service', 'Catégorie', 'Émission', 'Livraison', 'Paiement', 'Total à payer', 'Coût utilisé', 'Marge brute', 'Commission', 'Marge HINOV', 'Payé', 'Reste', 'Statut'],
      (data.invoices || []).map(inv => {
        const total = inv.totalAmount ?? inv.total_amount ?? 0;
        const cost = inv.costAmount ?? inv.cost_amount ?? 0;
        const paid = inv.amountPaid ?? inv.amount_paid ?? 0;
        return [fmt(inv.invoiceNumber || inv.invoice_number), fmt(inv.clientName || inv.client_nom), fmt(inv.commercialName || inv.commercial_nom), fmt(inv.serviceName || inv.service_nom), fmt(inv.category), fmtDate(inv.issueDate || inv.issue_date), fmtDate(inv.deliveryDate || inv.delivery_date), fmtDate(inv.paymentDate || inv.payment_date), total, cost, inv.grossMargin ?? inv.gross_margin ?? (total - cost), inv.commissionAmount ?? inv.commission_amount ?? 0, inv.hinovMargin ?? inv.hinov_margin ?? 0, paid, inv.remainingAmount ?? inv.remaining_amount ?? Math.max(0, total - paid), fmt(inv.status)];
      }));
  }
  if (set.has('crm_clients')) {
    addSheet(wb, EXPORT_LABELS.crm_clients.sheet,
      ['Nom', 'Société', 'Contact', 'Téléphone', 'Email', 'Adresse', 'Statut', 'Créé le'],
      (data.clients || []).map(c => [fmt(c.name), fmt(c.company), fmt(c.contact), fmt(c.phone), fmt(c.email), fmt(c.address), fmt(c.status), fmtDate(c.createdAt)]));
  }
  if (set.has('crm_devis')) {
    addSheet(wb, EXPORT_LABELS.crm_devis.sheet,
      ['N° Devis', 'Objet', 'Client', 'Statut', 'Date', 'Sous-total', 'Total', 'Échéance'],
      (data.quotes || []).map(q => [fmt(q.quoteNumber), fmt(q.subject), fmt(q.clientId), fmt(q.status), fmtDate(q.date), q.subtotal ?? 0, q.total ?? 0, fmtDate(q.validUntil)]));
  }
  if (set.has('crm_ventes')) {
    addSheet(wb, EXPORT_LABELS.crm_ventes.sheet,
      ['N° Vente', 'Client', 'Statut', 'Date', 'Sous-total', 'Total', 'Échéance'],
      (data.sales || []).map(s => [fmt(s.saleNumber), fmt(s.clientId), fmt(s.status), fmtDate(s.date), s.subtotal ?? 0, s.total ?? 0, fmtDate(s.dueDate)]));
  }

  // Si rien sélectionné (ne devrait pas arriver), éviter un fichier vide
  if (wb.SheetNames.length === 0) {
    addSheet(wb, 'INFO', ['Message'], [['Aucune donnée sélectionnée']]);
  }
  return wb;
}

export function exportPosCrmExcel(data: PosCrmExportData, keys: ExportKey[]): string {
  const wb = buildPosCrmWorkbook(data, keys);
  const date = new Date().toISOString().split('T')[0];
  const scope = keys.length === ALL_EXPORT_KEYS.length ? 'complet' : `${keys.length}-modules`;
  const fileName = `export-POS-CRM-${scope}-${date}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}
