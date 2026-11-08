/* ==========================================================================
   Class schedule (US-17)
   Lab sessions, consultations and milestones in one place, with the
   assignment due dates added, so a student sees everything coming up.
   Two views of the same items:
     List  - by week (Monday to Sunday), then by day. Upcoming shows today
             and later; Past shows what has gone, most recent first.
     Month - a calendar. Pick a day to see its items in full beside it.
   Everyone in the class sees it. The lecturer, TAs and University staff get
   Add to schedule. Edit shows on the items you can change: any item for the
   lecturer, your own for a TA or University staff. The server checks again.
   (Files and the API keep the name "timeline": class-schedule.html is
   already the Assignment page.)
   ========================================================================== */

const classroomId = new URLSearchParams(location.search).get('id');
const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const DAYS_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const KIND_LABEL = { lab: 'Lab', consultation: 'Consultation', milestone: 'Milestone', due: 'Due date' };
const ROLE_LABEL = { lecturer: 'Lecturer', ta: 'TA', staff: 'Staff' };
const CHIPS_PER_DAY = 3;                 // a month cell shows this many, then "+2 more"
const VIEW_KEY = 'ku.schedule.view';     // remembers List or Month, this browser only

const state = {
  items: [], kind: 'all', when: 'upcoming', canAdd: false,
  view: 'list', month: null, selected: null,
};

/* ---------- dates ---------- */

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayYmd = () => ymd(new Date());
const nowHm = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

