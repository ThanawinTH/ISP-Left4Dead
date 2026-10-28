const { q, one } = require('./db');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I O 0 1 — easy to read aloud

/**
 * People read the code off a screen and type it back, so they leave out the
 * dash, use lower case, or paste it with a space on the end. Anything that has
 * the right letters and digits should get in.
 */
function normaliseJoinCode(input) {
  const bare = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!bare) return '';
  const body = bare.startsWith('KU') ? bare.slice(2) : bare;
  return 'KU-' + body;
}

/** SRS-2: a code no active classroom is using. */
async function freeJoinCode() {
  for (let i = 0; i < 20; i++) {
    let code = 'KU-';
    for (let n = 0; n < 4; n++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
    if (!await one('SELECT id FROM classrooms WHERE join_code = ?', [code])) return code;
  }
  throw new Error('Could not generate a unique join code');
}

/** GET /api/classrooms — the ones this user is in. */
/* The join code lets anyone with it into the class, so only the teaching team
   (lecturer, TA, University staff) is sent it. Students get null and the
   pages simply leave it out. */
const JOIN_CODE_FOR_STAFF = "IF(m.role IN ('lecturer','ta','staff'), c.join_code, NULL) AS join_code";

async function list(req, res) {
  const rows = await q(
    `SELECT c.id, c.name, c.semester, c.subject_code, ${JOIN_CODE_FOR_STAFF}, m.role, u.name AS owner_name,
            (SELECT COUNT(*) FROM memberships x
              WHERE x.classroom_id = c.id AND x.role IN ('ta','staff')) AS staff_count
       FROM memberships m
       JOIN classrooms c ON c.id = m.classroom_id
       JOIN users u      ON u.id = c.owner_id
      WHERE m.user_id = ?
      ORDER BY c.id DESC`, [req.session.user.id]);
  res.json({ classrooms: rows });
}

/** GET /api/classrooms/preview-code — for the Generate Code button. */
async function previewCode(req, res) {
  res.json({ join_code: await freeJoinCode() });
}

/** POST /api/classrooms — SRS-1, SRS-2. The creator becomes the lecturer. */
async function create(req, res) {
  const name = String(req.body.name || '').trim();
  const semester = String(req.body.semester || '').trim();
  const subject = String(req.body.subject_code || '').trim();
  if (!name || !semester || !subject) {
    return res.status(400).json({ error: 'Classroom name, semester and subject code are required' });
  }
  if (subject.length > 32) {
    return res.status(400).json({ error: 'Keep the subject code under 32 characters' });
  }

  // Keep the previewed code if it still looks like one of ours and is free.
  // Anything else - a placeholder, a typo, a hand-written request - is ignored
  // and the server issues a fresh code instead.
  let code = String(req.body.join_code || '').trim().toUpperCase();
  const looksRight = /^KU-[A-Z0-9]{4}$/.test(code);

  if (!looksRight || await one('SELECT id FROM classrooms WHERE join_code = ?', [code])) {
    code = await freeJoinCode();
  }

  const r = await q(
    'INSERT INTO classrooms (name, semester, subject_code, join_code, owner_id) VALUES (?, ?, ?, ?, ?)',
    [name, semester, subject, code, req.session.user.id]);

  await q("INSERT INTO memberships (classroom_id, user_id, role) VALUES (?, ?, 'lecturer')",
    [r.insertId, req.session.user.id]);

  res.status(201).json({ classroom: { id: r.insertId, name, semester, join_code: code } });
}

/** POST /api/classrooms/join  { code } — SRS-4, SRS-5: always joins as Student. */
async function join(req, res) {
  const code = normaliseJoinCode(req.body.code);
  if (!code || code === 'KU-') {
    return res.status(400).json({ error: 'Enter a join code first' });
  }

  const classroom = await one('SELECT id, name FROM classrooms WHERE join_code = ?', [code]);
  if (!classroom) {
    return res.status(404).json({ error: 'Classroom not found — check the code and try again' });
  }

  await q("INSERT IGNORE INTO memberships (classroom_id, user_id, role) VALUES (?, ?, 'student')",
    [classroom.id, req.session.user.id]);

  res.json({ classroom });
}

/** GET /api/classrooms/:id — members only. */
async function detail(req, res) {
  const row = await one(
    `SELECT c.id, c.name, c.semester, c.subject_code, ${JOIN_CODE_FOR_STAFF}, m.role
       FROM memberships m
       JOIN classrooms c ON c.id = m.classroom_id
      WHERE c.id = ? AND m.user_id = ?`, [req.params.id, req.session.user.id]);

  if (!row) return res.status(403).json({ error: 'You are not a member of this classroom' });
  res.json({ classroom: row, role: row.role });
}

/**
 * POST /api/classrooms/:id/join-code   (lecturer only - requireOwner has run)
 * Issues a fresh join code (SRS-2). The old code stops working at once, so
 * a removed member, or anyone the old code leaked to, cannot join with it.
 * Nobody already in the class is affected.
 */
async function resetCode(req, res) {
  const code = await freeJoinCode();
  await q('UPDATE classrooms SET join_code = ? WHERE id = ?', [code, req.params.id]);
  res.json({ join_code: code });
}

module.exports = { list, previewCode, create, join, detail, resetCode };
