import { getUserGeminiKey } from '../../../lib/geminiKey';
import type { PosProduct } from '../../../context/AppContext';

export interface ParsedOrderItem {
  productId: string;
  productName: string;
  reference: string;
  quantity: number;
  unitPrice: number;
  stockAvailable: number;
  confidence: number;
}

export interface ParseOrderResult {
  items: ParsedOrderItem[];
  unmatchedPhrases: string[];
  rawInterpretation: string;
}

export interface CartMarginInfo {
  totalPurchaseCost: number;
  subtotal: number;
  totalDiscount: number;
  netRevenue: number;
  grossMarginAmount: number;
  grossMarginRate: number; // in %
  isLoss: boolean;
  isLowMargin: boolean; // < 15%
  status: 'healthy' | 'warning' | 'danger';
  recommendedMaxDiscountAmount: number;
  recommendedMaxDiscountPercent: number;
}

/**
 * Calcule en temps réel la marge et les indicateurs de rentabilité du panier
 */
export function calculateCartMargin(
  cart: { productId: string; quantity: number; unitPrice: number; discountType: 'none' | 'percent' | 'amount'; discountPercent: number; discountAmount: number; total: number }[],
  posProducts: PosProduct[],
  globalDiscountType: 'none' | 'percent' | 'amount' = 'none',
  globalDiscountValue: number = 0,
  minHealthyMarginRate: number = 20, // 20% cible saine
  minWarningMarginRate: number = 5   // < 5% critique
): CartMarginInfo {
  if (cart.length === 0) {
    return {
      totalPurchaseCost: 0,
      subtotal: 0,
      totalDiscount: 0,
      netRevenue: 0,
      grossMarginAmount: 0,
      grossMarginRate: 0,
      isLoss: false,
      isLowMargin: false,
      status: 'healthy',
      recommendedMaxDiscountAmount: 0,
      recommendedMaxDiscountPercent: 0
    };
  }

  let totalPurchaseCost = 0;
  let subtotal = 0;
  let lineDiscounts = 0;

  cart.forEach(item => {
    const product = posProducts.find(p => p.id === item.productId);
    const purchasePrice = (product && product.purchasePrice > 0) ? product.purchasePrice : 0;
    
    totalPurchaseCost += purchasePrice * item.quantity;
    subtotal += item.unitPrice * item.quantity;
    
    if (item.discountType === 'percent') {
      lineDiscounts += (item.unitPrice * item.quantity * item.discountPercent) / 100;
    } else if (item.discountType === 'amount') {
      lineDiscounts += item.discountAmount;
    }
  });

  const afterLineDiscounts = Math.max(0, subtotal - lineDiscounts);
  let globalDiscount = 0;
  if (globalDiscountType === 'percent') {
    globalDiscount = (afterLineDiscounts * globalDiscountValue) / 100;
  } else if (globalDiscountType === 'amount') {
    globalDiscount = globalDiscountValue;
  }

  const totalDiscount = lineDiscounts + globalDiscount;
  const netRevenue = Math.max(0, subtotal - totalDiscount);
  const grossMarginAmount = netRevenue - totalPurchaseCost;
  const grossMarginRate = netRevenue > 0 ? (grossMarginAmount / netRevenue) * 100 : 0;

  const isLoss = grossMarginAmount < 0;
  const isLowMargin = !isLoss && grossMarginRate < minWarningMarginRate;

  let status: 'healthy' | 'warning' | 'danger' = 'healthy';
  if (isLoss) {
    status = 'danger';
  } else if (grossMarginRate < minHealthyMarginRate) {
    status = 'warning';
  }

  // Remise maximale conseillée pour garder au moins minHealthyMarginRate% de marge
  const targetMarginDecimal = Math.min(minHealthyMarginRate / 100, 0.8);
  const minSafeNetRevenue = totalPurchaseCost > 0 ? totalPurchaseCost / (1 - targetMarginDecimal) : 0;
  const maxSafeDiscountAmount = Math.max(0, subtotal - minSafeNetRevenue);
  const maxSafeDiscountPercent = subtotal > 0 ? Math.min(100, (maxSafeDiscountAmount / subtotal) * 100) : 0;

  return {
    totalPurchaseCost,
    subtotal,
    totalDiscount,
    netRevenue,
    grossMarginAmount,
    grossMarginRate,
    isLoss,
    isLowMargin,
    status,
    recommendedMaxDiscountAmount: Math.round(maxSafeDiscountAmount),
    recommendedMaxDiscountPercent: Math.round(maxSafeDiscountPercent * 10) / 10
  };
}

