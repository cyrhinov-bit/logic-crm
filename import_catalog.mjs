import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function importCatalog() {
  console.log('Authentification...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 's.diallo@hinovgroup.com',
    password: '456987'
  });
  if (authError) {
    console.error('Erreur authentification:', authError.message);
    return;
  }
  console.log('Authentifié avec succès !');

  console.log('Lecture de products.json...');
  const rawData = fs.readFileSync('src/features/products/data/products.json', 'utf-8');
  const products = JSON.parse(rawData);

  console.log('Récupération des produits existants...');
  const { data: existingData, error: existingError } = await supabase.from('pos_products').select('id, reference, barcode');
  if (existingError) {
    console.error('Erreur récupération produits:', existingError.message);
    return;
  }
  
  const existingByRef = new Map();
  const existingByBarcode = new Map();
  for (const p of (existingData || [])) {
    if (p.reference) existingByRef.set(p.reference, p);
    if (p.barcode) existingByBarcode.set(p.barcode, p);
  }

  const posProducts = [];
  const seenBarcodes = new Set();

  console.log(`Traitement de ${products.length} lignes...`);
  
  for (const row of products) {
    const keys = Object.keys(row);
    if (keys.length === 0) continue;
    
    // La clé unique contient les en-têtes, la valeur contient les données
    const rowDataStr = row[keys[0]];
    const parts = rowDataStr.split(';');

    // Si la ligne est trop courte ou vide
    if (parts.length < 5) continue;

    let barcode = parts[0] ? parts[0].trim() : null;
    if (barcode === '') barcode = null;
    if (barcode) {
      if (seenBarcodes.has(barcode)) {
        console.warn(`Code barre en double ignoré: ${barcode}`);
        barcode = null;
      } else {
        seenBarcodes.add(barcode);
      }
    }
    let reference = parts[1] ? parts[1].trim() : null;
    
    // Ignorer s'il n'y a pas de référence (le nom est obligatoire)
    if (!reference) continue;

    const cleanPurchasePrice = parts[2] ? parts[2].replace(/\s/g, '').trim() : '0';
    const purchasePrice = Number(cleanPurchasePrice) || 0;

    const cleanSellingPrice = parts[4] ? parts[4].replace(/\s/g, '').trim() : '0';
    const sellingPrice = Number(cleanSellingPrice) || 0;

    let existingProd = existingByRef.get(reference);
    if (!existingProd && barcode) {
      existingProd = existingByBarcode.get(barcode);
    }
    
    const id = existingProd ? existingProd.id : uuidv4();

    posProducts.push({
      id: id,
      reference: reference,
      name: reference, // La référence devient le nom (Supabase exige name NOT NULL)
      ...(barcode ? { barcode } : {}),
      isbn: null,
      family: 'Fourniture', // Valeur par défaut
      purchase_price: purchasePrice,
      selling_price: sellingPrice,
      quantity: 0, // Forcé à 0 comme demandé
      min_stock: 0,
      image_url: null,
      description: null,
      status: 'Active'
    });
  }

  console.log(`${posProducts.length} produits extraits. Début de l'insertion dans Supabase...`);

  // Insérer par lots (batch) de 100 pour éviter les limites de taille de payload
  const batchSize = 100;
  let successCount = 0;
  
  for (let i = 0; i < posProducts.length; i += batchSize) {
    const batch = posProducts.slice(i, i + batchSize);
    const { error } = await supabase
      .from('pos_products')
      .upsert(batch);

    if (error) {
      console.error(`Erreur d'insertion au batch ${i} - ${i + batchSize}:`, error.message);
    } else {
      successCount += batch.length;
      console.log(`Inséré ${successCount}/${posProducts.length} produits...`);
    }
  }

  console.log('Importation terminée.');
}

importCatalog().catch(err => {
  console.error("Erreur critique:", err);
});
