/* ==========================================================================
   Create Assignment (US-5)
   Title and due date are required. "Publish" makes it visible to the class,
   "Save as Draft" keeps it staff-only until someone posts it.
   ========================================================================== */

const params = new URLSearchParams(location.search);
const classroomId = params.get('id');
const editingId = params.get('edit');          // set when we arrived from Edit
const backToClass = 'class-schedule.html?id=' + classroomId;

let saving = false;   // stops a double click creating two assignments

/* Files for the students. `kept` are already saved (when editing), `added`
   are picked but not uploaded yet, `removed` are saved ones to delete. All of
   it is sent when the form is saved. */
const attach = { kept: [], added: [], links: [], removed: [] };

/** Splits a stored "2026-10-20 23:59:00" into the two boxes on the form. */
function fillDateTime(dateId, timeId, stored) {
  if (!stored) return;
  const [date, time] = String(stored).replace('T', ' ').split(' ');
  document.getElementById(dateId).value = date;
  document.getElementById(timeId).value = (time || '').slice(0, 5);
}

/**
 * When we arrive with ?edit=, load that assignment and put its values in the
 * form. There is no single-assignment endpoint, so we take it from the list.
 */
async function loadForEditing() {
  const { assignments } = await API.get(`/classrooms/${classroomId}/assignments`);
  const a = assignments.find(x => String(x.id) === editingId);
  if (!a) { KU.toast('That assignment no longer exists'); return; }

  document.getElementById('title').value = a.title;
  setTopic(a.topic);
  document.getElementById('points').value = a.points;
  document.getElementById('description').value = a.description || '';
  document.getElementById('staffNote').value = a.staff_note || '';
  fillDateTime('dueDate', 'dueTime', a.due_at);
  fillDateTime('staffDue', 'staffTime', a.staff_due_at);
  attach.kept = a.attachments || [];
  renderAttachments();
  document.getElementById('staffDue').min = document.getElementById('dueDate').value;

  // tick the TAs already on it
  const names = (a.staff_names || '').split(', ').filter(Boolean);
  document.querySelectorAll('#staffPicker input').forEach(box => {
    const label = box.closest('.picker__item').querySelector('.picker__name').textContent;
    box.checked = names.includes(label);
  });

  // the page is an edit form now, so say so
  document.getElementById('formTitle').textContent = 'Edit Assignment';
  document.getElementById('publish').textContent =
    a.visibility === 'class' ? 'Save Changes' : 'Save and Publish';
  document.getElementById('saveDraft').textContent = 'Save as Draft';
}

