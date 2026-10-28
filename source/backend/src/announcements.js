const { q, one } = require('./db');
const attachments = require('./attachments');

/* Class announcements (US-10, US-11).
   Staff post a notice once and every member of the classroom reads the same
   list, so nobody has to rely on an outside chat group. */

const TITLE_MAX = 190;      // matches the column
const BODY_MAX = 5000;      // long enough for a notice, short enough to read

/**
 * GET /api/classrooms/:id/announcements
 * Every member of the classroom, students included (SRS-17). Newest first
 * (US-11); the page can search them.
 */
async function list(req, res) {
  const announcements = await q(
    `SELECT a.id, a.title, a.body, a.created_at, u.name AS author_name, m.role AS author_role,
            a.author_id = ? AS mine
       FROM announcements a
       JOIN users u ON u.id = a.author_id
       LEFT JOIN memberships m ON m.classroom_id = a.classroom_id AND m.user_id = a.author_id
      WHERE a.classroom_id = ?
      ORDER BY a.created_at DESC, a.id DESC`,
    [req.session.user.id, req.params.id]);

  // Files attached by whoever posted it. They can add or remove files later,
  // and so can the lecturer.
  const files = await attachments.byParent('announcement', req.params.id);
  announcements.forEach(n => {
    n.attachments = files.get(n.id) || [];
    n.can_manage = req.isStaff && (Number(n.mine) === 1 || req.isOwner);
    delete n.mine;
  });

  res.json({ announcements, canPost: req.isStaff });
}

/**
 * POST /api/classrooms/:id/announcements   { title, body }
 * requireStaff has already run: only a lecturer, TA or University staff
 * member of this classroom gets here (SRS-15). Title and body are required,
 * and the author and time are recorded by the server, not taken from the
 * request (SRS-16).
 */
async function create(req, res) {
  const title = String(req.body.title || '').trim();
  const body = String(req.body.body || '').trim();

  if (!title) return res.status(400).json({ error: 'A title is required' });
  if (!body) return res.status(400).json({ error: 'A message is required' });
  if (title.length > TITLE_MAX) return res.status(400).json({ error: `Keep the title under ${TITLE_MAX} characters` });
  if (body.length > BODY_MAX) return res.status(400).json({ error: `Keep the message under ${BODY_MAX} characters` });

  const r = await q(
    'INSERT INTO announcements (classroom_id, title, body, author_id) VALUES (?, ?, ?, ?)',
    [req.params.id, title, body, req.session.user.id]);

  const announcement = await one(
    `SELECT a.id, a.title, a.body, a.created_at, u.name AS author_name
       FROM announcements a JOIN users u ON u.id = a.author_id
      WHERE a.id = ?`, [r.insertId]);
  res.status(201).json({ announcement });
}

module.exports = { list, create };
