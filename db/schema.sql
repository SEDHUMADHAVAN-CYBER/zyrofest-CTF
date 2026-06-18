-- ============================================================
-- ZYROFEST CTF - Supabase Database Schema
-- Run via: Supabase Dashboard > SQL Editor
-- Or via: supabase db query --db-url <connection-string>
-- ============================================================

-- Enable UUID extension (optional, we use BIGSERIAL for IDs)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  team_name TEXT DEFAULT NULL,
  score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SETTINGS TABLE (key-value config store)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHALLENGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS challenges (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  points INTEGER NOT NULL,
  flag_hash TEXT NOT NULL,     -- SHA256 hash of the flag (never store plaintext flags in DB)
  file_url TEXT DEFAULT NULL,
  sort_order INTEGER DEFAULT 0
);

-- ============================================================
-- SOLVES TABLE (one row per user per solved challenge)
-- ============================================================
CREATE TABLE IF NOT EXISTS solves (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  solved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, challenge_id)
);

-- ============================================================
-- SUBMISSIONS TABLE
-- Stores HASHED flag attempts (not plaintext) for audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  submitted_flag TEXT NOT NULL,   -- This is a SHA256 hash, never plaintext
  is_correct INTEGER NOT NULL,    -- 1 = correct, 0 = wrong
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_solves_user_id ON solves(user_id);
CREATE INDEX IF NOT EXISTS idx_solves_challenge_id ON solves(challenge_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_score ON users(score DESC);
CREATE INDEX IF NOT EXISTS idx_users_team_name ON users(team_name);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- The application uses the service_role key (bypasses RLS).
-- We enable RLS + deny-all policies to block any direct
-- public API access via anon/authenticated keys.
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE solves ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Deny ALL access to anon and authenticated roles
-- The server-side service_role bypasses these automatically

CREATE POLICY "Deny all for anon on users" ON users
  FOR ALL TO anon USING (false);

CREATE POLICY "Deny all for authenticated on users" ON users
  FOR ALL TO authenticated USING (false);

CREATE POLICY "Deny all for anon on settings" ON settings
  FOR ALL TO anon USING (false);

CREATE POLICY "Deny all for authenticated on settings" ON settings
  FOR ALL TO authenticated USING (false);

CREATE POLICY "Deny all for anon on notifications" ON notifications
  FOR ALL TO anon USING (false);

CREATE POLICY "Deny all for authenticated on notifications" ON notifications
  FOR ALL TO authenticated USING (false);

CREATE POLICY "Deny all for anon on challenges" ON challenges
  FOR ALL TO anon USING (false);

CREATE POLICY "Deny all for authenticated on challenges" ON challenges
  FOR ALL TO authenticated USING (false);

CREATE POLICY "Deny all for anon on solves" ON solves
  FOR ALL TO anon USING (false);

CREATE POLICY "Deny all for authenticated on solves" ON solves
  FOR ALL TO authenticated USING (false);

CREATE POLICY "Deny all for anon on submissions" ON submissions
  FOR ALL TO anon USING (false);

CREATE POLICY "Deny all for authenticated on submissions" ON submissions
  FOR ALL TO authenticated USING (false);