/** The page header shows the class, like every other class page. */
async function loadClassroom() {
  const { classroom } = await API.get('/classrooms/' + classroomId);
  showClassHeader(classroom);
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

/* ---------- topic ----------
   Picked like the TAs: one row per topic already in this class, plus
   "No topic" and "New topic". Exactly one is chosen. */

let knownTopics = [];

function renderTopics(assignments) {
  const esc = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const count = new Map();
  assignments.forEach(a => { if (a.topic) count.set(a.topic, (count.get(a.topic) || 0) + 1); });
  knownTopics = [...count.keys()].sort((x, y) => x.localeCompare(y));

  document.getElementById('topicPicker').innerHTML = `
    <label class="picker__item">
      <input type="radio" name="topic" value="" checked>
      <span class="picker__name">No topic</span>
    </label>
    ${knownTopics.map(t => `
    <label class="picker__item">
      <input type="radio" name="topic" value="${esc(t)}">
      <span class="picker__name">${esc(t)}</span>
      <span class="picker__mail">${count.get(t)} assignment${count.get(t) === 1 ? '' : 's'}</span>
    </label>`).join('')}
    <label class="picker__item picker__item--new">
      <input type="radio" name="topic" value="" id="topicNew">
      <span class="picker__name">New topic</span>
      <input class="input picker__input" id="topicNewName" maxlength="80" autocomplete="off"
             placeholder="e.g. Homework 8">
    </label>`;

  // Typing a name picks "New topic"; picking "New topic" puts you in the box.
  const name = document.getElementById('topicNewName');
  name.addEventListener('input', () => {
    document.getElementById('topicNew').checked = true;
    name.classList.remove('is-error');
    document.getElementById('f-topic').classList.remove('is-error');
  });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  document.getElementById('topicNew').addEventListener('change', () => name.focus());
}

/** The topic to save: '' for none. A new name that matches an existing topic
    (any capitals) joins that topic instead of making a near-duplicate. */
function chosenTopic() {
  if (!document.getElementById('topicNew').checked) {
    return document.querySelector('#topicPicker input[name="topic"]:checked')?.value || '';
  }
  const typed = document.getElementById('topicNewName').value.replace(/\s+/g, ' ').trim();
  return knownTopics.find(t => t.toLowerCase() === typed.toLowerCase()) || typed;
}

/** Ticks the row for a topic (used when editing). */
function setTopic(topic) {
  const row = [...document.querySelectorAll('#topicPicker input[name="topic"]')]
    .find(r => r.id !== 'topicNew' && r.value === (topic || ''));
  if (row) row.checked = true;
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

  // "New topic" picked, but no name typed for it.
  const topicOk = check('f-topic', document.getElementById('topicNewName'),
    !document.getElementById('topicNew').checked || chosenTopic() !== '');
  if (!topicOk) {
    KU.toast('Type a name for the new topic, or pick another one');
    return;
  }

  // The TA check date can't come before the students' due date (nothing to
  // check yet). The server refuses it too; this just says so sooner.
  const staffDue = staffDueISO();
  const studentDue = new Date(`${dueDate.value}T${dueTime.value}`);
  const staffOk = check('f-staffdue', document.getElementById('staffDue'),
    !staffDue || new Date(staffDue) >= studentDue);
  if (!staffOk) {
    KU.toast("The TA check date can't be before the students' due date");
    return;
  }

  saving = true;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';

  const body = {
    title: title.value.trim(),
    topic: chosenTopic(),
    points: Number(document.getElementById('points').value) || 0,
    description: document.getElementById('description').value.trim() || null,
    due_at: new Date(`${dueDate.value}T${dueTime.value}`).toISOString(),
    staff_ids: pickedStaff(),
    staff_due_at: staffDueISO(),
    staff_note: document.getElementById('staffNote').value.trim() || null,
    visibility,
  };

  try {
    let id = editingId;
    if (editingId) {
      await API.patch(`/classrooms/${classroomId}/assignments/${editingId}`, body);
    } else {
      id = (await API.post(`/classrooms/${classroomId}/assignments`, body)).id;
    }
    // The assignment is saved at this point. If the files fail, say so but
    // still go back, so pressing Save again can't make a second assignment.
    try {
      await saveAttachments(id);
    } catch (err) {
      KU.toast('Assignment saved, but the files were not: ' + err.message);
      setTimeout(() => location.href = backToClass, 2600);
      return;
    }

    KU.toast(editingId ? 'Assignment saved'
           : visibility === 'class' ? 'Assignment published' : 'Draft saved');
    setTimeout(() => location.href = backToClass, 900);
  } catch (err) {
    KU.toast(err.message);
    saving = false;
    button.disabled = false;
    button.textContent = label;
  }
}

/* ---------- attached files ---------- */

const fileBase = `/classrooms/${classroomId}/assignments`;

function renderAttachments() {
  const esc = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  document.getElementById('attachList').innerHTML = [
    ...attach.kept.map((f, i) => f.kind === 'link' ? `
      <div class="attach__row">${Files.ICON.link}
        <a class="attach__name" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.url)}</a>
        <button class="attach__x" type="button" data-kept="${i}" aria-label="Remove link">×</button>
      </div>` : `
      <div class="attach__row">${Files.ICON.file}
        <a class="attach__name" ${Files.link(`/classrooms/${classroomId}/attachments/${f.id}`, f.file_name)}>${esc(f.file_name)}</a>
        <span class="attach__size">${Files.size(f.file_size)}</span>
        <button class="attach__x" type="button" data-kept="${i}" aria-label="Remove ${esc(f.file_name)}">×</button>
      </div>`),
    ...attach.added.map((f, i) => `
      <div class="attach__row attach__row--new">${Files.ICON.file}
        <span class="attach__name">${esc(f.name)}</span>
        <span class="attach__size">${Files.size(f.size)} · new</span>
        <button class="attach__x" type="button" data-added="${i}" aria-label="Remove ${esc(f.name)}">×</button>
      </div>`),
    ...attach.links.map((l, i) => `
      <div class="attach__row attach__row--new">${Files.ICON.link}
        <span class="attach__name">${esc(l)}</span>
        <span class="attach__size">new</span>
        <button class="attach__x" type="button" data-link="${i}" aria-label="Remove link">×</button>
      </div>`),
  ].join('') || '<div class="upload__hint">Nothing attached.</div>';

  document.querySelectorAll('#attachList [data-kept]').forEach(b => b.addEventListener('click', () => {
    attach.removed.push(attach.kept.splice(Number(b.dataset.kept), 1)[0]);
    renderAttachments();
  }));
  document.querySelectorAll('#attachList [data-added]').forEach(b => b.addEventListener('click', () => {
    attach.added.splice(Number(b.dataset.added), 1);
    renderAttachments();
  }));
  document.querySelectorAll('#attachList [data-link]').forEach(b => b.addEventListener('click', () => {
    attach.links.splice(Number(b.dataset.link), 1);
    renderAttachments();
  }));
}

/** Deletes what was taken off, then sends the new files and links in one request. */
async function saveAttachments(id) {
  for (const f of attach.removed) {
    await API.del(`${fileBase}/${id}/attachments/${f.id}`);
  }
  if (attach.added.length || attach.links.length) {
    await API.sendFiles('POST', `${fileBase}/${id}/attachments`, attach.added, { links: attach.links });
  }
}

function addLink() {
  const input = document.getElementById('linkInput');
  const url = Files.toUrl(input.value);
  if (!url) return KU.toast('That does not look like a link');
  const have = attach.kept.filter(f => f.kind === 'link').length + attach.links.length;
  if (have >= Files.LIMITS.maxLinks) return KU.toast(`Up to ${Files.LIMITS.maxLinks} links`);
  if (!attach.links.includes(url)) attach.links.push(url);
  input.value = '';
  renderAttachments();
}
document.getElementById('linkBtn').addEventListener('click', addLink);
document.getElementById('linkInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addLink(); }     // don't submit the whole form
});

