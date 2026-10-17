const { Client } = require('pg');

async function run() {
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
      console.log('[DB] Connecté avec succès !');
      connected = true;
      break;
    } catch (e) {
      console.warn(`[DB] Échec de connexion : ${e.message}`);
    }
  }

  if (!connected || !client) {
    console.error('[DB] Impossible de se connecter à la base de données Supabase.');
    process.exit(1);
  }

  try {
    const sql = `
      -- 1. Permissions CRM sur la table profiles
      ALTER TABLE IF EXISTS profiles
      ADD COLUMN IF NOT EXISTS crm_prestations_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS crm_caisse_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS crm_maintenance_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS crm_stocks_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS crm_tiers_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS crm_commerciaux_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS crm_commissions_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS crm_facturation_enabled BOOLEAN DEFAULT FALSE;

      -- 2. Champs de suivi mensuel sur la table invoices
      ALTER TABLE IF EXISTS invoices
      ADD COLUMN IF NOT EXISTS client_nom TEXT,
      ADD COLUMN IF NOT EXISTS commercial_nom TEXT,
      ADD COLUMN IF NOT EXISTS service_nom TEXT,
      ADD COLUMN IF NOT EXISTS category TEXT,
      ADD COLUMN IF NOT EXISTS period_year INT,
      ADD COLUMN IF NOT EXISTS period_month INT,
      ADD COLUMN IF NOT EXISTS payment_date DATE,
      ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC DEFAULT 0;

      -- 3. Rendre quote_id et client_id nullables si besoin
      ALTER TABLE IF EXISTS invoices ALTER COLUMN quote_id DROP NOT NULL;
    `;

    console.log('[DB] Exécution des migrations SQL...');
    await client.query(sql);
    console.log('[DB] ✅ Migration SQL exécutée avec succès dans Supabase !');

    // Vérification des colonnes profiles
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'profiles' AND column_name LIKE 'crm_%';
    `);
    console.log('[DB] Colonnes CRM sur profiles :', res.rows.map(r => r.column_name).join(', '));

  } catch (err) {
    console.error('[DB] Erreur SQL :', err.message);
  } finally {
    await client.end();
  }
}

run();
