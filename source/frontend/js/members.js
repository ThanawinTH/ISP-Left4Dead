/* ==========================================================================
   Members page (US-4)
   Shows everyone in the classroom. If you own the classroom, each row has an
   "Edit Role" link that turns the role badge into a dropdown.
   ========================================================================== */

const classroomId = new URLSearchParams(location.search).get('id');

/* What the owner is allowed to hand out. Lecturer is not in here - a classroom
   always keeps the person who created it. */
const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'ta', label: 'TA' },
  { value: 'staff', label: 'University Staff' },
];

const ROLE_LABEL = {
  lecturer: 'Lecturer',
  ta: 'TA',
  staff: 'University Staff',
  student: 'Student',
};

let members = [];
let isOwner = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Two letters for the little circle in front of the name. */
const initials = (name) => name.slice(0, 2).toUpperCase();

/* ---------- loading ---------- */

/** The join code belongs to the classroom, so it comes from the same endpoint. */
async function loadJoinCode() {
  const { classroom } = await API.get('/classrooms/' + classroomId);
  document.getElementById('joinCode').textContent = classroom.join_code || '—';
}

async function loadMembers() {
  const data = await API.get(`/classrooms/${classroomId}/members`);
  members = data.members;
  isOwner = data.isOwner;
  render();
}

/* ---------- drawing ---------- */

function render() {
  document.getElementById('memberCount').textContent =
    `${members.length} Registered Class Members`;
  document.getElementById('memberShowing').textContent =
    `Showing ${members.length} of ${members.length}`;

  document.getElementById('memberTable').innerHTML = `
    <div class="table__row table__row--head">
      <div>Name</div>
      <div>Email Address</div>
      <div>Role</div>
      <div class="table__right">Actions</div>
    </div>
    ${members.map(rowHTML).join('')}`;

  wireRows();
}

function rowHTML(member) {
  // The owner keeps the lecturer role, so that row has no Edit Role link.
  const canChange = isOwner && member.role !== 'lecturer';

  return `
    <div class="table__row" data-user="${member.id}">
      <div class="table__cell--name">
        <span class="avatar avatar--sm avatar--${esc(member.role)}">${esc(initials(member.name))}</span>
        <span class="table__name">${esc(member.name)}</span>
      </div>
      <div class="table__mail">${esc(member.email)}</div>
      <div class="table__role">
        <span class="role role--${esc(member.role)}">${ROLE_LABEL[member.role]}</span>
      </div>
      <div class="table__right">
        ${canChange ? '<button class="linkbtn" data-edit>Edit Role</button>' : ''}
      </div>
    </div>`;
}

/** Turns one row's badge into a dropdown and saves whatever is picked. */
function startEditing(row, member) {
  const cell = row.querySelector('.table__role');
  const action = row.querySelector('.table__right');

  cell.innerHTML = `
    <select class="select select--sm">
      ${ROLES.map(r => `<option value="${r.value}"${r.value === member.role ? ' selected' : ''}>${r.label}</option>`).join('')}
    </select>`;
  action.innerHTML = '<button class="linkbtn linkbtn--muted" data-cancel>Cancel</button>';

  const select = cell.querySelector('select');
  select.focus();

  select.addEventListener('change', async () => {
    select.disabled = true;
    try {
      await API.patch(`/classrooms/${classroomId}/members/${member.id}`, { role: select.value });
      member.role = select.value;                       // keep our copy in step
      KU.toast('Role updated to ' + ROLE_LABEL[select.value]);
    } catch (err) {
      KU.toast(err.message);
    }
    render();                                           // redraw the whole table
  });

  action.querySelector('[data-cancel]').addEventListener('click', render);
}

/** Hooks up the Edit Role links after every redraw. */
function wireRows() {
  document.querySelectorAll('.table__row[data-user]').forEach(row => {
    const member = members.find(m => String(m.id) === row.dataset.user);
    const edit = row.querySelector('[data-edit]');
    if (edit) edit.addEventListener('click', () => startEditing(row, member));
  });
}

/* ---------- reset code ---------- */

document.getElementById('resetCode').addEventListener('click', () => {
  // SRS-2 lets the lecturer issue a new code. The endpoint is not built yet.
  KU.toast('Reset Code — not built yet');
});

/* ---------- start ---------- */

(async () => {
  if (!classroomId) {
    document.getElementById('memberCount').textContent = 'No classroom selected';
    return;
  }
  try {
    await loadJoinCode();
    await loadMembers();
  } catch (err) {
    document.getElementById('memberTable').innerHTML =
      `<div class="empty"><strong>Could not load members</strong>${esc(err.message)}</div>`;
    document.getElementById('memberCount').textContent = 'Members';
  }
})();
