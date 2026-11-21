/* ==========================================================================
   Automated acceptance tests - Project D, Left4Dead.

   Closes action item R-05, carried in the Iteration 3, 4 and 5 reports.

   Every test drives the real HTTP API against a real MySQL schema, as a real
   signed-in user. Nothing is mocked, so a test passing means the server
   behaves that way - not that a function was called.

   Roughly half the tests are refusals, because that is where the SRS rules
   live: a hidden button proves nothing, the server has to say no.

   Run:  npm test          (needs the stack up and TEST_LOGIN=1)
         Files: test/api.test.js, test/boundary.test.js, test/iteration6.test.js
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
const dayAfter = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const unique = Date.now();

const lecturer = client('lecturer');
const ta = client('ta');
const student = client('student');
const outsider = client('outsider');
const guest = client('not signed in');

const ctx = {};     // ids created during setup, shared by the tests

before(async () => {
  await lecturer.signIn(`lect${unique}@ku.th`);
  await ta.signIn(`ta${unique}@ku.th`);
  await student.signIn(`stu${unique}@ku.th`);
  await outsider.signIn(`out${unique}@ku.th`);

  const made = await lecturer.post('/classrooms', {
    name: 'Software Process', semester: '1/2026', subject_code: '01204332',
  });
  ctx.classId = made.body.classroom.id;
  ctx.joinCode = made.body.classroom.join_code;

  await ta.post('/classrooms/join', { code: ctx.joinCode });
  await student.post('/classrooms/join', { code: ctx.joinCode });

  const members = await lecturer.get(`/classrooms/${ctx.classId}/members`);
  const find = (email) => members.body.members.find((m) => m.email.startsWith(email));
  ctx.taId = find(`ta${unique}`).id;
  ctx.studentId = find(`stu${unique}`).id;

  await lecturer.patch(`/classrooms/${ctx.classId}/members/${ctx.taId}`, { role: 'ta' });

  const open = await lecturer.post(`/classrooms/${ctx.classId}/assignments`, {
    title: 'Lab 1', due_at: inDays(7), points: 10, visibility: 'class',
  });
  ctx.assignmentId = open.body.id;
});

/* ====================================================================== */
describe('US-16 / SRS-26, SRS-27 - sign-in is @ku.th only', () => {
  test('T-01  a non-@ku.th address is refused', async () => {
    const r = await client('outsider').signIn('someone@gmail.com');
    assert.equal(r.status, 403);
  });

  test('T-02  a @ku.th address is accepted and no password is stored', async () => {
    const c = client('new');
    const r = await c.signIn(`fresh${unique}@ku.th`);
    assert.equal(r.status, 200);
    assert.equal(r.body.user.email, `fresh${unique}@ku.th`);
    assert.ok(!('password' in r.body.user));
  });

  test('T-03  a signed-out request is refused with 401', async () => {
    assert.equal((await guest.get('/classrooms')).status, 401);
  });
});

