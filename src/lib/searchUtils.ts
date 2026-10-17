/**
 * Utilitaires de recherche universelle et tolérante aux accents / diacritiques,
 * à la casse, aux tirets, aux espaces et aux termes multiples.
 */

import type { PosProduct } from '../context/AppContext';

/**
 * Normalise une chaîne de texte pour la recherche :
 * - Supprime les accents et diacritiques (é -> e, ç -> c, etc.)
 * - Remplace la ponctuation et caractères spéciaux par des espaces
 * - Convertit en minuscules
 * - Remplace les espaces multiples par un seul espace
 */
export function normalizeSearchText(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .replace(/[^\w\s]|_/g, ' ')       // Supprime toute ponctuation et symboles
    .toLowerCase()
    .replace(/\s+/g, ' ')             // Élimine les espaces multiples
    .trim();
}

/**
 * Formate la transcription vocale pour la recherche en caisse :
 * - EN MAJUSCULES
 * - SANS ACCENT
 * - SANS PONCTUATION NI CARACTÈRES SPÉCIAUX
 */
export function formatVoiceTranscription(raw?: string | null): string {
  if (!raw) return '';
  return normalizeSearchText(raw).toUpperCase();
}

/**
 * Nettoie un code (Code-barres, ISBN, Référence) en retirant tirets, espaces, points et caractères spéciaux
 */
export function cleanCode(code?: string | null): string {
  if (!code) return '';
  return String(code).replace(/[-\s._/]/g, '').toLowerCase().trim();
}

/**
 * Vérifie si un ou plusieurs textes cibles correspondent à une requête de recherche multi-mots.
 * Tous les mots de la requête doivent être présents dans au moins l'un des textes cibles.
 */
export function matchesSearchQuery(
  targets: string | null | undefined | (string | null | undefined)[],
  query: string
): boolean {
  if (!query || !query.trim()) return true;

  const normalizedQuery = normalizeSearchText(query);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const targetArray = Array.isArray(targets) ? targets : [targets];
  const combinedTarget = targetArray
    .map(t => normalizeSearchText(t))
    .join(' ');

  // Vérifier que chaque terme de la recherche est présent dans le texte combiné
  return terms.every(term => combinedTarget.includes(term));
}

/**
 * Recherche complète et tolérante pour un produit POS
 * Teste : Nom, Référence, Code-barres, ISBN, Famille, Description
 */
export function matchesProductSearch(product: PosProduct, query: string): boolean {
  if (!query || !query.trim()) return true;

  const cleanQ = cleanCode(query);
  const cleanBarcode = cleanCode(product.barcode);
  const cleanIsbn = cleanCode(product.isbn);
  const cleanRef = cleanCode(product.reference);

  // 1. Correspondance exacte ou partielle sur les codes numériques / ISBN / Réf
  if (cleanQ.length >= 2) {
    if (cleanBarcode && cleanBarcode.includes(cleanQ)) return true;
    if (cleanIsbn && cleanIsbn.includes(cleanQ)) return true;
    if (cleanRef && cleanRef.includes(cleanQ)) return true;
  }

  // 2. Recherche textuelle multi-termes sur les champs textuels
  return matchesSearchQuery(
    [
      product.name,
      product.reference,
      product.barcode,
      product.isbn,
      product.family,
      product.description
    ],
    query
  );
}

/**
 * Parse un nombre de manière sécurisée en acceptant la virgule et le point
 */
export function parseNumericInput(value: string | number, fallback = 0): number {
  if (typeof value === 'number') return isNaN(value) ? fallback : value;
  if (!value || typeof value !== 'string') return fallback;

  const sanitized = value.replace(/\s+/g, '').replace(',', '.');
  const num = parseFloat(sanitized);
  return isNaN(num) ? fallback : num;
}

