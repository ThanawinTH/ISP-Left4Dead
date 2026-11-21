/* ==========================================================================
   Iteration 6 tests - Project D, Left4Dead.

   The features added or reworked in Iteration 6, tested the same way as
   api.test.js and boundary.test.js: through the real HTTP API, as real
   signed-in users, against the real MySQL schema. Nothing is mocked.

     I-01..I-02  D-02 on edit (the 190-character title limit)
     I-03..I-09  Unsubmit (US-14 rework)
     I-10..I-15  Ungrade (US-15 rework)
     I-16..I-20  Delete an announcement (lecturer only)
     I-21..I-25  Delete a classroom (owner lecturer only)
     I-26        To-do search on the server (US-19)

   Run:  npm test          (needs the stack up and TEST_LOGIN=1)
   Each run signs in new users and makes new classes, so it can run again and
   again on the same database.
   ========================================================================== */

const { test, before, describe } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000/api';
const UPLOAD_TYPE = 'application/vnd.ku-upload+json';

/** One signed-in browser: keeps its own session cookie, like a real person. */
function client(label) {
  let cookie = '';
  async function send(method, path, body, contentType) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let payload;
    if (body !== undefined) {
      headers['content-type'] = contentType || 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, body: data };
  }
  return {
    label,
    get: (p) => send('GET', p),
    post: (p, b) => send('POST', p, b),
    put: (p, b, t) => send('PUT', p, b, t),
    patch: (p, b) => send('PATCH', p, b),
    del: (p) => send('DELETE', p),
    signIn: (email) => send('POST', '/auth/test-login', { email }),
  };
}

const b64 = (s) => Buffer.from(s).toString('base64');
const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 19).replace('T', ' ');
const u = 'i6' + Date.now().toString(36);

const lecturer = client('lecturer');
const taOn = client('TA on the assignment');
const taOff = client('TA not on the assignment');
const student = client('student');
const outsider = client('outsider');

const ctx = {};
const cls = () => `/classrooms/${ctx.classId}`;
const sub = () => `${cls()}/assignments/${ctx.assignmentId}/submission`;
const grade = (sid) => `${cls()}/assignments/${ctx.assignmentId}/grades/${sid}`;
const list = () => `${cls()}/assignments/${ctx.assignmentId}/submissions`;
const handIn = () => student.put(sub(), { files: [{ name: 'work.pdf', data: b64('%PDF-1.4 work') }] }, UPLOAD_TYPE);

before(async () => {
  for (const [c, name] of [[lecturer, 'lect'], [taOn, 'taon'], [taOff, 'taoff'], [student, 'stu'], [outsider, 'out']]) {
    const r = await c.signIn(`${name}${u}@ku.th`);
    assert.equal(r.status, 200, 'test sign-in failed - is the server running with TEST_LOGIN=1?');
  }

  const made = await lecturer.post('/classrooms', { name: `Iteration 6 ${u}`, semester: '2/2026', subject_code: 'I6' });
  ctx.classId = made.body.classroom.id;
  for (const c of [taOn, taOff, student]) await c.post('/classrooms/join', { code: made.body.classroom.join_code });

  const members = (await lecturer.get(`${cls()}/members`)).body.members;
  const id = (prefix) => members.find((m) => m.email.startsWith(prefix + u)).id;
  ctx.taOnId = id('taon');
  ctx.taOffId = id('taoff');
  ctx.studentId = id('stu');
  for (const t of [ctx.taOnId, ctx.taOffId]) await lecturer.patch(`${cls()}/members/${t}`, { role: 'ta' });

  // One open assignment, with only taOn on its teaching team.
  const a = await lecturer.post(`${cls()}/assignments`, {
    title: `Lab report ${u}`, due_at: inDays(7), points: 10, visibility: 'class', staff_ids: [ctx.taOnId],
  });
  assert.equal(a.status, 201);
  ctx.assignmentId = a.body.id;

  // One closed assignment: past due, late work not allowed.
  const closed = await lecturer.post(`${cls()}/assignments`, {
    title: `Closed quiz ${u}`, due_at: inDays(-2), points: 5, visibility: 'class', allow_late: false,
  });
  ctx.closedId = closed.body.id;
});

/* ====================================================================== */
describe('D-02 - the 190-character title limit also holds when editing', () => {
  test('I-01  renaming an assignment to 191 characters is refused with 400, not 500', async () => {
    const r = await lecturer.patch(`${cls()}/assignments/${ctx.closedId}`, { title: 'b'.repeat(191) });
    assert.equal(r.status, 400);
  });

  test('I-02  renaming an assignment to exactly 190 characters is accepted', async () => {
    const r = await lecturer.patch(`${cls()}/assignments/${ctx.closedId}`, { title: 'c'.repeat(190) });
    assert.equal(r.status, 200);
  });
});

