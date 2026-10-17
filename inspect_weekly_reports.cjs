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
  await client.query("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;");
  console.log('ALTER TABLE profiles executed successfully.');
  const resProfiles = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'");
  console.log('profiles columns:', resProfiles.rows.map(r => r.column_name));
  await client.end();
}

run().catch(console.error);

