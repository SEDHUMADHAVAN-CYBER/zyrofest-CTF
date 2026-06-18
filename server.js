const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const db = require('./db/init');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'static')));

// Secure Multer configuration with basic file type verification
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'static', 'uploads'));
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, Date.now() + '-' + safeName);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.zip', '.tar.gz', '.txt', '.pdf', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      return cb(null, true);
    }
    cb(new Error('Invalid file extension extension. Upload rejected.'));
  }
});

// Secure Session management driven by system environment variables
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-dev-secret-replace-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 day duration
  }
}));

app.use(flash());

// Global context middleware
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error')
  };
  
  try {
    const pauseSetting = db.prepare("SELECT value FROM settings WHERE key = 'ctf_paused'").get();
    res.locals.ctf_paused = pauseSetting ? pauseSetting.value === '1' : false;
    
    const latestNotification = db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 1").get();
    res.locals.notification = latestNotification || null;
  } catch(e) {
    res.locals.ctf_paused = false;
    res.locals.notification = null;
  }
  next();
});

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Authentication Wrappers
function requireLogin(req, res, next) {
  if (req.session.user) {
    return next();
  }
  return res.redirect('/');
}

function requireAdmin(req, res, next) {
  // Safe authentication checks against explicit database values
  if (req.session.user && req.session.user.username) {
    const adminSettingRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_username');
    const adminUsername = adminSettingRow ? adminSettingRow.value : 'madhavansedhu598@gmail.com';
    
    if (req.session.user.username === adminUsername) {
      return next();
    }
  }
  req.flash('error', 'Access denied.');
  return res.redirect('/dashboard');
}

function checkCtfPaused(req, res, next) {
  const pauseSetting = db.prepare("SELECT value FROM settings WHERE key = 'ctf_paused'").get();
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
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login');
});

app.post('/', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    req.flash('error', 'Username and password are required.');
    return res.render('login');
  }
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      req.flash('error', 'Invalid username or password.');
      return res.render('login');
    }
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      req.flash('error', 'Invalid username or password.');
      return res.render('login');
    }
    req.session.user = { id: user.id, username: user.username, team_name: user.team_name, score: user.score };
    return res.redirect('/dashboard');
  } catch (err) {
    req.flash('error', 'An internal server error occurred.');
    return res.render('login');
  }
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { username, password, confirm_password, team_action, team_name } = req.body;
  
  // Protect admin name registration injection space
  const adminSettingRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_username');
  const adminUsername = adminSettingRow ? adminSettingRow.value : 'madhavansedhu598@gmail.com';
  
  if (username === adminUsername) {
    req.flash('error', 'Username reserved.');
    return res.render('register');
  }

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
    if (!team_name) return req.flash('error', 'Team name required.') && res.render('register');
    const existingTeam = db.prepare('SELECT id FROM users WHERE team_name = ?').get(team_name);
    if (existingTeam) return req.flash('error', 'Team already exists. Choose Join instead.') && res.render('register');
    finalTeamName = team_name;
  } else if (team_action === 'join') {
    if (!team_name) return req.flash('error', 'Team name required.') && res.render('register');
    const existingTeam = db.prepare('SELECT id FROM users WHERE team_name = ?').get(team_name);
    if (!existingTeam) return req.flash('error', 'Team not found.') && res.render('register');
    finalTeamName = team_name;
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    req.flash('error', 'Username already taken.');
    return res.render('register');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, team_name) VALUES (?, ?, ?)').run(username, passwordHash, finalTeamName);
  req.flash('success', 'Registration successful! Please login.');
  return res.redirect('/');
});

app.get('/dashboard', requireLogin, (req, res) => {
  const challenges = db.prepare('SELECT * FROM challenges ORDER BY sort_order ASC').all();
  const userId = req.session.user.id;
  const challengesWithStatus = challenges.map(c => ({
    ...c, solved: !!db.prepare('SELECT id FROM solves WHERE user_id = ? AND challenge_id = ?').get(userId, c.id)
  }));
  const categories = {};
  for (const c of challengesWithStatus) {
    if (!categories[c.category]) categories[c.category] = [];
    categories[c.category].push(c);
  }
  const freshUser = db.prepare('SELECT score FROM users WHERE id = ?').get(userId);
  if (freshUser) req.session.user.score = freshUser.score;
  res.render('dashboard', { challenges: challengesWithStatus, categories });
});

app.get('/challenge/:id', requireLogin, (req, res) => {
  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  if (!challenge) return req.flash('error', 'Not found.') && res.redirect('/dashboard');
  const solve = db.prepare('SELECT id FROM solves WHERE user_id = ? AND challenge_id = ?').get(req.session.user.id, challenge.id);
  const solveCount = db.prepare('SELECT COUNT(*) as count FROM solves WHERE challenge_id = ?').get(challenge.id);
  res.render('challenge', { challenge, solved: !!solve, solveCount: solveCount ? solveCount.count : 0 });
});

