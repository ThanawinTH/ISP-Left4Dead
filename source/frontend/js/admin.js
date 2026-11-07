/* ==========================================================================
   Admin panel - the lecturer, TAs and University staff only.
   Two tabs: Staff chat (US-12, US-13, run by chat.js) and Tasks (US-18).
   The server refuses students on both; the page just says so.

   Tasks: a board with Open, In progress and Done. Create one with New task,
   give it to a member of staff (or nobody yet), move it along with the
   buttons on its card, and close it by moving it to Done.
   ========================================================================== */

// Wrapped so its names stay apart from chat.js, which this page also loads.
(() => {

const classroomId = new URLSearchParams(location.search).get('id');
const $ = (id) => document.getElementById(id);
const tasksApi = `/classrooms/${classroomId}/tasks`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => String(name || '?').slice(0, 2).toUpperCase();

const COLUMNS = [
  { key: 'open', label: 'Open' },
  { key: 'inprogress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];
const ROLE_LABEL = { lecturer: 'Lecturer', ta: 'TA', staff: 'University Staff' };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const state = { tasks: [], view: 'all', search: '' };

/* ---------- tabs ---------- */

function showTab(tab) {
  $('tab-chat').hidden = tab !== 'chat';
  $('tab-tasks').hidden = tab !== 'tasks';
  $('adminTabs').querySelectorAll('.seg__btn').forEach(b => b.classList.toggle('is-on', b.dataset.tab === tab));
  const url = new URL(location.href);
  url.searchParams.set('tab', tab);
  history.replaceState(null, '', url);
  if (tab === 'chat' && window.chatCatchUp) window.chatCatchUp();
  if (tab === 'tasks') loadTasks();
}

$('adminTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) showTab(b.dataset.tab);
});

/* ---------- tasks ---------- */

/** "Due Nov 5", red when it has passed, amber within two days. Done tasks show the day they were done. */
function dueChip(t) {
  if (t.status === 'done') {
    if (!t.closed_at) return '<span class="tchip tchip--done">Done</span>';
    const c = new Date(t.closed_at);
    return `<span class="tchip tchip--done">Done ${MONTHS[c.getMonth()]} ${c.getDate()}</span>`;
  }
  if (!t.due_date) return '';
  const [y, m, d] = t.due_date.split('-').map(Number);
  const due = new Date(y, m - 1, d, 23, 59);
  const days = (due - new Date()) / 864e5;
  const cls = days < 0 ? 'late' : days < 2 ? 'soon' : 'ok';
  return `<span class="tchip tchip--${cls}">${days < 0 ? 'Overdue' : 'Due'} ${MONTHS[m - 1]} ${d}</span>`;
}

function cardHTML(t) {
  const who = t.assignee_id
    ? `<span class="tchip tchip--who" title="${esc(ROLE_LABEL[t.assignee_role] || '')}">
         <span class="avatar avatar--xs">${esc(initials(t.assignee_name))}</span>${esc(t.assignee_name)}</span>`
    : '<span class="tchip tchip--none">Unassigned</span>';
  return `
    <article class="task task--${t.status}" data-id="${t.id}">
      <div class="task__top">
        <h3 class="task__title">${esc(t.title)}</h3>
        <a class="task__edit" href="create-task.html?id=${classroomId}&edit=${t.id}" title="Edit task">Edit</a>
      </div>
      ${t.notes ? `<p class="task__notes">${esc(t.notes)}</p>` : ''}
      <div class="task__chips">${who}${dueChip(t)}</div>
      <div class="seg seg--sm task__status" role="group" aria-label="Status">
        ${COLUMNS.map(c => `<button class="seg__btn ${t.status === c.key ? 'is-on' : ''}" type="button"
            data-status="${c.key}">${c.label}</button>`).join('')}
      </div>
    </article>`;
}

function visibleTasks() {
  const term = state.search.trim().toLowerCase();
  return state.tasks.filter(t =>
    (state.view === 'all' || t.mine)
    && (!term || [t.title, t.notes, t.assignee_name].some(x => String(x || '').toLowerCase().includes(term))));
}

function renderBoard() {
  const list = visibleTasks();
  $('taskCount').textContent = state.tasks.filter(t => t.status !== 'done').length;
  $('mineCount').textContent = state.tasks.filter(t => t.mine && t.status !== 'done').length;
  $('board').innerHTML = COLUMNS.map(c => {
    const items = list.filter(t => t.status === c.key);
    return `
      <section class="board__col board__col--${c.key}">
        <div class="board__head"><span class="board__dot"></span>${c.label}<span class="board__n">${items.length}</span></div>
        ${items.length ? items.map(cardHTML).join('')
          : `<div class="board__empty">${c.key === 'done' ? 'Nothing done yet' : 'Nothing here'}</div>`}
      </section>`;
  }).join('');
}

async function loadTasks() {
  try {
    const data = await API.get(tasksApi);
    state.tasks = data.tasks;
    renderBoard();
  } catch (err) {
    $('board').innerHTML = `<div class="empty"><strong>Could not load tasks</strong>${esc(err.message)}</div>`;
  }
}

/* Moving a task: the buttons on its card. Done is how a task is closed. */
$('board').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-status]');
  if (!btn) return;
  const card = btn.closest('.task');
  const t = state.tasks.find(x => x.id === Number(card.dataset.id));
  if (!t || t.status === btn.dataset.status) return;
  try {
    const { task } = await API.patch(`${tasksApi}/${t.id}`, { status: btn.dataset.status });
    Object.assign(t, task);
    renderBoard();
    KU.toast(task.status === 'done' ? `Done: ${task.title}` : `Moved to ${COLUMNS.find(c => c.key === task.status).label}`);
  } catch (err) {
    KU.toast(err.message);
  }
});

$('taskView').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (!b) return;
  state.view = b.dataset.view;
  $('taskView').querySelectorAll('.seg__btn').forEach(x => x.classList.toggle('is-on', x === b));
  renderBoard();
});
$('taskSearch').addEventListener('input', (e) => { state.search = e.target.value; renderBoard(); });

/* ---------- start ---------- */

(async () => {
  if (!classroomId) return;
  $('newTask').href = 'create-task.html?id=' + classroomId;
  try {
    const { classroom } = await API.get('/classrooms/' + classroomId);
    if (!['lecturer', 'ta', 'staff'].includes(classroom.role)) {
      $('admin').innerHTML = `<div class="chat__empty"><strong>Staff only</strong>
        The Admin panel is only for the lecturer, TAs and University staff of this class.</div>`;
      return;
    }
    // Counts on the Tasks tab straight away, whichever tab opens.
    await loadTasks();
    showTab(new URLSearchParams(location.search).get('tab') === 'tasks' ? 'tasks' : 'chat');
  } catch (err) {
    KU.toast(err.message);
  }
})();

})();
