/**
 * db/supabase.js
 * ============================================================
 * Supabase client wrapper for ZYROFEST CTF Platform
 * Replaces the old sql.js (SQLite) db/init.js
 *
 * Uses the service role key (server-side ONLY — never expose to browser).
 * RLS is enabled on all tables but bypassed by the service role for
 * server-side operations.
 * ============================================================
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

// Create the Supabase client with service role (bypasses RLS for server-side)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// ============================================================
// Database helper — mirrors the original db.prepare().get/all/run() API
// so server.js changes are minimal
// ============================================================

const db = {
  /**
   * Provides a chainable interface: db.prepare(sql).get(...), .all(...), .run(...)
   * This wraps Supabase queries to match the old synchronous SQLite API.
   * NOTE: All methods here are now async; server.js must await them.
   */
  prepare(sql) {
    return new QueryBuilder(sql);
  },

  async initialize() {
    console.log('🔌 Connecting to Supabase...');

    // Verify connection
    const { error: pingError } = await supabase.from('settings').select('key').limit(1);
    if (pingError && pingError.code !== 'PGRST116') {
      console.error('❌ Supabase connection failed:', pingError.message);
      throw pingError;
    }

    // Seed settings if empty
    const { data: settingsRows } = await supabase.from('settings').select('key');
    if (!settingsRows || settingsRows.length === 0) {
      await supabase.from('settings').insert([
        { key: 'ctf_paused', value: '0' },
        { key: 'admin_username', value: process.env.ADMIN_USERNAME || 'admin@zyrofest.ctf' }
      ]);
    } else {
      const { data: adminSetting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'admin_username')
        .single();

      if (!adminSetting) {
        await supabase.from('settings').insert([
          { key: 'admin_username', value: process.env.ADMIN_USERNAME || 'admin@zyrofest.ctf' }
        ]);
      }
    }

    // Seed challenges if none exist
    const { data: existingChallenges } = await supabase.from('challenges').select('id').limit(1);
    if (!existingChallenges || existingChallenges.length === 0) {
      const challenges = [
        {
          title: 'First Contact',
          description: 'Not every secret is written on the page. Look beyond what is displayed.',
          category: 'OSINT',
          points: 100,
          flag_hash: sha256(process.env.FLAG_1 || ''),
          sort_order: 1
        },
        {
          title: 'Echoes Below',
          description: 'Some signals carry more information than expected. Filter the noise.',
          category: 'CRYPTO',
          points: 200,
          flag_hash: sha256(process.env.FLAG_2 || ''),
          sort_order: 2
        },
        {
          title: 'Lost Coordinates',
          description: 'A photograph recovered from the vessel may reveal the next location.',
          category: 'OSINT',
          points: 350,
          flag_hash: sha256(process.env.FLAG_3 || ''),
          sort_order: 3
        },
        {
          title: 'The Forgotten Depths',
          description: 'Not every clue is genuine. Separate the truth from the noise.',
          category: 'FORENSICS',
          points: 500,
          flag_hash: sha256(process.env.FLAG_4 || ''),
          sort_order: 4
        },
        {
          title: 'Abyss Protocol',
          description: 'What remains is hidden beneath layers of deception.',
          category: 'CRYPTO',
          points: 750,
          flag_hash: sha256(process.env.FLAG_5 || ''),
          sort_order: 5
        },
        {
          title: 'Anti-Gravity Event',
          description: 'Only those who connect every fragment can decode the final transmission.',
          category: 'MISC',
          points: 1000,
          flag_hash: sha256(process.env.FLAG_6 || ''),
          sort_order: 6
        }
      ];

      const { error: seedErr } = await supabase.from('challenges').insert(challenges);
      if (seedErr) {
        console.error('❌ Failed to seed challenges:', seedErr.message);
      } else {
        console.log('🎯 Seeded 6 challenges.');
      }
    }

    // Seed admin user if not exists
    const adminUsername = process.env.ADMIN_USERNAME || 'admin@zyrofest.ctf';
    const { data: adminUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', adminUsername)
      .single();

    if (!adminUser) {
      const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'changeme123', 10);
      await supabase.from('users').insert([{ username: adminUsername, password_hash: passwordHash }]);
      console.log(`👤 Seeded admin user (${adminUsername}).`);
    }

    console.log('✅ Database initialized successfully.');
    return db;
  }
};

// ============================================================
// QueryBuilder: translates the old prepare().get/all/run() API
// to async Supabase queries by parsing simple SQL patterns
// ============================================================

class QueryBuilder {
  constructor(sql) {
    this.sql = sql.trim();
  }

  // Run a SELECT and return the first row (or undefined)
  async get(...args) {
    try {
      const result = await this._executeSelect(args);
      return result && result.length > 0 ? result[0] : undefined;
    } catch (e) {
      console.error('DB get error:', e.message);
      return undefined;
    }
  }

