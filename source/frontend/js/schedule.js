/* ==========================================================================
   Class Assignment page (US-5, read side)
   Loads the classroom's assignments, groups them by topic (like Google
   Classroom), and shows whichever one you click in the panel on the right.
   Every role gets the same rows; only the badge on the right and the second
   line change with what that person needs to know.
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
  full: false,        // the open assignment fills the page
  grading: false,     // US-15: the grading screen for the open assignment
  gradeStudent: null, // the student whose work is open there
  previewFile: null,  // the file shown in the preview
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

/* ---------- badges ----------
   Staff care whether an assignment is published yet. Students already only see
   published ones, so for them the badge shows how urgent it is. */

function badge(a) {
  if (state.isStaff) {
    return a.visibility === 'class'
      ? { key: 'done', label: 'Posted' }
      : { key: 'notstarted', label: 'Not Posted' };
  }

  if (a.my_score != null) return { key: 'done', label: 'Graded' };   // US-15
  // US-8: the server decides the risk (SRS-12), so every page agrees on it.
  return RISK_BADGE[a.risk] || RISK_BADGE.ok;
}

const RISK_BADGE = {
  submitted: { key: 'submitted', label: 'Submitted' },   // US-14
  overdue: { key: 'overdue',    label: 'Overdue' },      // past due, late work allowed
  duesoon: { key: 'duesoon',    label: 'Due Soon' },
  closed:  { key: 'notstarted', label: 'Closed' },
  ok:      { key: 'inprogress', label: 'Assigned' },
};

const isAtRisk = (a) => a.risk === 'duesoon' || a.risk === 'overdue';
const isClosed = (a) => a.risk === 'closed';

/** "Due in 5h", "Due in 2d" - how close, for the at-risk box. */
function riskWhen(a) {
  if (a.risk === 'overdue') return 'Overdue';
  const hours = Math.max(0, (parseDue(a.due_at) - new Date()) / 36e5);
  return hours >= 24 ? `Due in ${Math.round(hours / 24)}d` : `Due in ${Math.max(1, Math.round(hours))}h`;
}

/* ---------- US-7 (SRS-13): the staff line ----------
   Staff see, on the second line of each row, whether it is posted, which TAs
   are on it and where the work is up to. Who set it is in the panel.
   Students do not see these - they are staff details. */

/* Status is the teaching team's checking: has a TA started marking this yet?
   It is staff-only, so it always says "Checking" wherever it appears. */
const STATUS_LABEL = { notstarted: 'Not Started', inprogress: 'In Progress', done: 'Done' };
const checkingText = (a) => 'Checking: ' + (STATUS_LABEL[a.status] || a.status);

function staffColumns(a) {
  const tas = (a.staff || []).map(s => s.name);
  const parts = [
    isMine(a) ? '' : `<span title="${esc(tas.join(', '))}">${tas.length ? 'TAs: ' + esc(tas.join(', ')) : 'No TAs'}</span>`,
    `<span class="status status--${esc(a.status)}">${esc(checkingText(a))}</span>`,
    a.visibility === 'class' ? `<span>${a.submitted_count}/${a.student_count} submitted</span>` : '',
  ].filter(Boolean);
  return parts.map(x => '<span class="meta__dot">·</span>' + x).join('');
}

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
  // Same header as the other class pages. The join code is not shown here;
  // staff find it on the Members page.
  showClassHeader(classroom);
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

  // A TA gets a Mine / All switch: their own work first, then the whole class.
  const tabs = $('taTabs');
  tabs.hidden = !isTA();
  if (isTA()) {
    $('countMine').textContent = myTasks().length;
    $('countAll').textContent = state.assignments.length;
    tabs.querySelectorAll('.seg__btn').forEach(t =>
      t.classList.toggle('is-on', t.dataset.view === state.view));
  }
}

/* ---------- filtering ---------- */

function visible() {
  const term = state.search.trim().toLowerCase();
  let source = state.riskOnly ? state.atRisk : state.assignments;
  if (isTA() && state.view === 'mine') source = myTasks();     // a TA's own work
  return source.filter(a => !term || a.title.toLowerCase().includes(term)
                                  || String(a.topic || '').toLowerCase().includes(term));
}

