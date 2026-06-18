/**
 * create_tables.js
 * Creates all ZYROFEST CTF tables in Supabase via direct PostgreSQL connection.
 * The Supabase project's DB URL is: postgresql://postgres:[password]@db.ymmwszzwbacjiisifkyb.supabase.co:5432/postgres
 *
 * Since we only have the service role JWT (not the DB password), we use the
 * Supabase HTTPS connection pooler at port 6543 with the service role as password.
 */
require('dotenv').config();
const { Client } = require('pg');

// Supabase PostgreSQL connection via connection pooler (Transaction mode)
// Host format: aws-0-[region].pooler.supabase.com
// User format: postgres.[project-ref]
// Password: service_role key
// Port: 6543

const PROJECT_REF = 'ymmwszzwbacjiisifkyb';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Try the Supabase pooler connection
const client = new Client({
  host: `aws-0-ap-south-1.pooler.supabase.com`,
  port: 6543,
  database: 'postgres',
  user: `postgres.${PROJECT_REF}`,
  password: SERVICE_KEY,
  ssl: { rejectUnauthorized: false }
});

const tables = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    team_name TEXT DEFAULT NULL,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS challenges (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    points INTEGER NOT NULL,
    flag_hash TEXT NOT NULL,
    file_url TEXT DEFAULT NULL,
    sort_order INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS solves (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    solved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, challenge_id)
  )`,
  `CREATE TABLE IF NOT EXISTS submissions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    submitted_flag TEXT NOT NULL,
    is_correct INTEGER NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_solves_user_id ON solves(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_solves_challenge_id ON solves(challenge_id)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_score ON users(score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_users_team_name ON users(team_name)`,
  `ALTER TABLE users ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE settings ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE notifications ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE challenges ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE solves ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE submissions ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='Deny anon users') THEN
      CREATE POLICY "Deny anon users" ON users FOR ALL TO anon USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='Deny auth users') THEN
      CREATE POLICY "Deny auth users" ON users FOR ALL TO authenticated USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='settings' AND policyname='Deny anon settings') THEN
      CREATE POLICY "Deny anon settings" ON settings FOR ALL TO anon USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='settings' AND policyname='Deny auth settings') THEN
      CREATE POLICY "Deny auth settings" ON settings FOR ALL TO authenticated USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='Deny anon notifications') THEN
      CREATE POLICY "Deny anon notifications" ON notifications FOR ALL TO anon USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='Deny auth notifications') THEN
      CREATE POLICY "Deny auth notifications" ON notifications FOR ALL TO authenticated USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='challenges' AND policyname='Deny anon challenges') THEN
      CREATE POLICY "Deny anon challenges" ON challenges FOR ALL TO anon USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='challenges' AND policyname='Deny auth challenges') THEN
      CREATE POLICY "Deny auth challenges" ON challenges FOR ALL TO authenticated USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='solves' AND policyname='Deny anon solves') THEN
      CREATE POLICY "Deny anon solves" ON solves FOR ALL TO anon USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='solves' AND policyname='Deny auth solves') THEN
      CREATE POLICY "Deny auth solves" ON solves FOR ALL TO authenticated USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='submissions' AND policyname='Deny anon submissions') THEN
      CREATE POLICY "Deny anon submissions" ON submissions FOR ALL TO anon USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='submissions' AND policyname='Deny auth submissions') THEN
      CREATE POLICY "Deny auth submissions" ON submissions FOR ALL TO authenticated USING (false);
    END IF;
  END $$`
];

async function run() {
  console.log('🔌 Connecting to Supabase PostgreSQL...');
  console.log('   Host: aws-0-ap-south-1.pooler.supabase.com:6543');
  console.log('   User: postgres.' + PROJECT_REF);

  try {
    await client.connect();
    console.log('✅ Connected!\n');

    for (let i = 0; i < tables.length; i++) {
      const stmt = tables[i].trim();
      const label = stmt.substring(0, 60).replace(/\n/g, ' ') + '...';
      try {
        await client.query(stmt);
        console.log(`✓ [${i + 1}/${tables.length}] ${label}`);
      } catch (e) {
        if (e.message.includes('already exists')) {
          console.log(`⟳ [${i + 1}/${tables.length}] Already exists — skipped`);
        } else {
          console.log(`⚠ [${i + 1}/${tables.length}] ${e.message}`);
        }
      }
    }

    console.log('\n🎉 Schema setup complete! All tables are ready.');
    console.log('\nNext: npm run dev');

  } catch (e) {
    console.error('\n❌ Connection failed:', e.message);
    console.error('\nTry using the Supabase Dashboard SQL Editor instead:');
    console.error('https://supabase.com/dashboard/project/ymmwszzwbacjiisifkyb/sql/new');
    console.error('(Copy and paste db/schema.sql)\n');
  } finally {
    await client.end();
  }
}

run();
