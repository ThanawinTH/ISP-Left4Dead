const router = require('express').Router();
const auth = require('./auth');
const classrooms = require('./classrooms');
const members = require('./members');
const assignments = require('./assignments');
const announcements = require('./announcements');

/** Wraps an async handler so a thrown error reaches the error middleware. */
const go = (fn) => (req, res, next) => fn(req, res).catch(next);

/** Same idea, but for async middleware - it also needs next() to carry on. */
const mw = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/* US-16: sign in with Google, @ku.th only (SRS-26, SRS-27). */
router.get('/auth/google', auth.googleStart);
router.get('/auth/google/callback', go(auth.googleCallback));

/* For the automated tests only - this route does not exist unless TEST_LOGIN=1. */
if (process.env.TEST_LOGIN === '1') {
  router.get('/auth/test-login', (req, res) => res.json({ enabled: true }));   // lets the login page show the box
  router.post('/auth/test-login', go(auth.testLogin));
}

router.get('/auth/me', auth.me);
router.post('/auth/logout', auth.logout);

router.use(auth.requireAuth);

router.get('/classrooms', go(classrooms.list));
router.get('/classrooms/preview-code', go(classrooms.previewCode));
router.post('/classrooms', go(classrooms.create));
router.post('/classrooms/join', go(classrooms.join));
router.get('/classrooms/:id', go(classrooms.detail));

/* Members and roles (US-4). loadMembership runs first so each handler knows
   what the caller is inside this classroom before it does anything. */
router.get('/classrooms/:id/members',
  mw(auth.loadMembership), go(members.list));
router.patch('/classrooms/:id/members/:userId',
  mw(auth.loadMembership), auth.requireOwner, go(members.setRole));

/* Assignments (US-5). Reading is open to every member - the handler hides
   staff-only rows from students. Only the lecturer creates one: TAs work on
   the assignments they are added to, University staff only look. */
router.get('/classrooms/:id/assignments',
  mw(auth.loadMembership), go(assignments.list));
router.post('/classrooms/:id/assignments',
  mw(auth.loadMembership), auth.requireOwner, go(assignments.create));
router.patch('/classrooms/:id/assignments/:assignmentId',
  mw(auth.loadMembership), auth.requireOwner, go(assignments.update));

/* Status (SRS-11): the lecturer, or a TA the lecturer put on the assignment.
   The handler checks which, since it depends on the assignment. */
router.patch('/classrooms/:id/assignments/:assignmentId/status',
  mw(auth.loadMembership), go(assignments.setStatus));

/* US-9 (SRS-14): only the lecturer deletes. Students, TAs and staff get 403. */
router.delete('/classrooms/:id/assignments/:assignmentId',
  mw(auth.loadMembership), auth.requireOwner, go(assignments.remove));

/* Announcements (US-10, US-11). Every member reads them (SRS-17); only a
   lecturer, TA or University staff member posts one (SRS-15). */
router.get('/classrooms/:id/announcements',
  mw(auth.loadMembership), go(announcements.list));
router.post('/classrooms/:id/announcements',
  mw(auth.loadMembership), auth.requireStaff, go(announcements.create));

module.exports = router;