/* ---------- the list ---------- */

function renderList() {
  renderRiskBox();
  const rows = visible();
  const host = $('topics');
  const empty = $('emptyState');
  empty.hidden = rows.length > 0;

  if (!rows.length) {
    host.innerHTML = '';

    // Say why the list is empty - nothing here at all, or nothing matching.
    const filtering = state.search.trim() !== '';
    const mine = isTA() && state.view === 'mine';
    empty.innerHTML = filtering
      ? `<strong>No assignments match</strong>Try clearing the search.`
      : state.riskOnly
        ? `<strong>You're on track</strong>Nothing is due in the next 3 days.`
        : mine
          ? `<strong>Nothing assigned to you yet</strong>When the lecturer adds you to an assignment, it shows up here.`
          : `<strong>No assignments yet</strong>Nothing has been added to this classroom.`;
    return;
  }

  // One section per topic, the one with the newest assignment first; inside a
  // topic, soonest due first (a TA's own work: soonest check date first).
  const order = (x, y) => parseDue(dueFor(x)) - parseDue(dueFor(y)) || x.id - y.id;
  host.innerHTML = Topics.group(rows, order).map(t => {
    // Due soon is a student's problem - staff see Posted / Not Posted instead.
    const soon = state.isStaff ? 0 : t.items.filter(isAtRisk).length;
    return Topics.section(t.label, t.items.length, 'assignment', t.items.map(rowHTML).join(''),
      soon ? `<span class="topic__flag">${soon} due soon</span>` : '');
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

/** The coloured left edge, one rule for every role.
    Student: due soon or closed (US-8). TA's own work: their check date.
    Other staff: posted or draft. */
function rowTone(a) {
  if (isTA() && a.can_grade) return taUrgency(a).cls;
  if (state.isStaff) return a.visibility === 'class' ? 'ok' : 'draft';
  if (a.risk === 'submitted') return 'done';                   // US-14
  if (a.risk === 'overdue') return 'overdue';
  return isAtRisk(a) ? 'duesoon' : isClosed(a) ? 'closed' : 'ok';
}

/** The date that matters to this person: a TA's check date on their own
    work, the students' due date everywhere else. */
const isMine = (a) => isTA() && a.can_grade;
const dueFor = (a) => (isMine(a) ? taDue(a) : a.due_at);

const ROW_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="4" width="14" height="17" rx="2" stroke="currentColor" stroke-width="1.9"/>
  <path d="M9 3h6v3H9zM9 11h6M9 15h6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** The badge on the right. A TA's own work counts down to their check date. */
function rowBadge(a) {
  if (!isMine(a)) return badge(a);
  const u = taUrgency(a);
  const key = { overdue: 'overdue', duesoon: 'duesoon', done: 'done', ok: 'inprogress' }[u.cls];
  return { key, label: u.text };
}

function rowHTML(a) {
  const b = rowBadge(a);

  // A TA spots the work the lecturer gave them; the lecturer sees how many
  // TAs are on each assignment.
  const mark = (!state.isOwner && a.can_grade)
    ? '<span class="mine" title="The lecturer gave you this">Yours</span>'
    : (state.isOwner && a.staff_names)
      ? `<span class="mine mine--count" title="TAs: ${esc(a.staff_names)}">${a.staff_names.split(', ').length} TA${a.staff_names.split(', ').length === 1 ? '' : 's'}</span>`
      : '';

  // Whether work is still taken after the due date (US-14), for every role.
  const late = `<span class="meta__dot">·</span><span class="${a.allow_late ? 'meta__late' : ''}">${
    a.allow_late ? 'Late work accepted' : 'No late work'}</span>`;
  const due = (isMine(a)
    ? `<span>Check by ${esc(dueText(taDue(a)))}</span><span class="meta__dot">·</span><span>Students due ${esc(dueText(a.due_at))}</span>`
    : `<span>Due ${esc(dueText(a.due_at))}</span>`) + late;

  return `
  <button class="assignment tone--${rowTone(a)} ${a.id === state.selected ? 'is-selected' : ''}" data-id="${a.id}">
    <span class="assignment__icon">${ROW_ICON}</span>
    <span class="assignment__main">
      <span class="assignment__title">${esc(a.title)}</span>
      <span class="assignment__meta">${due}${state.isStaff ? staffColumns(a) : ''}</span>
    </span>
    <span class="assignment__end">
      <span class="assignment__pts">${a.my_score != null ? `${a.my_score}/${a.points}` : `${a.points} pts`}</span>
      <span class="assignment__tags">${mark}<span class="badge badge--${b.key}">${b.label}</span></span>
    </span>
  </button>`;
}

/* ---------- the details panel ----------
   One layout for every role, as a side panel or full screen (Expand), top to
   bottom in the side panel:
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

  if (state.grading && state.full) return renderGradingShell(a);

  const b = badge(a);

  panel.innerHTML = `
    <button class="pd__back" id="backBtn" type="button">&larr; All assignments</button>
    <div class="pd__head">
      <div>
        <div class="pd__eyebrow">Assignment</div>
        <div class="pd__title">${esc(a.title)}</div>
        <div class="pd__by">Set by ${esc(a.created_by_name)}</div>
      </div>
      <div class="pd__tools">
        ${state.isOwner
          ? `<a class="linkbtn" href="create-assignment.html?id=${classroomId}&edit=${a.id}">Edit</a>`
          : ''}
        <button class="iconbtn" id="fullBtn" type="button"
                title="${state.full ? 'Back to the list' : 'Open full screen'}"
                aria-label="${state.full ? 'Back to the list' : 'Open full screen'}">${state.full ? ICON_SHRINK : ICON_EXPAND}</button>
      </div>
    </div>

    ${state.isStaff ? `
    <div class="pd__chips">
      <span class="badge badge--${b.key}">${b.label}</span>
      ${statusPill(a)}
    </div>` : ''}

    <div class="pd__body">
    <div class="pd__action">${roleBox(a)}</div>
    ${state.isStaff && a.visibility === 'class' ? '<div class="subs pd__subs" id="subsBox"></div>' : ''}

    <dl class="facts pd__facts">
      ${a.topic ? `<dt>Topic</dt><dd>${esc(a.topic)}</dd>` : ''}
      <dt>Students due</dt><dd>${esc(dueText(a.due_at))}</dd>
      <dt>Points</dt><dd>${a.points} pts</dd>
      <dt>Late work</dt><dd>${a.allow_late ? 'Accepted, marked late' : 'Not accepted'}</dd>
      ${state.isStaff ? `
        ${canSetStatus(a) ? '' : `<dt>TA check by</dt><dd>${a.staff_due_at ? esc(dueText(a.staff_due_at)) : '<span class="muted">Not set</span>'}</dd>`}
        <dt>TAs</dt><dd>${(a.staff || []).length ? esc(a.staff.map(s => s.name).join(', ')) : '<span class="muted">None</span>'}</dd>` : ''}
    </dl>

    <div class="pd__about">
      <div class="pd__label">Description</div>
      <p class="pd__desc">${esc(a.description || 'No description.')}</p>
      ${attachedFiles(a)}
    </div>
    </div>`;

  $('fullBtn').addEventListener('click', () => setFull(!state.full));
  $('gradeBtn')?.addEventListener('click', openGrading);
  $('backBtn').addEventListener('click', () => setFull(false));

  wireSoonButtons();
  wireStatus(a);
  if (!state.isStaff) loadMySubmission(a);                          // US-14
  if (state.isStaff && a.visibility === 'class') loadSubmissions(a);  // US-15
}

/* Open the assignment full screen, and back again. */
const ICON_EXPAND = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_SHRINK = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Full screen hides the list and gives the assignment the whole page. The
    address keeps ?open= so a refresh, or a shared link, opens the same one. */
function setFull(on) {
  state.full = on && state.selected != null;
  if (!state.full) state.grading = false;
  document.querySelector('.schedule').classList.toggle('is-full', state.full);
  const url = new URL(location.href);
  if (state.full) url.searchParams.set('open', state.selected);
  else url.searchParams.delete('open');
  if (state.grading) url.searchParams.set('grade', '1');
  else url.searchParams.delete('grade');
  history.replaceState(null, '', url);
  renderPanel();
  window.scrollTo({ top: 0 });
}

/* US-15: Grade Submissions (View Submissions for staff who only look) opens
   the grading screen; Back or Esc returns to the assignment. */
function openGrading() {
  state.grading = true;
  state.gradeStudent = null;
  state.previewFile = null;
  setFull(true);
}

function closeGrading() {
  state.grading = false;
  setFull(true);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !state.full) return;
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (state.grading) closeGrading(); else setFull(false);
});

/* US-15: the way into the grading screen. Staff who cannot grade get the
   same screen to look at, read-only. */
const GRADE_BTN = '<button class="btn btn--primary btn--block" id="gradeBtn" type="button">Grade Submissions</button>';
const VIEW_BTN = '<button class="btn btn--ghost btn--block" id="gradeBtn" type="button">View Submissions</button>';

const statusPill = (a) =>
  `<span class="status status--${esc(a.status)}" title="Has a TA started checking the work?">${esc(checkingText(a))}</span>`;

/** Who may move the status: the lecturer, or a TA on this assignment. */
const canSetStatus = (a) => state.isOwner || (state.role === 'ta' && a.can_grade);

/** Three buttons, the current one pressed. Saves on click (wireStatus). */
function statusControl(a) {
  return `
    <div class="box__stack">
      <span class="box__k">TA checking</span>
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
          ${posted ? GRADE_BTN : soon('Post Assignment', 'btn--primary')}
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
            ? GRADE_BTN
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
        ${posted ? VIEW_BTN : ''}
      </div>`;
  }

  // Student, past the due date with nothing handed in: closed (US-8).
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

  // Student: upload a file (US-14). The contents arrive from the server in
  // loadMySubmission, so the box starts with a short loading line.
  const s = badge(a);
  return `
    <div class="box ${a.risk === 'overdue' ? 'box--overdue' : isAtRisk(a) ? 'box--duesoon' : a.risk === 'submitted' ? 'box--done' : ''}">
      <div class="box__head">
        <span class="box__label">Your submission</span>
        <span class="badge badge--${s.key}">${isAtRisk(a) ? riskWhen(a) : s.label}</span>
      </div>
      <div class="upload" id="mySub"><div class="upload__file">Loading…</div></div>
    </div>`;
}

