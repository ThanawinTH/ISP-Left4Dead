/* ==========================================================================
   Members page (US-4)
   Shows everyone in the classroom. If you own the classroom, each person's
   role is a dropdown that saves as soon as you pick, and the remove button
   takes them out of the class. The owner can also reset the join code.
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
  showClassHeader(classroom);
  // Only the teaching team is sent the code; for a student the banner goes.
  document.querySelector('.joincode').hidden = !classroom.join_code;
  document.getElementById('joinCode').textContent = classroom.join_code || '—';
}

async function loadMembers() {
  const data = await API.get(`/classrooms/${classroomId}/members`);
  members = data.members;
  isOwner = data.isOwner;
  document.getElementById('resetCode').hidden = !isOwner;   // TAs and staff see the code, only the lecturer resets it
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

const REMOVE_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="9" cy="8" r="3.4" stroke="currentColor" stroke-width="1.9"/>
  <path d="M3 19a6 6 0 0 1 12 0M16 11h5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;

function rowHTML(member) {
  // The owner keeps the lecturer role, so that row has no controls.
  const canChange = isOwner && member.role !== 'lecturer';

  const role = canChange
    ? `<select class="select select--sm role-select role-select--${esc(member.role)}" data-role
               aria-label="Role for ${esc(member.name)}">
         ${ROLES.map(r => `<option value="${r.value}"${r.value === member.role ? ' selected' : ''}>${r.label}</option>`).join('')}
       </select>`
    : `<span class="role role--${esc(member.role)}">${ROLE_LABEL[member.role]}</span>`;

  return `
    <div class="table__row" data-user="${member.id}">
      <div class="table__cell--name">
        <span class="avatar avatar--sm avatar--${esc(member.role)}">${esc(initials(member.name))}</span>
        <span class="table__name">${esc(member.name)}</span>
      </div>
      <div class="table__mail">${esc(member.email)}</div>
      <div class="table__role">${role}</div>
      <div class="table__right">
        ${canChange ? `<button class="iconbtn iconbtn--danger" data-remove type="button"
            title="Remove from class" aria-label="Remove ${esc(member.name)} from the class">${REMOVE_ICON}</button>` : ''}
      </div>
    </div>`;
}

/** Saves a new role as soon as it is picked. Making a TA a student clears
    their assignments and deletes their announcements, so that one asks first. */
async function changeRole(select, member) {
  const next = select.value;
  if (member.role === 'ta' && next === 'student'
      && !confirm(`Make ${member.name} a student?\nThey come off their assignments and their announcements are deleted.`)) {
    select.value = member.role;
    return;
  }
  select.disabled = true;
  try {
    const res = await API.patch(`/classrooms/${classroomId}/members/${member.id}`, { role: next });
    member.role = next;                                 // keep our copy in step

    // Say what was cleared on the way out of the TA role: the assignments
    // they were on, and (when made a student) the announcements they posted.
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const cleared = [];
    if (res.unassigned) cleared.push('removed from ' + plural(res.unassigned, 'assignment'));
    if (res.deletedAnnouncements) cleared.push(plural(res.deletedAnnouncements, 'announcement') + ' deleted');
    KU.toast(`${member.name} is now ${ROLE_LABEL[next]}` + (cleared.length ? ' — ' + cleared.join(', ') : ''));
  } catch (err) {
    KU.toast(err.message);
  }
  render();                                             // redraw the whole table
}

/** Hooks up the role dropdowns and remove buttons after every redraw. */
function wireRows() {
  document.querySelectorAll('.table__row[data-user]').forEach(row => {
    const member = members.find(m => String(m.id) === row.dataset.user);
    row.querySelector('[data-role]')?.addEventListener('change', (e) => changeRole(e.target, member));
    row.querySelector('[data-remove]')?.addEventListener('click', () => removeMember(member));
  });
}

/* ---------- remove a member (lecturer only) ---------- */

async function removeMember(member) {
  const extra = member.role === 'student' ? ''
    : '\nThey come off their assignments and their announcements are deleted.';
  if (!confirm(`Remove ${member.name} from this class?${extra}\n\nThey can join again with the join code unless you reset it.`)) return;
  try {
    const res = await API.del(`/classrooms/${classroomId}/members/${member.id}`);
    members = members.filter(m => m.id !== member.id);
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    KU.toast(`${member.name} removed`
      + (res.deletedAnnouncements ? ` — ${plural(res.deletedAnnouncements, 'announcement')} deleted` : ''));
    render();
  } catch (err) {
    KU.toast(err.message);
  }
}

/* ---------- reset code ---------- */

/* SRS-2: the lecturer issues a new code. The old one stops working straight
   away; everyone already in the class stays in. */
document.getElementById('resetCode').addEventListener('click', async (e) => {
  if (!confirm('Make a new join code?\nThe current code will stop working. Everyone already in the class stays.')) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const { join_code } = await API.post(`/classrooms/${classroomId}/join-code`);
    document.getElementById('joinCode').textContent = join_code;
    KU.toast('New join code: ' + join_code);
  } catch (err) {
    KU.toast(err.message);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- start ---------- */

(async () => {
  if (!classroomId) {
    document.getElementById('memberCount').textContent = 'No classroom selected';
    return;
  }
  // the class menu on this page has to point back at the right classroom
  document.getElementById('assignmentLink').href = 'class-schedule.html?id=' + classroomId;
  document.getElementById('announcementsLink').href = 'announcements.html?id=' + classroomId;

  try {
    await loadJoinCode();
    await loadMembers();
  } catch (err) {
    document.getElementById('memberTable').innerHTML =
      `<div class="empty"><strong>Could not load members</strong>${esc(err.message)}</div>`;
    document.getElementById('memberCount').textContent = 'Members';
  }
})();
