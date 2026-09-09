/* ==========================================================================
   Class Schedule page
   Demo data + rendering. Replace ACTIVITIES with data from the API later —
   the render functions below are the only thing that needs to change.
   ========================================================================== */

/* SRS-9  every activity carries a title, type, due date and visibility
   SRS-11 status is one of Not Started / In Progress / Done (+ submission state)
   SRS-12 risk is Overdue / Due Soon / Unassigned                              */
const ACTIVITIES = [
  { id: 1, week: 'Week 7 - Oct 9-13', title: 'Lab 4: React Autolayout Mockup',
    type: 'homework', due: 'Oct 11, 23:59', by: 'Dr. K. Sombat', pts: 10,
    status: 'submitted', label: 'Submitted', atRisk: false, accepts: true,
    desc: 'Create a React Autolayout mockup for the classroom dashboard. Include a sidebar, header, and activity list. Use Figma AutoLayout constraints and export a clean 1440px desktop frame. Upload your Figma file or exported PDF.' },

  { id: 2, week: 'Week 7 - Oct 9-13', title: 'Quiz 2: Software Design Patterns',
    type: 'quiz', due: 'Oct 12, 09:00', by: 'Dr. K. Sombat', pts: 20,
    status: 'duesoon', label: 'Due Soon', atRisk: true, accepts: false,
    desc: 'Closed-book quiz covering creational, structural and behavioural patterns. Bring your student card. 45 minutes, held in room 204.' },

  { id: 3, week: 'Week 7 - Oct 9-13', title: 'Team Project Proposal Review',
    type: 'project', due: 'Oct 13, 18:00', by: 'Dr. K. Sombat', pts: 30,
    status: 'notstarted', label: 'Not Started', atRisk: false, accepts: true,
    desc: 'Each team presents their proposal for 10 minutes followed by 5 minutes of questions. Submit your slides before the session begins.' },

  { id: 4, week: 'Week 8 - Oct 16-20', title: 'Design Principles Homework',
    type: 'homework', due: 'Oct 18, 23:59', by: 'Dr. K. Sombat', pts: 10,
    status: 'overdue', label: 'Overdue', atRisk: true, accepts: true,
    desc: 'Answer the five short questions on SOLID principles. Cite one example from your own team project for each principle you discuss.' },

  { id: 5, week: 'Week 8 - Oct 16-20', title: 'Quiz 3: Frontend Architecture',
    type: 'quiz', due: 'Oct 19, 09:00', by: 'Dr. K. Sombat', pts: 20,
    status: 'inprogress', label: 'In Progress', atRisk: false, accepts: false,
    desc: 'Covers component structure, state management and the MVC separation used in the course project.' },

  { id: 6, week: 'Week 8 - Oct 16-20', title: 'Sprint 2 Retrospective',
    type: 'lab', due: 'Oct 20, 18:00', by: 'Dr. K. Sombat', pts: 15,
    status: 'done', label: 'Done', atRisk: false, accepts: false,
    desc: 'Team retrospective session. Come prepared with what went well, what did not, and one change to try in Sprint 3.' },
];

const state = { selected: 1, atRisk: false, type: 'all', status: 'all', file: null };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- filtering ---------- */
function visible() {
  return ACTIVITIES.filter(a =>
    (!state.atRisk || a.atRisk) &&
    (state.type === 'all' || a.type === state.type) &&
    (state.status === 'all' || a.status === state.status));
}

/* ---------- list ---------- */
function renderList() {
  const rows = visible();
  const host = $('weeks');
  $('emptyState').hidden = rows.length > 0;

  const weeks = [...new Set(rows.map(a => a.week))];
  host.innerHTML = weeks.map(week => {
    const items = rows.filter(a => a.week === week);
    const overdue = items.filter(a => a.status === 'overdue').length;
    return `
      <section class="week">
        <div class="week__head">
          <span class="week__title">${esc(week)}</span>
          <span class="week__count">${items.length} activit${items.length === 1 ? 'y' : 'ies'}</span>
          ${overdue ? `<span class="week__flag"><b>${overdue} overdue</b></span>` : ''}
        </div>
        ${items.map(rowHTML).join('')}
      </section>`;
  }).join('');

  host.querySelectorAll('.activity').forEach(el =>
    el.addEventListener('click', () => {
      state.selected = Number(el.dataset.id);
      state.file = null;
      renderList();
      renderPanel();
    }));
}