/* ---------- US-14: the student's own submission ----------
   A student adds files, links (Google Drive, GitHub ...) or both, checks the
   list, then submits them together. Submitting again replaces the whole
   earlier set (SRS-23). After the due date the box stays open only when the
   lecturer allows late work, and the server marks it late (SRS-24). The
   server checks everything again (SRS-21, SRS-22). */

const pastDue = (a) => parseDue(a.due_at) < new Date();
const canStillSubmit = (a) => !pastDue(a) || a.allow_late;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const subUrl = (a) => `/classrooms/${classroomId}/assignments/${a.id}/submission`;

/* Files and links picked but not submitted yet, for the open assignment. */
const pending = { id: null, files: [], links: [], data: null };

/* Picked files live only in this page until Submit sends them, so warn
   before the student leaves (or refreshes) with work not handed in. */
window.addEventListener('beforeunload', (e) => {
  if (pending.files.length || pending.links.length) e.preventDefault();
});

async function loadMySubmission(a) {
  if (!$('mySub')) return;
  if (pending.id !== a.id) { pending.id = a.id; pending.files = []; pending.links = []; }
  try {
    pending.data = await API.get(subUrl(a));
    if (state.selected === a.id) renderMySubmission(a);
  } catch (err) {
    $('mySub').innerHTML = `<div class="upload__file">${esc(err.message)}</div>`;
  }
}

