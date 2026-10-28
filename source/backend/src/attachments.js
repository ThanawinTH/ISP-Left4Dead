const { q, one } = require('./db');
const files = require('./files');

/* Files and links the teaching team attaches to an assignment (the lecturer)
   or to an announcement (whoever posted it, or the lecturer). Everyone who
   can see the assignment or announcement can open them. Same file types and
   limits as student uploads (SRS-22): up to 10 files and 5 links on each
   assignment or announcement. Each one is deleted with its parent. */

const COLUMNS = 't.id, t.kind, t.file_name, t.url, t.file_size, t.uploaded_at';

/** Attachments for every assignment (or announcement) of a classroom, by id. */
async function byParent(kind, classroomId) {
  const parent = kind === 'assignment' ? 'assignments' : 'announcements';
  const column = kind === 'assignment' ? 'assignment_id' : 'announcement_id';
  const rows = await q(
    `SELECT ${COLUMNS}, t.${column} AS parent_id
       FROM attachments t JOIN ${parent} p ON p.id = t.${column}
      WHERE p.classroom_id = ?
      ORDER BY t.kind, t.file_name`, [classroomId]);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.parent_id)) map.set(r.parent_id, []);
    const { parent_id, ...file } = r;
    map.get(r.parent_id).push(file);
  }
  return map;
}

/** Adds files and links to one assignment or announcement, after checking all of them. */
async function save(res, column, parentId, userId, body) {
  const L = files.LIMITS;
  const bad = (error) => res.status(400).json({ error, limits: L });
  const f = files.checkFiles(body && body.files, { allowEmpty: true });
  if (f.error) return bad(f.error);
  const l = files.checkLinks(body && body.links);
  if (l.error) return bad(l.error);
  if (!f.files.length && !l.links.length) return bad('Add at least one file or link');

  // The limits count what is already attached too.
  const have = await one(
    `SELECT SUM(kind = 'file') AS files, SUM(kind = 'link') AS links FROM attachments WHERE ${column} = ?`,
    [parentId]);
  if (Number(have.files || 0) + f.files.length > L.maxFiles) return bad(`Up to ${L.maxFiles} files can be attached`);
  if (Number(have.links || 0) + l.links.length > L.maxLinks) return bad(`Up to ${L.maxLinks} links can be attached`);

  for (const file of f.files) {
    await q(
      `INSERT INTO attachments (${column}, kind, file_name, file_size, content, uploaded_by, uploaded_at)
       VALUES (?, 'file', ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [parentId, file.name, file.data.length, file.data, userId]);
  }
  for (const link of l.links) {
    await q(
      `INSERT INTO attachments (${column}, kind, file_name, url, uploaded_by, uploaded_at)
       VALUES (?, 'link', ?, ?, ?, UTC_TIMESTAMP())`,
      [parentId, link.site, link.url, userId]);
  }
  const attachments = await q(
    `SELECT ${COLUMNS} FROM attachments t WHERE t.${column} = ? ORDER BY t.kind, t.file_name`, [parentId]);
  res.status(201).json({ attachments });
}

/* ---------- assignments: the lecturer (requireOwner has run) ---------- */

async function addToAssignment(req, res) {
  const a = await one('SELECT id FROM assignments WHERE id = ? AND classroom_id = ?',
    [req.params.assignmentId, req.params.id]);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });
  return save(res, 'assignment_id', a.id, req.session.user.id, req.body);
}

async function removeFromAssignment(req, res) {
  const r = await q(
    `DELETE t FROM attachments t JOIN assignments a ON a.id = t.assignment_id
      WHERE t.id = ? AND t.assignment_id = ? AND a.classroom_id = ?`,
    [req.params.attachmentId, req.params.assignmentId, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'File not found' });
  res.json({ ok: true });
}

/* ---------- announcements: whoever posted it, or the lecturer ---------- */

async function findAnnouncement(req, res) {
  const n = await one('SELECT id, author_id FROM announcements WHERE id = ? AND classroom_id = ?',
    [req.params.announcementId, req.params.id]);
  if (!n) { res.status(404).json({ error: 'Announcement not found' }); return null; }
  if (n.author_id !== req.session.user.id && !req.isOwner) {
    res.status(403).json({ error: 'Only the person who posted it or the lecturer can change its files' });
    return null;
  }
  return n;
}

async function addToAnnouncement(req, res) {
  const n = await findAnnouncement(req, res);
  if (!n) return;
  return save(res, 'announcement_id', n.id, req.session.user.id, req.body);
}

async function removeFromAnnouncement(req, res) {
  const n = await findAnnouncement(req, res);
  if (!n) return;
  const r = await q('DELETE FROM attachments WHERE id = ? AND announcement_id = ?',
    [req.params.attachmentId, n.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'File not found' });
  res.json({ ok: true });
}

/* ---------- opening a file: any member who can see its parent ---------- */

/**
 * GET /api/classrooms/:id/attachments/:attachmentId[?view=1]
 * A student cannot open a file on an assignment that is still a staff-only
 * draft, the same rule as the assignment list (SRS-14).
 */
async function open(req, res) {
  const row = await one(
    `SELECT t.file_name, t.content, a.visibility
       FROM attachments t
       LEFT JOIN assignments a   ON a.id = t.assignment_id
       LEFT JOIN announcements n ON n.id = t.announcement_id
      WHERE t.id = ? AND t.kind = 'file' AND (a.classroom_id = ? OR n.classroom_id = ?)`,
    [req.params.attachmentId, req.params.id, req.params.id]);
  if (!row || (row.visibility === 'staff' && !req.isStaff)) {
    return res.status(404).json({ error: 'File not found' });
  }
  files.sendFile(req, res, row);
}

module.exports = {
  byParent, addToAssignment, removeFromAssignment, addToAnnouncement, removeFromAnnouncement, open,
};
