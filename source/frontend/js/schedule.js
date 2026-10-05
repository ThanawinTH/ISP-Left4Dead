/* ==========================================================================
   Class Assignment page (US-5, read side)
   Loads the classroom's assignments, groups them by the week they are due, and
   shows whichever one you click in the panel on the right.
   ========================================================================== */

const classroomId = new URLSearchParams(location.search).get('id');

const state = {
  assignments: [],
  selected: null,
  isOwner: false,     // the lecturer - the only one who can create or edit
  isStaff: false,     // lecturer, TA and University staff - they see drafts
  role: 'student',
  search: '',
  atRisk: [],         // US-8: the student's at-risk rows, from ?atRisk=1
  riskOnly: false,    // the "At risk only" toggle
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- dates ---------- */

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const parseDue = (s) => new Date(String(s).replace(' ', 'T'));

/** "Oct 11, 23:59" */
function dueText(s) {
  const d = parseDue(s);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ` +
         `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** True if the date lands on today. Those get their own group at the top. */
function isToday(value) {
  const d = parseDue(value);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
}

/** Monday of the week a date falls in. Used to group the list. */
function weekStart(s) {
  const d = parseDue(s);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return monday;
}

/** The heading above each group. */
function groupLabel(key) {
  if (key === 'today') {
    const now = new Date();
    return `TODAY - ${MONTHS[now.getMonth()]} ${now.getDate()}`;
  }
  return weekLabel(new Date(key));
}

/** "THIS WEEK - Oct 9-15" or "Oct 16-22" for later weeks. */
function weekLabel(monday) {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const thisMonday = weekStart(new Date().toISOString());
  const weeksAway = Math.round((monday - thisMonday) / (7 * 24 * 60 * 60 * 1000));

  const prefix = weeksAway === 0 ? 'THIS WEEK - '
               : weeksAway === 1 ? 'NEXT WEEK - '
               : '';
  const range = `${MONTHS[monday.getMonth()]} ${monday.getDate()}-${sunday.getDate()}`;
  return prefix + range;
}

/* ---------- badges ----------
   Staff care whether an assignment is published yet. Students already only see
   published ones, so for them the badge shows how urgent it is. */

function badge(a) {
  if (state.isStaff) {
    return a.visibility === 'class'
      ? { key: 'done', label: 'Posted' }
      : { key: 'notstarted', label: 'Not Posted' };
  }

  // US-8: the server decides the risk (SRS-12), so every page agrees on it.
  return RISK_BADGE[a.risk] || RISK_BADGE.ok;
}

const RISK_BADGE = {
  duesoon: { key: 'duesoon',    label: 'Due Soon' },
  closed:  { key: 'notstarted', label: 'Closed' },
  ok:      { key: 'inprogress', label: 'Assigned' },
};

const isAtRisk = (a) => a.risk === 'duesoon';
const isClosed = (a) => a.risk === 'closed';

/** "Due in 5h", "Due in 2d" - how close, for the at-risk box. */
function riskWhen(a) {
  const hours = Math.max(0, (parseDue(a.due_at) - new Date()) / 36e5);
  return hours >= 24 ? `Due in ${Math.round(hours / 24)}d` : `Due in ${Math.max(1, Math.round(hours))}h`;
}

/* ---------- US-7 dashboard columns (SRS-13) ----------
   Staff see who set each assignment, which TAs are on it and where the work
   is up to. Students do not - those are staff details. */

const STATUS_LABEL = { notstarted: 'Not Started', inprogress: 'In Progress', done: 'Done' };

function staffColumns(a) {
  const tas = (a.staff || []).map(s => s.name);
  return `
        <span class="col" title="Created by">
          <span class="col__k">Owner</span> ${esc(a.created_by_name)}
        </span>
        <span class="col ${tas.length ? '' : 'col--none'}" title="${esc(tas.join(', '))}">
          <span class="col__k">TAs</span> ${tas.length ? esc(tas.join(', ')) : 'None'}
        </span>
        <span class="col">
          <span class="col__k">Status</span>
          <span class="status status--${esc(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</span>
        </span>`;
}

/** Overdue is worth flagging on the week header, whoever is looking. */

/* ---------- loading ---------- */

async function loadClassroom() {
  const { classroom } = await API.get('/classrooms/' + classroomId);
  $('className').textContent =
    (classroom.subject_code ? classroom.subject_code + ' ' : '') + classroom.name;
  $('classSem').textContent = 'Semester ' + classroom.semester;
  $('joinCode').textContent = classroom.join_code || '—';
}

async function loadAssignments() {
  const data = await API.get(`/classrooms/${classroomId}/assignments`);
  state.assignments = data.assignments;
  state.isOwner = data.isOwner;
  state.isStaff = data.isStaff;
  state.role = data.role;

  // Only the lecturer creates an assignment.
  const button = $('newAssignment');
  button.hidden = !state.isOwner;
  button.href = 'create-assignment.html?id=' + classroomId;

  // US-8 is for students: the at-risk list comes from the server's own filter
  // (SRS-13), so the box and the toggle show exactly what ?atRisk=1 returns.
  $('riskToggle').hidden = state.isStaff;
  if (!state.isStaff) {
    const risky = await API.get(`/classrooms/${classroomId}/assignments?atRisk=1`);
    state.atRisk = risky.assignments;
    $('riskCount').textContent = state.atRisk.length;
    $('riskCount').hidden = state.atRisk.length === 0;
  }
}

/* ---------- filtering ---------- */

function visible() {
  const term = state.search.trim().toLowerCase();
  const source = state.riskOnly ? state.atRisk : state.assignments;
  return source.filter(a => !term || a.title.toLowerCase().includes(term));
}

/* ---------- the list ---------- */

function renderList() {
  renderRiskBox();
  const rows = visible();
  const host = $('weeks');
  const empty = $('emptyState');
  empty.hidden = rows.length > 0;

  if (!rows.length) {
    host.innerHTML = '';

    // Say why the list is empty - nothing here at all, or nothing matching.
    const filtering = state.search.trim() !== '';
    empty.innerHTML = state.riskOnly && !filtering
      ? `<strong>You're on track</strong>Nothing is due in the next 3 days.`
      : filtering
        ? `<strong>No assignments match</strong>Try clearing the search.`
        : `<strong>No assignments yet</strong>Nothing has been added to this classroom.`;
    return;
  }

  // Anything due today goes in its own group at the top; everything else is
  // grouped by the Monday of its week, still in due-date order.
  const groups = new Map();
  rows.forEach(a => {
    const key = isToday(a.due_at) ? 'today' : weekStart(a.due_at).getTime();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  });

  const ordered = [...groups.entries()]
    .sort((x, y) => (x[0] === 'today' ? -1 : y[0] === 'today' ? 1 : x[0] - y[0]));

  host.innerHTML = ordered.map(([key, items]) => {
    // Due soon is a student's problem - staff see Posted / Not Posted instead.
    const soon = state.isStaff ? 0 : items.filter(isAtRisk).length;
    return `
      <section class="week">
        <div class="week__head">
          <span class="week__title">${esc(groupLabel(key))}</span>
          <span class="week__count">${items.length} assignment${items.length === 1 ? '' : 's'}</span>
          ${soon ? `<span class="week__flag week__flag--soon"><b>${soon} due soon</b></span>` : ''}
        </div>
        ${items.map(rowHTML).join('')}
      </section>`;
  }).join('');

  host.querySelectorAll('.assignment').forEach(el =>
    el.addEventListener('click', () => {
      state.selected = Number(el.dataset.id);
      renderList();
      renderPanel();
    }));
}

/* ---------- US-8: what needs attention (students) ----------
   A short box above the schedule with the at-risk assignments, most urgent
   first. Hidden when there are none, and while "At risk only" is on - the list
   below already is that. */

function renderRiskBox() {
  const box = $('riskBox');
  const rows = state.atRisk;
  if (state.isStaff || state.riskOnly || !rows.length) { box.hidden = true; return; }

  box.hidden = false;
  box.innerHTML = `
    <div class="risk__head">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 4 2.8 19.5h18.4L12 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M12 10v4.2M12 17.2v.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
      <span>${rows.length} assignment${rows.length === 1 ? ' is' : 's are'} due soon</span>
      <button class="linkbtn risk__all" id="riskShowAll">Show only these</button>
    </div>
    ${rows.map(a => `
      <button class="risk__row" data-id="${a.id}">
        <span class="risk__main">
          <span class="risk__title">${esc(a.title)}</span>
          <span class="risk__due">Due ${esc(dueText(a.due_at))}</span>
        </span>
        <span class="badge badge--${a.risk}">${riskWhen(a)}</span>
      </button>`).join('')}`;

  box.querySelectorAll('.risk__row').forEach(el =>
    el.addEventListener('click', () => {
      state.selected = Number(el.dataset.id);
      renderList();
      renderPanel();
    }));
  $('riskShowAll').addEventListener('click', () => setRiskOnly(true));
}

function setRiskOnly(on) {
  state.riskOnly = on;
  $('riskToggle').querySelectorAll('.seg__btn').forEach(b =>
    b.classList.toggle('is-on', (b.dataset.risk === 'only') === on));
  renderList();
}

function rowHTML(a) {
  const b = badge(a);

  // A TA needs to spot their own work in a long list, so the rows the lecturer
  // gave them carry a mark. The lecturer sees how many TAs are on each row.
  const mark = (!state.isOwner && a.can_grade)
    ? `<span class="mine" title="The lecturer gave you this">
         <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
           <circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="2"/>
           <path d="M5 19a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
         </svg>Yours
       </span>`
    : (state.isOwner && a.staff_names)
      ? `<span class="mine mine--count" title="TAs: ${esc(a.staff_names)}">
           <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
             <circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="2"/>
             <path d="M5 19a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
           </svg>${a.staff_names.split(', ').length}
         </span>`
      : '';

  return `
  <button class="assignment ${a.id === state.selected ? 'is-selected' : ''} ${!state.isStaff && (isAtRisk(a) || isClosed(a)) ? 'assignment--' + a.risk : ''}" data-id="${a.id}">
    <span class="assignment__main">
      <span class="assignment__title">${esc(a.title)}</span>
      <span class="assignment__meta">
        <span><span class="sq"></span> Due: ${esc(dueText(a.due_at))}</span>
        ${state.isStaff ? staffColumns(a) : ''}
      </span>
    </span>
    <span class="assignment__pts">${a.points} pts</span>
    <span class="assignment__end">
      ${mark}
      <span class="badge badge--${b.key}">${b.label}</span>
      <span class="icon-btn">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </span>
  </button>`;
}

/* ---------- the details panel ---------- */

function renderPanel() {
  const a = state.assignments.find(x => x.id === state.selected);
  const panel = $('panel');

  if (!a) {
    panel.innerHTML = `<div class="empty"><strong>No assignment selected</strong>
      Choose an assignment from the list.</div>`;
    return;
  }

  const b = badge(a);

  panel.innerHTML = `
    <div class="panel__head">
      <div>
        <div class="panel__title">Assignment Details</div>
        <div class="panel__sub">Selected assignment</div>
      </div>
      ${state.isOwner
        ? `<a class="linkbtn" href="create-assignment.html?id=${classroomId}&edit=${a.id}">Edit</a>`
        : ''}
    </div>

    <div class="panel__name">${esc(a.title)}</div>

    <div class="panel__tags">
      <span class="panel__by">Assigned by ${esc(a.created_by_name)}</span>
    </div>

    <div class="panel__due"><span class="sq"></span> Due: ${esc(dueText(a.due_at))}</div>
    <div class="panel__pts">${a.points} pts</div>
    <div class="panel__badge"><span class="badge badge--${b.key}">${b.label}</span></div>
    ${a.staff_names ? `<div class="panel__staff">TAs: ${esc(a.staff_names)}</div>` : ''}
    ${state.isStaff ? `<div class="panel__staff">Status: <span class="status status--${esc(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</span></div>` : ''}
    ${state.isOwner ? myTask(a) : ''}

    <hr>
    <div class="panel__label">Description</div>
    <p class="panel__desc">${esc(a.description || 'No description.')}</p>
    ${state.isStaff ? staffActions(a) : studentSubmission(a)}`;

  wireSoonButtons();
}

/**
 * What a TA sees on an assignment the lecturer gave them: their own deadline,
 * which is usually earlier than the students', and the lecturer's note.
 */
function myTask(a) {
  if (!a.staff_due_at && !a.staff_note) return '';

  return `
    <div class="mytask">
      <div class="mytask__label">Your task</div>
      ${a.staff_due_at
        ? `<div class="mytask__due"><span class="sq"></span> Finish by ${esc(dueText(a.staff_due_at))}</div>`
        : ''}
      ${a.staff_note ? `<p class="mytask__note">${esc(a.staff_note)}</p>` : ''}
    </div>`;
}

/**
 * The submission box a student sees. Uploading is not built yet - it needs the
 * submissions table and the late check (SRS-21 to SRS-24) - so the button says
 * so when you click it.
 */
function studentSubmission(a) {
  // Past the due date the assignment is closed - no more uploads (US-8).
  if (isClosed(a)) {
    return `
    <hr>
    <div class="panel__label">Submission</div>
    <div class="closed-note">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="currentColor" stroke-width="2"/>
        <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span><b>This assignment is closed</b>The due date was ${esc(dueText(a.due_at))}.</span>
    </div>`;
  }
  return `
    <hr>
    <div class="panel__label">Submission</div>
    <div class="upload">
      <div class="upload__row">
        <span class="upload__title">Upload file</span>
        <span class="upload__note">PDF or link</span>
      </div>
      <button class="btn btn--ghost btn--block" data-soon="Choosing a file">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 16V5m0 0L8 9m4-4 4 4M5 19h14" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>Upload File
      </button>
      <div class="upload__file">No file chosen yet</div>
    </div>
    <button class="btn btn--primary btn--block" data-soon="Submitting your work">
      Submit Assignment
    </button>`;
}

/**
 * What each role gets under an assignment.
 *   Lecturer         - post, unpost, delete, check submissions, grade
 *   TA               - grade, but only on the assignments they were added to
 *   University staff - nothing, they are here to look
 *   Student          - nothing
 * None of these are wired up yet, so each one says so when you click it.
 */
function staffActions(a) {
  const posted = a.visibility === 'class';
  const grade = a.can_grade
    ? `<button class="btn btn--primary btn--block" data-soon="Grading">Grade Submissions</button>`
    : '';

  if (!state.isOwner) {
    // TAs and University staff cannot change an assignment. A TA added to this
    // one gets their task box, the submitted list and the grade button, since
    // they cannot grade what they cannot see. Everyone else gets nothing.
    if (!a.can_grade) return '';

    return `
      <hr>
      ${myTask(a)}
      ${posted
        ? `<button class="btn btn--primary btn--block" data-soon="Check the submitted status">
             Check The Submitted Status
           </button>`
        : ''}
      ${grade}`;
  }

  // A draft can be posted. Once it is posted it stays posted - there is no
  // unposting something students have already seen.
  return `
    <hr>
    <div class="panel__actions">
      ${posted ? '' : '<button class="btn btn--primary" data-soon="Post Assignment">Post Assignment</button>'}
      <button class="btn btn--danger" id="btnDelete" data-id="${a.id}">Delete</button>
    </div>
    ${posted
      ? `<button class="btn btn--primary btn--block" data-soon="Check the submitted status">
           Check The Submitted Status
         </button>`
      : ''}
    ${grade}`;
}

/** Anything marked data-soon is drawn but not built yet. */
function wireSoonButtons() {
  document.querySelectorAll('#panel [data-soon]').forEach(el =>
    el.addEventListener('click', () => KU.toast(el.dataset.soon + ' — not built yet')));
  wireDelete();
}

/**
 * Lecturer only - the button is never drawn for anyone else, and the server
 * refuses everyone else with 403 anyway (US-9, SRS-14). Asks first: a deleted
 * assignment and its TA list cannot be brought back.
 */
function wireDelete() {
  const btn = document.getElementById('btnDelete');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const id = Number(btn.dataset.id);
    const a = state.assignments.find(x => x.id === id);
    if (!a || !confirm(`Delete "${a.title}"? This can't be undone.`)) return;

    btn.disabled = true;
    try {
      await API.del(`/classrooms/${classroomId}/assignments/${id}`);
      state.assignments = state.assignments.filter(x => x.id !== id);
      state.selected = null;
      renderList();
      renderPanel();
      KU.toast('Assignment deleted');
    } catch (err) {
      btn.disabled = false;
      KU.toast(err.message);
    }
  });
}

/* ---------- controls ---------- */

$('riskToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg__btn');
  if (btn) setRiskOnly(btn.dataset.risk === 'only');
});

$('searchBox').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderList();
});

$('copyCode').addEventListener('click', async () => {
  const ok = await KU.copy($('joinCode').textContent.trim());
  KU.toast(ok ? 'Join code copied' : 'Copy failed — select the code manually');
});

/* ---------- start ---------- */

(async () => {
  if (!classroomId) {
    $('className').textContent = 'No classroom selected';
    return;
  }
  $('membersLink').href = 'members.html?id=' + classroomId;

  try {
    await loadClassroom();
    await loadAssignments();
    renderList();
    renderPanel();
  } catch (err) {
    KU.toast(err.message);
  }
})();
