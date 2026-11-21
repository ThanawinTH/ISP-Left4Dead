/* ==========================================================================
   Boundary-value tests - Project D, Left4Dead.

   Lecture 13: equivalence partitioning says one value per class is enough;
   boundary value analysis says the bugs live at the edges. These tests sit
   on the edges - the last allowed value and the first refused one.

   Run with the acceptance suite:  npm test
   ========================================================================== */

const { test, before, describe } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000/api';
const UPLOAD_TYPE = 'application/vnd.ku-upload+json';

function client() {
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
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  }
  return {
    get: (p) => send('GET', p),
    post: (p, b) => send('POST', p, b),
    put: (p, b, t) => send('PUT', p, b, t),
    patch: (p, b) => send('PATCH', p, b),
    del: (p) => send('DELETE', p),
    signIn: (email) => send('POST', '/auth/test-login', { email }),
  };
}

const rep = (n, ch = 'a') => ch.repeat(n);
const bytes = (n) => Buffer.alloc(n, 0x41).toString('base64');
const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 19).replace('T', ' ');
const dayAfter = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const u = Date.now();

const lecturer = client();
const student = client();
const ctx = {};

before(async () => {
  await lecturer.signIn(`bl${u}@ku.th`);
  await student.signIn(`bs${u}@ku.th`);
  const made = await lecturer.post('/classrooms', { name: 'Boundaries', semester: '1/2026', subject_code: 'B01' });
  ctx.classId = made.body.classroom.id;
  await student.post('/classrooms/join', { code: made.body.classroom.join_code });
  const members = await lecturer.get(`/classrooms/${ctx.classId}/members`);
  ctx.studentId = members.body.members.find((m) => m.email.startsWith(`bs${u}`)).id;
  const a = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
    { title: 'Boundary work', due_at: inDays(7), points: 10, visibility: 'class' });
  ctx.assignmentId = a.body.id;
});

/* ====================================================================== */
describe('Text length boundaries - the column is VARCHAR(190)', () => {
  test('B-01  an assignment title of exactly 190 characters is accepted', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title: rep(190), due_at: inDays(5) });
    assert.equal(r.status, 201);
  });

  test('B-02  an assignment title of 191 characters is refused, not a 500', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title: rep(191), due_at: inDays(5) });
    assert.equal(r.status, 400, `expected a clear refusal, got ${r.status}`);
  });

  test('B-03  an announcement title of exactly 190 is accepted', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/announcements`,
      { title: rep(190), body: 'ok' });
    assert.equal(r.status, 201);
  });

  test('B-04  an announcement title of 191 is refused', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/announcements`,
      { title: rep(191), body: 'ok' });
    assert.equal(r.status, 400);
  });

  test('B-05  a staff task title of exactly 190 is accepted, 191 is refused', async () => {
    const ok = await lecturer.post(`/classrooms/${ctx.classId}/tasks`, { title: rep(190) });
    assert.equal(ok.status, 201);
    const no = await lecturer.post(`/classrooms/${ctx.classId}/tasks`, { title: rep(191) });
    assert.equal(no.status, 400);
  });

  test('B-06  a timeline title of exactly 190 is accepted, 191 is refused', async () => {
    const ok = await lecturer.post(`/classrooms/${ctx.classId}/timeline`,
      { kind: 'lab', title: rep(190), date: dayAfter(2) });
    assert.equal(ok.status, 201);
    const no = await lecturer.post(`/classrooms/${ctx.classId}/timeline`,
      { kind: 'lab', title: rep(191), date: dayAfter(2) });
    assert.equal(no.status, 400);
  });

  test('B-07  a chat message of exactly 2000 is accepted, 2001 is refused', async () => {
    const ok = await student.post(`/classrooms/${ctx.classId}/chat`, { body: rep(2000) });
    assert.equal(ok.status, 201);
    const no = await student.post(`/classrooms/${ctx.classId}/chat`, { body: rep(2001) });
    assert.equal(no.status, 400);
  });
});

/* ====================================================================== */
describe('Upload boundaries - SRS-22', () => {
  const sub = () => `/classrooms/${ctx.classId}/assignments/${ctx.assignmentId}/submission`;

  test('B-08  exactly 10 files is accepted, 11 is refused', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ name: `f${i}.txt`, data: bytes(16) }));
    assert.equal((await student.put(sub(), { files: ten }, UPLOAD_TYPE)).status, 201);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `g${i}.txt`, data: bytes(16) }));
    assert.equal((await student.put(sub(), { files: eleven }, UPLOAD_TYPE)).status, 400);
  });

  test('B-09  exactly 5 links is accepted, 6 is refused', async () => {
    const five = Array.from({ length: 5 }, (_, i) => `https://example.com/${i}`);
    assert.equal((await student.put(sub(), { links: five }, UPLOAD_TYPE)).status, 201);
    const six = Array.from({ length: 6 }, (_, i) => `https://example.com/x${i}`);
    assert.equal((await student.put(sub(), { links: six }, UPLOAD_TYPE)).status, 400);
  });

  test('B-10  a zero-byte file is refused', async () => {
    const r = await student.put(sub(), { files: [{ name: 'empty.txt', data: '' }] }, UPLOAD_TYPE);
    assert.equal(r.status, 400);
  });

  test('B-11  two files with the same name are refused', async () => {
    const r = await student.put(sub(), {
      files: [{ name: 'same.txt', data: bytes(8) }, { name: 'same.txt', data: bytes(8) }],
    }, UPLOAD_TYPE);
    assert.equal(r.status, 400);
  });

  test('B-12  a file one byte over 10 MB is refused', async () => {
    const r = await student.put(sub(),
      { files: [{ name: 'big.txt', data: bytes(10 * 1024 * 1024 + 1) }] }, UPLOAD_TYPE);
    assert.equal(r.status, 400, `expected 400, got ${r.status}`);
  });

  test('B-13  a link that is not http or https is refused', async () => {
    const r = await student.put(sub(), { links: ['javascript:alert(1)'] }, UPLOAD_TYPE);
    assert.equal(r.status, 400);
  });

  test('B-14  a link longer than 2000 characters is refused', async () => {
    const r = await student.put(sub(), { links: ['https://e.com/' + rep(2100)] }, UPLOAD_TYPE);
    assert.equal(r.status, 400);
  });
});

