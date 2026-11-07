const { q, one } = require('./db');

/* Internal staff tasks (US-18) - work the teaching team does that students
   never see: book a room, fix the lab PCs, email the students who missed a lab.
   Create, assign, change status, close. requireStaff runs on every route, so
   a student gets 403 on read as well as write.

   Status: open -> inprogress -> done. Closing a task is moving it to done;
   the time is kept as closed_at. Reopening clears it. */

const STATUSES = ['open', 'inprogress', 'done'];
const TITLE_MAX = 190;
const NOTES_MAX = 2000;

const SELECT = `
  SELECT t.id, t.title, t.notes, t.status, t.due_date, t.closed_at, t.created_at,
         t.assignee_id, a.name AS assignee_name, am.role AS assignee_role,
         t.created_by, c.name AS created_by_name
    FROM staff_tasks t
    JOIN users c ON c.id = t.created_by
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN memberships am ON am.classroom_id = t.classroom_id AND am.user_id = t.assignee_id`;

function shape(t, req) {
  return {
    ...t,
    due_date: t.due_date ? String(t.due_date instanceof Date ? t.due_date.toISOString() : t.due_date).slice(0, 10) : null,
    mine: t.assignee_id === req.session.user.id,
    can_delete: t.created_by === req.session.user.id || req.isOwner,
  };
}

/** A task may only go to staff of this classroom (or to nobody). */
async function checkAssignee(req, value) {
  if (value === null || value === undefined || value === '' || Number(value) === 0) return { id: null };
  const id = Number(value);
  const m = await one(
    "SELECT user_id FROM memberships WHERE classroom_id = ? AND user_id = ? AND role IN ('lecturer','ta','staff')",
    [req.params.id, id]);
  return m ? { id } : { error: 'A task can only be given to the lecturer, a TA or University staff of this class' };
}

/** "YYYY-MM-DD" or nothing. */
function checkDue(value) {
  if (value === null || value === undefined || value === '') return { date: null };
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(s) || isNaN(Date.parse(s))) return { error: 'That due date does not look right' };
  const y = Number(s.slice(0, 4));
  if (y < 2020 || y > 2100) return { error: 'That due date does not look right - check the year' };
  return { date: s };
}

/** GET /api/classrooms/:id/tasks - every task of the class, plus the staff who can be given one. */
async function list(req, res) {
  const tasks = await q(
    `${SELECT} WHERE t.classroom_id = ?
      ORDER BY FIELD(t.status, 'open', 'inprogress', 'done'), t.due_date IS NULL, t.due_date, t.id DESC`,
    [req.params.id]);
  const staff = await q(
    `SELECT u.id, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.classroom_id = ? AND m.role IN ('lecturer','ta','staff')
      ORDER BY FIELD(m.role, 'lecturer', 'ta', 'staff'), u.name`, [req.params.id]);
  res.json({ tasks: tasks.map(t => shape(t, req)), staff, me: req.session.user.id });
}

/** POST /api/classrooms/:id/tasks  { title, notes?, assignee_id?, status?, due_date? } */
async function create(req, res) {
  const title = String(req.body.title || '').trim();
  const notes = String(req.body.notes || '').trim() || null;
  if (!title) return res.status(400).json({ error: 'Say what needs doing' });
  if (title.length > TITLE_MAX) return res.status(400).json({ error: `Keep it under ${TITLE_MAX} characters` });
  if (notes && notes.length > NOTES_MAX) return res.status(400).json({ error: `Keep the notes under ${NOTES_MAX} characters` });
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'open';
  const who = await checkAssignee(req, req.body.assignee_id);
  if (who.error) return res.status(400).json({ error: who.error });
  const due = checkDue(req.body.due_date);
  if (due.error) return res.status(400).json({ error: due.error });

  // Who created it and when come from the server, not the request.
  const r = await q(
    `INSERT INTO staff_tasks (classroom_id, title, notes, assignee_id, status, due_date, created_by, created_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ${status === 'done' ? 'UTC_TIMESTAMP()' : 'NULL'})`,
    [req.params.id, title, notes, who.id, status, due.date, req.session.user.id]);
  res.status(201).json({ task: shape(await one(`${SELECT} WHERE t.id = ?`, [r.insertId]), req) });
}

/**
 * PATCH /api/classrooms/:id/tasks/:taskId - any of title, notes, assignee_id,
 * status, due_date. Any staff member can move or reassign a task; that is
 * how the team hands work around.
 */
async function update(req, res) {
  const t = await one('SELECT id, status FROM staff_tasks WHERE id = ? AND classroom_id = ?',
    [req.params.taskId, req.params.id]);
  if (!t) return res.status(404).json({ error: 'Task not found' });

  const fields = [];
  const values = [];
  const set = (sql, v) => { fields.push(sql); values.push(v); };

  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) return res.status(400).json({ error: 'Say what needs doing' });
    if (title.length > TITLE_MAX) return res.status(400).json({ error: `Keep it under ${TITLE_MAX} characters` });
    set('title = ?', title);
  }
  if (req.body.notes !== undefined) {
    const notes = String(req.body.notes || '').trim() || null;
    if (notes && notes.length > NOTES_MAX) return res.status(400).json({ error: `Keep the notes under ${NOTES_MAX} characters` });
    set('notes = ?', notes);
  }
  if (req.body.assignee_id !== undefined) {
    const who = await checkAssignee(req, req.body.assignee_id);
    if (who.error) return res.status(400).json({ error: who.error });
    set('assignee_id = ?', who.id);
  }
  if (req.body.due_date !== undefined) {
    const due = checkDue(req.body.due_date);
    if (due.error) return res.status(400).json({ error: due.error });
    set('due_date = ?', due.date);
  }
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Status must be open, inprogress or done' });
    set('status = ?', req.body.status);
    // Closing keeps the time it was closed; reopening clears it.
    if (req.body.status === 'done' && t.status !== 'done') fields.push('closed_at = UTC_TIMESTAMP()');
    if (req.body.status !== 'done') fields.push('closed_at = NULL');
  }

  if (fields.length) {
    values.push(t.id);
    await q(`UPDATE staff_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  res.json({ task: shape(await one(`${SELECT} WHERE t.id = ?`, [t.id]), req) });
}

/** DELETE /api/classrooms/:id/tasks/:taskId - whoever created it, or the lecturer. */
async function remove(req, res) {
  const t = await one('SELECT id, created_by FROM staff_tasks WHERE id = ? AND classroom_id = ?',
    [req.params.taskId, req.params.id]);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (t.created_by !== req.session.user.id && !req.isOwner) {
    return res.status(403).json({ error: 'Only whoever created it, or the lecturer, can delete a task' });
  }
  await q('DELETE FROM staff_tasks WHERE id = ?', [t.id]);
  res.json({ ok: true, id: t.id });
}

module.exports = { list, create, update, remove, STATUSES };
