require('dotenv').config();
const { Client } = require('pg');

const PROJECT_REF = 'ymmwszzwbacjiisifkyb';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = new Client({
  host: `aws-0-ap-south-1.pooler.supabase.com`,
  port: 6543,
  database: 'postgres',
  user: `postgres.${PROJECT_REF}`,
  password: SERVICE_KEY,
  ssl: { rejectUnauthorized: false }
});

const createSessionSql = `
  CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
  )
`;

async function run() {
  console.log('🔌 Connecting to Supabase PostgreSQL...');
  try {
    await client.connect();
    console.log('✅ Connected!');
    await client.query(createSessionSql);
    console.log('✅ Session table created successfully!');
  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await client.end();
  }
}

run();
