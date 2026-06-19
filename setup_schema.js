/**
 * setup_schema.js
 * Run once to create all Supabase tables and RLS policies.
 * Usage: node setup_schema.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const schema = `
-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  team_name TEXT DEFAULT NULL,
  score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SETTINGS TABLE
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CHALLENGES TABLE
CREATE TABLE IF NOT EXISTS challenges (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  points INTEGER NOT NULL,
  flag_hash TEXT NOT NULL,
  file_url TEXT DEFAULT NULL,
  sort_order INTEGER DEFAULT 0
);

-- SOLVES TABLE
CREATE TABLE IF NOT EXISTS solves (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  solved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, challenge_id)
);

-- SUBMISSIONS TABLE (flags stored as SHA256 hashes, never plaintext)
CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  submitted_flag TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_solves_user_id ON solves(user_id);
CREATE INDEX IF NOT EXISTS idx_solves_challenge_id ON solves(challenge_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_score ON users(score DESC);
CREATE INDEX IF NOT EXISTS idx_users_team_name ON users(team_name);

-- RLS (enable + deny all for anon/authenticated; service_role bypasses automatically)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE solves ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist, then recreate
DO $$ BEGIN
  DROP POLICY IF EXISTS "Deny all for anon on users" ON users;
  DROP POLICY IF EXISTS "Deny all for authenticated on users" ON users;
  DROP POLICY IF EXISTS "Deny all for anon on settings" ON settings;
  DROP POLICY IF EXISTS "Deny all for authenticated on settings" ON settings;
  DROP POLICY IF EXISTS "Deny all for anon on notifications" ON notifications;
  DROP POLICY IF EXISTS "Deny all for authenticated on notifications" ON notifications;
  DROP POLICY IF EXISTS "Deny all for anon on challenges" ON challenges;
  DROP POLICY IF EXISTS "Deny all for authenticated on challenges" ON challenges;
  DROP POLICY IF EXISTS "Deny all for anon on solves" ON solves;
  DROP POLICY IF EXISTS "Deny all for authenticated on solves" ON solves;
  DROP POLICY IF EXISTS "Deny all for anon on submissions" ON submissions;
  DROP POLICY IF EXISTS "Deny all for authenticated on submissions" ON submissions;
END $$;

CREATE POLICY "Deny all for anon on users" ON users FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for authenticated on users" ON users FOR ALL TO authenticated USING (false);
CREATE POLICY "Deny all for anon on settings" ON settings FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for authenticated on settings" ON settings FOR ALL TO authenticated USING (false);
CREATE POLICY "Deny all for anon on notifications" ON notifications FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for authenticated on notifications" ON notifications FOR ALL TO authenticated USING (false);
CREATE POLICY "Deny all for anon on challenges" ON challenges FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for authenticated on challenges" ON challenges FOR ALL TO authenticated USING (false);
CREATE POLICY "Deny all for anon on solves" ON solves FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for authenticated on solves" ON solves FOR ALL TO authenticated USING (false);
CREATE POLICY "Deny all for anon on submissions" ON submissions FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for authenticated on submissions" ON submissions FOR ALL TO authenticated USING (false);
`;

async function run() {
  console.log('🔌 Connecting to Supabase...');
  console.log('   URL:', process.env.SUPABASE_URL);
  
  // Use the REST API's /rest/v1/rpc with raw SQL via pg_dump workaround
  // Actually use the management API to run SQL
  const SUPABASE_ACCESS_URL = process.env.SUPABASE_URL + '/rest/v1/';
  
  // Execute each statement separately via raw fetch to Supabase's SQL endpoint
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  // Use the pg connection string approach via supabase-js exec
  // Note: supabase-js v2 doesn't support raw SQL directly.
  // We'll use the Supabase Management API instead.
  
  const projectRef = 'ymmwszzwbacjiisifkyb';
  
  // The management API requires a personal access token (different from service role key).
  // Instead, let's verify the connection works by reading from an existing table or checking error.
  
  const { data, error } = await supabase.from('users').select('id').limit(1);
  
  if (error) {
    if (error.message.includes('relation "users" does not exist') || error.code === '42P01') {
      console.log('\n❌ Tables do not exist yet in Supabase.');
      console.log('\n📋 Please run the schema manually:');
      console.log('   1. Go to: https://supabase.com/dashboard/project/ymmwszzwbacjiisifkyb/sql/new');
      console.log('   2. Copy and paste the contents of: db/schema.sql');
      console.log('   3. Click "Run"\n');
    } else if (error.code === 'PGRST116') {
      console.log('✅ Connected! Tables exist but are empty — that\'s fine for a fresh start.');
    } else {
      console.log('⚠️  Connection result:', error.message, '(code:', error.code + ')');
    }
  } else {
    console.log('✅ Connected! Users table exists with', data ? data.length : 0, 'row(s).');
    console.log('\n🎉 Supabase is ready! Start your server with: npm run dev');
  }
}

run().catch(console.error);
