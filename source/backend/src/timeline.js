const { q, one } = require('./db');

/* Class timeline (US-17): lab sessions, consultations and milestones on one
   list, with the assignment due dates added so students see everything in one
   place. Everyone in the class can read it; the lecturer, TAs and University
   staff add (requireStaff on those routes). The lecturer can edit or delete
   any item; a TA or University staff member only the items they added.

   Dates and times are class time as typed, not UTC (see schema.sql). An item
   with no start time is all day; an end time is optional but must be after
   the start. */

const KINDS = ['lab', 'consultation', 'milestone'];
const TITLE_MAX = 190;
const PLACE_MAX = 190;
const NOTES_MAX = 2000;

const SELECT = `
  SELECT e.id, e.kind, e.title, e.notes, e.place, e.host_id, h.name AS host_name, hm.role AS host_role,
         DATE_FORMAT(e.event_date, '%Y-%m-%d') AS date,
         TIME_FORMAT(e.start_time, '%H:%i') AS start_time,
         TIME_FORMAT(e.end_time, '%H:%i') AS end_time,
         e.created_by, c.name AS created_by_name
    FROM timeline_events e
    JOIN users c ON c.id = e.created_by
    LEFT JOIN users h ON h.id = e.host_id
    LEFT JOIN memberships hm ON hm.classroom_id = e.classroom_id AND hm.user_id = e.host_id`;

/** The lecturer can change anything; everyone else on the teaching team only what they added. */
const canChange = (e, req) => req.isStaff && (e.created_by === req.session.user.id || req.isOwner);

function shape(e, req) {
  const mine = canChange(e, req);
  return { ...e, can_edit: mine, can_delete: mine };
}

const isDate = (s) => /^\d{4}-\d\d-\d\d$/.test(s) && !isNaN(Date.parse(s))
  && Number(s.slice(0, 4)) >= 2020 && Number(s.slice(0, 4)) <= 2100;
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Checks a whole item from the form. Gives back the values to save, or an error. */
async function read(req) {
  const b = req.body || {};
  const kind = b.kind;
  if (!KINDS.includes(kind)) return { error: 'Pick Lab, Consultation or Milestone' };
  const title = String(b.title || '').trim();
  if (!title) return { error: 'Give it a title' };
  if (title.length > TITLE_MAX) return { error: `Keep the title under ${TITLE_MAX} characters` };
  const date = String(b.date || '').slice(0, 10);
  if (!isDate(date)) return { error: 'Pick a date' };

  const start = b.start_time ? String(b.start_time).slice(0, 5) : null;
  const end = b.end_time ? String(b.end_time).slice(0, 5) : null;
  if (start && !isTime(start)) return { error: 'That start time does not look right' };
  if (end && !isTime(end)) return { error: 'That end time does not look right' };
  if (end && !start) return { error: 'Add a start time, or clear the end time for all day' };
  if (start && end && end <= start) return { error: 'The end time must be after the start time' };

  const place = String(b.place || '').trim() || null;
  if (place && place.length > PLACE_MAX) return { error: `Keep the place under ${PLACE_MAX} characters` };
  const notes = String(b.notes || '').trim() || null;
  if (notes && notes.length > NOTES_MAX) return { error: `Keep the notes under ${NOTES_MAX} characters` };

  let host = null;
  if (b.host_id !== null && b.host_id !== undefined && b.host_id !== '' && Number(b.host_id) !== 0) {
    host = Number(b.host_id);
    const m = await one(
      "SELECT user_id FROM memberships WHERE classroom_id = ? AND user_id = ? AND role IN ('lecturer','ta','staff')",
      [req.params.id, host]);
    if (!m) return { error: 'The host must be the lecturer, a TA or University staff of this class' };
  }
  return { v: [kind, title, notes, place, host, date, start, end] };
}

/**
 * GET /api/classrooms/:id/timeline
 * Every item of the class, plus the assignment due dates students can see,
 * and (for staff) who can host.
 */
async function list(req, res) {
  const events = await q(`${SELECT} WHERE e.classroom_id = ? ORDER BY e.event_date, e.start_time IS NOT NULL, e.start_time, e.id`,
    [req.params.id]);
  // Students' deadlines only: assignments the lecturer keeps for staff stay off the student timeline.
  const due = await q(
    `SELECT id, title, topic, due_at FROM assignments
      WHERE classroom_id = ? AND visibility = 'class' ORDER BY due_at, id`, [req.params.id]);
  const staff = req.isStaff ? await q(
    `SELECT u.id, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.classroom_id = ? AND m.role IN ('lecturer','ta','staff')
      ORDER BY FIELD(m.role, 'lecturer', 'ta', 'staff'), u.name`, [req.params.id]) : [];
  res.json({ events: events.map(e => shape(e, req)), due, staff, can_add: req.isStaff });
}

/** POST /api/classrooms/:id/timeline  { kind, title, date, start_time?, end_time?, place?, host_id?, notes? } */
async function create(req, res) {
  const r = await read(req);
  if (r.error) return res.status(400).json({ error: r.error });
  const ins = await q(
    `INSERT INTO timeline_events
       (classroom_id, kind, title, notes, place, host_id, event_date, start_time, end_time, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [req.params.id, ...r.v, req.session.user.id]);
  res.status(201).json({ event: shape(await one(`${SELECT} WHERE e.id = ?`, [ins.insertId]), req) });
}

/** PUT /api/classrooms/:id/timeline/:eventId - the whole item again, as the form sends it. Whoever added it, or the lecturer. */
async function update(req, res) {
  const e = await one('SELECT id, created_by FROM timeline_events WHERE id = ? AND classroom_id = ?',
    [req.params.eventId, req.params.id]);
  if (!e) return res.status(404).json({ error: 'That item is not on the schedule any more' });
  if (!canChange(e, req)) {
    return res.status(403).json({ error: 'Only whoever added it, or the lecturer, can edit it' });
  }
  const r = await read(req);
  if (r.error) return res.status(400).json({ error: r.error });
  await q(
    `UPDATE timeline_events SET kind = ?, title = ?, notes = ?, place = ?, host_id = ?,
            event_date = ?, start_time = ?, end_time = ?, updated_at = UTC_TIMESTAMP()
      WHERE id = ?`, [...r.v, e.id]);
  res.json({ event: shape(await one(`${SELECT} WHERE e.id = ?`, [e.id]), req) });
}

/** DELETE /api/classrooms/:id/timeline/:eventId - whoever added it, or the lecturer. */
async function remove(req, res) {
  const e = await one('SELECT id, created_by FROM timeline_events WHERE id = ? AND classroom_id = ?',
    [req.params.eventId, req.params.id]);
  if (!e) return res.status(404).json({ error: 'That item is not on the schedule any more' });
  if (!canChange(e, req)) {
    return res.status(403).json({ error: 'Only whoever added it, or the lecturer, can delete it' });
  }
  await q('DELETE FROM timeline_events WHERE id = ?', [e.id]);
  res.json({ ok: true, id: e.id });
}

module.exports = { list, create, update, remove, KINDS };
