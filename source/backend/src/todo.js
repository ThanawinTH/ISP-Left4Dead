const { q } = require('./db');
const { STUDENT_RISK, DUE_SOON_DAYS } = require('./assignments');

/* To-do (US-19): what is due and at risk across all my classes, on one page.
   One person can be a student in one class and a TA in another, so the page
   gets two halves, each holding only the classes where I have that role:

     student - my assignments (visible to the class) with the same risk the
               Assignment page shows (US-8, SRS-12): at risk, coming up,
               submitted, missed.
     staff   - the assignments of the classes I help run, with the staff
               at-risk rules of SRS-12 (overdue or due soon and not Done;
               unassigned when no TA is on it and it is due within 7 days),
               how many students have handed in (US-15), and the staff tasks
               given to me that are not done yet (US-18).

   Both get the schedule (US-17) of their classes for the next two weeks.
   Searching is done in the page: it is one person's list, small enough. */

const UNASSIGNED_DAYS = 7;
const SCHEDULE_DAYS = 14;
const STAFF_ROLES = ['lecturer', 'ta', 'staff'];

const isDate = (s) => /^\d{4}-\d\d-\d\d$/.test(s || '') && !isNaN(Date.parse(s));
const inList = (ids) => ids.map(() => '?').join(',');

/**
 * GET /api/todo[?from=YYYY-MM-DD]
 * `from` is the browser's today, so "the next two weeks" means the student's
 * own days, not the server's (schedule dates are class time, see schema.sql).
 */
async function list(req, res) {
  const me = req.session.user.id;
  const classes = await q(
    `SELECT c.id, c.name, c.subject_code, m.role
       FROM memberships m JOIN classrooms c ON c.id = m.classroom_id
      WHERE m.user_id = ? ORDER BY c.name`, [me]);
  const studentIds = classes.filter(c => c.role === 'student').map(c => c.id);
  const staffIds = classes.filter(c => STAFF_ROLES.includes(c.role)).map(c => c.id);

  // My own work: the class-visible assignments of the classes I am a student in.
  const studentWork = studentIds.length ? await q(
    `SELECT a.id, a.classroom_id, a.title, a.topic, a.points, a.due_at, a.allow_late,
            ${STUDENT_RISK} AS risk,
            MAX(sub.uploaded_at) AS submitted_at,
            MAX(sub.uploaded_at) > a.due_at AS late,
            MAX(g.score) AS score
       FROM assignments a
       LEFT JOIN submissions sub ON sub.assignment_id = a.id AND sub.student_id = ?
       LEFT JOIN grades g        ON g.assignment_id = a.id AND g.student_id = ?
      WHERE a.classroom_id IN (${inList(studentIds)}) AND a.visibility = 'class'
      GROUP BY a.id
      ORDER BY a.due_at, a.id`, [me, me, ...studentIds]) : [];

  // The classes I help run: every assignment that is not Done, and anything
  // Done in the last week so a just-closed one does not vanish at once.
  const staffWork = staffIds.length ? await q(
    `SELECT a.id, a.classroom_id, a.title, a.topic, a.due_at, a.staff_due_at, a.status, a.visibility,
            COUNT(DISTINCT s.user_id) AS staff_count,
            COALESCE(MAX(s.user_id = ?), 0) AS assigned_to_me,
            (SELECT COUNT(DISTINCT x.student_id) FROM submissions x WHERE x.assignment_id = a.id) AS submitted_count,
            (SELECT COUNT(*) FROM memberships m WHERE m.classroom_id = a.classroom_id AND m.role = 'student') AS student_count,
            CASE
              WHEN a.status = 'done'                                              THEN 'done'
              WHEN a.due_at < UTC_TIMESTAMP()                                     THEN 'overdue'
              WHEN a.due_at < UTC_TIMESTAMP() + INTERVAL ${DUE_SOON_DAYS} DAY      THEN 'duesoon'
              ELSE 'ok'
            END AS risk,
            (a.status <> 'done' AND COUNT(s.user_id) = 0
              AND a.due_at < UTC_TIMESTAMP() + INTERVAL ${UNASSIGNED_DAYS} DAY)   AS unassigned
       FROM assignments a
       LEFT JOIN assignment_staff s ON s.assignment_id = a.id
      WHERE a.classroom_id IN (${inList(staffIds)})
        AND (a.status <> 'done' OR a.due_at > UTC_TIMESTAMP() - INTERVAL 7 DAY)
      GROUP BY a.id
      ORDER BY a.due_at, a.id`, [me, ...staffIds]) : [];

  // Staff tasks (US-18) given to me and not done.
  const tasks = staffIds.length ? await q(
    `SELECT t.id, t.classroom_id, t.title, t.status, DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date
       FROM staff_tasks t
      WHERE t.assignee_id = ? AND t.status <> 'done' AND t.classroom_id IN (${inList(staffIds)})
      ORDER BY t.due_date IS NULL, t.due_date, t.id`, [me, ...staffIds]) : [];

  // The schedule (US-17) of all my classes, the next two weeks from my today.
  const from = isDate(req.query.from) ? req.query.from : new Date().toISOString().slice(0, 10);
  const allIds = classes.map(c => c.id);
  const events = allIds.length ? await q(
    `SELECT e.id, e.classroom_id, e.kind, e.title, e.place, e.host_id = ? AS mine,
            h.name AS host_name,
            DATE_FORMAT(e.event_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(e.start_time, '%H:%i') AS start_time,
            TIME_FORMAT(e.end_time, '%H:%i') AS end_time
       FROM timeline_events e
       LEFT JOIN users h ON h.id = e.host_id
      WHERE e.classroom_id IN (${inList(allIds)})
        AND e.event_date >= ? AND e.event_date < ? + INTERVAL ${SCHEDULE_DAYS} DAY
      ORDER BY e.event_date, e.start_time IS NOT NULL, e.start_time, e.id`, [me, ...allIds, from, from]) : [];

  res.json({
    classes,
    student: { assignments: studentWork },
    staff: { assignments: staffWork, tasks },
    events,
    schedule_days: SCHEDULE_DAYS,
  });
}

module.exports = { list };
