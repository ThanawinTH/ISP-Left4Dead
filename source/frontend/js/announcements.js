/* ==========================================================================
   Class Announcements (US-11)
   Everyone in the classroom reads the same list, newest first.
   ========================================================================== */

const classroomId = new URLSearchParams(location.search).get('id');
const $ = (id) => document.getElementById(id);

const ROLE_LABEL = {
  lecturer: 'Lecturer',
  ta: 'TA',
  staff: 'University Staff',
  student: 'Student',
};

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
  render(data.announcements);
}

function render(list) {
  $('noticeCount').textContent = list.length;

  if (!list.length) {
    $('noticeList').innerHTML = `
      <div class="anns__empty">
        <strong>No announcements yet</strong>
        When your lecturer or TA posts something, it will show up here.
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
  } catch (err) {
    $('noticeList').innerHTML =
      `<div class="anns__empty"><strong>Could not load announcements</strong>${esc(err.message)}</div>`;
  }
})();