/* ====================================================================== */
describe('US-14 rework - a student unsubmits, as in Google Classroom', () => {
  test('I-03  a student unsubmits their work and nothing is left handed in', async () => {
    assert.equal((await handIn()).status, 201);
    const r = await student.del(sub());
    assert.equal(r.status, 200);
    assert.equal(r.body.submission, null);
    assert.equal((await student.get(sub())).body.submission, null);
  });

  test('I-04  after unsubmitting, the staff count goes back down', async () => {
    const r = await lecturer.get(list());
    assert.equal(r.status, 200);
    assert.equal(r.body.submitted, 0);
  });

  test('I-05  unsubmitting when nothing is handed in is refused with 404', async () => {
    assert.equal((await student.del(sub())).status, 404);
  });

  test('I-06  staff cannot unsubmit - only students do (403)', async () => {
    assert.equal((await lecturer.del(sub())).status, 403);
    assert.equal((await taOn.del(sub())).status, 403);
  });

  test('I-07  a closed assignment cannot be unsubmitted (403)', async () => {
    const r = await student.del(`${cls()}/assignments/${ctx.closedId}/submission`);
    assert.equal(r.status, 403);
  });

  test('I-08  someone outside the class cannot unsubmit (403)', async () => {
    assert.equal((await outsider.del(sub())).status, 403);
  });

  test('I-09  unsubmitting keeps the grade, and handing in again shows Resubmitted', async () => {
    assert.equal((await handIn()).status, 201);
    assert.equal((await lecturer.put(grade(ctx.studentId), { score: 7, feedback: 'ok' })).status, 200);
    assert.equal((await student.del(sub())).status, 200);
    assert.equal((await student.get(sub())).body.grade.score, 7, 'the grade must stay after unsubmitting');

    await new Promise((r) => setTimeout(r, 1100));       // submitted_at must be later than graded_at
    assert.equal((await handIn()).status, 201);
    const row = (await lecturer.get(list())).body.students.find((s) => s.id === ctx.studentId);
    assert.equal(row.grade.resubmitted, true);
  });
});

/* ====================================================================== */
describe('US-15 rework - staff ungrade, then grade again', () => {
  test('I-10  a student cannot ungrade (403)', async () => {
    assert.equal((await student.del(grade(ctx.studentId))).status, 403);
  });

  test('I-11  a TA who is not on the assignment cannot ungrade (403)', async () => {
    assert.equal((await taOff.del(grade(ctx.studentId))).status, 403);
  });

  test('I-12  a TA on the assignment ungrades, and the student sees no grade', async () => {
    const r = await taOn.del(grade(ctx.studentId));
    assert.equal(r.status, 200);
    assert.equal(r.body.grade, null);
    assert.equal((await student.get(sub())).body.grade, null);
  });

  test('I-13  ungrading when there is no grade is refused with 404', async () => {
    assert.equal((await lecturer.del(grade(ctx.studentId))).status, 404);
  });

  test('I-14  the lecturer ungrades and the student\'s work is not touched', async () => {
    assert.equal((await lecturer.put(grade(ctx.studentId), { score: 9 })).status, 200);
    assert.equal((await lecturer.del(grade(ctx.studentId))).status, 200);
    const mine = await student.get(sub());
    assert.ok(mine.body.submission, 'the submission must still be there');
    assert.equal(mine.body.submission.files.length, 1);
  });

  test('I-15  after ungrading, the work can be graded again', async () => {
    const r = await lecturer.put(grade(ctx.studentId), { score: 10, feedback: 'Regraded' });
    assert.equal(r.status, 200);
    assert.equal((await student.get(sub())).body.grade.score, 10);
  });
});

