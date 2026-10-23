const crypto = require('crypto');
const { q, one } = require('./db');

/* ---------- sign-in with Google (US-16) ----------
   SRS-26: Google checks who the person is, so we never see or store a
   password. SRS-27: we only let in addresses that end in @ku.th.

   The flow:
     1. /auth/google          sends the browser to Google's sign-in page
     2. Google sends it back to /auth/google/callback with a one-time code
     3. we swap the code for the person's verified email at Google
     4. @ku.th -> find or create the user and start the session
        anything else -> back to the login page with a message, no account made

   The Client ID and Secret come from .env (never from the code or GitHub). */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// The two Google addresses can be pointed at a fake Google in tests.
const GOOGLE_TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKENINFO_URL = process.env.GOOGLE_TOKENINFO_URL || 'https://oauth2.googleapis.com/tokeninfo';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';

const KU_DOMAIN = '@ku.th';
const isKuEmail = (email) => typeof email === 'string' && email.toLowerCase().endsWith(KU_DOMAIN);

/** Back to the login page with a reason the page turns into a message. */
const backToLogin = (res, reason, email) =>
  res.redirect('/index.html?error=' + reason + (email ? '&email=' + encodeURIComponent(email) : ''));

/** Find the user by email, or create them the first time they sign in. */
async function findOrCreateUser(email, name) {
  let user = await one('SELECT id, email, name FROM users WHERE email = ?', [email]);
  if (!user) {
    const r = await q('INSERT INTO users (email, name) VALUES (?, ?)', [email, name]);
    user = { id: r.insertId, email, name };
  }
  return user;
}

/** GET /api/auth/google - step 1, off to Google. */
function googleStart(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return backToLogin(res, 'setup');
  }

  // A random value we check when Google sends the browser back, so nobody
  // can trick a browser into finishing a sign-in it never started.
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // No hd=ku.th hint: with it, Google jumps straight to KU's SSO and that
    // hand-off can fail in some browsers. Google's own page is shown instead,
    // and the @ku.th rule is enforced in the callback below (SRS-27).
    prompt: 'select_account',
  });
  res.redirect(GOOGLE_AUTH_URL + '?' + params);
}

/** GET /api/auth/google/callback - steps 2 to 4. */
async function googleCallback(req, res) {
  const { code, state, error } = req.query;
  const expected = req.session.oauthState;
  delete req.session.oauthState;

  if (error) return backToLogin(res, 'cancelled');                     // closed Google's page
  if (!code || !state || state !== expected) return backToLogin(res, 'failed');

  // Swap the one-time code for an ID token.
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokens.id_token) return backToLogin(res, 'failed');

  // Ask Google to check the token's signature and give us what it says.
  const infoRes = await fetch(GOOGLE_TOKENINFO_URL + '?id_token=' + encodeURIComponent(tokens.id_token));
  const info = await infoRes.json().catch(() => ({}));
  const verified = info.email_verified === true || info.email_verified === 'true';
  if (!infoRes.ok || info.aud !== process.env.GOOGLE_CLIENT_ID || !verified) {
    return backToLogin(res, 'failed');
  }

  // SRS-27: not @ku.th -> refused, and no account is created (US-16).
  const email = String(info.email || '').toLowerCase();
  if (!isKuEmail(email)) return backToLogin(res, 'domain', email);

  const user = await findOrCreateUser(email, info.name || email.split('@')[0]);
  req.session.user = { id: user.id, email: user.email, name: user.name };
  res.redirect('/my-classrooms.html');
}

/**
 * POST /api/auth/test-login  { email }
 * Only for the automated tests, which cannot click through Google. The route
 * does not exist at all unless TEST_LOGIN=1 is set in .env. It still only
 * lets in @ku.th, and still stores no password.
 */
async function testLogin(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!isKuEmail(email)) return res.status(403).json({ error: 'Only @ku.th accounts can sign in' });
  const user = await findOrCreateUser(email, email.split('@')[0]);
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
  googleStart, googleCallback, testLogin, me, logout, requireAuth,
  loadMembership, requireOwner, requireStaff,
};