function renderMySubmission(a) {
  const box = $('mySub');
  if (!box || !pending.data) return;
  const { submission, limits, grade, points } = pending.data;
  const open = canStillSubmit(a);
  const types = limits.types.map(x => '.' + x).join(',');
  const items = submission ? [...submission.files, ...submission.links] : [];

  // US-15: the grade and comment from the lecturer or TA, once given.
  const graded = grade ? `
    <div class="mygrade">
      <span class="mygrade__k">Your grade</span>
      <span class="mygrade__v"><b>${grade.score}</b> / ${points}</span>
      ${grade.feedback ? `<p class="mygrade__note">${esc(grade.feedback)}</p>` : ''}
    </div>` : '';

  const done = submission ? `
    <div class="subfiles">${items.map(f => Files.row(f, `${subUrl(a)}/files/${f.id}`)).join('')}</div>
    <div class="upload__meta">Submitted ${esc(dueText(submission.submitted_at))} · ${plural(items.length, 'item')}
      ${Number(submission.late) ? '<span class="tag tag--late">Late</span>' : ''}</div>`
    : '<div class="upload__file">Nothing submitted yet</div>';

  const count = pending.files.length + pending.links.length;
  const chosen = count ? `
    <div class="pending">
      <div class="pending__head">Not handed in yet · ${plural(count, 'item')} - press Submit to save</div>
      ${pending.files.map((f, i) => `
        <div class="pending__row">
          <span class="pending__icon">${Files.ICON.file}</span>
          <span class="pending__name">${esc(f.name)}</span>
          <span class="pending__size">${Files.size(f.size)}</span>
          <button class="pending__x" data-remove-file="${i}" type="button" aria-label="Remove ${esc(f.name)}">×</button>
        </div>`).join('')}
      ${pending.links.map((l, i) => `
        <div class="pending__row">
          <span class="pending__icon">${Files.ICON.link}</span>
          <span class="pending__name">${esc(l)}</span>
          <button class="pending__x" data-remove-link="${i}" type="button" aria-label="Remove link">×</button>
        </div>`).join('')}
    </div>` : '';

  box.innerHTML = `${graded}
    <div class="upload__row">
      <span class="upload__title">${submission ? 'Your work' : 'Hand in your work'}</span>
      <span class="upload__note">Files or links</span>
    </div>
    ${done}
    ${open ? `
      ${pastDue(a) ? '<div class="late-note">The due date has passed. Late work is still accepted and will be marked <b>Late</b>.</div>' : ''}
      ${chosen}
      <input type="file" id="fileInput" accept="${types}" multiple hidden>
      <div class="addrow">
        <button class="btn btn--ghost" id="pickFile" type="button">${Files.ICON.file} Add Files</button>
        <form class="linkform" id="linkForm" novalidate>
          <input class="input" id="linkInput" type="url" placeholder="Paste a link">
          <button class="btn btn--ghost" type="submit">Add</button>
        </form>
      </div>
      <button class="btn btn--primary btn--block" id="submitWork" type="button" ${count ? '' : 'disabled'}>
        ${submission ? 'Replace Submission' : 'Submit'}${count ? ` (${plural(count, 'item')})` : ''}</button>
      ${count ? '' : `<div class="upload__hint upload__hint--center">${submission
        ? 'To change your work, add the new files or links above, then Replace Submission.'
        : 'Add files or a link above, then press Submit.'}</div>`}
      <div class="upload__hint">${submission ? 'Submitting again replaces everything you handed in. ' : ''}${Files.limitsText(limits)}</div>`
    : `<div class="upload__hint">The due date has passed, so your work can no longer be changed.</div>`}`;

  if (!open) return;
  $('pickFile').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => {
    pending.files.push(...Files.accept([...e.target.files], pending.files, limits));
    renderMySubmission(a);
  });
  $('linkForm').addEventListener('submit', (e) => {
    e.preventDefault();
    addLink(a, $('linkInput').value.trim(), limits);
  });
  box.querySelectorAll('[data-remove-file]').forEach(b => b.addEventListener('click', () => {
    pending.files.splice(Number(b.dataset.removeFile), 1);
    renderMySubmission(a);
  }));
  box.querySelectorAll('[data-remove-link]').forEach(b => b.addEventListener('click', () => {
    pending.links.splice(Number(b.dataset.removeLink), 1);
    renderMySubmission(a);
  }));
  $('submitWork')?.addEventListener('click', () => sendWork(a, limits));
}

