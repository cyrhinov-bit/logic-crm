export type TypeTier = 'CLIENT' | 'FOURNISSEUR' | 'PARTENAIRE';
export type TierType = TypeTier;

export interface ClientFournisseur {
  id: string;
  type: TypeTier;
  nom: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  ville?: string;
  cree_par?: string;
  cree_par_nom?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AgentCommercial {
  id: string;
  nom: string;
  telephone?: string;
  email?: string;
  taux_commission_defaut: number; // e.g. 5.0
  total_ventes?: number;
  contrats_clos_count?: number;
  cree_par?: string;
  cree_par_nom?: string;
  created_at?: string;
  updated_at?: string;
}

export type StatutPrestation = 
  | 'BROUILLON' 
  | 'EN_ATTENTE_VALIDATION' 
  | 'VALIDE' 
  | 'EN_COURS_EXECUTION' 
  | 'LIVREE' 
  | 'PAYEE' 
  | 'CLOTUREE' 
  | 'ANNULEE'
  | 'DEVIS'
  | 'CONFIRMEE'
  | 'EN_COURS'
  | 'FACTUREE';

export type PrestationStatut = StatutPrestation;

export interface PrestationCommande {
  id: string;
  reference: string;
  client_id?: string;
  client_nom: string;
  commercial_id?: string;
  commercial_nom?: string;
  apporteur_id?: string;
  apporteur_nom?: string;
  resp_service_id?: string;
  resp_service_nom?: string;
  responsable_service_id?: string;
  responsable_service_nom?: string;
  designation: string;
  quantite: number;
  cout_unitaire_achat: number;
  cout_final_achat: number;
  cout_total_revient?: number;
  prix_vente_unitaire: number;
  prix_client_final: number;
  montant_total_vente?: number;
  marge_interne: number;
  taux_commission_app?: number;
  commission_apporteur_taux?: number;
  commission_apporteur?: number;
  commission_apporteur_montant?: number;
  // Mode de saisie des commissions responsable / commercial : 'MONTANT' (forfait FCFA)
  // ou 'TAUX' (pourcentage appliqué sur la marge interne).
  // Règle métier : apporteur = prix_client_final * taux / 100 ;
  // responsable & commercial = montant direct OU marge_interne * taux / 100.
  taux_commission_resp?: number;
  mode_commission_resp?: 'MONTANT' | 'TAUX';
  taux_commission_agent?: number;
  mode_commission_agent?: 'MONTANT' | 'TAUX';
  commission_resp_service?: number;
  commission_responsable_montant?: number;
  commission_agent?: number;
  commission_commercial_montant?: number;
  benefice_net: number;
  benefice_reel?: number;
  statut: StatutPrestation;
  cree_par?: string;
  cree_par_nom?: string;
  date_creation?: string;
  date_commande?: string;
  date_validation?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export type TypeMouvementCaisse = 'ENTREE' | 'SORTIE';
export type MouvementCaisseType = TypeMouvementCaisse;
export type ModeReglement = 'ESPECES' | 'CHEQUE' | 'VIREMENT' | 'MOBILE_MONEY';
export type CaisseModeReglement = ModeReglement;

export type CaisseCategorieSortie = 
  | 'ACHATS' 
  | 'FRAIS_GENERAUX' 
  | 'LOYER' 
  | 'CARBURANT' 
  | 'ELECTRICITE_EAU' 
  | 'SALAIRES' 
  | 'COMMISSION' 
  | 'TRANSPORT' 
  | 'MAINTENANCE' 
  | 'RESTAURATION' 
  | 'AUTRE';

export type CaisseCategorieEntree = 
  | 'PRESTATION' 
  | 'ACOMPTE_CLIENT' 
  | 'APPART_CAPITAL' 
  | 'REMBOURSEMENT' 
  | 'AUTRE';

export type CaisseCategorie = CaisseCategorieSortie | CaisseCategorieEntree | string;

export interface MouvementCaisse {
  id: string;
  type: TypeMouvementCaisse;
  categorie: string;
  montant: number;
  date_mouvement: string;
  mode_reglement: ModeReglement;
  motif: string;
  module_code?: string;
  tier_id?: string;
  tier_type?: string;
  beneficiaire_emetteur?: string;
  reference_piece?: string;
  date?: string;
  cree_par?: string;
  cree_par_nom?: string;
  created_at?: string;
  updated_at?: string;
}

export type TypeBeneficiaire = 'APPORTEUR' | 'AGENT_COMMERCIAL' | 'RESPONSABLE';
export type CommissionType = TypeBeneficiaire;
export type StatutCommission = 'EN_ATTENTE' | 'VALIDEE' | 'PAYEE' | 'ANNULEE' | 'A_VALIDER' | 'A_PAYER';
export type CommissionStatut = StatutCommission;

export interface CommissionPrestation {
  id: string;
  prestation_id: string;
  prestation_ref?: string;
  type_beneficiaire: TypeBeneficiaire;
  type?: TypeBeneficiaire;
  beneficiaire_id?: string;
  beneficiaire_nom: string;
  montant: number;
  montant_prestation?: number;
  montant_commission?: number;
  statut: StatutCommission;
  date_reglement?: string;
  mode_reglement?: string;
  mouvement_caisse_id?: string;
  cree_par?: string;
  created_at?: string;
  updated_at?: string;
}

export type ArticleType = 'CONSOMMABLE' | 'EQUIPEMENT' | 'PIECE_DETACHEE' | 'MATERIEL' | string;

export interface CatalogueArticle {
  id: string;
  code_article: string;
  designation: string;
  categorie?: string;
  type_article?: ArticleType;
  quantite_stock: number;
  seuil_alerte: number;
  cout_unitaire_achat: number;
  prix_unitaire_vente: number;
  unite?: string;
  fournisseur_id?: string;
  cree_par?: string;
  cree_par_nom?: string;
  created_at?: string;
  updated_at?: string;
}

export type TypeMouvementStock = 'CREATION' | 'ENTREE' | 'SORTIE' | 'AJUSTEMENT' | 'SUPPRESSION';

// Journal des mouvements de stock métier (traçabilité, ajout seul).
export interface MouvementStock {
  id: string;
  article_id?: string;
  article_code?: string;
  type: TypeMouvementStock;
  quantite: number;
  stock_avant: number;
  stock_apres: number;
  motif?: string;
  cree_par?: string;
  cree_par_nom?: string;
  created_at?: string;
}

export type StatutIntervention = 
  | 'NOUVEAU' 
  | 'EN_ATTENTE_PIECE' 
  | 'EN_COURS' 
  | 'TERMINE_A_FACTURER' 
  | 'CLOTURE' 
  | 'ANNULE'
  | 'EN_ATTENTE'
  | 'TERMINEE'
  | 'ANNULEE';

export type MaintenanceStatut = StatutIntervention;

export type PrioriteIntervention = 'BASSE' | 'MOYENNE' | 'HAUTE' | 'URGENTE';
export type MaintenancePriorite = PrioriteIntervention;

export interface InterventionMaintenance {
  id: string;
  reference: string;
  client_id?: string;
  client_nom?: string;
  site_agence: string;
  utilisateur_concerne?: string;
  equipement: string;
  priorite: PrioriteIntervention;
  observation?: string;
  travaux?: string;
  quantite: number;
  prix_unitaire: number;
  prix_total: number;
  prix?: number;
  technicien_assigne: string;
  statut: StatutIntervention;
  date_intervention?: string;
  cree_par?: string;
  cree_par_nom?: string;
  created_at?: string;
  updated_at?: string;
}

export type StatutTechnicien = 'DISPONIBLE' | 'EN_INTERVENTION' | 'CONGE' | 'INACTIF';

export interface TechnicienMaintenance {
  id: string;
  nom: string;
  telephone?: string;
  email?: string;
  specialite?: string;
  statut: StatutTechnicien;
  cree_par?: string;
  cree_par_nom?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Module Facturation Client (HINOV CRM) ───────────────────────────
export type InvoiceStatus = 'BROUILLON' | 'ÉMISE' | 'PARTIELLEMENT_PAYÉE' | 'PAYÉE' | 'EN_RETARD' | 'ANNULÉE';

export interface InvoiceItem {
  id: string;
  invoice_id?: string;
  invoiceId?: string;
  prestation_id?: string;
  prestationId?: string;
  description: string;
  quantity: number;
  unit_price?: number;
  unitPrice: number;
  cost_price?: number;
  costPrice?: number;
  discount_percent?: number;
  discountPercent?: number;
  tax_rate?: number;
  taxRate?: number;
  total: number;
  created_at?: string;
  createdAt?: string;
}

export interface InvoicePayment {
  id: string;
  invoice_id?: string;
  invoiceId: string;
  payment_number?: string;
  paymentNumber?: string;
  payment_date?: string;
  paymentDate: string;
  amount: number;
  payment_method?: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  created_by?: string;
  createdBy?: string;
  created_at?: string;
  createdAt?: string;
}

export interface Invoice {
  id: string;
  invoice_number?: string;
  invoiceNumber: string;
  quote_id?: string;
  quoteId?: string;
  client_id?: string;
  clientId: string;
  client_nom?: string;
  clientName?: string;
  commercial_id?: string;
  commercialId?: string;
  commercial_nom?: string;
  commercialName?: string;
  service_id?: string;
  serviceId?: string;
  service_nom?: string;
  serviceName?: string;
  category?: string;
  period_year?: number;
  periodYear?: number;
  period_month?: number;
  periodMonth?: number;
  issue_date?: string;
  issueDate: string;
  delivery_date?: string;
  deliveryDate?: string;
  payment_date?: string;
  paymentDate?: string;
  payment_terms?: string;
  paymentTerms: string;
  due_date?: string;
  dueDate: string;
  subtotal: number;
  tax_amount?: number;
  taxAmount?: number;
  discount_amount?: number;
  discountAmount?: number;
  total_amount?: number;
  totalAmount: number;
  cost_amount?: number;
  costAmount?: number;
  commission_rate?: number;
  commissionRate?: number;
  commission_amount?: number;
  commissionAmount?: number;
  gross_margin?: number;
  grossMargin?: number;
  hinov_margin?: number;
  hinovMargin?: number;
  amount_paid?: number;
  amountPaid?: number;
  remaining_amount?: number;
  remainingAmount?: number;
  status: InvoiceStatus;
  notes?: string;
  created_by?: string;
  createdBy?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  items?: InvoiceItem[];
  payments?: InvoicePayment[];
}


