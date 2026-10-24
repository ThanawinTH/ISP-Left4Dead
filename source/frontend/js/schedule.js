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
  view: 'mine',       // a TA starts on their own tasks; 'all' shows the whole class
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

/* ---------- a TA's own work ----------
   A TA is the one role the lecturer hands work to, with their own check date
   (never before the students' due date) and a note. That date is the one we
   count down for them. */

const isTA = () => state.role === 'ta' && !state.isOwner;
const myTasks = () => state.assignments.filter(a => a.can_grade);
const taDue = (a) => a.staff_due_at || a.due_at;

function taUrgency(a) {
  if (a.status === 'done') return { cls: 'done', text: 'Done' };
  const hours = (parseDue(taDue(a)) - new Date()) / 36e5;
  const days = Math.round(Math.abs(hours) / 24);
  if (hours < 0)  return { cls: 'overdue', text: days >= 1 ? `Overdue ${days}d` : 'Overdue' };
  if (hours < 24) return { cls: 'duesoon', text: `Due in ${Math.max(1, Math.round(hours))}h` };
  if (hours < 72) return { cls: 'duesoon', text: `Due in ${days}d` };
  if (days < 14)  return { cls: 'ok', text: `In ${days} days` };
  return { cls: 'ok', text: days < 60 ? `In ${Math.round(days / 7)} weeks` : 'Later' };
}

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

  // A TA gets two tabs: their own tasks first, then the whole class.
  const tabs = $('taTabs');
  tabs.hidden = !isTA();
  if (isTA()) {
    $('countMine').textContent = myTasks().length;
    $('countAll').textContent = state.assignments.length;
    tabs.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('is-active', t.dataset.view === state.view));
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
  if (isTA() && state.view === 'mine') return renderMyTasks();
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

/* ---------- a TA's task list ----------
   One card per assignment the lecturer gave them, soonest check date first,
   with the lecturer's note right there - no clicking in to find out what to do. */

function renderMyTasks() {
  const term = state.search.trim().toLowerCase();
  const tasks = myTasks()
    .filter(a => !term || a.title.toLowerCase().includes(term))
    .sort((x, y) => parseDue(taDue(x)) - parseDue(taDue(y)));

  const host = $('weeks');
  const empty = $('emptyState');
  empty.hidden = tasks.length > 0;

  if (!tasks.length) {
    host.innerHTML = '';
    empty.innerHTML = term
      ? `<strong>No tasks match</strong>Try clearing the search.`
      : `<strong>Nothing assigned to you yet</strong>When the lecturer adds you to an assignment, it shows up here.`;
    return;
  }

  const open = tasks.filter(a => a.status !== 'done').length;
  host.innerHTML = `
    <div class="week__head">
      <span class="week__title">Your tasks</span>
      <span class="week__count">${open} to do · sorted by your check date</span>
    </div>
    ${tasks.map(taskCard).join('')}`;

  host.querySelectorAll('.assignment').forEach(el =>
    el.addEventListener('click', () => {
      state.selected = Number(el.dataset.id);
      renderList();
      renderPanel();
    }));
}

function taskCard(a) {
  const u = taUrgency(a);
  return `
  <button class="assignment task tone--${u.cls} ${a.id === state.selected ? 'is-selected' : ''}" data-id="${a.id}">
    <span class="task__top">
      <span class="assignment__title">${esc(a.title)}</span>
      <span class="when when--${u.cls}">${u.text}</span>
    </span>
    <span class="task__due">
      <b>Check by</b> ${esc(dueText(taDue(a)))}
      <span class="task__sep">·</span> Students due ${esc(dueText(a.due_at))}
    </span>
    ${a.staff_note
      ? `<span class="task__note">${esc(a.staff_note)}</span>`
      : `<span class="task__note task__note--none">No instructions from the lecturer</span>`}
    <span class="task__foot">
      <span>From ${esc(a.created_by_name)}</span>
      <span class="status status--${esc(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</span>
      ${a.visibility === 'class' ? '' : '<span class="status status--notstarted">Not posted to students</span>'}
    </span>
  </button>`;
}