/** Only http and https links; the server checks this again. */
function addLink(a, text, limits) {
  if (!text) return;
  const url = Files.toUrl(text);
  if (!url) return KU.toast('That does not look like a link');
  if (pending.links.length >= limits.maxLinks) return KU.toast(`Up to ${limits.maxLinks} links`);
  if (!pending.links.includes(url)) pending.links.push(url);
  renderMySubmission(a);
  $('linkInput')?.focus();
}

async function sendWork(a, limits) {
  const total = pending.files.reduce((n, f) => n + f.size, 0);
  if (total > limits.maxTotalMb * 1024 * 1024) {
    return KU.toast(`The files add up to more than ${limits.maxTotalMb} MB`);
  }
  const btn = $('submitWork');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  try {
    await API.sendFiles('PUT', subUrl(a), pending.files, { links: pending.links });
    pending.files = [];
    pending.links = [];
    a.risk = 'submitted';                                    // no longer at risk
    state.atRisk = state.atRisk.filter(x => x.id !== a.id);
    $('riskCount').textContent = state.atRisk.length;
    $('riskCount').hidden = state.atRisk.length === 0;
    renderList();
    renderPanel();                                           // reloads the list of work
    KU.toast('Submitted');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = label;
    KU.toast(err.message);
  }
}