/**
 * Analyse une phrase ou transcription vocale avec Gemini pour identifier les articles et quantités
 */
export async function parseNaturalLanguageOrder(
  userInput: string,
  posProducts: PosProduct[],
  userId?: string
): Promise<ParseOrderResult> {
  const trimmed = userInput.trim();
  if (!trimmed) {
    return { items: [], unmatchedPhrases: [], rawInterpretation: 'Demande vide.' };
  }

  // Préparer un mini-catalogue allégé pour le prompt (actifs seulement)
  const activeProducts = posProducts.filter(p => p.isActive !== false && p.status !== 'Inactive');
  const catalogSummary = activeProducts.map(p => ({
    id: p.id,
    name: p.name,
    ref: p.reference,
    isbn: p.isbn || '',
    price: p.sellingPrice,
    stock: p.quantity,
    family: p.family || ''
  }));

  const prompt = `
Tu es un assistant de caisse intelligent pour une librairie, papeterie et magasin B2B (HINOV GROUP).
Le caissier a dicté ou saisi la commande client suivante en langage naturel :
"${trimmed}"

Voici la liste des produits disponibles en magasin :
${JSON.stringify(catalogSummary)}

MISSION :
1. Analyse la commande du caissier et extrait précisément les articles demandés avec leur quantité.
2. Associe chaque demande au produit correspondant le plus pertinent dans le catalogue.
3. Si un article demandé n'existe pas ou n'est pas clair, liste-le dans "unmatchedPhrases".
4. Indique pour chaque article la quantité demandée (par défaut 1 si non précisée).

Génère UNIQUEMENT un objet JSON valide (sans formatage markdown) avec cette structure :
{
  "rawInterpretation": "Explication courte en français de ce qui a été compris",
  "items": [
    {
      "productId": "id-du-produit-exact-dans-le-catalogue",
      "quantity": 2,
      "confidence": 0.95
    }
  ],
  "unmatchedPhrases": ["nom des articles introuvables"]
}
`;

  const userApiKey = getUserGeminiKey(userId);

  if (userApiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(userApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleaned);
          
          // Reconstituer les items complets avec les infos produit
          const matchedItems: ParsedOrderItem[] = [];
          if (Array.isArray(parsed.items)) {
            for (const it of parsed.items) {
              const prod = activeProducts.find(p => p.id === it.productId);
              if (prod) {
                matchedItems.push({
                  productId: prod.id,
                  productName: prod.name,
                  reference: prod.reference,
                  quantity: Math.max(1, Number(it.quantity) || 1),
                  unitPrice: prod.sellingPrice,
                  stockAvailable: prod.quantity,
                  confidence: Number(it.confidence) || 0.9
                });
              }
            }
          }

          return {
            items: matchedItems,
            unmatchedPhrases: Array.isArray(parsed.unmatchedPhrases) ? parsed.unmatchedPhrases : [],
            rawInterpretation: parsed.rawInterpretation || 'Analyse terminée.'
          };
        }
      }
    } catch (err) {
      console.warn('Erreur appel Gemini POS, passage au fallback local :', err);
    }
  }

  // Fallback intelligent local (moteur regex / recherche textuelle locale si hors ligne ou sans clé)
  return fallbackLocalOrderParser(trimmed, activeProducts);
}

/**
 * Analyse directe d'un enregistrement Audio (Voix du caissier) avec Gemini Multimodal Audio
 * Fonctionne sur TOUS les navigateurs (aucun besoin des serveurs de reconnaissance Google Chrome)
 */
