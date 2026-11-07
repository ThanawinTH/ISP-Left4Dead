/* ==========================================================================
   New task / Edit task (US-18)
   What needs doing is required; notes, who it is for, status and a due date
   are optional. Only the lecturer, TAs and University staff can be given a
   task, and the server checks that again. Who created it, and when, is
   recorded by the server, so nobody can create one as someone else.
   ========================================================================== */

const params = new URLSearchParams(location.search);
const classroomId = params.get('id');
const editingId = params.get('edit');
const $ = (id) => document.getElementById(id);
const tasksApi = `/classrooms/${classroomId}/tasks`;
const backToBoard = `admin.html?id=${classroomId}&tab=tasks`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE_LABEL = { lecturer: 'Lecturer', ta: 'TA', staff: 'University Staff' };

let status = 'open';
let saving = false;

/** One row per member of staff, plus "Nobody yet" - picked like the TAs on an assignment. */
function renderPeople(staff, current) {
  $('assignPicker').innerHTML = `
    <label class="picker__item">
      <input type="radio" name="assignee" value="" ${current ? '' : 'checked'}>
      <span class="picker__name">Nobody yet</span>
      <span class="picker__mail">Shows as Unassigned</span>
    </label>
    ${staff.map(s => `
    <label class="picker__item">
      <input type="radio" name="assignee" value="${s.id}" ${current === s.id ? 'checked' : ''}>
      <span class="picker__name">${esc(s.name)}</span>
      <span class="role role--${esc(s.role)} picker__role">${esc(ROLE_LABEL[s.role] || s.role)}</span>
    </label>`).join('')}`;
}

function setStatus(next) {
  status = next;
  $('statusPick').querySelectorAll('.seg__btn').forEach(b => b.classList.toggle('is-on', b.dataset.status === next));
}
$('statusPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-status]');
  if (b) setStatus(b.dataset.status);
});

$('title').addEventListener('input', () => {
  $('title').classList.remove('is-error');
  $('f-title').classList.remove('is-error');
});

$('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (saving) return;
  const title = $('title').value.trim();
  const ok = title !== '';
  $('f-title').classList.toggle('is-error', !ok);
  $('title').classList.toggle('is-error', !ok);
  if (!ok) return KU.toast('Say what needs doing');

  const body = {
    title,
    notes: $('notes').value.trim(),
    assignee_id: document.querySelector('#assignPicker input[name="assignee"]:checked')?.value || null,
    status,
    due_date: $('dueDate').value || null,
  };
  saving = true;
  $('saveTask').disabled = true;
  try {
    if (editingId) await API.patch(`${tasksApi}/${editingId}`, body);
    else await API.post(tasksApi, body);
    KU.toast(editingId ? 'Task saved' : 'Task created');
    setTimeout(() => location.href = backToBoard, 700);
  } catch (err) {
    KU.toast(err.message);
    saving = false;
    $('saveTask').disabled = false;
  }
});

$('deleteTask').addEventListener('click', async () => {
  if (!confirm('Delete this task?')) return;
  try {
    await API.del(`${tasksApi}/${editingId}`);
    KU.toast('Task deleted');
    setTimeout(() => location.href = backToBoard, 700);
  } catch (err) {
    KU.toast(err.message);
  }
});

/* ---------- start ---------- */

(async () => {
  if (!classroomId) return;
  $('cancelLink').href = backToBoard;
  $('announcementsLink').href = 'announcements.html?id=' + classroomId;
  $('assignmentLink').href = 'class-schedule.html?id=' + classroomId;
  $('membersLink').href = 'members.html?id=' + classroomId;
  try {
    const { classroom } = await API.get('/classrooms/' + classroomId);
    showClassHeader(classroom);
    if (!['lecturer', 'ta', 'staff'].includes(classroom.role)) {
      $('taskForm').innerHTML = `<div class="chat__empty"><strong>Staff only</strong>
        Tasks are only for the lecturer, TAs and University staff of this class.</div>`;
      return;
    }
    const { tasks, staff } = await API.get(tasksApi);
    const t = editingId ? tasks.find(x => String(x.id) === editingId) : null;
    if (editingId && !t) KU.toast('That task no longer exists');
    renderPeople(staff, t ? t.assignee_id : null);
    if (t) {
      $('formTitle').textContent = 'Edit task';
      $('saveTask').textContent = 'Save task';
      $('title').value = t.title;
      $('notes').value = t.notes || '';
      $('dueDate').value = t.due_date || '';
      setStatus(t.status);
      $('deleteTask').hidden = !t.can_delete;
    }
    $('title').focus();
  } catch (err) {
    KU.toast(err.message);
  }
})();