/** The coloured left edge, one rule for every role.
    Student: due soon or closed (US-8). TA's own work: their check date.
    Other staff: posted or draft. */
function rowTone(a) {
  if (isTA() && a.can_grade) return taUrgency(a).cls;
  if (state.isStaff) return a.visibility === 'class' ? 'ok' : 'draft';
  return isAtRisk(a) ? 'duesoon' : isClosed(a) ? 'closed' : 'ok';
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
  <button class="assignment tone--${rowTone(a)} ${a.id === state.selected ? 'is-selected' : ''}" data-id="${a.id}">
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
    </span>
  </button>`;
}

/* ---------- the details panel ----------
   One layout for every role, top to bottom:
     header   - title, who set it, Edit for the lecturer
     chips    - posted and status (staff only)
     role box - the one thing this person does here, same frame for everyone
     facts    - dates, points, TAs
     description
   Only the role box changes between lecturer, TA, staff and student. */

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
    <div class="pd__head">
      <div>
        <div class="pd__eyebrow">Assignment</div>
        <div class="pd__title">${esc(a.title)}</div>
        <div class="pd__by">Set by ${esc(a.created_by_name)}</div>
      </div>
      ${state.isOwner
        ? `<a class="linkbtn" href="create-assignment.html?id=${classroomId}&edit=${a.id}">Edit</a>`
        : ''}
    </div>

    ${state.isStaff ? `
    <div class="pd__chips">
      <span class="badge badge--${b.key}">${b.label}</span>
      ${statusPill(a)}
    </div>` : ''}

    ${roleBox(a)}

    <dl class="facts">
      <dt>Students due</dt><dd>${esc(dueText(a.due_at))}</dd>
      <dt>Points</dt><dd>${a.points} pts</dd>
      ${state.isStaff ? `
        ${canSetStatus(a) ? '' : `<dt>TA check by</dt><dd>${a.staff_due_at ? esc(dueText(a.staff_due_at)) : '<span class="muted">Not set</span>'}</dd>`}
        <dt>TAs</dt><dd>${(a.staff || []).length ? esc(a.staff.map(s => s.name).join(', ')) : '<span class="muted">None</span>'}</dd>` : ''}
    </dl>

    <div class="pd__label">Description</div>
    <p class="pd__desc">${esc(a.description || 'No description.')}</p>`;

  wireSoonButtons();
  wireStatus(a);
}

const statusPill = (a) =>
  `<span class="status status--${esc(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</span>`;

/** Who may move the status: the lecturer, or a TA on this assignment. */
const canSetStatus = (a) => state.isOwner || (state.role === 'ta' && a.can_grade);

/** Three buttons, the current one pressed. Saves on click (wireStatus). */
function statusControl(a) {
  return `
    <div class="box__stack">
      <span class="box__k">Progress</span>
      <div class="prog" data-status-for="${a.id}">
        ${['notstarted', 'inprogress', 'done'].map(v => `
          <button class="prog__btn ${a.status === v ? 'is-on' : ''}" data-status="${v}">${STATUS_LABEL[v]}</button>`).join('')}
      </div>
    </div>`;
}

/** The note the lecturer left for the TAs, or a quiet placeholder. */
const noteHTML = (a) => a.staff_note
  ? `<div class="box__note">${esc(a.staff_note)}</div>`
  : `<div class="box__note box__note--none">No instructions for TAs.</div>`;

