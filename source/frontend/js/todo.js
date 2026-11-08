/* ==========================================================================
   To-do (US-19): what is due and at risk across all my classes, with search.
   Laid out like the Google Classroom To-do page:
     tabs     - Student: Assigned, Missing, Done, Schedule
                Staff:   Open, Late, Done, Schedule
     controls - a class filter (All classes), search, and Student / Staff
                when I am a student in one class and staff in another
     sections - by week (No due date, This week, Next week, Later; or Last
                week, Earlier for past work), each with a count, opening
                and closing like Google Classroom's.
   The rules are the Assignment page's (US-8, SRS-12):
     Missing  - past the due date and not handed in (late work allowed or not)
     due soon - within 3 days: the date shows in amber
     Late     - staff: past the due date and not marked Done, and my staff
                tasks past their due date. Due soon (amber date) and No TA
                yet stay in Open, where they can still be acted on.

   The file reads top to bottom in layers, so a change has one obvious home:
     constants -> dates -> filters -> one row -> sections -> tabs -> drawing
     -> events -> start.
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STAFF_ROLES = ['lecturer', 'ta', 'staff'];
const KEY = 'ku.todo';                       // remembers role and tab, this browser only
const KIND_LABEL = { lab: 'Lab', consultation: 'Consultation', milestone: 'Milestone' };
const TASK_STATUS = { inprogress: 'In progress', open: 'Open' };
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/* Times, named rather than written as numbers in the middle of a condition. */
const DAY_MS = 864e5;
const WEEK_MS = 7 * DAY_MS;
const SOON_MS = 3 * DAY_MS;                  // "due soon" = the amber date
const REFRESH_MS = 60 * 1000;                // keeps the week sections honest
const END_OF_DAY = { hour: 23, minute: 59 }; // a staff task with a date is due at the end of it

const TABS = {
  student: [['assigned', 'Assigned'], ['missing', 'Missing'], ['done', 'Done'], ['schedule', 'Schedule']],
  staff:   [['open', 'Open'], ['late', 'Late'], ['done', 'Done'], ['schedule', 'Schedule']],
};

/* Week sections, and which start open (Google Classroom keeps the far ones shut). */
const SECTIONS = {
  nodate:  { label: 'No due date', open: false },
  earlier: { label: 'Earlier',     open: false },
  last:    { label: 'Last week',   open: true },
  this:    { label: 'This week',   open: true },
  next:    { label: 'Next week',   open: true },
  later:   { label: 'Later',       open: false },
};
const FORWARD = ['nodate', 'earlier', 'last', 'this', 'next', 'later'];   // soonest first
const BACKWARD = ['later', 'next', 'this', 'last', 'earlier', 'nodate'];  // most recent first

const ICON = {
  work: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="4" width="14" height="17" rx="2" stroke="currentColor" stroke-width="1.9"/><path d="M9 3h6v3H9zM9 11h6M9 15h6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  task: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.9"/><path d="m8.5 12 2.4 2.4 4.6-4.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const state = {
  data: null, classes: new Map(), role: 'student', tab: 'assigned',
  classId: 'all', search: '', open: {},          // open: sections the person has opened or shut
};

/* ---------- small shared helpers ---------- */

/** Groups items into a Map, keeping the order they arrived in. */
function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/** True when a search term or a single class is narrowing the page down. */
const isFiltering = () => Boolean(state.search.trim()) || state.classId !== 'all';

/** The empty state. Filtering changes the wording, so "nothing" is never confused
    with "nothing matches what you typed". */
function emptyBlock(text) {
  return `<div class="gempty">${esc(isFiltering() ? 'Nothing matches.' : text)}</div>`;
}

/* ---------- dates ---------- */

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDate = (v) => new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T') + 'Z');
const fromYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dateText = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const timeText = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));

