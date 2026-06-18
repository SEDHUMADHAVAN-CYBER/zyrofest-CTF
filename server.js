require('dotenv').config();

const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db/supabase');
const { createClient } = require('@supabase/supabase-js');
const SupabaseStore = require('./db/supabase_session');

const supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const app = express();

// =====================
// SECURITY HEADERS (helmet)
// =====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    }
  },
  crossOriginEmbedderPolicy: false
}));

// =====================
// VIEW ENGINE
// =====================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// =====================
// BODY PARSING
// =====================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'static')));

// =====================
// FILE UPLOADS (multer in memory for Serverless)
// =====================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// =====================
// SESSION (secure config)
// =====================
app.use(session({
  store: new SupabaseStore({ client: supabaseClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 8  // 8 hours
  }
}));

app.use(flash());

// =====================
// RATE LIMITERS
// =====================

// Login: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false
});

// Flag submission: max 30 per 5 minutes per IP
const flagLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: 'Too many flag submissions. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false
});

// =====================
// GLOBAL MIDDLEWARE
// =====================
app.use(async (req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error')
  };

  try {
    const pauseSetting = await db.prepare("SELECT value FROM settings WHERE key = 'ctf_paused'").get();
    res.locals.ctf_paused = pauseSetting ? pauseSetting.value === '1' : false;

    const latestNotification = await db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 1").get();
    res.locals.notification = latestNotification || null;
  } catch (e) {
    res.locals.ctf_paused = false;
    res.locals.notification = null;
  }

  next();
});

// =====================
// HELPERS
// =====================
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// =====================
// AUTH MIDDLEWARE
// =====================
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  return res.redirect('/');
}

async function requireAdmin(req, res, next) {
  const adminSettingRow = await db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_username');
  const adminUsername = adminSettingRow ? adminSettingRow.value : process.env.ADMIN_USERNAME;

  if (req.session.user && req.session.user.username === adminUsername) {
    return next();
  }
  req.flash('error', 'Access denied.');
  return res.redirect('/dashboard');
}

async function checkCtfPaused(req, res, next) {
  const pauseSetting = await db.prepare("SELECT value FROM settings WHERE key = 'ctf_paused'").get();
  if (pauseSetting && pauseSetting.value === '1') {
    req.flash('error', 'The CTF is currently paused. No flag submissions are allowed.');
    return res.redirect('/dashboard');
  }
  next();
}

// =====================
// PUBLIC ROUTES
// =====================

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login');
});

// Rate-limited login
app.post('/', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    req.flash('error', 'Username and password are required.');
    return res.render('login');
  }

  const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    req.flash('error', 'Invalid username or password.');
    return res.render('login');
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    req.flash('error', 'Invalid username or password.');
    return res.render('login');
  }

  // Regenerate session on login to prevent session fixation
  const userData = { id: user.id, username: user.username, team_name: user.team_name, score: user.score };
  req.session.regenerate((err) => {
    if (err) {
      req.flash('error', 'Session error. Please try again.');
      return res.redirect('/');
    }
    req.session.user = userData;
    return res.redirect('/dashboard');
  });
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { username, password, confirm_password, team_action, team_name } = req.body;

  if (!username || !password || username.length < 8 || password.length < 8) {
    req.flash('error', 'Username and password must be at least 8 characters.');
    return res.render('register');
  }
  if (confirm_password && password !== confirm_password) {
    req.flash('error', 'Passwords do not match.');
    return res.render('register');
  }

  let finalTeamName = null;
  if (team_action === 'create') {
    if (!team_name) { req.flash('error', 'Team name required.'); return res.render('register'); }
    const existingTeam = await db.prepare('SELECT id FROM users WHERE team_name = ?').get(team_name);
    if (existingTeam) { req.flash('error', 'Team already exists. Choose Join instead.'); return res.render('register'); }
    finalTeamName = team_name;
  } else if (team_action === 'join') {
    if (!team_name) { req.flash('error', 'Team name required.'); return res.render('register'); }
    const existingTeam = await db.prepare('SELECT id FROM users WHERE team_name = ?').get(team_name);
    if (!existingTeam) { req.flash('error', 'Team not found.'); return res.render('register'); }
    finalTeamName = team_name;
  }

  const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    req.flash('error', 'Username already taken.');
    return res.render('register');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.prepare('INSERT INTO users (username, password_hash, team_name) VALUES (?, ?, ?)').run(username, passwordHash, finalTeamName);
  req.flash('success', 'Registration successful! Please login.');
  return res.redirect('/');
});