export async function parseAudioVoiceOrder(
  audioBlob: Blob,
  posProducts: PosProduct[],
  userId?: string
): Promise<ParseOrderResult & { transcriptDetected: string }> {
  // Convert blob to base64
  const arrayBuffer = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Audio = btoa(binary);
  const rawMime = audioBlob.type || 'audio/webm';
  const cleanMime = rawMime.split(';')[0].trim() || 'audio/webm';

  const activeProducts = posProducts.filter(p => p.isActive !== false && p.status !== 'Inactive');
  const catalogSummary = activeProducts.map(p => ({
    id: p.id,
    name: p.name,
    ref: p.reference,
    isbn: p.isbn || '',
    price: p.sellingPrice,
    stock: p.quantity,
    family: p.family || ''
  }));

  const prompt = `
Tu es l'assistant de caisse intelligent pour une librairie, papeterie et magasin B2B (HINOV GROUP).
ÉCOUTE attentivement l'enregistrement audio dicté par le caissier en français.

Voici le catalogue des articles disponibles en magasin :
${JSON.stringify(catalogSummary)}

MISSION :
1. Transcris fidèlement en français ce que le caissier a dit dans la clé "transcriptDetected".
2. Analyse les articles et quantités demandés.
3. Associe chaque demande au produit correspondant le plus pertinent dans le catalogue.
4. Si un article demandé est introuvable ou ambigu, indique-le dans "unmatchedPhrases".
5. Indique pour chaque article la quantité demandée (par défaut 1).

Génère UNIQUEMENT un objet JSON valide (sans aucun formatage markdown) avec cette structure exacte :
{
  "transcriptDetected": "Texte exact transcrit depuis la voix du caissier",
  "rawInterpretation": "Explication courte en français de ce qui a été compris",
  "items": [
    {
      "productId": "id-du-produit-exact-dans-le-catalogue",
      "quantity": 2,
      "confidence": 0.95
    }
  ],
  "unmatchedPhrases": []
}
`;

  const userApiKey = getUserGeminiKey(userId);

  if (userApiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(userApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: cleanMime,
                      data: base64Audio
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleaned);

          const matchedItems: ParsedOrderItem[] = [];
          if (Array.isArray(parsed.items)) {
            for (const it of parsed.items) {
              const prod = activeProducts.find(p => p.id === it.productId);
              if (prod) {
                matchedItems.push({
                  productId: prod.id,
                  productName: prod.name,
                  reference: prod.reference,
                  quantity: Math.max(1, Number(it.quantity) || 1),
                  unitPrice: prod.sellingPrice,
                  stockAvailable: prod.quantity,
                  confidence: Number(it.confidence) || 0.95
                });
              }
            }
          }

          return {
            transcriptDetected: parsed.transcriptDetected || '',
            items: matchedItems,
            unmatchedPhrases: Array.isArray(parsed.unmatchedPhrases) ? parsed.unmatchedPhrases : [],
            rawInterpretation: parsed.rawInterpretation || 'Analyse audio réussie.'
          };
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        console.warn('Erreur API Gemini Audio:', errData);
      }
    } catch (err) {
      console.warn('Erreur lors du traitement audio Gemini:', err);
    }
  }

  return {
    transcriptDetected: '',
    items: [],
    unmatchedPhrases: [],
    rawInterpretation: "Impossible d'analyser l'audio via Gemini (vérifiez la clé API ou la connexion)."
  };
}

/**
 * Parseur local rapide (fallback sans connexion / sans API)
 */
function fallbackLocalOrderParser(input: string, products: PosProduct[]): ParseOrderResult {
  const lower = input.toLowerCase();
  const matchedItems: ParsedOrderItem[] = [];
  const unmatched: string[] = [];

  // Découper par virgules ou "et"
  const segments = lower.split(/,| et |\+ /i).map(s => s.trim()).filter(Boolean);

  for (const segment of segments) {
    const qtyMatch = segment.match(/^(\d+)\s*(?:x|\*|-)?\s*(.*)$/);
    let qty = 1;
    let query = segment;
    if (qtyMatch) {
      qty = parseInt(qtyMatch[1], 10) || 1;
      query = qtyMatch[2].trim();
    }

    if (!query) continue;

    const found = products.find(p => 
      p.name.toLowerCase().includes(query) ||
      p.reference.toLowerCase() === query ||
      (p.barcode && p.barcode === query) ||
      (p.isbn && p.isbn === query)
    );

    if (found) {
      matchedItems.push({
        productId: found.id,
        productName: found.name,
        reference: found.reference,
        quantity: qty,
        unitPrice: found.sellingPrice,
        stockAvailable: found.quantity,
        confidence: 0.8
      });
    } else {
      unmatched.push(segment);
    }
  }

  return {
    items: matchedItems,
    unmatchedPhrases: unmatched,
    rawInterpretation: matchedItems.length > 0
      ? `${matchedItems.length} article(s) détecté(s) localement.`
      : 'Aucun article correspondant trouvé précisément.'
  };
}