app.post('/challenge/:id', requireLogin, checkCtfPaused, (req, res) => {
  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  if (!challenge) return res.redirect('/dashboard');
  const { flag } = req.body;
  const userId = req.session.user.id;
  
  if (!flag) {
    req.flash('error', 'Flag field cannot be blank.');
    return res.redirect(`/challenge/${challenge.id}`);
  }

  const isCorrect = sha256(flag.trim()) === challenge.flag_hash ? 1 : 0;
  db.prepare('INSERT INTO submissions (user_id, challenge_id, submitted_flag, is_correct) VALUES (?, ?, ?, ?)').run(userId, challenge.id, flag.trim(), isCorrect);

  if (isCorrect) {
    const existingSolve = db.prepare('SELECT id FROM solves WHERE user_id = ? AND challenge_id = ?').get(userId, challenge.id);
    if (!existingSolve) {
      db.prepare('INSERT INTO solves (user_id, challenge_id) VALUES (?, ?)').run(userId, challenge.id);
      db.prepare('UPDATE users SET score = score + ? WHERE id = ?').run(challenge.points, userId);
      req.flash('success', `Correct! You earned ${challenge.points} points.`);
    } else {
      req.flash('success', 'Correct flag, but already solved.');
    }
  } else {
    req.flash('error', 'Incorrect flag. Try again.');
  }
  return res.redirect(`/challenge/${challenge.id}`);
});

app.get('/scoreboard', (req, res) => {
  const users = db.prepare('SELECT id, username, team_name, score, created_at FROM users ORDER BY score DESC, created_at ASC').all();
  res.render('scoreboard', { users });
});

app.get('/team', requireLogin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  res.render('team', { userData: user });
});

app.post('/team', requireLogin, (req, res) => {
  db.prepare('UPDATE users SET team_name = ? WHERE id = ?').run(req.body.team_name || null, req.session.user.id);
  req.session.user.team_name = req.body.team_name || null;
  req.flash('success', 'Team updated.');
  return res.redirect('/team');
});

app.get('/profile', requireLogin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const solvedChallenges = db.prepare(`SELECT c.*, s.solved_at FROM solves s JOIN challenges c ON c.id = s.challenge_id WHERE s.user_id = ? ORDER BY s.solved_at DESC`).all(user.id);
  const subCount = db.prepare('SELECT COUNT(*) as count FROM submissions WHERE user_id = ?').get(user.id);
  const rank = db.prepare('SELECT COUNT(*) as count FROM users WHERE score > (SELECT score FROM users WHERE id = ?)').get(user.id);
  res.render('profile', { userData: user, solvedChallenges, submissionCount: subCount.count, rank: rank.count + 1 });
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

app.get('/admin/dashboard', requireLogin, requireAdmin, (req, res) => {
  const notificationsList = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC').all();
  const topUsers = db.prepare('SELECT * FROM users ORDER BY score DESC LIMIT 5').all();
  const pauseSetting = db.prepare("SELECT value FROM settings WHERE key = 'ctf_paused'").get();
  const ctf_paused = pauseSetting ? pauseSetting.value === '1' : false;
  res.render('admin_dashboard', { notificationsList, topUsers, ctf_paused });
});

app.post('/admin/pause', requireLogin, requireAdmin, (req, res) => {
  const pauseSetting = db.prepare("SELECT value FROM settings WHERE key = 'ctf_paused'").get();
  const newValue = (pauseSetting && pauseSetting.value === '1') ? '0' : '1';
  db.prepare("UPDATE settings SET value = ? WHERE key = 'ctf_paused'").run(newValue);
  req.flash('success', newValue === '1' ? 'CTF PAUSED.' : 'CTF RESUMED.');
  return res.redirect('/admin/dashboard');
});

app.post('/admin/notification', requireLogin, requireAdmin, (req, res) => {
  if (req.body.message) {
    db.prepare('INSERT INTO notifications (message) VALUES (?)').run(req.body.message);
    req.flash('success', 'Notification posted.');
  }
  return res.redirect('/admin/dashboard');
});

app.post('/admin/notification/:id/delete', requireLogin, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  req.flash('success', 'Notification deleted.');
  return res.redirect('/admin/dashboard');
});

app.get('/admin/users', requireLogin, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY score DESC').all();
  res.render('admin_users', { users });
});

app.post('/admin/edit-user/:id', requireLogin, requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET team_name = ?, score = ? WHERE id = ?').run(req.body.team_name || null, parseInt(req.body.score) || 0, req.params.id);
  req.flash('success', 'User updated.');
  return res.redirect('/admin/users');
});

app.get('/admin/teams', requireLogin, requireAdmin, (req, res) => {
  const teamsRaw = db.prepare('SELECT team_name, COUNT(*) as members, SUM(score) as total_score FROM users WHERE team_name IS NOT NULL GROUP BY team_name ORDER BY total_score DESC').all();
  res.render('admin_teams', { teams: teamsRaw });
});

