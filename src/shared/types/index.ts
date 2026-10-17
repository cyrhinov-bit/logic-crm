import type { SupabaseClient } from '@supabase/supabase-js';

export type PlatformTarget = 'web' | 'desktop' | 'mobile';

export interface SharedAppConfig {
  appName: string;
  target: PlatformTarget;
  apiBaseUrl: string;
}

export interface SharedUser {
  id: string;
  name: string;
  email: string;
  role: 'Directeur' | 'Responsable' | 'Commercial' | 'Gerant' | 'Caissier';
  serviceId?: string;
  pin: string;
  lastLogin: string;
  active: boolean;
}

export interface SharedClient {
  id: string;
  name: string;
  email: string;
  phone: string;
  contact: string;
  company: string;
  address: string;
  status?: string;
  commercialId?: string;
}

export interface SharedQuoteLine {
  id: string;
  prestationId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  discountPercent?: number;
}

export interface SharedQuote {
  id: string;
  quoteNumber: string;
  clientId: string;
  commercialId: string;
  serviceId?: string;
  subject: string;
  lines: SharedQuoteLine[];
  subtotal: number;
  total: number;
  status: 'Brouillon' | 'Envoyé' | 'Accepté' | 'Refusé' | 'Révision';
  date: string;
  style?: 'Classique' | 'Moderne' | 'Minimaliste';
  accentColor?: string;
  discountPercent?: number;
  discountAmount?: number;
  clientComment?: string;
}

export interface SharedSaleLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  costPrice?: number;
  total: number;
}

export interface SharedSale {
  id: string;
  saleNumber: string;
  quoteId?: string;
  clientId: string;
  serviceId?: string;
  lines: SharedSaleLine[];
  subtotal: number;
  total: number;
  status: 'Enregistrée' | 'Payée' | 'Annulée';
  date: string;
  notes?: string;
}

export interface SharedCommission {
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
  status: 'En attente' | 'Validée' | 'Payée';
  createdAt: string;
}

export interface SharedProspect {
  id: string;
  prospectNumber: string;
  commercialId: string;
  serviceId?: string;
  categoryId?: string;
  type: 'Entreprise' | 'Particulier';
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  source?: string;
  interestLevel: 'Faible' | 'Moyen' | 'Élevé' | 'Très élevé';
  budget: number;
  need?: string;
  comments?: string;
  status: 'Nouveau' | 'Premier contact' | 'Besoin identifié' | 'Rendez-vous' | 'Offre en préparation' | 'Négociation' | 'À convertir' | 'Converti' | 'Perdu';
  responsibleId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SharedAppSettings {
  companyName: string;
  companyLogo: string;
  companyAddress: string;
  companySiret: string;
  companyTva: string;
  defaultTerms: string;
  headerLogoBase64?: string;
  defaultValidity?: number;
  siteUrl?: string;
  commissionRate?: number;
}

export interface SharedPosProduct {
  id: string;
  reference: string;
  barcode?: string;
  isbn?: string;
  name: string;
  family?: 'Livre' | 'Fourniture' | 'Service';
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minStock: number;
  imageUrl?: string;
  description?: string;
  status?: 'Active' | 'Inactive';
  createdAt?: string;
}

export type SharedSupabaseClient = SupabaseClient;

export interface SharedSupabaseEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
}

export type SharedRole = 'Directeur' | 'Responsable' | 'Commercial' | 'Gerant' | 'Caissier';

export interface SharedNavigationItem {
  path: string;
  label: string;
}
