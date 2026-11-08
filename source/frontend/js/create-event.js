/* ==========================================================================
   Add to schedule / Edit (US-17)
   A lab session, consultation or milestone: a title and a date are required.
   With times it runs from Start (to End, if given); ticked All day it has no
   times. It can say where it is (a room or a link) and who runs it - the
   lecturer, a TA or University staff of this class. The server checks all of
   this again, and only the teaching team can save.
   ========================================================================== */

const params = new URLSearchParams(location.search);
const classroomId = params.get('id');
const editingId = params.get('edit');
const $ = (id) => document.getElementById(id);
const api = `/classrooms/${classroomId}/timeline`;
let back = `timeline.html?id=${classroomId}`;
try { if (localStorage.getItem('ku.schedule.view') === 'month') back += '&view=month'; } catch (e) { /* not remembered */ }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE_LABEL = { lecturer: 'Lecturer', ta: 'TA', staff: 'University Staff' };

let kind = 'lab';
let saving = false;

/* ---------- type and all day ---------- */

function setKind(next, { fromUser = false } = {}) {
  kind = next;
  $('kindPick').querySelectorAll('.seg__btn').forEach(b => b.classList.toggle('is-on', b.dataset.kind === next));
  // A new milestone is usually a whole day (demo day, hand-in day); labs and consultations have times.
  if (fromUser && !editingId) setAllDay(next === 'milestone' && !$('start').value);
}
$('kindPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (b) setKind(b.dataset.kind, { fromUser: true });
});

function setAllDay(on) {
  $('allDay').checked = on;
  $('start').disabled = on;
  $('end').disabled = on;
  if (on) { $('start').value = ''; $('end').value = ''; clearError('f-start'); clearError('f-end'); }
}
$('allDay').addEventListener('change', () => setAllDay($('allDay').checked));

/* ---------- checking ---------- */

function markError(fieldId, on) {
  $(fieldId).classList.toggle('is-error', on);
  const input = $(fieldId).querySelector('.input');
  if (input) input.classList.toggle('is-error', on);
}
const clearError = (fieldId) => markError(fieldId, false);
// Date and time boxes may only fire change, so listen for both.
['title', 'date', 'start', 'end'].forEach(id => ['input', 'change'].forEach(ev =>
  $(id).addEventListener(ev, () => { clearError('f-' + id); if (id === 'start') clearError('f-end'); })));

function check() {
  const title = $('title').value.trim();
  const date = $('date').value;
  const start = $('start').value;
  const end = $('end').value;
  const allDay = $('allDay').checked;
  const errs = {
    'f-title': !title,
    'f-date': !date,
    'f-start': !allDay && !start,
    'f-end': !allDay && !!end && !!start && end <= start,
  };
  Object.entries(errs).forEach(([f, bad]) => markError(f, bad));
  if (errs['f-title']) return 'Give it a title';
  if (errs['f-date']) return 'Pick a date';
  if (errs['f-start']) return 'Add a start time, or tick All day';
  if (errs['f-end']) return 'The end time must be after the start time';
  return null;
}

/* ---------- saving ---------- */

$('eventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (saving) return;
  const problem = check();
  if (problem) return KU.toast(problem);

  const allDay = $('allDay').checked;
  const body = {
    kind,
    title: $('title').value.trim(),
    date: $('date').value,
    start_time: allDay ? null : $('start').value,
    end_time: allDay ? null : ($('end').value || null),
    place: $('place').value.trim(),
    host_id: $('host').value || null,
    notes: $('notes').value.trim(),
  };
  saving = true;
  $('saveEvent').disabled = true;
  try {
    if (editingId) await API.put(`${api}/${editingId}`, body);
    else await API.post(api, body);
    KU.toast(editingId ? 'Saved' : 'Added to the schedule');
    setTimeout(() => location.href = back, 700);
  } catch (err) {
    KU.toast(err.message);
    saving = false;
    $('saveEvent').disabled = false;
  }
});

$('deleteEvent').addEventListener('click', async () => {
  if (!confirm('Delete this from the schedule?')) return;
  try {
    await API.del(`${api}/${editingId}`);
    KU.toast('Deleted');
    setTimeout(() => location.href = back, 700);
  } catch (err) {
    KU.toast(err.message);
  }
});

/* ---------- start ---------- */

(async () => {
  if (!classroomId) return;
  $('cancelLink').href = back;
  $('announcementsLink').href = 'announcements.html?id=' + classroomId;
  $('assignmentLink').href = 'class-schedule.html?id=' + classroomId;
  $('membersLink').href = 'members.html?id=' + classroomId;
  try {
    const { classroom } = await API.get('/classrooms/' + classroomId);
    showClassHeader(classroom);
    if (!['lecturer', 'ta', 'staff'].includes(classroom.role)) {
      $('eventForm').innerHTML = `<div class="empty"><strong>Staff only</strong>
        Only the lecturer, TAs and University staff can add to the schedule.
        <p><a href="${back}">Back to the schedule</a></p></div>`;
      return;
    }
    const { events, staff } = await API.get(api);
    $('host').insertAdjacentHTML('beforeend', staff.map(s =>
      `<option value="${s.id}">${esc(s.name)} (${esc(ROLE_LABEL[s.role] || s.role)})</option>`).join(''));

    const ev = editingId ? events.find(x => String(x.id) === editingId) : null;
    if (editingId && !ev) KU.toast('That item is not on the schedule any more');
    if (ev && !ev.can_edit) {
      $('eventForm').innerHTML = `<div class="empty"><strong>You can't edit this one</strong>
        Only whoever added it, or the lecturer, can change it.
        <p><a href="${back}">Back to the schedule</a></p></div>`;
      return;
    }
    if (ev) {
      $('formTitle').textContent = 'Edit schedule item';
      $('saveEvent').textContent = 'Save';
      document.title = 'Edit schedule item · KU Classroom';
      setKind(ev.kind);
      $('title').value = ev.title;
      $('date').value = ev.date;
      setAllDay(!ev.start_time);
      $('start').value = ev.start_time || '';
      $('end').value = ev.end_time || '';
      $('place').value = ev.place || '';
      $('host').value = ev.host_id ? String(ev.host_id) : '';
      $('notes').value = ev.notes || '';
      $('deleteEvent').hidden = !ev.can_delete;     // same people as edit
    } else {
      // A date from the link (?date=YYYY-MM-DD), otherwise today.
      const d = new Date();
      $('date').value = params.get('date')
        || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    $('title').focus();
  } catch (err) {
    KU.toast(err.message);
  }
})();