document.getElementById('attachBtn').addEventListener('click', () =>
  document.getElementById('attachInput').click());

document.getElementById('attachInput').addEventListener('change', (e) => {
  const L = Files.LIMITS;
  const room = { ...L, maxFiles: L.maxFiles - attach.kept.filter(f => f.kind !== 'link').length };
  attach.added.push(...Files.accept([...e.target.files], attach.added, room));
  e.target.value = '';
  renderAttachments();
});

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

// The date picker for TAs can't go earlier than the students' due date.
document.getElementById('dueDate').addEventListener('change', (e) => {
  document.getElementById('staffDue').min = e.target.value || '2020-01-01';
});

// Clear the red state as soon as someone starts fixing the field.
['title', 'dueDate', 'dueTime', 'staffDue', 'staffTime'].forEach(id => {
  document.getElementById(id).addEventListener('input', (e) => {
    e.target.classList.remove('is-error');
    e.target.closest('.field').classList.remove('is-error');
  });
});

/* ---------- start ---------- */

(async () => {
  if (!classroomId) {
    document.getElementById('classTitle').textContent = 'No classroom selected';
    return;
  }

  document.getElementById('cancelLink').href = backToClass;
  document.getElementById('assignmentLink').href = backToClass;
  document.getElementById('membersLink').href = 'members.html?id=' + classroomId;
  document.getElementById('announcementsLink').href = 'announcements.html?id=' + classroomId;

  const L = Files.LIMITS;
  document.getElementById('attachHint').textContent =
    Files.limitsText(L) + '. Students can open them from the assignment.';
  renderAttachments();

  try {
    await loadClassroom();
    await loadStaff();
    // Topics already used in this class, one row each, like the TA list.
    const { assignments } = await API.get(`/classrooms/${classroomId}/assignments`);
    renderTopics(assignments);
    if (editingId) await loadForEditing();
  } catch (err) {
    KU.toast(err.message);
  }
})();
