const crypto = require('crypto');
const { q, one } = require('./db');
const files = require('./files');

/* Submissions (US-14).
   A student hands in files, links (Google Drive, GitHub ...) or both in one
   submit. Submitting again replaces the whole earlier set (SRS-23). Each item
   is kept in the database next to who sent it and when.

   After the due date an assignment takes work only if the lecturer allowed
   late submissions; anything handed in after the due date is marked late
   (SRS-24). */

const LIMITS = files.LIMITS;

/** The assignment, only if it belongs to this classroom. */
const findAssignment = (req) => one(
  `SELECT id, title, due_at, visibility, allow_late, (due_at < UTC_TIMESTAMP()) AS past_due
     FROM assignments WHERE id = ? AND classroom_id = ?`,
  [req.params.assignmentId, req.params.id]);

/** One student's items for one assignment, without the file contents. */
const itemsOf = (assignmentId, studentId) => q(
  `SELECT s.id, s.kind, s.file_name, s.url, s.file_size, s.uploaded_at, (s.uploaded_at > a.due_at) AS late
     FROM submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE s.assignment_id = ? AND s.student_id = ?
    ORDER BY s.kind, s.file_name`, [assignmentId, studentId]);

/** The items plus a summary: when it was handed in, and whether that was late (SRS-24). */
function summary(items) {
  if (!items.length) return null;
  return {
    submitted_at: items[0].uploaded_at,     // one submit, one time
    late: items.some(i => Number(i.late)) ? 1 : 0,
    files: items.filter(i => i.kind === 'file'),
    links: items.filter(i => i.kind === 'link'),
  };
}

/* ---------- US-14: the student's own submission ---------- */

/**
 * PUT /api/classrooms/:id/assignments/:assignmentId/submission
 * Body: { files: [{ name, data }], links: ["https://..."] } - the whole submit.
 * SRS-21: only a student of this classroom, only for an assignment posted to
 * the class, and after the due date only if late work is allowed.
 * SRS-22: every file and link checked before anything is saved.
 * SRS-23: the new set replaces the student's earlier set for this assignment.
 */
async function upload(req, res) {
  if (req.role !== 'student') {
    return res.status(403).json({ error: 'Only students submit work' });
  }

  const a = await findAssignment(req);
  if (!a || a.visibility !== 'class') return res.status(404).json({ error: 'Assignment not found' });
  if (Number(a.past_due) === 1 && !Number(a.allow_late)) {
    return res.status(403).json({ error: 'This assignment is closed - the due date has passed' });
  }

  const body = req.body || {};
  const bad = (error) => res.status(400).json({ error, limits: LIMITS });
  const f = files.checkFiles(body.files, { allowEmpty: true });
  if (f.error) return bad(f.error);
  const l = files.checkLinks(body.links);
  if (l.error) return bad(l.error);
  if (!f.files.length && !l.links.length) return bad('Add at least one file or link');

  // Save the new set under a fresh batch id, then remove the old set. If a
  // save fails half way, the new rows are removed and the old set stays.
  const batch = crypto.randomBytes(8).toString('hex');
  const me = req.session.user.id;
  try {
    for (const file of f.files) {
      await q(
        `INSERT INTO submissions (assignment_id, student_id, batch, kind, file_name, file_size, content, uploaded_at)
         VALUES (?, ?, ?, 'file', ?, ?, ?, UTC_TIMESTAMP())`,
        [a.id, me, batch, file.name, file.data.length, file.data]);
    }
    for (const link of l.links) {
      await q(
        `INSERT INTO submissions (assignment_id, student_id, batch, kind, file_name, url, file_size, uploaded_at)
         VALUES (?, ?, ?, 'link', ?, ?, 0, UTC_TIMESTAMP())`,
        [a.id, me, batch, link.site, link.url]);
    }
  } catch (err) {
    await q('DELETE FROM submissions WHERE batch = ?', [batch]);
    throw err;
  }
  await q('DELETE FROM submissions WHERE assignment_id = ? AND student_id = ? AND batch <> ?', [a.id, me, batch]);

  res.status(201).json({ submission: summary(await itemsOf(a.id, me)), limits: LIMITS });
}

/**
 * GET /api/classrooms/:id/assignments/:assignmentId/submission
 * The signed-in student's own submission (or null), plus the upload limits.
 */
async function mine(req, res) {
  const a = await findAssignment(req);
  if (!a || (!req.isStaff && a.visibility !== 'class')) {
    return res.status(404).json({ error: 'Assignment not found' });
  }
  res.json({
    submission: summary(await itemsOf(a.id, req.session.user.id)),
    limits: LIMITS,
    allow_late: Number(a.allow_late) === 1,
  });
}

/**
 * GET /api/classrooms/:id/assignments/:assignmentId/submission/files/:fileId[?view=1]
 * SRS-25: a student opens only their own files - the query only matches a
 * file whose student is the person signed in.
 */
async function myFile(req, res) {
  const row = await one(
    `SELECT s.file_name, s.content
       FROM submissions s JOIN assignments a ON a.id = s.assignment_id
      WHERE s.id = ? AND s.kind = 'file' AND s.assignment_id = ? AND a.classroom_id = ? AND s.student_id = ?`,
    [req.params.fileId, req.params.assignmentId, req.params.id, req.session.user.id]);
  if (!row) return res.status(404).json({ error: 'File not found' });
  files.sendFile(req, res, row);
}

module.exports = { upload, mine, myFile, LIMITS };