app.get('/dashboard', requireLogin, async (req, res) => {
  const challenges = await db.prepare('SELECT * FROM challenges ORDER BY sort_order ASC').all();
  const userId = req.session.user.id;

  const challengesWithStatus = await Promise.all(challenges.map(async c => ({
    ...c,
    solved: !!(await db.prepare('SELECT id FROM solves WHERE user_id = ? AND challenge_id = ?').get(userId, c.id))
  })));

  const categories = {};
  for (const c of challengesWithStatus) {
    if (!categories[c.category]) categories[c.category] = [];
    categories[c.category].push(c);
  }

  const freshUser = await db.prepare('SELECT score FROM users WHERE id = ?').get(userId);
  if (freshUser) req.session.user.score = freshUser.score;

  res.render('dashboard', { challenges: challengesWithStatus, categories });
});

app.get('/challenge/:id', requireLogin, async (req, res) => {
  const challenge = await db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  if (!challenge) { req.flash('error', 'Not found.'); return res.redirect('/dashboard'); }
  const solve = await db.prepare('SELECT id FROM solves WHERE user_id = ? AND challenge_id = ?').get(req.session.user.id, challenge.id);
  const solveCount = await db.prepare('SELECT COUNT(*) as count FROM solves WHERE challenge_id = ?').get(challenge.id);
  res.render('challenge', { challenge, solved: !!solve, solveCount: solveCount ? solveCount.count : 0 });
});

// Rate-limited flag submission
app.post('/challenge/:id', requireLogin, flagLimiter, checkCtfPaused, async (req, res) => {
  const challenge = await db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  if (!challenge) return res.redirect('/dashboard');

  const { flag } = req.body;
  if (!flag || flag.trim().length === 0 || flag.trim().length > 500) {
    req.flash('error', 'Invalid flag format.');
    return res.redirect(`/challenge/${challenge.id}`);
  }

  const userId = req.session.user.id;
  const submittedHash = sha256(flag.trim());
  const isCorrect = submittedHash === challenge.flag_hash ? 1 : 0;

  // Log submission with HASHED flag (not plaintext)
  await db.prepare('INSERT INTO submissions (user_id, challenge_id, submitted_flag, is_correct) VALUES (?, ?, ?, ?)').run(
    userId, challenge.id, submittedHash, isCorrect
  );

  if (isCorrect) {
    const existingSolve = await db.prepare('SELECT id FROM solves WHERE user_id = ? AND challenge_id = ?').get(userId, challenge.id);
    if (!existingSolve) {
      await db.prepare('INSERT INTO solves (user_id, challenge_id) VALUES (?, ?)').run(userId, challenge.id);
      await db.prepare('UPDATE users SET score = score + ? WHERE id = ?').run(challenge.points, userId);
      req.session.user.score = (req.session.user.score || 0) + challenge.points;
      req.flash('success', `Correct! You earned ${challenge.points} points.`);
    } else {
      req.flash('success', 'Correct flag, but already solved.');
    }
  } else {
    req.flash('error', 'Incorrect flag. Try again.');
  }

  return res.redirect(`/challenge/${challenge.id}`);
});

app.get('/scoreboard', async (req, res) => {
  const users = await db.prepare('SELECT id, username, team_name, score, created_at FROM users ORDER BY score DESC').all();
  res.render('scoreboard', { users });
});

app.get('/team', requireLogin, async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  res.render('team', { userData: user });
});

app.post('/team', requireLogin, async (req, res) => {
  await db.prepare('UPDATE users SET team_name = ? WHERE id = ?').run(req.body.team_name || null, req.session.user.id);
  req.session.user.team_name = req.body.team_name || null;
  req.flash('success', 'Team updated.');
  return res.redirect('/team');
});

