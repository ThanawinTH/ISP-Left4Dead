const router = require('express').Router();
const auth = require('./auth');
const classrooms = require('./classrooms');
const members = require('./members');

/** Wraps an async handler so a thrown error reaches the error middleware. */
const go = (fn) => (req, res, next) => fn(req, res).catch(next);

/** Same idea, but for async middleware - it also needs next() to carry on. */
const mw = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.post('/auth/login', go(auth.login));
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

module.exports = router;
