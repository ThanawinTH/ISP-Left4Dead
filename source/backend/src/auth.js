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

/* ---------- classroom guards (US-4) ---------- */

/** Roles that are allowed to change things inside a classroom. */
const STAFF_ROLES = ['lecturer', 'ta', 'staff'];

/**
 * Finds the caller's membership for the classroom in :id and hangs it on the
 * request. We read the role from the database on every request instead of
 * trusting the session, so a promotion takes effect straight away - the member
 * never has to leave and rejoin the classroom.
 */
async function loadMembership(req, res, next) {
  const row = await one(
    `SELECT m.role, c.owner_id
       FROM memberships m
       JOIN classrooms c ON c.id = m.classroom_id
      WHERE m.classroom_id = ? AND m.user_id = ?`,
    [req.params.id, req.session.user.id]);

  if (!row) return res.status(403).json({ error: 'You are not a member of this classroom' });

  req.role = row.role;
  req.isOwner = row.owner_id === req.session.user.id;
  req.isStaff = STAFF_ROLES.includes(row.role);
  next();
}

/** Only the lecturer who created the classroom may change someone's role. */
function requireOwner(req, res, next) {
  if (!req.isOwner) return res.status(403).json({ error: 'Only the classroom owner can do this' });
  next();
}

/** Lecturer, TA and staff may edit; students may not. Ready for US-5 and US-6. */
function requireStaff(req, res, next) {
  if (!req.isStaff) return res.status(403).json({ error: 'Staff role required' });
  next();
}

module.exports = {
  login, me, logout, requireAuth,
  loadMembership, requireOwner, requireStaff,
};
