const initSqlJs = require('sql.js');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.NODE_ENV === 'production' ? '/data/ctf.db' : path.join(__dirname, 'ctf.db');

let database = null;

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function saveDatabase() {
  if (database) {
    const data = database.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

const db = {
  prepare(sql) {
    return {
      get(...args) {
        try {
          const stmt = database.prepare(sql);
          if (args.length > 0) {
            stmt.bind(args);
          }
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return undefined;
        } catch (e) {
          return undefined;
        }
      },
      all(...args) {
        try {
          const results = [];
          const stmt = database.prepare(sql);
          if (args.length > 0) {
            stmt.bind(args);
          }
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        } catch (e) {
          return [];
        }
      },
      run(...args) {
        try {
          if (args.length > 0) {
            database.run(sql, args);
          } else {
            database.run(sql);
          }
          const changes = database.getRowsModified();
          const lastInsertRowid = db.prepare('SELECT last_insert_rowid() as id').get().id;
          saveDatabase();
          return { changes, lastInsertRowid };
        } catch (e) {
          console.error('SQL run error:', e.message);
          return { changes: 0, lastInsertRowid: 0 };
        }
      }
    };
  },

  exec(sql) {
    database.exec(sql);
    saveDatabase();
  },

  async initialize() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      database = new SQL.Database(fileBuffer);
    } else {
      database = new SQL.Database();
    }

    // Create tables
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        team_name TEXT DEFAULT NULL,
        score INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        points INTEGER NOT NULL,
        flag_hash TEXT NOT NULL,
        file_url TEXT DEFAULT NULL,
        sort_order INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS solves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        challenge_id INTEGER REFERENCES challenges(id),
        solved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, challenge_id)
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        challenge_id INTEGER REFERENCES challenges(id),
        submitted_flag TEXT NOT NULL,
        is_correct INTEGER NOT NULL,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed settings
    const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
    if (settingsCount && settingsCount.count === 0) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('ctf_paused', '0');
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('admin_username', 'madhavansedhu598@gmail.com');
    } else {
      const adminSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_username');
      if (!adminSetting) {
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('admin_username', 'madhavansedhu598@gmail.com');
      }
    }

    // Seed challenges if none exist
    const challengeCount = db.prepare('SELECT COUNT(*) as count FROM challenges').get();
    if (challengeCount && challengeCount.count === 0) {
      const challenges = [
        {
          title: 'First Contact',
          description: 'Not every secret is written on the page. Look beyond what is displayed.',
          category: 'OSINT',
          points: 100,
          flag: 'ZYROFEST-{CTF}{THE_SIGNAL_IS_CLEAR}',
          sort_order: 1
        },
        {
          title: 'Echoes Below',
          description: 'Some signals carry more information than expected. Filter the noise.',
          category: 'CRYPTO',
          points: 200,
          flag: 'ZYROFEST-{CTF}{DEEP_ECHO_RECEIVED}',
          sort_order: 2
        },
        {
          title: 'Lost Coordinates',
          description: 'A photograph recovered from the vessel may reveal the next location.',
          category: 'OSINT',
          points: 350,
          flag: 'ZYROFEST-{CTF}{MARIANA_DESCENT}',
          sort_order: 3
        },
        {
          title: 'The Forgotten Depths',
          description: 'Not every clue is genuine. Separate the truth from the noise.',
          category: 'FORENSICS',
          points: 500,
          flag: 'ZYROFEST-{CTF}{TRUTH_BENEATH_WAVES}',
          sort_order: 4
        },
        {
          title: 'Abyss Protocol',
          description: 'What remains is hidden beneath layers of deception.',
          category: 'CRYPTO',
          points: 750,
          flag: 'ZYROFEST-{CTF}{ABYSS_PROTOCOL_ACTIVATED}',
          sort_order: 5
        },
        {
          title: 'Anti-Gravity Event',
          description: 'Only those who connect every fragment can decode the final transmission.',
          category: 'MISC',
          points: 1000,
          flag: 'ZYROFEST-{CTF}{GRAVITY_IS_ONLY_A_SUGGESTION}',
          sort_order: 6
        }
      ];

      for (const c of challenges) {
        const flagHash = sha256(c.flag);
        db.prepare(
          'INSERT INTO challenges (title, description, category, points, flag_hash, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(c.title, c.description, c.category, c.points, flagHash, c.sort_order);
      }

      console.log('Seeded 6 challenges.');
    }

    // Seed admin user if not exists
    const adminSettingRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_username');
    const adminUsername = adminSettingRow ? adminSettingRow.value : 'madhavansedhu598@gmail.com';

    const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
    if (!adminUser) {
      const passwordHash = await bcrypt.hash('sedhu@678', 10);
      db.prepare(
        'INSERT INTO users (username, password_hash) VALUES (?, ?)'
      ).run(adminUsername, passwordHash);
      console.log(`Seeded admin user (${adminUsername} / sedhu@678).`);
    }

    console.log('Database initialized successfully.');
    return db;
  }
};

module.exports = db;
