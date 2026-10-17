const { Client } = require('pg');

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('SUPABASE_DB_URL manquant : renseignez la chaine de connexion de la NOUVELLE base Supabase (tableau de bord > Connect).');
  process.exit(1);
}

const client = new Client({
  connectionString,
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles'");
  console.log('Profiles columns:', res.rows);
  const rows = await client.query("SELECT id, name, email, role, photo, avatar_url FROM profiles LIMIT 5");
  console.log('Sample profiles:', rows.rows);
  await client.end();
}

run().catch(console.error);

