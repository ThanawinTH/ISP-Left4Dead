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

  const due = isMine(a)
    ? `<span>Check by ${esc(dueText(taDue(a)))}</span><span class="meta__dot">·</span><span>Students due ${esc(dueText(a.due_at))}</span>`
    : `<span>Due ${esc(dueText(a.due_at))}</span>`;

  return `
  <button class="assignment tone--${rowTone(a)} ${a.id === state.selected ? 'is-selected' : ''}" data-id="${a.id}">
    <span class="assignment__icon">${ROW_ICON}</span>
    <span class="assignment__main">
      <span class="assignment__title">${esc(a.title)}</span>
      <span class="assignment__meta">${due}${state.isStaff ? staffColumns(a) : ''}</span>
    </span>
    <span class="assignment__end">
      <span class="assignment__pts">${a.points} pts</span>
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

    <dl class="facts pd__facts">
      ${a.topic ? `<dt>Topic</dt><dd>${esc(a.topic)}</dd>` : ''}
      <dt>Students due</dt><dd>${esc(dueText(a.due_at))}</dd>
      <dt>Points</dt><dd>${a.points} pts</dd>
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
  $('backBtn').addEventListener('click', () => setFull(false));

  wireSoonButtons();
  wireStatus(a);
}

/* Open the assignment full screen, and back again. */
const ICON_EXPAND = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_SHRINK = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Full screen hides the list and gives the assignment the whole page. The
    address keeps ?open= so a refresh, or a shared link, opens the same one. */
function setFull(on) {
  state.full = on && state.selected != null;
  document.querySelector('.schedule').classList.toggle('is-full', state.full);
  const url = new URL(location.href);
  if (state.full) url.searchParams.set('open', state.selected);
  else url.searchParams.delete('open');
  history.replaceState(null, '', url);
  renderPanel();
  window.scrollTo({ top: 0 });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.full) setFull(false);
});

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
      document.querySelector('.schedule').classList.add('is-full');
    }
    renderList();
    renderPanel();
  } catch (err) {
    KU.toast(err.message);
  }
})();