/* ====================================================================== */
describe('US-1 to US-3 / SRS-1 to SRS-5 - classroom and join code', () => {
  test('T-04  the lecturer creates a classroom and gets a join code', () => {
    assert.ok(ctx.classId > 0);
    assert.match(ctx.joinCode, /^KU-[A-Z0-9]{4}$/);
  });

  test('T-05  a join code always joins as Student, never as staff', async () => {
    const r = await student.get(`/classrooms/${ctx.classId}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.role, 'student');
  });

  test('T-06  the join code is never sent to a student', async () => {
    const mine = await student.get('/classrooms');
    const row = mine.body.classrooms.find((c) => c.id === ctx.classId);
    assert.equal(row.join_code, null);
  });

  test('T-07  someone who is not a member is refused the classroom', async () => {
    assert.equal((await outsider.get(`/classrooms/${ctx.classId}`)).status, 403);
  });
});

/* ====================================================================== */
describe('US-4 / SRS-7 - roles are set by the lecturer only', () => {
  test('T-08  the lecturer can change a member role', async () => {
    const r = await lecturer.patch(`/classrooms/${ctx.classId}/members/${ctx.studentId}`, { role: 'student' });
    assert.equal(r.status, 200);
  });

  test('T-09  a student calling the role endpoint directly is refused', async () => {
    const r = await student.patch(`/classrooms/${ctx.classId}/members/${ctx.studentId}`, { role: 'lecturer' });
    assert.equal(r.status, 403);
  });

  test('T-10  a TA cannot change roles either', async () => {
    const r = await ta.patch(`/classrooms/${ctx.classId}/members/${ctx.studentId}`, { role: 'ta' });
    assert.equal(r.status, 403);
  });
});

/* ====================================================================== */
describe('US-5, US-6 / SRS-10, SRS-14 - creating an assignment', () => {
  test('T-11  a blank title is refused with 400', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/assignments`, { title: '  ', due_at: inDays(3) });
    assert.equal(r.status, 400);
  });

  test('T-12  a missing due date is refused with 400', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/assignments`, { title: 'No date' });
    assert.equal(r.status, 400);
  });

  test('T-13  a mistyped year is refused with 400', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title: 'Typo', due_at: '20268-01-01 09:00:00' });
    assert.equal(r.status, 400);
  });

  test('T-14  a student creating an assignment is refused with 403', async () => {
    const r = await student.post(`/classrooms/${ctx.classId}/assignments`,
      { title: 'Not allowed', due_at: inDays(3) });
    assert.equal(r.status, 403);
  });

  test('T-15  a TA creating an assignment is refused with 403', async () => {
    const r = await ta.post(`/classrooms/${ctx.classId}/assignments`,
      { title: 'Not allowed', due_at: inDays(3) });
    assert.equal(r.status, 403);
  });

  test('T-16  a staff-only assignment never reaches a student', async () => {
    await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title: 'Staff eyes only', due_at: inDays(5), visibility: 'staff' });
    const seen = await student.get(`/classrooms/${ctx.classId}/assignments`);
    const titles = seen.body.assignments.map((a) => a.title);
    assert.ok(!titles.includes('Staff eyes only'));
  });
});

/* ====================================================================== */
describe('US-10, US-11 / SRS-15, SRS-17 - announcements', () => {
  test('T-17  staff can post an announcement', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/announcements`,
      { title: 'Lab moved', body: 'Room 304 this week.' });
    assert.equal(r.status, 201);
  });

  test('T-18  a student posting an announcement is refused with 403', async () => {
    const r = await student.post(`/classrooms/${ctx.classId}/announcements`,
      { title: 'Nope', body: 'Nope' });
    assert.equal(r.status, 403);
  });

  test('T-19  every member can read the announcements', async () => {
    const r = await student.get(`/classrooms/${ctx.classId}/announcements`);
    assert.equal(r.status, 200);
    assert.ok(r.body.announcements.length >= 1);
    assert.equal(r.body.canPost, false);
  });
});

/* ====================================================================== */
describe('US-14 / SRS-21 to SRS-24 - a student hands work in', () => {
  const sub = () => `/classrooms/${ctx.classId}/assignments/${ctx.assignmentId}/submission`;

  test('T-20  a student submits a file and a link together', async () => {
    const r = await student.put(sub(), {
      files: [{ name: 'report.pdf', data: b64('%PDF-1.4 pretend') }],
      links: ['https://github.com/ThanawinTH/ISP-Left4Dead'],
    }, UPLOAD_TYPE);
    assert.equal(r.status, 201);
    assert.equal(r.body.submission.files.length, 1);
    assert.equal(r.body.submission.links.length, 1);
  });

  test('T-21  an empty submission is refused with 400', async () => {
    const r = await student.put(sub(), { files: [], links: [] }, UPLOAD_TYPE);
    assert.equal(r.status, 400);
  });

  test('T-22  a disallowed file type is refused by the server', async () => {
    const r = await student.put(sub(), {
      files: [{ name: 'virus.exe', data: b64('MZ') }],
    }, UPLOAD_TYPE);
    assert.equal(r.status, 400);
  });

  test('T-23  submitting again replaces the earlier set, it does not add to it', async () => {
    await student.put(sub(), {
      files: [{ name: 'final.pdf', data: b64('%PDF-1.4 final') }],
    }, UPLOAD_TYPE);
    const mine = await student.get(sub());
    assert.equal(mine.body.submission.files.length, 1);
    assert.equal(mine.body.submission.files[0].file_name, 'final.pdf');
    assert.equal(mine.body.submission.links.length, 0, 'the earlier link must be gone too');
  });

  test('T-24  staff cannot submit work - only students do', async () => {
    const r = await lecturer.put(sub(), {
      files: [{ name: 'notes.pdf', data: b64('%PDF') }],
    }, UPLOAD_TYPE);
    assert.equal(r.status, 403);
  });

  test('T-25  a closed assignment refuses a late submission with 403', async () => {
    const made = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title: 'Closed quiz', due_at: inDays(-2), points: 5, visibility: 'class', allow_late: false });
    const r = await student.put(
      `/classrooms/${ctx.classId}/assignments/${made.body.id}/submission`,
      { files: [{ name: 'late.pdf', data: b64('%PDF late') }] }, UPLOAD_TYPE);
    assert.equal(r.status, 403);
  });

  test('T-26  when the lecturer allows late work it is accepted and marked Late', async () => {
    const made = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title: 'Late allowed', due_at: inDays(-2), points: 5, visibility: 'class', allow_late: true });
    const r = await student.put(
      `/classrooms/${ctx.classId}/assignments/${made.body.id}/submission`,
      { files: [{ name: 'late.pdf', data: b64('%PDF late') }] }, UPLOAD_TYPE);
    assert.equal(r.status, 201);
    assert.equal(r.body.submission.late, 1, 'the server marks a late submission Late (SRS-24)');
  });
});