/** The Monday of the week a date is in. */
function monday(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/** "This week", "Next week", "Last week", or "Nov 16 – 22". */
function weekName(mon) {
  const weeks = Math.round((mon - monday(new Date())) / (7 * 864e5));
  if (weeks === 0) return 'This week';
  if (weeks === 1) return 'Next week';
  if (weeks === -1) return 'Last week';
  return rangeText(mon);
}
function rangeText(mon) {
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const a = `${MONTHS[mon.getMonth()]} ${mon.getDate()}`;
  const b = sun.getMonth() === mon.getMonth() ? sun.getDate() : `${MONTHS[sun.getMonth()]} ${sun.getDate()}`;
  return `${a} – ${b}`;
}

/* ---------- one list from events and due dates ---------- */

function fromEvent(e) {
  const host = e.host_name ? `${e.host_name}${e.host_role ? ` (${ROLE_LABEL[e.host_role]})` : ''}` : '';
  return { ...e, key: 'e' + e.id, start: e.start_time, end: e.end_time, host };
}

/** An assignment deadline, at the student's local time. */
function fromDue(a) {
  const d = new Date(String(a.due_at).includes('T') ? a.due_at : String(a.due_at).replace(' ', 'T') + 'Z');
  return {
    key: 'a' + a.id, kind: 'due', title: `${a.title} due`, date: ymd(d),
    start: `${pad(d.getHours())}:${pad(d.getMinutes())}`, end: null,
    sub: ['From Assignment', a.topic].filter(Boolean).join(' · '),
  };
}

const sortKey = (i) => `${i.date} ${i.start ? '1' + i.start : '0'}`;   // all day first in a day
const shown = () => state.items
  .filter(i => state.kind === 'all' || i.kind === state.kind)
  .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

/* ---------- one item, as a card ---------- */

const isLink = (s) => /^https?:\/\//i.test(s || '');
const timeText = (i) => (!i.start ? 'All day' : i.end ? `${i.start}–${i.end}` : i.start);
/** Happening right now: today, between its start and end. */
const isNow = (i) => i.date === todayYmd() && i.start && i.end && i.start <= nowHm() && nowHm() < i.end;

function itemHTML(i) {
  const where = i.place
    ? (isLink(i.place) ? `<a href="${esc(i.place)}" target="_blank" rel="noopener">Open link</a>` : esc(i.place))
    : '';
  const sub = i.kind === 'due' ? esc(i.sub) : [where, esc(i.host)].filter(Boolean).join(' · ');
  const action = i.kind === 'due'
    ? `<a class="tl-item__edit" href="class-schedule.html?id=${classroomId}">Open</a>`
    : (i.can_edit ? `<a class="tl-item__edit" href="create-event.html?id=${classroomId}&edit=${i.id}">Edit</a>` : '');
  return `
    <article class="tl-item tl-item--${i.kind} ${isNow(i) ? 'is-now' : ''}">
      <div class="tl-item__time">${esc(timeText(i))}</div>
      <div class="tl-item__body">
        <div class="tl-item__title">${esc(i.title)}</div>
        ${sub ? `<div class="tl-item__sub">${sub}</div>` : ''}
        ${i.notes ? `<div class="tl-item__notes">${esc(i.notes)}</div>` : ''}
      </div>
      <div class="tl-item__side">
        ${isNow(i) ? '<span class="tl-tag tl-tag--now">Now</span>' : ''}
        <span class="tl-tag tl-tag--${i.kind}">${KIND_LABEL[i.kind]}</span>
        ${action}
      </div>
    </article>`;
}

function emptyHTML(title) {
  return `<div class="empty"><strong>${title}</strong>
    ${state.canAdd ? 'Add a lab session, consultation or milestone with Add to schedule.' : 'Anything the teaching team adds shows here.'}</div>`;
}
const kindWord = () => (state.kind === 'all' ? '' : ` ${KIND_LABEL[state.kind].toLowerCase()}s`);

/* ---------- List view ---------- */

function dayHTML(date, items) {
  const d = fromYmd(date);
  const today = date === todayYmd();
  return `
    <div class="tl-day ${today ? 'is-today' : ''}">
      <div class="tl-day__date">
        <span class="tl-day__num">${d.getDate()}</span>
        <span class="tl-day__name">${DAYS[d.getDay()]}${today ? ' · Today' : ''}</span>
      </div>
      <div class="tl-day__items">${items.map(itemHTML).join('')}</div>
    </div>`;
}

function renderList() {
  const today = todayYmd();
  const past = state.when === 'past';
  const list = shown().filter(i => (past ? i.date < today : i.date >= today));
  if (!list.length) {
    $('weeks').innerHTML = emptyHTML(past ? `No past${kindWord()}` : `Nothing${kindWord()} coming up`);
    return;
  }
  // week -> day -> items, kept in order
  const weeks = new Map();
  for (const i of list) {
    const w = ymd(monday(fromYmd(i.date)));
    if (!weeks.has(w)) weeks.set(w, new Map());
    const days = weeks.get(w);
    if (!days.has(i.date)) days.set(i.date, []);
    days.get(i.date).push(i);
  }
  let order = [...weeks.keys()];
  if (past) order = order.reverse();                       // most recent first
  $('weeks').innerHTML = order.map(w => {
    const days = weeks.get(w);
    let dayKeys = [...days.keys()];
    if (past) dayKeys = dayKeys.reverse();
    const count = [...days.values()].reduce((n, x) => n + x.length, 0);
    const mon = fromYmd(w);
    const name = weekName(mon);
    return `
      <section class="tl-week">
        <h2 class="tl-week__head">${esc(name)}
          <span>${name === rangeText(mon) ? '' : `${esc(rangeText(mon))} · `}${count} ${count === 1 ? 'item' : 'items'}</span></h2>
        ${dayKeys.map(d => dayHTML(d, days.get(d))).join('')}
      </section>`;
  }).join('');
}

/* ---------- Month view ---------- */

function renderMonth() {
  const first = state.month;
  $('monthName').textContent = `${MONTHS_LONG[first.getMonth()]} ${first.getFullYear()}`;
  const byDay = new Map();
  for (const i of shown()) {
    if (!byDay.has(i.date)) byDay.set(i.date, []);
    byDay.get(i.date).push(i);
  }

  // Whole weeks, Monday first, from the week the 1st is in to the week the last day is in.
  const start = monday(first);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const cells = [];
  for (const d = new Date(start); d <= last || d.getDay() !== 1; d.setDate(d.getDate() + 1)) cells.push(new Date(d));

  const today = todayYmd();
  $('calGrid').innerHTML = cells.map(d => {
    const key = ymd(d);
    const items = byDay.get(key) || [];
    const chips = items.slice(0, CHIPS_PER_DAY).map(i => `
      <span class="cal-chip cal-chip--${i.kind}" title="${esc(timeText(i) + ' ' + i.title)}">
        ${i.start ? `<b>${esc(i.start)}</b>` : ''}${esc(i.title)}</span>`).join('');
    const more = items.length > CHIPS_PER_DAY ? `<span class="cal-more">+${items.length - CHIPS_PER_DAY} more</span>` : '';
    const cls = ['cal-day',
      d.getMonth() !== first.getMonth() ? 'is-out' : '',
      key === today ? 'is-today' : '',
      key === state.selected ? 'is-selected' : ''].join(' ');
    return `<button class="${cls}" type="button" data-day="${key}"
        aria-label="${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}, ${items.length} ${items.length === 1 ? 'item' : 'items'}">
        <span class="cal-day__num">${d.getDate()}</span>${chips}${more}</button>`;
  }).join('');
  renderDayPanel(byDay.get(state.selected) || []);
}

/** The picked day, in full, beside the calendar. */
function renderDayPanel(items) {
  const d = fromYmd(state.selected);
  const today = state.selected === todayYmd();
  $('dayTitle').textContent = `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}${today ? ' · Today' : ''}`;
  $('dayAdd').hidden = !state.canAdd;
  $('dayAdd').href = `create-event.html?id=${classroomId}&date=${state.selected}`;
  $('dayItems').innerHTML = items.length
    ? items.map(itemHTML).join('')
    : `<div class="cal-panel__empty">Nothing${kindWord()} on this day.</div>`;
}

function moveMonth(by) {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + by, 1);
  // Keep the picked day inside the month on screen: today if it is there, else the 1st.
  const t = new Date();
  state.selected = (t.getFullYear() === state.month.getFullYear() && t.getMonth() === state.month.getMonth())
    ? todayYmd() : ymd(state.month);
  render();
}

