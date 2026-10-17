import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY manquants : renseignez les identifiants de la NOUVELLE base Supabase.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLES = [
  'profiles', 'settings', 'pos_settings', 'categories', 'pos_categories', 'pos_brands',
  'pos_suppliers', 'pos_products', 'pos_discounts', 'clients', 'prospects', 'prospect_activities',
  'prospect_follow_ups', 'services', 'prestations', 'quotes', 'quote_lines', 'ventes',
  'vente_lines', 'vente_echeances', 'commissions', 'invoices', 'invoice_lines',
  'pos_transactions', 'pos_transaction_lines', 'pos_payments', 'pos_returns', 'pos_return_lines',
  'pos_cash_sessions', 'pos_inventories', 'pos_inventory_lines', 'pos_stock_entries',
  'pos_stock_entry_lines', 'pos_stock_movements', 'crm_folders', 'crm_documents',
  'activity_reports', 'v2_daily_reports', 'v2_weekly_reports', 'weekly_reports',
  'ai_daily_activities', 'ai_weekly_reports', 'notifications', 'product_completions',
  'import_sessions', 'import_errors'
];

function formatSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' || typeof val === 'boolean') return val.toString();
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function runExport() {
  console.log('=== DEBUT DU DUMP COMPLET ===');
  
  // 1. Schema dump from migrations
  const migrationsDir = path.resolve('supabase/migrations');
  let fullSchemaSql = '-- ==========================================\n';
  fullSchemaSql += '-- DUMP SCHÉMA COMPLET (CONSOLIDATION DES MIGRATIONS)\n';
  fullSchemaSql += `-- Généré le : ${new Date().toISOString()}\n`;
  fullSchemaSql += '-- ==========================================\n\n';

  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      fullSchemaSql += `-- --- MIGRATION: ${file} ---\n`;
      fullSchemaSql += content + '\n\n';
    }
  }

  // 2. Data dump from Supabase
  const dumpData = {};
  let fullDataSql = '-- ==========================================\n';
  fullDataSql += '-- DUMP DONNÉES (EXPOSÉES VIA SUPABASE)\n';
  fullDataSql += `-- Généré le : ${new Date().toISOString()}\n`;
  fullDataSql += '-- ==========================================\n\n';

  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const { data, error } = await supabase.from(table).select('*');
      if (error) {
        console.warn(`[WARN] Impossible d'exporter la table ${table}:`, error.message);
        continue;
      }
      
      dumpData[table] = data || [];
      const rowCount = dumpData[table].length;
      totalRows += rowCount;
      console.log(`[OK] Table ${table} : ${rowCount} lignes récuperées.`);

      if (rowCount > 0) {
        fullDataSql += `-- --- DONNÉES TABLE: ${table} (${rowCount} lignes) ---\n`;
        for (const row of dumpData[table]) {
          const keys = Object.keys(row);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const vals = keys.map(k => formatSqlValue(row[k])).join(', ');
          fullDataSql += `INSERT INTO public."${table}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
        }
        fullDataSql += '\n';
      }
    } catch (err) {
      console.error(`[ERR] Erreur sur table ${table}:`, err);
    }
  }

  // Write dump files
  const dumpDir = path.resolve('dumps');
  if (!fs.existsSync(dumpDir)) {
    fs.mkdirSync(dumpDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const schemaFile = path.join(dumpDir, `schema_dump_${timestamp}.sql`);
  const dataSqlFile = path.join(dumpDir, `data_dump_${timestamp}.sql`);
  const dataJsonFile = path.join(dumpDir, `data_dump_${timestamp}.json`);
  const fullDumpFile = path.join(dumpDir, `full_dump_${timestamp}.sql`);

  fs.writeFileSync(schemaFile, fullSchemaSql, 'utf-8');
  fs.writeFileSync(dataSqlFile, fullDataSql, 'utf-8');
  fs.writeFileSync(dataJsonFile, JSON.stringify(dumpData, null, 2), 'utf-8');
  fs.writeFileSync(fullDumpFile, fullSchemaSql + '\n\n' + fullDataSql, 'utf-8');

  // Also create latest pointers
  fs.writeFileSync(path.join(dumpDir, 'full_dump_latest.sql'), fullSchemaSql + '\n\n' + fullDataSql, 'utf-8');
  fs.writeFileSync(path.join(dumpDir, 'data_dump_latest.json'), JSON.stringify(dumpData, null, 2), 'utf-8');

  console.log('\n=== DUMP COMPLET TERMINÉ AVEC SUCCÈS ===');
  console.log(`Fichiers générés dans ${dumpDir} :`);
  console.log(`- ${path.basename(fullDumpFile)} (${(fs.statSync(fullDumpFile).size / 1024).toFixed(1)} KB)`);
  console.log(`- ${path.basename(dataJsonFile)} (${(fs.statSync(dataJsonFile).size / 1024).toFixed(1)} KB)`);
  console.log(`Total d'enregistrements exportés : ${totalRows} lignes.`);
}

runExport().catch(err => {
  console.error('Erreur fatale lors du dump :', err);
  process.exit(1);
});
