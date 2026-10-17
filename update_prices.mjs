import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

function parseCSVLine(line, delimiter = ';') {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

function parsePrice(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const str = String(value).trim().replace(/\s/g, '');
  if (!str) return 0;
  const num = Number(str.replace(/,/g, '.'));
  return Number.isFinite(num) ? num : 0;
}

async function run() {
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: 'e.gnonskan@hinovgroup.com',
    password: '04041992'
  });
  if (authError) {
    console.error("Auth error", authError);
    return;
  }

  const raw = fs.readFileSync('src/features/products/data/products.json', 'utf8');
  const jsonData = JSON.parse(raw);

  const updates = [];

  jsonData.forEach((item) => {
    const keys = Object.keys(item);
    if (keys.length === 0) return;
    
    const key = keys[0];
    const valueStr = item[key];
    if (typeof valueStr !== 'string') return;

    const headers = parseCSVLine(key);
    const parts = parseCSVLine(valueStr);

    const getIndex = (possibleNames) => headers.findIndex(h => possibleNames.some(p => h.toUpperCase().includes(p)));

    const nameIdx = getIndex(['NOM', 'DESIGNATION', 'ARTICLE', 'REFERENCE']);
    const sellingIdx = getIndex(['VENTE', 'P.V']); 
    
    if (nameIdx >= 0 && sellingIdx >= 0) {
      const name = String(parts[nameIdx]).trim();
      const sellingPrice = parsePrice(parts[sellingIdx]);
      
      if (name && sellingPrice > 0) {
        updates.push({ name, sellingPrice });
      }
    }
  });

  console.log(`Préparation de ${updates.length} mises à jour de prix...`);

  let successCount = 0;
  let errorCount = 0;
  
  for (const update of updates) {
    const { error } = await supabase
      .from('pos_products')
      .update({ selling_price: update.sellingPrice })
      .eq('name', update.name);
      
    if (error) {
      errorCount++;
    } else {
      successCount++;
    }
    
    if (successCount % 100 === 0) {
      console.log(`${successCount} prix mis à jour...`);
    }
  }

  console.log(`Mise à jour terminée ! Succès: ${successCount}, Erreurs: ${errorCount}`);
}

run();
