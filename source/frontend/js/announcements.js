/* ==========================================================================
   Class Announcements (US-10, US-11)
   Everyone in the classroom reads the same list, newest first (US-11).
   A lecturer, TA or University staff member also gets a "New Announcement"
   button that opens the post form on its own page (US-10). The server decides who can post;
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
let all = [];          // every announcement, newest first, as the server sent them
let search = '';

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
  showClassHeader(classroom);
}

async function loadAnnouncements() {
  const data = await API.get(`/classrooms/${classroomId}/announcements`);
  canPost = data.canPost;
  all = data.announcements;
  render();
}

/** Words typed in the search: title, message or author must contain them. */
function matches(a, term) {
  return !term || [a.title, a.body, a.author_name].some(s => String(s || '').toLowerCase().includes(term));
}

function render() {
  const term = search.trim().toLowerCase();
  const list = all.filter(a => matches(a, term));
  $('noticeCount').textContent = term ? `${list.length} of ${all.length}` : all.length;

  if (term && !list.length) {
    $('noticeList').innerHTML = `
      <div class="anns__empty"><strong>No announcements match "${esc(search.trim())}"</strong>
        Try another word, or clear the search.</div>`;
    return;
  }
  if (!list.length) {
    $('noticeList').innerHTML = `
      <div class="anns__empty">
        <strong>No announcements yet</strong>
        ${canPost ? 'Use <b>New Announcement</b> to post the first one.'
                  : 'When your lecturer or TA posts something, it will show up here.'}
      </div>`;
    return;
  }
  // The server sends them newest first; searching only hides the others, so
  // the order never changes. "Latest" stays on the newest of all.
  $('noticeList').innerHTML = list.map(a => cardHTML(a, a === all[0])).join('');
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
      ${filesHTML(a)}
    </article>`;
}

/* Files attached to an announcement. PDFs and pictures open in a new tab,
   other files download. Whoever posted it (or the lecturer) can remove one. */
function filesHTML(a) {
  if (!(a.attachments || []).length) return '';
  return `
    <div class="ann__files">
      ${a.attachments.map(f => `
        <div class="attach__row">${f.kind === 'link' ? Files.ICON.link : Files.ICON.file}
          ${f.kind === 'link'
            ? `<a class="attach__name" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.url)}</a>
               <span class="attach__size">${esc(f.file_name)}</span>`
            : `<a class="attach__name" ${Files.link(`/classrooms/${classroomId}/attachments/${f.id}`, f.file_name)}>${esc(f.file_name)}</a>
               <span class="attach__size">${Files.size(f.file_size)}</span>`}
          ${a.can_manage ? `<button class="attach__x" type="button" data-ann="${a.id}" data-file="${f.id}"
             aria-label="Remove ${esc(f.file_name)}">×</button>` : ''}
        </div>`).join('')}
    </div>`;
}

$('noticeList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-file]');
  if (!btn || !confirm('Remove this file from the announcement?')) return;
  try {
    await API.del(`/classrooms/${classroomId}/announcements/${btn.dataset.ann}/attachments/${btn.dataset.file}`);
    KU.toast('File removed');
    await loadAnnouncements();
  } catch (err) {
    KU.toast(err.message);
  }
});

/* ---------- US-10: New Announcement ---------- */

/* The button opens the post form on its own page, like New Assignment. */
function setUpPosting() {
  if (!canPost) return;                      // students only read
  $('newBtn').href = 'create-announcement.html?id=' + classroomId;
  $('newBtn').hidden = false;
}

$('searchBox').addEventListener('input', (e) => {
  search = e.target.value;
  render();
});

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