const LOCK_ICON = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="currentColor" stroke-width="2"/>
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" stroke-width="2"/>
  </svg>`;

/** The role box - same frame for everyone, different contents. */
function roleBox(a) {
  const posted = a.visibility === 'class';
  const soon = (label, cls = 'btn--ghost') =>
    `<button class="btn ${cls} btn--block" data-soon="${label}">${label}</button>`;

  // Lecturer: what the TAs were told, progress, and the actions (Delete: US-9).
  if (state.isOwner) {
    return `
      <div class="box">
        <div class="box__head"><span class="box__label">Lecturer controls</span></div>
        <div class="box__row"><span class="box__k">TAs check by</span>
          <b>${a.staff_due_at ? esc(dueText(a.staff_due_at)) : 'Not set'}</b></div>
        ${noteHTML(a)}
        ${statusControl(a)}
        <div class="box__actions">
          ${posted ? soon('Check The Submitted Status') : soon('Post Assignment', 'btn--primary')}
          ${posted ? soon('Grade Submissions', 'btn--primary') : ''}
          <button class="btn--text-danger" id="btnDelete" data-id="${a.id}">Delete assignment</button>
        </div>
      </div>`;
  }

  // TA on this assignment: their check date counting down, the note, progress.
  if (state.role === 'ta' && a.can_grade) {
    const u = taUrgency(a);
    return `
      <div class="box box--${u.cls}">
        <div class="box__head">
          <span class="box__label">Your task</span>
          <span class="when when--${u.cls}">${u.text}</span>
        </div>
        <div class="box__row"><span class="box__k">Check by</span><b>${esc(dueText(taDue(a)))}</b></div>
        ${noteHTML(a)}
        ${statusControl(a)}
        <div class="box__actions">
          ${posted
            ? soon('Check The Submitted Status') + soon('Grade Submissions', 'btn--primary')
            : '<div class="box__hint">Not posted to students yet, so there is nothing to check.</div>'}
        </div>
      </div>`;
  }

  // A TA not on it, or University staff: look only.
  if (state.isStaff) {
    return `
      <div class="box box--muted">
        <div class="box__head"><span class="box__label">View only</span></div>
        <div class="box__hint">${state.role === 'ta'
          ? "The lecturer hasn't assigned this one to you."
          : 'University staff can see assignments but not change them.'}</div>
      </div>`;
  }

  // Student, past the due date: closed, no more uploads (US-8).
  if (isClosed(a)) {
    return `
      <div class="box box--muted">
        <div class="box__head"><span class="box__label">Your submission</span>
          <span class="badge badge--notstarted">Closed</span></div>
        <div class="closed-note">${LOCK_ICON}
          <span><b>This assignment is closed</b>The due date was ${esc(dueText(a.due_at))}.</span>
        </div>
      </div>`;
  }

  // Student: upload and submit. Not built yet (SRS-21 to SRS-24).
  const s = badge(a);
  return `
    <div class="box ${isAtRisk(a) ? 'box--duesoon' : ''}">
      <div class="box__head">
        <span class="box__label">Your submission</span>
        <span class="badge badge--${s.key}">${isAtRisk(a) ? riskWhen(a) : s.label}</span>
      </div>
      <div class="upload">
        <div class="upload__row">
          <span class="upload__title">Upload file</span>
          <span class="upload__note">PDF or link</span>
        </div>
        <button class="btn btn--ghost btn--block" data-soon="Choosing a file">Upload File</button>
        <div class="upload__file">No file chosen yet</div>
      </div>
      <div class="box__actions">${soon('Submit Assignment', 'btn--primary')}</div>
    </div>`;
}

/** Status buttons save straight away, then redraw both sides. */
function wireStatus(a) {
  const prog = document.querySelector(`#panel [data-status-for="${a.id}"]`);
  if (!prog) return;
  prog.querySelectorAll('[data-status]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const status = btn.dataset.status;
      if (status === a.status) return;
      try {
        await API.patch(`/classrooms/${classroomId}/assignments/${a.id}/status`, { status });
        a.status = status;
        renderList();
        renderPanel();
        KU.toast('Status: ' + STATUS_LABEL[status]);
      } catch (err) {
        KU.toast(err.message);
      }
    }));
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

$('taTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  state.view = tab.dataset.view;
  $('taTabs').querySelectorAll('.tab').forEach(t => t.classList.toggle('is-active', t === tab));
  renderList();
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
  $('announcementsLink').href = 'announcements.html?id=' + classroomId;

  try {
    await loadClassroom();
    await loadAssignments();
    renderList();
    renderPanel();
  } catch (err) {
    KU.toast(err.message);
  }
})();