function rowHTML(a) {
  return `
  <button class="activity ${a.id === state.selected ? 'is-selected' : ''}" data-id="${a.id}">
    <span class="activity__main">
      <span class="activity__title">${esc(a.title)}</span>
      <span class="activity__meta">
        <span><span class="sq"></span> Due: ${esc(a.due)}</span>
        <span>Assigned by ${esc(a.by)}</span>
      </span>
    </span>
    <span class="activity__pts">${a.pts} pts</span>
    <span class="activity__end">
      <span class="badge badge--${a.status}">${esc(a.label)}</span>
      <span class="icon-btn" title="Edit">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="m5 19 2.5-.6 9.4-9.4a1.8 1.8 0 0 0 0-2.5l-.9-.9a1.8 1.8 0 0 0-2.5 0L4.1 15l-.6 2.5.5.5Z"
                stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="icon-btn" title="Expand">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </span>
  </button>`;
}

/* ---------- details panel ---------- */
function renderPanel() {
  const a = ACTIVITIES.find(x => x.id === state.selected);
  const panel = $('panel');

  if (!a) {
    panel.innerHTML = `<div class="empty"><strong>No activity selected</strong>
      Choose an activity from the list.</div>`;
    return;
  }

  /* SRS-21: the upload control only appears for activities that accept
     submissions. SRS-24: a submission after the due date is marked late. */
  const upload = a.accepts ? `
    <hr>
    <div class="panel__label">Submission</div>
    <div class="upload">
      <div class="upload__row">
        <span class="upload__title">Upload file</span>
        <span class="upload__note">PDF or Figma link</span>
      </div>
      <button class="btn btn--primary btn--block" id="uploadBtn">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 16V5m0 0L8 9m4-4 4 4M5 19h14" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>Upload File
      </button>
      <input type="file" id="fileInput" hidden>
      ${state.file ? `<div class="upload__file">Selected: <b>${esc(state.file)}</b></div>` : ''}
    </div>` : '';

  panel.innerHTML = `
    <div class="panel__title">Activity Details</div>
    <div class="panel__sub">Selected activity</div>

    <div class="panel__name">${esc(a.title)}</div>
    <div class="panel__tags">
      <span class="tag">${esc(a.type)}</span>
      <span class="panel__by">Assigned by ${esc(a.by)}</span>
    </div>
    <div class="panel__due"><span class="sq"></span> Due: ${esc(a.due)}</div>
    <div class="panel__pts">${a.pts} pts</div>
    <div style="margin-top:10px"><span class="badge badge--${a.status}">${esc(a.label)}</span></div>

    <hr>
    <div class="panel__label">Description</div>
    <p class="panel__desc">${esc(a.desc)}</p>
    ${upload}`;

  const btn = $('uploadBtn');
  if (btn) {
    const input = $('fileInput');
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (!input.files.length) return;
      state.file = input.files[0].name;
      // SRS-24 — the server decides late/on time by comparing upload time to the due date.
      KU.toast('Submitted — ' + state.file);
      renderPanel();
    });
  }
}

/* ---------- controls ---------- */
$('atRisk').addEventListener('click', (e) => {
  state.atRisk = !state.atRisk;
  e.currentTarget.classList.toggle('is-on', state.atRisk);
  renderList();
});
$('filterType').addEventListener('change', (e) => { state.type = e.target.value; renderList(); });
$('filterStatus').addEventListener('change', (e) => { state.status = e.target.value; renderList(); });

$('copyCode').addEventListener('click', async () => {
  const ok = await KU.copy($('joinCode').textContent.trim());
  KU.toast(ok ? 'Join code copied' : 'Copy failed — select the code manually');
});

$('regenCode').addEventListener('click', () => {
  $('joinCode').textContent = KU.makeJoinCode();
  KU.toast('New join code issued — the old one no longer works');
});

$('newActivity').addEventListener('click', () =>
  KU.toast('New Activity form — not part of this demo yet'));

/* ---------- init ---------- */
renderList();
renderPanel();
