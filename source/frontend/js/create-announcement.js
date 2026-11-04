/* ==========================================================================
   New Announcement (US-10)
   Its own page, like Create Assignment. Title and message are required;
   files and links are optional and are sent right after the announcement is
   posted. Cancel goes back to Announcements. The server decides who can post
   - a student who opens this page is sent back to the list.
   ========================================================================== */

const classroomId = new URLSearchParams(location.search).get('id');
const backToList = 'announcements.html?id=' + classroomId;
const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let picked = [];        // files chosen, not uploaded yet
let pickedLinks = [];   // links added, not saved yet
let saving = false;     // stops a double click posting twice

function setError(fieldId, on) {
  $(fieldId).classList.toggle('is-error', on);
  $(fieldId).querySelector('.input').classList.toggle('is-error', on);
}

/* ---------- files and links ---------- */

function renderPicked() {
  $('attachList').innerHTML = [
    ...picked.map((f, i) => `
      <div class="attach__row attach__row--new">${Files.ICON.file}
        <span class="attach__name">${esc(f.name)}</span>
        <span class="attach__size">${Files.size(f.size)}</span>
        <button class="attach__x" type="button" data-picked="${i}" aria-label="Remove ${esc(f.name)}">×</button>
      </div>`),
    ...pickedLinks.map((l, i) => `
      <div class="attach__row attach__row--new">${Files.ICON.link}
        <span class="attach__name">${esc(l)}</span>
        <button class="attach__x" type="button" data-picked-link="${i}" aria-label="Remove link">×</button>
      </div>`),
  ].join('') || '<div class="upload__hint">Nothing attached.</div>';
}

$('attachList').addEventListener('click', (e) => {
  const file = e.target.closest('[data-picked]');
  const link = e.target.closest('[data-picked-link]');
  if (file) picked.splice(Number(file.dataset.picked), 1);
  if (link) pickedLinks.splice(Number(link.dataset.pickedLink), 1);
  if (file || link) renderPicked();
});

function addLink() {
  const url = Files.toUrl($('linkInput').value);
  if (!url) return KU.toast('That does not look like a link');
  if (pickedLinks.length >= Files.LIMITS.maxLinks) return KU.toast(`Up to ${Files.LIMITS.maxLinks} links`);
  if (!pickedLinks.includes(url)) pickedLinks.push(url);
  $('linkInput').value = '';
  renderPicked();
}

$('linkBtn').addEventListener('click', addLink);
$('linkInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addLink(); }     // don't post the announcement yet
});
$('attachBtn').addEventListener('click', () => $('attachInput').click());
$('attachInput').addEventListener('change', (e) => {
  picked.push(...Files.accept([...e.target.files], picked, Files.LIMITS));
  e.target.value = '';
  renderPicked();
});

/* ---------- posting ---------- */

async function post(e) {
  e.preventDefault();
  if (saving) return;
  const title = $('title').value.trim();
  const body = $('body').value.trim();

  setError('titleField', !title);
  setError('bodyField', !body);
  if (!title || !body) {
    KU.toast('Fill in the required fields before posting');
    return;
  }

  saving = true;
  $('postBtn').disabled = true;
  $('postBtn').textContent = 'Posting…';
  try {
    const { announcement } = await API.post(`/classrooms/${classroomId}/announcements`, { title, body });
    // The announcement is posted at this point. If the files fail, say so but
    // still go back, so pressing Post again can't make a second one.
    if (picked.length || pickedLinks.length) {
      try {
        await API.sendFiles('POST', `/classrooms/${classroomId}/announcements/${announcement.id}/attachments`,
          picked, { links: pickedLinks });
      } catch (err) {
        KU.toast('Posted, but the files were not: ' + err.message);
        setTimeout(() => location.href = backToList, 2600);
        return;
      }
    }
    KU.toast('Announcement posted');
    setTimeout(() => location.href = backToList, 900);
  } catch (err) {
    KU.toast(err.message);
    saving = false;
    $('postBtn').disabled = false;
    $('postBtn').textContent = 'Post Announcement';
  }
}

$('postForm').addEventListener('submit', post);
['title', 'body'].forEach(id => $(id).addEventListener('input', () => setError(id + 'Field', false)));

/* ---------- start ---------- */

(async () => {
  if (!classroomId) {
    $('classTitle').textContent = 'No classroom selected';
    return;
  }
  // the class menu and Cancel point back at this classroom
  $('cancelLink').href = backToList;
  $('announcementsLink').href = backToList;
  $('assignmentLink').href = 'class-schedule.html?id=' + classroomId;
  $('membersLink').href = 'members.html?id=' + classroomId;

  $('attachHint').textContent = Files.limitsText(Files.LIMITS) + '. Everyone in the class can open them.';
  renderPicked();

  try {
    const { classroom } = await API.get('/classrooms/' + classroomId);
    showClassHeader(classroom);
    const { canPost } = await API.get(`/classrooms/${classroomId}/announcements`);
    if (!canPost) {                          // students only read
      location.replace(backToList);
      return;
    }
    $('title').focus();
  } catch (err) {
    KU.toast(err.message);
  }
})();