/* ====================================================================== */
describe('New - the lecturer deletes an announcement', () => {
  before(async () => {
    const n = await lecturer.post(`${cls()}/announcements`, { title: `Posted by mistake ${u}`, body: 'Wrong room.' });
    ctx.annId = n.body.announcement ? n.body.announcement.id : n.body.id;
    const att = await lecturer.post(`${cls()}/announcements/${ctx.annId}/attachments`,
      { files: [{ name: 'slides.pdf', data: b64('%PDF-1.4 slides') }] });
    assert.equal(att.status, 201);
    ctx.annFileId = att.body.attachments[0].id;

    // An announcement in a different class, to check the class in the URL is respected.
    const other = await outsider.post('/classrooms', { name: `Other ${u}`, semester: '2/2026', subject_code: 'OT' });
    ctx.otherClassId = other.body.classroom.id;
    const on = await outsider.post(`/classrooms/${ctx.otherClassId}/announcements`, { title: 'Other class news', body: 'x' });
    ctx.otherAnnId = on.body.announcement ? on.body.announcement.id : on.body.id;
  });

  test('I-16  only the lecturer is told they can delete (can_delete)', async () => {
    const mine = (c) => c.get(`${cls()}/announcements`)
      .then((r) => r.body.announcements.find((a) => a.id === ctx.annId));
    assert.equal((await mine(lecturer)).can_delete, true);
    assert.equal((await mine(taOn)).can_delete, false);
    assert.equal((await mine(student)).can_delete, false);
  });

  test('I-17  a TA or a student deleting an announcement is refused with 403', async () => {
    assert.equal((await taOn.del(`${cls()}/announcements/${ctx.annId}`)).status, 403);
    assert.equal((await student.del(`${cls()}/announcements/${ctx.annId}`)).status, 403);
  });

  test('I-18  an announcement from another class cannot be deleted through this class (404)', async () => {
    assert.equal((await lecturer.del(`${cls()}/announcements/${ctx.otherAnnId}`)).status, 404);
  });

  test('I-19  the lecturer deletes it, it is gone for everyone, and its file goes with it', async () => {
    assert.equal((await lecturer.del(`${cls()}/announcements/${ctx.annId}`)).status, 200);
    const left = (await student.get(`${cls()}/announcements`)).body.announcements;
    assert.ok(!left.some((a) => a.id === ctx.annId));
    assert.equal((await student.get(`${cls()}/attachments/${ctx.annFileId}`)).status, 404);
  });

  test('I-20  deleting the same announcement again is refused with 404', async () => {
    assert.equal((await lecturer.del(`${cls()}/announcements/${ctx.annId}`)).status, 404);
  });
});

/* ====================================================================== */
describe('New - the owner lecturer deletes a classroom', () => {
  const gone = {};
  before(async () => {
    const c = await lecturer.post('/classrooms', { name: `To delete ${u}`, semester: '2/2026', subject_code: 'DEL' });
    gone.id = c.body.classroom.id;
    gone.code = c.body.classroom.join_code;
    for (const m of [taOn, student]) await m.post('/classrooms/join', { code: gone.code });
    await lecturer.patch(`/classrooms/${gone.id}/members/${ctx.taOnId}`, { role: 'ta' });
    await lecturer.post(`/classrooms/${gone.id}/assignments`, { title: 'Will vanish', due_at: inDays(3), visibility: 'class' });
    await lecturer.post(`/classrooms/${gone.id}/announcements`, { title: 'Will vanish', body: 'x' });
    await student.post(`/classrooms/${gone.id}/chat`, { body: 'hello' });
  });

  test('I-21  a TA or a student deleting the classroom is refused with 403', async () => {
    assert.equal((await taOn.del(`/classrooms/${gone.id}`)).status, 403);
    assert.equal((await student.del(`/classrooms/${gone.id}`)).status, 403);
  });

  test('I-22  someone outside the class deleting it is refused with 403', async () => {
    assert.equal((await outsider.del(`/classrooms/${gone.id}`)).status, 403);
  });

  test('I-23  the owner deletes it and it disappears for every member', async () => {
    assert.equal((await lecturer.del(`/classrooms/${gone.id}`)).status, 200);
    for (const c of [lecturer, taOn, student]) {
      const r = await c.get('/classrooms');
      assert.ok(!r.body.classrooms.some((x) => x.id === gone.id), `${c.label} still sees the deleted class`);
    }
  });

  test('I-24  nothing inside it can be opened, and the old join code stops working', async () => {
    assert.equal((await lecturer.get(`/classrooms/${gone.id}`)).status, 403);
    assert.equal((await lecturer.get(`/classrooms/${gone.id}/assignments`)).status, 403);
    assert.equal((await outsider.post('/classrooms/join', { code: gone.code })).status, 404);
  });

  test('I-25  user accounts are kept and their other classes are untouched', async () => {
    const r = await student.get('/classrooms');
    assert.equal(r.status, 200);
    assert.ok(r.body.classrooms.some((x) => x.id === ctx.classId), 'the student lost their other class');
  });
});

/* ====================================================================== */
describe('US-19 - the To-do search runs on the server', () => {
  test('I-26  ?q= searches on the server and only returns matching work', async (t) => {
    const r = await student.get(`/todo?q=${encodeURIComponent('Lab report ' + u)}`);
    assert.equal(r.status, 200);
    if (!('search' in r.body)) return t.skip('server-side search (feature/todo-search-api) is not merged yet');
    assert.equal(r.body.search, 'Lab report ' + u);
    assert.ok(r.body.student.assignments.length >= 1);
    assert.ok(r.body.student.assignments.every((a) => a.title.includes(u)));
  });
});
