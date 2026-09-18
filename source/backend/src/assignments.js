const { q, one } = require('./db');

/* The values the database will accept. We check them here too so a bad request
   comes back as a clear 400 instead of a MySQL error. */
const VISIBILITIES = ['class', 'staff'];
const STATUSES = ['notstarted', 'inprogress', 'done'];

/** The browser sends an ISO date; MySQL wants "YYYY-MM-DD HH:MM:SS". */
function toSqlDate(value) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * GET /api/classrooms/:id/assignments
 * Everyone in the classroom can read the list, but students only see the rows
 * marked visible to the class (SRS-14). The filter is in the query, not in the
 * browser, so a student cannot see a staff row by opening dev tools.
 *
 * The assigned TAs come back as one comma-separated string per assignment,
 * which saves a second query per row.
 */
async function list(req, res) {
  const onlyClassVisible = req.isStaff ? '' : " AND a.visibility = 'class'";

  // can_grade is true when this person is one of the TAs the lecturer added to
  // that assignment. The lecturer gets it on everything.
  const assignments = await q(
    `SELECT a.id, a.title, a.description, a.points, a.due_at, a.visibility,
            a.staff_due_at, a.staff_note, a.status, c.name AS created_by_name,
            GROUP_CONCAT(u.name ORDER BY u.name SEPARATOR ', ') AS staff_names,
            MAX(s.user_id = ?) AS assigned_to_me
       FROM assignments a
       JOIN users c ON c.id = a.created_by
       LEFT JOIN assignment_staff s ON s.assignment_id = a.id
       LEFT JOIN users u            ON u.id = s.user_id
      WHERE a.classroom_id = ?${onlyClassVisible}
      GROUP BY a.id
      ORDER BY a.due_at ASC`,
    [req.session.user.id, req.params.id]);

  assignments.forEach(a => {
    a.can_grade = req.isOwner || (req.role === 'ta' && Number(a.assigned_to_me) === 1);
    delete a.assigned_to_me;
  });

  res.json({
    assignments,
    role: req.role,
    isOwner: req.isOwner,      // only the lecturer creates, edits or deletes
    isStaff: req.isStaff,      // staff see drafts; students do not
  });
}

/**
 * POST /api/classrooms/:id/assignments
 * requireStaff has already run, so only a lecturer, TA or staff member gets
 * here (SRS-8). Title and due date are required (US-5, SRS-10).
 */
async function create(req, res) {
  const title = String(req.body.title || '').trim();
  const dueAt = req.body.due_at;

  if (!title) return res.status(400).json({ error: 'A title is required' });
  if (!dueAt || isNaN(Date.parse(dueAt))) {
    return res.status(400).json({ error: 'A valid due date is required' });
  }

  // A mistyped year (20268 instead of 2026) parses fine but is clearly wrong.
  const year = new Date(dueAt).getFullYear();
  if (year < 2020 || year > 2100) {
    return res.status(400).json({ error: 'That due date does not look right - check the year' });
  }

  const visibility = VISIBILITIES.includes(req.body.visibility) ? req.body.visibility : 'class';
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'notstarted';
  const points = Number(req.body.points) || 0;

  // The TAs' own deadline and note are optional, and only mean anything when
  // somebody has been assigned.
  const staffDue = req.body.staff_due_at && !isNaN(Date.parse(req.body.staff_due_at))
    ? toSqlDate(req.body.staff_due_at)
    : null;
  const staffNote = String(req.body.staff_note || '').trim() || null;

  // Only TAs of this classroom can be given an assignment. Anything else in the
  // list is rejected rather than quietly ignored.
  const staffIds = Array.isArray(req.body.staff_ids)
    ? [...new Set(req.body.staff_ids.map(Number).filter(Boolean))]
    : [];

  for (const userId of staffIds) {
    const ta = await one(
      "SELECT user_id FROM memberships WHERE classroom_id = ? AND user_id = ? AND role = 'ta'",
      [req.params.id, userId]);
    if (!ta) return res.status(400).json({ error: 'You can only assign TAs of this classroom' });
  }

  const result = await q(
    `INSERT INTO assignments
       (classroom_id, title, description, points, due_at, visibility,
        staff_due_at, staff_note, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.params.id, title, req.body.description || null, points, toSqlDate(dueAt),
     visibility, staffDue, staffNote, status, req.session.user.id]);

  for (const userId of staffIds) {
    await q('INSERT INTO assignment_staff (assignment_id, user_id) VALUES (?, ?)',
      [result.insertId, userId]);
  }

  res.status(201).json({ id: result.insertId });
}

/**
 * PATCH /api/classrooms/:id/assignments/:assignmentId
 * The lecturer edits an assignment they already made. Same rules as creating
 * one: a title and a valid due date, and any TA named must be a TA here.
 * Only the fields sent are changed.
 */
async function update(req, res) {
  const assignmentId = Number(req.params.assignmentId);

  const existing = await one(
    'SELECT id FROM assignments WHERE id = ? AND classroom_id = ?',
    [assignmentId, req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Assignment not found' });

  const fields = [];
  const values = [];
  const set = (column, value) => { fields.push(`${column} = ?`); values.push(value); };

  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) return res.status(400).json({ error: 'A title is required' });
    set('title', title);
  }

  if (req.body.due_at !== undefined) {
    if (!req.body.due_at || isNaN(Date.parse(req.body.due_at))) {
      return res.status(400).json({ error: 'A valid due date is required' });
    }
    const year = new Date(req.body.due_at).getFullYear();
    if (year < 2020 || year > 2100) {
      return res.status(400).json({ error: 'That due date does not look right - check the year' });
    }
    set('due_at', toSqlDate(req.body.due_at));
  }

  if (req.body.description !== undefined) set('description', req.body.description || null);
  if (req.body.points !== undefined) set('points', Number(req.body.points) || 0);
  if (req.body.staff_note !== undefined) set('staff_note', String(req.body.staff_note || '').trim() || null);

  if (req.body.staff_due_at !== undefined) {
    set('staff_due_at', req.body.staff_due_at && !isNaN(Date.parse(req.body.staff_due_at))
      ? toSqlDate(req.body.staff_due_at)
      : null);
  }

  if (VISIBILITIES.includes(req.body.visibility)) set('visibility', req.body.visibility);

  if (fields.length) {
    values.push(assignmentId);
    await q(`UPDATE assignments SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  // Replacing the TA list is simpler than working out what changed, and the
  // table is tiny.
  if (Array.isArray(req.body.staff_ids)) {
    const staffIds = [...new Set(req.body.staff_ids.map(Number).filter(Boolean))];

    for (const userId of staffIds) {
      const ta = await one(
        "SELECT user_id FROM memberships WHERE classroom_id = ? AND user_id = ? AND role = 'ta'",
        [req.params.id, userId]);
      if (!ta) return res.status(400).json({ error: 'You can only assign TAs of this classroom' });
    }

    await q('DELETE FROM assignment_staff WHERE assignment_id = ?', [assignmentId]);
    for (const userId of staffIds) {
      await q('INSERT INTO assignment_staff (assignment_id, user_id) VALUES (?, ?)',
        [assignmentId, userId]);
    }
  }

  res.json({ ok: true, id: assignmentId });
}

module.exports = { list, create, update };