app.get('/profile', requireLogin, async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const solvedChallenges = await db.prepare(
    'SELECT c.*, s.solved_at FROM solves s JOIN challenges c ON c.id = s.challenge_id WHERE s.user_id = ? ORDER BY s.solved_at DESC'
  ).all(user.id);
  const subCount = await db.prepare('SELECT COUNT(*) as count FROM submissions WHERE user_id = ?').get(user.id);
  const rank = await db.prepare('SELECT COUNT(*) as count FROM users WHERE score > (SELECT score FROM users WHERE id = ?)').get(user.id);
  res.render('profile', {
    userData: user,
    solvedChallenges,
    submissionCount: subCount ? subCount.count : 0,
    rank: rank ? rank.count + 1 : 1
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});


// =====================
// ADMIN DASHBOARD ROUTES
// =====================

app.get('/admin', requireLogin, requireAdmin, (req, res) => {
  res.redirect('/admin/dashboard');
});

app.get('/admin/dashboard', requireLogin, requireAdmin, async (req, res) => {
  const notificationsList = await db.prepare('SELECT * FROM notifications ORDER BY created_at DESC').all();
  const topUsers = await db.prepare('SELECT * FROM users ORDER BY score DESC LIMIT 5').all();
  const ctfSetting = await db.prepare("SELECT value FROM settings WHERE key = 'ctf_paused'").get();
  const ctf_paused = ctfSetting ? ctfSetting.value === '1' : false;
  res.render('admin_dashboard', { notificationsList, topUsers, ctf_paused });
});

app.post('/admin/pause', requireLogin, requireAdmin, async (req, res) => {
  const pauseSetting = await db.prepare("SELECT value FROM settings WHERE key = 'ctf_paused'").get();
  const newValue = (pauseSetting && pauseSetting.value === '1') ? '0' : '1';
  await db.prepare("UPDATE settings SET value = ? WHERE key = 'ctf_paused'").run(newValue);
  req.flash('success', newValue === '1' ? 'CTF PAUSED.' : 'CTF RESUMED.');
  return res.redirect('/admin/dashboard');
});

app.post('/admin/notification', requireLogin, requireAdmin, async (req, res) => {
  if (req.body.message) {
    await db.prepare('INSERT INTO notifications (message) VALUES (?)').run(req.body.message);
    req.flash('success', 'Notification posted.');
  }
  return res.redirect('/admin/dashboard');
});

app.post('/admin/notification/:id/delete', requireLogin, requireAdmin, async (req, res) => {
  await db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  req.flash('success', 'Notification deleted.');
  return res.redirect('/admin/dashboard');
});

// ADMIN: USERS
app.get('/admin/users', requireLogin, requireAdmin, async (req, res) => {
  const users = await db.prepare('SELECT * FROM users ORDER BY score DESC').all();
  res.render('admin_users', { users });
});

app.post('/admin/edit-user/:id', requireLogin, requireAdmin, async (req, res) => {
  await db.prepare('UPDATE users SET team_name = ?, score = ? WHERE id = ?').run(
    req.body.team_name || null, parseInt(req.body.score) || 0, req.params.id
  );
  req.flash('success', 'User updated.');
  return res.redirect('/admin/users');
});

// ADMIN: TEAMS
app.get('/admin/teams', requireLogin, requireAdmin, async (req, res) => {
  const teamsRaw = await db.prepare(
    'SELECT team_name, COUNT(*) as members, SUM(score) as total_score FROM users WHERE team_name IS NOT NULL GROUP BY team_name ORDER BY total_score DESC'
  ).all();
  res.render('admin_teams', { teams: teamsRaw });
});

app.post('/admin/rename-team', requireLogin, requireAdmin, async (req, res) => {
  if (req.body.old_name && req.body.new_name) {
    await db.prepare('UPDATE users SET team_name = ? WHERE team_name = ?').run(req.body.new_name, req.body.old_name);
    req.flash('success', 'Team renamed globally.');
  }
  return res.redirect('/admin/teams');
});

// ADMIN: CHALLENGES
app.get('/admin/challenges', requireLogin, requireAdmin, async (req, res) => {
  const challenges = await db.prepare('SELECT * FROM challenges ORDER BY sort_order ASC').all();
  res.render('admin_challenges', { challenges });
});

app.post('/admin/challenge', requireLogin, requireAdmin, upload.single('challenge_file'), async (req, res) => {
  const { title, description, category, points, flag, file_url, sort_order } = req.body;
  let finalFileUrl = file_url || null;
  if (req.file) {
    const fileName = Date.now() + '-' + req.file.originalname.replace(/\s+/g, '_');
    const { error } = await supabaseClient.storage.from('challenges').upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
    if (!error) {
      const { data } = supabaseClient.storage.from('challenges').getPublicUrl(fileName);
      finalFileUrl = data.publicUrl;
    } else {
      console.error('Supabase upload error:', error);
    }
  }
  const flagHash = sha256(flag.trim());
  await db.prepare(
    'INSERT INTO challenges (title, description, category, points, flag_hash, file_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(title, description, category, parseInt(points), flagHash, finalFileUrl, parseInt(sort_order) || 0);
  req.flash('success', 'Challenge added.');
  return res.redirect('/admin/challenges');
});

app.get('/admin/edit-challenge/:id', requireLogin, requireAdmin, async (req, res) => {
  const challenge = await db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  res.render('admin_edit_challenge', { challenge });
});

app.post('/admin/edit-challenge/:id', requireLogin, requireAdmin, upload.single('challenge_file'), async (req, res) => {
  const { title, description, category, points, flag, file_url, sort_order } = req.body;
  let finalFileUrl = file_url || null;
  if (req.file) {
    const fileName = Date.now() + '-' + req.file.originalname.replace(/\s+/g, '_');
    const { error } = await supabaseClient.storage.from('challenges').upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
    if (!error) {
      const { data } = supabaseClient.storage.from('challenges').getPublicUrl(fileName);
      finalFileUrl = data.publicUrl;
    } else {
      console.error('Supabase upload error:', error);
    }
  }

  if (flag && flag.trim() !== '') {
    await db.prepare(
      'UPDATE challenges SET title=?, description=?, category=?, points=?, flag_hash=?, file_url=COALESCE(?, file_url), sort_order=? WHERE id=?'
    ).run(title, description, category, parseInt(points), sha256(flag.trim()), finalFileUrl, parseInt(sort_order) || 0, req.params.id);
  } else {
    await db.prepare(
      'UPDATE challenges SET title=?, description=?, category=?, points=?, file_url=COALESCE(?, file_url), sort_order=? WHERE id=?'
    ).run(title, description, category, parseInt(points), finalFileUrl, parseInt(sort_order) || 0, req.params.id);
  }

  // Recalculate all user scores
  const users = await db.prepare('SELECT id FROM users').all();
  for (const u of users) {
    const totalScore = await db.prepare(
      'SELECT COALESCE(SUM(c.points), 0) as total FROM solves s JOIN challenges c ON c.id = s.challenge_id WHERE s.user_id = ?'
    ).get(u.id);
    await db.prepare('UPDATE users SET score = ? WHERE id = ?').run(
      totalScore ? totalScore.total : 0, u.id
    );
  }

  req.flash('success', 'Challenge updated.');
  return res.redirect('/admin/challenges');
});

app.post('/admin/challenge/:id/delete', requireLogin, requireAdmin, async (req, res) => {
  await db.prepare('DELETE FROM submissions WHERE challenge_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM solves WHERE challenge_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM challenges WHERE id = ?').run(req.params.id);
  req.flash('success', 'Challenge deleted.');
  return res.redirect('/admin/challenges');
});

// ADMIN: SETTINGS
app.get('/admin/settings', requireLogin, requireAdmin, async (req, res) => {
  const settingRow = await db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_username');
  const adminUsername = settingRow ? settingRow.value : '';
  res.render('admin_settings', { adminUsername });
});

app.post('/admin/settings/change-admin', requireLogin, requireAdmin, async (req, res) => {
  const { new_username, new_password } = req.body;
  if (new_username && new_password) {
    const passwordHash = await bcrypt.hash(new_password, 10);
    const oldAdmin = await db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_username');
    await db.prepare('DELETE FROM users WHERE username = ?').run(oldAdmin.value);
    await db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(new_username, passwordHash);
    await db.prepare("UPDATE settings SET value = ? WHERE key = 'admin_username'").run(new_username);
    req.session.user.username = new_username;
    req.flash('success', 'Admin credentials updated successfully.');
  }
  return res.redirect('/admin/settings');
});

// ADMIN: PROJECTOR (Live Leaderboard)
app.get('/admin/projector', requireLogin, requireAdmin, async (req, res) => {
  const users = await db.prepare(
    'SELECT id, username, team_name, score FROM users ORDER BY score DESC LIMIT 10'
  ).all();
  const notification = await db.prepare('SELECT message FROM notifications ORDER BY created_at DESC LIMIT 1').get();
  res.render('projector', { users, notification });
});


// =====================
// START SERVER OR EXPORT FOR SERVERLESS
// =====================

if (require.main === module) {
  // Running locally
  (async () => {
    try {
      await db.initialize();
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => {
        console.log(`✅ ZYROFEST-CTF running on http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error('❌ Failed to start server:', err);
      process.exit(1);
    }
  })();
}

// Export for Firebase Cloud Functions
module.exports = app;