/* ---------- US-15: who has submitted (staff) ----------
   Every student in the class, submitted first, each with their files and
   links. Staff can open any file in their classroom (SRS-25). */

async function loadSubmissions(a) {
  const box = state.grading ? $('grBody') : $('subsBox');
  if (!box) return;
  try {
    const data = await API.get(`/classrooms/${classroomId}/assignments/${a.id}/submissions`);
    if (state.selected !== a.id) return;
    if (state.grading) renderGrading(a, data); else renderSubsSummary(data);
  } catch (err) {
    box.innerHTML = `<div class="box__hint">${esc(err.message)}</div>`;
  }
}

/** The panel and full screen only show how far along it is. */
function renderSubsSummary({ submitted, graded, total }) {
  const pct = total ? Math.round(submitted / total * 100) : 0;
  $('subsBox').innerHTML = `
    <div class="subs__head">
      <span class="box__label">Submissions</span>
      <span class="subs__count"><b>${submitted}</b> / ${total} submitted · ${graded} graded</span>
    </div>
    <div class="subs__bar"><span style="width:${pct}%"></span></div>
    ${total ? '' : '<div class="box__hint">No students have joined this class yet.</div>'}`;
}

/* ---------- US-15: the grading screen ----------
   Students on the left; on the right the one you picked: their files, a
   preview of the file, and the grade and comment. Previous / Next walk
   through the class. The lecturer and a TA on it can grade; other staff
   see the same screen without the inputs. */

const PREVIEW = ['pdf', 'txt', 'png', 'jpg', 'jpeg'];

function renderGradingShell(a) {
  $('panel').innerHTML = `
    <button class="pd__back is-shown" id="gradeBack" type="button">&larr; Back to the assignment</button>
    <div class="gr__head">
      <div>
        <div class="pd__eyebrow">${a.can_grade ? 'Grading' : 'Submissions'}</div>
        <div class="pd__title">${esc(a.title)}</div>
        <div class="pd__by">${a.points} points · Due ${esc(dueText(a.due_at))}</div>
      </div>
      <div class="gr__count" id="grCount"></div>
    </div>
    <div class="gr" id="grBody"><div class="box__hint">Loading submissions…</div></div>`;
  $('gradeBack').addEventListener('click', closeGrading);
  loadSubmissions(a);
}

function previewHTML(url, f) {
  const ext = Files.ext(f.file_name);
  if (['png', 'jpg', 'jpeg'].includes(ext)) {
    return `<img class="gr__img" src="/api${url}?view=1" alt="${esc(f.file_name)}">`;
  }
  if (PREVIEW.includes(ext)) {
    return `<iframe class="gr__frame" src="/api${url}?view=1" title="${esc(f.file_name)}"></iframe>`;
  }
  return `<div class="gr__noprev">${Files.ICON.file}
    <span><b>${esc(f.file_name)}</b>This kind of file can't be shown here.</span>
    <a class="btn btn--ghost btn--sm" ${Files.link(url, f.file_name)}>Download</a></div>`;
}