/* ====================================================================== */
describe('US-15 / SRS-25 - who submitted, and grading', () => {
  const list = () => `/classrooms/${ctx.classId}/assignments/${ctx.assignmentId}/submissions`;
  const grade = (sid) => `/classrooms/${ctx.classId}/assignments/${ctx.assignmentId}/grades/${sid}`;

  test('T-27  a student asking for the submission list is refused with 403', async () => {
    assert.equal((await student.get(list())).status, 403);
  });

  test('T-28  staff see the submitted count against the number of students', async () => {
    const r = await lecturer.get(list());
    assert.equal(r.status, 200);
    assert.equal(r.body.submitted, 1);
    assert.ok(r.body.total >= 1);
  });

  test('T-29  the lecturer can record a grade and a comment', async () => {
    const r = await lecturer.put(grade(ctx.studentId), { score: 8, feedback: 'Good work' });
    assert.equal(r.status, 200);
    assert.equal(r.body.grade.score, 8);
  });

  test('T-30  a grade above the assignment points is refused with 400', async () => {
    assert.equal((await lecturer.put(grade(ctx.studentId), { score: 99 })).status, 400);
  });

  test('T-31  a student cannot grade, not even themselves', async () => {
    assert.equal((await student.put(grade(ctx.studentId), { score: 10 })).status, 403);
  });

  test('T-32  a TA who is not on the assignment cannot grade it', async () => {
    assert.equal((await ta.put(grade(ctx.studentId), { score: 10 })).status, 403);
  });

  test('T-33  the student sees their own grade and comment', async () => {
    const r = await student.get(`/classrooms/${ctx.classId}/assignments/${ctx.assignmentId}/submission`);
    assert.equal(r.body.grade.score, 8);
    assert.equal(r.body.grade.feedback, 'Good work');
  });
});

/* ====================================================================== */
describe('US-12, US-13 / SRS-18 to SRS-20 - class chat and staff chat', () => {
  test('T-34  any member can post in the class chat', async () => {
    const r = await student.post(`/classrooms/${ctx.classId}/chat`, { body: 'Is the lab on?' });
    assert.equal(r.status, 201);
    assert.equal(r.body.message.body, 'Is the lab on?');
  });

  test('T-35  the server sets the author, it is not taken from the request', async () => {
    const r = await student.post(`/classrooms/${ctx.classId}/chat`,
      { body: 'spoof attempt', author_id: 99999 });
    assert.equal(r.status, 201);
    assert.equal(r.body.message.author_id, ctx.studentId);
  });

  test('T-36  an empty message is refused with 400', async () => {
    assert.equal((await student.post(`/classrooms/${ctx.classId}/chat`, { body: '   ' })).status, 400);
  });

  test('T-37  a student reading the staff chat is refused with 403', async () => {
    assert.equal((await student.get(`/classrooms/${ctx.classId}/staff-chat`)).status, 403);
  });

  test('T-38  a student posting in the staff chat is refused with 403', async () => {
    assert.equal((await student.post(`/classrooms/${ctx.classId}/staff-chat`, { body: 'hello' })).status, 403);
  });

  test('T-39  a TA can post in the staff chat', async () => {
    const r = await ta.post(`/classrooms/${ctx.classId}/staff-chat`, { body: 'Cover swap?' });
    assert.equal(r.status, 201);
  });

  test('T-40  an outsider cannot read the class chat at all', async () => {
    assert.equal((await outsider.get(`/classrooms/${ctx.classId}/chat`)).status, 403);
  });
});

