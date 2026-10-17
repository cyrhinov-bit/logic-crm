const { Client } = require('pg');

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
    
    console.log("Suppression de la contrainte unique sur pos_products.reference...");
    await client.query('ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_reference_key;');
    console.log("✅ Contrainte unique supprimée.");

    console.log("Mise à jour des anciennes références générées...");
    const res = await client.query(`
      UPDATE pos_products 
      SET reference = name 
      WHERE reference LIKE 'REF-AUTO-%';
    `);
    console.log(`✅ ${res.rowCount} produits mis à jour avec leur nom exact.`);
    
  } catch (err) {
    console.error("❌ Erreur:", err);
  } finally {
    await client.end();
  }
}

run();