/* ====================================================================== */
describe('Grade boundaries - SRS-25', () => {
  const grade = () => `/classrooms/${ctx.classId}/assignments/${ctx.assignmentId}/grades/${ctx.studentId}`;

  test('B-15  a grade of exactly 0 is accepted', async () => {
    const r = await lecturer.put(grade(), { score: 0 });
    assert.equal(r.status, 200);
    assert.equal(r.body.grade.score, 0);
  });

  test('B-16  a grade of exactly the maximum is accepted', async () => {
    const r = await lecturer.put(grade(), { score: 10 });
    assert.equal(r.status, 200);
  });

  test('B-17  one above the maximum is refused', async () => {
    assert.equal((await lecturer.put(grade(), { score: 11 })).status, 400);
  });

  test('B-18  a negative grade is refused', async () => {
    assert.equal((await lecturer.put(grade(), { score: -1 })).status, 400);
  });

  test('B-19  a fractional grade is refused', async () => {
    assert.equal((await lecturer.put(grade(), { score: 7.5 })).status, 400);
  });

  test('B-20  an empty grade clears it rather than storing nothing', async () => {
    const r = await lecturer.put(grade(), { score: '' });
    assert.equal(r.status, 200);
    assert.equal(r.body.grade, null);
  });
});

/* ====================================================================== */
describe('Time boundaries', () => {
  test('B-21  a timeline item whose end equals its start is refused', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/timeline`,
      { kind: 'lab', title: 'Zero length', date: dayAfter(2), start_time: '13:00', end_time: '13:00' });
    assert.equal(r.status, 400);
  });

  test('B-22  one minute later is accepted', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/timeline`,
      { kind: 'lab', title: 'One minute', date: dayAfter(2), start_time: '13:00', end_time: '13:01' });
    assert.equal(r.status, 201);
  });

  test('B-23  an end time with no start time is refused', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/timeline`,
      { kind: 'consultation', title: 'No start', date: dayAfter(2), end_time: '16:00' });
    assert.equal(r.status, 400);
  });

  test('B-24  a due date in year 2020 is accepted, 2019 is refused', async () => {
    const ok = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title: 'Edge year low ok', due_at: '2020-01-01 09:00:00' });
    assert.equal(ok.status, 201);
    const no = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title: 'Edge year too low', due_at: '2019-12-31 09:00:00' });
    assert.equal(no.status, 400);
  });

  test('B-25  a due date in year 2100 is accepted, 2101 is refused', async () => {
    const ok = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title: 'Edge year high ok', due_at: '2100-01-01 09:00:00' });
    assert.equal(ok.status, 201);
    const no = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title: 'Edge year too high', due_at: '2101-01-01 09:00:00' });
    assert.equal(no.status, 400);
  });
});

/* ====================================================================== */
describe('Awkward input', () => {
  test('B-26  a Thai title is stored and returned unchanged', async () => {
    const title = 'การบ้านครั้งที่ ๑';
    const made = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title, due_at: inDays(4) });
    assert.equal(made.status, 201);
    const list = await lecturer.get(`/classrooms/${ctx.classId}/assignments`);
    assert.ok(list.body.assignments.some((a) => a.title === title), 'Thai text came back changed');
  });

  test('B-27  an apostrophe in a title does not break the query', async () => {
    const r = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title: "O'Brien's lab; DROP TABLE users;--", due_at: inDays(4) });
    assert.equal(r.status, 201);
    const still = await lecturer.get('/classrooms');
    assert.equal(still.status, 200, 'the users table should still be there');
  });

  test('B-28  a script tag is stored as text, not executed anywhere server-side', async () => {
    const title = '<script>alert(1)</script>';
    const made = await lecturer.post(`/classrooms/${ctx.classId}/assignments`,
      { title, due_at: inDays(4) });
    assert.equal(made.status, 201);
    const list = await lecturer.get(`/classrooms/${ctx.classId}/assignments`);
    assert.ok(list.body.assignments.some((a) => a.title === title));
  });

  test('B-29  joining the same class twice does not add a second membership', async () => {
    const mine = await lecturer.get(`/classrooms/${ctx.classId}`);
    const code = mine.body.classroom.join_code;
    await student.post('/classrooms/join', { code });
    const members = await lecturer.get(`/classrooms/${ctx.classId}/members`);
    const count = members.body.members.filter((m) => m.id === ctx.studentId).length;
    assert.equal(count, 1);
  });

  test('B-30  a join code typed in lower case with no dash still works', async () => {
    const mine = await lecturer.get(`/classrooms/${ctx.classId}`);
    const messy = mine.body.classroom.join_code.replace('-', '').toLowerCase() + ' ';
    const other = client();
    await other.signIn(`bm${u}@ku.th`);
    const r = await other.post('/classrooms/join', { code: messy });
    assert.equal(r.status, 200);
  });
});
