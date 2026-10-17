import type { PosCategory, PosBrand, PosSupplier } from '../../../../context/AppContext';
import { v4 as uuidv4 } from 'uuid';

export const INITIAL_FAMILIES: PosCategory[] = [
  { id: uuidv4(), name: 'Livres', family: 'Livre' },
  { id: uuidv4(), name: 'Fournitures scolaires', family: 'Fourniture' },
  { id: uuidv4(), name: 'Papeterie', family: 'Fourniture' },
  { id: uuidv4(), name: 'Accessoires', family: 'Fourniture' },
  { id: uuidv4(), name: 'Jeux éducatifs', family: 'Fourniture' },
  { id: uuidv4(), name: 'Divers', family: 'Fourniture' },
];

export const INITIAL_CATEGORIES: PosCategory[] = [
  // Livres
  { id: uuidv4(), name: 'Romans', family: 'Livre' },
  { id: uuidv4(), name: 'Manuels scolaires', family: 'Livre' },
  { id: uuidv4(), name: 'Parascolaire', family: 'Livre' },
  { id: uuidv4(), name: 'Universitaire', family: 'Livre' },
  { id: uuidv4(), name: 'BD', family: 'Livre' },
  { id: uuidv4(), name: 'Mangas', family: 'Livre' },
  // Papeterie
  { id: uuidv4(), name: 'Cahiers', family: 'Fourniture' },
  { id: uuidv4(), name: 'Blocs-notes', family: 'Fourniture' },
  { id: uuidv4(), name: 'Ramettes', family: 'Fourniture' },
  { id: uuidv4(), name: 'Registres', family: 'Fourniture' },
  { id: uuidv4(), name: 'Agendas', family: 'Fourniture' },
  // Fournitures scolaires
  { id: uuidv4(), name: 'Stylos', family: 'Fourniture' },
  { id: uuidv4(), name: 'Crayons', family: 'Fourniture' },
  { id: uuidv4(), name: 'Gommes', family: 'Fourniture' },
  { id: uuidv4(), name: 'Colles', family: 'Fourniture' },
  { id: uuidv4(), name: 'Ciseaux', family: 'Fourniture' },
  { id: uuidv4(), name: 'Règles', family: 'Fourniture' },
  { id: uuidv4(), name: 'Trousses', family: 'Fourniture' },
  { id: uuidv4(), name: 'Sacs', family: 'Fourniture' },
  { id: uuidv4(), name: 'Calculatrices', family: 'Fourniture' },
  // Accessoires
  { id: uuidv4(), name: 'Clés USB', family: 'Fourniture' },
  { id: uuidv4(), name: 'Piles', family: 'Fourniture' },
  // Divers
  { id: uuidv4(), name: 'À classer', family: 'Fourniture' },
];

export const INITIAL_BRANDS: PosBrand[] = [
  { id: uuidv4(), name: 'Bic' },
  { id: uuidv4(), name: 'Pilot' },
  { id: uuidv4(), name: 'Staedtler' },
  { id: uuidv4(), name: 'Hervier' },
  { id: uuidv4(), name: 'Oxford' },
  { id: uuidv4(), name: 'Moleskine' },
  { id: uuidv4(), name: 'Lehmann' },
  { id: uuidv4(), name: 'Clairefontaine' },
  { id: uuidv4(), name: 'Rhodia' },
  { id: uuidv4(), name: 'Papier Artdeco' },
];

export const INITIAL_SUPPLIERS: PosSupplier[] = [
  { id: uuidv4(), name: 'Distributeur Lib', contact: '', phone: '', email: '', address: '' },
  { id: uuidv4(), name: 'ScolaJeux', contact: '', phone: '', email: '', address: '' },
  { id: uuidv4(), name: 'Papeterie Centrale', contact: '', phone: '', email: '', address: '' },
  { id: uuidv4(), name: 'Fournitures du Sud', contact: '', phone: '', email: '', address: '' },
  { id: uuidv4(), name: 'Librairie des Écoles', contact: '', phone: '', email: '', address: '' },
  { id: uuidv4(), name: 'Grossiste Scolaire', contact: '', phone: '', email: '', address: '' },
];

export function getDefaultCategoryId(): string {
  return INITIAL_CATEGORIES.find(c => c.name === 'À classer')?.id || '';
}

export function getDefaultFamilyForProduct(barcodeOrIsbn?: string): 'Livre' | 'Fourniture' {
  if (!barcodeOrIsbn) return 'Fourniture';
  
  // ISBN check - books
  const isbnRegex = /^978|979/;
  if (isbnRegex.test(barcodeOrIsbn.replace(/[-\s]/g, ''))) {
    return 'Livre';
  }
  
  return 'Fourniture';
}

export interface DefaultDataState {
  familiesCreated: boolean;
  categoriesCreated: boolean;
  brandsCreated: boolean;
  suppliersCreated: boolean;
}
