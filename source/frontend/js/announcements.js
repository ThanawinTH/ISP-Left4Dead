/* ==========================================================================
   Class Announcements (US-10, US-11)
   Everyone in the classroom reads the same list, newest first (US-11).
   A lecturer, TA or University staff member also gets a "New Announcement"
   button that opens the post form (US-10). The server decides who can post;
   the page only follows its answer.
   ========================================================================== */

const classroomId = new URLSearchParams(location.search).get('id');
const $ = (id) => document.getElementById(id);

const ROLE_LABEL = {
  lecturer: 'Lecturer',
  ta: 'TA',
  staff: 'University Staff',
  student: 'Student',
};

let canPost = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const initials = (name) => String(name || '?').slice(0, 2).toUpperCase();

/** "23 Oct 2026 · 14:05" in the reader's own time zone. */
function when(value) {
  const d = new Date(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/* ---------- US-11: the list ---------- */

async function loadClassroom() {
  const { classroom } = await API.get('/classrooms/' + classroomId);
  $('classSub').textContent =
    (classroom.subject_code ? classroom.subject_code + ' ' : '') + classroom.name;
}

async function loadAnnouncements() {
  const data = await API.get(`/classrooms/${classroomId}/announcements`);
  canPost = data.canPost;
  render(data.announcements);
}

function render(list) {
  $('noticeCount').textContent = list.length;

  if (!list.length) {
    $('noticeList').innerHTML = `
      <div class="anns__empty">
        <strong>No announcements yet</strong>
        ${canPost ? 'Use <b>New Announcement</b> to post the first one.'
                  : 'When your lecturer or TA posts something, it will show up here.'}
      </div>`;
    return;
  }
  // The server already sends them newest first; there is no search or filter.
  $('noticeList').innerHTML = list.map((a, i) => cardHTML(a, i === 0)).join('');
}

function cardHTML(a, latest) {
  const role = a.author_role || '';
  return `
    <article class="ann${latest ? ' is-latest' : ''}">
      <header class="ann__head">
        <span class="avatar avatar--sm ann__avatar ann__avatar--${esc(role)}">${esc(initials(a.author_name))}</span>
        <div class="ann__who">
          <div class="ann__name">
            ${esc(a.author_name)}
            ${ROLE_LABEL[role] ? `<span class="ann__role ann__role--${esc(role)}">${esc(ROLE_LABEL[role])}</span>` : ''}
          </div>
          <div class="ann__time">${esc(when(a.created_at))}</div>
        </div>
        ${latest ? '<span class="ann__latest">Latest</span>' : ''}
      </header>
      <h3 class="ann__title">${esc(a.title)}</h3>
      <p class="ann__body">${esc(a.body)}</p>
    </article>`;
}

/* ---------- US-10: New Announcement ---------- */

function setError(fieldId, on) {
  $(fieldId).classList.toggle('is-error', on);
  $(fieldId).querySelector('.input').classList.toggle('is-error', on);
}

function openComposer() {
  $('postForm').hidden = false;
  $('newBtn').hidden = true;                 // the form takes the button's place
  $('title').focus();
}

function closeComposer() {
  $('postForm').reset();
  setError('titleField', false);
  setError('bodyField', false);
  $('postForm').hidden = true;
  $('newBtn').hidden = false;
}

async function post(e) {
  e.preventDefault();
  const title = $('title').value.trim();
  const body = $('body').value.trim();

  setError('titleField', !title);
  setError('bodyField', !body);
  if (!title || !body) return;

  $('postBtn').disabled = true;
  try {
    await API.post(`/classrooms/${classroomId}/announcements`, { title, body });
    closeComposer();
    KU.toast('Announcement posted');
    await loadAnnouncements();
  } catch (err) {
    KU.toast(err.message);
  } finally {
    $('postBtn').disabled = false;
  }
}

function setUpPosting() {
  if (!canPost) return;                      // students only read
  $('newBtn').hidden = false;
  $('newBtn').addEventListener('click', openComposer);
  $('closeBtn').addEventListener('click', closeComposer);
  $('cancelBtn').addEventListener('click', closeComposer);
  $('postForm').addEventListener('submit', post);
  ['title', 'body'].forEach(id => $(id).addEventListener('input', () =>
    setError(id + 'Field', false)));
}

/* ---------- start ---------- */

(async () => {
  if (!classroomId) {
    $('noticeList').innerHTML = '<div class="anns__empty"><strong>No classroom selected</strong></div>';
    return;
  }
  // the class menu on this page has to point back at the right classroom
  $('assignmentLink').href = 'class-schedule.html?id=' + classroomId;
  $('membersLink').href = 'members.html?id=' + classroomId;

  try {
    await loadClassroom();
    await loadAnnouncements();
    setUpPosting();
  } catch (err) {
    $('noticeList').innerHTML =
      `<div class="anns__empty"><strong>Could not load announcements</strong>${esc(err.message)}</div>`;
  }
})();
