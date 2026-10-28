const { q, one } = require('./db');

/* Roles the owner is allowed to hand out. The owner's own role is not in here
   on purpose - a classroom must always keep its lecturer. */
const ASSIGNABLE_ROLES = ['student', 'ta', 'staff'];

/**
 * GET /api/classrooms/:id/members
 * Everyone in the classroom can see who else is in it. The dropdown that
 * changes a role is only shown to the owner, so we send isOwner along and let
 * the page decide what to render.
 */
async function list(req, res) {
  const members = await q(
    `SELECT u.id, u.name, u.email, m.role
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.classroom_id = ?
      ORDER BY FIELD(m.role, 'lecturer', 'ta', 'staff', 'student'), u.name`,
    [req.params.id]);

  res.json({ members, isOwner: req.isOwner, myRole: req.role });
}

/**
 * PATCH /api/classrooms/:id/members/:userId   { role }
 * Promotes or demotes one member. requireOwner has already run, so by the time
 * we get here we know the caller owns this classroom.
 */
async function setRole(req, res) {
  const role = String(req.body.role || '');
  const targetId = Number(req.params.userId);

  if (!ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Role must be student, ta or staff' });
  }

  // The owner cannot demote themselves, or the classroom is left with nobody
  // who can hand out roles.
  if (targetId === req.session.user.id) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }

  const result = await q(
    'UPDATE memberships SET role = ? WHERE classroom_id = ? AND user_id = ?',
    [role, req.params.id, targetId]);

  if (!result.affectedRows) {
    return res.status(404).json({ error: 'That person is not in this classroom' });
  }

  // Only TAs can be put on an assignment. If this person is no longer a TA,
  // take them off the ones they were given - the assignments themselves stay,
  // they just have one fewer TA on them.
  let removed = 0;
  if (role !== 'ta') {
    try {
      const drop = await q(
        `DELETE FROM assignment_staff
          WHERE user_id = ?
            AND assignment_id IN (SELECT id FROM assignments WHERE classroom_id = ?)`,
        [targetId, req.params.id]);
      removed = drop.affectedRows || 0;
    } catch (err) {
      // Tidying up the assignments must never stop the role change itself.
      console.error('could not clear assignment_staff:', err.message);
    }
  }

  // A student cannot post announcements (US-10), so when someone is turned
  // into a student, the announcements they posted in this classroom go too.
  // A TA moved to University staff can still post, so theirs stay.
  let deletedAnnouncements = 0;
  if (role === 'student') {
    try {
      const drop = await q(
        'DELETE FROM announcements WHERE classroom_id = ? AND author_id = ?',
        [req.params.id, targetId]);
      deletedAnnouncements = drop.affectedRows || 0;
    } catch (err) {
      // Tidying up must never stop the role change itself.
      console.error('could not clear announcements:', err.message);
    }
  }

  res.json({ ok: true, user_id: targetId, role, unassigned: removed, deletedAnnouncements });
}

/**
 * DELETE /api/classrooms/:id/members/:userId   (lecturer only - requireOwner has run)
 * Removes someone from the classroom. The lecturer cannot remove themselves,
 * so the class always keeps its owner. What they did as staff goes with them:
 * they come off any assignment they were checking, and their announcements
 * (with the files on them) are deleted. Student work is kept, so it comes
 * back if the same person is let in again. They can rejoin with the join
 * code, so reset the code if that should not happen.
 */
async function remove(req, res) {
  const targetId = Number(req.params.userId);
  if (targetId === req.session.user.id) {
    return res.status(400).json({ error: 'You cannot remove yourself from your own classroom' });
  }

  const member = await one(
    'SELECT role FROM memberships WHERE classroom_id = ? AND user_id = ?', [req.params.id, targetId]);
  if (!member) return res.status(404).json({ error: 'That person is not in this classroom' });
  if (member.role === 'lecturer') {
    return res.status(400).json({ error: 'The lecturer cannot be removed' });
  }

  await q('DELETE FROM memberships WHERE classroom_id = ? AND user_id = ?', [req.params.id, targetId]);

  const unassigned = await q(
    `DELETE FROM assignment_staff
      WHERE user_id = ? AND assignment_id IN (SELECT id FROM assignments WHERE classroom_id = ?)`,
    [targetId, req.params.id]);
  const announcements = await q(
    'DELETE FROM announcements WHERE classroom_id = ? AND author_id = ?', [req.params.id, targetId]);

  res.json({
    ok: true,
    user_id: targetId,
    unassigned: unassigned.affectedRows || 0,
    deletedAnnouncements: announcements.affectedRows || 0,
  });
}

module.exports = { list, setRole, remove };
