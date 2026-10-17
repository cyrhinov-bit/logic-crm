const { Client } = require('pg');
const fs = require('fs');

async function run() {
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
    console.log("Connexion à la base de données...");
    await client.connect();
    
    console.log("Lecture du fichier de migration...");
    const sql = fs.readFileSync('./supabase/migrations/20260816210000_add_v2_daily_status.sql', 'utf8');

    console.log("Exécution de la migration...");
    await client.query(sql);
    console.log("✅ Migration appliquée avec succès !");
    
  } catch (err) {
    console.error("❌ Erreur:", err);
  } finally {
    await client.end();
  }
}

run();
