import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { db, ensureDbHealth } from '../lib/db';
import { queueSyncAction, processSyncQueue, reconcileLocalPosDataWithCloud, reconcileAllOfflineDataWithCloud, resolveProductUuid, isRetiredServicePayload, getProductRemap, setProductRemap, applyProductRemapToAction } from '../lib/sync';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { isProductComplete } from '../features/products/services/ProductService';
import type { ProductPersistence } from '../features/products/data/repositories/ProductRepository';
import { productService } from '../features/products/services/ProductService';
import { toLocalDayKey } from '../lib/dates';
import { platform } from '../platform';

const isUuid = (value?: string) => !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const dedupeUsers = (list: User[]): User[] => {
  const byId = new Map<string, User>();
  for (const u of list) {
    if (u?.id && !byId.has(u.id)) byId.set(u.id, u);
  }
  const seenEmail = new Set<string>();
  const out: User[] = [];
  for (const u of byId.values()) {
    const k = (u.email || '').trim().toLowerCase();
    if (k) {
      if (seenEmail.has(k)) continue;
      seenEmail.add(k);
    }
    out.push(u);
  }
  return out;
};

const mergeData = <T extends { id: string }>(oldData: T[] | null | undefined, newData: T[]): T[] => {
  if (!oldData || oldData.length === 0) return newData || [];
  if (!newData || newData.length === 0) return oldData;
  const map = new Map(oldData.map(item => [item.id, item]));
  for (const item of newData) {
    const existing = map.get(item.id);
    if (existing) {
      map.set(item.id, { ...existing, ...item });
    } else {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
};

// Garde B7 générique (B1-B5) : ne jamais écraser des enfants locaux non vides
// (lignes, paiements) par un vide serveur (insertion partielle, RLS). Retourne
// les objets fusionnés + les ids à remettre en file pour auto-réparation.
const mergeKeepChildren = <T extends { id: string }>(
  local: T[] | null | undefined,
  parsed: T[],
  childKeys: string[]
): { merged: T[]; healedIds: string[] } => {
  const base = mergeData(local, parsed);
  const localById = new Map((local || []).map(t => [t.id, t]));
  const parsedById = new Map(parsed.map(t => [t.id, t]));
  const healedIds: string[] = [];
  const merged = base.map(t => {
    const l = localById.get(t.id);
    const p = parsedById.get(t.id);
    if (!l || !p) return t;
    let changed = false;
    const next: any = { ...t };
    for (const k of childKeys) {
      const serverEmpty = !Array.isArray((p as any)[k]) || (p as any)[k].length === 0;
      const localFull = Array.isArray((l as any)[k]) && (l as any)[k].length > 0;
      if (serverEmpty && localFull) {
        next[k] = (l as any)[k];
        changed = true;
      }
    }
    if (changed) healedIds.push(t.id);
    return next;
  });
  return { merged, healedIds };
};

// Toasts d'erreurs sync déjà affichés (clé entité -> timestamp) : anti-boucle.
// Fenêtre glissante pour plafonner les rafales (commune à tous les montages).
const toastedSyncErrorKeys = new Map<string, number>();
const toastSyncWindow: number[] = [];
const TOAST_SYNC_COOLDOWN_MS = 10 * 60 * 1000;
const TOAST_SYNC_MAX_PER_MIN = 3;

// Tables sans colonne created_at en prod : le .order() systématique de
// safeFetchAll échoue en 400 et double les requêtes à chaque refresh.
// Liste pré-renseignée (constaté en prod) + détection dynamique au cas par cas.
// Rater le tri n'est jamais bloquant : l'ordre ne sert qu'à stabiliser la pagination.
const tablesWithoutCreatedAt = new Set<string>([
  'profiles',
  'prestations',
  'categories',
  'classements',
  'prospect_activities',
  'prospect_follow_ups',
  'pos_cash_sessions',
  'pos_payments',
  'pos_stock_movements',
]);

// Remet en file les objets dont les enfants ont été protégés, pour que le
// serveur soit réparé (chemins résilients). Best-effort, jamais bloquant.
// Anti-boucle : chaque entité n'est remise en file qu'une fois toutes les 6h
// (marqueur persistant) — en cas d'échec persistant, le rejeu passe par la
// page Erreurs (manuel) ou la réconciliation avec backoff.
const HEAL_MARK_KEY = 'hinov_heal_queue_v1';
const HEAL_MARK_TTL_MS = 6 * 60 * 60 * 1000;
const healQueueMissingChildren = async (
  localById: Map<string, any>,
  healedIds: string[],
  actionType: string
) => {
  if (healedIds.length === 0) return;
  try {
    let marks: Record<string, number> = {};
    try {
      marks = JSON.parse(localStorage.getItem(HEAL_MARK_KEY) || '{}');
    } catch {}
    const now = Date.now();
    const todo = healedIds.filter(id => !marks[id] || now - marks[id] > HEAL_MARK_TTL_MS);
    if (todo.length === 0) return;
    const queue = (await db.syncQueue.getItem<any[]>('queue').catch(() => null)) || [];
    const queuedIds = new Set(queue.filter(a => a?.type === actionType).map(a => a?.payload?.id));
    for (const id of todo) {
      const local = localById.get(id)!;
      if (local && !queuedIds.has(id)) {
        await queueSyncAction(actionType as any, local);
        marks[id] = now;
      }
    }
    try {
      localStorage.setItem(HEAL_MARK_KEY, JSON.stringify(marks));
    } catch {}
  } catch { /* le local reste protégé dans tous les cas */ }
};

import type { 
  ClientFournisseur, AgentCommercial, PrestationCommande, 
  MouvementCaisse, CommissionPrestation, CatalogueArticle, MouvementStock,
  InterventionMaintenance, TechnicienMaintenance, ModeReglement,
  Invoice, InvoiceItem, InvoicePayment, InvoiceStatus
} from '../types/crmModules';
export * from '../types/crmModules';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Directeur' | 'Directeur adjoint' | 'Responsable' | 'Commercial' | 'Caissier' | 'Gerant' | 'Encaisseur' | 'SuperAdmin';
  posRole?: 'Directeur' | 'Gerant' | 'Caissier' | null;
  serviceId?: string;
  pin: string;
  lastLogin?: string;
  active?: boolean;
  photo?: string;
  posReturnsEnabled?: boolean;
  posCatalogueEnabled?: boolean;
  posSupplyEnabled?: boolean;
  posInventoryEnabled?: boolean;
  posStockEnabled?: boolean;
  // CRM Modules Responsables Permissions
  crmPrestationsEnabled?: boolean;
  crmCaisseEnabled?: boolean;
  crmMaintenanceEnabled?: boolean;
  crmStocksEnabled?: boolean;
  crmTiersEnabled?: boolean;
  crmCommerciauxEnabled?: boolean;
  crmCommissionsEnabled?: boolean;
  crmFacturationEnabled?: boolean;
  crmSupFacturesEnabled?: boolean;
  crmReportsEnabled?: boolean;
  crmTeamReportsEnabled?: boolean;
}
export interface Client { id: string; name: string; email: string; phone: string; contact: string; company: string; address: string; status?: string; commercialId?: string; serviceId?: string; createdAt?: string; }
export interface Service { id: string; name: string; description: string; members?: number; managerId?: string; commissionRate?: number; }
export interface Category { id: string; serviceId: string; name: string; }
export interface Prestation { id: string; code: string; name: string; description: string; price: number; serviceId: string; unit?: string; costPrice?: number; }
export interface QuoteLine { id: string; prestationId: string; description: string; quantity: number; unit?: string; unitPrice: number; total: number; discountPercent?: number; costPrice?: number; }
export interface Quote { id: string; quoteNumber: string; clientId: string; commercialId: string; serviceId?: string; subject: string; lines: QuoteLine[]; subtotal: number; total: number; status: 'Brouillon' | 'Envoyé' | 'Accepté' | 'Refusé' | 'Révision'; date: string; validUntil?: string; paymentTerms?: string; notes?: string; signatoryName?: string; signatoryRole?: string; style?: 'Classique' | 'Moderne' | 'Minimaliste'; accentColor?: string; discountPercent?: number; discountAmount?: number; clientComment?: string; }
export interface SaleLine { id: string; description: string; quantity: number; unitPrice: number; costPrice?: number; total: number; }
export interface Sale { id: string; saleNumber: string; quoteId?: string; clientId: string; serviceId?: string; commercialId?: string; dueDate?: string; lines: SaleLine[]; subtotal: number; total: number; status: 'Enregistrée' | 'Payée' | 'Annulée'; date: string; notes?: string; }
export interface Installment { id: string; saleId: string; amount: number; dueDate: string; paidAmount: number; status: 'En attente' | 'Payée'; paidAt?: string; }
export type InstallmentInput = { id?: string; amount: number; dueDate: string };

export type PaymentType = 'ENCAISSEMENT' | 'REMBOURSEMENT';
export type PaymentMethod = 'Virement Bancaire' | 'Chèque' | 'Espèces' | 'Mobile Money' | 'Traite';
export interface FacturePaiement {
  id: string;
  paymentNumber: string;
  paymentType: PaymentType;
  venteId: string;
  echeanceId?: string;
  clientId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  proofDocumentId?: string;
  notes?: string;
  status: 'VALIDE' | 'REJETE' | 'ANNULE';
  recordedBy?: string;
  createdAt?: string;
}

export type CostType = 'DIRECT' | 'INDIRECT';
export type CostCategory = 
  | 'SOUS_TRAITANCE' 
  | 'ACHAT_MATERIEL' 
  | 'TRANSPORT' 
  | 'LOGICIEL_LICENCE' 
  | 'HONORAIRES' 
  | 'LOYER_CHARGES' 
  | 'TELECOM' 
  | 'AUTRE';

export interface Cout {
  id: string;
  reference: string;
  costType: CostType;
  category: CostCategory;
  amountHt: number;
  vatRate: number;
  vatAmount: number;
  amountTtc: number;
  date: string;
  affaireId?: string;
  serviceId: string;
  supplierName?: string;
  invoiceRef?: string;
  description: string;
  proofDocumentId?: string;
  status: 'ENGAGE' | 'VALIDE' | 'PAYE' | 'ANNULE';
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type PeriodType = 'MENSUEL' | 'TRIMESTRIEL' | 'ANNUEL';

export interface ScoringRule {
  id: string;
  serviceId?: string;
  role: string;
  weightMargin: number;
  weightRevenue: number;
  weightVolume: number;
  weightConversion: number;
  isActive: boolean;
}

export interface Objectif {
  id: string;
  profileId: string;
  serviceId: string;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  targetRevenueHt: number;
  targetMarginHt: number;
  targetDealsCount: number;
  targetNewClients: number;
  status: 'EN_COURS' | 'ATTEINT' | 'NON_ATTEINT' | 'ANNULE';
  createdBy?: string;
  createdAt?: string;
}

export interface Classement {
  id: string;
  profileId: string;
  serviceId: string;
  periodType: PeriodType;
  periodKey: string;
  score: number;
  rank: number;
  revenueAchievedHt: number;
  marginAchievedHt: number;
  dealsWonCount: number;
  conversionRate: number;
  updatedAt?: string;
}

export type PrimeType = 'PERFORMANCE' | 'CHALLENGE' | 'EXCEPTIONNELLE';
export type PrimeStatus = 'PROPOSEE' | 'VALIDEE' | 'PAYEE' | 'REJETEE';

export interface Prime {
  id: string;
  reference: string;
  profileId: string;
  serviceId: string;
  periodKey: string;
  primeType: PrimeType;
  amount: number;
  status: PrimeStatus;
  calculatedBy?: string;
  validatedBy?: string;
  justification?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PrimeAuditLog {
  id: string;
  primeId: string;
  action: 'CREATION' | 'MODIFICATION' | 'VALIDATION' | 'REJET' | 'PAIEMENT';
  actorId: string;
  actorRole: string;
  previousState?: any;
  newState?: any;
  comment?: string;
  createdAt?: string;
}

export interface Commission {
  id: string;
  saleId?: string;
  clientId?: string;
  commercialId?: string;
  serviceId?: string;
  totalHt: number;
  costTotal: number;
  marginAmount: number;
  marginPercent: number;
  commissionPercent: number;
  commissionAmount: number;
  paidAmount?: number;
  eligibleAmount?: number;
  notes?: string;
  status: 'En attente' | 'Validée' | 'Payée' | 'Annulée';
  createdAt: string;
}
export interface Prospect { id: string; prospectNumber: string; commercialId: string; serviceId?: string; categoryId?: string; type: 'Entreprise' | 'Particulier'; name: string; company?: string; phone?: string; email?: string; address?: string; city?: string; source?: string; interestLevel: 'Faible' | 'Moyen' | 'Élevé' | 'Très élevé'; budget: number; need?: string; comments?: string; status: 'Nouveau' | 'Premier contact' | 'Besoin identifié' | 'Rendez-vous' | 'Offre en préparation' | 'Négociation' | 'À convertir' | 'Converti' | 'Perdu'; responsibleId?: string; createdAt: string; updatedAt: string; }
export interface ProspectActivity { id: string; prospectId: string; type: 'Appel' | 'Email' | 'Visite' | 'Réunion' | 'Démonstration' | 'Compte rendu' | 'Autre'; description?: string; date: string; createdBy?: string; }
export interface ProspectFollowUp { id: string; prospectId: string; date: string; time?: string; priority: 'Basse' | 'Moyenne' | 'Haute' | 'Urgente'; observation?: string; status: 'En attente' | 'Terminée' | 'Annulée'; }
export interface AppSettings { companyName: string; companyLogo: string; companyAddress: string; companySiret: string; companyTva: string; defaultTerms: string; headerLogoBase64?: string; companyStampBase64?: string; defaultValidity?: number; siteUrl?: string; commissionRate?: number; companyCapital?: string; companyPhone?: string; companyEmail?: string; bankIban?: string; }

export interface ActivityReport { id: string; authorId: string; role: User['role']; type: 'Activité' | 'Prospection'; date: string; realisations: string; difficultes: string; remarques: string; createdAt?: string; updatedAt?: string; }

export interface WeeklyReport { id: string; authorId: string; role: User['role']; weekStart: string; sections: { type: 'Activité' | 'Prospection'; content: string }[]; kpis: Record<string, number>; status: 'Brouillon' | 'Envoyé' | 'Relu'; sentAt?: string; createdAt?: string; }

export interface V2Task {
  id: string;
  title?: string;
  description: string;
  category?: string;
  status: 'Effectuée' | 'En cours' | 'Restante' | 'Bloquée';
  difficulty?: string;
  affaireId?: string;
  clientId?: string;
  timeSpent?: string;
}
export interface V2DailyReport {
  id: string;
  authorId: string;
  date: string;
  project: string;
  objectives: string;
  tasks: V2Task[];
  results: string;
  difficulties: string;
  observations: string;
  status: 'Brouillon' | 'Soumis' | 'Validé';
  isLocked?: boolean;
  category?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface V2WeeklyReport {
  id: string;
  authorId: string;
  weekStart: string;
  weekEnd?: string;
  project?: string;
  dailyReportIds?: string[];
  weeklyObjectives: string;
  tasksByDay: Record<string, V2Task[]>;
  pendingTasks?: V2Task[];
  aiSummary?: string;
  achievements?: string;
  difficulties?: string;
  summary?: string;
  nextWeekObjectives: string;
  conclusion?: string;
  status: 'Brouillon' | 'Soumis' | 'Validé' | 'Relu';
  directorComment?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  isLocked?: boolean;
  pdfUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}
// POS Interfaces
export interface PosCategory { id: string; name: string; family: 'Livre' | 'Fourniture' | 'Service'; }
export interface PosBrand { id: string; name: string; }
export interface PosSupplier { id: string; name: string; contact?: string; phone?: string; email?: string; address?: string; }
export interface PosProduct { id: string; reference: string; barcode?: string; isbn?: string; name: string; family?: 'Livre' | 'Fourniture' | 'Service'; categoryId?: string; brandId?: string; supplierId?: string; purchasePrice: number; sellingPrice: number; quantity: number; minStock: number; imageUrl?: string; description?: string; status?: 'Active' | 'Inactive'; isActive: boolean; unit?: string; createdAt?: string; updatedAt?: string; }
export interface PosStockEntryLine { id: string; productId: string; quantity: number; purchasePrice: number; total: number; }
export interface PosStockEntry { id: string; reference: string; supplierId?: string; date: string; totalAmount: number; status: 'Brouillon' | 'Validé' | 'Annulé'; notes?: string; createdBy?: string; lines: PosStockEntryLine[]; }
export interface PosInventoryLine { id: string; productId: string; expectedQty: number; countedQty: number; difference: number; }
export interface PosInventory { id: string; reference: string; date: string; status: 'En cours' | 'Terminé' | 'Annulé'; notes?: string; createdBy?: string; lines: PosInventoryLine[]; }
export interface PosCashSession { id: string; cashierId?: string; openedAt: string; closedAt?: string; initialFund: number; finalAmount?: number; expectedAmount?: number; difference?: number; status: 'Ouverte' | 'Fermée'; }
export interface PosTransactionLine { id: string; productId?: string; description: string; quantity: number; unitPrice: number; discountPercent: number; discountAmount: number; total: number; costPrice?: number; }
export interface PosTransaction { id: string; transactionNumber: string; cashierId?: string; sessionId?: string; date: string; subtotal: number; vat: number; discountAmount: number; total: number; receivedAmount?: number; changeAmount?: number; status: 'Validée' | 'Annulée' | 'Retournée'; lines: PosTransactionLine[]; payments: PosPayment[]; }
export interface PosPayment { id: string; transactionId?: string; method: 'Espèces' | 'Mobile Money' | 'Mixte'; amount: number; reference?: string; }
export interface PosDiscount { id: string; name: string; type: 'Pourcentage' | 'Montant'; value: number; maxPercent?: number; maxAmount?: number; active: boolean; }
export interface PosReturnLine { id: string; productId?: string; description: string; quantity: number; unitPrice: number; total: number; reason: string; }
export interface ExchangeLine { id: string; productId: string; description: string; quantity: number; unitPrice: number; total: number; }
export interface PosReturn { id: string; returnNumber: string; transactionId?: string; sessionId?: string; date: string; type: 'Retour simple' | 'Retour avec échange'; totalRefund: number; totalExchange: number; amountToPay: number; refundMethod?: 'Espèces' | 'Mobile Money'; complementTransactionId?: string; status: 'En attente' | 'Traité' | 'Annulé'; lines: PosReturnLine[]; exchangeLines?: ExchangeLine[]; notes?: string; createdBy?: string; }
export interface PosCartItem { id: string; productId: string; name: string; reference: string; unitPrice: number; quantity: number; discountType: 'none' | 'percent' | 'amount'; discountPercent: number; discountAmount: number; total: number; }
  export interface SuspendedCart { id: string; reference?: string; date: string; cart: PosCartItem[]; discountType?: 'none' | 'percent' | 'amount'; discountValue?: number; }

// Product Module Interfaces
export interface PosStockMovement { id: string; productId: string; type: 'Vente' | 'Retour' | 'Approvisionnement' | 'Inventaire' | 'Ajustement Manuel'; quantity: number; reference?: string; date: string; createdBy?: string; notes?: string; }
export interface ProductCompletion { id: string; productId: string; missingField: 'family' | 'category' | 'brand' | 'supplier' | 'image' | 'description' | 'minStock'; currentValue: string; suggestedValue: string; createdAt: string; }
export interface ImportSession { id: string; filename: string; status: 'pending' | 'in_progress' | 'completed' | 'failed'; totalRows: number; processedRows: number; successfulCreations: number; successfulUpdates: number; ignoredRows: number; errors: ImportError[]; createdAt: string; completedAt?: string; }
export interface ImportError { row: number; field: string; value: string; error: string; severity: 'error' | 'warning'; sessionId?: string; }
export interface ImportReport { session: ImportSession; productsCreated: number; productsUpdated: number; productsIgnored: number; brandsCreated: number; suppliersCreated: number; totalErrors: number; totalWarnings: number; importDurationMs: number; }
export interface ProductCompletionFilters { noFamily: boolean; noCategory: boolean; noBrand: boolean; noSupplier: boolean; noImage: boolean; noBarcode: boolean; noIsbn: boolean; minStockExceeded: boolean; }

// CRM Documents
export interface CrmFolder {
  id: string;
  name: string;
  ownerId: string;
  parentId?: string;
  color?: string; // Hex color code e.g. '#1879C8', '#2563EB', '#7C3AED'
  isShared?: boolean;
  createdAt: string;
}

export interface CrmDocument {
  id: string;
  name: string;
  type: string;
  sizeBytes: number;
  filePath: string;
  uploaderId?: string;
  folderId?: string;
  clientId?: string;
  category?: 'Contrat / Devis signé' | 'Bon de Commande' | 'BAT / Maquette' | 'Facture / Reçu' | 'Rapport' | 'Autre';
  isShared?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  link?: string;
  created_at: string;
}

export interface PosSettings { 
  libraryName: string; 
  address: string; 
  phone: string; 
  email: string; 
  currency: string; 
  ticketMessage: string; 
  printerType: string;
  whatsappOrderPhone?: string;
  catalogBannerText?: string;
  themeColor?: string;
}
export interface PosWorkspace { active: boolean; }

interface AppState {
  users: User[]; clients: Client[]; quotes: Quote[]; sales: Sale[]; facturePaiements: FacturePaiement[]; couts: Cout[]; commissions: Commission[]; installments: Installment[];
  scoringRules: ScoringRule[]; objectifs: Objectif[]; classements: Classement[]; primes: Prime[]; primeAuditLogs: PrimeAuditLog[];
  prospects: Prospect[]; prospectActivities: ProspectActivity[]; prospectFollowUps: ProspectFollowUp[]; categories: Category[]; settings: AppSettings; services: Service[]; prestations: Prestation[]; loading: boolean; activityReports: ActivityReport[]; weeklyReports: WeeklyReport[]; crmDocuments: CrmDocument[]; crmFolders: CrmFolder[]; v2DailyReports: V2DailyReport[]; v2WeeklyReports: V2WeeklyReport[]; notifications: AppNotification[];
  // POS
  posCategories: PosCategory[]; posBrands: PosBrand[]; posSuppliers: PosSupplier[]; posProducts: PosProduct[];
  posStockEntries: PosStockEntry[]; posInventories: PosInventory[]; posCashSessions: PosCashSession[];
  posStockMovements: PosStockMovement[];
  posTransactions: PosTransaction[]; posPayments: PosPayment[];   posDiscounts: PosDiscount[]; posSettings: PosSettings;
  posReturns: PosReturn[]; addPosReturn: (ret: PosReturn) => Promise<void>; updatePosReturn: (id: string, data: Partial<PosReturn>) => Promise<void>; cancelPosReturn: (id: string) => Promise<boolean>;
  suspendedCarts: SuspendedCart[]; addSuspendedCart: (cart: SuspendedCart) => void; removeSuspendedCart: (id: string) => void;
  // Product Module
  productCompletions: ProductCompletion[]; importSessions: ImportSession[];
  posWorkspace: PosWorkspace; setPosWorkspace: (w: PosWorkspace) => void;
  addClient: (client: Client) => Promise<void>;
  updateClient: (id: string, client: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  recordPayment: (paymentData: Omit<FacturePaiement, 'id' | 'paymentNumber' | 'createdAt'> | FacturePaiement) => Promise<FacturePaiement>;
  addCout: (coutData: Omit<Cout, 'id' | 'reference' | 'vatAmount' | 'amountTtc' | 'createdAt' | 'updatedAt'> | Cout) => Promise<Cout>;
  updateCout: (id: string, data: Partial<Cout>) => Promise<void>;
  deleteCout: (id: string) => Promise<void>;
  addObjectif: (obj: Omit<Objectif, 'id' | 'createdAt'> | Objectif) => Promise<Objectif>;
  updateObjectif: (id: string, data: Partial<Objectif>) => Promise<void>;
  deleteObjectif: (id: string) => Promise<void>;
  proposePrime: (primeData: Omit<Prime, 'id' | 'reference' | 'status' | 'createdAt' | 'updatedAt'>, comment?: string) => Promise<Prime>;
  validatePrime: (primeId: string, comment?: string) => Promise<void>;
  rejectPrime: (primeId: string, comment?: string) => Promise<void>;
  payPrime: (primeId: string, comment?: string) => Promise<void>;
  updateScoringRule: (id: string, data: Partial<ScoringRule>) => Promise<void>;
  addQuote: (quote: Quote) => Promise<void>;
  updateQuote: (id: string, quote: Quote) => Promise<void>;
  updateQuoteStatus: (id: string, status: Quote['status'], clientComment?: string) => Promise<void>;
  deleteQuote: (id: string) => Promise<void>;
  addSale: (sale: Sale, installments?: InstallmentInput[]) => Promise<void>;
  updateSaleStatus: (id: string, status: Sale['status']) => Promise<void>;
  updateSale: (id: string, sale: Sale) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  recordInstallmentPayment: (installmentId: string, amount: number) => Promise<void>;
  saveInstallmentsForSale: (saleId: string, items: InstallmentInput[]) => Promise<void>;
  addCommission: (commission: Commission) => Promise<void>;
  updateCommissionStatus: (id: string, status: Commission['status'], paidAmount?: number, notes?: string) => Promise<void>;
  deleteCommission: (id: string) => Promise<void>;
  addProspect: (prospect: Prospect) => Promise<void>;
  updateProspect: (id: string, data: Partial<Prospect>) => Promise<void>;
  deleteProspect: (id: string) => Promise<void>;
  convertProspect: (prospectId: string) => Promise<{ clientId: string }>;
  addProspectActivity: (activity: ProspectActivity) => Promise<void>;
  deleteProspectActivity: (id: string) => Promise<void>;
  addProspectFollowUp: (followUp: ProspectFollowUp) => Promise<void>;
  updateProspectFollowUp: (id: string, data: Partial<ProspectFollowUp>) => Promise<void>;
  deleteProspectFollowUp: (id: string) => Promise<void>;
  upsertActivityReport: (report: ActivityReport) => Promise<void>;
  deleteActivityReport: (id: string) => Promise<void>;
  saveWeeklyReport: (report: WeeklyReport) => Promise<void>;
  markWeeklyReportSent: (id: string) => Promise<void>;
  markWeeklyReportRead: (id: string) => Promise<void>;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  saveV2DailyReport: (report: V2DailyReport) => Promise<void>;
  saveV2WeeklyReport: (report: V2WeeklyReport) => Promise<void>;
  submitV2WeeklyReport: (reportOrId: V2WeeklyReport | string) => Promise<void>;
  sendWeeklyReportReminder: (userIds: string[], weekStart: string) => Promise<void>;
  reviewV2WeeklyReport: (id: string, comment?: string, status?: 'Validé' | 'Relu') => Promise<void>;
  deleteV2WeeklyReport: (id: string) => Promise<void>;
  deleteV2DailyReport: (id: string) => Promise<void>;
  updateMyProfile: (data: Partial<Pick<User, 'photo' | 'name'>>) => Promise<void>;
  addCrmDocument: (file: File, options?: { uploaderId?: string; folderId?: string; clientId?: string; category?: CrmDocument['category']; isShared?: boolean } | string, folderIdParam?: string) => Promise<CrmDocument>;
  updateCrmDocument: (id: string, updates: Partial<CrmDocument>, newFileBlob?: Blob) => Promise<void>;
  deleteCrmDocument: (id: string) => Promise<void>;
  downloadCrmDocument: (doc: CrmDocument) => Promise<void>;
  getCrmDocumentBlob: (doc: CrmDocument) => Promise<Blob | null>;
  addCrmFolder: (name: string, ownerId: string, parentId?: string, color?: string, isShared?: boolean) => Promise<CrmFolder>;
  updateCrmFolder: (id: string, data: Partial<CrmFolder>) => Promise<void>;
  deleteCrmFolder: (id: string) => Promise<void>;
  addCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  addUser: (user: User) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  toggleUserStatus: (id: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  addPrestation: (prestation: Prestation) => Promise<void>;
  updatePrestation: (id: string, data: Partial<Prestation>) => Promise<void>;
  deletePrestation: (id: string) => Promise<void>;
  addService: (service: Service) => Promise<void>;
  updateService: (id: string, service: Partial<Service>) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  // POS CRUD
  addPosCategory: (cat: PosCategory) => Promise<void>;
  updatePosCategory: (id: string, data: Partial<PosCategory>) => Promise<void>;
  deletePosCategory: (id: string) => Promise<boolean>;
  addPosBrand: (brand: PosBrand) => Promise<void>;
  updatePosBrand: (id: string, data: Partial<PosBrand>) => Promise<void>;
  deletePosBrand: (id: string) => Promise<boolean>;
  addPosSupplier: (supplier: PosSupplier) => Promise<void>;
  updatePosSupplier: (id: string, data: Partial<PosSupplier>) => Promise<void>;
  deletePosSupplier: (id: string) => Promise<boolean>;
  addPosProduct: (product: PosProduct) => Promise<void>;
  updatePosProduct: (id: string, data: Partial<PosProduct>) => Promise<void>;
  deletePosProduct: (id: string) => Promise<boolean>;
  mergePosProducts: (loserId: string, keeperId: string) => Promise<{ movedLines: number; message: string }>;
  repairLocalCatalog: () => Promise<{ remapped: number; dropped: number; rewrittenActions: number; message: string }>;
  // Catalogue central (mêmes produits que le POS)
  findProductByBarcode: (barcode: string) => PosProduct | undefined;
  findProductByReference: (reference: string) => PosProduct | undefined;
  searchProducts: (query: string) => PosProduct[];
  getIncompleteProducts: () => PosProduct[];
  updateProductBarcode: (id: string, barcode: string | null) => Promise<void>;
  updateProductImage: (id: string, imageUrl: string | null) => Promise<void>;
  importProducts: (products: PosProduct[], duplicates?: 'ignore' | 'update' | 'create') => Promise<{ created: number; updated: number; duplicates: number }>;
  addPosStockEntry: (entry: PosStockEntry) => Promise<void>;
  updatePosStockEntry: (id: string, data: Partial<PosStockEntry>) => Promise<void>;
  deletePosStockEntry: (id: string) => Promise<void>;
  addPosStockMovement: (movement: Omit<PosStockMovement, 'id' | 'date'>) => Promise<void>;
  addPosInventory: (inventory: PosInventory) => Promise<void>;
  updatePosInventory: (id: string, data: Partial<PosInventory>) => Promise<void>;
  deletePosInventory: (id: string) => Promise<void>;
  addPosCashSession: (session: PosCashSession) => Promise<void>;
  updatePosCashSession: (id: string, data: Partial<PosCashSession>) => Promise<void>;
  addPosTransaction: (tx: PosTransaction) => Promise<void>;
  updatePosTransaction: (id: string, data: Partial<PosTransaction>) => Promise<void>;
  voidPosTransaction: (id: string) => Promise<boolean>;
  clearPosSalesHistory: () => Promise<void>;
  deletePosMovementsByDateRange: (startDate: string, endDate: string) => Promise<void>;
  addPosDiscount: (discount: PosDiscount) => Promise<void>;
  updatePosDiscount: (id: string, data: Partial<PosDiscount>) => Promise<void>;
  deletePosDiscount: (id: string) => Promise<void>;
  updatePosSettings: (settings: PosSettings) => Promise<void>;
  // Product Module CRUD
  addProductCompletion: (completion: ProductCompletion) => Promise<void>;
  updateProductCompletion: (id: string, data: Partial<ProductCompletion>) => Promise<void>;
  deleteProductCompletion: (id: string) => Promise<void>;
  addImportSession: (session: ImportSession) => Promise<void>;
  updateImportSession: (id: string, data: Partial<ImportSession>) => Promise<void>;
  deleteImportSession: (id: string) => Promise<void>;
  addImportError: (error: ImportError) => Promise<void>;
  completeProduct: (productId: string, updates: Partial<PosProduct>) => Promise<void>;
  refreshData: (isBackground?: boolean) => Promise<void>;
  reconcilePosData: (opts?: { force?: boolean }) => Promise<any>;
  // CRM Modules Responsables
  crmTiers: ClientFournisseur[];
  crmCommerciaux: AgentCommercial[];
  crmPrestations: PrestationCommande[];
  crmCaisse: MouvementCaisse[];
  crmCommissions: CommissionPrestation[];
  crmArticles: CatalogueArticle[];
  crmStockMouvements: MouvementStock[];
  crmMaintenance: InterventionMaintenance[];
  crmTechniciens: TechnicienMaintenance[];
  addCrmTier: (tier: ClientFournisseur) => Promise<void>;
  updateCrmTier: (id: string, tier: Partial<ClientFournisseur>) => Promise<void>;
  deleteCrmTier: (id: string) => Promise<boolean>;
  addCrmCommercial: (comm: AgentCommercial) => Promise<void>;
  updateCrmCommercial: (id: string, comm: Partial<AgentCommercial>) => Promise<void>;
  deleteCrmCommercial: (id: string) => Promise<boolean>;
  addCrmPrestation: (prest: PrestationCommande) => Promise<void>;
  updateCrmPrestation: (id: string, prest: Partial<PrestationCommande>) => Promise<void>;
  deleteCrmPrestation: (id: string) => Promise<void>;
  encaisserCrmPrestation: (id: string, modeReglement?: string) => Promise<boolean>;
  addCrmMouvementCaisse: (mvt: MouvementCaisse) => Promise<void>;
  deleteCrmMouvementCaisse: (id: string) => Promise<boolean>;
  updateCrmCommissionStatus: (id: string, status: CommissionPrestation['statut']) => Promise<void>;
  payerCrmCommission: (id: string, modeReglement: string) => Promise<boolean>;
  addCrmArticle: (art: CatalogueArticle) => Promise<void>;
  updateCrmArticle: (id: string, art: Partial<CatalogueArticle>) => Promise<void>;
  deleteCrmArticle: (id: string) => Promise<void>;
  addCrmStockMouvement: (mvt: Omit<MouvementStock, 'id' | 'created_at'> & { id?: string }) => Promise<void>;
  addCrmIntervention: (interv: InterventionMaintenance) => Promise<void>;
  updateCrmIntervention: (id: string, interv: Partial<InterventionMaintenance>) => Promise<void>;
  deleteCrmIntervention: (id: string) => Promise<void>;
  addCrmTechnicien: (tech: TechnicienMaintenance) => Promise<void>;
  updateCrmTechnicien: (id: string, tech: Partial<TechnicienMaintenance>) => Promise<void>;
  deleteCrmTechnicien: (id: string) => Promise<boolean>;
  // Module Facturation Client
  invoices: Invoice[];
  invoicePayments: InvoicePayment[];
  addInvoice: (invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'> | Invoice) => Promise<Invoice>;
  updateInvoice: (id: string, data: Partial<Invoice>) => Promise<void>;
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  addInvoicePayment: (paymentData: Omit<InvoicePayment, 'id' | 'createdAt'> | InvoicePayment) => Promise<InvoicePayment>;
  deleteInvoicePayment: (paymentId: string) => Promise<void>;
}

  const defaultSettings: AppSettings = { companyName: 'Hinov', companyLogo: '', companyAddress: '', companySiret: '', companyTva: '', defaultTerms: '', commissionRate: 10 };

// Helper pour éviter tout blocage réseau infini sur les requêtes asynchrones (7.5s max)
const withTimeout = async <T,>(promiseOrThenable: any, ms: number = 7500): Promise<T> => {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Délai dépassé')), ms);
  });
  try {
    return await Promise.race([
      Promise.resolve(promiseOrThenable),
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timer);
  }
};

// Helper pour exécuter des requêtes par lots contrôlés (évite de saturer le pool de 6 connexions HTTP du navigateur)
const fetchInBatches = async <T,>(tasks: (() => Promise<T>)[], batchSize = 6): Promise<T[]> => {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const chunk = tasks.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(fn => fn()));
    results.push(...chunkResults);
  }
  return results;
};

// Safe reading from LocalForage
const safeGet = async <T,>(store: any): Promise<T | null> => {
  try {
    if (!store || typeof store.getItem !== 'function') return null;
    return await withTimeout<T | null>(store.getItem('data'), 2000);
  } catch (e) {
    console.warn('[Cache] Erreur lecture store :', e);
    return null;
  }
};

// Anti-Data Loss Cache Guard : empêche d'écraser un cache non-vide par un tableau vide
const safeSet = async <T,>(store: any, data: T): Promise<void> => {
  try {
    if (!store || typeof store.setItem !== 'function') return;
    if (Array.isArray(data) && data.length === 0) {
      const existing = await safeGet<any[]>(store);
      if (existing && existing.length > 0) {
        console.warn('[CacheGuard] Refus d\'écraser un store existant avec un tableau vide');
        return;
      }
    }
    await withTimeout(store.setItem('data', data), 3000);
  } catch (e) {
    console.warn('[Cache] Erreur écriture store :', e);
  }
};

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { currentUser, updateCurrentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  // Module Affaires retiré : ni état, ni cache, ni fetch, ni CRUD.
  const [facturePaiements, setFacturePaiements] = useState<FacturePaiement[]>([]);
  const [couts, setCouts] = useState<Cout[]>([]);
  const [scoringRules, setScoringRules] = useState<ScoringRule[]>([]);
  const [objectifs, setObjectifs] = useState<Objectif[]>([]);
  const [classements, setClassements] = useState<Classement[]>([]);
  const [primes, setPrimes] = useState<Prime[]>([]);
  const [primeAuditLogs, setPrimeAuditLogs] = useState<PrimeAuditLog[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectActivities, setProspectActivities] = useState<ProspectActivity[]>([]);
  const [prospectFollowUps, setProspectFollowUps] = useState<ProspectFollowUp[]>([]);
  const [activityReports, setActivityReports] = useState<ActivityReport[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [v2DailyReports, setV2DailyReports] = useState<V2DailyReport[]>([]);
  const [v2WeeklyReports, setV2WeeklyReports] = useState<V2WeeklyReport[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [crmDocuments, setCrmDocuments] = useState<CrmDocument[]>([]);
  const [crmFolders, setCrmFolders] = useState<CrmFolder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  // POS state
  const [posCategories, setPosCategories] = useState<PosCategory[]>([]);
  const [posBrands, setPosBrands] = useState<PosBrand[]>([]);
  const [posSuppliers, setPosSuppliers] = useState<PosSupplier[]>([]);
  const [posProducts, setPosProducts] = useState<PosProduct[]>([]);
  const [posStockEntries, setPosStockEntries] = useState<PosStockEntry[]>([]);
  const [posStockMovements, setPosStockMovements] = useState<PosStockMovement[]>([]);
  const [posInventories, setPosInventories] = useState<PosInventory[]>([]);
  const [posCashSessions, setPosCashSessions] = useState<PosCashSession[]>([]);
  const [posTransactions, setPosTransactions] = useState<PosTransaction[]>([]);
  const [posPayments, setPosPayments] = useState<PosPayment[]>([]);
  const [posDiscounts, setPosDiscounts] = useState<PosDiscount[]>([]);
  const [posReturns, setPosReturns] = useState<PosReturn[]>([]);
  const [suspendedCarts, setSuspendedCarts] = useState<SuspendedCart[]>([]);
  const [productCompletions, setProductCompletions] = useState<ProductCompletion[]>([]);
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);
  const [posSettings, setPosSettingsState] = useState<PosSettings>({ libraryName: 'Ma Librairie', address: '', phone: '', email: '', currency: 'FCFA', ticketMessage: 'Merci pour votre achat !', printerType: 'Thermique 80mm' });
  const [posWorkspace, setPosWorkspace] = useState<PosWorkspace>({ active: false });

  // CRM Modules Responsables
  const [crmTiers, setCrmTiers] = useState<ClientFournisseur[]>([]);
  const [crmCommerciaux, setCrmCommerciaux] = useState<AgentCommercial[]>([]);
  const [crmPrestations, setCrmPrestations] = useState<PrestationCommande[]>([]);
  const [crmCaisse, setCrmCaisse] = useState<MouvementCaisse[]>([]);
  const [crmCommissions, setCrmCommissions] = useState<CommissionPrestation[]>([]);
  const [crmArticles, setCrmArticles] = useState<CatalogueArticle[]>([]);
  const [crmStockMouvements, setCrmStockMouvements] = useState<MouvementStock[]>([]);
  const [crmMaintenance, setCrmMaintenance] = useState<InterventionMaintenance[]>([]);
  const [crmTechniciens, setCrmTechniciens] = useState<TechnicienMaintenance[]>([]);
  // Facturation
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicePayments, setInvoicePayments] = useState<InvoicePayment[]>([]);

  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);

  // Load from offline cache first, then fetch from Supabase if online
  const refreshData = useCallback(async (isBackground: boolean = false) => {
    // Si une synchronisation d'arrière-plan est demandée mais qu'un rafraîchissement a eu lieu il y a moins de 5 secondes, ignorer
    if (isBackground && Date.now() - lastRefreshTimeRef.current < 5000) {
      return;
    }

    // Si un rafraîchissement est déjà en cours, réutiliser la promesse existante pour éviter de doubler les requêtes
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    const executeRefresh = async () => {
      if (!isBackground) {
        setLoading(true);
      }
      // Base locale réparée d'abord (conflit de version = cache illisible = 0 partout).
      await ensureDbHealth().catch(() => {});
      try {
        const [
        cachedUsers, cachedClients, cachedFacturePaiements, cachedCouts,
        cachedScoringRules, cachedObjectifs, cachedClassements, cachedPrimes, cachedPrimeAuditLogs,
        cachedQuotes, cachedSales, cachedCommissions, cachedInstallments, cachedProspects,
        cachedProspectActivities, cachedProspectFollowUps, cachedActivityReports, cachedWeeklyReports,
        cachedV2DailyReports, cachedV2WeeklyReports, cachedCrmDocuments, cachedCrmFolders,
        cachedNotifications, cachedCategories, cachedServices, cachedPrestations, cachedSettings,
        cachedPosCategories, cachedPosBrands, cachedPosSuppliers, cachedPosProducts,
        cachedPosStockEntries, cachedPosStockMovements, cachedPosInventories, cachedPosCashSessions,
        cachedPosTransactions, cachedPosPayments, cachedPosDiscounts, cachedPosSettings,
        cachedPosReturns, cachedProductCompletions, cachedImportSessions,
        cachedCrmTiers, cachedCrmCommerciaux, cachedCrmPrestations, cachedCrmCaisse,
        cachedCrmCommissions, cachedCrmArticles, cachedCrmStockMouvements, cachedCrmMaintenance, cachedCrmTechniciens,
        cachedInvoices, cachedInvoicePayments
      ] = await Promise.all([
        safeGet<User[]>(db.profiles),
        safeGet<Client[]>(db.clients),
        safeGet<FacturePaiement[]>(db.facturePaiements),
        safeGet<Cout[]>(db.couts),
        safeGet<ScoringRule[]>(db.scoringRules),
        safeGet<Objectif[]>(db.objectifs),
        safeGet<Classement[]>(db.classements),
        safeGet<Prime[]>(db.primes),
        safeGet<PrimeAuditLog[]>(db.primeAuditLogs),
        safeGet<Quote[]>(db.quotes),
        safeGet<Sale[]>(db.sales),
        safeGet<Commission[]>(db.commissions),
        safeGet<Installment[]>(db.installments),
        safeGet<Prospect[]>(db.prospects),
        safeGet<ProspectActivity[]>(db.prospectActivities),
        safeGet<ProspectFollowUp[]>(db.prospectFollowUps),
        safeGet<ActivityReport[]>(db.activityReports),
        safeGet<WeeklyReport[]>(db.weeklyReports),
        safeGet<V2DailyReport[]>(db.v2DailyReports),
        safeGet<V2WeeklyReport[]>(db.v2WeeklyReports),
        safeGet<CrmDocument[]>(db.documents),
        safeGet<CrmFolder[]>(db.crmFolders),
        safeGet<AppNotification[]>(db.notifications),
        safeGet<Category[]>(db.categories),
        safeGet<Service[]>(db.services),
        safeGet<Prestation[]>(db.prestations),
        safeGet<AppSettings>(db.settings),
        safeGet<PosCategory[]>(db.posCategories),
        safeGet<PosBrand[]>(db.posBrands),
        safeGet<PosSupplier[]>(db.posSuppliers),
        safeGet<PosProduct[]>(db.posProducts),
        safeGet<PosStockEntry[]>(db.posStockEntries),
        safeGet<PosStockMovement[]>(db.posStockMovements),
        safeGet<PosInventory[]>(db.posInventories),
        safeGet<PosCashSession[]>(db.posCashSessions),
        safeGet<PosTransaction[]>(db.posTransactions),
        safeGet<PosPayment[]>(db.posPayments),
        safeGet<PosDiscount[]>(db.posDiscounts),
        safeGet<PosSettings>(db.posSettings),
        safeGet<PosReturn[]>(db.posReturns),
        safeGet<ProductCompletion[]>(db.productCompletions),
        safeGet<ImportSession[]>(db.importSessions),
        safeGet<ClientFournisseur[]>(db.crmTiers),
        safeGet<AgentCommercial[]>(db.crmCommerciaux),
        safeGet<PrestationCommande[]>(db.crmPrestations),
        safeGet<MouvementCaisse[]>(db.crmCaisse),
        safeGet<CommissionPrestation[]>(db.crmCommissions),
        safeGet<CatalogueArticle[]>(db.crmArticles),
        safeGet<MouvementStock[]>(db.crmStockMouvements),
        safeGet<InterventionMaintenance[]>(db.crmMaintenance),
        safeGet<TechnicienMaintenance[]>(db.crmTechniciens),
        safeGet<Invoice[]>(db.invoices),
        safeGet<InvoicePayment[]>(db.invoicePayments),
      ]);

      if (cachedUsers) setUsers(dedupeUsers(cachedUsers));
      if (cachedClients) setClients(cachedClients);
      if (cachedFacturePaiements) setFacturePaiements(cachedFacturePaiements);
      if (cachedCouts) setCouts(cachedCouts);
      if (cachedInvoices) setInvoices(cachedInvoices);
      if (cachedInvoicePayments) setInvoicePayments(cachedInvoicePayments);
      if (cachedScoringRules) setScoringRules(cachedScoringRules);
      if (cachedObjectifs) setObjectifs(cachedObjectifs);
      if (cachedClassements) setClassements(cachedClassements);
      if (cachedPrimes) setPrimes(cachedPrimes);
      if (cachedPrimeAuditLogs) setPrimeAuditLogs(cachedPrimeAuditLogs);
      if (cachedQuotes) setQuotes(cachedQuotes);
      if (cachedSales) setSales(cachedSales);
      if (cachedCommissions) setCommissions(cachedCommissions);
      if (cachedInstallments) setInstallments(cachedInstallments);
      if (cachedProspects) setProspects(cachedProspects);
      if (cachedProspectActivities) setProspectActivities(cachedProspectActivities);
      if (cachedProspectFollowUps) setProspectFollowUps(cachedProspectFollowUps);
      if (cachedActivityReports) setActivityReports(cachedActivityReports);
      if (cachedWeeklyReports) setWeeklyReports(cachedWeeklyReports);
      if (cachedV2DailyReports) setV2DailyReports(cachedV2DailyReports);
      if (cachedV2WeeklyReports) setV2WeeklyReports(cachedV2WeeklyReports);
      if (cachedCrmDocuments) setCrmDocuments(cachedCrmDocuments);
      if (cachedCrmFolders) setCrmFolders(cachedCrmFolders);
      if (cachedNotifications) setNotifications(cachedNotifications);
      if (cachedCategories) setCategories(cachedCategories);
      if (cachedServices) setServices(cachedServices);
      if (cachedPrestations) setPrestations(cachedPrestations);
      if (cachedSettings) setSettings(cachedSettings);
      let categoriesToSet = (cachedPosCategories || []).filter(c => (c as any).family !== 'Service');
      if (categoriesToSet.length === 0) {
        categoriesToSet = [
          { id: uuidv4(), name: 'Livres', family: 'Livre' as const },
          { id: uuidv4(), name: 'Fournitures scolaires', family: 'Fourniture' as const },
          { id: uuidv4(), name: 'Divers', family: 'Fourniture' as const }
        ];
      }
      setPosCategories(categoriesToSet);
      if (!cachedPosCategories || cachedPosCategories.length === 0) {
        await db.posCategories.setItem('data', categoriesToSet);
      }

      if (cachedPosBrands) setPosBrands(cachedPosBrands);
      if (cachedPosSuppliers) setPosSuppliers(cachedPosSuppliers);
      if (cachedPosStockEntries) setPosStockEntries(cachedPosStockEntries);
      if (cachedPosStockMovements) setPosStockMovements(cachedPosStockMovements);
      if (cachedPosInventories) setPosInventories(cachedPosInventories);
      if (cachedPosCashSessions) setPosCashSessions(cachedPosCashSessions);
      if (cachedPosTransactions) setPosTransactions(cachedPosTransactions);
      if (cachedPosPayments) setPosPayments(cachedPosPayments);
      if (cachedPosDiscounts) setPosDiscounts(cachedPosDiscounts);
      if (cachedPosSettings) setPosSettingsState(cachedPosSettings);
      if (cachedPosReturns) setPosReturns(cachedPosReturns);
      if (cachedProductCompletions) setProductCompletions(cachedProductCompletions);
      if (cachedImportSessions) setImportSessions(cachedImportSessions);
      if (cachedCrmTiers) setCrmTiers(cachedCrmTiers);
      if (cachedCrmCommerciaux) setCrmCommerciaux(cachedCrmCommerciaux);
      if (cachedCrmPrestations) setCrmPrestations(cachedCrmPrestations);
      if (cachedCrmCaisse) setCrmCaisse(cachedCrmCaisse);
      if (cachedCrmCommissions) setCrmCommissions(cachedCrmCommissions);
      if (cachedCrmArticles) setCrmArticles(cachedCrmArticles);
      if (cachedCrmStockMouvements) setCrmStockMouvements(cachedCrmStockMouvements);
      if (cachedCrmMaintenance) setCrmMaintenance(cachedCrmMaintenance);
      if (cachedCrmTechniciens) setCrmTechniciens(cachedCrmTechniciens);

      const rawCachedProducts = (cachedPosProducts || []).filter((p: any) => {
        return p.family !== 'Service' && !p.reference?.startsWith('SRV-') && p.id !== '00000000-0000-0000-0000-000000000000';
      });
      const cachedProducts = rawCachedProducts.map((p: any) => ({
        ...p,
        id: resolveProductUuid(p.id, p.reference)
      }));

      setPosProducts(cachedProducts);
      setLoading(false);

      if (rawCachedProducts.length !== (cachedPosProducts || []).length) {
        db.posProducts.setItem('data', cachedProducts).catch(() => {});
      }

      // 2. Nettoyage proactif immédiat des reliquats de services retirés dans la file et les erreurs
      try {
        const currentQueue = (await db.syncQueue.getItem<any[]>('queue')) || [];
        const cleanQueue = currentQueue.filter(a => !isRetiredServicePayload(a.type, a.payload));
        if (cleanQueue.length !== currentQueue.length) {
          await db.syncQueue.setItem('queue', cleanQueue);
        }
        const currentErrors = (await db.syncErrors.getItem<any[]>('errors')) || [];
        const cleanErrors = currentErrors.filter(e => !isRetiredServicePayload(e.action?.type, e.action?.payload));
        if (cleanErrors.length !== currentErrors.length) {
          await db.syncErrors.setItem('errors', cleanErrors);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sync-errors-updated', { detail: { count: cleanErrors.length } }));
          }
        }
      } catch {}

      // 3. Fetch from Supabase (if online) and update Cache
      if (navigator.onLine) {
        if (currentUser) {
          // Process any pending offline mutations with a timeout so it doesn't block refreshData
          try {
            await Promise.race([
              processSyncQueue(),
              new Promise(res => setTimeout(res, 3000))
            ]);
          } catch (err) {
            console.warn('[refreshData] Sync queue non bloquante :', err);
          }
        }

        const lastSyncTime = await db.syncMetadata.getItem<string>('lastSyncTime');
        const syncTimestamp = new Date().toISOString();

        // Chaque table est récupérée isolément avec timeout sécurisé (7.5s).
        // F1 : les échecs ne sont plus muets — journalisés avec la table concernée
        // (RLS 42501, PGRST, timeout) pour un diagnostic visible au lieu d'un cache
        // périmé affiché comme à jour.
        const fetchFailures: Record<string, number> = {};
        const safeFetch = async (queryFn: () => any, allowDelta: boolean = false, label = 'requête'): Promise<any> => {
          try {
            let query = queryFn();
            if (allowDelta && lastSyncTime) {
               query = query.gt('updated_at', lastSyncTime);
            }
            const res = await withTimeout<any>(query, 7500);
            if (res && res.error) {
              fetchFailures[label] = (fetchFailures[label] || 0) + 1;
              console.warn(`[Refresh] ${label} en échec (${fetchFailures[label]}x) :`, res.error.message || res.error);
              return null;
            }
            return res ? res.data : null;
          } catch (e: any) {
            fetchFailures[label] = (fetchFailures[label] || 0) + 1;
            console.warn(`[Refresh] ${label} exception (${fetchFailures[label]}x) :`, e?.message || e);
            return null;
          }
        };

        // Variante paginée (PostgREST tronque à max_rows=1000) : boucle .range()
        // ordonnée par created_at jusqu'à page incomplète. Repli une page si la
        // table n'a pas de colonne created_at.
        const safeFetchAll = async (table: string, select = '*'): Promise<any> => {
          try {
            const PAGE = 1000;
            const out: any[] = [];
            let from = 0;
            for (let guard = 0; guard < 50; guard++) {
              let q: any = supabase.from(table).select(select).range(from, from + PAGE - 1);
              if (from === 0 && !tablesWithoutCreatedAt.has(table)) q = q.order('created_at', { ascending: true });
              const res = await withTimeout<any>(q, 15000);
              if (res && res.error) {
                fetchFailures[table] = (fetchFailures[table] || 0) + 1;
                console.warn(`[Refresh] table ${table} en échec (${fetchFailures[table]}x) :`, res.error.message || res.error);
                if (from === 0) {
                  if (/created_at/i.test(res.error.message || '')) tablesWithoutCreatedAt.add(table);
                  const r2 = await withTimeout<any>(supabase.from(table).select(select).range(0, PAGE - 1), 15000);
                  if (r2 && !r2.error && Array.isArray(r2.data)) return r2.data;
                }
                return null;
              }
              const rows = res ? res.data : null;
              if (!Array.isArray(rows) || rows.length === 0) break;
              out.push(...rows);
              if (rows.length < PAGE) break;
              from += PAGE;
            }
            return out;
          } catch (e: any) {
            fetchFailures[table] = (fetchFailures[table] || 0) + 1;
            console.warn(`[Refresh] table ${table} exception (${fetchFailures[table]}x) :`, e?.message || e);
            return null;
          }
        };

        const fetchTasks = [
          () => safeFetchAll('profiles'),
          () => currentUser ? safeFetchAll('clients') : Promise.resolve(null),
          () => safeFetchAll('services'),
          () => safeFetchAll('prestations'),
          () => safeFetch(() => supabase.from('settings').select('*').limit(1).maybeSingle()),
          () => currentUser ? safeFetchAll('quotes', '*, quote_lines(*)') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('ventes', '*, vente_lines(*)') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('commissions') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('vente_echeances') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('facture_paiements') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('couts') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('scoring_rules') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('objectifs') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('classements') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('primes') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('prime_audit_logs') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('prospects') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('prospect_activities') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('prospect_follow_ups') : Promise.resolve(null),
          () => safeFetchAll('categories'),
          () => currentUser ? safeFetchAll('activity_reports') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('weekly_reports') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('v2_daily_reports') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('v2_weekly_reports') : Promise.resolve(null),
          () => safeFetchAll('pos_categories'),
          () => safeFetchAll('pos_brands'),
          () => safeFetchAll('pos_suppliers'),
          () => safeFetchAll('pos_products'),
          () => safeFetchAll('pos_stock_entries', '*, pos_stock_entry_lines(*)'),
          () => safeFetchAll('pos_stock_movements'),
          () => safeFetchAll('pos_inventories', '*, pos_inventory_lines(*)'),
          () => safeFetchAll('pos_cash_sessions'),
          () => safeFetchAll('pos_transactions', '*, pos_transaction_lines(*), pos_payments(*)'),
          () => safeFetchAll('pos_payments'),
          () => safeFetchAll('pos_discounts'),
          () => safeFetch(() => supabase.from('pos_settings').select('*').limit(1).maybeSingle()),
          () => currentUser ? safeFetchAll('crm_documents') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('crm_folders') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('notifications') : Promise.resolve(null),
          () => safeFetchAll('pos_returns', '*, pos_return_lines(*)'),
          () => currentUser ? safeFetchAll('clients_fournisseurs') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('agents_commerciaux') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('prestations_commandes') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('mouvements_caisse') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('commissions_prestations') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('catalogue_articles') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('mouvements_stock') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('interventions_maintenance') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('techniciens_maintenance') : Promise.resolve(null),
          // Factures : lignes chargées SÉPARÉMENT (pas d'embed `invoice_items(*)`).
          // PostgREST ne connaît pas la FK en prod ("Could not find a relationship"),
          // ce qui faisait échouer tout le fetch (0 partout sur navigateur frais).
          // Jointure locale par invoice_id ci-dessous.
          () => currentUser ? safeFetchAll('invoices') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('invoice_items') : Promise.resolve(null),
          () => currentUser ? safeFetchAll('invoice_payments') : Promise.resolve(null)
        ];

        const [
          profilesData, clientsData, servicesData,
          prestationsData, settingsData, quotesData,
          salesData, commissionsData, installmentsData,
          facturePaiementsData, coutsData,
          scoringRulesData, objectifsData, classementsData, primesData, primeAuditLogsData,
          prospectsData, prospectActivitiesData,
          prospectFollowUpsData, categoriesData,
          activityReportsData, weeklyReportsData,
          v2DailyReportsData, v2WeeklyReportsData,
          posCategoriesData, posBrandsData, posSuppliersData,
          posProductsData, posStockEntriesData, posStockMovementsData, posInventoriesData,
          posCashSessionsData, posTransactionsData, posPaymentsData,
          posDiscountsData, posSettingsData, crmDocumentsData, crmFoldersData, notificationsData,
          posReturnsData,
          crmTiersData, crmCommerciauxData, crmPrestationsData, crmCaisseData,
          crmCommissionsData, crmArticlesData, crmStockMouvementsData, crmMaintenanceData, crmTechniciensData,
          invoicesData, invoiceItemsData, invoicePaymentsData
        ] = await fetchInBatches(fetchTasks, 6);

        if (profilesData && profilesData.length > 0) {
          const parsedUsers = profilesData.map((p: any) => {
            const cachedUser = cachedUsers?.find((u: any) => u.id === p.id);
            const isDir = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(p.role);
            const crmDefault = !['Caissier', 'Gerant'].includes(p.role);
            
            const resolveBool = (dbVal: any, localVal: any, defaultVal: boolean) => {
              if (dbVal === true) return true;
              if (dbVal === false) return false;
              if (localVal === true) return true;
              if (localVal === false) return false;
              return defaultVal;
            };

            return {
              id: p.id,
              name: p.name,
              email: p.email,
              role: p.role as User['role'],
              serviceId: p.service_id,
              pin: p.pin,
              lastLogin: p.last_login,
              active: p.active !== false,
              photo: p.photo || undefined,
              posReturnsEnabled: resolveBool(p.pos_returns_enabled, cachedUser?.posReturnsEnabled, false),
              posCatalogueEnabled: resolveBool(p.pos_catalogue_enabled, cachedUser?.posCatalogueEnabled, false),
              posSupplyEnabled: resolveBool(p.pos_supply_enabled, cachedUser?.posSupplyEnabled, false),
              posInventoryEnabled: resolveBool(p.pos_inventory_enabled, cachedUser?.posInventoryEnabled, false),
              posStockEnabled: resolveBool(p.pos_stock_enabled, cachedUser?.posStockEnabled, false),
              posRole: p.pos_role || cachedUser?.posRole || null,
              crmPrestationsEnabled: resolveBool(p.crm_prestations_enabled, cachedUser?.crmPrestationsEnabled, crmDefault),
              crmCaisseEnabled: resolveBool(p.crm_caisse_enabled, cachedUser?.crmCaisseEnabled, crmDefault),
              crmMaintenanceEnabled: resolveBool(p.crm_maintenance_enabled, cachedUser?.crmMaintenanceEnabled, crmDefault),
              crmStocksEnabled: resolveBool(p.crm_stocks_enabled, cachedUser?.crmStocksEnabled, crmDefault),
              crmTiersEnabled: resolveBool(p.crm_tiers_enabled, cachedUser?.crmTiersEnabled, crmDefault),
              crmCommerciauxEnabled: resolveBool(p.crm_commerciaux_enabled, cachedUser?.crmCommerciauxEnabled, crmDefault),
              crmCommissionsEnabled: resolveBool(p.crm_commissions_enabled, cachedUser?.crmCommissionsEnabled, crmDefault),
              crmFacturationEnabled: resolveBool(p.crm_facturation_enabled, cachedUser?.crmFacturationEnabled, crmDefault),
              crmSupFacturesEnabled: resolveBool(p.crm_sup_factures_enabled, cachedUser?.crmSupFacturesEnabled, isDir),
              crmReportsEnabled: resolveBool(p.crm_reports_enabled, cachedUser?.crmReportsEnabled, !isDir),
              crmTeamReportsEnabled: resolveBool(p.crm_team_reports_enabled, cachedUser?.crmTeamReportsEnabled, isDir)
            };
          });
          const mergedUsers = dedupeUsers(parsedUsers);
          // Profils = autorité serveur : on écrase le cache local pour épurer
          // les comptes fantômes (supprimés côté serveur, jamais resynchronisés).
          setUsers(mergedUsers); await db.profiles.setItem('data', mergedUsers);
          if (currentUser) {
            const freshMe = mergedUsers.find((u: User) => u.id === currentUser.id);
            if (freshMe) {
              updateCurrentUser(freshMe);
            }
          }
        }
        
        if (crmDocumentsData && crmDocumentsData.length > 0) {
          const parsedCrmDocuments = crmDocumentsData.map((d: any) => ({
            id: d.id,
            name: d.name,
            type: d.type,
            sizeBytes: d.size_bytes ?? d.sizeBytes ?? 0,
            filePath: d.file_path || d.filePath,
            uploaderId: d.uploader_id || d.uploaderId,
            folderId: d.folder_id || d.folderId || undefined,
            clientId: d.client_id || d.clientId || undefined,
            category: d.category || 'Autre',
            isShared: d.is_shared !== undefined ? !!d.is_shared : !!d.isShared,
            createdAt: d.created_at || d.createdAt,
            updatedAt: d.updated_at || d.updatedAt
          }));
          const mergedCrmDocuments = mergeData(cachedCrmDocuments, parsedCrmDocuments);
          setCrmDocuments(mergedCrmDocuments); await db.documents.setItem('data', mergedCrmDocuments);
        }

        if (crmFoldersData && crmFoldersData.length > 0) {
          const parsedFolders = crmFoldersData.map((f: any) => ({
            id: f.id,
            name: f.name,
            ownerId: f.owner_id || f.ownerId,
            parentId: f.parent_id || f.parentId || undefined,
            color: f.color || '#1879C8',
            isShared: f.is_shared !== undefined ? !!f.is_shared : !!f.isShared,
            createdAt: f.created_at || f.createdAt
          }));
          const mergedFolders = mergeData(cachedCrmFolders, parsedFolders);
          setCrmFolders(mergedFolders); await db.crmFolders.setItem('data', mergedFolders);
        }

        if (notificationsData && notificationsData.length > 0) {
          const mergedNotifications = mergeData(cachedNotifications, notificationsData);
          setNotifications(mergedNotifications); await db.notifications.setItem('data', mergedNotifications);
        }

        if (clientsData && clientsData.length > 0) {
          const parsedClients = clientsData.map((c: any) => ({
            id: c.id, name: c.name, email: c.email, phone: c.phone, contact: c.contact, company: c.company, address: c.address, status: c.status || 'Actif', commercialId: c.commercial_id, serviceId: c.service_id || undefined, createdAt: c.created_at
          }));
          const merged = mergeData(cachedClients, parsedClients);
          setClients(merged); await db.clients.setItem('data', merged);
        }
        if (facturePaiementsData && facturePaiementsData.length > 0) {
          const parsedPaiements = facturePaiementsData.map((p: any) => ({
            id: p.id,
            paymentNumber: p.payment_number,
            paymentType: p.payment_type as PaymentType,
            venteId: p.vente_id,
            echeanceId: p.echeance_id || undefined,
            clientId: p.client_id,
            paymentDate: p.payment_date,
            amount: Number(p.amount) || 0,
            paymentMethod: p.payment_method as PaymentMethod,
            reference: p.reference || undefined,
            proofDocumentId: p.proof_document_id || undefined,
            notes: p.notes || undefined,
            status: p.status || 'VALIDE',
            recordedBy: p.recorded_by || undefined,
            createdAt: p.created_at
          }));
          const merged = mergeData(cachedFacturePaiements, parsedPaiements);
          setFacturePaiements(merged); await db.facturePaiements.setItem('data', merged);
        }
        if (coutsData && coutsData.length > 0) {
          const parsedCouts = coutsData.map((c: any) => ({
            id: c.id,
            reference: c.reference,
            costType: c.cost_type as CostType,
            category: c.category as CostCategory,
            amountHt: Number(c.amount_ht) || 0,
            vatRate: Number(c.vat_rate) || 0,
            vatAmount: Number(c.vat_amount) || 0,
            amountTtc: Number(c.amount_ttc) || 0,
            date: c.date,
            affaireId: c.affaire_id || undefined,
            serviceId: c.service_id,
            supplierName: c.supplier_name || undefined,
            invoiceRef: c.invoice_ref || undefined,
            description: c.description,
            proofDocumentId: c.proof_document_id || undefined,
            status: c.status || 'VALIDE',
            createdBy: c.created_by || undefined,
            createdAt: c.created_at,
            updatedAt: c.updated_at
          }));
          const merged = mergeData(cachedCouts, parsedCouts);
          setCouts(merged); await db.couts.setItem('data', merged);
        }
        if (scoringRulesData && scoringRulesData.length > 0) {
          const parsedRules = scoringRulesData.map((r: any) => ({
            id: r.id,
            serviceId: r.service_id || undefined,
            role: r.role,
            weightMargin: Number(r.weight_margin) || 40,
            weightRevenue: Number(r.weight_revenue) || 30,
            weightVolume: Number(r.weight_volume) || 15,
            weightConversion: Number(r.weight_conversion) || 15,
            isActive: r.is_active !== false
          }));
          const merged = mergeData(cachedScoringRules, parsedRules);
          setScoringRules(merged); await db.scoringRules.setItem('data', merged);
        }
        if (objectifsData && objectifsData.length > 0) {
          const parsedObj = objectifsData.map((o: any) => ({
            id: o.id,
            profileId: o.profile_id,
            serviceId: o.service_id,
            periodType: o.period_type as PeriodType,
            startDate: o.start_date,
            endDate: o.end_date,
            targetRevenueHt: Number(o.target_revenue_ht) || 0,
            targetMarginHt: Number(o.target_margin_ht) || 0,
            targetDealsCount: Number(o.target_deals_count) || 0,
            targetNewClients: Number(o.target_new_clients) || 0,
            status: o.status || 'EN_COURS',
            createdBy: o.created_by || undefined,
            createdAt: o.created_at
          }));
          const merged = mergeData(cachedObjectifs, parsedObj);
          setObjectifs(merged); await db.objectifs.setItem('data', merged);
        }
        if (classementsData && classementsData.length > 0) {
          const parsedCl = classementsData.map((c: any) => ({
            id: c.id,
            profileId: c.profile_id,
            serviceId: c.service_id,
            periodType: c.period_type as PeriodType,
            periodKey: c.period_key,
            score: Number(c.score) || 0,
            rank: Number(c.rank) || 0,
            revenueAchievedHt: Number(c.revenue_achieved_ht) || 0,
            marginAchievedHt: Number(c.margin_achieved_ht) || 0,
            dealsWonCount: Number(c.deals_won_count) || 0,
            conversionRate: Number(c.conversion_rate) || 0,
            updatedAt: c.updated_at
          }));
          const merged = mergeData(cachedClassements, parsedCl);
          setClassements(merged); await db.classements.setItem('data', merged);
        }
        if (primesData && primesData.length > 0) {
          const parsedPrimes = primesData.map((p: any) => ({
            id: p.id,
            reference: p.reference,
            profileId: p.profile_id,
            serviceId: p.service_id,
            periodKey: p.period_key,
            primeType: p.prime_type as PrimeType,
            amount: Number(p.amount) || 0,
            status: p.status as PrimeStatus,
            calculatedBy: p.calculated_by || undefined,
            validatedBy: p.validated_by || undefined,
            justification: p.justification || undefined,
            createdAt: p.created_at,
            updatedAt: p.updated_at
          }));
          const merged = mergeData(cachedPrimes, parsedPrimes);
          setPrimes(merged); await db.primes.setItem('data', merged);
        }
        if (primeAuditLogsData && primeAuditLogsData.length > 0) {
          const parsedLogs = primeAuditLogsData.map((l: any) => ({
            id: l.id,
            primeId: l.prime_id,
            action: l.action,
            actorId: l.actor_id,
            actorRole: l.actor_role,
            previousState: l.previous_state,
            newState: l.new_state,
            comment: l.comment || undefined,
            createdAt: l.created_at
          }));
          const merged = mergeData(cachedPrimeAuditLogs, parsedLogs);
          setPrimeAuditLogs(merged); await db.primeAuditLogs.setItem('data', merged);
        }
        if (servicesData && servicesData.length > 0) {
          const parsedServices = servicesData.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            members: s.members,
            managerId: s.manager_id || s.managerId,
            commissionRate: s.commission_rate !== undefined && s.commission_rate !== null ? Number(s.commission_rate) : undefined
          }));
          const merged = mergeData(cachedServices, parsedServices);
          setServices(merged); await db.services.setItem('data', merged);
        }
        if (prestationsData && prestationsData.length > 0) {
          const parsedPrestations = prestationsData.map((p: any) => ({...p, serviceId: p.service_id, costPrice: p.cost_price ?? 0})) as Prestation[];
          const merged = mergeData(cachedPrestations, parsedPrestations);
          setPrestations(merged); await db.prestations.setItem('data', merged);
        }
        if (settingsData) {
          const parsedSettings: AppSettings = {
            companyName: settingsData.company_name || cachedSettings?.companyName || 'Hinov',
            companyLogo: settingsData.company_logo || cachedSettings?.companyLogo || '',
            companyAddress: settingsData.company_address ?? cachedSettings?.companyAddress ?? '',
            companySiret: settingsData.company_siret ?? cachedSettings?.companySiret ?? '',
            companyTva: settingsData.company_tva ?? cachedSettings?.companyTva ?? '',
            defaultTerms: settingsData.default_terms ?? cachedSettings?.defaultTerms ?? '',
            headerLogoBase64: settingsData.header_logo_base64 ?? cachedSettings?.headerLogoBase64 ?? undefined,
            companyStampBase64: settingsData.company_stamp_base64 ?? cachedSettings?.companyStampBase64 ?? undefined,
            defaultValidity: settingsData.default_validity ?? cachedSettings?.defaultValidity ?? undefined,
            siteUrl: settingsData.site_url ?? cachedSettings?.siteUrl ?? undefined,
            commissionRate: settingsData.commission_rate ?? cachedSettings?.commissionRate ?? undefined,
            companyCapital: settingsData.company_capital ?? cachedSettings?.companyCapital ?? undefined,
            companyPhone: settingsData.company_phone ?? cachedSettings?.companyPhone ?? undefined,
            companyEmail: settingsData.company_email ?? cachedSettings?.companyEmail ?? undefined,
            bankIban: settingsData.bank_iban ?? cachedSettings?.bankIban ?? undefined,
          };
          setSettings(parsedSettings); await db.settings.setItem('data', parsedSettings);
        }
        if (quotesData && quotesData.length > 0) {
          const parsedQuotes = quotesData.map((q: any) => ({
            id: q.id, quoteNumber: q.quote_number, clientId: q.client_id, commercialId: q.commercial_id, serviceId: q.service_id, subject: q.subject, subtotal: q.subtotal, total: q.total, status: q.status, date: q.date,
            validUntil: q.valid_until || undefined, paymentTerms: q.payment_terms || undefined, notes: q.notes || undefined, signatoryName: q.signatory_name || undefined, signatoryRole: q.signatory_role || undefined,
            style: q.style, accentColor: q.accent_color,
            discountPercent: q.discount_percent || 0, discountAmount: q.discount_amount || 0, clientComment: q.client_comment,
            lines: (q.quote_lines || []).map((l: any) => ({ id: l.id, prestationId: l.prestation_id, description: l.description, quantity: l.quantity, unit: l.unit || undefined, unitPrice: l.unit_price, total: l.total, discountPercent: l.discount_percent || 0, costPrice: l.cost_price || 0 }))
          }));
          const mergedQuotes = mergeKeepChildren(cachedQuotes, parsedQuotes, ['lines']);
          const merged = mergedQuotes.merged;
          setQuotes(merged); await db.quotes.setItem('data', merged);
          await healQueueMissingChildren(new Map((cachedQuotes || []).map(q => [q.id, q])), mergedQuotes.healedIds, 'INSERT_QUOTE');
        }
        if (salesData && salesData.length > 0) {
          const parsedSales = salesData.map((s: any) => ({
            id: s.id, saleNumber: s.sale_number, quoteId: s.quote_id, clientId: s.client_id, serviceId: s.service_id, commercialId: s.commercial_id || undefined, dueDate: s.due_date || undefined,
            subtotal: s.subtotal, total: s.total, status: s.status, date: s.date, notes: s.notes,
            lines: (s.vente_lines || []).map((l: any) => ({ id: l.id, description: l.description, quantity: l.quantity, unitPrice: l.unit_price, costPrice: l.cost_price || 0, total: l.total }))
          }));
          const mergedSales = mergeKeepChildren(cachedSales, parsedSales, ['lines']);
          const merged = mergedSales.merged;
          setSales(merged); await db.sales.setItem('data', merged);
          await healQueueMissingChildren(new Map((cachedSales || []).map(s => [s.id, s])), mergedSales.healedIds, 'INSERT_SALE');
        }
        if (commissionsData && commissionsData.length > 0) {
          const parsedCommissions = commissionsData.map((c: any) => ({
            id: c.id,
            saleId: c.vente_id || c.sale_id,
            clientId: c.client_id,
            commercialId: c.commercial_id,
            serviceId: c.service_id,
            totalHt: Number(c.total_ht) || 0,
            costTotal: Number(c.cost_total) || 0,
            marginAmount: Number(c.margin_amount) || 0,
            marginPercent: Number(c.margin_percent) || 0,
            commissionPercent: Number(c.commission_percent) || 0,
            commissionAmount: Number(c.commission_amount) || 0,
            paidAmount: Number(c.paid_amount) || 0,
            eligibleAmount: c.eligible_amount !== undefined ? Number(c.eligible_amount) : undefined,
            notes: c.notes || undefined,
            status: c.status || 'En attente',
            createdAt: c.created_at
          }));
          const merged = mergeData(cachedCommissions, parsedCommissions);
          setCommissions(merged); await db.commissions.setItem('data', merged);
        }
        if (installmentsData && installmentsData.length > 0) {
          const parsedInstallments = installmentsData.map((i: any) => ({
            id: i.id, saleId: i.vente_id, amount: i.amount, dueDate: i.due_date, paidAmount: i.paid_amount || 0, status: i.status, paidAt: i.paid_at || undefined
          }));
          const merged = mergeData(cachedInstallments, parsedInstallments);
          setInstallments(merged); await db.installments.setItem('data', merged);
        }
        if (prospectsData && prospectsData.length > 0) {
          const parsedProspects = prospectsData.map((p: any) => ({
            id: p.id, prospectNumber: p.prospect_number, commercialId: p.commercial_id, serviceId: p.service_id, categoryId: p.category_id,
            type: p.type, name: p.name, company: p.company, phone: p.phone, email: p.email, address: p.address, city: p.city,
            source: p.source, interestLevel: p.interest_level, budget: p.budget, need: p.need, comments: p.comments,
            status: p.status, responsibleId: p.responsible_id, createdAt: p.created_at, updatedAt: p.updated_at
          }));
          const merged = mergeData(cachedProspects, parsedProspects);
          setProspects(merged); await db.prospects.setItem('data', merged);
        }
        if (prospectActivitiesData && prospectActivitiesData.length > 0) {
          const parsedActivities = prospectActivitiesData.map((a: any) => ({
            id: a.id, prospectId: a.prospect_id, type: a.type, description: a.description, date: a.date, createdBy: a.created_by
          }));
          const merged = mergeData(cachedProspectActivities, parsedActivities);
          setProspectActivities(merged); await db.prospectActivities.setItem('data', merged);
        }
        if (prospectFollowUpsData && prospectFollowUpsData.length > 0) {
          const parsedFollowUps = prospectFollowUpsData.map((f: any) => ({
            id: f.id, prospectId: f.prospect_id, date: f.date, time: f.time, priority: f.priority, observation: f.observation, status: f.status
          }));
          const merged = mergeData(cachedProspectFollowUps, parsedFollowUps);
          setProspectFollowUps(merged); await db.prospectFollowUps.setItem('data', merged);
        }
        if (categoriesData && categoriesData.length > 0) {
          const parsedCategories = categoriesData.map((c: any) => ({ id: c.id, serviceId: c.service_id, name: c.name }));
          const merged = mergeData(cachedCategories, parsedCategories);
          setCategories(merged); await db.categories.setItem('data', merged);
        }
        if (activityReportsData && activityReportsData.length > 0) {
          const parsedReports = activityReportsData.map((r: any) => ({
            id: r.id, authorId: r.author_id, role: r.role, type: r.type, date: r.date,
            realisations: r.realisations || '', difficultes: r.difficultes || '', remarques: r.remarques || '',
            createdAt: r.created_at, updatedAt: r.updated_at
          }));
          const merged = mergeData(cachedActivityReports, parsedReports);
          setActivityReports(merged); await db.activityReports.setItem('data', merged);
        }
        if (weeklyReportsData && weeklyReportsData.length > 0) {
          const parsedReports = weeklyReportsData.map((r: any) => ({
            id: r.id, authorId: r.author_id, role: r.role, weekStart: r.week_start,
            sections: r.sections || [], kpis: r.kpis || {}, status: r.status,
            sentAt: r.sent_at || undefined, createdAt: r.created_at
          }));
          const merged = mergeData(cachedWeeklyReports, parsedReports);
          setWeeklyReports(merged); await db.weeklyReports.setItem('data', merged);
        }
        if (v2DailyReportsData && v2DailyReportsData.length > 0) {
          const parseTasks = (raw: any): V2Task[] => {
            if (Array.isArray(raw)) return raw;
            if (typeof raw === 'string') {
              try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            }
            return [];
          };

          const parsed = v2DailyReportsData.map((r: any) => ({
            id: r.id, 
            authorId: r.author_id, 
            date: r.date, 
            project: r.project,
            objectives: r.objectives || '', 
            tasks: parseTasks(r.tasks), 
            results: r.results || '',
            difficulties: r.difficulties || '', 
            observations: r.observations || '',
            status: r.status || 'Brouillon',
            isLocked: r.is_locked ?? false,
            category: r.category || 'Opérationnel',
            createdAt: r.created_at, 
            updatedAt: r.updated_at
          }));
          const merged = mergeData(cachedV2DailyReports, parsed);
          setV2DailyReports(merged); await db.v2DailyReports.setItem('data', merged);
        }
        if (v2WeeklyReportsData && v2WeeklyReportsData.length > 0) {
          const parseTasksByDay = (raw: any): Record<string, V2Task[]> => {
            if (typeof raw === 'string') {
              try {
                raw = JSON.parse(raw);
              } catch {
                return {};
              }
            }
            if (typeof raw === 'object' && raw !== null) {
              const res: Record<string, V2Task[]> = {};
              Object.keys(raw).forEach(k => {
                const v = raw[k];
                if (Array.isArray(v)) res[k] = v;
                else if (typeof v === 'string') {
                  try {
                    const pv = JSON.parse(v);
                    res[k] = Array.isArray(pv) ? pv : [];
                  } catch {
                    res[k] = [];
                  }
                }
              });
              return res;
            }
            return {};
          };

          const parsed = v2WeeklyReportsData.map((r: any) => ({
            id: r.id, 
            authorId: r.author_id, 
            weekStart: r.week_start,
            weekEnd: r.week_end || undefined,
            project: r.project,
            dailyReportIds: r.daily_report_ids || [], 
            weeklyObjectives: r.weekly_objectives || '',
            tasksByDay: parseTasksByDay(r.tasks_by_day), 
            pendingTasks: Array.isArray(r.pending_tasks) ? r.pending_tasks : [], 
            summary: r.summary || r.ai_summary || '',
            aiSummary: r.ai_summary || r.summary || '',
            achievements: r.achievements || '',
            difficulties: r.difficulties || '',
            nextWeekObjectives: r.next_week_objectives || '', 
            conclusion: r.conclusion || '', 
            directorComment: r.director_comment || undefined,
            submittedAt: r.submitted_at || undefined,
            reviewedAt: r.reviewed_at || undefined,
            reviewedBy: r.reviewed_by || undefined,
            isLocked: r.is_locked ?? (r.status === 'Soumis' || r.status === 'Validé'),
            pdfUrl: r.pdf_url || undefined,
            status: r.status,
            createdAt: r.created_at, 
            updatedAt: r.updated_at
          }));
          const merged = mergeData(cachedV2WeeklyReports, parsed);
          setV2WeeklyReports(merged); await db.v2WeeklyReports.setItem('data', merged);
        }
        if (posCategoriesData && posCategoriesData.length > 0) {
          const parsed = posCategoriesData.map((c: any) => ({ id: c.id, name: c.name, family: c.family }));
          const merged = mergeData(cachedPosCategories, parsed);
          setPosCategories(merged); await safeSet(db.posCategories, merged);
        }
        if (posBrandsData && posBrandsData.length > 0) {
          const parsed = posBrandsData.map((b: any) => ({ id: b.id, name: b.name }));
          const merged = mergeData(cachedPosBrands, parsed);
          setPosBrands(merged); await safeSet(db.posBrands, merged);
        }
        if (posSuppliersData && posSuppliersData.length > 0) {
          const parsed = posSuppliersData.map((s: any) => ({ id: s.id, name: s.name, contact: s.contact, phone: s.phone, email: s.email, address: s.address }));
          const merged = mergeData(cachedPosSuppliers, parsed);
          setPosSuppliers(merged); await safeSet(db.posSuppliers, merged);
        }
        if (posProductsData && posProductsData.length > 0) {
          const parsed = posProductsData
            .filter((p: any) => p.family !== 'Service' && !p.reference?.startsWith('SRV-') && p.id !== '00000000-0000-0000-0000-000000000000')
            .map((p: any) => {
              // Valeurs serveur respectées telles quelles : aucun prix fabriqué, aucun seuil imposé
              // (0 explicite conservé ; 10 par défaut uniquement si NULL/non défini)
              return {
                id: resolveProductUuid(p.id, p.reference), reference: p.reference, barcode: p.barcode, isbn: p.isbn, name: p.name,
                family: p.family, categoryId: p.category_id, brandId: p.brand_id, supplierId: p.supplier_id,
                purchasePrice: p.purchase_price ?? 0, sellingPrice: p.selling_price ?? 0, quantity: p.quantity ?? 0,
                minStock: (p.min_stock !== null && p.min_stock !== undefined) ? p.min_stock : 10, imageUrl: p.image_url, description: p.description,
                status: p.status || 'Active', isActive: p.is_active !== false, unit: p.unit, createdAt: p.created_at, updatedAt: p.updated_at
              };
            });
          const cleanCached = (cachedPosProducts || []).filter((p: any) => p.family !== 'Service' && !p.reference?.startsWith('SRV-'));
          const merged = mergeData(cleanCached, parsed);
          setPosProducts(merged);
          await safeSet(db.posProducts, merged);
        }
        if (posStockEntriesData && posStockEntriesData.length > 0) {
          const parsed = posStockEntriesData
            .filter((e: any) => e.notes !== 'VENTE' && !e.reference?.startsWith('VENTE-'))
            .map((e: any) => ({
              id: e.id, reference: e.reference, supplierId: e.supplier_id, date: e.date,
              totalAmount: e.total_amount, status: e.status, notes: e.notes, createdBy: e.created_by,
              lines: (e.pos_stock_entry_lines || []).map((l: any) => ({
                id: l.id, productId: l.product_id, quantity: l.quantity, purchasePrice: l.purchase_price, total: l.total
              }))
            }));
          const filteredCached = (cachedPosStockEntries || []).filter(e => e.notes !== 'VENTE' && !e.reference?.startsWith('VENTE-'));
          const kept = mergeKeepChildren(filteredCached, parsed, ['lines']);
          const merged = kept.merged;
          setPosStockEntries(merged); await db.posStockEntries.setItem('data', merged);
          await healQueueMissingChildren(new Map(filteredCached.map(e => [e.id, e])), kept.healedIds, 'INSERT_POS_STOCK_ENTRY');
        }
        if (posStockMovementsData && posStockMovementsData.length > 0) {
          const parsed = posStockMovementsData.map((m: any) => ({
            id: m.id, productId: m.product_id, type: m.type, quantity: m.quantity,
            reference: m.reference, date: m.date, createdBy: m.created_by, notes: m.notes
          }));
          const merged = mergeData(cachedPosStockMovements, parsed);
          setPosStockMovements(merged); await db.posStockMovements.setItem('data', merged);
        }
        if (posInventoriesData && posInventoriesData.length > 0) {
          const parsed = posInventoriesData.map((i: any) => ({
            id: i.id, reference: i.reference, date: i.date, status: i.status, notes: i.notes, createdBy: i.created_by,
            lines: (i.pos_inventory_lines || []).map((l: any) => ({
              id: l.id, productId: l.product_id, expectedQty: l.expected_qty, countedQty: l.counted_qty, difference: l.difference
            }))
          }));
          const keptInv = mergeKeepChildren(cachedPosInventories, parsed, ['lines']);
          const merged = keptInv.merged;
          setPosInventories(merged); await db.posInventories.setItem('data', merged);
          await healQueueMissingChildren(new Map((cachedPosInventories || []).map(i => [i.id, i])), keptInv.healedIds, 'INSERT_POS_INVENTORY');
        }
        if (posCashSessionsData && posCashSessionsData.length > 0) {
          const parsed = posCashSessionsData.map((s: any) => ({
            id: s.id, cashierId: s.cashier_id, openedAt: s.opened_at, closedAt: s.closed_at,
            initialFund: s.initial_fund, finalAmount: s.final_amount, expectedAmount: s.expected_amount,
            difference: s.difference, status: s.status
          }));
          const latestLocalSessions = (await safeGet<PosCashSession[]>(db.posCashSessions)) || cachedPosCashSessions;
          const merged = mergeData(latestLocalSessions, parsed);
          setPosCashSessions(merged); await safeSet(db.posCashSessions, merged);
        }
        if (posTransactionsData && posTransactionsData.length > 0) {
          const parsed = posTransactionsData.map((t: any) => ({
            id: t.id, transactionNumber: t.transaction_number, cashierId: t.cashier_id,
            sessionId: t.session_id, date: t.date, subtotal: t.subtotal, vat: t.vat ?? 0,
            discountAmount: t.discount_amount, total: t.total, status: t.status,
            lines: (t.pos_transaction_lines || []).map((l: any) => ({
              id: l.id, productId: l.product_id, description: l.description, quantity: l.quantity,
              unitPrice: l.unit_price, discountPercent: l.discount_percent, discountAmount: l.discount_amount, total: l.total,
              costPrice: l.cost_price !== null && l.cost_price !== undefined ? Number(l.cost_price) : undefined
            })),
            payments: (t.pos_payments || []).map((p: any) => ({
              id: p.id, transactionId: p.transaction_id, method: p.method, amount: p.amount, reference: p.reference
            }))
          }));
          const latestLocalTxs = (await safeGet<PosTransaction[]>(db.posTransactions)) || cachedPosTransactions;
          const baseMerged = mergeData(latestLocalTxs, parsed);
          // Garde B7 : une vente valide a toujours ≥1 ligne et ≥1 paiement (panier vide bloqué
          // dans PosTerminal). Si le serveur renvoie une vente sans lignes (échec partiel de
          // synchro), ne jamais écraser le local : garder lignes/paiements locaux et remettre
          // la vente en file pour auto-réparation (le chemin résilient détachera si besoin).
          const localById = new Map((latestLocalTxs || []).map(t => [t.id, t]));
          const merged = baseMerged.map(t => {
            const local = localById.get(t.id);
            if (!local) return t;
            const keepLines = (!t.lines || t.lines.length === 0) && (local.lines?.length || 0) > 0;
            const keepPays = (!t.payments || t.payments.length === 0) && (local.payments?.length || 0) > 0;
            if (!keepLines && !keepPays) return t;
            return { ...t, lines: keepLines ? local.lines : t.lines, payments: keepPays ? local.payments : t.payments };
          });
          setPosTransactions(merged); await safeSet(db.posTransactions, merged);
          await healQueueMissingChildren(
            localById,
            merged.filter(t => {
              const local = localById.get(t.id);
              return !!(local && (local.lines?.length || 0) > 0 && (!parsed.find((p: any) => p.id === t.id)?.lines?.length));
            }).map(t => t.id),
            'INSERT_POS_TRANSACTION'
          );
        }
        if (posPaymentsData && posPaymentsData.length > 0) {
          const parsed = posPaymentsData.map((p: any) => ({ id: p.id, transactionId: p.transaction_id, method: p.method, amount: p.amount, reference: p.reference }));
          const latestLocalPayments = (await safeGet<PosPayment[]>(db.posPayments)) || cachedPosPayments;
          const merged = mergeData(latestLocalPayments, parsed);
          setPosPayments(merged); await safeSet(db.posPayments, merged);
        }
        if (posDiscountsData && posDiscountsData.length > 0) {
          const parsed = posDiscountsData.map((d: any) => ({ id: d.id, name: d.name, type: d.type, value: d.value, maxPercent: d.max_percent, maxAmount: d.max_amount, active: d.active }));
          const latestLocalDiscounts = (await safeGet<PosDiscount[]>(db.posDiscounts)) || cachedPosDiscounts;
          const merged = mergeData(latestLocalDiscounts, parsed);
          setPosDiscounts(merged); await safeSet(db.posDiscounts, merged);
        }
        if (posSettingsData) {
          const parsed: PosSettings = { libraryName: posSettingsData.library_name, address: posSettingsData.address, phone: posSettingsData.phone, email: posSettingsData.email, currency: posSettingsData.currency, ticketMessage: posSettingsData.ticket_message, printerType: posSettingsData.printer_type, whatsappOrderPhone: posSettingsData.whatsapp_order_phone || undefined, catalogBannerText: posSettingsData.catalog_banner_text || undefined, themeColor: posSettingsData.theme_color || undefined };
          setPosSettingsState(parsed); await db.posSettings.setItem('data', parsed);
        }
        
        if (posReturnsData && posReturnsData.length > 0) {
          const parsed: PosReturn[] = posReturnsData.map((r: any) => ({
            id: r.id,
            returnNumber: r.return_number,
            transactionId: r.transaction_id || undefined,
            sessionId: r.session_id || undefined,
            date: r.date,
            type: r.type,
            totalRefund: r.total_refund,
            totalExchange: r.total_exchange || 0,
            amountToPay: r.amount_to_pay || 0,
            refundMethod: r.refund_method || 'Espèces',
            complementTransactionId: r.complement_transaction_id || undefined,
            status: r.status,
            notes: r.notes || '',
            createdBy: r.created_by || undefined,
            lines: (r.pos_return_lines || []).filter((l: any) => l.reason !== 'Échange').map((l: any) => ({
              id: l.id,
              productId: l.product_id || undefined,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unit_price,
              total: l.total,
              reason: l.reason || ''
            })),
            // Les lignes d'échange partagent la table (reason='Échange') : les reventiler, sinon perdues au refresh
            exchangeLines: (r.pos_return_lines || []).filter((l: any) => l.reason === 'Échange').map((l: any) => ({
              id: l.id,
              productId: l.product_id || undefined,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unit_price,
              total: l.total
            }))
          }));
          const latestLocalReturns = (await safeGet<PosReturn[]>(db.posReturns)) || cachedPosReturns;
          const keptRet = mergeKeepChildren(latestLocalReturns, parsed, ['lines', 'exchangeLines']);
          const merged = keptRet.merged;
          setPosReturns(merged); await safeSet(db.posReturns, merged);
          await healQueueMissingChildren(new Map((latestLocalReturns || []).map(r => [r.id, r])), keptRet.healedIds, 'INSERT_POS_RETURN');
        }

        if (crmTiersData && crmTiersData.length > 0) {
          const parsed: ClientFournisseur[] = crmTiersData.map((t: any) => ({
            id: t.id,
            type: t.type,
            nom: t.nom,
            telephone: t.telephone || undefined,
            email: t.email || undefined,
            adresse: t.adresse || undefined,
            ville: t.ville || undefined,
            cree_par: t.cree_par || undefined,
            cree_par_nom: t.cree_par_nom || undefined,
            created_at: t.created_at
          }));
          const merged = mergeData(cachedCrmTiers, parsed);
          setCrmTiers(merged); await db.crmTiers.setItem('data', merged);
        }

        if (crmCommerciauxData && crmCommerciauxData.length > 0) {
          const parsed: AgentCommercial[] = crmCommerciauxData.map((c: any) => ({
            id: c.id,
            nom: c.nom,
            telephone: c.telephone || undefined,
            email: c.email || undefined,
            taux_commission_defaut: Number(c.taux_commission_defaut) || 0,
            total_ventes: Number(c.total_ventes) || 0,
            contrats_clos_count: Number(c.contrats_clos_count) || 0,
            cree_par: c.cree_par || undefined,
            cree_par_nom: c.cree_par_nom || undefined,
            created_at: c.created_at
          }));
          const merged = mergeData(cachedCrmCommerciaux, parsed);
          setCrmCommerciaux(merged); await db.crmCommerciaux.setItem('data', merged);
        }

        if (crmPrestationsData && crmPrestationsData.length > 0) {
          const parsed: PrestationCommande[] = crmPrestationsData.map((p: any) => ({
            id: p.id,
            reference: p.reference,
            client_id: p.client_id,
            client_nom: p.client_nom,
            commercial_id: p.commercial_id || undefined,
            commercial_nom: p.commercial_nom || undefined,
            apporteur_id: p.apporteur_id || undefined,
            apporteur_nom: p.apporteur_nom || undefined,
            resp_service_id: p.resp_service_id || undefined,
            resp_service_nom: p.resp_service_nom || undefined,
            responsable_service_id: (p as any).responsable_service_id || undefined,
            responsable_service_nom: (p as any).responsable_service_nom || undefined,
            designation: p.designation,
            quantite: Number(p.quantite) || 1,
            cout_unitaire_achat: Number(p.cout_unitaire_achat) || 0,
            cout_final_achat: Number(p.cout_final_achat) || 0,
            prix_vente_unitaire: Number(p.prix_vente_unitaire) || 0,
            prix_client_final: Number(p.prix_client_final) || 0,
            marge_interne: Number(p.marge_interne) || 0,
            taux_commission_app: Number(p.taux_commission_app) || 0,
            commission_apporteur: Number(p.commission_apporteur) || 0,
            taux_commission_resp: Number((p as any).taux_commission_resp) || 0,
            mode_commission_resp: ((p as any).mode_commission_resp === 'TAUX' ? 'TAUX' : 'MONTANT') as 'MONTANT' | 'TAUX',
            commission_resp_service: Number(p.commission_resp_service) || 0,
            taux_commission_agent: Number((p as any).taux_commission_agent) || 0,
            mode_commission_agent: ((p as any).mode_commission_agent === 'TAUX' ? 'TAUX' : 'MONTANT') as 'MONTANT' | 'TAUX',
            commission_agent: Number(p.commission_agent) || 0,
            benefice_net: Number(p.benefice_net) || 0,
            statut: p.statut || 'BROUILLON',
            cree_par: p.cree_par,
            cree_par_nom: p.cree_par_nom || undefined,
            date_creation: p.date_creation || p.created_at,
            date_commande: (p as any).date_commande || undefined,
            date_validation: p.date_validation || undefined,
            notes: p.notes || undefined,
            created_at: (p as any).created_at || undefined,
            updated_at: (p as any).updated_at || undefined
          }));
          const merged = mergeData(cachedCrmPrestations, parsed);
          setCrmPrestations(merged); await db.crmPrestations.setItem('data', merged);
        }

        if (crmCaisseData && crmCaisseData.length > 0) {
          const parsed: MouvementCaisse[] = crmCaisseData.map((m: any) => ({
            id: m.id,
            type: m.type,
            categorie: m.categorie,
            montant: Number(m.montant) || 0,
            date_mouvement: m.date_mouvement || m.date || m.created_at,
            mode_reglement: m.mode_reglement,
            motif: m.motif,
            module_code: m.module_code || undefined,
            tier_id: m.tier_id || undefined,
            tier_type: m.tier_type || undefined,
            beneficiaire_emetteur: m.beneficiaire_emetteur || undefined,
            reference_piece: m.reference_piece || undefined,
            date: m.date || undefined,
            cree_par: m.cree_par,
            cree_par_nom: m.cree_par_nom || undefined,
            created_at: m.created_at,
            updated_at: m.updated_at || undefined
          }));
          const merged = mergeData(cachedCrmCaisse, parsed);
          setCrmCaisse(merged); await db.crmCaisse.setItem('data', merged);
        }

        if (crmCommissionsData && crmCommissionsData.length > 0) {
          const parsed: CommissionPrestation[] = crmCommissionsData.map((c: any) => ({
            id: c.id,
            prestation_id: c.prestation_id,
            prestation_ref: c.prestation_ref || undefined,
            type_beneficiaire: c.type_beneficiaire,
            type: c.type || undefined,
            beneficiaire_id: c.beneficiaire_id || undefined,
            beneficiaire_nom: c.beneficiaire_nom || '',
            montant: Number(c.montant) || 0,
            montant_prestation: c.montant_prestation !== null && c.montant_prestation !== undefined ? Number(c.montant_prestation) : undefined,
            montant_commission: c.montant_commission !== null && c.montant_commission !== undefined ? Number(c.montant_commission) : undefined,
            statut: c.statut || 'EN_ATTENTE',
            date_reglement: c.date_reglement || undefined,
            mode_reglement: c.mode_reglement || undefined,
            mouvement_caisse_id: c.mouvement_caisse_id || undefined,
            cree_par: c.cree_par || undefined,
            created_at: c.created_at,
            updated_at: c.updated_at || undefined
          }));
          const merged = mergeData(cachedCrmCommissions, parsed);
          setCrmCommissions(merged); await db.crmCommissions.setItem('data', merged);
        }

        if (crmArticlesData && crmArticlesData.length > 0) {
          const parsed: CatalogueArticle[] = crmArticlesData.map((a: any) => ({
            id: a.id,
            code_article: a.code_article,
            designation: a.designation,
            categorie: a.categorie || 'Général',
            type_article: a.type_article || undefined,
            quantite_stock: Number(a.quantite_stock) || 0,
            seuil_alerte: Number(a.seuil_alerte) || 5,
            cout_unitaire_achat: Number(a.cout_unitaire_achat) || 0,
            prix_unitaire_vente: Number(a.prix_unitaire_vente) || 0,
            unite: a.unite || undefined,
            fournisseur_id: a.fournisseur_id || undefined,
            cree_par: a.cree_par || undefined,
            cree_par_nom: a.cree_par_nom || undefined,
            created_at: a.created_at,
            updated_at: a.updated_at
          }));
          const merged = mergeData(cachedCrmArticles, parsed);
          setCrmArticles(merged); await db.crmArticles.setItem('data', merged);
        }

        if (crmStockMouvementsData && crmStockMouvementsData.length > 0) {
          const parsed: MouvementStock[] = crmStockMouvementsData.map((m: any) => ({
            id: m.id,
            article_id: m.article_id || undefined,
            article_code: m.article_code || undefined,
            type: m.type || 'AJUSTEMENT',
            quantite: Number(m.quantite) || 0,
            stock_avant: Number(m.stock_avant) || 0,
            stock_apres: Number(m.stock_apres) || 0,
            motif: m.motif || undefined,
            cree_par: m.cree_par || undefined,
            cree_par_nom: m.cree_par_nom || undefined,
            created_at: m.created_at
          }));
          const merged = mergeData(cachedCrmStockMouvements, parsed);
          setCrmStockMouvements(merged); await db.crmStockMouvements.setItem('data', merged);
        }

        if (crmMaintenanceData && crmMaintenanceData.length > 0) {
          const parsed: InterventionMaintenance[] = crmMaintenanceData.map((m: any) => ({
            id: m.id,
            reference: m.reference,
            client_id: m.client_id || undefined,
            client_nom: m.client_nom || undefined,
            site_agence: m.site_agence,
            utilisateur_concerne: m.utilisateur_concerne,
            equipement: m.equipement,
            priorite: m.priorite || 'MOYENNE',
            observation: m.observation,
            travaux: m.travaux,
            quantite: Number(m.quantite) || 1,
            prix_unitaire: Number(m.prix_unitaire) || 0,
            prix_total: Number(m.prix_total) || 0,
            prix: m.prix !== null && m.prix !== undefined ? Number(m.prix) : undefined,
            technicien_assigne: m.technicien_assigne,
            statut: m.statut || 'NOUVEAU',
            date_intervention: m.date_intervention || m.created_at,
            cree_par: m.cree_par,
            cree_par_nom: m.cree_par_nom || undefined,
            created_at: m.created_at,
            updated_at: m.updated_at
          }));
          const merged = mergeData(cachedCrmMaintenance, parsed);
          setCrmMaintenance(merged); await db.crmMaintenance.setItem('data', merged);
        }

        if (crmTechniciensData && crmTechniciensData.length > 0) {
          const parsed: TechnicienMaintenance[] = crmTechniciensData.map((t: any) => ({
            id: t.id,
            nom: t.nom,
            telephone: t.telephone || undefined,
            email: t.email || undefined,
            specialite: t.specialite || undefined,
            statut: t.statut || 'DISPONIBLE',
            cree_par: t.cree_par || undefined,
            cree_par_nom: t.cree_par_nom || undefined,
            created_at: t.created_at,
            updated_at: t.updated_at
          }));
          const merged = mergeData(cachedCrmTechniciens, parsed);
          setCrmTechniciens(merged); await db.crmTechniciens.setItem('data', merged);
        }

        if (invoicesData && invoicesData.length > 0) {
          // Jointure locale des lignes (fetch séparé, cf. fetchTasks) : regroupe
          // par invoice_id au lieu de l'embed PostgREST défaillant en prod.
          const itemsByInvoice = new Map<string, any[]>();
          for (const it of (invoiceItemsData || [])) {
            const k = (it as any)?.invoice_id;
            if (!k) continue;
            const arr = itemsByInvoice.get(k);
            if (arr) arr.push(it);
            else itemsByInvoice.set(k, [it]);
          }
          const parsed: Invoice[] = invoicesData.map((inv: any) => {
            const d = inv.delivery_date || inv.issue_date || inv.created_at;
            const fallbackDate = d ? new Date(d) : new Date();
            const year = inv.period_year ? Number(inv.period_year) : (isNaN(fallbackDate.getFullYear()) ? new Date().getFullYear() : fallbackDate.getFullYear());
            const month = inv.period_month ? Number(inv.period_month) : (isNaN(fallbackDate.getMonth()) ? new Date().getMonth() + 1 : fallbackDate.getMonth() + 1);

            return {
              id: inv.id,
              invoiceNumber: inv.invoice_number,
              quoteId: inv.quote_id || undefined,
              clientId: inv.client_id,
              clientName: inv.client_nom || undefined,
              commercialId: inv.commercial_id || undefined,
              commercialName: inv.commercial_nom || undefined,
              serviceId: inv.service_id || undefined,
              serviceName: inv.service_nom || undefined,
              category: inv.category || undefined,
              periodYear: year,
              periodMonth: month,
              issueDate: inv.issue_date,
              deliveryDate: inv.delivery_date || undefined,
              paymentDate: inv.payment_date || undefined,
              paymentTerms: inv.payment_terms || '30 jours',
              dueDate: inv.due_date,
              subtotal: Number(inv.subtotal) || 0,
              taxAmount: Number(inv.tax_amount) || 0,
              discountAmount: Number(inv.discount_amount) || 0,
              totalAmount: Number(inv.total_amount) || 0,
              costAmount: Number(inv.cost_amount) || 0,
              commissionRate: inv.commission_rate === undefined || inv.commission_rate === null || inv.commission_rate === '' ? 10 : (Number(inv.commission_rate) || 0),
              commissionAmount: Number(inv.commission_amount) || 0,
              grossMargin: Number(inv.gross_margin) || 0,
              hinovMargin: Number(inv.hinov_margin) || 0,
              amountPaid: Number(inv.amount_paid) || 0,
              remainingAmount: Number(inv.remaining_amount) || 0,
              status: (inv.status as InvoiceStatus) || 'ÉMISE',
              notes: inv.notes || undefined,
              createdBy: inv.created_by || undefined,
              createdAt: inv.created_at,
              updatedAt: inv.updated_at,
              items: ((itemsByInvoice.get(inv.id) || []) as any[]).map((it: any) => ({
                id: it.id,
                invoiceId: it.invoice_id,
                prestationId: it.prestation_id || undefined,
                description: it.description,
                quantity: Number(it.quantity) || 1,
                unitPrice: Number(it.unit_price) || 0,
                costPrice: Number(it.cost_price) || 0,
                discountPercent: Number(it.discount_percent) || 0,
                taxRate: Number(it.tax_rate) || 0,
                total: Number(it.total) || 0,
                createdAt: it.created_at
              }))
            };
          });
          const merged = mergeData(cachedInvoices, parsed);
          setInvoices(merged);
          await db.invoices.setItem('data', merged);
        }

        if (invoicePaymentsData && invoicePaymentsData.length > 0) {
          const parsed: InvoicePayment[] = invoicePaymentsData.map((p: any) => ({
            id: p.id,
            invoiceId: p.invoice_id,
            paymentNumber: p.payment_number || undefined,
            paymentDate: p.payment_date,
            amount: Number(p.amount) || 0,
            paymentMethod: p.payment_method || 'Espèces',
            reference: p.reference || undefined,
            notes: p.notes || undefined,
            createdBy: p.created_by || undefined,
            createdAt: p.created_at
          }));
          const merged = mergeData(cachedInvoicePayments, parsed);
          setInvoicePayments(merged);
          await db.invoicePayments.setItem('data', merged);
        }

        // Update last sync time for next delta fetch
        await db.syncMetadata.setItem('lastSyncTime', syncTimestamp);
        lastRefreshTimeRef.current = Date.now();
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      inFlightRefreshRef.current = null;
    }
  };

    inFlightRefreshRef.current = executeRefresh();
    return inFlightRefreshRef.current;
  }, [currentUser]);

  useEffect(() => { refreshData(); }, [refreshData]);

  // Realtime delta sync & live POS subscriptions
  useEffect(() => {
    if (!currentUser) return;

    let refreshTimeout: any = null;
    const debouncedRefresh = () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        refreshData(true);
      }, 1200);
    };

    const channel = supabase.channel('pos-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_transactions' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_cash_sessions' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_payments' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_returns' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_products' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_stock_entries' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_stock_movements' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public' }, debouncedRefresh)
      .subscribe();

    // Heartbeat polling (toutes les 45s) en tâche de fond transparente
    const heartbeatInterval = setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        refreshData(true);
      }
    }, 45000);
      
    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      clearInterval(heartbeatInterval);
      supabase.removeChannel(channel);
    };
  }, [currentUser, refreshData]);

  // Auto-retry & Auto-réconciliation : relance la sync queue et résout les anomalies en arrière-plan
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!navigator.onLine) return;
      const queue = await db.syncQueue.getItem<any[]>('queue');
      if (queue && queue.length > 0) {
        console.log(`[AutoSync] ${queue.length} action(s) en attente. Tentative de synchronisation...`);
        await processSyncQueue();
      }
      // Rapprochement automatique silencieux si des erreurs ou des données non envoyées subsistent
      const errors = await db.syncErrors.getItem<any[]>('errors');
      if (errors && errors.length > 0) {
        await reconcileAllOfflineDataWithCloud().catch(() => {});
      }
    }, 60 * 1000); // vérification toutes les 60s
    return () => clearInterval(interval);
  }, []);

  // Écouteurs de réveil automatique : reconnexion réseau, focus de fenêtre et visibilité d'onglet
  useEffect(() => {
    if (!currentUser) return;

    const handleWakeup = async () => {
      if (navigator.onLine) {
        await processSyncQueue();
        await reconcileAllOfflineDataWithCloud().catch(() => {});
        refreshData(true);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        refreshData(true);
      }
    };

    window.addEventListener('online', handleWakeup);
    window.addEventListener('focus', handleWakeup);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleWakeup);
      window.removeEventListener('focus', handleWakeup);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUser, refreshData]);

  // Écoute les erreurs critiques de synchronisation et les affiche comme toast.
  // Anti-boucle : une même entité en échec ne déclenche qu'un toast toutes les 10 min,
  // et jamais plus de 3 toasts par minute (rafale pendant la résorption d'une file).
  // Le compteur reste visible via le badge d'erreurs.
  useEffect(() => {
    const handleSyncCriticalError = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message: string; action?: any };
      const now = Date.now();
      try {
        const key = `${detail?.action?.type || ''}::${detail?.action?.payload?.id ?? detail?.action?.payload?.reference ?? detail?.message ?? ''}`;
        const last = toastedSyncErrorKeys.get(key) || 0;
        if (now - last < TOAST_SYNC_COOLDOWN_MS) return;
        while (toastSyncWindow.length > 0 && now - toastSyncWindow[0] > 60000) toastSyncWindow.shift();
        if (toastSyncWindow.length >= TOAST_SYNC_MAX_PER_MIN) return;
        toastedSyncErrorKeys.set(key, now);
        toastSyncWindow.push(now);
      } catch { /* en cas de doute, on affiche */ }
      toast((t) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontWeight: 600, color: '#991B1B', fontSize: '13px' }}>
            {detail.message}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                // App en HashRouter : naviguer par le hash uniquement. Un href sur
                // le pathname recharge une route inexistante (page blanche).
                window.location.hash = '#/';
              }}
              style={{
                background: '#DC2626',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Voir les erreurs
            </button>
            <button
              onClick={() => toast.dismiss(t.id)}
              style={{
                background: 'transparent',
                color: '#6B7280',
                border: 'none',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              Fermer
            </button>
          </div>
        </div>
      ), {
        duration: 9000,
        style: {
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          padding: '12px',
          maxWidth: '420px'
        }
      });
    };
    window.addEventListener('sync-critical-error', handleSyncCriticalError);
    return () => window.removeEventListener('sync-critical-error', handleSyncCriticalError);
  }, []);

  // MUTATIONS (Offline First)
  const addClient = async (client: Client) => {
    // Generate UUID if it's not a valid UUID (e.g. if it was Date.now())
    const newClient = { ...client, id: client.id.length > 20 ? client.id : uuidv4(), createdAt: client.createdAt || new Date().toISOString() };
    const newClients = [...clients, newClient];
    setClients(newClients);
    await db.clients.setItem('data', newClients);
    await queueSyncAction('INSERT_CLIENT', newClient);
  };

  const updateClient = async (id: string, client: Client) => {
    const newClients = clients.map(c => c.id === id ? { ...client, id } : c);
    setClients(newClients);
    await db.clients.setItem('data', newClients);
    await queueSyncAction('UPDATE_CLIENT', { ...client, id });
  };

  const deleteClient = async (id: string) => {
    const newClients = clients.filter(c => c.id !== id);
    setClients(newClients);
    await db.clients.setItem('data', newClients);
    await queueSyncAction('DELETE_CLIENT', { id });

    const newQuotes = quotes.filter(q => q.clientId !== id);
    if (newQuotes.length !== quotes.length) {
      setQuotes(newQuotes);
      await db.quotes.setItem('data', newQuotes);
    }

    const newSales = sales.filter(s => s.clientId !== id);
    if (newSales.length !== sales.length) {
      setSales(newSales);
      await db.sales.setItem('data', newSales);
      
      const saleIds = sales.filter(s => s.clientId === id).map(s => s.id);
      const newInstallments = installments.filter(i => !saleIds.includes(i.saleId));
      if (newInstallments.length !== installments.length) {
        setInstallments(newInstallments);
        await db.installments.setItem('data', newInstallments);
      }
    }

    const newCommissions = commissions.filter(c => c.clientId !== id);
    if (newCommissions.length !== commissions.length) {
      setCommissions(newCommissions);
      await db.commissions.setItem('data', newCommissions);
    }
  };

  const recordPayment = async (paymentData: Omit<FacturePaiement, 'id' | 'paymentNumber' | 'createdAt'> | FacturePaiement): Promise<FacturePaiement> => {
    const now = new Date();
    const year = now.getFullYear();
    const seq = (facturePaiements.length + 1).toString().padStart(4, '0');
    const paymentNumber = ('paymentNumber' in paymentData && paymentData.paymentNumber) ? paymentData.paymentNumber : `PAY-${year}-${seq}`;
    const id = ('id' in paymentData && paymentData.id) ? paymentData.id : uuidv4();
    const createdAt = ('createdAt' in paymentData && paymentData.createdAt) ? paymentData.createdAt : now.toISOString();

    const newPayment: FacturePaiement = {
      ...paymentData,
      id,
      paymentNumber,
      createdAt
    };

    const updatedPaiements = [newPayment, ...facturePaiements];
    setFacturePaiements(updatedPaiements);
    await db.facturePaiements.setItem('data', updatedPaiements);
    await queueSyncAction('INSERT_FACTURE_PAIEMENT', newPayment);

    // Calcul du statut de la vente associée en fonction des paiements réels
    const sale = sales.find(s => s.id === newPayment.venteId);
    if (sale) {
      const salePayments = updatedPaiements.filter(p => p.venteId === sale.id && p.status === 'VALIDE');
      const netPaid = salePayments.reduce((sum, p) => p.paymentType === 'ENCAISSEMENT' ? sum + p.amount : sum - p.amount, 0);
      let newSaleStatus: Sale['status'] = sale.status;
      if (netPaid >= sale.total) {
        newSaleStatus = 'Payée';
      } else if (netPaid > 0) {
        newSaleStatus = 'Enregistrée';
      }
      if (newSaleStatus !== sale.status) {
        await updateSaleStatus(sale.id, newSaleStatus);
      }

      // Synchroniser le montant déblocable de la commission liée
      const linkedCommission = commissions.find(c => c.saleId === sale.id);
      if (linkedCommission) {
        const totalTtc = sale.total || 1;
        const collectionRate = Math.max(0, Math.min(1, netPaid / totalTtc));
        const eligibleAmount = Math.round(linkedCommission.commissionAmount * collectionRate);
        if (eligibleAmount !== linkedCommission.eligibleAmount) {
          const updatedComm = { ...linkedCommission, eligibleAmount };
          const newCommissions = commissions.map(c => c.id === linkedCommission.id ? updatedComm : c);
          setCommissions(newCommissions);
          await db.commissions.setItem('data', newCommissions);
          await queueSyncAction('UPDATE_COMMISSION', { id: updatedComm.id, eligibleAmount });
        }
      }
    }

    return newPayment;
  };

  const addCout = async (coutData: Omit<Cout, 'id' | 'reference' | 'vatAmount' | 'amountTtc' | 'createdAt' | 'updatedAt'> | Cout): Promise<Cout> => {
    const now = new Date();
    const year = now.getFullYear();
    const seq = (couts.length + 1).toString().padStart(4, '0');
    const reference = ('reference' in coutData && coutData.reference) ? coutData.reference : `CST-${year}-${seq}`;
    const id = ('id' in coutData && coutData.id) ? coutData.id : uuidv4();
    const createdAt = ('createdAt' in coutData && coutData.createdAt) ? coutData.createdAt : now.toISOString();
    const updatedAt = ('updatedAt' in coutData && coutData.updatedAt) ? coutData.updatedAt : now.toISOString();

    const amountHt = coutData.amountHt;
    const vatRate = coutData.vatRate || 0;
    const vatAmount = ('vatAmount' in coutData && coutData.vatAmount !== undefined) ? coutData.vatAmount : Math.round(amountHt * (vatRate / 100));
    const amountTtc = ('amountTtc' in coutData && coutData.amountTtc !== undefined) ? coutData.amountTtc : amountHt + vatAmount;

    const newCout: Cout = {
      ...coutData,
      id,
      reference,
      vatRate,
      vatAmount,
      amountTtc,
      createdAt,
      updatedAt
    };

    const updatedCouts = [newCout, ...couts];
    setCouts(updatedCouts);
    await db.couts.setItem('data', updatedCouts);
    await queueSyncAction('INSERT_COUT', newCout);
    return newCout;
  };

  const updateCout = async (id: string, data: Partial<Cout>) => {
    const existing = couts.find(c => c.id === id);
    if (!existing) return;
    const amountHt = data.amountHt !== undefined ? data.amountHt : existing.amountHt;
    const vatRate = data.vatRate !== undefined ? data.vatRate : existing.vatRate;
    const vatAmount = data.vatAmount !== undefined ? data.vatAmount : Math.round(amountHt * (vatRate / 100));
    const amountTtc = data.amountTtc !== undefined ? data.amountTtc : amountHt + vatAmount;

    const updated: Cout = {
      ...existing,
      ...data,
      id,
      amountHt,
      vatRate,
      vatAmount,
      amountTtc,
      updatedAt: new Date().toISOString()
    };
    const updatedCouts = couts.map(c => c.id === id ? updated : c);
    setCouts(updatedCouts);
    await db.couts.setItem('data', updatedCouts);
    await queueSyncAction('UPDATE_COUT', { ...updated, id });
  };

  const deleteCout = async (id: string) => {
    const updatedCouts = couts.filter(c => c.id !== id);
    setCouts(updatedCouts);
    await db.couts.setItem('data', updatedCouts);
    await queueSyncAction('DELETE_COUT', { id });
  };

  const addObjectif = async (objData: Omit<Objectif, 'id' | 'createdAt'> | Objectif): Promise<Objectif> => {
    const id = ('id' in objData && objData.id) ? objData.id : uuidv4();
    const createdAt = ('createdAt' in objData && objData.createdAt) ? objData.createdAt : new Date().toISOString();
    const newObj: Objectif = {
      ...objData,
      id,
      createdAt
    };
    const updated = [newObj, ...objectifs];
    setObjectifs(updated);
    await db.objectifs.setItem('data', updated);
    await queueSyncAction('INSERT_OBJECTIF', newObj);
    return newObj;
  };

  const updateObjectif = async (id: string, data: Partial<Objectif>) => {
    const updated = objectifs.map(o => o.id === id ? { ...o, ...data } : o);
    setObjectifs(updated);
    await db.objectifs.setItem('data', updated);
    await queueSyncAction('UPDATE_OBJECTIF', { ...data, id });
  };

  const deleteObjectif = async (id: string) => {
    const updated = objectifs.filter(o => o.id !== id);
    setObjectifs(updated);
    await db.objectifs.setItem('data', updated);
    await queueSyncAction('DELETE_OBJECTIF', { id });
  };

  const proposePrime = async (primeData: Omit<Prime, 'id' | 'reference' | 'status' | 'createdAt' | 'updatedAt'>, comment?: string): Promise<Prime> => {
    const now = new Date();
    const year = now.getFullYear();
    const seq = (primes.length + 1).toString().padStart(4, '0');
    const reference = `PRM-${year}-${seq}`;
    const id = uuidv4();
    const createdAt = now.toISOString();
    const updatedAt = createdAt;

    const newPrime: Prime = {
      ...primeData,
      id,
      reference,
      status: 'PROPOSEE',
      createdAt,
      updatedAt
    };

    const updatedPrimes = [newPrime, ...primes];
    setPrimes(updatedPrimes);
    await db.primes.setItem('data', updatedPrimes);
    await queueSyncAction('INSERT_PRIME', newPrime);

    // Immutable Audit log
    const log: PrimeAuditLog = {
      id: uuidv4(),
      primeId: id,
      action: 'CREATION',
      actorId: currentUser?.id || 'system',
      actorRole: currentUser?.role || 'Directeur',
      previousState: null,
      newState: newPrime,
      comment: comment || primeData.justification || 'Proposition initiale de prime',
      createdAt
    };
    const updatedLogs = [log, ...primeAuditLogs];
    setPrimeAuditLogs(updatedLogs);
    await db.primeAuditLogs.setItem('data', updatedLogs);
    await queueSyncAction('INSERT_PRIME_AUDIT_LOG', log);

    return newPrime;
  };

  const validatePrime = async (primeId: string, comment?: string) => {
    const prime = primes.find(p => p.id === primeId);
    if (!prime) return;
    const previousState = { ...prime };
    const validatedBy = currentUser?.id;
    const updatedAt = new Date().toISOString();
    const updated: Prime = { ...prime, status: 'VALIDEE', validatedBy, updatedAt };

    const updatedPrimes = primes.map(p => p.id === primeId ? updated : p);
    setPrimes(updatedPrimes);
    await db.primes.setItem('data', updatedPrimes);
    await queueSyncAction('UPDATE_PRIME_STATUS', { id: primeId, status: 'VALIDEE', validatedBy });

    // Immutable Audit log
    const log: PrimeAuditLog = {
      id: uuidv4(),
      primeId,
      action: 'VALIDATION',
      actorId: currentUser?.id || 'system',
      actorRole: currentUser?.role || 'Directeur',
      previousState,
      newState: updated,
      comment: comment || 'Validation de la prime par la Direction',
      createdAt: updatedAt
    };
    const updatedLogs = [log, ...primeAuditLogs];
    setPrimeAuditLogs(updatedLogs);
    await db.primeAuditLogs.setItem('data', updatedLogs);
    await queueSyncAction('INSERT_PRIME_AUDIT_LOG', log);
  };

  const rejectPrime = async (primeId: string, comment?: string) => {
    const prime = primes.find(p => p.id === primeId);
    if (!prime) return;
    const previousState = { ...prime };
    const updatedAt = new Date().toISOString();
    const updated: Prime = { ...prime, status: 'REJETEE', updatedAt };

    const updatedPrimes = primes.map(p => p.id === primeId ? updated : p);
    setPrimes(updatedPrimes);
    await db.primes.setItem('data', updatedPrimes);
    await queueSyncAction('UPDATE_PRIME_STATUS', { id: primeId, status: 'REJETEE' });

    // Immutable Audit log
    const log: PrimeAuditLog = {
      id: uuidv4(),
      primeId,
      action: 'REJET',
      actorId: currentUser?.id || 'system',
      actorRole: currentUser?.role || 'Directeur',
      previousState,
      newState: updated,
      comment: comment || 'Rejet de la prime',
      createdAt: updatedAt
    };
    const updatedLogs = [log, ...primeAuditLogs];
    setPrimeAuditLogs(updatedLogs);
    await db.primeAuditLogs.setItem('data', updatedLogs);
    await queueSyncAction('INSERT_PRIME_AUDIT_LOG', log);
  };

  const payPrime = async (primeId: string, comment?: string) => {
    const prime = primes.find(p => p.id === primeId);
    if (!prime) return;
    const previousState = { ...prime };
    const updatedAt = new Date().toISOString();
    const updated: Prime = { ...prime, status: 'PAYEE', updatedAt };

    const updatedPrimes = primes.map(p => p.id === primeId ? updated : p);
    setPrimes(updatedPrimes);
    await db.primes.setItem('data', updatedPrimes);
    await queueSyncAction('UPDATE_PRIME_STATUS', { id: primeId, status: 'PAYEE' });

    // Immutable Audit log
    const log: PrimeAuditLog = {
      id: uuidv4(),
      primeId,
      action: 'PAIEMENT',
      actorId: currentUser?.id || 'system',
      actorRole: currentUser?.role || 'Directeur',
      previousState,
      newState: updated,
      comment: comment || 'Paiement effectif de la prime',
      createdAt: updatedAt
    };
    const updatedLogs = [log, ...primeAuditLogs];
    setPrimeAuditLogs(updatedLogs);
    await db.primeAuditLogs.setItem('data', updatedLogs);
    await queueSyncAction('INSERT_PRIME_AUDIT_LOG', log);
  };

  const updateScoringRule = async (id: string, data: Partial<ScoringRule>) => {
    const updated = scoringRules.map(r => r.id === id ? { ...r, ...data } : r);
    setScoringRules(updated);
    await db.scoringRules.setItem('data', updated);
    await queueSyncAction('UPDATE_SCORING_RULE', { ...data, id });
  };

  // Transitions autorisées (garde-fou anti-statut incohérent)
  const isQuoteTransitionAllowed = (from: Quote['status'], to: Quote['status']): boolean => {
    if (from === to) return true;
    const allowed: Record<Quote['status'], Quote['status'][]> = {
      'Brouillon': ['Envoyé'],
      'Envoyé': ['Accepté', 'Refusé', 'Révision'],
      'Révision': ['Envoyé', 'Accepté', 'Refusé'],
      'Accepté': ['Révision'],
      'Refusé': ['Révision'],
    };
    return (allowed[from] || []).includes(to);
  };

  const nextQuoteNumberFor = (baseNumber: string, existing: Quote[]): string => {
    if (!existing.some(q => q.quoteNumber === baseNumber)) return baseNumber;
    const m = baseNumber.match(/^(DV-\d{4}-)(\d+)$/);
    if (m) {
      const prefix = m[1];
      let n = parseInt(m[2], 10) + 1;
      let guard = 0;
      while (existing.some(q => q.quoteNumber === `${prefix}${String(n).padStart(4, '0')}`) && guard < 10000) {
        n += 1;
        guard += 1;
      }
      return `${prefix}${String(n).padStart(4, '0')}`;
    }
    return `${baseNumber}-bis${Math.floor(1000 + Math.random() * 9000)}`;
  };

  const addQuote = async (quote: Quote) => {
    // Generate true UUIDs for DB compatibility if they used Date.now()
    const quoteId = quote.id.length > 20 ? quote.id : uuidv4();
    const safeNumber = nextQuoteNumberFor(quote.quoteNumber, quotes);
    const newQuote = {
      ...quote,
      id: quoteId,
      quoteNumber: safeNumber,
      lines: quote.lines.map(l => ({ ...l, id: l.id.length > 20 ? l.id : uuidv4() }))
    };
    
    const newQuotes = [...quotes, newQuote];
    setQuotes(newQuotes);
    await db.quotes.setItem('data', newQuotes);
    await queueSyncAction('INSERT_QUOTE', newQuote);
  };

  const updateQuote = async (id: string, quote: Quote) => {
    const newQuote = {
      ...quote,
      lines: quote.lines.map(l => ({ ...l, id: l.id.length > 20 ? l.id : uuidv4() }))
    };
    const newQuotes = quotes.map(q => q.id === id ? newQuote : q);
    setQuotes(newQuotes);
    await db.quotes.setItem('data', newQuotes);
    await queueSyncAction('UPDATE_QUOTE', newQuote);
  };

  const updateQuoteStatus = async (id: string, status: Quote['status'], clientComment?: string) => {
    const quote = quotes.find(q => q.id === id);
    if (!quote) return;
    if (!isQuoteTransitionAllowed(quote.status, status)) {
      console.warn(`[Quotes] Transition refusée : ${quote.status} -> ${status}`);
      return;
    }
    const newQuote = { ...quote, status, ...(clientComment !== undefined && { clientComment }) };
    const newQuotes = quotes.map(q => q.id === id ? newQuote : q);
    setQuotes(newQuotes);
    await db.quotes.setItem('data', newQuotes);
    await queueSyncAction('UPDATE_QUOTE', newQuote);
  };

  const deleteQuote = async (id: string) => {
    const newQuotes = quotes.filter(q => q.id !== id);
    setQuotes(newQuotes);
    await db.quotes.setItem('data', newQuotes);
    await queueSyncAction('DELETE_QUOTE', { id });
  };

  const buildCommission = (sale: Sale): Commission => {
    // 1. Coûts : somme des lignes (module Affaires retiré)
    const linesCost = (sale.lines || []).reduce((sum, l) => sum + (l.costPrice || 0) * (l.quantity || 0), 0);
    const costTotal = linesCost;

    const totalHt = sale.subtotal || 0;
    const marginAmount = Math.max(0, totalHt - costTotal);
    const marginPercent = totalHt > 0 ? Math.round((marginAmount / totalHt) * 10000) / 100 : 0;

    // 2. Commission Rate: Check service first, then global settings, fallback 10%
    const saleService = services.find(s => s.id === sale.serviceId);
    const commissionPercent = (saleService?.commissionRate !== undefined && saleService?.commissionRate !== null)
      ? saleService.commissionRate
      : (settings.commissionRate !== undefined ? settings.commissionRate : 10);

    const commissionAmount = Math.round(marginAmount * commissionPercent / 100);

    // 3. Commercial
    const clientCommercial = clients.find(c => c.id === sale.clientId)?.commercialId;
    const quoteCommercial = sale.quoteId ? quotes.find(q => q.id === sale.quoteId)?.commercialId : undefined;
    const commercialId = sale.commercialId || clientCommercial || quoteCommercial || '';

    // 4. Initial eligible amount based on payments
    const payments = facturePaiements.filter(p => p.venteId === sale.id && p.status === 'VALIDE');
    const netReceived = payments.reduce((sum, p) => p.paymentType === 'ENCAISSEMENT' ? sum + p.amount : sum - p.amount, 0);
    const totalTtc = sale.total || 1;
    const collectionRate = Math.max(0, Math.min(1, netReceived / totalTtc));
    const eligibleAmount = Math.round(commissionAmount * collectionRate);

    return {
      id: uuidv4(),
      saleId: sale.id,
      clientId: sale.clientId,
      commercialId,
      serviceId: sale.serviceId,
      totalHt,
      costTotal,
      marginAmount,
      marginPercent,
      commissionPercent,
      commissionAmount,
      paidAmount: 0,
      eligibleAmount,
      status: 'En attente',
      createdAt: new Date().toISOString()
    };
  };

  const commissionPaidAmount = (saleId: string, total: number, commissionAmount: number, instList: Installment[]): number => {
    const insts = instList.filter(i => i.saleId === saleId);
    if (total <= 0 || insts.length === 0 || commissionAmount <= 0) return 0;
    const received = Math.min(total, insts.reduce((sum, i) => sum + i.paidAmount, 0));
    return Math.min(commissionAmount, Math.round(received * (commissionAmount / total)));
  };

  const addSale = async (sale: Sale, installmentsInput?: InstallmentInput[]) => {
    const saleId = sale.id.length > 20 ? sale.id : uuidv4();
    const newSale = {
      ...sale,
      id: saleId,
      lines: sale.lines.map(l => ({ ...l, id: l.id.length > 20 ? l.id : uuidv4() }))
    };
    const newSales = [...sales, newSale];
    setSales(newSales);
    await db.sales.setItem('data', newSales);
    await queueSyncAction('INSERT_SALE', newSale);

    // Auto-create commission from sale margin
    const newCommission = buildCommission(newSale);
    await addCommission(newCommission);

    // Installments plan (default: one installment = full amount due today)
    const today = new Date();
    const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const items = installmentsInput && installmentsInput.length > 0
      ? installmentsInput
      : [{ amount: newSale.total, dueDate: todayLocal }];
    const newInstallmentObjs: Installment[] = items.map(it => ({
      id: it.id && it.id.length > 20 ? it.id : uuidv4(),
      saleId,
      amount: it.amount,
      dueDate: it.dueDate,
      paidAmount: 0,
      status: 'En attente'
    }));
    const allInstallments = [...installments, ...newInstallmentObjs];
    setInstallments(allInstallments);
    await db.installments.setItem('data', allInstallments);
    for (const inst of newInstallmentObjs) {
      await queueSyncAction('INSERT_INSTALLMENT', inst);
    }
  };

  const saveInstallmentsForSale = async (saleId: string, items: InstallmentInput[]) => {
    const existing = installments.filter(i => i.saleId === saleId);
    const keptIds = items.map(it => it.id).filter(Boolean) as string[];
    const toDelete = existing.filter(i => !keptIds.includes(i.id));

    const updated: (Installment & { wasNew?: boolean })[] = items.map(it => {
      const found = existing.find(e => e.id === it.id);
      if (found) {
        const paidAmount = Math.min(found.paidAmount, it.amount);
        return { ...found, wasNew: false, amount: it.amount, dueDate: it.dueDate, paidAmount, status: paidAmount >= it.amount ? 'Payée' as const : 'En attente' as const };
      }
      return { id: uuidv4(), saleId, wasNew: true, amount: it.amount, dueDate: it.dueDate, paidAmount: 0, status: 'En attente' as const };
    });

    const storedUpdated = updated.map(({ wasNew: _wasNew, ...clean }) => clean);
    const nextInstallments = [
      ...installments.filter(i => i.saleId !== saleId),
      ...storedUpdated,
    ];
    setInstallments(nextInstallments);
    await db.installments.setItem('data', nextInstallments);
    for (const inst of toDelete) await queueSyncAction('DELETE_INSTALLMENT', { id: inst.id });
    for (const inst of updated) {
      if (inst.wasNew) {
        await queueSyncAction('INSERT_INSTALLMENT', { id: inst.id, saleId, amount: inst.amount, dueDate: inst.dueDate, paidAmount: inst.paidAmount, status: inst.status });
      } else {
        await queueSyncAction('UPDATE_INSTALLMENT', inst);
      }
    }

    // Recompute sale status + commission paid amounts
    const sale = sales.find(s => s.id === saleId);
    if (sale) {
      const allPaid = updated.length > 0 && updated.every(i => i.status === 'Payée');
      if (sale.status === 'Enregistrée' && allPaid) {
        await updateSaleStatus(saleId, 'Payée');
      }
      const linkedCommission = commissions.find(c => c.saleId === saleId);
      if (linkedCommission) {
        const paidAmount = commissionPaidAmount(saleId, sale.total, linkedCommission.commissionAmount, nextInstallments);
        const status = paidAmount >= linkedCommission.commissionAmount && linkedCommission.status === 'Validée' ? 'Payée' : linkedCommission.status;
        if (paidAmount !== linkedCommission.paidAmount) {
          const updatedComm = { ...linkedCommission, paidAmount, status };
          const newCommissions = commissions.map(c => c.id === linkedCommission.id ? updatedComm : c);
          setCommissions(newCommissions);
          await db.commissions.setItem('data', newCommissions);
          await queueSyncAction('UPDATE_COMMISSION', { id: updatedComm.id, status: updatedComm.status, paidAmount });
        }
      }
    }
  };

  const updateSaleStatus = async (id: string, status: Sale['status']) => {
    const sale = sales.find(s => s.id === id);
    if (!sale) return;
    const newSale = { ...sale, status };
    const newSales = sales.map(s => s.id === id ? newSale : s);
    setSales(newSales);
    await db.sales.setItem('data', newSales);
    await queueSyncAction('UPDATE_SALE', newSale);
  };

  const updateSale = async (id: string, saleData: Sale) => {
    const newSales = sales.map(s => s.id === id ? saleData : s);
    setSales(newSales);
    await db.sales.setItem('data', newSales);
    await queueSyncAction('UPDATE_SALE', saleData);

    // Recompute linked commission when costs change (preserve paid progress)
    const linkedCommission = commissions.find(c => c.saleId === id);
    if (linkedCommission) {
      const rebuilt = buildCommission(saleData);
      const paidAmount = Math.min(rebuilt.commissionAmount, commissionPaidAmount(id, saleData.total, rebuilt.commissionAmount, installments));
      const updatedCommission = {
        ...rebuilt,
        id: linkedCommission.id,
        paidAmount,
        status: paidAmount >= rebuilt.commissionAmount && linkedCommission.status === 'Validée' ? 'Payée' : linkedCommission.status,
        createdAt: linkedCommission.createdAt
      };
      const newCommissions = commissions.map(c => c.id === linkedCommission.id ? updatedCommission : c);
      setCommissions(newCommissions);
      await db.commissions.setItem('data', newCommissions);
      await queueSyncAction('UPDATE_COMMISSION', updatedCommission);
    }
  };

  const deleteSale = async (id: string) => {
    const newSales = sales.filter(s => s.id !== id);
    setSales(newSales);
    await db.sales.setItem('data', newSales);
    await queueSyncAction('DELETE_SALE', { id });

    const linkedInstallments = installments.filter(i => i.saleId === id);
    if (linkedInstallments.length > 0) {
      const newInstallments = installments.filter(i => i.saleId !== id);
      setInstallments(newInstallments);
      await db.installments.setItem('data', newInstallments);
      for (const inst of linkedInstallments) await queueSyncAction('DELETE_INSTALLMENT', { id: inst.id });
    }

    const linkedCommission = commissions.find(c => c.saleId === id);
    if (linkedCommission) {
      const newCommissions = commissions.filter(c => c.id !== linkedCommission.id);
      setCommissions(newCommissions);
      await db.commissions.setItem('data', newCommissions);
      await queueSyncAction('DELETE_COMMISSION', { id: linkedCommission.id });
    }
  };

  const recordInstallmentPayment = async (installmentId: string, amount: number) => {
    const inst = installments.find(i => i.id === installmentId);
    if (!inst || inst.status === 'Payée' || amount <= 0) return;
    const receivedAmount = Math.min(amount, Math.max(0, inst.amount - inst.paidAmount));
    if (receivedAmount <= 0) return;
    const newPaid = inst.paidAmount + receivedAmount;
    const newInst: Installment = {
      ...inst,
      paidAmount: newPaid,
      status: newPaid >= inst.amount ? 'Payée' : 'En attente',
      paidAt: newPaid >= inst.amount ? new Date().toISOString() : inst.paidAt
    };
    const nextInstallments = installments.map(i => i.id === installmentId ? newInst : i);
    setInstallments(nextInstallments);
    await db.installments.setItem('data', nextInstallments);
    await queueSyncAction('UPDATE_INSTALLMENT', newInst);

    const sale = sales.find(s => s.id === inst.saleId);
    if (!sale) return;
    const saleInsts = nextInstallments.filter(i => i.saleId === sale.id);
    const allPaid = saleInsts.length > 0 && saleInsts.every(i => i.status === 'Payée');
    if (sale.status === 'Enregistrée' && allPaid) {
      await updateSaleStatus(sale.id, 'Payée');
    }

    const linkedCommission = commissions.find(c => c.saleId === sale.id);
    if (linkedCommission) {
      const paidAmount = commissionPaidAmount(sale.id, sale.total, linkedCommission.commissionAmount, nextInstallments);
      const status = paidAmount >= linkedCommission.commissionAmount && linkedCommission.status === 'Validée' ? 'Payée' : linkedCommission.status;
      if (paidAmount !== linkedCommission.paidAmount) {
        const updatedComm = { ...linkedCommission, paidAmount, status };
        const newCommissions = commissions.map(c => c.id === linkedCommission.id ? updatedComm : c);
        setCommissions(newCommissions);
        await db.commissions.setItem('data', newCommissions);
        await queueSyncAction('UPDATE_COMMISSION', { id: updatedComm.id, status: updatedComm.status, paidAmount });
      }
    }
  };

  const addCommission = async (commission: Commission) => {
    const commissionId = commission.id.length > 20 ? commission.id : uuidv4();
    const newCommission = { ...commission, id: commissionId };
    const newCommissions = [...commissions, newCommission];
    setCommissions(newCommissions);
    await db.commissions.setItem('data', newCommissions);
    await queueSyncAction('INSERT_COMMISSION', newCommission);
  };

  const updateCommissionStatus = async (id: string, status: Commission['status'], paidAmount?: number, notes?: string) => {
    const commission = commissions.find(c => c.id === id);
    if (!commission) return;
    const newPaidAmount = paidAmount !== undefined ? paidAmount : (status === 'Payée' ? commission.commissionAmount : (commission.paidAmount || 0));
    const newCommission: Commission = {
      ...commission,
      status,
      paidAmount: newPaidAmount,
      ...(notes !== undefined && { notes })
    };
    const newCommissions = commissions.map(c => c.id === id ? newCommission : c);
    setCommissions(newCommissions);
    await db.commissions.setItem('data', newCommissions);
    await queueSyncAction('UPDATE_COMMISSION', newCommission);
  };

  const deleteCommission = async (id: string) => {
    const newCommissions = commissions.filter(c => c.id !== id);
    setCommissions(newCommissions);
    await db.commissions.setItem('data', newCommissions);
    await queueSyncAction('DELETE_COMMISSION', { id });
  };

  // === COMMERCIAL MODULE ===
  const addProspect = async (prospect: Prospect) => {
    const prospectId = prospect.id.length > 20 ? prospect.id : uuidv4();
    const newProspect = { ...prospect, id: prospectId };
    const newProspects = [...prospects, newProspect];
    setProspects(newProspects);
    await db.prospects.setItem('data', newProspects);
    await queueSyncAction('INSERT_PROSPECT', newProspect);
  };

  const updateProspect = async (id: string, data: Partial<Prospect>) => {
    const newProspects = prospects.map(p => p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p);
    setProspects(newProspects);
    await db.prospects.setItem('data', newProspects);
    await queueSyncAction('UPDATE_PROSPECT', { id, ...data, updated_at: new Date().toISOString() });
  };

  const deleteProspect = async (id: string) => {
    const newProspects = prospects.filter(p => p.id !== id);
    setProspects(newProspects);
    await db.prospects.setItem('data', newProspects);
    await queueSyncAction('DELETE_PROSPECT', { id });

    const newActivities = prospectActivities.filter(a => a.prospectId !== id);
    if (newActivities.length !== prospectActivities.length) {
      setProspectActivities(newActivities);
      await db.prospectActivities.setItem('data', newActivities);
    }

    const newFollowUps = prospectFollowUps.filter(f => f.prospectId !== id);
    if (newFollowUps.length !== prospectFollowUps.length) {
      setProspectFollowUps(newFollowUps);
      await db.prospectFollowUps.setItem('data', newFollowUps);
    }
  };

  const convertProspect = async (prospectId: string): Promise<{ clientId: string }> => {
    const prospect = prospects.find(p => p.id === prospectId);
    if (!prospect) return { clientId: '' };
    const clientId = uuidv4();
    const newClient: Client = {
      id: clientId,
      name: prospect.name,
      email: prospect.email || '',
      phone: prospect.phone || '',
      contact: prospect.name,
      company: prospect.company || '',
      address: prospect.address || '',
      status: 'Actif',
      commercialId: prospect.commercialId,
      serviceId: prospect.serviceId
    };
    await addClient(newClient);
    await updateProspect(prospectId, { status: 'Converti' });

    return { clientId };
  };

  const addProspectActivity = async (activity: ProspectActivity) => {
    const activityId = activity.id.length > 20 ? activity.id : uuidv4();
    const newActivity = { ...activity, id: activityId };
    const newActivities = [...prospectActivities, newActivity];
    setProspectActivities(newActivities);
    await db.prospectActivities.setItem('data', newActivities);
    await queueSyncAction('INSERT_PROSPECT_ACTIVITY', newActivity);
  };

  const deleteProspectActivity = async (id: string) => {
    const newActivities = prospectActivities.filter(a => a.id !== id);
    setProspectActivities(newActivities);
    await db.prospectActivities.setItem('data', newActivities);
    await queueSyncAction('DELETE_PROSPECT_ACTIVITY', { id });
  };

  const addProspectFollowUp = async (followUp: ProspectFollowUp) => {
    const followUpId = followUp.id.length > 20 ? followUp.id : uuidv4();
    const newFollowUp = { ...followUp, id: followUpId };
    const newFollowUps = [...prospectFollowUps, newFollowUp];
    setProspectFollowUps(newFollowUps);
    await db.prospectFollowUps.setItem('data', newFollowUps);
    await queueSyncAction('INSERT_PROSPECT_FOLLOW_UP', newFollowUp);
  };

  const updateProspectFollowUp = async (id: string, data: Partial<ProspectFollowUp>) => {
    const newFollowUps = prospectFollowUps.map(f => f.id === id ? { ...f, ...data } : f);
    setProspectFollowUps(newFollowUps);
    await db.prospectFollowUps.setItem('data', newFollowUps);
    await queueSyncAction('UPDATE_PROSPECT_FOLLOW_UP', { id, ...data });
  };

  const deleteProspectFollowUp = async (id: string) => {
    const newFollowUps = prospectFollowUps.filter(f => f.id !== id);
    setProspectFollowUps(newFollowUps);
    await db.prospectFollowUps.setItem('data', newFollowUps);
    await queueSyncAction('DELETE_PROSPECT_FOLLOW_UP', { id });
  };

  const upsertActivityReport = async (report: ActivityReport) => {
    const reportId = isUuid(report.id) ? report.id : uuidv4();
    const existing = activityReports.find(r => r.id === reportId);
    const newReport = { ...report, id: reportId, updatedAt: new Date().toISOString() };
    const newReports = existing
      ? activityReports.map(r => r.id === reportId ? newReport : r)
      : [...activityReports, newReport];
    setActivityReports(newReports);
    await db.activityReports.setItem('data', newReports);
    await queueSyncAction(existing ? 'UPDATE_ACTIVITY_REPORT' : 'INSERT_ACTIVITY_REPORT', newReport);
  };

  const deleteActivityReport = async (id: string) => {
    const newReports = activityReports.filter(r => r.id !== id);
    setActivityReports(newReports);
    await db.activityReports.setItem('data', newReports);
    await queueSyncAction('DELETE_ACTIVITY_REPORT', { id });
  };

  const saveWeeklyReport = async (report: WeeklyReport) => {
    const reportId = isUuid(report.id) ? report.id : uuidv4();
    const existing = weeklyReports.find(r => r.id === reportId);
    const newReport = { ...report, id: reportId };
    const newReports = existing
      ? weeklyReports.map(r => r.id === reportId ? newReport : r)
      : [...weeklyReports, newReport];
    setWeeklyReports(newReports);
    await db.weeklyReports.setItem('data', newReports);
    await queueSyncAction(existing ? 'UPDATE_WEEKLY_REPORT' : 'INSERT_WEEKLY_REPORT', newReport);
  };

  const markWeeklyReportSent = async (id: string) => {
    const newReports = weeklyReports.map(r => r.id === id ? { ...r, status: 'Envoyé' as const, sentAt: new Date().toISOString() } : r);
    const target = newReports.find(r => r.id === id);
    setWeeklyReports(newReports);
    await db.weeklyReports.setItem('data', newReports);
    if (target) await queueSyncAction('UPDATE_WEEKLY_REPORT', { id, status: 'Envoyé', sent_at: target.sentAt });
  };

  const markWeeklyReportRead = async (id: string) => {
    const newReports = weeklyReports.map(r => r.id === id ? { ...r, status: 'Relu' as const } : r);
    const target = newReports.find(r => r.id === id);
    setWeeklyReports(newReports);
    await db.weeklyReports.setItem('data', newReports);
    if (target) await queueSyncAction('UPDATE_WEEKLY_REPORT', { id, status: 'Relu' });
  };

  const saveV2DailyReport = async (report: V2DailyReport) => {
    const reportId = isUuid(report.id) ? report.id : uuidv4();
    const existing = v2DailyReports.find(r => r.id === reportId);
    const newReport = { ...report, id: reportId, updatedAt: new Date().toISOString() };
    // Dédupe par clé naturelle (author, jour, projet) : résorbe les doublons
    // locaux hérités (ids Date.now() re-mintés) qui violaient l'UNIQUE serveur.
    const natKey = (r: any) => `${r.authorId || ''}::${(r.date || '').slice(0, 10)}::${r.project || 'HINOV GROUP'}`;
    const base = existing
      ? v2DailyReports.map(r => r.id === reportId ? newReport : r)
      : [...v2DailyReports, newReport];
    const newReports = base.filter(r => r.id === reportId || natKey(r) !== natKey(newReport));
    setV2DailyReports(newReports);
    await db.v2DailyReports.setItem('data', newReports);
    await queueSyncAction(existing ? 'UPDATE_V2_DAILY_REPORT' : 'INSERT_V2_DAILY_REPORT', newReport);
  };

  const saveV2WeeklyReport = async (report: V2WeeklyReport) => {
    const reportId = isUuid(report.id) ? report.id : uuidv4();
    const existing = v2WeeklyReports.find(r => r.id === reportId);
    const newReport = { ...report, id: reportId, updatedAt: new Date().toISOString() };
    // Dédupe par clé naturelle (author, semaine, projet) : cf. saveV2DailyReport.
    const natKey = (r: any) => `${r.authorId || ''}::${(r.weekStart || '').slice(0, 10)}::${r.project || 'HINOV GROUP'}`;
    const base = existing
      ? v2WeeklyReports.map(r => r.id === reportId ? newReport : r)
      : [...v2WeeklyReports, newReport];
    const newReports = base.filter(r => r.id === reportId || natKey(r) !== natKey(newReport));
    setV2WeeklyReports(newReports);
    await db.v2WeeklyReports.setItem('data', newReports);
    await queueSyncAction(existing ? 'UPDATE_V2_WEEKLY_REPORT' : 'INSERT_V2_WEEKLY_REPORT', newReport);
  };

  const submitV2WeeklyReport = async (reportOrId: V2WeeklyReport | string) => {
    // Atomique : accepte l'objet complet pour éviter la double-écriture
    // (save puis submit relisait un state pas encore à jour et perdait la soumission).
    const base: V2WeeklyReport | undefined = typeof reportOrId === 'string'
      ? v2WeeklyReports.find(r => r.id === reportOrId)
      : reportOrId;
    if (!base) return;
    const reportId = typeof reportOrId === 'string' ? reportOrId : (base.id && isUuid(base.id) ? base.id : uuidv4());
    const now = new Date().toISOString();
    const updated: V2WeeklyReport = {
      ...base,
      id: reportId,
      project: base.project || 'HINOV GROUP',
      status: 'Soumis',
      submittedAt: base.submittedAt || now,
      isLocked: true,
      updatedAt: now
    };
    const existing = v2WeeklyReports.some(r => r.id === reportId);
    // Dédupe par clé naturelle : la soumission garde UNE seule ligne locale
    // par (auteur, semaine, projet) — sinon resoumissions fantômes + 23505.
    const natKey = (r: any) => `${r.authorId || ''}::${(r.weekStart || '').slice(0, 10)}::${r.project || 'HINOV GROUP'}`;
    const mergedBase = existing
      ? v2WeeklyReports.map(r => r.id === reportId ? updated : r)
      : [...v2WeeklyReports, updated];
    const newReports = mergedBase.filter(r => r.id === reportId || natKey(r) !== natKey(updated));
    setV2WeeklyReports(newReports);
    await db.v2WeeklyReports.setItem('data', newReports);
    await queueSyncAction(existing ? 'UPDATE_V2_WEEKLY_REPORT' : 'INSERT_V2_WEEKLY_REPORT', updated);

    // Lock all daily reports of this week for the author
    const startDate = new Date(updated.weekStart + 'T00:00:00');
    const authorDailyReports = v2DailyReports.filter(d => {
      if (d.authorId !== updated.authorId) return false;
      const dDate = new Date(d.date + 'T00:00:00');
      const diffDays = Math.round((dDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 6;
    });

    if (authorDailyReports.length > 0) {
      const lockedDaily = v2DailyReports.map(d => {
        if (authorDailyReports.some(ad => ad.id === d.id)) {
          return { ...d, status: 'Soumis' as const, isLocked: true, updatedAt: now };
        }
        return d;
      });
      setV2DailyReports(lockedDaily);
      await db.v2DailyReports.setItem('data', lockedDaily);
      for (const daily of lockedDaily.filter(d => authorDailyReports.some(ad => ad.id === d.id))) {
        await queueSyncAction('UPDATE_V2_DAILY_REPORT', daily);
      }
    }

    // Seule la Direction reçoit les rapports soumis
    const author = users.find(u => u.id === updated.authorId);
    const authorName = author?.name || 'Un collaborateur';
    const authorService = services.find(s => s.id === author?.serviceId)?.name || '';
    const serviceSuffix = authorService ? ` (${authorService})` : '';
    const directionUsers = users.filter(u =>
      ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(u.role) && isUuid(u.id)
    );
    if (directionUsers.length > 0) {
      const newNotifs: AppNotification[] = directionUsers.map(d => ({
        id: uuidv4(),
        user_id: d.id,
        title: 'Nouveau rapport d\'activité reçu',
        message: `${authorName}${serviceSuffix} a soumis son rapport d'activité pour la semaine du ${new Date(updated.weekStart + 'T00:00:00').toLocaleDateString('fr-FR')}.`,
        type: 'info',
        is_read: false,
        link: `/crm/rapports-equipe?week=${updated.weekStart}`,
        created_at: now
      }));
      const updatedNotifs = [...notifications, ...newNotifs];
      setNotifications(updatedNotifs);
      await db.notifications.setItem('data', updatedNotifs);
      for (const notif of newNotifs) {
        await queueSyncAction('INSERT_NOTIFICATION', notif);
      }

      // Déclencher une notification bureau / système pour la Direction connectée
      if (currentUser && ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser.role)) {
        try {
          await platform.notifications.showNotification(
            'Nouveau rapport d\'activité reçu',
            `${authorName}${serviceSuffix} a soumis son rapport hebdomadaire.`
          );
        } catch (e) {
          console.warn('Erreur notification desktop:', e);
        }
      }
    }
  };

  const sendWeeklyReportReminder = async (userIds: string[], weekStart: string) => {
    const validIds = (userIds || []).filter(uid => isUuid(uid));
    if (validIds.length === 0) return;
    const now = new Date().toISOString();
    const weekDateStr = new Date(weekStart + 'T00:00:00').toLocaleDateString('fr-FR');
    const newNotifs: AppNotification[] = validIds.map(uid => ({
      id: uuidv4(),
      user_id: uid,
      title: 'Rappel Direction : Rapport Hebdo en attente',
      message: `La Direction vous invite à compléter et soumettre votre rapport d'activité pour la semaine du ${weekDateStr}.`,
      type: 'warning',
      is_read: false,
      link: `/crm/rapports?week=${weekStart}&tab=report`,
      created_at: now
    }));
    const updatedNotifs = [...notifications, ...newNotifs];
    setNotifications(updatedNotifs);
    await db.notifications.setItem('data', updatedNotifs);
    for (const notif of newNotifs) {
      await queueSyncAction('INSERT_NOTIFICATION', notif);
    }
  };

  const reviewV2WeeklyReport = async (id: string, comment?: string, status: 'Validé' | 'Relu' = 'Validé') => {
    const report = v2WeeklyReports.find(r => r.id === id);
    if (!report) return;
    const now = new Date().toISOString();
    const updated: V2WeeklyReport = {
      ...report,
      status,
      directorComment: comment !== undefined ? comment : report.directorComment,
      reviewedAt: now,
      reviewedBy: currentUser?.id,
      updatedAt: now
    };
    const newReports = v2WeeklyReports.map(r => r.id === id ? updated : r);
    setV2WeeklyReports(newReports);
    await db.v2WeeklyReports.setItem('data', newReports);
    await queueSyncAction('UPDATE_V2_WEEKLY_REPORT', updated);

    // Notify the author (lien valide vers le module existant + synchro cloud)
    // user_id est FK vers profiles(id) : seuls les UUID sont synchronisables.
    if (report.authorId && isUuid(report.authorId) && report.authorId !== currentUser?.id) {
      const authorNotif: AppNotification = {
        id: uuidv4(),
        user_id: report.authorId,
        title: `Rapport hebdomadaire ${status === 'Validé' ? 'validé' : 'relu'}`,
        message: `Votre rapport pour la semaine du ${new Date(report.weekStart + 'T00:00:00').toLocaleDateString('fr-FR')} a été ${status === 'Validé' ? 'validé par la Direction' : 'relu'}.`,
        type: 'success',
        is_read: false,
        link: `/crm/rapports?week=${report.weekStart}&tab=history`,
        created_at: now
      };
      const updatedNotifs = [...notifications, authorNotif];
      setNotifications(updatedNotifs);
      await db.notifications.setItem('data', updatedNotifs);
      await queueSyncAction('INSERT_NOTIFICATION', authorNotif);
    }
  };

  const deleteV2WeeklyReport = async (id: string) => {
    const newReports = v2WeeklyReports.filter(r => r.id !== id);
    setV2WeeklyReports(newReports);
    await db.v2WeeklyReports.setItem('data', newReports);
    await queueSyncAction('DELETE_V2_WEEKLY_REPORT', { id });
  };

  const deleteV2DailyReport = async (id: string) => {
    const newReports = v2DailyReports.filter(r => r.id !== id);
    setV2DailyReports(newReports);
    await db.v2DailyReports.setItem('data', newReports);
    await queueSyncAction('DELETE_V2_DAILY_REPORT', { id });
  };

  const addCategory = async (category: Category) => {
    const categoryId = category.id.length > 20 ? category.id : uuidv4();
    const newCategory = { ...category, id: categoryId };
    const newCategories = [...categories, newCategory];
    setCategories(newCategories);
    await db.categories.setItem('data', newCategories);
    await queueSyncAction('INSERT_CATEGORY', newCategory);
  };

  const deleteCategory = async (id: string) => {
    const newCategories = categories.filter(c => c.id !== id);
    setCategories(newCategories);
    await db.categories.setItem('data', newCategories);
    await queueSyncAction('DELETE_CATEGORY', { id });
  };

  const updateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await db.settings.setItem('data', newSettings);
    await queueSyncAction('UPDATE_SETTINGS', newSettings);
  };

  const addPrestation = async (prestation: Prestation) => {
    const newPrestations = [...prestations, { ...prestation, id: prestation.id.length > 20 ? prestation.id : uuidv4() }];
    setPrestations(newPrestations);
    await db.prestations.setItem('data', newPrestations);
    await queueSyncAction('INSERT_PRESTATION', newPrestations[newPrestations.length - 1]);
  };

  const updatePrestation = async (id: string, data: Partial<Prestation>) => {
    const newPrestations = prestations.map(p => p.id === id ? { ...p, ...data } : p);
    setPrestations(newPrestations);
    await db.prestations.setItem('data', newPrestations);
    await queueSyncAction('UPDATE_PRESTATION', { id, ...data });
  };

  const deletePrestation = async (id: string) => {
    const newPrestations = prestations.filter(p => p.id !== id);
    setPrestations(newPrestations);
    await db.prestations.setItem('data', newPrestations);
    await queueSyncAction('DELETE_PRESTATION', { id });
  };

  const addService = async (service: Service) => {
    const serviceId = service.id && service.id.length > 20 ? service.id : uuidv4();
    const cleanService = { ...service, id: serviceId, name: service.name.trim() };
    const newServices = [...services.filter(s => s.id !== cleanService.id), cleanService];
    setServices(newServices);
    await db.services.setItem('data', newServices);
    await queueSyncAction('INSERT_SERVICE', cleanService);
  };

  const updateService = async (id: string, service: Partial<Service>) => {
    const updatedName = service.name !== undefined ? service.name.trim() : undefined;
    const newServices = services.map(s => s.id === id ? { ...s, ...service, ...(updatedName ? { name: updatedName } : {}) } : s);
    setServices(newServices);
    await db.services.setItem('data', newServices);
    await queueSyncAction('UPDATE_SERVICE', { id, name: updatedName, description: service.description, members: service.members, commissionRate: service.commissionRate });
  };

  const deleteService = async (id: string) => {
    const newServices = services.filter(s => s.id !== id);
    setServices(newServices);
    await db.services.setItem('data', newServices);
    await queueSyncAction('DELETE_SERVICE', { id });
  };

  // === POS CRUD ===
  const addPosCategory = async (cat: PosCategory) => {
    const newCat = { ...cat, id: cat.id || uuidv4() };
    setPosCategories(prev => {
      const next = [...prev, newCat];
      void db.posCategories.setItem('data', next);
      return next;
    });
    await queueSyncAction('INSERT_POS_CATEGORY', newCat);
  };
  const updatePosCategory = async (id: string, data: Partial<PosCategory>) => {
    setPosCategories(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...data } : c);
      void db.posCategories.setItem('data', next);
      return next;
    });
    await queueSyncAction('UPDATE_POS_CATEGORY', { id, ...data });
  };
  const deletePosCategory = async (id: string): Promise<boolean> => {
    // Intégrité : catégorie utilisée par des produits = suppression interdite
    if (posProducts.some(p => p.categoryId === id)) return false;
    setPosCategories(prev => {
      const next = prev.filter(c => c.id !== id);
      void db.posCategories.setItem('data', next);
      return next;
    });
    await queueSyncAction('DELETE_POS_CATEGORY', { id });
    return true;
  };

  const addPosBrand = async (brand: PosBrand) => {
    const newBrand = { ...brand, id: brand.id || uuidv4() };
    setPosBrands(prev => {
      const next = [...prev, newBrand];
      void db.posBrands.setItem('data', next);
      return next;
    });
    await queueSyncAction('INSERT_POS_BRAND', newBrand);
  };
  const updatePosBrand = async (id: string, data: Partial<PosBrand>) => {
    setPosBrands(prev => {
      const next = prev.map(b => b.id === id ? { ...b, ...data } : b);
      void db.posBrands.setItem('data', next);
      return next;
    });
    await queueSyncAction('UPDATE_POS_BRAND', { id, ...data });
  };
  const deletePosBrand = async (id: string): Promise<boolean> => {
    if (posProducts.some(p => p.brandId === id)) return false;
    setPosBrands(prev => {
      const next = prev.filter(b => b.id !== id);
      void db.posBrands.setItem('data', next);
      return next;
    });
    await queueSyncAction('DELETE_POS_BRAND', { id });
    return true;
  };

  const addPosSupplier = async (supplier: PosSupplier) => {
    const newSupplier = { ...supplier, id: supplier.id || uuidv4() };
    setPosSuppliers(prev => {
      const next = [...prev, newSupplier];
      void db.posSuppliers.setItem('data', next);
      return next;
    });
    await queueSyncAction('INSERT_POS_SUPPLIER', newSupplier);
  };
  const updatePosSupplier = async (id: string, data: Partial<PosSupplier>) => {
    setPosSuppliers(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...data } : s);
      void db.posSuppliers.setItem('data', next);
      return next;
    });
    await queueSyncAction('UPDATE_POS_SUPPLIER', { id, ...data });
  };
  const deletePosSupplier = async (id: string): Promise<boolean> => {
    if (posProducts.some(p => p.supplierId === id) || posStockEntries.some(e => e.supplierId === id)) return false;
    setPosSuppliers(prev => {
      const next = prev.filter(s => s.id !== id);
      void db.posSuppliers.setItem('data', next);
      return next;
    });
    await queueSyncAction('DELETE_POS_SUPPLIER', { id });
    return true;
  };

  const addPosProduct = async (product: PosProduct) => {
    const safeProduct = { ...product };
    if (safeProduct.quantity !== undefined) {
      safeProduct.quantity = Math.max(0, safeProduct.quantity);
    }
    const newProduct = { ...safeProduct, id: safeProduct.id || uuidv4() };
    setPosProducts(prev => {
      const next = [...prev, newProduct];
      void db.posProducts.setItem('data', next);
      return next;
    });
    await queueSyncAction('INSERT_POS_PRODUCT', newProduct);
  };
  const updatePosProduct = async (id: string, data: Partial<PosProduct>) => {
    if (data.quantity !== undefined) {
      data.quantity = Math.max(0, data.quantity);
    }
    const oldProduct = posProducts.find(p => p.id === id);
    if (oldProduct && data.quantity !== undefined && data.quantity !== oldProduct.quantity && oldProduct.family !== 'Service') {
      try {
        await addPosStockMovement({
          productId: id,
          type: 'Ajustement Manuel',
          quantity: data.quantity - oldProduct.quantity,
          createdBy: currentUser?.name,
          notes: 'Modification manuelle'
        });
      } catch (err) {
        console.warn('Ajustement de stock ignoré pour ce produit :', err);
      }
    }
    setPosProducts(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...data } : p);
      void db.posProducts.setItem('data', next);
      return next;
    });
    const mergedProd = oldProduct ? { ...oldProduct, ...data, id } : { id, ...data };
    await queueSyncAction('UPDATE_POS_PRODUCT', mergedProd);
  };
  // Fusion de doublons catalogue : tout l'historique du perdant (lignes de vente,
  // entrées, inventaires, retours, mouvements, complétions) est repointé vers le
  // gardien, les stocks sont cumulés, puis le perdant est supprimé (vide d'historique).
  // En ligne uniquement (écritures directes serveur + refresh).
  const mergePosProducts = async (loserId: string, keeperId: string): Promise<{ movedLines: number; message: string }> => {
    if (!loserId || !keeperId || loserId === keeperId) {
      throw new Error('Sélection invalide.');
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Connexion requise pour fusionner.');
    }
    const loser = posProducts.find(p => p.id === loserId);
    const keeper = posProducts.find(p => p.id === keeperId);
    if (!loser || !keeper) {
      throw new Error('Produit introuvable.');
    }
    const { supabase: sb } = await import('../lib/supabase');
    let movedLines = 0;
    const repoints: { table: string }[] = [
      { table: 'pos_transaction_lines' },
      { table: 'pos_stock_entry_lines' },
      { table: 'pos_inventory_lines' },
      { table: 'pos_return_lines' },
      { table: 'pos_stock_movements' },
      { table: 'product_completions' },
    ];
    for (const { table } of repoints) {
      const { error, count } = await sb
        .from(table)
        .update({ product_id: keeperId }, { count: 'exact' } as any)
        .eq('product_id', loserId);
      if (error) {
        throw new Error(`Repointage ${table} impossible : ${error.message}`);
      }
      movedLines += count || 0;
    }
    // Cumul des stocks sur le gardien
    const newQty = Math.max(0, Number(keeper.quantity || 0) + Number(loser.quantity || 0));
    const { error: qtyErr } = await sb.from('pos_products').update({ quantity: newQty }).eq('id', keeperId);
    if (qtyErr) {
      throw new Error(`Cumul du stock impossible : ${qtyErr.message}`);
    }
    // Suppression de la coquille (sans historique désormais)
    const { error: delErr } = await sb.from('pos_products').delete().eq('id', loserId);
    if (delErr) {
      throw new Error(`Suppression du doublon impossible : ${delErr.message}`);
    }
    setPosProducts(prev => {
      const next = prev.filter(p => p.id !== loserId).map(p => (p.id === keeperId ? { ...p, quantity: newQty } : p));
      void db.posProducts.setItem('data', next);
      return next;
    });
    await queueSyncAction('UPDATE_POS_PRODUCT', { id: keeperId, quantity: newQty });
    await refreshData();
    return {
      movedLines,
      message: `« ${loser.name} » fusionné dans « ${keeper.name} » : ${movedLines} ligne(s) repointée(s), stock cumulé à ${newQty}.`,
    };
  };
  // Réparation du catalogue fantôme local : les doublons locaux (même référence
  // ou même code-barres qu'un produit serveur, UUID différent) sont remappés vers
  // le gardien serveur partout (données locales + file d'attente), puis retirés.
  // En ligne uniquement. Les ventes à 0 ligne historiques restent à reconstituer.
  const repairLocalCatalog = async (): Promise<{ remapped: number; dropped: number; rewrittenActions: number; message: string }> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Connexion requise pour réparer le catalogue.');
    }
    const { supabase: sb } = await import('../lib/supabase');
    const { data: serverProducts, error } = await sb.from('pos_products').select('id, reference, barcode');
    if (error || !serverProducts) {
      throw new Error('Catalogue serveur injoignable : ' + (error?.message || 'réseau'));
    }
    const norm = (s?: string | null) => (s || '').trim().toLowerCase();
    const byRef = new Map<string, string>();
    const byBarcode = new Map<string, string>();
    for (const p of serverProducts as any[]) {
      const r = norm(p.reference);
      if (r && !byRef.has(r)) byRef.set(r, p.id);
      const b = norm(p.barcode);
      if (b && !byBarcode.has(b)) byBarcode.set(b, p.id);
    }
    const local: PosProduct[] = (await safeGet<PosProduct[]>(db.posProducts)) || posProducts;
    const remap: Record<string, string> = {};
    for (const p of local) {
      const r = norm((p as any).reference);
      const keeperByRef = r ? byRef.get(r) : undefined;
      if (keeperByRef && keeperByRef !== p.id) {
        remap[p.id] = keeperByRef;
        continue;
      }
      const b = norm((p as any).barcode);
      const keeperByBc = b ? byBarcode.get(b) : undefined;
      if (keeperByBc && keeperByBc !== p.id) {
        remap[p.id] = keeperByBc;
      }
    }
    const shadowIds = new Set(Object.keys(remap));
    if (shadowIds.size === 0) {
      return { remapped: 0, dropped: 0, rewrittenActions: 0, message: 'Aucun doublon local détecté.' };
    }
    // Persister la table AVANT de réécrire (les passe suivantes s'en servent).
    setProductRemap({ ...getProductRemap(), ...remap });

    const rewriteLines = (lines: any[]) =>
      (lines || []).map((l: any) => {
        const pid = l?.productId ?? l?.product_id;
        if (typeof pid === 'string' && remap[pid]) {
          const out = { ...l };
          if ('productId' in out) out.productId = remap[pid];
          if ('product_id' in out) out.product_id = remap[pid];
          return out;
        }
        return l;
      });

    // 1. Données locales
    const nextTxs = (await safeGet<PosTransaction[]>(db.posTransactions)) || posTransactions;
    const fixedTxs = nextTxs.map(t => ({ ...t, lines: rewriteLines(t.lines || []) }));
    setPosTransactions(fixedTxs);
    await safeSet(db.posTransactions, fixedTxs);

    const nextEntries = (await safeGet<PosStockEntry[]>(db.posStockEntries)) || posStockEntries;
    const fixedEntries = nextEntries.map(e => ({ ...e, lines: rewriteLines((e as any).lines || []) }));
    setPosStockEntries(fixedEntries);
    await safeSet(db.posStockEntries, fixedEntries);

    const nextInvs = (await safeGet<PosInventory[]>(db.posInventories)) || posInventories;
    const fixedInvs = nextInvs.map(i => ({ ...i, lines: rewriteLines((i as any).lines || []) }));
    setPosInventories(fixedInvs);
    await safeSet(db.posInventories, fixedInvs);

    const nextReturns = (await safeGet<PosReturn[]>(db.posReturns)) || posReturns;
    const fixedReturns = nextReturns.map(r => ({
      ...r,
      lines: rewriteLines(r.lines || []),
      exchangeLines: rewriteLines((r as any).exchangeLines || []),
    }));
    setPosReturns(fixedReturns);
    await safeSet(db.posReturns, fixedReturns);

    const nextMovs = (await safeGet<PosStockMovement[]>(db.posStockMovements)) || posStockMovements;
    const fixedMovs = nextMovs.map(m => (m.productId && remap[m.productId] ? { ...m, productId: remap[m.productId] } : m));
    setPosStockMovements(fixedMovs);
    await safeSet(db.posStockMovements, fixedMovs);

    const nextProducts = local.filter(p => !shadowIds.has(p.id));
    setPosProducts(nextProducts);
    await safeSet(db.posProducts, nextProducts);

    // 2. File d'attente : réécriture vers les gardiens, abandon des upserts fantômes
    let rewrittenActions = 0;
    let droppedActions = 0;
    try {
      const queue = (await db.syncQueue.getItem<any[]>('queue').catch(() => null)) || [];
      const nextQueue: any[] = [];
      for (const a of queue) {
        if (!a?.type) continue;
        const r = applyProductRemapToAction(a.type, a.payload);
        if (r.drop) {
          droppedActions++;
          continue;
        }
        if (r.payload !== a.payload) rewrittenActions++;
        nextQueue.push({ ...a, payload: r.payload });
      }
      await db.syncQueue.setItem('queue', nextQueue);
    } catch { /* file conservée telle quelle en cas d'échec */ }

    await refreshData();
    return {
      remapped: shadowIds.size,
      dropped: droppedActions,
      rewrittenActions,
      message: `${shadowIds.size} doublon(s) remappé(s) vers le serveur, ${rewrittenActions} action(s) réécrite(s), ${droppedActions} action(s) fantôme(s) abandonnée(s).`,
    };
  };
  const deletePosProduct = async (id: string): Promise<boolean> => {
    // Intégrité (B6) : produit avec historique (ventes, mouvements, entrées, inventaires, retours)
    // = suppression interdite (le serveur le refuserait par FK de toute façon).
    // F6 : le contrôle local ne voit pas l'historique des autres postes pas encore
    // synchronisé → vérification serveur avant suppression définitive.
    const usedLocally =
      posTransactions.some(t => (t.lines || []).some(l => l.productId === id)) ||
      posStockMovements.some(m => m.productId === id) ||
      posStockEntries.some(e => (e.lines || []).some(l => l.productId === id)) ||
      posInventories.some(i => (i.lines || []).some(l => l.productId === id)) ||
      posReturns.some(r => (r.lines || []).some(l => l.productId === id) || (r.exchangeLines || []).some(l => l.productId === id));
    if (usedLocally) return false;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const { supabase: sb } = await import('../lib/supabase');
        const checks = [
          sb.from('pos_transaction_lines').select('id').eq('product_id', id).limit(1),
          sb.from('pos_stock_movements').select('id').eq('product_id', id).limit(1),
          sb.from('pos_stock_entry_lines').select('id').eq('product_id', id).limit(1),
          sb.from('pos_inventory_lines').select('id').eq('product_id', id).limit(1),
          sb.from('pos_return_lines').select('id').eq('product_id', id).limit(1),
        ];
        const results = await Promise.all(checks.map(q => q.maybeSingle()));
        if (results.some(r => (r as any)?.data)) return false;
      }
    } catch { /* hors-ligne : le contrôle local + la FK serveur tranchent */ }
    setPosProducts(prev => {
      const next = prev.filter(p => p.id !== id);
      void db.posProducts.setItem('data', next);
      return next;
    });
    await queueSyncAction('DELETE_POS_PRODUCT', { id });
    return true;
  };

  // === Catalogue central : mêmes produits que le POS ===
  const normalizeCode = (s?: string | null) => (s || '').trim();
  const findProductByBarcode = (barcode: string) => {
    const needle = normalizeCode(barcode).toLowerCase();
    if (!needle) return undefined;
    return posProducts.find(p => !!p.barcode && normalizeCode(p.barcode).toLowerCase() === needle);
  };

  const findProductByReference = (reference: string) => {
    const needle = normalizeCode(reference).toLowerCase();
    if (!needle) return undefined;
    return posProducts.find(p => normalizeCode(p.reference).toLowerCase() === needle);
  };

  const searchProducts = (query: string) => {
    const q = (query || '').toLowerCase();
    if (!q) return posProducts;
    return posProducts.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.reference || '').toLowerCase().includes(q) ||
      (p.barcode || '').includes(q) ||
      (p.isbn || '').includes(q)
    );
  };

  const getIncompleteProducts = () =>
    posProducts.filter(p => !isProductComplete(p));

  const updateProductBarcode = async (id: string, barcode: string | null) => {
    await updatePosProduct(id, { barcode: barcode || undefined });
  };

  const updateProductImage = async (id: string, imageUrl: string | null) => {
    await updatePosProduct(id, { imageUrl: imageUrl || undefined });
  };

  const importProducts = async (products: PosProduct[], duplicates: 'ignore' | 'update' | 'create' = 'update') => {
    productService.setProducts(posProducts);
    const persistence: ProductPersistence = {
      create: async (product) => { await addPosProduct(product); },
      update: async (id, data) => { await updatePosProduct(id, data); },
      remove: async (id) => { await deletePosProduct(id); },
    };
    const entries = products.map(p => ({
      name: p.name,
      reference: p.reference,
      barcode: p.barcode || undefined,
      isbn: p.isbn || undefined,
      family: p.family,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      quantity: p.quantity,
      categoryId: p.categoryId || undefined,
      brandId: p.brandId || undefined,
      supplierId: p.supplierId || undefined,
      imageUrl: p.imageUrl || undefined,
      minStock: p.minStock,
    }));
    const result = await productService.importProducts(entries, persistence, () => duplicates);
    productService.setProducts(posProducts);
    return result;
  };

  const addPosStockEntry = async (entry: PosStockEntry) => {
    const newEntry = { ...entry, id: entry.id || uuidv4(), lines: entry.lines.map(l => ({ ...l, id: l.id || uuidv4() })) };
    setPosStockEntries(prev => {
      const next = [...prev, newEntry];
      void db.posStockEntries.setItem('data', next);
      return next;
    });
    await queueSyncAction('INSERT_POS_STOCK_ENTRY', newEntry);

    if (newEntry.status === 'Validé') {
      await adjustProductStock(newEntry.lines.map(l => ({ productId: l.productId, quantity: l.quantity })), true, { type: 'Approvisionnement', reference: newEntry.reference, createdBy: newEntry.createdBy });
    }
  };

  const updatePosStockEntry = async (id: string, data: Partial<PosStockEntry>) => {
    const oldEntry = posStockEntries.find(e => e.id === id);
    setPosStockEntries(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...data } : e);
      void db.posStockEntries.setItem('data', next);
      return next;
    });
    await queueSyncAction('UPDATE_POS_STOCK_ENTRY', { id, ...data });

    if (oldEntry && oldEntry.status !== 'Validé' && data.status === 'Validé') {
      const entryLines = data.lines || oldEntry.lines;
      await adjustProductStock(entryLines.map(l => ({ productId: l.productId, quantity: l.quantity })), true, { type: 'Approvisionnement', reference: oldEntry.reference, createdBy: currentUser?.name });
    } else if (oldEntry && oldEntry.status === 'Validé' && data.status === 'Annulé') {
      const entryLines = data.lines || oldEntry.lines;
      await adjustProductStock(entryLines.map(l => ({ productId: l.productId, quantity: -l.quantity })), true, { type: 'Approvisionnement', reference: oldEntry.reference, createdBy: currentUser?.name, notes: 'Annulation' });
    }
  };
  const deletePosStockEntry = async (id: string) => {
    const target = posStockEntries.find(e => e.id === id);
    // Compensation (B6) : une entrée Validée avait gonflé le stock → contre-passer avant suppression
    if (target && target.status === 'Validé') {
      await adjustProductStock(target.lines.map(l => ({ productId: l.productId, quantity: -l.quantity })), true, { type: 'Approvisionnement', reference: target.reference, createdBy: currentUser?.name, notes: 'Suppression entrée' });
    }
    setPosStockEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      void db.posStockEntries.setItem('data', next);
      return next;
    });
    await queueSyncAction('DELETE_POS_STOCK_ENTRY', { id });
  };

  const addPosInventory = async (inventory: PosInventory) => {
    const newInv = { ...inventory, id: inventory.id || uuidv4(), lines: inventory.lines.map(l => ({ ...l, id: l.id || uuidv4() })) };
    setPosInventories(prev => {
      const next = [...prev, newInv];
      void db.posInventories.setItem('data', next);
      return next;
    });
    await queueSyncAction('INSERT_POS_INVENTORY', newInv);

    if (newInv.status === 'Terminé') {
      await adjustProductStock(newInv.lines.map(l => ({ productId: l.productId, quantity: l.difference })), true, { type: 'Inventaire', reference: newInv.reference, createdBy: newInv.createdBy });
    }
  };

  const updatePosInventory = async (id: string, data: Partial<PosInventory>) => {
    const oldInv = posInventories.find(i => i.id === id);
    setPosInventories(prev => {
      const next = prev.map(i => i.id === id ? { ...i, ...data } : i);
      void db.posInventories.setItem('data', next);
      return next;
    });
    await queueSyncAction('UPDATE_POS_INVENTORY', { id, ...data });

    if (oldInv && oldInv.status !== 'Terminé' && data.status === 'Terminé') {
      const invLines = data.lines || oldInv.lines;
      await adjustProductStock(invLines.map(l => ({ productId: l.productId, quantity: l.difference })), true, { type: 'Inventaire', reference: oldInv.reference, createdBy: currentUser?.name });
    }
  };
  const deletePosInventory = async (id: string) => {
    const target = posInventories.find(i => i.id === id);
    // Compensation (B6) : un inventaire Terminé avait ajusté le stock → contre-passer avant suppression
    if (target && target.status === 'Terminé') {
      await adjustProductStock(target.lines.map(l => ({ productId: l.productId, quantity: -l.difference })), true, { type: 'Inventaire', reference: target.reference, createdBy: currentUser?.name, notes: 'Suppression inventaire' });
    }
    setPosInventories(prev => {
      const next = prev.filter(i => i.id !== id);
      void db.posInventories.setItem('data', next);
      return next;
    });
    await queueSyncAction('DELETE_POS_INVENTORY', { id });
  };

  const addPosCashSession = async (session: PosCashSession) => {
    // Unicité : une seule session ouverte par caissier et par jour (M1).
    // Le test se fait sur l'état le plus frais (lecture locale synchrone) pour limiter les doubles ouvertures.
    if (session.status === 'Ouverte') {
      const day = toLocalDayKey(session.openedAt);
      const clash = posCashSessions.some(s =>
        s.status === 'Ouverte'
        && toLocalDayKey(s.openedAt) === day
        && (!s.cashierId || !session.cashierId || s.cashierId === session.cashierId)
      );
      if (clash) {
        alert('Une session de caisse est déjà ouverte pour ce caissier aujourd\u2019hui. Fermez-la avant d\u2019en ouvrir une nouvelle.');
        return;
      }
    }
    const newSession = { ...session, id: session.id || uuidv4() };
    const nextSessions = [...posCashSessions, newSession];
    setPosCashSessions(nextSessions);
    await safeSet(db.posCashSessions, nextSessions);
    await queueSyncAction('INSERT_POS_CASH_SESSION', newSession);
  };
  const updatePosCashSession = async (id: string, data: Partial<PosCashSession>) => {
    const current = posCashSessions.find(s => s.id === id);
    if (!current) return;
    // Immuabilité : une session clôturée ne peut pas être réécrite (anti-rejeu de clôture, M1)
    if (current.status === 'Fermée') return;
    const nextSessions = posCashSessions.map(s => s.id === id ? { ...s, ...data } : s);
    setPosCashSessions(nextSessions);
    await safeSet(db.posCashSessions, nextSessions);
    await queueSyncAction('UPDATE_POS_CASH_SESSION', { id, ...data });
  };

  const addPosStockMovement = async (movement: Omit<PosStockMovement, 'id' | 'date'>) => {
    const rawPid = movement.productId;
    if (!rawPid || rawPid.startsWith('srv-') || rawPid === '00000000-0000-0000-0000-000000000000' || movement.reference?.startsWith('SRV-')) {
      return; // Ne jamais créer de mouvement de stock pour les services retirés
    }
    const resolvedPid = resolveProductUuid(rawPid, movement.reference);
    if (!isUuid(resolvedPid)) {
      return;
    }
    const newMovement: PosStockMovement = {
      ...movement,
      productId: resolvedPid,
      id: uuidv4(),
      date: new Date().toISOString()
    };
    setPosStockMovements(prev => {
      const next = [...prev, newMovement];
      void db.posStockMovements.setItem('data', next);
      return next;
    });
    await queueSyncAction('INSERT_POS_STOCK_MOVEMENT', newMovement);
  };

  // Applique des variations de stock (delta +/- par produit) sur l'état local et le cache.
  // Cumule correctement les lignes d'un même produit (pas de relecture d'un état stale).
  // Si pushSync est vrai, synchronise aussi le stock serveur via UPDATE_POS_PRODUCT.
  // Si movementParams est fourni, génère un mouvement de stock pour chaque delta.
  // C1 : les ajustements sont sérialisés (chaîne) et calculés sur l'état frais
  // relu en IndexedDB — plus de quantité absolue poussée depuis une closure périmée
  // en cas d'appels en rafale (vente + entrée simultanées).
  const stockAdjustChainRef = useRef<Promise<void>>(Promise.resolve());
  const adjustProductStock = (
    deltas: { productId?: string; quantity: number }[],
    pushSync: boolean,
    movementParams?: { type: PosStockMovement['type']; reference?: string; createdBy?: string; notes?: string }
  ) => {
    const task = async () => {
    const map = new Map<string, number>();
    for (const d of deltas) {
      if (!d.productId || d.productId.startsWith('srv-') || d.productId === '00000000-0000-0000-0000-000000000000') continue;
      const product = posProducts.find(p => p.id === d.productId);
      if (product && (product.family === 'Service' || (product.reference && product.reference.startsWith('SRV-')))) continue; // Les services (photocopies, scans...) ne sont pas stockés
      const resolvedPid = resolveProductUuid(d.productId, product?.reference);
      if (!isUuid(resolvedPid)) continue;
      map.set(resolvedPid, (map.get(resolvedPid) || 0) + d.quantity);
    }
    if (map.size === 0) return;

    if (movementParams) {
      for (const [pid, delta] of map) {
        await addPosStockMovement({
          productId: pid,
          type: movementParams.type,
          quantity: delta,
          reference: movementParams.reference,
          createdBy: movementParams.createdBy,
          notes: movementParams.notes
        });
      }
    }

    // Base fraîche : ce que la tâche précédente de la chaîne a persisté.
    let base: PosProduct[] = posProducts;
    try {
      const stored = await db.posProducts.getItem<PosProduct[]>('data').catch(() => null);
      if (stored && stored.length > 0) base = stored;
    } catch {}
    const next = base.map(p => {
      const delta = map.get(p.id);
      if (delta !== undefined) {
        const raw = p.quantity + delta;
        // F10 : le plancher 0 est conservé mais l'écrêtement est journalisé
        // (écart réel visible au lieu d'être perdu silencieusement).
        if (raw < 0) {
          console.warn('[Stock] Écrêtement à 0 (stock insuffisant) :', p.reference || p.name, `stock=${p.quantity} delta=${delta}`);
        }
        return { ...p, quantity: Math.max(0, raw) };
      }
      return p;
    });
    const nextQty = new Map(next.filter(p => map.has(p.id)).map(p => [p.id, p.quantity] as [string, number]));
    setPosProducts(next);
    await safeSet(db.posProducts, next);

    if (pushSync) {
      for (const [pid] of map) {
        const newQty = nextQty.get(pid);
        if (newQty !== undefined) {
          await queueSyncAction('UPDATE_POS_PRODUCT', { id: pid, quantity: newQty });
        }
      }
    }
    };
    const run = stockAdjustChainRef.current.then(task, task);
    stockAdjustChainRef.current = run.catch(() => {});
    return run;
  };

  // Recalcule le statut d'une transaction selon ses retours actifs (non annulés).
  // Retournée uniquement si toutes les quantités ont été retournées, sinon Validée.
  const recomputeTransactionStatus = async (transactionId: string) => {
    const tx = posTransactions.find(t => t.id === transactionId);
    if (!tx || tx.status === 'Annulée') return;
    const activeReturns = posReturns.filter(r => r.transactionId === transactionId && r.status !== 'Annulé');
    if (activeReturns.length === 0) {
      if (tx.status !== 'Validée') await updatePosTransaction(transactionId, { status: 'Validée' });
      return;
    }
    const returnedQty = new Map<string, number>();
    for (const r of activeReturns) {
      for (const line of r.lines) {
        if (line.productId) {
          returnedQty.set(line.productId, (returnedQty.get(line.productId) || 0) + line.quantity);
        }
      }
    }
    const fullyReturned = tx.lines.every(l => {
      if (!l.productId) return true;
      return (returnedQty.get(l.productId) || 0) >= l.quantity;
    });
    const newStatus: PosTransaction['status'] = fullyReturned ? 'Retournée' : 'Validée';
    if (tx.status !== newStatus) await updatePosTransaction(transactionId, { status: newStatus });
  };

  const addPosTransaction = async (tx: PosTransaction) => {
    const newTx = { ...tx, id: tx.id || uuidv4(), lines: tx.lines.map(l => ({ ...l, id: l.id || uuidv4() })), payments: tx.payments.map(p => ({ ...p, id: p.id || uuidv4() })) };
    const nextTxs = [newTx, ...posTransactions.filter(t => t.id !== newTx.id)];
    setPosTransactions(nextTxs);
    await safeSet(db.posTransactions, nextTxs);

    // Alimenter le registre local des paiements (répartition Finance à jour immédiatement)
    const newPayments = [...posPayments, ...newTx.payments.map(p => ({ ...p, transactionId: newTx.id }))];
    setPosPayments(newPayments);
    await safeSet(db.posPayments, newPayments);

    await queueSyncAction('INSERT_POS_TRANSACTION', newTx);
    // Update local product quantities (le serveur est décrémenté par INSERT_POS_TRANSACTION)
    await adjustProductStock(newTx.lines.map(l => ({ productId: l.productId, quantity: -l.quantity })), false, { type: 'Vente', reference: newTx.transactionNumber, createdBy: currentUser?.name });
  };
  const updatePosTransaction = async (id: string, data: Partial<PosTransaction>) => {
    const nextTxs = posTransactions.map(t => t.id === id ? { ...t, ...data } : t);
    setPosTransactions(nextTxs);
    await safeSet(db.posTransactions, nextTxs);
    await queueSyncAction('UPDATE_POS_TRANSACTION', { id, ...data });
  };

  // Annulation d'une vente validée (void) : passe en 'Annulée', restaure le stock local + serveur.
  // Ne restaure que la quantité non déjà retournée (évite la double restauration après un retour partiel).
  // Session clôturée = refusé (écart figé, M6) — le retour affirme false.
  const voidPosTransaction = async (id: string): Promise<boolean> => {
    const tx = posTransactions.find(t => t.id === id);
    if (!tx || tx.status !== 'Validée') return false;
    if (tx.sessionId) {
      const sess = posCashSessions.find(s => s.id === tx.sessionId);
      if (sess && sess.status !== 'Ouverte') return false;
    }
    const returnedQty = new Map<string, number>();
    for (const r of posReturns) {
      if (r.transactionId === id && r.status !== 'Annulé') {
        for (const line of r.lines) {
          if (line.productId) returnedQty.set(line.productId, (returnedQty.get(line.productId) || 0) + line.quantity);
        }
      }
    }
    await updatePosTransaction(id, { status: 'Annulée' });
    const deltas = tx.lines
      .map(l => ({ productId: l.productId, quantity: Math.max(0, l.quantity - (l.productId ? (returnedQty.get(l.productId) || 0) : 0)) }))
      .filter(d => d.productId && d.quantity > 0);
    await adjustProductStock(deltas, true, { type: 'Retour', reference: tx.transactionNumber, createdBy: currentUser?.name, notes: 'Annulation' });
    return true;
  };

  const clearPosSalesHistory = async () => {
    setPosTransactions([]);
    setPosPayments([]);
    setPosReturns([]);
    await db.posTransactions.clear();
    await db.posPayments.clear();
    await db.posReturns.clear();
    await queueSyncAction('CLEAR_POS_SALES_HISTORY', { confirmed: true });
  };

  const deletePosMovementsByDateRange = async (startDate: string, endDate: string) => {
    // 1. Identifier et filtrer les transactions & paiements dans la plage
    const txsToDelete = posTransactions.filter(t => {
      const day = toLocalDayKey(t.date);
      return day >= startDate && day <= endDate;
    });
    const txIdsToDelete = new Set(txsToDelete.map(t => t.id));

    const nextTxs = posTransactions.filter(t => !txIdsToDelete.has(t.id));
    const nextPayments = posPayments.filter(p => !p.transactionId || !txIdsToDelete.has(p.transactionId));

    // 2. Filtrer les retours
    const nextReturns = posReturns.filter(r => {
      const day = toLocalDayKey(r.date);
      return !(day >= startDate && day <= endDate) && !txIdsToDelete.has(r.transactionId || '');
    });

    // 3. Filtrer les sessions de caisse
    const nextSessions = posCashSessions.filter(s => {
      const day = toLocalDayKey(s.openedAt);
      return !(day >= startDate && day <= endDate);
    });

    setPosTransactions(nextTxs);
    setPosPayments(nextPayments);
    setPosReturns(nextReturns);
    setPosCashSessions(nextSessions);

    await db.posTransactions.setItem('data', nextTxs);
    await db.posPayments.setItem('data', nextPayments);
    await db.posReturns.setItem('data', nextReturns);
    await db.posCashSessions.setItem('data', nextSessions);

    await queueSyncAction('DELETE_POS_MOVEMENTS_BY_RANGE', { startDate, endDate, confirmed: true });
  };

  const addPosDiscount = async (discount: PosDiscount) => {
    const newDiscount = { ...discount, id: discount.id || uuidv4() };
    setPosDiscounts(prev => {
      const next = [...prev, newDiscount];
      void db.posDiscounts.setItem('data', next);
      return next;
    });
    await queueSyncAction('INSERT_POS_DISCOUNT', newDiscount);
  };
  const updatePosDiscount = async (id: string, data: Partial<PosDiscount>) => {
    setPosDiscounts(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...data } : d);
      void db.posDiscounts.setItem('data', next);
      return next;
    });
    await queueSyncAction('UPDATE_POS_DISCOUNT', { id, ...data });
  };
  const deletePosDiscount = async (id: string) => {
    setPosDiscounts(prev => {
      const next = prev.filter(d => d.id !== id);
      void db.posDiscounts.setItem('data', next);
      return next;
    });
    await queueSyncAction('DELETE_POS_DISCOUNT', { id });
  };

  const updatePosSettings = async (newSettings: PosSettings) => {
    setPosSettingsState(newSettings);
    await db.posSettings.setItem('data', newSettings);
    await queueSyncAction('UPDATE_POS_SETTINGS', newSettings);
  };

  const addPosReturn = async (ret: PosReturn) => {
    const newReturn = { 
      ...ret, 
      id: ret.id || uuidv4(), 
      lines: ret.lines.map(l => ({ ...l, id: l.id || uuidv4() })),
      exchangeLines: ret.exchangeLines?.map(l => ({ ...l, id: l.id || uuidv4() }))
    };
    const nextReturns = [...posReturns, newReturn];
    setPosReturns(nextReturns);
    await safeSet(db.posReturns, nextReturns);
    await queueSyncAction('INSERT_POS_RETURN', newReturn);
    
    // Restore product quantities for returned items (stock + qty) with movement tracking
    await adjustProductStock(
      newReturn.lines.map(l => ({ productId: l.productId, quantity: l.quantity })), 
      true, 
      { type: 'Retour', reference: newReturn.returnNumber, createdBy: currentUser?.name || newReturn.createdBy, notes: 'Retour marchandise' }
    );
    
    // Deduct product quantities for exchanged items (stock - qty) with movement tracking
    if (newReturn.exchangeLines && newReturn.exchangeLines.length > 0) {
      await adjustProductStock(
        newReturn.exchangeLines.map(l => ({ productId: l.productId, quantity: -l.quantity })), 
        true, 
        { type: 'Vente', reference: newReturn.returnNumber, createdBy: currentUser?.name || newReturn.createdBy, notes: 'Échange marchandise' }
      );
    }

    // Marquer la transaction 'Retournée' ou 'Retour partiel'
    if (newReturn.transactionId) {
      await recomputeTransactionStatus(newReturn.transactionId);
    }
  };
  const updatePosReturn = async (id: string, data: Partial<PosReturn>) => {
    const nextReturns = posReturns.map(r => r.id === id ? { ...r, ...data } : r);
    setPosReturns(nextReturns);
    await safeSet(db.posReturns, nextReturns);
    await queueSyncAction('UPDATE_POS_RETURN', { id, ...data });
  };

  // Annulation d'un retour : statut 'Annulé', ré-injecte le stock (local + serveur), recalcule la transaction
  // R3 : si le void de la transaction complément échoue (session clôturée), on
  // interrompt l'annulation AVANT toute ré-inversion de stock (divergence sinon).
  const cancelPosReturn = async (id: string): Promise<boolean> => {
    const ret = posReturns.find(r => r.id === id);
    if (!ret || ret.status === 'Annulé') return false;

    // Annuler aussi la transaction de complément éventuelle (encaissement lié)
    if (ret.complementTransactionId) {
      const complement = posTransactions.find(t => t.id === ret.complementTransactionId);
      if (complement && complement.status === 'Validée') {
        const ok = await voidPosTransaction(ret.complementTransactionId);
        if (!ok) {
          toast.error("Annulation impossible : la transaction complément est sur une session clôturée. Aucun stock n'a été modifié.");
          return false;
        }
      }
    }

    await updatePosReturn(id, { status: 'Annulé' });
    const tx = ret.transactionId ? posTransactions.find(t => t.id === ret.transactionId) : undefined;
    
    // Inverser les stocks si la transaction n'est pas complètement annulée par ailleurs
    if (!tx || tx.status !== 'Annulée') {
      // Les articles retournés repartent (stock -)
      await adjustProductStock(
        ret.lines.map(l => ({ productId: l.productId, quantity: -l.quantity })), 
        true,
        { type: 'Ajustement Manuel', reference: ret.returnNumber, createdBy: currentUser?.name, notes: 'Annulation retour (déduction)' }
      );
      
      // Les articles échangés reviennent (stock +)
      if (ret.exchangeLines && ret.exchangeLines.length > 0) {
        await adjustProductStock(
          ret.exchangeLines.map(l => ({ productId: l.productId, quantity: l.quantity })), 
          true,
          { type: 'Ajustement Manuel', reference: ret.returnNumber, createdBy: currentUser?.name, notes: 'Annulation retour (réintégration échange)' }
        );
      }
    }

    if (ret.transactionId) {
      await recomputeTransactionStatus(ret.transactionId);
    }
    return true;
  };

  // Product Module CRUD
  const addProductCompletion = async (completion: ProductCompletion) => {
    const newCompletion = { ...completion, id: completion.id || uuidv4() };
    setProductCompletions(prev => {
      const next = [...prev, newCompletion];
      void db.productCompletions.setItem('data', next);
      return next;
    });
    await queueSyncAction('INSERT_PRODUCT_COMPLETION', newCompletion);
  };
  const updateProductCompletion = async (id: string, data: Partial<ProductCompletion>) => {
    setProductCompletions(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...data } : c);
      void db.productCompletions.setItem('data', next);
      return next;
    });
    await queueSyncAction('UPDATE_PRODUCT_COMPLETION', { id, ...data });
  };
  const deleteProductCompletion = async (id: string) => {
    setProductCompletions(prev => {
      const next = prev.filter(c => c.id !== id);
      void db.productCompletions.setItem('data', next);
      return next;
    });
    await queueSyncAction('DELETE_PRODUCT_COMPLETION', { id });
  };

  const addImportSession = async (session: ImportSession) => {
    setImportSessions(prev => {
      const next = [...prev, session];
      void db.importSessions.setItem('data', next);
      return next;
    });
    await queueSyncAction('INSERT_IMPORT_SESSION', session);
  };
  const updateImportSession = async (id: string, data: Partial<ImportSession>) => {
    setImportSessions(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...data } : s);
      void db.importSessions.setItem('data', next);
      return next;
    });
    await queueSyncAction('UPDATE_IMPORT_SESSION', { id, ...data });
  };
  const deleteImportSession = async (id: string) => {
    setImportSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      void db.importSessions.setItem('data', next);
      return next;
    });
    await queueSyncAction('DELETE_IMPORT_SESSION', { id });
  };

  const addImportError = async (error: ImportError) => {
    const existing = await db.importErrors.getItem<ImportError[]>('data');
    const next = existing ? [...existing, error] : [error];
    await db.importErrors.setItem('data', next);
    await queueSyncAction('INSERT_IMPORT_ERROR', error);
  };

  const completeProduct = async (productId: string, updates: Partial<PosProduct>) => {
    const updatedProducts = posProducts.map(p => p.id === productId ? { ...p, ...updates } : p);
    setPosProducts(updatedProducts);
    await db.posProducts.setItem('data', updatedProducts);
    await queueSyncAction('UPDATE_POS_PRODUCT', { id: productId, ...updates });
    // Remove related product completions (local + serveur)
    const removedCompletions = productCompletions.filter(c => c.productId === productId);
    const remainingCompletions = productCompletions.filter(c => c.productId !== productId);
    setProductCompletions(remainingCompletions);
    await db.productCompletions.setItem('data', remainingCompletions);
    for (const c of removedCompletions) {
      await queueSyncAction('DELETE_PRODUCT_COMPLETION', { id: c.id });
    }
  };

  // Création d'utilisateur via Edge Function (service_role) pour ne pas écraser la session du Directeur
  const addUser = async (user: User) => {
    if (!navigator.onLine) { alert("Vous devez être en ligne pour créer un utilisateur."); return; }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { alert('Session expirée. Veuillez vous reconnecter.'); return; }

    const isDirRole = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(user.role);
    const crmDefaultNew = !['Caissier', 'Gerant'].includes(user.role);

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: user.email,
          pin: user.pin,
          name: user.name,
          role: user.role,
          posRole: user.posRole || null,
          serviceId: user.serviceId || null,
          posReturnsEnabled: user.posReturnsEnabled,
          posCatalogueEnabled: user.posCatalogueEnabled,
          posSupplyEnabled: user.posSupplyEnabled,
          posInventoryEnabled: user.posInventoryEnabled,
          posStockEnabled: user.posStockEnabled,
          crmPrestationsEnabled: user.crmPrestationsEnabled ?? crmDefaultNew,
          crmCaisseEnabled: user.crmCaisseEnabled ?? crmDefaultNew,
          crmMaintenanceEnabled: user.crmMaintenanceEnabled ?? crmDefaultNew,
          crmStocksEnabled: user.crmStocksEnabled ?? crmDefaultNew,
          crmTiersEnabled: user.crmTiersEnabled ?? crmDefaultNew,
          crmCommerciauxEnabled: user.crmCommerciauxEnabled ?? crmDefaultNew,
          crmCommissionsEnabled: user.crmCommissionsEnabled ?? crmDefaultNew,
          crmFacturationEnabled: user.crmFacturationEnabled ?? crmDefaultNew,
          crmSupFacturesEnabled: user.crmSupFacturesEnabled ?? isDirRole,
          crmReportsEnabled: user.crmReportsEnabled ?? !isDirRole,
          crmTeamReportsEnabled: user.crmTeamReportsEnabled ?? isDirRole
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      alert(`Erreur : ${result.error || 'Impossible de créer l\'utilisateur.'}`);
      return;
    }

    // Ajouter le nouvel utilisateur à l'état local et au cache
    const newUser: User = {
      id: result.id,
      name: result.name,
      email: result.email,
      role: result.role,
      serviceId: result.serviceId,
      pin: user.pin,
      lastLogin: 'Jamais',
      active: true,
      posReturnsEnabled: user.posReturnsEnabled,
      posCatalogueEnabled: user.posCatalogueEnabled,
      posSupplyEnabled: user.posSupplyEnabled,
      posInventoryEnabled: user.posInventoryEnabled,
      posStockEnabled: user.posStockEnabled,
      posRole: user.posRole || null,
      crmPrestationsEnabled: user.crmPrestationsEnabled ?? crmDefaultNew,
      crmCaisseEnabled: user.crmCaisseEnabled ?? crmDefaultNew,
      crmMaintenanceEnabled: user.crmMaintenanceEnabled ?? crmDefaultNew,
      crmStocksEnabled: user.crmStocksEnabled ?? crmDefaultNew,
      crmTiersEnabled: user.crmTiersEnabled ?? crmDefaultNew,
      crmCommerciauxEnabled: user.crmCommerciauxEnabled ?? crmDefaultNew,
      crmCommissionsEnabled: user.crmCommissionsEnabled ?? crmDefaultNew,
      crmFacturationEnabled: user.crmFacturationEnabled ?? crmDefaultNew,
      crmSupFacturesEnabled: user.crmSupFacturesEnabled ?? isDirRole,
      crmReportsEnabled: user.crmReportsEnabled ?? !isDirRole,
      crmTeamReportsEnabled: user.crmTeamReportsEnabled ?? isDirRole
    };
    const newUsers = dedupeUsers([...users.filter(u => u.id !== newUser.id && u.email.trim().toLowerCase() !== newUser.email.trim().toLowerCase()), newUser]);
    setUsers(newUsers);
    await db.profiles.setItem('data', newUsers);
  };

  const updateUser = async (id: string, data: Partial<User>) => {
    const newUsers = users.map(u => u.id === id ? { ...u, ...data } : u);
    setUsers(newUsers);
    await db.profiles.setItem('data', newUsers);
    const payload: any = { id };
    if (data.name !== undefined) payload.name = data.name;
    if (data.role !== undefined) payload.role = data.role;
    if (data.posRole !== undefined) payload.pos_role = data.posRole || null;
    if (data.serviceId !== undefined) payload.service_id = data.serviceId || null;
    if (data.posReturnsEnabled !== undefined) payload.pos_returns_enabled = data.posReturnsEnabled;
    if (data.posCatalogueEnabled !== undefined) payload.pos_catalogue_enabled = data.posCatalogueEnabled;
    if (data.posSupplyEnabled !== undefined) payload.pos_supply_enabled = data.posSupplyEnabled;
    if (data.posInventoryEnabled !== undefined) payload.pos_inventory_enabled = data.posInventoryEnabled;
    if (data.posStockEnabled !== undefined) payload.pos_stock_enabled = data.posStockEnabled;
    if (data.crmPrestationsEnabled !== undefined) payload.crm_prestations_enabled = data.crmPrestationsEnabled;
    if (data.crmCaisseEnabled !== undefined) payload.crm_caisse_enabled = data.crmCaisseEnabled;
    if (data.crmMaintenanceEnabled !== undefined) payload.crm_maintenance_enabled = data.crmMaintenanceEnabled;
    if (data.crmStocksEnabled !== undefined) payload.crm_stocks_enabled = data.crmStocksEnabled;
    if (data.crmTiersEnabled !== undefined) payload.crm_tiers_enabled = data.crmTiersEnabled;
    if (data.crmCommerciauxEnabled !== undefined) payload.crm_commerciaux_enabled = data.crmCommerciauxEnabled;
    if (data.crmCommissionsEnabled !== undefined) payload.crm_commissions_enabled = data.crmCommissionsEnabled;
    if (data.crmFacturationEnabled !== undefined) payload.crm_facturation_enabled = data.crmFacturationEnabled;
    if (data.crmSupFacturesEnabled !== undefined) payload.crm_sup_factures_enabled = data.crmSupFacturesEnabled;
    if (data.crmReportsEnabled !== undefined) payload.crm_reports_enabled = data.crmReportsEnabled;
    if (data.crmTeamReportsEnabled !== undefined) payload.crm_team_reports_enabled = data.crmTeamReportsEnabled;
    if (currentUser && currentUser.id === id) {
      updateCurrentUser(data);
    }

    await queueSyncAction('UPDATE_PROFILE', payload);
    try {
      if (navigator.onLine) {
        const { id: _, ...fieldsToUpdate } = payload;
        const { error: directErr } = await supabase.from('profiles').update(fieldsToUpdate).eq('id', id);
        if (directErr) console.error('Erreur direct profile update (rejeu via file) :', directErr.message);
      }
    } catch (e) {
      console.warn('Erreur direct profile update:', e);
    }
  };

  const updateMyProfile = async (data: Partial<Pick<User, 'photo' | 'name'>>) => {
    if (!currentUser) return;
    const newUsers = users.map(u => u.id === currentUser.id ? { ...u, ...data } : u);
    setUsers(newUsers);
    await db.profiles.setItem('data', newUsers);
    await queueSyncAction('UPDATE_PROFILE', { id: currentUser.id, ...(data.photo !== undefined ? { photo: data.photo } : {}), ...(data.name !== undefined ? { name: data.name } : {}) });
  };

  const toggleUserStatus = async (id: string) => {
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;
    const updatedActive = !targetUser.active;
    const newUsers = users.map(u => u.id === id ? { ...u, active: updatedActive } : u);
    setUsers(newUsers);
    await db.profiles.setItem('data', newUsers);
    await queueSyncAction('UPDATE_PROFILE', { id, active: updatedActive });
  };

  const deleteUser = async (id: string, callback?: () => void) => {
    const newUsers = users.filter(u => u.id !== id);
    setUsers(newUsers);
    await db.profiles.setItem('data', newUsers);
    await queueSyncAction('DELETE_PROFILE', { id });
    if (typeof callback === 'function') callback();
  };

  const addSuspendedCart = useCallback((cart: SuspendedCart) => {
    setSuspendedCarts(prev => [...prev, cart]);
  }, []);

  const addCrmDocument = async (
    file: File,
    optionsOrUploaderId?: { uploaderId?: string; folderId?: string; clientId?: string; category?: CrmDocument['category']; isShared?: boolean } | string,
    folderIdParam?: string
  ): Promise<CrmDocument> => {
    const id = uuidv4();
    let uploaderId: string | undefined = currentUser?.id;
    let folderId: string | undefined = undefined;
    let clientId: string | undefined = undefined;
    let category: CrmDocument['category'] = 'Autre';
    let isShared: boolean = false;

    if (typeof optionsOrUploaderId === 'string') {
      uploaderId = optionsOrUploaderId;
      folderId = folderIdParam;
    } else if (optionsOrUploaderId && typeof optionsOrUploaderId === 'object') {
      uploaderId = optionsOrUploaderId.uploaderId || currentUser?.id;
      folderId = optionsOrUploaderId.folderId;
      clientId = optionsOrUploaderId.clientId;
      category = optionsOrUploaderId.category || 'Autre';
      isShared = !!optionsOrUploaderId.isShared;
    }

    const newDoc: CrmDocument = {
      id,
      name: file.name,
      type: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      filePath: `${uploaderId || 'shared'}/${id}_${file.name}`,
      uploaderId,
      folderId,
      clientId,
      category,
      isShared,
      createdAt: new Date().toISOString()
    };

    const newDocs = [newDoc, ...crmDocuments];
    setCrmDocuments(newDocs);
    await db.documents.setItem('data', newDocs);
    await db.documentFiles.setItem(id, file);
    await queueSyncAction('INSERT_DOCUMENT', newDoc);
    return newDoc;
  };

  const updateCrmDocument = async (id: string, updates: Partial<CrmDocument>, newFileBlob?: Blob) => {
    const doc = crmDocuments.find(d => d.id === id);
    if (!doc) return;

    let updatedSize = updates.sizeBytes ?? doc.sizeBytes;
    let updatedType = updates.type ?? doc.type;

    if (newFileBlob) {
      updatedSize = newFileBlob.size;
      if (newFileBlob.type) {
        updatedType = newFileBlob.type;
      }
      await db.documentFiles.setItem(id, newFileBlob);
    }

    const updatedDoc: CrmDocument = {
      ...doc,
      ...updates,
      type: updatedType,
      sizeBytes: updatedSize,
      updatedAt: new Date().toISOString()
    };

    const newDocs = crmDocuments.map(d => d.id === id ? updatedDoc : d);
    setCrmDocuments(newDocs);
    await db.documents.setItem('data', newDocs);

    await queueSyncAction('UPDATE_DOCUMENT', {
      id,
      updates: updatedDoc,
      hasNewFile: Boolean(newFileBlob)
    });
  };

  const deleteCrmDocument = async (id: string) => {
    const doc = crmDocuments.find(d => d.id === id);
    if (!doc) return;
    const newDocs = crmDocuments.filter(d => d.id !== id);
    setCrmDocuments(newDocs);
    await db.documents.setItem('data', newDocs);
    await db.documentFiles.removeItem(id);
    await queueSyncAction('DELETE_DOCUMENT', { id, filePath: doc.filePath });
  };

  const getCrmDocumentBlob = async (doc: CrmDocument): Promise<Blob | null> => {
    let blob = await db.documentFiles.getItem<Blob>(doc.id);
    if (!blob) {
      try {
        const { data, error } = await supabase.storage.from('crm_documents').download(doc.filePath);
        if (!error && data) {
          blob = data;
          await db.documentFiles.setItem(doc.id, blob);
        } else {
          // Fallback: try signed URL if direct download had an issue
          const { data: signedData } = await supabase.storage.from('crm_documents').createSignedUrl(doc.filePath, 3600);
          if (signedData?.signedUrl) {
            const resp = await fetch(signedData.signedUrl);
            if (resp.ok) {
              blob = await resp.blob();
              await db.documentFiles.setItem(doc.id, blob);
            }
          }
        }
      } catch (err) {
        console.error('[GED] Erreur récupération document blob:', err);
      }
    }
    return blob || null;
  };

  const downloadCrmDocument = async (doc: CrmDocument) => {
    const blob = await getCrmDocumentBlob(doc);
    if (!blob) {
      alert('Impossible de charger ce document depuis le stockage.');
      return;
    }
    const isMobileDevice = typeof navigator !== 'undefined' && (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    const url = URL.createObjectURL(blob);
    if (isMobileDevice) {
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        window.open(url, '_blank');
      }
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const addCrmFolder = async (
    name: string,
    ownerId: string,
    parentId?: string,
    color: string = '#1879C8',
    isShared: boolean = false
  ): Promise<CrmFolder> => {
    const newFolder: CrmFolder = {
      id: uuidv4(),
      name,
      ownerId,
      parentId,
      color: color || '#1879C8',
      isShared,
      createdAt: new Date().toISOString()
    };
    const newFolders = [...crmFolders, newFolder];
    setCrmFolders(newFolders);
    await db.crmFolders.setItem('data', newFolders);
    await queueSyncAction('INSERT_CRM_FOLDER', newFolder);
    return newFolder;
  };

  const updateCrmFolder = async (id: string, data: Partial<CrmFolder>) => {
    const newFolders = crmFolders.map(f => f.id === id ? { ...f, ...data } : f);
    setCrmFolders(newFolders);
    await db.crmFolders.setItem('data', newFolders);
    await queueSyncAction('UPDATE_CRM_FOLDER', { id, ...data });
  };

  const deleteCrmFolder = async (id: string) => {
    const newFolders = crmFolders.filter(f => f.id !== id);
    setCrmFolders(newFolders);
    await db.crmFolders.setItem('data', newFolders);
    await queueSyncAction('DELETE_CRM_FOLDER', { id });
    
    const updatedDocs = crmDocuments.map(d => d.folderId === id ? { ...d, folderId: undefined } : d);
    setCrmDocuments(updatedDocs);
    await db.documents.setItem('data', updatedDocs);
  };

  const markNotificationAsRead = async (id: string) => {
    const target = notifications.find(n => n.id === id);
    if (!target || target.is_read) return;
    const newNotifications = notifications.map(n => n.id === id ? { ...n, is_read: true } : n);
    setNotifications(newNotifications);
    await db.notifications.setItem('data', newNotifications);
    await queueSyncAction('MARK_NOTIFICATION_READ', { id });
  };

  const markAllNotificationsAsRead = async () => {
    if (!currentUser) return;
    let changed = false;
    const newNotifications = notifications.map(n => {
      if (n.user_id === currentUser.id && !n.is_read) {
        changed = true;
        return { ...n, is_read: true };
      }
      return n;
    });
    if (!changed) return;
    setNotifications(newNotifications);
    await db.notifications.setItem('data', newNotifications);
    await queueSyncAction('MARK_ALL_NOTIFICATIONS_READ', { user_id: currentUser.id });
  };

  const removeSuspendedCart = useCallback((id: string) => {
    setSuspendedCarts(prev => prev.filter(c => c.id !== id));
  }, []);

  // ==========================================
  // CRM MODULES RESPONSABLES CRUD
  // ==========================================

  // Module 5: Tiers (Clients, Fournisseurs, Partenaires)
  const addCrmTier = async (tier: ClientFournisseur) => {
    const id = tier.id || uuidv4();
    const item: ClientFournisseur = {
      ...tier,
      id,
      cree_par: tier.cree_par || currentUser?.id,
      cree_par_nom: tier.cree_par_nom || currentUser?.name,
      created_at: tier.created_at || new Date().toISOString()
    };
    const next = [item, ...crmTiers.filter(t => t.id !== id)];
    setCrmTiers(next);
    await db.crmTiers.setItem('data', next);
    await queueSyncAction('INSERT_CRM_TIER', item);
  };

  const updateCrmTier = async (id: string, tier: Partial<ClientFournisseur>) => {
    const next = crmTiers.map(t => t.id === id ? { ...t, ...tier } : t);
    setCrmTiers(next);
    await db.crmTiers.setItem('data', next);
    await queueSyncAction('UPDATE_CRM_TIER', { ...tier, id });
  };

  const deleteCrmTier = async (id: string): Promise<boolean> => {
    // Intégrité (B2) : tiers référencé = suppression interdite (pas de FK en DB)
    const usedPrest = crmPrestations.some(p => p.client_id === id || p.apporteur_id === id);
    const usedMaint = crmMaintenance.some(m => m.client_id === id);
    const usedStock = crmArticles.some(a => a.fournisseur_id === id);
    if (usedPrest || usedMaint || usedStock) return false;
    const next = crmTiers.filter(t => t.id !== id);
    setCrmTiers(next);
    await db.crmTiers.setItem('data', next);
    await queueSyncAction('DELETE_CRM_TIER', { id });
    return true;
  };

  // Module 6: Agents Commerciaux
  const clampTauxDefaut = (v: unknown) => Math.min(100, Math.max(0, Number(v) || 0));
  const addCrmCommercial = async (comm: AgentCommercial) => {
    const id = comm.id || uuidv4();
    const item: AgentCommercial = {
      ...comm,
      id,
      taux_commission_defaut: clampTauxDefaut(comm.taux_commission_defaut),
      total_ventes: comm.total_ventes ?? 0,
      contrats_clos_count: comm.contrats_clos_count ?? 0,
      cree_par: comm.cree_par || currentUser?.id,
      cree_par_nom: comm.cree_par_nom || currentUser?.name,
      created_at: comm.created_at || new Date().toISOString()
    };
    const next = [item, ...crmCommerciaux.filter(c => c.id !== id)];
    setCrmCommerciaux(next);
    await db.crmCommerciaux.setItem('data', next);
    await queueSyncAction('INSERT_CRM_COMMERCIAL', item);
  };

  const updateCrmCommercial = async (id: string, comm: Partial<AgentCommercial>) => {
    const safe: Partial<AgentCommercial> = {
      ...comm,
      ...(comm.taux_commission_defaut !== undefined
        ? { taux_commission_defaut: clampTauxDefaut(comm.taux_commission_defaut) }
        : {}),
      ...(comm.total_ventes !== undefined ? { total_ventes: Math.max(0, Number(comm.total_ventes) || 0) } : {}),
      ...(comm.contrats_clos_count !== undefined ? { contrats_clos_count: Math.max(0, Number(comm.contrats_clos_count) || 0) } : {})
    };
    const next = crmCommerciaux.map(c => c.id === id ? { ...c, ...safe } : c);
    setCrmCommerciaux(next);
    await db.crmCommerciaux.setItem('data', next);
    await queueSyncAction('UPDATE_CRM_COMMERCIAL', { ...safe, id });
  };

  const deleteCrmCommercial = async (id: string): Promise<boolean> => {
    // Intégrité : commercial rattaché à des commandes ou avec historique = suppression interdite
    const target = crmCommerciaux.find(c => c.id === id);
    const used = crmPrestations.some(p => p.commercial_id === id);
    const hasHistory = (target?.total_ventes || 0) > 0 || (target?.contrats_clos_count || 0) > 0;
    if (used || hasHistory) return false;
    const next = crmCommerciaux.filter(c => c.id !== id);
    setCrmCommerciaux(next);
    await db.crmCommerciaux.setItem('data', next);
    await queueSyncAction('DELETE_CRM_COMMERCIAL', { id });
    return true;
  };

  // Helper pour synchroniser les fiches de commissions pour une prestation
  const syncCommissionsForPrestation = async (prest: PrestationCommande) => {
    const newCommissionsToSave: CommissionPrestation[] = [];
    // Champs NOT NULL cote serveur (contraintes) : toujours renseignes
    const montantPrestation = Number(prest.prix_client_final ?? prest.montant_total_vente) || 0;

    // Règle de gel : une fiche PAYEE n'est jamais réécrite (argent déjà décaissé —
    // ni montant, ni bénéficiaire, ni référence ne bougent). Elle est conservée
    // telle quelle par la réconciliation (keptPayees) sans repasser par la file sync.
    // Une fiche VALIDEE dont le montant change repasse EN_ATTENTE (re-validation requise).
    const buildComm = (
      type: CommissionPrestation['type_beneficiaire'],
      montantPrest: number,
      beneficiaire_id: string | undefined,
      beneficiaire_nom: string
    ) => {
      if (!(montantPrest > 0)) return;
      const existing = crmCommissions.find(c => c.prestation_id === prest.id && c.type_beneficiaire === type);
      if (existing?.statut === 'PAYEE') return;
      const prevStatut = existing?.statut || 'EN_ATTENTE';
      const statut = prevStatut === 'VALIDEE' && (existing?.montant || 0) !== montantPrest ? 'EN_ATTENTE' : prevStatut;
      newCommissionsToSave.push({
        id: existing?.id || uuidv4(),
        prestation_id: prest.id,
        prestation_ref: prest.reference,
        type_beneficiaire: type,
        beneficiaire_id,
        beneficiaire_nom,
        montant: montantPrest,
        montant_prestation: montantPrestation,
        montant_commission: montantPrest,
        statut,
        date_reglement: existing?.date_reglement,
        mode_reglement: existing?.mode_reglement,
        mouvement_caisse_id: existing?.mouvement_caisse_id,
        cree_par: prest.cree_par,
        created_at: existing?.created_at || new Date().toISOString()
      });
    };

    // Commission Apporteur (si montant > 0)
    if (prest.apporteur_id || prest.apporteur_nom) {
      buildComm('APPORTEUR', prest.commission_apporteur || 0, prest.apporteur_id || undefined, prest.apporteur_nom || 'Apporteur');
    }

    // Commission Agent Commercial (si montant > 0)
    if (prest.commercial_id || prest.commercial_nom) {
      buildComm('AGENT_COMMERCIAL', prest.commission_agent || 0, prest.commercial_id || undefined, prest.commercial_nom || 'Commercial');
    }

    // Commission Responsable de Service (si montant > 0)
    if (prest.resp_service_id || prest.resp_service_nom) {
      buildComm('RESPONSABLE', prest.commission_resp_service || 0, prest.resp_service_id || undefined, prest.resp_service_nom || 'Responsable de Service');
    }

    // Réconciliation : supprimer les fiches devenues à 0 (jamais les PAYEE : argent déjà mouvementé)
    const desiredIds = new Set(newCommissionsToSave.map(c => c.id));
    const orphans = crmCommissions.filter(c => c.prestation_id === prest.id && !desiredIds.has(c.id) && c.statut !== 'PAYEE');
    const keptOthers = crmCommissions.filter(c => c.prestation_id !== prest.id);
    const keptPayees = crmCommissions.filter(c => c.prestation_id === prest.id && c.statut === 'PAYEE' && !desiredIds.has(c.id));
    const updatedComms = [...newCommissionsToSave, ...keptOthers, ...keptPayees];
    setCrmCommissions(updatedComms);
    await db.crmCommissions.setItem('data', updatedComms);
    for (const comm of newCommissionsToSave) {
      await queueSyncAction('UPSERT_CRM_COMMISSION', comm);
    }
    for (const orphan of orphans) {
      await queueSyncAction('DELETE_CRM_COMMISSION', { id: orphan.id });
    }
  };

  // Module 1: Prestations & Commandes
  const addCrmPrestation = async (prest: PrestationCommande) => {
    const id = prest.id || uuidv4();
    const now = new Date();
    const year = now.getFullYear();
    const seq = (crmPrestations.length + 1).toString().padStart(4, '0');
    // Référence unique : suffixe aléatoire en cas de collision (suppressions, concurrence, offline)
    let reference = prest.reference || `CMD-${year}-${seq}`;
    while (crmPrestations.some(p => p.reference === reference)) {
      reference = `${reference.split('-bis')[0]}-bis${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // 11-column financial formulas (quantités/montants bornés : pas de négatif)
    const quantite = Math.max(1, Math.round(Number(prest.quantite) || 1));
    const cout_unitaire_achat = Math.max(0, Number(prest.cout_unitaire_achat) || 0);
    const cout_final_achat = quantite * cout_unitaire_achat;
    const prix_vente_unitaire = Math.max(0, Number(prest.prix_vente_unitaire) || 0);
    const prix_client_final = quantite * prix_vente_unitaire;
    const marge_interne = prix_client_final - cout_final_achat;
    // Règles métier commissions :
    // - Apporteur : TOUJOURS prix_client_final * taux_commission_app / 100
    //   (repli sur le montant fourni uniquement pour les anciennes données sans taux).
    // - Responsable / Commercial : bascule MONTANT (forfait FCFA) ou TAUX
    //   (% appliqué sur la marge interne, base >= 0).
    const taux_commission_app = Math.max(0, Number(prest.taux_commission_app) || 0);
    const commission_apporteur = taux_commission_app > 0
      ? Math.round((prix_client_final * taux_commission_app) / 100)
      : Math.max(0, Number(prest.commission_apporteur) || 0);
    const mode_commission_resp = prest.mode_commission_resp === 'TAUX' ? 'TAUX' : 'MONTANT';
    const taux_commission_resp = Math.max(0, Number(prest.taux_commission_resp) || 0);
    const commission_resp_service = mode_commission_resp === 'TAUX'
      ? Math.round((Math.max(0, marge_interne) * taux_commission_resp) / 100)
      : Math.max(0, Number(prest.commission_resp_service) || 0);
    const mode_commission_agent = prest.mode_commission_agent === 'TAUX' ? 'TAUX' : 'MONTANT';
    const taux_commission_agent = Math.max(0, Number(prest.taux_commission_agent) || 0);
    const commission_agent = mode_commission_agent === 'TAUX'
      ? Math.round((Math.max(0, marge_interne) * taux_commission_agent) / 100)
      : Math.max(0, Number(prest.commission_agent) || 0);
    const benefice_net = marge_interne - (commission_apporteur + commission_resp_service + commission_agent);

    const item: PrestationCommande = {
      ...prest,
      id,
      reference,
      quantite,
      cout_unitaire_achat,
      cout_final_achat,
      prix_vente_unitaire,
      prix_client_final,
      marge_interne,
      taux_commission_app,
      commission_apporteur,
      mode_commission_resp,
      taux_commission_resp,
      commission_resp_service,
      mode_commission_agent,
      taux_commission_agent,
      commission_agent,
      benefice_net,
      statut: prest.statut || 'BROUILLON',
      cree_par: prest.cree_par || currentUser?.id || '',
      cree_par_nom: prest.cree_par_nom || currentUser?.name,
      date_creation: prest.date_creation || now.toISOString().split('T')[0]
    };

    const next = [item, ...crmPrestations.filter(p => p.id !== id)];
    setCrmPrestations(next);
    await db.crmPrestations.setItem('data', next);
    await queueSyncAction('INSERT_CRM_PRESTATION', item);

    // Auto-generate commissions if > 0
    await syncCommissionsForPrestation(item);

    // Update commercial metrics if assigned — uniquement les statuts engagés
    // (BROUILLON/ANNULEE exclus, même règle que les KPIs de la page Prestations)
    const countedForCommercial = item.statut !== 'ANNULEE' && item.statut !== 'BROUILLON';
    if (item.commercial_id && countedForCommercial) {
      const comm = crmCommerciaux.find(c => c.id === item.commercial_id);
      if (comm) {
        const total_ventes = (comm.total_ventes || 0) + item.prix_client_final;
        const contrats_clos_count = (comm.contrats_clos_count || 0) + 1;
        await updateCrmCommercial(comm.id, { total_ventes, contrats_clos_count });
      }
    }
  };

  const updateCrmPrestation = async (id: string, prest: Partial<PrestationCommande>) => {
    const current = crmPrestations.find(p => p.id === id);
    if (!current) return;
    // Marqueur interne : seul l'encaissement (qui génère l'écriture caisse) peut passer au PAYEE
    const viaEncaissement = (prest as any)._viaEncaissement === true;
    // Bornes anti-NaN : Number(undefined/texte) = NaN et Math.max(0, NaN) = NaN → repli explicite
    const quantite = Math.max(1, Math.round((prest.quantite !== undefined ? Number(prest.quantite) : Number(current.quantite)) || 1));
    const cout_unitaire_achat = Math.max(0, (prest.cout_unitaire_achat !== undefined ? Number(prest.cout_unitaire_achat) : Number(current.cout_unitaire_achat)) || 0);
    const cout_final_achat = quantite * cout_unitaire_achat;
    const prix_vente_unitaire = Math.max(0, (prest.prix_vente_unitaire !== undefined ? Number(prest.prix_vente_unitaire) : Number(current.prix_vente_unitaire)) || 0);
    const prix_client_final = quantite * prix_vente_unitaire;
    const marge_interne = prix_client_final - cout_final_achat;
    const taux_commission_app = Math.max(0, (prest.taux_commission_app !== undefined ? Number(prest.taux_commission_app) : Number(current.taux_commission_app)) || 0);
    const prix_for_app = prix_client_final;
    const commission_apporteur = (prest.taux_commission_app !== undefined || prest.commission_apporteur !== undefined)
      ? (taux_commission_app > 0
          ? Math.round((prix_for_app * taux_commission_app) / 100)
          : Math.max(0, (prest.commission_apporteur !== undefined ? Number(prest.commission_apporteur) : Number(current.commission_apporteur)) || 0))
      : (current.commission_apporteur || 0);
    const mode_commission_resp = prest.mode_commission_resp ?? current.mode_commission_resp ?? 'MONTANT';
    const taux_commission_resp = Math.max(0, (prest.taux_commission_resp !== undefined ? Number(prest.taux_commission_resp) : Number(current.taux_commission_resp)) || 0);
    const commission_resp_service = mode_commission_resp === 'TAUX'
      ? Math.round((Math.max(0, marge_interne) * taux_commission_resp) / 100)
      : Math.max(0, (prest.commission_resp_service !== undefined ? Number(prest.commission_resp_service) : Number(current.commission_resp_service)) || 0);
    const mode_commission_agent = prest.mode_commission_agent ?? current.mode_commission_agent ?? 'MONTANT';
    const taux_commission_agent = Math.max(0, (prest.taux_commission_agent !== undefined ? Number(prest.taux_commission_agent) : Number(current.taux_commission_agent)) || 0);
    const commission_agent = mode_commission_agent === 'TAUX'
      ? Math.round((Math.max(0, marge_interne) * taux_commission_agent) / 100)
      : Math.max(0, (prest.commission_agent !== undefined ? Number(prest.commission_agent) : Number(current.commission_agent)) || 0);
    const benefice_net = marge_interne - (commission_apporteur + commission_resp_service + commission_agent);

    // Machine à états (anti-régression) :
    // - PAYEE uniquement via encaisserCrmPrestation (génère l'ENTREE caisse)
    // - PAYEE → CLOTUREE uniquement ; CLOTUREE et ANNULEE définitifs
    const prevStatut = current.statut;
    let nextStatut = prest.statut ?? prevStatut;
    if (nextStatut === 'PAYEE' && prevStatut !== 'PAYEE' && !viaEncaissement) nextStatut = prevStatut;
    if ((prevStatut === 'PAYEE' && nextStatut !== 'PAYEE' && nextStatut !== 'CLOTUREE')
      || (prevStatut === 'CLOTUREE' && nextStatut !== 'CLOTUREE')
      || (prevStatut === 'ANNULEE' && nextStatut !== 'ANNULEE')) {
      nextStatut = prevStatut;
    }

    const updated: PrestationCommande = {
      ...current,
      ...prest,
      quantite,
      cout_unitaire_achat,
      cout_final_achat,
      prix_vente_unitaire,
      prix_client_final,
      marge_interne,
      taux_commission_app,
      commission_apporteur,
      mode_commission_resp,
      taux_commission_resp,
      commission_resp_service,
      mode_commission_agent,
      taux_commission_agent,
      commission_agent,
      benefice_net,
      statut: nextStatut
    };
    delete (updated as any)._viaEncaissement;

    const next = crmPrestations.map(p => p.id === id ? updated : p);
    setCrmPrestations(next);
    await db.crmPrestations.setItem('data', next);
    await queueSyncAction('UPDATE_CRM_PRESTATION', updated);

    // Réajuster les compteurs commerciaux si réassignation, montant modifié
    // ou entrée/sortie du périmètre compté (BROUILLON/ANNULEE exclus).
    // Application en une passe unique (les setState successifs verraient le même state périmé).
    const oldCommId = current.commercial_id;
    const newCommId = updated.commercial_id;
    const commercialChanged = oldCommId !== newCommId;
    const amountChanged = (current.prix_client_final || 0) !== (updated.prix_client_final || 0);
    const oldCounted = prevStatut !== 'ANNULEE' && prevStatut !== 'BROUILLON';
    const newCounted = nextStatut !== 'ANNULEE' && nextStatut !== 'BROUILLON';
    if (commercialChanged || amountChanged || oldCounted !== newCounted) {
      const deltas = new Map<string, { dv: number; dc: number }>();
      const addDelta = (cid: string | undefined, dv: number, dc: number) => {
        if (!cid) return;
        const prev = deltas.get(cid) || { dv: 0, dc: 0 };
        deltas.set(cid, { dv: prev.dv + dv, dc: prev.dc + dc });
      };
      // Déduire l'ancien rattachement s'il était compté (montant + 1 contrat)
      if (oldCounted) addDelta(oldCommId, -(current.prix_client_final || 0), -1);
      // Ajouter le nouveau rattachement s'il est compté (même commercial + montant modifié → net = différence, contrat inchangé)
      if (newCounted) addDelta(newCommId, (updated.prix_client_final || 0), 1);
      if (deltas.size > 0) {
        const nextComms = crmCommerciaux.map(c => {
          const d = deltas.get(c.id);
          if (!d) return c;
          return {
            ...c,
            total_ventes: Math.max(0, (c.total_ventes || 0) + d.dv),
            contrats_clos_count: Math.max(0, (c.contrats_clos_count || 0) + d.dc)
          };
        });
        setCrmCommerciaux(nextComms);
        await db.crmCommerciaux.setItem('data', nextComms);
        for (const [cid, d] of deltas) {
          const c = nextComms.find(x => x.id === cid);
          if (c) await queueSyncAction('UPDATE_CRM_COMMERCIAL', { id: cid, total_ventes: c.total_ventes, contrats_clos_count: c.contrats_clos_count });
        }
      }
    }

    await syncCommissionsForPrestation(updated);
  };

  const deleteCrmPrestation = async (id: string) => {
    const target = crmPrestations.find(p => p.id === id);
    const next = crmPrestations.filter(p => p.id !== id);
    setCrmPrestations(next);
    await db.crmPrestations.setItem('data', next);
    await queueSyncAction('DELETE_CRM_PRESTATION', { id });
    // Décrémenter le commercial (uniquement si la commande était comptée) + supprimer les fiches de commission non payées (PAYEE conservées : trace)
    if (target?.commercial_id && target.statut !== 'ANNULEE' && target.statut !== 'BROUILLON') {
      const comm = crmCommerciaux.find(c => c.id === target.commercial_id);
      if (comm) {
        await updateCrmCommercial(comm.id, {
          total_ventes: Math.max(0, (comm.total_ventes || 0) - (target.prix_client_final || 0)),
          contrats_clos_count: Math.max(0, (comm.contrats_clos_count || 0) - 1)
        });
      }
    }
    const linked = crmCommissions.filter(c => c.prestation_id === id && c.statut !== 'PAYEE');
    if (linked.length > 0) {
      const remainingComms = crmCommissions.filter(c => !(c.prestation_id === id && c.statut !== 'PAYEE'));
      setCrmCommissions(remainingComms);
      await db.crmCommissions.setItem('data', remainingComms);
      for (const c of linked) {
        await queueSyncAction('DELETE_CRM_COMMISSION', { id: c.id });
      }
    }
  };

  const encaisserCrmPrestation = async (id: string, modeReglement: string = 'ESPECES'): Promise<boolean> => {
    const prest = crmPrestations.find(p => p.id === id);
    if (!prest) return false;
    // Idempotence : PAYEE ou CLOTUREE = déjà encaissé (l'écriture ENTREE existe), pas de 2e écriture
    if (prest.statut === 'PAYEE' || prest.statut === 'CLOTUREE') return false;
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    // 1. Marquer la prestation PAYEE (seul chemin autorisé vers PAYEE — génère l'écriture caisse)
    await updateCrmPrestation(id, {
      statut: 'PAYEE',
      date_validation: today,
      _viaEncaissement: true
    } as Partial<PrestationCommande>);

    // 2. Générer l'encaissement dans le journal de caisse (ENTREE)
    const mvtCaisse: MouvementCaisse = {
      id: uuidv4(),
      type: 'ENTREE',
      categorie: 'PRESTATION',
      montant: prest.prix_client_final,
      date_mouvement: today,
      mode_reglement: (modeReglement as ModeReglement) || 'ESPECES',
      motif: `Encaissement commande ${prest.reference} - ${prest.designation} (${prest.client_nom})`,
      module_code: 'PRESTATIONS',
      cree_par: currentUser?.id || prest.cree_par,
      cree_par_nom: currentUser?.name || prest.cree_par_nom,
      reference_piece: prest.reference,
      created_at: now
    };
    await addCrmMouvementCaisse(mvtCaisse);
    return true;
  };

  // Module 2: Dépenses & Journal de Caisse
  const addCrmMouvementCaisse = async (mvt: MouvementCaisse) => {
    const id = mvt.id || uuidv4();
    const item: MouvementCaisse = {
      ...mvt,
      id,
      montant: Number(mvt.montant) || 0,
      cree_par: mvt.cree_par || currentUser?.id || '',
      cree_par_nom: mvt.cree_par_nom || currentUser?.name,
      created_at: mvt.created_at || new Date().toISOString()
    };
    const next = [item, ...crmCaisse.filter(c => c.id !== id)];
    setCrmCaisse(next);
    await db.crmCaisse.setItem('data', next);
    await queueSyncAction('INSERT_CRM_MOUVEMENT', item);
  };

  const deleteCrmMouvementCaisse = async (id: string): Promise<boolean> => {
    // Garde anti-incohérence (miroir du garde UI CrmCaisse) : les écritures système
    // (encaissements PRESTATIONS / règlements COMMISSIONS) sont la contrepartie
    // d'une prestation ou commission — leur suppression casserait la cohérence.
    const target = crmCaisse.find(m => m.id === id);
    if (target?.module_code && target.module_code !== 'CAISSE_DEPENSES') return false;
    const next = crmCaisse.filter(c => c.id !== id);
    setCrmCaisse(next);
    await db.crmCaisse.setItem('data', next);
    await queueSyncAction('DELETE_CRM_MOUVEMENT', { id });
    return true;
  };

  // Module 7: Commissions
  const updateCrmCommissionStatus = async (id: string, status: CommissionPrestation['statut']) => {
    const current = crmCommissions.find(c => c.id === id);
    if (!current) return;
    // Garde anti-régression : une commission PAYEE ou ANNULEE est définitive,
    // et le passage au PAYEE impose payerCrmCommission (génère la SORTIE caisse).
    if ((current.statut === 'PAYEE' || current.statut === 'ANNULEE') && current.statut !== status) return;
    if (status === 'PAYEE') return;
    const next = crmCommissions.map(c => c.id === id ? { ...c, statut: status } : c);
    setCrmCommissions(next);
    await db.crmCommissions.setItem('data', next);
    await queueSyncAction('UPDATE_CRM_COMMISSION', { id, updates: { statut: status } });
  };

  const payerCrmCommission = async (id: string, modeReglement: string = 'ESPECES'): Promise<boolean> => {
    const comm = crmCommissions.find(c => c.id === id);
    if (!comm) return false;
    // Idempotence : PAYEE rejoué ou ANNULEE payée = interdit
    if (comm.statut === 'PAYEE' || comm.statut === 'ANNULEE') return false;
    // Provision : le règlement ne doit pas rendre la caisse négative
    // (même règle que la saisie manuelle d'une SORTIE en Caisse).
    const soldeCaisse = crmCaisse.reduce((s, m) => s + (m.type === 'ENTREE' ? (m.montant || 0) : -(m.montant || 0)), 0);
    if ((comm.montant || 0) > soldeCaisse) return false;
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    // Créer d'abord la SORTIE caisse pour lier les deux écritures (M13)
    const mvtId = uuidv4();
    const updatedComm: CommissionPrestation = {
      ...comm,
      statut: 'PAYEE',
      date_reglement: today,
      mode_reglement: modeReglement,
      mouvement_caisse_id: mvtId
    };
    const nextComms = crmCommissions.map(c => c.id === id ? updatedComm : c);
    setCrmCommissions(nextComms);
    await db.crmCommissions.setItem('data', nextComms);
    await queueSyncAction('UPDATE_CRM_COMMISSION', {
      id,
      updates: {
        statut: 'PAYEE',
        date_reglement: today,
        mode_reglement: modeReglement,
        mouvement_caisse_id: mvtId
      }
    });

    // Auto-create cash expense (SORTIE)
    const prest = crmPrestations.find(p => p.id === comm.prestation_id);
    const ref = prest ? prest.reference : 'COMM';
    const mvtCaisse: MouvementCaisse = {
      id: mvtId,
      type: 'SORTIE',
      categorie: 'COMMISSION',
      montant: comm.montant,
      date_mouvement: today,
      mode_reglement: (modeReglement as ModeReglement) || 'ESPECES',
      motif: `Règlement commission ${comm.type_beneficiaire} - ${ref} (${comm.beneficiaire_nom})`,
      module_code: 'COMMISSIONS',
      cree_par: currentUser?.id || '',
      cree_par_nom: currentUser?.name,
      reference_piece: ref,
      created_at: now
    };
    await addCrmMouvementCaisse(mvtCaisse);
    return true;
  };

  // Module 4: Stocks & Consommables
  const addCrmArticle = async (art: CatalogueArticle) => {
    const id = art.id || uuidv4();
    // Référence unique : suffixe en cas de collision (M9)
    let code_article = art.code_article;
    if (code_article) {
      while (crmArticles.some(a => a.code_article === code_article && a.id !== id)) {
        code_article = `${code_article.split('-bis')[0]}-bis${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }
    const item: CatalogueArticle = {
      ...art,
      id,
      code_article: code_article || art.code_article,
      quantite_stock: Math.max(0, Number(art.quantite_stock) || 0),
      seuil_alerte: Math.max(0, Number(art.seuil_alerte) || 5),
      cout_unitaire_achat: Math.max(0, Number(art.cout_unitaire_achat) || 0),
      prix_unitaire_vente: Math.max(0, Number(art.prix_unitaire_vente) || 0),
      cree_par: art.cree_par || currentUser?.id,
      cree_par_nom: art.cree_par_nom || currentUser?.name,
      created_at: art.created_at || new Date().toISOString(),
      updated_at: art.updated_at || new Date().toISOString()
    };
    const next = [item, ...crmArticles.filter(a => a.id !== id)];
    setCrmArticles(next);
    await db.crmArticles.setItem('data', next);
    await queueSyncAction('INSERT_CRM_ARTICLE', item);
  };

  const updateCrmArticle = async (id: string, art: Partial<CatalogueArticle>) => {
    const now = new Date().toISOString();
    // Clamp anti-négatif (M6/M7) : l'édition ne peut pas créer de stock ou prix négatif
    const clean: Partial<CatalogueArticle> = { ...art };
    if (clean.quantite_stock !== undefined) clean.quantite_stock = Math.max(0, Number(clean.quantite_stock) || 0);
    if (clean.seuil_alerte !== undefined) clean.seuil_alerte = Math.max(0, Number(clean.seuil_alerte) || 0);
    if (clean.cout_unitaire_achat !== undefined) clean.cout_unitaire_achat = Math.max(0, Number(clean.cout_unitaire_achat) || 0);
    if (clean.prix_unitaire_vente !== undefined) clean.prix_unitaire_vente = Math.max(0, Number(clean.prix_unitaire_vente) || 0);
    const next = crmArticles.map(a => a.id === id ? { ...a, ...clean, updated_at: now } : a);
    setCrmArticles(next);
    await db.crmArticles.setItem('data', next);
    await queueSyncAction('UPDATE_CRM_ARTICLE', { ...clean, updated_at: now, id });
  };

  const deleteCrmArticle = async (id: string) => {
    const next = crmArticles.filter(a => a.id !== id);
    setCrmArticles(next);
    await db.crmArticles.setItem('data', next);
    await queueSyncAction('DELETE_CRM_ARTICLE', { id });
  };

  // Journal des mouvements de stock métier (traçabilité, ajout seul) :
  // chaque création / ajustement / suppression d'article y laisse une trace
  // synchronisée (table mouvements_stock). Immuable côté UI (pas de delete).
  const addCrmStockMouvement = async (mvt: Omit<MouvementStock, 'id' | 'created_at'> & { id?: string }) => {
    const item: MouvementStock = {
      ...mvt,
      id: mvt.id || uuidv4(),
      quantite: Math.max(0, Number(mvt.quantite) || 0),
      stock_avant: Math.max(0, Number(mvt.stock_avant) || 0),
      stock_apres: Math.max(0, Number(mvt.stock_apres) || 0),
      cree_par: mvt.cree_par || currentUser?.id,
      cree_par_nom: mvt.cree_par_nom || currentUser?.name,
      created_at: new Date().toISOString()
    };
    const next = [item, ...crmStockMouvements];
    setCrmStockMouvements(next);
    await db.crmStockMouvements.setItem('data', next);
    await queueSyncAction('INSERT_CRM_STOCK_MOUVEMENT', item);
  };

  // Module 3: Maintenance & Interventions
  const addCrmIntervention = async (interv: InterventionMaintenance) => {
    const id = interv.id || uuidv4();
    const now = new Date();
    const year = now.getFullYear();
    const seq = (crmMaintenance.length + 1).toString().padStart(4, '0');
    // Référence unique : suffixe en cas de collision (M9)
    let reference = interv.reference || `MNT-${year}-${seq}`;
    while (crmMaintenance.some(m => m.reference === reference)) {
      reference = `${reference.split('-bis')[0]}-bis${Math.floor(1000 + Math.random() * 9000)}`;
    }
    const quantite = Math.max(1, Math.round(Number(interv.quantite) || 1));
    const prix_unitaire = Math.max(0, Number(interv.prix_unitaire) || 0);
    const prix_total = quantite * prix_unitaire;

    const item: InterventionMaintenance = {
      ...interv,
      id,
      reference,
      quantite,
      prix_unitaire,
      prix_total,
      // Colonne legacy NOT NULL cote serveur : miroir du total facture
      prix: prix_total,
      priorite: interv.priorite || 'MOYENNE',
      statut: interv.statut || 'NOUVEAU',
      cree_par: interv.cree_par || currentUser?.id || '',
      cree_par_nom: interv.cree_par_nom || currentUser?.name,
      created_at: interv.created_at || now.toISOString(),
      updated_at: interv.updated_at || now.toISOString()
    };
    const next = [item, ...crmMaintenance.filter(m => m.id !== id)];
    setCrmMaintenance(next);
    await db.crmMaintenance.setItem('data', next);
    await queueSyncAction('INSERT_CRM_INTERVENTION', item);
  };

  const updateCrmIntervention = async (id: string, interv: Partial<InterventionMaintenance>) => {
    const now = new Date().toISOString();
    const current = crmMaintenance.find(m => m.id === id);
    const quantite = Math.max(1, Math.round(interv.quantite !== undefined ? Number(interv.quantite) : (current?.quantite || 1)) || 1);
    const prix_unitaire = Math.max(0, interv.prix_unitaire !== undefined ? Number(interv.prix_unitaire) : (current?.prix_unitaire || 0));
    const prix_total = quantite * prix_unitaire;

    const next = crmMaintenance.map(m => m.id === id ? { ...m, ...interv, quantite, prix_unitaire, prix_total, prix: prix_total, updated_at: now } : m);
    setCrmMaintenance(next);
    await db.crmMaintenance.setItem('data', next);
    await queueSyncAction('UPDATE_CRM_INTERVENTION', { ...interv, quantite, prix_unitaire, prix_total, prix: prix_total, updated_at: now, id });
  };

  const deleteCrmIntervention = async (id: string) => {
    const next = crmMaintenance.filter(m => m.id !== id);
    setCrmMaintenance(next);
    await db.crmMaintenance.setItem('data', next);
    await queueSyncAction('DELETE_CRM_INTERVENTION', { id });
  };

  const addCrmTechnicien = async (tech: TechnicienMaintenance) => {
    const id = tech.id || uuidv4();
    const item: TechnicienMaintenance = {
      ...tech,
      id,
      statut: tech.statut || 'DISPONIBLE',
      cree_par: tech.cree_par || currentUser?.id || '',
      cree_par_nom: tech.cree_par_nom || currentUser?.name,
      created_at: tech.created_at || new Date().toISOString(),
      updated_at: tech.updated_at || new Date().toISOString()
    };
    const next = [item, ...crmTechniciens.filter(t => t.id !== id)];
    setCrmTechniciens(next);
    await db.crmTechniciens.setItem('data', next);
    await queueSyncAction('INSERT_CRM_TECHNICIEN', item);
  };

  const updateCrmTechnicien = async (id: string, tech: Partial<TechnicienMaintenance>) => {
    const now = new Date().toISOString();
    const current = crmTechniciens.find(t => t.id === id);
    const next = crmTechniciens.map(t => t.id === id ? { ...t, ...tech, updated_at: now } : t);
    setCrmTechniciens(next);
    await db.crmTechniciens.setItem('data', next);
    await queueSyncAction('UPDATE_CRM_TECHNICIEN', { ...tech, updated_at: now, id });
    // Propagation du renommage vers les tickets (assignation par nom, M2)
    if (tech.nom && current && tech.nom.trim() !== '' && current.nom !== tech.nom) {
      const oldNom = current.nom;
      const newNom = tech.nom;
      const nextTickets = crmMaintenance.map(m => m.technicien_assigne === oldNom ? { ...m, technicien_assigne: newNom } : m);
      const changed = nextTickets.filter((m, i) => m !== crmMaintenance[i]);
      if (changed.length > 0) {
        setCrmMaintenance(nextTickets);
        await db.crmMaintenance.setItem('data', nextTickets);
        for (const m of changed) {
          await queueSyncAction('UPDATE_CRM_INTERVENTION', { id: m.id, technicien_assigne: newNom, updated_at: now });
        }
      }
    }
  };

  const deleteCrmTechnicien = async (id: string): Promise<boolean> => {
    // Garde anti-orphelin (miroir du garde UI CrmMaintenance) : technicien assigné = suppression interdite
    const target = crmTechniciens.find(t => t.id === id);
    if (target && crmMaintenance.some(m => m.technicien_assigne === target.nom)) return false;
    const next = crmTechniciens.filter(t => t.id !== id);
    setCrmTechniciens(next);
    await db.crmTechniciens.setItem('data', next);
    await queueSyncAction('DELETE_CRM_TECHNICIEN', { id });
    return true;
  };

  // Helper statut facture
  const computeInvoiceStatus = (totalAmount: number, paidAmount: number, dueDate: string, currentStatus?: InvoiceStatus): InvoiceStatus => {
    if (currentStatus === 'ANNULÉE') return 'ANNULÉE';
    if (currentStatus === 'BROUILLON') return 'BROUILLON';
    if (paidAmount >= totalAmount && totalAmount > 0) return 'PAYÉE';
    if (paidAmount > 0) return 'PARTIELLEMENT_PAYÉE';
    if (dueDate) {
      const today = new Date().toISOString().split('T')[0];
      if (today > dueDate) return 'EN_RETARD';
    }
    return 'ÉMISE';
  };

  const buildDbInvoice = (inv: Invoice): any => ({
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    quote_id: inv.quoteId || null,
    client_id: inv.clientId || null,
    client_nom: inv.clientName || null,
    commercial_id: inv.commercialId || null,
    commercial_nom: inv.commercialName || null,
    service_id: inv.serviceId || null,
    service_nom: inv.serviceName || null,
    category: inv.category || null,
    period_year: inv.periodYear,
    period_month: inv.periodMonth,
    issue_date: inv.issueDate,
    delivery_date: inv.deliveryDate || null,
    payment_date: inv.paymentDate || null,
    payment_terms: inv.paymentTerms || '30 jours',
    due_date: inv.dueDate,
    subtotal: inv.subtotal,
    tax_amount: inv.taxAmount || 0,
    discount_amount: inv.discountAmount || 0,
    total_amount: inv.totalAmount,
    cost_amount: inv.costAmount || 0,
    commission_rate: inv.commissionRate ?? 10,
    commission_amount: inv.commissionAmount || 0,
    gross_margin: inv.grossMargin || 0,
    hinov_margin: inv.hinovMargin || 0,
    amount_paid: inv.amountPaid || 0,
    remaining_amount: inv.remainingAmount,
    status: inv.status,
    notes: inv.notes || null,
    created_by: inv.createdBy || null,
    created_at: inv.createdAt,
    updated_at: inv.updatedAt
  });

  const addInvoice = async (invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'> | Invoice): Promise<Invoice> => {
    const id = ('id' in invoiceData && invoiceData.id) ? invoiceData.id : uuidv4();
    const now = new Date().toISOString();
    
    // Calculs de rentabilité et suivi (marge brute bornée à 0, même règle que l'UI Factures)
    const totalAmount = Number(invoiceData.totalAmount) || 0;
    const costAmount = Number(invoiceData.costAmount) || 0;
    const grossMargin = Math.max(0, totalAmount - costAmount);
    const commissionRate = invoiceData.commissionRate !== undefined ? Number(invoiceData.commissionRate) : 10;
    const commissionAmount = grossMargin > 0 ? Math.round(grossMargin * (commissionRate / 100)) : 0;
    const hinovMargin = Math.max(0, grossMargin - commissionAmount);

    // Détermination de la période
    const d = invoiceData.deliveryDate || invoiceData.issueDate || now;
    const dateObj = new Date(d);
    const periodYear = invoiceData.periodYear || (isNaN(dateObj.getFullYear()) ? new Date().getFullYear() : dateObj.getFullYear());
    const periodMonth = invoiceData.periodMonth || (isNaN(dateObj.getMonth()) ? new Date().getMonth() + 1 : dateObj.getMonth() + 1);

    const amountPaid = invoiceData.amountPaid !== undefined ? Number(invoiceData.amountPaid) : 0;
    const remainingAmount = invoiceData.remainingAmount !== undefined ? Number(invoiceData.remainingAmount) : Math.max(0, totalAmount - amountPaid);

    const newInvoice: Invoice = {
      ...invoiceData,
      id,
      periodYear,
      periodMonth,
      totalAmount,
      costAmount,
      grossMargin,
      commissionRate,
      commissionAmount,
      hinovMargin,
      amountPaid,
      remainingAmount,
      status: invoiceData.status || (remainingAmount === 0 && totalAmount > 0 ? 'PAYÉE' : (amountPaid > 0 ? 'PARTIELLEMENT_PAYÉE' : 'ÉMISE')),
      createdBy: invoiceData.createdBy || currentUser?.id,
      createdAt: now,
      updatedAt: now,
      items: (invoiceData.items || []).map(item => ({
        ...item,
        id: item.id || uuidv4(),
        invoiceId: id
      }))
    };

    const next = [newInvoice, ...invoices.filter(i => i.id !== id)];
    setInvoices(next);
    await db.invoices.setItem('data', next);

    // Persistance serveur via file de synchro (offline-first, idempotent, regen anti-collision).
    const dbItems = (newInvoice.items || []).map(it => ({
      id: it.id,
      invoice_id: id,
      prestation_id: it.prestationId || null,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      cost_price: it.costPrice || 0,
      discount_percent: it.discountPercent || 0,
      tax_rate: it.taxRate || 0,
      total: it.total,
      created_at: it.createdAt || now
    }));
    await queueSyncAction('UPSERT_INVOICE', { invoice: buildDbInvoice(newInvoice), items: dbItems, replaceItems: true });

    return newInvoice;
  };

  const updateInvoice = async (id: string, data: Partial<Invoice>) => {
    const existing = invoices.find(i => i.id === id);
    if (!existing) return;
    const now = new Date().toISOString();

    const totalAmount = data.totalAmount !== undefined ? Number(data.totalAmount) : (existing.totalAmount || 0);
    const costAmount = data.costAmount !== undefined ? Number(data.costAmount) : (existing.costAmount || 0);
    const grossMargin = Math.max(0, totalAmount - costAmount);
    const commissionRate = data.commissionRate !== undefined ? Number(data.commissionRate) : (existing.commissionRate ?? 10);
    const commissionAmount = grossMargin > 0 ? Math.round(grossMargin * (commissionRate / 100)) : 0;
    const hinovMargin = Math.max(0, grossMargin - commissionAmount);
    const amountPaid = data.amountPaid !== undefined ? Number(data.amountPaid) : (existing.amountPaid || 0);
    const remainingAmount = data.remainingAmount !== undefined ? Number(data.remainingAmount) : Math.max(0, totalAmount - amountPaid);

    const updated: Invoice = {
      ...existing,
      ...data,
      id,
      totalAmount,
      costAmount,
      grossMargin,
      commissionRate,
      commissionAmount,
      hinovMargin,
      amountPaid,
      remainingAmount,
      updatedAt: now
    };

    const next = invoices.map(i => i.id === id ? updated : i);
    setInvoices(next);
    await db.invoices.setItem('data', next);

    // Ligne complete pour l'upsert file (pas de partiel : upsert = ligne entiere).
    const itemsPayload = data.items
      ? data.items.map(it => ({
          id: it.id || uuidv4(),
          invoice_id: id,
          prestation_id: it.prestationId || null,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          cost_price: it.costPrice || 0,
          discount_percent: it.discountPercent || 0,
          tax_rate: it.taxRate || 0,
          total: it.total,
          created_at: it.createdAt || now
        }))
      : undefined;
    await queueSyncAction('UPSERT_INVOICE', { invoice: buildDbInvoice(updated), items: itemsPayload, replaceItems: data.items !== undefined });
  };

  const updateInvoiceStatus = async (id: string, status: InvoiceStatus) => {
    const now = new Date().toISOString();
    const target = invoices.find(i => i.id === id);
    const next = invoices.map(i => i.id === id ? { ...i, status, updatedAt: now } : i);
    setInvoices(next);
    await db.invoices.setItem('data', next);

    if (target) {
      await queueSyncAction('UPSERT_INVOICE', {
        invoice: buildDbInvoice({ ...target, status, updatedAt: now })
      });
    }
  };

  const deleteInvoice = async (id: string) => {
    const nextInvoices = invoices.filter(i => i.id !== id);
    const nextPayments = invoicePayments.filter(p => p.invoiceId !== id);
    setInvoices(nextInvoices);
    setInvoicePayments(nextPayments);
    await db.invoices.setItem('data', nextInvoices);
    await db.invoicePayments.setItem('data', nextPayments);

    await queueSyncAction('DELETE_INVOICE', { id });
  };

  const addInvoicePayment = async (paymentData: Omit<InvoicePayment, 'id' | 'createdAt'> | InvoicePayment): Promise<InvoicePayment> => {
    const id = ('id' in paymentData && paymentData.id) ? paymentData.id : uuidv4();
    const now = new Date().toISOString();
    
    const targetInvoice = invoices.find(i => i.id === paymentData.invoiceId);
    const existingPaymentsForInvoice = invoicePayments.filter(p => p.invoiceId === paymentData.invoiceId);
    const totalPaidBefore = existingPaymentsForInvoice.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    // Base = max(somme des lignes, montant déjà suivi) : préserve un « Total Déjà Payé »
    // saisi manuellement (import Excel / seed) qui n'a pas encore de lignes de règlement.
    const paidBase = Math.max(totalPaidBefore, Number(targetInvoice?.amountPaid) || 0);
    const newTotalPaid = paidBase + (Number(paymentData.amount) || 0);

    const seq = (invoicePayments.length + 1).toString().padStart(4, '0');
    const paymentNumber = paymentData.paymentNumber || `PAY-${new Date().getFullYear()}-${seq}`;

    const newPayment: InvoicePayment = {
      ...paymentData,
      id,
      paymentNumber,
      amount: Number(paymentData.amount) || 0,
      paymentDate: paymentData.paymentDate || now.split('T')[0],
      paymentMethod: paymentData.paymentMethod || 'Espèces',
      createdBy: paymentData.createdBy || currentUser?.id,
      createdAt: now
    };

    const nextPayments = [newPayment, ...invoicePayments];
    setInvoicePayments(nextPayments);
    await db.invoicePayments.setItem('data', nextPayments);

    // Mise à jour automatique du statut ET des montants de la facture (source unique).
    // La date de paiement affichée (colonne DATE PAIEM.) suit le dernier encaissement.
    if (targetInvoice) {
      const newStatus = computeInvoiceStatus(targetInvoice.totalAmount, newTotalPaid, targetInvoice.dueDate, targetInvoice.status);
      const updatedInvoice: Invoice = {
        ...targetInvoice,
        status: newStatus,
        amountPaid: newTotalPaid,
        remainingAmount: Math.max(0, (targetInvoice.totalAmount || 0) - newTotalPaid),
        paymentDate: newPayment.paymentDate,
        updatedAt: now
      };
      const nextInvoices = invoices.map(i => i.id === targetInvoice.id ? updatedInvoice : i);
      setInvoices(nextInvoices);
      await db.invoices.setItem('data', nextInvoices);
    }

    const dbPayment = {
      id: newPayment.id,
      invoice_id: newPayment.invoiceId,
      payment_number: newPayment.paymentNumber,
      payment_date: newPayment.paymentDate,
      amount: newPayment.amount,
      payment_method: newPayment.paymentMethod,
      reference: newPayment.reference || null,
      notes: newPayment.notes || null,
      created_by: newPayment.createdBy || null,
      created_at: newPayment.createdAt
    };
    // Action unique : le règlement + la mise à jour des totaux voyagent ensemble,
    // le worker ne valide que si les deux écritures cloud réussissent (rejeu sinon).
    await queueSyncAction('UPSERT_INVOICE_PAYMENT', {
      payment: dbPayment,
      invoiceUpdate: targetInvoice ? buildDbInvoice({
        ...targetInvoice,
        status: computeInvoiceStatus(targetInvoice.totalAmount, newTotalPaid, targetInvoice.dueDate, targetInvoice.status),
        amountPaid: newTotalPaid,
        remainingAmount: Math.max(0, (targetInvoice.totalAmount || 0) - newTotalPaid),
        paymentDate: newPayment.paymentDate,
        updatedAt: now
      }) : undefined
    });

    return newPayment;
  };

  const deleteInvoicePayment = async (paymentId: string) => {
    const payment = invoicePayments.find(p => p.id === paymentId);
    const nextPayments = invoicePayments.filter(p => p.id !== paymentId);
    setInvoicePayments(nextPayments);
    await db.invoicePayments.setItem('data', nextPayments);

    if (payment) {
      const targetInvoice = invoices.find(i => i.id === payment.invoiceId);
      let invoiceUpdate: any = undefined;
      if (targetInvoice) {
        const remainingPayments = nextPayments.filter(p => p.invoiceId === targetInvoice.id);
        const totalPaid = remainingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const newStatus = computeInvoiceStatus(targetInvoice.totalAmount, totalPaid, targetInvoice.dueDate, targetInvoice.status);
        const now = new Date().toISOString();
        const updatedInvoice: Invoice = {
          ...targetInvoice,
          status: newStatus,
          amountPaid: totalPaid,
          remainingAmount: Math.max(0, (targetInvoice.totalAmount || 0) - totalPaid),
          // Dernier encaissement supprimé : plus aucune date de règlement avérée.
          paymentDate: remainingPayments.length === 0 ? undefined : targetInvoice.paymentDate,
          updatedAt: now
        };
        const nextInvoices = invoices.map(i => i.id === targetInvoice.id ? updatedInvoice : i);
        setInvoices(nextInvoices);
        await db.invoices.setItem('data', nextInvoices);

        invoiceUpdate = buildDbInvoice(updatedInvoice);
      }

      await queueSyncAction('DELETE_INVOICE_PAYMENT', { id: paymentId, invoiceUpdate });
    }
  };

  return (
    <AppContext.Provider value={{
      users, clients, quotes, sales, facturePaiements, couts, commissions, installments, scoringRules, objectifs, classements, primes, primeAuditLogs, prospects, prospectActivities, prospectFollowUps, categories, settings, services, prestations, loading, activityReports, weeklyReports, v2DailyReports, v2WeeklyReports, notifications, crmDocuments, crmFolders, posCategories, posBrands, posSuppliers, posProducts, posStockEntries, posStockMovements, posInventories, posCashSessions, posTransactions, posPayments, posDiscounts, posSettings, posReturns, posWorkspace, setPosWorkspace, suspendedCarts, addSuspendedCart, removeSuspendedCart, addClient, updateClient, deleteClient, recordPayment, addCout, updateCout, deleteCout, addObjectif, updateObjectif, deleteObjectif, proposePrime, validatePrime, rejectPrime, payPrime, updateScoringRule, addQuote, updateQuote, updateQuoteStatus, deleteQuote, addSale, updateSaleStatus, updateSale, deleteSale, recordInstallmentPayment, saveInstallmentsForSale, addCommission, updateCommissionStatus, deleteCommission, addProspect, updateProspect, deleteProspect, convertProspect, addProspectActivity, deleteProspectActivity, addProspectFollowUp, updateProspectFollowUp, deleteProspectFollowUp, upsertActivityReport, deleteActivityReport, saveWeeklyReport, markWeeklyReportSent, markWeeklyReportRead, markNotificationAsRead, markAllNotificationsAsRead, saveV2DailyReport, saveV2WeeklyReport, submitV2WeeklyReport, sendWeeklyReportReminder, reviewV2WeeklyReport, deleteV2WeeklyReport, deleteV2DailyReport, updateMyProfile, addCrmDocument, updateCrmDocument, deleteCrmDocument, downloadCrmDocument, getCrmDocumentBlob, addCrmFolder, updateCrmFolder, deleteCrmFolder, addCategory, deleteCategory, updateSettings, addUser, updateUser, toggleUserStatus, deleteUser, addPrestation, updatePrestation, deletePrestation, addService, updateService, deleteService, addPosCategory, updatePosCategory, deletePosCategory, addPosBrand, updatePosBrand, deletePosBrand, addPosSupplier, updatePosSupplier, deletePosSupplier, addPosProduct, updatePosProduct, deletePosProduct, mergePosProducts, repairLocalCatalog, findProductByBarcode, findProductByReference, searchProducts, getIncompleteProducts, updateProductBarcode, updateProductImage, importProducts, addPosStockEntry, updatePosStockEntry, deletePosStockEntry, addPosStockMovement, addPosInventory, updatePosInventory, deletePosInventory, addPosCashSession, updatePosCashSession, addPosTransaction, updatePosTransaction, voidPosTransaction, clearPosSalesHistory, deletePosMovementsByDateRange, addPosDiscount, updatePosDiscount, deletePosDiscount, updatePosSettings, addPosReturn, updatePosReturn, cancelPosReturn, productCompletions, importSessions, addProductCompletion, updateProductCompletion, deleteProductCompletion, addImportSession, updateImportSession, deleteImportSession, addImportError, completeProduct, refreshData, reconcilePosData: (opts?: { force?: boolean }) => reconcileLocalPosDataWithCloud(opts),
      // CRM Modules Responsables
      crmTiers, crmCommerciaux, crmPrestations, crmCaisse, crmCommissions, crmArticles, crmStockMouvements, crmMaintenance, crmTechniciens,
      addCrmTier, updateCrmTier, deleteCrmTier,
      addCrmCommercial, updateCrmCommercial, deleteCrmCommercial,
      addCrmPrestation, updateCrmPrestation, deleteCrmPrestation, encaisserCrmPrestation,
      addCrmMouvementCaisse, deleteCrmMouvementCaisse,
      updateCrmCommissionStatus, payerCrmCommission,
      addCrmArticle, updateCrmArticle, deleteCrmArticle, addCrmStockMouvement,
      addCrmIntervention, updateCrmIntervention, deleteCrmIntervention,
      addCrmTechnicien, updateCrmTechnicien, deleteCrmTechnicien,
      // Module Facturation Client
      invoices, invoicePayments,
      addInvoice, updateInvoice, updateInvoiceStatus, deleteInvoice,
      addInvoicePayment, deleteInvoicePayment
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};

