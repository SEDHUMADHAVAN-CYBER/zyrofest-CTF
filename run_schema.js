/**
 * run_schema.js
 * Creates all Supabase tables using the Management API.
 * Run: node run_schema.js
 */
require('dotenv').config();

const PROJECT_REF = 'ymmwszzwbacjiisifkyb';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;

const sql = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  team_name TEXT DEFAULT NULL,
  score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS solves (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  solved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  submitted_flag TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solves_user_id ON solves(user_id);
CREATE INDEX IF NOT EXISTS idx_solves_challenge_id ON solves(challenge_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_score ON users(score DESC);
CREATE INDEX IF NOT EXISTS idx_users_team_name ON users(team_name);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE solves ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='Deny all for anon on users') THEN
    CREATE POLICY "Deny all for anon on users" ON users FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='Deny all for authenticated on users') THEN
    CREATE POLICY "Deny all for authenticated on users" ON users FOR ALL TO authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='settings' AND policyname='Deny all for anon on settings') THEN
    CREATE POLICY "Deny all for anon on settings" ON settings FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='settings' AND policyname='Deny all for authenticated on settings') THEN
    CREATE POLICY "Deny all for authenticated on settings" ON settings FOR ALL TO authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='Deny all for anon on notifications') THEN
    CREATE POLICY "Deny all for anon on notifications" ON notifications FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='Deny all for authenticated on notifications') THEN
    CREATE POLICY "Deny all for authenticated on notifications" ON notifications FOR ALL TO authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='challenges' AND policyname='Deny all for anon on challenges') THEN
    CREATE POLICY "Deny all for anon on challenges" ON challenges FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='challenges' AND policyname='Deny all for authenticated on challenges') THEN
    CREATE POLICY "Deny all for authenticated on challenges" ON challenges FOR ALL TO authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='solves' AND policyname='Deny all for anon on solves') THEN
    CREATE POLICY "Deny all for anon on solves" ON solves FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='solves' AND policyname='Deny all for authenticated on solves') THEN
    CREATE POLICY "Deny all for authenticated on solves" ON solves FOR ALL TO authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='submissions' AND policyname='Deny all for anon on submissions') THEN
    CREATE POLICY "Deny all for anon on submissions" ON submissions FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='submissions' AND policyname='Deny all for authenticated on submissions') THEN
    CREATE POLICY "Deny all for authenticated on submissions" ON submissions FOR ALL TO authenticated USING (false);
  END IF;
END $$;
`;

async function runSchema() {
  console.log('🔌 Connecting to Supabase project:', PROJECT_REF);
  
  // Try the Supabase SQL REST endpoint (available via service role)
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'HEAD',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  
  console.log('Connection check status:', response.status, response.statusText);
  
  // Use the pg-based approach via the Supabase database URL
  // Since supabase-js v2 doesn't expose raw SQL, we use the Management API
  // The Management API requires a personal access token, not service role.
  // Instead let's use the supabase-js rpc workaround via sql function if available.
  
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  
  // Try calling a SQL exec via RPC (only works if exec_sql function exists)
  const { data: rpcData, error: rpcError } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (rpcError) {
    console.log('\n⚠️  Direct SQL not available via supabase-js (expected).');
    console.log('Code:', rpcError.code, '-', rpcError.message);
    console.log('\n📋 MANUAL STEP REQUIRED:');
    console.log('   Open this URL in your browser:');
    console.log('   https://supabase.com/dashboard/project/ymmwszzwbacjiisifkyb/sql/new');
    console.log('\n   Copy and paste this SQL, then click RUN:\n');
    console.log('   (See db/schema.sql for the full SQL)\n');
    return;
  }
  
  console.log('✅ Schema created successfully!');
}

runSchema().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
