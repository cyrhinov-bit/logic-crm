// Module indépendant : suivi des factures fournisseurs.
// Aucun import depuis AppContext / sync / autres modules métier.
// Seules dépendances partagées : supabase client, AuthContext (identité), UI générique.

export type SupInvoiceStatus =
  | 'BROUILLON'
  | 'REÇUE'
  | 'VALIDÉE'
  | 'PARTIELLEMENT_PAYÉE'
  | 'PAYÉE'
  | 'EN_RETARD'
  | 'LITIGE'
  | 'ANNULÉE';

export const SUP_INVOICE_STATUSES: SupInvoiceStatus[] = [
  'BROUILLON',
  'REÇUE',
  'VALIDÉE',
  'PARTIELLEMENT_PAYÉE',
  'PAYÉE',
  'EN_RETARD',
  'LITIGE',
  'ANNULÉE',
];

export const SUP_PAYMENT_METHODS = [
  'Espèces',
  'Virement',
  'Chèque',
  'Mobile Money',
  'Autre',
] as const;

export interface SupSupplier {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  nif?: string;
  address?: string;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupInvoice {
  id: string;
  supplierId?: string;
  /** Snapshot du nom — affichage même si le fournisseur est supprimé. */
  supplierName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  amountHt: number;
  vatAmount: number;
  amountTtc: number;
  status: SupInvoiceStatus;
  paymentMethod?: string;
  description?: string;
  attachmentName?: string;
  attachmentMime?: string;
  /** Base64 (petits fichiers < 2.5 Mo). Stockage inline = zéro dépendance Storage. */
  attachmentData?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupPayment {
  id: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
  method?: string;
  reference?: string;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
}

export const SUP_ATTACHMENT_MAX_BYTES = 2.5 * 1024 * 1024;