/* ---------- drawing and controls ---------- */

function render() {
  const month = state.view === 'month';
  $('weeks').hidden = month;
  $('month').hidden = !month;
  $('whenPick').hidden = month;            // the calendar moves by month instead
  if (month) renderMonth(); else renderList();
}

function pick(groupId, attr, value) {
  $(groupId).querySelectorAll('.seg__btn').forEach(b => b.classList.toggle('is-on', b.dataset[attr] === value));
}
function setView(view) {
  state.view = view === 'month' ? 'month' : 'list';
  pick('viewPick', 'view', state.view);
  try { localStorage.setItem(VIEW_KEY, state.view); } catch (e) { /* not remembered */ }   // the form goes back to it
  try { localStorage.setItem(VIEW_KEY, state.view); } catch (e) { /* private window: just not remembered */ }
  render();
}

$('kindPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  state.kind = b.dataset.kind; pick('kindPick', 'kind', state.kind); render();
});
$('whenPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-when]');
  if (!b) return;
  state.when = b.dataset.when; pick('whenPick', 'when', state.when); render();
});
$('viewPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (b) setView(b.dataset.view);
});
$('prevMonth').addEventListener('click', () => moveMonth(-1));
$('nextMonth').addEventListener('click', () => moveMonth(1));
$('todayBtn').addEventListener('click', () => {
  state.month = firstOfMonth(new Date()); state.selected = todayYmd(); render();
});
$('calGrid').addEventListener('click', (e) => {
  const cell = e.target.closest('[data-day]');
  if (!cell) return;
  state.selected = cell.dataset.day;
  const d = fromYmd(state.selected);
  // A day from next or last month on the grid moves the calendar there.
  if (d.getMonth() !== state.month.getMonth()) state.month = firstOfMonth(d);
  render();
});

/* ---------- start ---------- */

(async () => {
  if (!classroomId) { $('classTitle').textContent = 'No classroom selected'; return; }
  $('announcementsLink').href = 'announcements.html?id=' + classroomId;
  $('assignmentLink').href = 'class-schedule.html?id=' + classroomId;
  $('membersLink').href = 'members.html?id=' + classroomId;
  $('addEvent').href = 'create-event.html?id=' + classroomId;
  state.month = firstOfMonth(new Date());
  state.selected = todayYmd();
  let view = new URLSearchParams(location.search).get('view');
  if (!view) { try { view = localStorage.getItem(VIEW_KEY); } catch (e) { view = null; } }
  state.view = view === 'month' ? 'month' : 'list';
  pick('viewPick', 'view', state.view);
  try { localStorage.setItem(VIEW_KEY, state.view); } catch (e) { /* not remembered */ }   // the form goes back to it
  try {
    const { classroom } = await API.get('/classrooms/' + classroomId);
    showClassHeader(classroom);
    const data = await API.get(`/classrooms/${classroomId}/timeline`);
    state.canAdd = data.can_add;
    $('addEvent').hidden = !data.can_add;
    state.items = [...data.events.map(fromEvent), ...data.due.map(fromDue)];
    render();
    // An open page keeps "Today" and "Now" right without a reload.
    setInterval(render, 60000);
  } catch (err) {
    $('weeks').hidden = false; $('month').hidden = true;
    $('weeks').innerHTML = `<div class="empty"><strong>Could not load the schedule</strong>${esc(err.message)}</div>`;
  }
})();