app.post('/admin/rename-team', requireLogin, requireAdmin, (req, res) => {
  if (req.body.old_name && req.body.new_name) {
    db.prepare('UPDATE users SET team_name = ? WHERE team_name = ?').run(req.body.new_name, req.body.old_name);
    req.flash('success', 'Team renamed globally.');
  }
  return res.redirect('/admin/teams');
});

app.get('/admin/challenges', requireLogin, requireAdmin, (req, res) => {
  const challenges = db.prepare('SELECT * FROM challenges ORDER BY sort_order ASC').all();
  res.render('admin_challenges', { challenges });
});

app.post('/admin/challenge', requireLogin, requireAdmin, upload.single('challenge_file'), (req, res) => {
  const { title, description, category, points, flag, file_url, sort_order } = req.body;
  let finalFileUrl = file_url || null;
  if (req.file) {
    finalFileUrl = '/static/uploads/' + req.file.filename;
  }
  const flagHash = sha256(flag.trim());
  db.prepare('INSERT INTO challenges (title, description, category, points, flag_hash, file_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)').run(title, description, category, parseInt(points), flagHash, finalFileUrl, parseInt(sort_order) || 0);
  req.flash('success', 'Challenge added.');
  return res.redirect('/admin/challenges');
});

app.get('/admin/edit-challenge/:id', requireLogin, requireAdmin, (req, res) => {
  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  res.render('admin_edit_challenge', { challenge });
});

app.post('/admin/edit-challenge/:id', requireLogin, requireAdmin, upload.single('challenge_file'), (req, res) => {
  const { title, description, category, points, flag, file_url, sort_order } = req.body;
  let finalFileUrl = file_url || null;
  if (req.file) {
    finalFileUrl = '/static/uploads/' + req.file.filename;
  }
  
  if (flag && flag.trim() !== '') {
    db.prepare('UPDATE challenges SET title=?, description=?, category=?, points=?, flag_hash=?, file_url=COALESCE(?, file_url), sort_order=? WHERE id=?').run(title, description, category, parseInt(points), sha256(flag.trim()), finalFileUrl, parseInt(sort_order) || 0, req.params.id);
  } else {
    db.prepare('UPDATE challenges SET title=?, description=?, category=?, points=?, file_url=COALESCE(?, file_url), sort_order=? WHERE id=?').run(title, description, category, parseInt(points), finalFileUrl, parseInt(sort_order) || 0, req.params.id);
  }
  
  const users = db.prepare('SELECT id FROM users').all();
  for (const u of users) {
    const totalScore = db.prepare('SELECT COALESCE(SUM(c.points), 0) as total FROM solves s JOIN challenges c ON c.id = s.challenge_id WHERE s.user_id = ?').get(u.id);
    db.prepare('UPDATE users SET score = ? WHERE id = ?').run(totalScore ? totalScore.total : 0, u.id);
  }
  req.flash('success', 'Challenge updated.');
  return res.redirect('/admin/challenges');
});

app.post('/admin/challenge/:id/delete', requireLogin, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM submissions WHERE challenge_id = ?').run(req.params.id);
  db.prepare('DELETE FROM solves WHERE challenge_id = ?').run(req.params.id);
  db.prepare('DELETE FROM challenges WHERE id = ?').run(req.params.id);
  req.flash('success', 'Challenge deleted.');
  return res.redirect('/admin/challenges');
});

app.get('/admin/settings', requireLogin, requireAdmin, (req, res) => {
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_username');
  const adminUsername = setting ? setting.value : 'madhavansedhu598@gmail.com';
  res.render('admin_settings', { adminUsername });
});

app.post('/admin/settings/change-admin', requireLogin, requireAdmin, async (req, res) => {
  const { new_username, new_password } = req.body;
  if (new_username && new_password) {
    const passwordHash = await bcrypt.hash(new_password, 10);
    const oldAdminRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_username');
    const oldAdmin = oldAdminRow ? oldAdminRow.value : 'madhavansedhu598@gmail.com';
    
    // Update credentials inside existing database maps seamlessly
    db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE username = ?').run(new_username, passwordHash, oldAdmin);
    db.prepare("UPDATE settings SET value = ? WHERE key = 'admin_username'").run(new_username);
    
    req.session.user.username = new_username;
    req.flash('success', 'Admin credentials updated successfully.');
  }
  return res.redirect('/admin/settings');
});

app.get('/admin/projector', requireLogin, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, team_name, score FROM users ORDER BY score DESC, created_at ASC LIMIT 10').all();
  const notification = db.prepare('SELECT message FROM notifications ORDER BY created_at DESC LIMIT 1').get();
  res.render('projector', { users, notification: notification || null });
});

// =====================
// START SERVER
// =====================

(async () => {
  try {
    await db.initialize();
    app.listen(3000, () => {
      console.log('ZYROFEST-{CTF} running on http://localhost:3000');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
