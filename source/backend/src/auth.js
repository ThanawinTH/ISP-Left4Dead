const crypto = require('crypto');
const { q, one } = require('./db');

/* Passwords are stored as "salt:hash" — the password itself never touches the DB. */
function hash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}

function matches(password, stored) {
  const [salt] = stored.split(':');
  return hash(password, salt) === stored;
}

/**
 * POST /api/auth/login  { email, password }
 * SRS-27: only @ku.th. The name is the part before the @.
 * A new email registers on first sign-in; after that the password must match.
 */
async function login(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (!email.endsWith('@ku.th')) return res.status(403).json({ error: 'Only @ku.th accounts can sign in' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const name = email.split('@')[0];
  let user = await one('SELECT * FROM users WHERE email = ?', [email]);

  if (!user) {
    const r = await q('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)',
      [email, name, hash(password)]);
    user = { id: r.insertId, email, name };
  } else if (!matches(password, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong password for this account' });
  }

  req.session.user = { id: user.id, email: user.email, name: user.name };
  res.json({ user: req.session.user });
}

function me(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: req.session.user });
}

function logout(req, res) {
  req.session.destroy(() => res.json({ ok: true }));
}

/** Blocks every route below it unless the user is signed in. */
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}

module.exports = { login, me, logout, requireAuth };
