const router = require('express').Router();
const auth = require('./auth');
const classrooms = require('./classrooms');

/** Wraps an async handler so a thrown error reaches the error middleware. */
const go = (fn) => (req, res, next) => fn(req, res).catch(next);

router.post('/auth/login', go(auth.login));
router.get('/auth/me', auth.me);
router.post('/auth/logout', auth.logout);

router.use(auth.requireAuth);

router.get('/classrooms', go(classrooms.list));
router.get('/classrooms/preview-code', go(classrooms.previewCode));
router.post('/classrooms', go(classrooms.create));
router.post('/classrooms/join', go(classrooms.join));
router.get('/classrooms/:id', go(classrooms.detail));

module.exports = router;