  // Run a SELECT and return all rows
  async all(...args) {
    try {
      const result = await this._executeSelect(args);
      return result || [];
    } catch (e) {
      console.error('DB all error:', e.message);
      return [];
    }
  }

  // Run an INSERT/UPDATE/DELETE and return { changes, lastInsertRowid }
  async run(...args) {
    try {
      return await this._executeMutation(args);
    } catch (e) {
      console.error('DB run error:', e.message);
      return { changes: 0, lastInsertRowid: 0 };
    }
  }

  // ============================================================
  // SQL Interpreter — maps common SQL patterns to Supabase calls
  // ============================================================

  async _executeSelect(args) {
    const sql = this.sql;

    // --- SELECT COUNT(*) as count FROM table ---
    const countMatch = sql.match(/SELECT COUNT\(\*\) as count FROM (\w+)/i);
    if (countMatch) {
      const table = countMatch[1];
      let query = supabase.from(table).select('*', { count: 'exact', head: true });
      query = this._applyWhere(query, sql, args);
      const { count } = await query;
      return [{ count: count || 0 }];
    }

    // --- SELECT last_insert_rowid() --- (not needed in Supabase, handled inline)
    if (sql.includes('last_insert_rowid()')) {
      return [{ id: this._lastInsertId || 0 }];
    }

    // --- SELECT COALESCE(SUM(c.points), 0) as total FROM solves JOIN challenges ---
    if (sql.includes('COALESCE(SUM') && sql.includes('solves') && sql.includes('challenges')) {
      const userIdMatch = sql.match(/user_id = \?/i);
      const userId = args[0];
      const { data, error } = await supabase
        .from('solves')
        .select('challenge_id, challenges(points)')
        .eq('user_id', userId);
      if (error) return [{ total: 0 }];
      const total = (data || []).reduce((sum, row) => sum + (row.challenges?.points || 0), 0);
      return [{ total }];
    }

    // --- SELECT ... FROM challenges JOIN solves ---
    if (sql.includes('solves s JOIN challenges c') || sql.includes('challenges c ON c.id = s.challenge_id')) {
      const userId = args[0];
      const { data, error } = await supabase
        .from('solves')
        .select('solved_at, challenges(*)')
        .eq('user_id', userId)
        .order('solved_at', { ascending: false });
      if (error) return [];
      return (data || []).map(row => ({ ...row.challenges, solved_at: row.solved_at }));
    }

    // --- SELECT COUNT(*) as count FROM users WHERE score > (subquery) ---
    if (sql.includes('score >') && sql.includes('SELECT score FROM users WHERE id')) {
      const userId = args[0];
      const { data: user } = await supabase.from('users').select('score').eq('id', userId).single();
      const myScore = user?.score || 0;
      const { count } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gt('score', myScore);
      return [{ count: count || 0 }];
    }

    // --- SELECT COUNT(*) as count FROM submissions WHERE user_id = ? ---
    if (sql.includes('submissions') && sql.includes('COUNT')) {
      const userId = args[0];
      const { count } = await supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      return [{ count: count || 0 }];
    }

    // --- SELECT COUNT(*) as count FROM solves WHERE challenge_id = ? ---
    if (sql.includes('solves') && sql.includes('COUNT') && sql.includes('challenge_id')) {
      const challengeId = args[0];
      const { count } = await supabase
        .from('solves')
        .select('*', { count: 'exact', head: true })
        .eq('challenge_id', challengeId);
      return [{ count: count || 0 }];
    }

    // --- Generic SELECT with simple WHERE clauses ---
    const tableMatch = sql.match(/FROM (\w+)/i);
    if (!tableMatch) return [];
    const table = tableMatch[1];

    let query = supabase.from(table).select('*');
    query = this._applyWhere(query, sql, args);
    query = this._applyOrderBy(query, sql);
    query = this._applyLimit(query, sql);

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116') return []; // No rows
      console.error(`DB SELECT error (${table}):`, error.message);
      return [];
    }
    return data || [];
  }

  async _executeMutation(args) {
    const sql = this.sql;

    // --- INSERT ---
    if (/^INSERT/i.test(sql)) {
      return await this._executeInsert(sql, args);
    }

    // --- UPDATE ---
    if (/^UPDATE/i.test(sql)) {
      return await this._executeUpdate(sql, args);
    }

    // --- DELETE ---
    if (/^DELETE/i.test(sql)) {
      return await this._executeDelete(sql, args);
    }

    return { changes: 0, lastInsertRowid: 0 };
  }

  async _executeInsert(sql, args) {
    const tableMatch = sql.match(/INSERT INTO (\w+)\s*\(([^)]+)\)/i);
    if (!tableMatch) return { changes: 0, lastInsertRowid: 0 };

    const table = tableMatch[1];
    const columns = tableMatch[2].split(',').map(c => c.trim());
    const row = {};
    columns.forEach((col, i) => {
      row[col] = args[i] !== undefined ? args[i] : null;
    });

    const { data, error } = await supabase.from(table).insert([row]).select('id').single();
    if (error) {
      console.error(`DB INSERT error (${table}):`, error.message);
      return { changes: 0, lastInsertRowid: 0 };
    }
    this._lastInsertId = data?.id || 0;
    return { changes: 1, lastInsertRowid: data?.id || 0 };
  }

  async _executeUpdate(sql, args) {
    const tableMatch = sql.match(/UPDATE (\w+) SET (.+?) WHERE/i);
    if (!tableMatch) return { changes: 0, lastInsertRowid: 0 };

    const table = tableMatch[1];
    const setClause = tableMatch[2];

    // Parse SET clause columns (handle COALESCE)
    const setParts = setClause.split(',').map(p => p.trim());
    const updates = {};
    let argIdx = 0;

    for (const part of setParts) {
      const colMatch = part.match(/^(\w+)\s*=/);
      if (!colMatch) continue;
      const col = colMatch[1];

      // Handle COALESCE(?, existing_col) — use value only if not null
      if (part.includes('COALESCE')) {
        const val = args[argIdx++];
        if (val !== null && val !== undefined && val !== '') {
          updates[col] = val;
        }
        // else keep existing (don't include in updates)
      } else {
        updates[col] = args[argIdx++] !== undefined ? args[argIdx - 1] : null;
      }
    }

    // Parse WHERE clause
    const whereMatch = sql.match(/WHERE (.+)$/i);
    let query = supabase.from(table).update(updates);
    if (whereMatch) {
      const whereClause = whereMatch[1];
      const conditions = whereClause.split(/\s+AND\s+/i);
      for (const cond of conditions) {
        const eqMatch = cond.match(/(\w+)\s*=\s*\?/i);
        if (eqMatch) {
          query = query.eq(eqMatch[1], args[argIdx++]);
        }
      }
    }

    const { error } = await query;
    if (error) {
      console.error(`DB UPDATE error (${table}):`, error.message);
      return { changes: 0, lastInsertRowid: 0 };
    }
    return { changes: 1, lastInsertRowid: 0 };
  }

  async _executeDelete(sql, args) {
    const tableMatch = sql.match(/DELETE FROM (\w+)/i);
    if (!tableMatch) return { changes: 0, lastInsertRowid: 0 };
    const table = tableMatch[1];

    let query = supabase.from(table).delete();
    query = this._applyWhere(query, sql, args);

    const { error } = await query;
    if (error) {
      console.error(`DB DELETE error (${table}):`, error.message);
      return { changes: 0, lastInsertRowid: 0 };
    }
    return { changes: 1, lastInsertRowid: 0 };
  }

  // ============================================================
  // WHERE / ORDER BY / LIMIT clause parsers
  // ============================================================

  _applyWhere(query, sql, args) {
    const whereMatch = sql.match(/WHERE (.+?)(?:\s+ORDER|\s+LIMIT|$)/is);
    if (!whereMatch) return query;

    const whereClause = whereMatch[1].trim();
    const conditions = whereClause.split(/\s+AND\s+/i);
    let argIdx = 0;

    for (const cond of conditions) {
      // col = ?
      const eqMatch = cond.match(/(\w+)\s*=\s*\?/i);
      if (eqMatch) {
        query = query.eq(eqMatch[1], args[argIdx++]);
        continue;
      }
      // col IS NOT NULL
      const notNullMatch = cond.match(/(\w+)\s+IS NOT NULL/i);
      if (notNullMatch) {
        query = query.not(notNullMatch[1], 'is', null);
        continue;
      }
      // col IS NULL
      const nullMatch = cond.match(/(\w+)\s+IS NULL/i);
      if (nullMatch) {
        query = query.is(nullMatch[1], null);
        continue;
      }
      // col > ?
      const gtMatch = cond.match(/(\w+)\s*>\s*\?/i);
      if (gtMatch) {
        query = query.gt(gtMatch[1], args[argIdx++]);
      }
    }

    return query;
  }

  _applyOrderBy(query, sql) {
    const orderMatch = sql.match(/ORDER BY (.+?)(?:\s+LIMIT|$)/is);
    if (!orderMatch) return query;

    const orderParts = orderMatch[1].split(',');
    for (const part of orderParts) {
      const m = part.trim().match(/(\w+(?:\.\w+)?)\s*(ASC|DESC)?/i);
      if (m) {
        const col = m[1].includes('.') ? m[1].split('.')[1] : m[1];
        const ascending = !m[2] || m[2].toUpperCase() === 'ASC';
        query = query.order(col, { ascending });
      }
    }
    return query;
  }

  _applyLimit(query, sql) {
    const limitMatch = sql.match(/LIMIT (\d+)/i);
    if (limitMatch) {
      query = query.limit(parseInt(limitMatch[1]));
    }
    return query;
  }
}

module.exports = db;
