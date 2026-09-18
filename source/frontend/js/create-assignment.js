/* ==========================================================================
   Create Assignment (US-5)
   Title and due date are required. "Publish" makes it visible to the class,
   "Save as Draft" keeps it staff-only until someone posts it.
   ========================================================================== */

const classroomId = new URLSearchParams(location.search).get('id');
const backToClass = 'class-schedule.html?id=' + classroomId;

let saving = false;   // stops a double click creating two assignments

/** Fills the subtitle under the page title with the classroom's name. */
async function loadClassroom() {
  const { classroom } = await API.get('/classrooms/' + classroomId);
  document.getElementById('classSub').textContent =
    (classroom.subject_code ? classroom.subject_code + ' ' : '') + classroom.name;
}

/** Only TAs of this classroom can be given an assignment. Tick as many as you like. */
async function loadStaff() {
  const { members } = await API.get(`/classrooms/${classroomId}/members`);
  const tas = members.filter(m => m.role === 'ta');
  const host = document.getElementById('staffPicker');

  if (!tas.length) {
    host.innerHTML = '<div class="picker__empty">No TAs in this classroom yet. ' +
                     'Promote someone on the Members page first.</div>';
    return;
  }

  host.innerHTML = tas.map(m => `
    <label class="picker__item">
      <input type="checkbox" value="${m.id}">
      <span class="picker__name">${m.name}</span>
      <span class="picker__mail">${m.email}</span>
    </label>`).join('');
}

/** The ids of everyone ticked. */
function pickedStaff() {
  return [...document.querySelectorAll('#staffPicker input:checked')]
    .map(box => Number(box.value));
}

/** Marks a field red and returns false, so the caller can collect the result. */
function check(fieldId, input, ok) {
  document.getElementById(fieldId).classList.toggle('is-error', !ok);
  input.classList.toggle('is-error', !ok);
  return ok;
}

/**
 * Sends the form. `visibility` is what makes the difference between the two
 * buttons: 'class' is posted for students, 'staff' is a draft only staff see.
 */
async function save(visibility, button) {
  if (saving) return;

  const title = document.getElementById('title');
  const dueDate = document.getElementById('dueDate');
  const dueTime = document.getElementById('dueTime');

  // Leaving the time blank means end of day, same as the staff deadline.
  if (dueDate.value && !dueTime.value) dueTime.value = '23:59';

  const titleOk = check('f-title', title, title.value.trim() !== '');
  const dueOk = check('f-due', dueDate,
    dueDate.value !== '' && /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime.value));

  if (!titleOk || !dueOk) {
    KU.toast('Fill in the required fields before saving');
    return;
  }

  saving = true;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';

  try {
    await API.post(`/classrooms/${classroomId}/assignments`, {
      title: title.value.trim(),
      points: Number(document.getElementById('points').value) || 0,
      description: document.getElementById('description').value.trim() || null,
      due_at: new Date(`${dueDate.value}T${dueTime.value}`).toISOString(),
      staff_ids: pickedStaff(),
      staff_due_at: staffDueISO(),
      staff_note: document.getElementById('staffNote').value.trim() || null,
      visibility,
    });

    KU.toast(visibility === 'class' ? 'Assignment published' : 'Draft saved');
    setTimeout(() => location.href = backToClass, 900);
  } catch (err) {
    KU.toast(err.message);
    saving = false;
    button.disabled = false;
    button.textContent = label;
  }
}

/* ---------- controls ---------- */

document.getElementById('assignmentForm').addEventListener('submit', (e) => {
  e.preventDefault();
  save('class', document.getElementById('publish'));
});

document.getElementById('saveDraft').addEventListener('click', (e) =>
  save('staff', e.currentTarget));

/** The staff deadline is optional - only send one if both halves are filled in. */
function staffDueISO() {
  const date = document.getElementById('staffDue').value;
  const time = document.getElementById('staffTime').value || '23:59';
  if (!date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return new Date(`${date}T${time}`).toISOString();
}

/* The time boxes are plain text so they are always 24-hour, whatever the
   computer's regional settings say. This types the colon in for you. */
['dueTime', 'staffTime'].forEach(id => {
  document.getElementById(id).addEventListener('input', (e) => {
    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    e.target.value = digits.length > 2 ? digits.slice(0, 2) + ':' + digits.slice(2) : digits;
  });
});

// Clear the red state as soon as someone starts fixing the field.
['title', 'dueDate', 'dueTime'].forEach(id => {
  document.getElementById(id).addEventListener('input', (e) => {
    e.target.classList.remove('is-error');
    e.target.closest('.field').classList.remove('is-error');
  });
});

/* ---------- start ---------- */

(async () => {
  if (!classroomId) {
    document.getElementById('classSub').textContent = 'No classroom selected';
    return;
  }

  document.getElementById('cancelLink').href = backToClass;
  document.getElementById('assignmentLink').href = backToClass;
  document.getElementById('membersLink').href = 'members.html?id=' + classroomId;

  try {
    await loadClassroom();
    await loadStaff();
  } catch (err) {
    KU.toast(err.message);
  }
})();
