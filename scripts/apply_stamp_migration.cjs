const { Client } = require('pg');

async function applyMigration() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error('SUPABASE_DB_URL manquant : renseignez la chaine de connexion de la NOUVELLE base Supabase (tableau de bord > Connect).');
    process.exit(1);
  }
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('[PostgreSQL] Connecté avec succès à Supabase !');

    const sql = `
      ALTER TABLE IF EXISTS settings ADD COLUMN IF NOT EXISTS company_stamp_base64 TEXT;
      ALTER TABLE IF EXISTS settings ADD COLUMN IF NOT EXISTS header_logo_base64 TEXT;
    `;

    await client.query(sql);
    console.log('[PostgreSQL] Migration exécutée avec succès ! Les colonnes company_stamp_base64 et header_logo_base64 sont opérationnelles.');
  } catch (err) {
    console.error('[PostgreSQL] Erreur lors de l\'exécution de la migration :', err.message);
  } finally {
    await client.end();
  }
}

applyMigration();
