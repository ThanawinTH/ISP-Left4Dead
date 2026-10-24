const { q } = require('./db');

/* Class announcements (US-11).
   Staff post a notice once and every member of the classroom reads the same
   list, so nobody has to rely on an outside chat group. */

/**
 * GET /api/classrooms/:id/announcements
 * Every member of the classroom, students included (SRS-17). Newest first,
 * with no search or filter - the list is chronological only (US-11).
 */
async function list(req, res) {
  const announcements = await q(
    `SELECT a.id, a.title, a.body, a.created_at, u.name AS author_name, m.role AS author_role
       FROM announcements a
       JOIN users u ON u.id = a.author_id
       LEFT JOIN memberships m ON m.classroom_id = a.classroom_id AND m.user_id = a.author_id
      WHERE a.classroom_id = ?
      ORDER BY a.created_at DESC, a.id DESC`,
    [req.params.id]);

  res.json({ announcements, canPost: req.isStaff });
}

module.exports = { list };
