const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function verifyAndExecuteAllMigrations() {
  const connectionStrings = [process.env.SUPABASE_DB_URL].filter(Boolean);
  if (connectionStrings.length === 0) {
    console.error('SUPABASE_DB_URL manquant : renseignez la chaine de connexion de la NOUVELLE base Supabase (tableau de bord > Connect).');
    process.exit(1);
  }

  let client = null;
  let connected = false;

  for (const connStr of connectionStrings) {
    try {
      console.log(`[DB] Tentative de connexion via ${connStr.split('@')[1]}...`);
      client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
      });
      await client.connect();
      console.log('[DB] Connecté avec succès à Supabase PostgreSQL !');
      connected = true;
      break;
    } catch (e) {
      console.warn(`[DB] Échec sur ce point d'accès (${e.message})`);
    }
  }

  if (!connected || !client) {
    console.error('[DB] Impossible de se connecter à la base de données Supabase.');
    process.exit(1);
  }

  try {
    // 1. Lister les tables existantes
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const existingTables = new Set(tablesRes.rows.map(r => r.table_name));
    console.log(`\n=== TABLES EXISTANTES DANS SUPABASE (${existingTables.size}) ===`);
    console.log(Array.from(existingTables).join(', '));

    // 2. Parcourir tous les fichiers de migrations
    const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    console.log(`\n=== VÉRIFICATION & EXÉCUTION DES MIGRATIONS (${migrationFiles.length} FICHIERS) ===`);

    let appliedCount = 0;
    let skippedOrSuccessCount = 0;
    let errorCount = 0;

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query(sql);
        console.log(`[OK] ${file}`);
        appliedCount++;
      } catch (err) {
        // Many errors can be "already exists" or safe warnings
        const msg = err.message || '';
        if (
          msg.includes('already exists') ||
          msg.includes('duplicate key') ||
          msg.includes('column') && msg.includes('already exists')
        ) {
          console.log(`[DÉJÀ APPLIQUÉ] ${file} (${msg.split('\n')[0]})`);
          skippedOrSuccessCount++;
        } else {
          console.warn(`[ATTENTION] ${file} : ${msg.split('\n')[0]}`);
          errorCount++;
        }
      }
    }

    // 3. Vérifications spécifiques critiques
    console.log('\n=== VÉRIFICATION DES SCHÉMAS CLÉS ===');

    // Vérification profiles
    const profilesCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'profiles' 
      ORDER BY column_name;
    `);
    console.log(`Colonnes 'profiles' :`, profilesCols.rows.map(r => r.column_name).join(', '));

    // Vérification invoices
    const invoicesCols = await client.query(`
      SELECT column_name, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'invoices' 
      ORDER BY column_name;
    `);
    console.log(`Colonnes 'invoices' :`, invoicesCols.rows.map(r => `${r.column_name} (${r.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`).join(', '));

    // Vérification crm_techniciens
    const techCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'crm_techniciens' 
      ORDER BY column_name;
    `);
    console.log(`Colonnes 'crm_techniciens' :`, techCols.rows.map(r => r.column_name).join(', '));

    console.log('\n=== BILAN ===');
    console.log(`Total migrations traitées : ${migrationFiles.length}`);
    console.log(`Migrations validées / exécutées : ${appliedCount + skippedOrSuccessCount}`);
    console.log(`Avertissements / Erreurs : ${errorCount}`);

  } catch (globalErr) {
    console.error('Erreur globale :', globalErr);
  } finally {
    await client.end();
  }
}

verifyAndExecuteAllMigrations();