function monday(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/** Which week section a date falls in, Monday to Sunday. */
function bucket(d) {
  if (!d) return 'nodate';
  const mon = monday(new Date()).getTime();
  if (d >= new Date(mon + 2 * WEEK_MS)) return 'later';
  if (d >= new Date(mon + WEEK_MS)) return 'next';
  if (d >= new Date(mon)) return 'this';
  if (d >= new Date(mon - WEEK_MS)) return 'last';
  return 'earlier';
}

const soon = (d) => d > new Date() && d - new Date() < SOON_MS;

/* ---------- filters ---------- */

const cls = (id) => state.classes.get(id) || { name: '?', code: '' };
const mySide = () => [...state.classes.values()].filter(c => c.side === state.role);

/** The class filter and the search box, applied together. Searching also looks
    at the class name and subject code, not only the row's own words. */
function keep(classId, ...fields) {
  if (state.classId !== 'all' && Number(state.classId) !== classId) return false;
  const term = state.search.trim().toLowerCase();
  return !term || [...fields, cls(classId).name, cls(classId).code]
    .some(f => String(f || '').toLowerCase().includes(term));
}

/* ---------- one row, like a Google Classroom to-do item ---------- */

function row({ href, icon = 'work', tone = '', title, sub, date, dateTone = '', small = '' }) {
  return `
    <a class="gitem" href="${href}">
      <span class="gitem__icon gitem__icon--${tone || 'plain'}">${ICON[icon]}</span>
      <span class="gitem__main">
        <span class="gitem__title">${esc(title)}</span>
        <span class="gitem__sub">${sub}</span>
      </span>
      <span class="gitem__date gitem__date--${dateTone || 'plain'}">${esc(date)}${small ? `<small>${esc(small)}</small>` : ''}</span>
    </a>`;
}

const dot = ' · ';
const openHref = (a) => `class-schedule.html?id=${a.classroom_id}&open=${a.id}`;
const warn = (text) => `<span class="gitem__warn">${text}</span>`;

/** How each risk state changes a student's row. A state that is not listed
    keeps the defaults, so a new one is added here and nowhere else. */
const STUDENT_RISK = {
  submitted: (a, d) => ({
    date: a.score != null ? `${a.score}/${a.points}` : (a.late ? 'Turned in late' : 'Turned in'),
    small: `Due ${dateText(d)}`,
    dateTone: 'done',
    tone: 'done',
  }),
  overdue: () => ({ note: dot + warn('Late work accepted'), dateTone: 'late', tone: 'late' }),
  closed: () => ({ note: `${dot}Closed`, dateTone: 'late', tone: 'muted' }),
};

function studentItem(a) {
  const d = toDate(a.due_at);
  const change = STUDENT_RISK[a.risk];
  const look = {
    date: dateText(d), small: timeText(d), dateTone: soon(d) ? 'soon' : '', tone: '', note: '',
    ...(change ? change(a, d) : {}),
  };
  return {
    when: d,
    html: row({
      href: openHref(a), tone: look.tone, title: a.title,
      sub: esc(cls(a.classroom_id).name) + look.note,
      date: look.date, small: look.small, dateTone: look.dateTone,
    }),
  };
}

/** What a staff row says about itself under the class name. */
function staffNotes(a) {
  const bits = [esc(cls(a.classroom_id).name)];
  bits.push(a.visibility === 'class' ? `${a.submitted_count}/${a.student_count} turned in` : 'Staff only');
  if (a.assigned_to_me) bits.push(`<span class="gitem__you">Yours</span>`);
  if (a.unassigned) bits.push(warn('No TA yet'));
  return bits.join(dot);
}

const RISK_TONE = { done: 'done', overdue: 'late' };

function staffItem(a) {
  const d = toDate(a.due_at);
  const isDone = a.risk === 'done';
  const tone = RISK_TONE[a.risk] || '';
  return {
    when: d,
    html: row({
      href: openHref(a), tone, title: a.title, sub: staffNotes(a),
      date: isDone ? 'Done' : dateText(d),
      small: isDone ? `Due ${dateText(d)}` : timeText(d),
      dateTone: tone || (soon(d) ? 'soon' : ''),
    }),
  };
}

/** A staff task's own due date, or null. A dated task is due at the end of that day. */
function taskDue(t) {
  if (!t.due_date) return null;
  const d = fromYmd(t.due_date);
  d.setHours(END_OF_DAY.hour, END_OF_DAY.minute);
  return d;
}

function taskItem(t) {
  const d = taskDue(t);
  const late = Boolean(d && d < new Date());
  const status = TASK_STATUS[t.status] || TASK_STATUS.open;
  return {
    when: d,
    html: row({
      href: `admin.html?id=${t.classroom_id}&tab=tasks`, icon: 'task', tone: late ? 'late' : 'task',
      title: t.title,
      sub: `${esc(cls(t.classroom_id).name)}${dot}Staff task${dot}${status}`,
      date: d ? dateText(d) : 'No due date',
      dateTone: late ? 'late' : (d && soon(d) ? 'soon' : ''),
    }),
  };
}

/* ---------- sections ---------- */

/** One week section: its heading, its count, and whether it starts open. */
function sectionBlock(name, list, backward) {
  const sorted = [...list].sort((x, y) => ((x.when || 0) - (y.when || 0)) * (backward ? -1 : 1));
  const key = `${state.role}.${state.tab}.${name}`;
  const open = key in state.open ? state.open[key] : SECTIONS[name].open;
  return `
      <section class="gsec ${open ? 'is-open' : ''}" data-key="${key}">
        <button class="gsec__head" type="button" aria-expanded="${open}">
          <span class="gsec__label">${SECTIONS[name].label}</span>
          <span class="gsec__n">${sorted.length}</span>
          <span class="gsec__chev">${ICON.chevron}</span>
        </button>
        <div class="gsec__body">${sorted.map(i => i.html).join('')}</div>
      </section>`;
}

function sections(items, order, emptyText) {
  if (!items.length) return emptyBlock(emptyText);
  const groups = groupBy(items, it => bucket(it.when));
  const backward = order === BACKWARD;
  return order
    .filter(name => groups.has(name))
    .map(name => sectionBlock(name, groups.get(name), backward))
    .join('');
}

/* ---------- the tabs ---------- */

/** The student's assignments the filters allow through. */
const studentWork = () => state.data.student.assignments.filter(a => keep(a.classroom_id, a.title, a.topic));

function studentTab() {
  const all = studentWork();
  if (state.tab === 'missing') {
    return sections(all.filter(a => a.risk === 'overdue' || a.risk === 'closed').map(studentItem), FORWARD,
      'Nothing missing. Nice work.');
  }
  if (state.tab === 'done') {
    return sections(all.filter(a => a.risk === 'submitted').map(studentItem), BACKWARD, 'Nothing turned in yet.');
  }
  return sections(all.filter(a => a.risk === 'ok' || a.risk === 'duesoon').map(studentItem), FORWARD,
    'No work due. You are all caught up.');
}

function staffTab() {
  const all = state.data.staff.assignments.filter(a => keep(a.classroom_id, a.title, a.topic));
  const tasks = state.data.staff.tasks.filter(t => keep(t.classroom_id, t.title, 'staff task'));
  const dayStart = startOfToday();
  const taskIsLate = (t) => Boolean(t.due_date) && fromYmd(t.due_date) < dayStart;

  if (state.tab === 'late') {
    return sections([
      ...all.filter(a => a.risk === 'overdue').map(staffItem),
      ...tasks.filter(taskIsLate).map(taskItem),
    ], FORWARD, 'Nothing late in your classes.');
  }
  if (state.tab === 'done') {
    return sections(all.filter(a => a.risk === 'done').map(staffItem), BACKWARD, 'Nothing marked Done this week.');
  }
  // Open: everything not Done that is still ahead, and my staff tasks not yet late.
  const now = new Date();
  return sections([
    ...all.filter(a => a.risk !== 'done' && toDate(a.due_at) >= now).map(staffItem),
    ...tasks.filter(t => !taskIsLate(t)).map(taskItem),
  ], FORWARD, 'Nothing open in your classes.');
}

/* ---------- the schedule tab ---------- */

/** Events in the classes I hold this role in, after the filters. */
function scheduleEvents() {
  const ids = new Set(mySide().map(c => c.id));
  return state.data.events.filter(e => ids.has(e.classroom_id)
    && keep(e.classroom_id, e.title, e.place, KIND_LABEL[e.kind]));
}

/** A room is worth showing; a meeting link is not, because it is unreadable. */
const placeText = (place) => (place && !/^https?:/i.test(place) ? ' · ' + esc(place) : '');

function eventRow(e) {
  const time = e.start_time ? esc(e.start_time + (e.end_time ? '–' + e.end_time : '')) : 'All day';
  const mine = e.mine && state.role === 'staff' ? ' · You run this' : '';
  return `
          <a class="tl-item tl-item--${e.kind} gtodo__ev" href="timeline.html?id=${e.classroom_id}">
            <div class="tl-item__time">${time}</div>
            <div class="tl-item__body">
              <div class="tl-item__title">${esc(e.title)}</div>
              <div class="tl-item__sub">${esc(cls(e.classroom_id).name)}${placeText(e.place)}${mine}</div>
            </div>
            <div class="tl-item__side"><span class="tl-tag tl-tag--${e.kind}">${KIND_LABEL[e.kind]}</span></div>
          </a>`;
}

function dayBlock(date, list, today) {
  const d = fromYmd(date);
  const isToday = date === today;
  return `
      <div class="tl-day ${isToday ? 'is-today' : ''}">
        <div class="tl-day__date">
          <span class="tl-day__num">${d.getDate()}</span>
          <span class="tl-day__name">${DAYS[d.getDay()]}${isToday ? ' · Today' : ''}</span>
        </div>
        <div class="tl-day__items">${list.map(eventRow).join('')}</div>
      </div>`;
}

/** Schedule: the next two weeks, in the Schedule page's list. */
function scheduleTab() {
  const events = scheduleEvents();
  if (!events.length) {
    return emptyBlock(`Nothing scheduled in the next ${state.data.schedule_days} days.`);
  }
  const today = ymd(new Date());
  const days = groupBy(events, e => e.date);
  return `<div class="timeline gtodo__sched">${
    [...days].map(([date, list]) => dayBlock(date, list, today)).join('')}</div>`;
}

/* ---------- drawing ---------- */

function renderTabs() {
  $('tabs').innerHTML = TABS[state.role].map(([key, label]) =>
    `<button class="gtab ${key === state.tab ? 'is-on' : ''}" type="button" role="tab" data-tab="${key}">${label}</button>`).join('');
  $('roleTabs').querySelectorAll('[data-role]').forEach(b => b.classList.toggle('is-on', b.dataset.role === state.role));
  renderClassPicker();
}

/** The All classes filter. A class that is not on this side cannot stay selected. */
function renderClassPicker() {
  const options = mySide();
  const stillThere = options.some(c => String(c.id) === String(state.classId));
  if (state.classId !== 'all' && !stillThere) state.classId = 'all';
  $('classPick').innerHTML = `<option value="all">All classes</option>` +
    options.map(c =>
      `<option value="${c.id}" ${String(c.id) === String(state.classId) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

/** Picks the body for the tab that is showing. */
function tabBody() {
  if (state.tab === 'schedule') return scheduleTab();
  return state.role === 'staff' ? staffTab() : studentTab();
}

function render() {
  renderTabs();
  $('list').innerHTML = tabBody();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ role: state.role, tab: state.tab }));
  } catch {
    /* a private window refuses storage; the page still works, it just forgets */
  }
}

/* ---------- events ---------- */

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  state.tab = b.dataset.tab;
  save();
  render();
});

$('roleTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-role]');
  if (!b || b.dataset.role === state.role) return;
  state.role = b.dataset.role;
  state.tab = TABS[state.role][0][0];
  save();
  render();
});

$('classPick').addEventListener('change', (e) => { state.classId = e.target.value; render(); });
$('search').addEventListener('input', (e) => { state.search = e.target.value; render(); });

$('list').addEventListener('click', (e) => {
  const head = e.target.closest('.gsec__head');
  if (!head) return;
  const sec = head.closest('.gsec');
  const open = !sec.classList.contains('is-open');
  sec.classList.toggle('is-open', open);
  head.setAttribute('aria-expanded', open);
  state.open[sec.dataset.key] = open;
});

/* ---------- start ---------- */

/** Files the classes into state, and reports which sides the person has.
    A class is a student class or a staff class; somebody can have both. */
function indexClasses(classes) {
  classes.forEach(c => state.classes.set(c.id, {
    id: c.id,
    name: c.name,
    code: c.subject_code || '',
    side: STAFF_ROLES.includes(c.role) ? 'staff' : 'student',
  }));
  return new Set([...state.classes.values()].map(c => c.side));
}

function showNoClasses() {
  $('todo').innerHTML = `<div class="empty"><strong>No classes yet</strong>
        Join a class with its code on <a href="my-classrooms.html">My Classrooms</a>, and its work shows here.</div>`;
}

/** Reads back the role and tab this browser was last on, ignoring anything
    that no longer applies - a saved staff tab is useless after leaving the role. */
function restorePreferences(sides) {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    saved = {};
  }
  state.role = sides.has(saved.role) ? saved.role : (sides.has('student') ? 'student' : 'staff');
  state.tab = TABS[state.role].some(([k]) => k === saved.tab) ? saved.tab : TABS[state.role][0][0];
}

function showLoadFailed(err) {
  $('list').innerHTML = `<div class="empty"><strong>Could not load your to-do</strong>${esc(err.message)}</div>`;
}

async function start() {
  try {
    state.data = await API.get('/todo?from=' + ymd(new Date()));
    const sides = indexClasses(state.data.classes);
    if (!sides.size) {
      showNoClasses();
      return;
    }
    $('roleTabs').hidden = sides.size < 2;
    restorePreferences(sides);
    render();
    setInterval(render, REFRESH_MS);   // keeps "This week" and the colours right on an open page
  } catch (err) {
    showLoadFailed(err);
  }
}

start();
