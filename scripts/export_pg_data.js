import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';
import path from 'path';

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('SUPABASE_DB_URL manquant : renseignez la chaine de connexion de la NOUVELLE base Supabase (tableau de bord > Connect).');
  process.exit(1);
}

function formatSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' || typeof val === 'boolean') return val.toString();
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function exportPgData() {
  console.log('=== DEBUT DE L\'EXTRACTION DIRECTE PG DES DONNÉES ===');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  await client.connect();
  console.log('[OK] Connecté directement à PostgreSQL Supabase!');

  // Get all table names in public schema
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Trouvé ${tables.length} tables dans le schéma public.`);

  const dumpData = {};
  let fullDataSql = '-- ==========================================\n';
  fullDataSql += '-- DUMP DONNÉES COMPLETES (EXTRACTION DIRECTE PG)\n';
  fullDataSql += `-- Généré le : ${new Date().toISOString()}\n`;
  fullDataSql += '-- ==========================================\n\n';

  let totalRows = 0;

  for (const table of tables) {
    try {
      const res = await client.query(`SELECT * FROM public."${table}"`);
      dumpData[table] = res.rows;
      const rowCount = res.rows.length;
      totalRows += rowCount;
      console.log(`[OK] Table "${table}" : ${rowCount} lignes récuperées.`);

      if (rowCount > 0) {
        fullDataSql += `-- --- DONNÉES TABLE: ${table} (${rowCount} lignes) ---\n`;
        for (const row of res.rows) {
          const keys = Object.keys(row);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const vals = keys.map(k => formatSqlValue(row[k])).join(', ');
          fullDataSql += `INSERT INTO public."${table}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
        }
        fullDataSql += '\n';
      }
    } catch (err) {
      console.error(`[ERR] Erreur lors de la lecture de "${table}":`, err.message);
    }
  }

  await client.end();

  // Combine with schema dump
  const dumpDir = path.resolve('dumps');
  if (!fs.existsSync(dumpDir)) fs.mkdirSync(dumpDir, { recursive: true });

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

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fullDumpSqlWithData = path.join(dumpDir, `full_dump_with_data_${timestamp}.sql`);
  const dataJsonFile = path.join(dumpDir, `data_complete_${timestamp}.json`);

  fs.writeFileSync(fullDumpSqlWithData, fullSchemaSql + '\n\n' + fullDataSql, 'utf-8');
  fs.writeFileSync(dataJsonFile, JSON.stringify(dumpData, null, 2), 'utf-8');

  // Update latest pointers
  fs.writeFileSync(path.join(dumpDir, 'full_dump_with_data_latest.sql'), fullSchemaSql + '\n\n' + fullDataSql, 'utf-8');
  fs.writeFileSync(path.join(dumpDir, 'data_complete_latest.json'), JSON.stringify(dumpData, null, 2), 'utf-8');

  console.log('\n=== DUMP COMPLET AVEC DONNÉES ET SCHÉMA TERMINÉ AVEC SUCCÈS ===');
  console.log(`- Fichier SQL complet (Schéma + Données) : ${path.basename(fullDumpSqlWithData)} (${(fs.statSync(fullDumpSqlWithData).size / 1024).toFixed(1)} KB)`);
  console.log(`- Fichier JSON des Données : ${path.basename(dataJsonFile)} (${(fs.statSync(dataJsonFile).size / 1024).toFixed(1)} KB)`);
  console.log(`Total d'enregistrements extraits : ${totalRows} lignes.`);
}

exportPgData().catch(err => {
  console.error('Erreur fatale d\'export PG :', err);
  process.exit(1);
});