function renderGrading(a, data) {
  const { submitted, graded, total, students, points, canGrade } = data;
  $('grCount').innerHTML = `<b>${submitted}</b> / ${total} submitted · ${graded} graded`;
  if (!total) {
    $('grBody').innerHTML = '<div class="box__hint">No students have joined this class yet.</div>';
    return;
  }

  const s = students.find(x => x.id === state.gradeStudent) || students[0];
  state.gradeStudent = s.id;
  const at = students.indexOf(s);
  const sub = s.submission;
  const g = s.grade;
  const fileUrl = (f) => `/classrooms/${classroomId}/assignments/${a.id}/submissions/files/${f.id}`;

  const files = sub ? sub.files : [];
  const links = sub ? sub.links : [];
  // Show the picked file, else the first PDF, else anything that can be shown.
  const shown = files.find(f => f.id === state.previewFile)
             || files.find(f => Files.ext(f.file_name) === 'pdf')
             || files.find(f => PREVIEW.includes(Files.ext(f.file_name))) || files[0];
  state.previewFile = shown ? shown.id : null;

  const list = students.map(x => `
    <button class="gr__student ${x.id === s.id ? 'is-on' : ''}" data-student="${x.id}" type="button">
      <span class="avatar avatar--sm">${esc(x.name.slice(0, 2).toUpperCase())}</span>
      <span class="gr__who"><b>${esc(x.name)}</b>
        <span class="${x.submission ? '' : 'gr__none'}">${x.submission
          ? (Number(x.submission.late) ? 'Submitted late' : 'Submitted') : 'Not submitted'}</span></span>
      <span class="gr__score">${x.grade ? `<b>${x.grade.score}</b>/${points}` : '<span class="gr__none">–</span>'}</span>
    </button>`).join('');

  const work = sub ? `
      <div class="gr__files">
        ${files.map(f => `
          <span class="gr__file ${f.id === state.previewFile ? 'is-on' : ''}">
            <button type="button" data-file="${f.id}">${Files.ICON.file}<span>${esc(f.file_name)}</span>
              <small>${Files.size(f.file_size)}</small></button>
            <a ${Files.link(fileUrl(f), f.file_name)} title="Open in a new tab">Open</a>
          </span>`).join('')}
        ${links.map(l => `
          <a class="gr__file gr__link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">
            ${Files.ICON.link}<span>${esc(l.url)}</span><small>${esc(l.file_name)}</small></a>`).join('')}
      </div>
      ${shown ? `<div class="gr__preview">${previewHTML(fileUrl(shown), shown)}</div>`
              : '<div class="gr__empty">Only links were handed in - open them above.</div>'}`
    : '<div class="gr__empty">Nothing handed in. You can still give a grade, for example 0.</div>';

  // The grade sits above the work, so it is in view while you read the file.
  const form = canGrade ? `
      <div class="gr__form">
        <div class="gr__field">
          <label class="gr__label" for="grScore">Grade</label>
          <span class="gr__scorebox">
            <input class="input" id="grScore" type="number" min="0" ${points > 0 ? `max="${points}"` : ''} step="1"
                   value="${g ? g.score : ''}" placeholder="-">
            <span>/ ${points}</span>
          </span>
        </div>
        <div class="gr__field">
          <label class="gr__label" for="grNote">Comment <span class="gr__opt">(optional)</span></label>
          <textarea class="input gr__note" id="grNote" rows="2" maxlength="2000"
                    placeholder="Only ${esc(s.name)} sees this, e.g. Good work, check question 3">${esc(g?.feedback || '')}</textarea>
        </div>
        <div class="gr__actions">
          <button class="btn btn--primary" id="grSave" type="button">${g ? 'Update grade' : 'Save grade'}</button>
          <span class="gr__by">${g ? `Graded by ${esc(g.graded_by_name)}` : 'Not graded yet'}</span>
        </div>
      </div>` : `
      <div class="gr__form gr__form--read">
        <div class="gr__field">
          <span class="gr__label">Grade</span>
          <div class="gr__read">${g ? `<b>${g.score}</b> / ${points}` : 'Not graded yet'}</div>
        </div>
        <div class="gr__field">
          ${g?.feedback ? `<span class="gr__label">Comment</span><p class="gr__said">${esc(g.feedback)}</p>` : ''}
        </div>
        ${g ? `<span class="gr__by">Graded by ${esc(g.graded_by_name)}</span>` : '<span></span>'}
      </div>`;

  $('grBody').innerHTML = `
    <div class="gr__list">${list}</div>
    <div class="gr__work">
      <div class="gr__workhead">
        <div>
          <div class="gr__name">${esc(s.name)}</div>
          <div class="gr__meta">${sub ? `Handed in ${esc(dueText(sub.submitted_at))}` : 'Nothing handed in'}
            ${sub && Number(sub.late) ? '<span class="tag tag--late">Late</span>' : ''}
            ${g?.resubmitted ? '<span class="tag tag--late" title="Handed in again after it was graded">Resubmitted</span>' : ''}</div>
        </div>
        <div class="gr__nav">
          <button class="btn btn--ghost btn--sm" id="grPrev" type="button" ${at === 0 ? 'disabled' : ''}>&larr; Previous</button>
          <span>${at + 1} of ${students.length}</span>
          <button class="btn btn--ghost btn--sm" id="grNext" type="button" ${at === students.length - 1 ? 'disabled' : ''}>Next &rarr;</button>
        </div>
      </div>
      ${form}
      ${work}
    </div>`;

  const pick = (id) => { state.gradeStudent = id; state.previewFile = null; renderGrading(a, data); };
  $('grBody').querySelectorAll('.gr__student').forEach(b =>
    b.addEventListener('click', () => pick(Number(b.dataset.student))));
  $('grBody').querySelectorAll('[data-file]').forEach(b =>
    b.addEventListener('click', () => { state.previewFile = Number(b.dataset.file); renderGrading(a, data); }));
  $('grPrev').addEventListener('click', () => pick(students[at - 1].id));
  $('grNext').addEventListener('click', () => pick(students[at + 1].id));
  if (canGrade) {
    $('grSave').addEventListener('click', () => saveGrade(a, data, s));
    $('grScore').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveGrade(a, data, s); }
    });
  }
}

