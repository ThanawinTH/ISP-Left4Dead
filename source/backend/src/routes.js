const router = require('express').Router();
const auth = require('./auth');
const classrooms = require('./classrooms');
const members = require('./members');
const assignments = require('./assignments');
const announcements = require('./announcements');
const { classChat, staffChat } = require('./chat');
const tasks = require('./tasks');
const timeline = require('./timeline');
const submissions = require('./submissions');
const files = require('./files');
const attachments = require('./attachments');

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
router.post('/classrooms/:id/join-code',
  mw(auth.loadMembership), auth.requireOwner, go(classrooms.resetCode));

/* Members and roles (US-4). loadMembership runs first so each handler knows
   what the caller is inside this classroom before it does anything. */
router.get('/classrooms/:id/members',
  mw(auth.loadMembership), go(members.list));
router.patch('/classrooms/:id/members/:userId',
  mw(auth.loadMembership), auth.requireOwner, go(members.setRole));
router.delete('/classrooms/:id/members/:userId',
  mw(auth.loadMembership), auth.requireOwner, go(members.remove));

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

/* Chat (US-12, US-13). The class chat is open to every member of the class;
   the staff chat (Admin panel) is for the lecturer, TAs and University staff
   only - students are refused (SRS-18). */
const cc = '/classrooms/:id/chat';
router.get(cc, mw(auth.loadMembership), go(classChat.list));
router.post(cc, mw(auth.loadMembership), go(classChat.send));
router.delete(cc + '/:messageId', mw(auth.loadMembership), go(classChat.remove));
const sc = '/classrooms/:id/staff-chat';
router.get(sc, mw(auth.loadMembership), auth.requireStaff, go(staffChat.list));
router.post(sc, mw(auth.loadMembership), auth.requireStaff, go(staffChat.send));
router.delete(sc + '/:messageId', mw(auth.loadMembership), auth.requireStaff, go(staffChat.remove));

/* Internal staff tasks (US-18): staff only, read and write. */
const tk = '/classrooms/:id/tasks';
router.get(tk, mw(auth.loadMembership), auth.requireStaff, go(tasks.list));
router.post(tk, mw(auth.loadMembership), auth.requireStaff, go(tasks.create));
router.patch(tk + '/:taskId', mw(auth.loadMembership), auth.requireStaff, go(tasks.update));
router.delete(tk + '/:taskId', mw(auth.loadMembership), auth.requireStaff, go(tasks.remove));

/* Class timeline (US-17): everyone in the class reads it; the lecturer, TAs
   and University staff add. The lecturer edits or deletes any item, the
   others only their own (checked in timeline.js). */
const tl = '/classrooms/:id/timeline';
router.get(tl, mw(auth.loadMembership), go(timeline.list));
router.post(tl, mw(auth.loadMembership), auth.requireStaff, go(timeline.create));
router.put(tl + '/:eventId', mw(auth.loadMembership), auth.requireStaff, go(timeline.update));
router.delete(tl + '/:eventId', mw(auth.loadMembership), auth.requireStaff, go(timeline.remove));

/* Files the teaching team attaches: the lecturer on an assignment, the poster
   (or the lecturer) on an announcement. Any member who can see it can open it. */
const att = '/attachments/:attachmentId';
router.post('/classrooms/:id/assignments/:assignmentId/attachments',
  mw(auth.loadMembership), auth.requireOwner, files.readUpload, go(attachments.addToAssignment));
router.delete('/classrooms/:id/assignments/:assignmentId' + att,
  mw(auth.loadMembership), auth.requireOwner, go(attachments.removeFromAssignment));
router.post('/classrooms/:id/announcements/:announcementId/attachments',
  mw(auth.loadMembership), auth.requireStaff, files.readUpload, go(attachments.addToAnnouncement));
router.delete('/classrooms/:id/announcements/:announcementId' + att,
  mw(auth.loadMembership), auth.requireStaff, go(attachments.removeFromAnnouncement));
router.get('/classrooms/:id' + att, mw(auth.loadMembership), go(attachments.open));

/* US-14: a student's own submission - files, links or both (SRS-21 to SRS-24).
   The upload route reads the files itself, after the membership check.
   Add ?view=1 to a file address to open it in the browser instead. */
const sub = '/classrooms/:id/assignments/:assignmentId/submission';
router.put(sub, mw(auth.loadMembership), files.readUpload, go(submissions.upload));
router.get(sub, mw(auth.loadMembership), go(submissions.mine));
router.get(sub + '/files/:fileId', mw(auth.loadMembership), go(submissions.myFile));

/* US-15: lecturers, TAs and University staff see who has submitted and open any
   file in their classroom (SRS-25). Students get 403. */
const subs = '/classrooms/:id/assignments/:assignmentId/submissions';
router.get(subs, mw(auth.loadMembership), auth.requireStaff, go(submissions.listForStaff));
router.get(subs + '/files/:fileId', mw(auth.loadMembership), auth.requireStaff, go(submissions.staffFile));
router.put('/classrooms/:id/assignments/:assignmentId/grades/:studentId',
  mw(auth.loadMembership), auth.requireStaff, go(submissions.setGrade));

module.exports = router;
