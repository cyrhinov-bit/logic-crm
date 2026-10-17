const { Client } = require('pg');

async function inspect() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error('SUPABASE_DB_URL manquant : renseignez la chaine de connexion de la NOUVELLE base Supabase (tableau de bord > Connect).');
    process.exit(1);
  }
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const resQuotes = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'quotes'
    ORDER BY ordinal_position;
  `);
  console.log('Quotes columns:', resQuotes.rows.map(r => r.column_name));

  const resLines = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'quote_lines'
    ORDER BY ordinal_position;
  `);
  console.log('Quote lines columns:', resLines.rows.map(r => r.column_name));

  await client.end();
}

inspect();