async function saveGrade(a, data, s) {
  const btn = $('grSave');
  btn.disabled = true;
  try {
    const res = await API.put(`/classrooms/${classroomId}/assignments/${a.id}/grades/${s.id}`,
      { score: $('grScore').value, feedback: $('grNote').value });
    KU.toast(res.grade ? `Saved: ${s.name} ${res.grade.score}/${a.points}` : `Grade taken back for ${s.name}`);
    await loadSubmissions(a);              // fresh counts, who graded it, still on this student
  } catch (err) {
    KU.toast(err.message);
    btn.disabled = false;
  }
}

/* ---------- files the lecturer attached ----------
   Everyone who can see the assignment can open them. The lecturer adds or
   removes them on the Edit page. */

function attachedFiles(a) {
  if (!(a.attachments || []).length) return '';
  return `
    <div class="pd__label pd__label--gap">Files and links from your lecturer</div>
    <div class="subfiles">
      ${a.attachments.map(f => Files.row(f, `/classrooms/${classroomId}/attachments/${f.id}`)).join('')}
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
        KU.toast('Checking: ' + STATUS_LABEL[status]);
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
  const btn = e.target.closest('.seg__btn');
  if (!btn) return;
  state.view = btn.dataset.view;
  $('taTabs').querySelectorAll('.seg__btn').forEach(t => t.classList.toggle('is-on', t === btn));
  renderList();
});

$('searchBox').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderList();
});

/* ---------- start ---------- */

(async () => {
  if (!classroomId) {
    $('classTitle').textContent = 'No classroom selected';
    return;
  }
  $('membersLink').href = 'members.html?id=' + classroomId;
  $('announcementsLink').href = 'announcements.html?id=' + classroomId;

  try {
    await loadClassroom();
    await loadAssignments();
    // ?open=5 opens that assignment full screen (a refresh or a shared link).
    const open = Number(new URLSearchParams(location.search).get('open'));
    if (open && state.assignments.some(a => a.id === open)) {
      state.selected = open;
      state.full = true;
      state.grading = state.isStaff && new URLSearchParams(location.search).get('grade') === '1';
      document.querySelector('.schedule').classList.add('is-full');
    }
    renderList();
    renderPanel();
  } catch (err) {
    KU.toast(err.message);
  }
})();