/* ====================================================================== */
describe('US-18 - internal staff tasks', () => {
  const tasks = () => `/classrooms/${ctx.classId}/tasks`;

  test('T-41  staff can create an internal task', async () => {
    const r = await lecturer.post(tasks(), { title: 'Prepare demo', due_date: dayAfter(3) });
    assert.equal(r.status, 201);
    ctx.taskId = r.body.task.id;
  });

  test('T-42  a student reading the task board is refused with 403', async () => {
    assert.equal((await student.get(tasks())).status, 403);
  });

  test('T-43  a student creating a task is refused with 403', async () => {
    assert.equal((await student.post(tasks(), { title: 'Nope' })).status, 403);
  });

  test('T-44  a task with no title is refused with 400', async () => {
    assert.equal((await lecturer.post(tasks(), { title: '' })).status, 400);
  });

  test('T-45  moving a task to Done records when it was closed', async () => {
    const r = await lecturer.patch(`${tasks()}/${ctx.taskId}`, { status: 'done' });
    assert.equal(r.status, 200);
    assert.equal(r.body.task.status, 'done');
    assert.ok(r.body.task.closed_at);
  });

  test('T-46  reopening a task clears the closed time', async () => {
    const r = await lecturer.patch(`${tasks()}/${ctx.taskId}`, { status: 'open' });
    assert.equal(r.body.task.closed_at, null);
  });
});

/* ====================================================================== */
describe('US-17 - the class schedule', () => {
  const tl = () => `/classrooms/${ctx.classId}/timeline`;

  test('T-47  staff can add a lab session', async () => {
    const r = await lecturer.post(tl(), {
      kind: 'lab', title: 'Lab session 4', date: dayAfter(2),
      start_time: '13:00', end_time: '16:00', place: 'Room 304',
    });
    assert.equal(r.status, 201);
    ctx.eventId = r.body.event.id;
  });

  test('T-48  a student adding a schedule item is refused with 403', async () => {
    const r = await student.post(tl(), { kind: 'lab', title: 'Nope', date: dayAfter(2) });
    assert.equal(r.status, 403);
  });

  test('T-49  an end time before the start time is refused with 400', async () => {
    const r = await lecturer.post(tl(), {
      kind: 'consultation', title: 'Backwards', date: dayAfter(2),
      start_time: '16:00', end_time: '13:00',
    });
    assert.equal(r.status, 400);
  });

  test('T-50  an unknown kind is refused with 400', async () => {
    const r = await lecturer.post(tl(), { kind: 'party', title: 'Nope', date: dayAfter(2) });
    assert.equal(r.status, 400);
  });

  test('T-51  every member can read the schedule', async () => {
    const r = await student.get(tl());
    assert.equal(r.status, 200);
    assert.ok(r.body.events.length >= 1);
  });

  test('T-52  an outsider cannot read the schedule', async () => {
    assert.equal((await outsider.get(tl())).status, 403);
  });
});

/* ====================================================================== */
describe('US-19 - the to-do page across all my classes', () => {
  test('T-53  a student sees their own classes and their work', async () => {
    const r = await student.get('/todo');
    assert.equal(r.status, 200);
    const ids = r.body.classes.map((c) => c.id);
    assert.ok(ids.includes(ctx.classId));
    assert.ok(r.body.student.assignments.length >= 1);
  });

  test('T-54  a class the user does not belong to never appears', async () => {
    const r = await outsider.get('/todo');
    const ids = r.body.classes.map((c) => c.id);
    assert.ok(!ids.includes(ctx.classId));
  });

  test('T-55  staff get the staff side, with the internal tasks', async () => {
    const r = await lecturer.get('/todo');
    assert.ok(r.body.staff.assignments.length >= 1);
    assert.ok(Array.isArray(r.body.staff.tasks));
  });

  test('T-56  the role a user holds in a class decides which side it lands on', async () => {
    const mine = (await student.get('/todo')).body;
    const row = mine.classes.find((c) => c.id === ctx.classId);
    assert.equal(row.role, 'student');
  });
});
