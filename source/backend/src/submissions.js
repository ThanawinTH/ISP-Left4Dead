const crypto = require('crypto');
const { q, one } = require('./db');
const files = require('./files');

/* Submissions (US-14, US-15).
   A student hands in files, links (Google Drive, GitHub ...) or both in one
   submit. Submitting again replaces the whole earlier set (SRS-23). Each item
   is kept in the database next to who sent it and when.

   After the due date an assignment takes work only if the lecturer allowed
   late submissions; anything handed in after the due date is marked late
   (SRS-24). */

const LIMITS = files.LIMITS;

/** The assignment, only if it belongs to this classroom. */
const findAssignment = (req) => one(
  `SELECT id, title, points, due_at, visibility, allow_late, (due_at < UTC_TIMESTAMP()) AS past_due
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
  const grade = await one(
    'SELECT score, feedback, graded_at FROM grades WHERE assignment_id = ? AND student_id = ?',
    [a.id, req.session.user.id]);
  res.json({
    submission: summary(await itemsOf(a.id, req.session.user.id)),
    grade: grade || null,          // US-15: the student sees their own grade and comment
    points: a.points,
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

/* ---------- US-15: staff see who has submitted ---------- */

/**
 * GET /api/classrooms/:id/assignments/:assignmentId/submissions
 * Lecturer, TA or University staff (requireStaff has run). Every student in the
 * class with their files and links, and the number who submitted against the
 * number of students (SRS-25).
 */
async function listForStaff(req, res) {
  const a = await findAssignment(req);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });

  const rows = await q(
    `SELECT u.id AS student_id, u.name, u.email,
            s.id, s.kind, s.file_name, s.url, s.file_size, s.uploaded_at, (s.uploaded_at > a.due_at) AS late
       FROM memberships m
       JOIN users u       ON u.id = m.user_id
       JOIN assignments a ON a.id = ?
       LEFT JOIN submissions s ON s.student_id = u.id AND s.assignment_id = a.id
      WHERE m.classroom_id = ? AND m.role = 'student'
      ORDER BY u.name, s.kind, s.file_name`,
    [a.id, req.params.id]);

  // One entry per student, their items gathered under them.
  const byStudent = new Map();
  for (const r of rows) {
    if (!byStudent.has(r.student_id)) {
      byStudent.set(r.student_id, { id: r.student_id, name: r.name, email: r.email, items: [] });
    }
    if (r.id) {
      byStudent.get(r.student_id).items.push({
        id: r.id, kind: r.kind, file_name: r.file_name, url: r.url,
        file_size: r.file_size, uploaded_at: r.uploaded_at, late: r.late });
    }
  }
  // Grades given so far, with who gave them.
  const grades = new Map((await q(
    `SELECT g.student_id, g.score, g.feedback, g.graded_at, u.name AS graded_by_name
       FROM grades g JOIN users u ON u.id = g.graded_by
      WHERE g.assignment_id = ?`, [a.id])).map(g => [g.student_id, g]));

  const students = [...byStudent.values()].map(s => {
    const sub = summary(s.items);
    const g = grades.get(s.id);
    return {
      id: s.id, name: s.name, email: s.email, submission: sub,
      grade: g ? { score: g.score, feedback: g.feedback, graded_at: g.graded_at,
                   graded_by_name: g.graded_by_name,
                   // handed in again after it was graded - worth a second look
                   resubmitted: !!(sub && new Date(sub.submitted_at) > new Date(g.graded_at)) } : null,
    };
  });
  students.sort((x, y) => (!x.submission) - (!y.submission));   // submitted first

  const submitted = students.filter(s => s.submission).length;
  res.json({
    assignment: { id: a.id, title: a.title, visibility: a.visibility, allow_late: Number(a.allow_late) === 1 },
    submitted,
    graded: students.filter(s => s.grade).length,
    total: students.length,
    points: a.points,
    canGrade: await canGrade(req, a.id),
    students,
  });
}

/**
 * GET /api/classrooms/:id/assignments/:assignmentId/submissions/files/:fileId[?view=1]
 * SRS-25: lecturers, TAs and University staff open any file in their own
 * classroom. The file must belong to an assignment of this classroom.
 */
async function staffFile(req, res) {
  const row = await one(
    `SELECT s.file_name, s.content
       FROM submissions s JOIN assignments a ON a.id = s.assignment_id
      WHERE s.id = ? AND s.kind = 'file' AND s.assignment_id = ? AND a.classroom_id = ?`,
    [req.params.fileId, req.params.assignmentId, req.params.id]);
  if (!row) return res.status(404).json({ error: 'File not found' });
  files.sendFile(req, res, row);
}

/* ---------- US-15: grading ---------- */

/** The lecturer grades everything; a TA grades the assignments they are on.
    University staff can see grades but not give them. */
async function canGrade(req, assignmentId) {
  if (req.isOwner) return true;
  if (req.role !== 'ta') return false;
  return !!await one('SELECT 1 AS ok FROM assignment_staff WHERE assignment_id = ? AND user_id = ?',
    [assignmentId, req.session.user.id]);
}

const FEEDBACK_MAX = 2000;

/**
 * PUT /api/classrooms/:id/assignments/:assignmentId/grades/:studentId
 * Body: { score, feedback? }. A whole number from 0 to the assignment's
 * points. score null (or blank) takes the grade back off. Who graded it and
 * when is recorded by the server.
 */
async function setGrade(req, res) {
  const a = await findAssignment(req);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });
  if (!await canGrade(req, a.id)) {
    return res.status(403).json({ error: 'Only the lecturer or a TA on this assignment can grade it' });
  }

  const studentId = Number(req.params.studentId);
  const student = await one(
    "SELECT user_id FROM memberships WHERE classroom_id = ? AND user_id = ? AND role = 'student'",
    [req.params.id, studentId]);
  if (!student) return res.status(404).json({ error: 'That student is not in this classroom' });

  const raw = req.body.score;
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    await q('DELETE FROM grades WHERE assignment_id = ? AND student_id = ?', [a.id, studentId]);
    return res.json({ ok: true, grade: null });
  }

  const score = Number(raw);
  const max = Number(a.points) > 0 ? Number(a.points) : null;
  if (!Number.isInteger(score) || score < 0 || (max !== null && score > max)) {
    return res.status(400).json({ error: max !== null
      ? `The grade must be a whole number from 0 to ${max}`
      : 'The grade must be a whole number, 0 or more' });
  }
  const feedback = String(req.body.feedback || '').trim() || null;
  if (feedback && feedback.length > FEEDBACK_MAX) {
    return res.status(400).json({ error: `Keep the comment under ${FEEDBACK_MAX} characters` });
  }

  await q(
    `INSERT INTO grades (assignment_id, student_id, score, feedback, graded_by, graded_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE score = VALUES(score), feedback = VALUES(feedback),
                             graded_by = VALUES(graded_by), graded_at = VALUES(graded_at)`,
    [a.id, studentId, score, feedback, req.session.user.id]);
  res.json({ ok: true, grade: { score, feedback } });
}

module.exports = { upload, mine, myFile, listForStaff, staffFile, setGrade, LIMITS };
