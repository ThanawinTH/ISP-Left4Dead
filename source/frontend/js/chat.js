/* ==========================================================================
   Chat (US-12, US-13) - used by two pages:
     Chat (chat.html)          the whole class, students included
     Admin panel (admin.html)  the staff chat: lecturer, TAs, University staff
   Laid out like LINE: your messages on the right, everyone else's on the
   left, oldest at the top (SRS-20). The server decides who may read and post
   (SRS-18); the page follows its answer.

   New messages show up by themselves: every few seconds the page asks only
   for what changed since its last ask - new messages, and messages someone
   deleted (SRS-20 allows up to 30 seconds; we ask every 3). It does not ask
   while the tab, or the chat itself, is out of sight.
   ========================================================================== */

const classroomId = new URLSearchParams(location.search).get('id');
const $ = (id) => document.getElementById(id);
const box = document.getElementById('chat');
const isStaffChat = box.dataset.api === 'staff-chat';
const base = `/classrooms/${classroomId}/${box.dataset.api}`;
const POLL_MS = 3000;

const ROLE_LABEL = { lecturer: 'Lecturer', ta: 'TA', staff: 'University Staff', student: 'Student' };
const GROUP_MINUTES = 5;      // messages this close together from one person share a name

let messages = [];            // oldest first, as the server sent them
let lastId = 0;               // the newest message we have
let since = null;             // the server's time at our last ask
let timer = null;
let polling = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => String(name || '?').slice(0, 2).toUpperCase();

/* The server keeps UTC times as "YYYY-MM-DD HH:MM:SS" (or ISO); show them in local time. */
const toDate = (v) => new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T') + 'Z');
const timeText = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function dayText(d) {
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const TRASH = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ---------- drawing ---------- */

function bubbleHTML(m, prev) {
  const d = toDate(m.created_at);
  const newDay = !prev || toDate(prev.created_at).toDateString() !== d.toDateString();
  // Same person, a few minutes apart, same day: one name for the group.
  const grouped = !newDay && prev.author_id === m.author_id
    && (d - toDate(prev.created_at)) < GROUP_MINUTES * 60000;
  const role = m.author_role ? ROLE_LABEL[m.author_role] : 'Left the class';

  return `${newDay ? `<div class="chat__day"><span>${esc(dayText(d))}</span></div>` : ''}
    <div class="msg ${m.mine ? 'msg--mine' : ''} ${grouped ? 'msg--grouped' : ''}" data-id="${m.id}">
      ${m.mine ? '' : `<span class="avatar avatar--sm msg__avatar">${grouped ? '' : esc(initials(m.author_name))}</span>`}
      <div class="msg__col">
        ${m.mine || grouped ? '' : `<div class="msg__who">${esc(m.author_name)}
          <span class="msg__role msg__role--${esc(m.author_role || 'gone')}">${esc(role)}</span></div>`}
        <div class="msg__line">
          ${m.deleted
            ? '<div class="msg__bubble msg__bubble--deleted">Message deleted</div>'
            : `<div class="msg__bubble">${esc(m.body)}</div>`}
          <span class="msg__meta">
            ${m.can_delete ? `<button class="msg__del" type="button" data-del="${m.id}" title="Delete message" aria-label="Delete message">${TRASH}</button>` : ''}
            <span class="msg__time">${timeText(d)}</span>
          </span>
        </div>
      </div>
    </div>`;
}

const nearBottom = () => {
  const l = $('msgList');
  return l.scrollHeight - l.scrollTop - l.clientHeight < 80;
};
const toBottom = () => { $('msgList').scrollTop = $('msgList').scrollHeight; $('jumpBtn').hidden = true; };

function render({ stick = true } = {}) {
  const list = $('msgList');
  if (!messages.length) {
    list.innerHTML = `<div class="chat__empty"><strong>No messages yet</strong>
      ${isStaffChat ? 'Start the conversation - cover swaps, marking questions, anything the class should not see.'
                    : 'Say hello - questions about the class are welcome here.'}</div>`;
    return;
  }
  list.innerHTML = messages.map((m, i) => bubbleHTML(m, messages[i - 1])).join('');
  if (stick) toBottom();
}

/* ---------- loading and live updates ---------- */

async function loadFirst() {
  const data = await API.get(base);
  messages = data.messages;
  lastId = messages.length ? messages[messages.length - 1].id : 0;
  since = data.now;
  render();
}

/** Asks only for what changed since the last ask. */
async function poll() {
  if (polling || document.hidden || !box.offsetParent) return;     // tab or chat out of sight
  polling = true;
  try {
    const data = await API.get(`${base}?after=${lastId || 0}&since=${encodeURIComponent(since || '')}`);
    since = data.now;
    let changed = false;
    if (data.deleted.length) {
      messages.forEach(m => {
        if (data.deleted.includes(m.id) && !m.deleted) {
          m.deleted = true; m.body = null; m.can_delete = false; changed = true;
        }
      });
    }
    const fresh = data.messages.filter(m => !messages.some(x => x.id === m.id));
    if (fresh.length) {
      messages.push(...fresh);
      lastId = messages[messages.length - 1].id;
      changed = true;
    }
    if (changed) {
      const stick = nearBottom();
      render({ stick });
      // Reading older messages: don't yank the view, offer a jump instead.
      if (!stick && fresh.some(m => !m.mine)) $('jumpBtn').hidden = false;
    }
  } catch (err) {
    if (err.status === 403) stop();                 // removed from the class or role changed
  } finally {
    polling = false;
  }
}

const start = () => { stop(); timer = setInterval(poll, POLL_MS); };
const stop = () => { if (timer) clearInterval(timer); timer = null; };

document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
window.chatCatchUp = () => { poll(); toBottom(); };      // admin.js, when the chat tab is shown

/* ---------- sending ---------- */

const input = $('msgInput');

function grow() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  $('sendBtn').disabled = !input.value.trim();
}
input.addEventListener('input', grow);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {    // isComposing: Thai/IME typing
    e.preventDefault();
    $('composer').requestSubmit();
  }
});

$('composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = input.value.trim();
  if (!body) return;
  $('sendBtn').disabled = true;
  try {
    const { message } = await API.post(base, { body });
    input.value = '';
    grow();
    if (!messages.some(m => m.id === message.id)) messages.push(message);
    lastId = Math.max(lastId, message.id);
    render();
  } catch (err) {
    KU.toast(err.message);
    $('sendBtn').disabled = false;
  }
  input.focus();
});

/* ---------- deleting ---------- */

$('msgList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-del]');
  if (!btn || !confirm('Delete this message for everyone?')) return;
  try {
    await API.del(`${base}/${btn.dataset.del}`);
    const m = messages.find(x => x.id === Number(btn.dataset.del));
    if (m) { m.deleted = true; m.body = null; m.can_delete = false; }
    render({ stick: false });
  } catch (err) {
    KU.toast(err.message);
  }
});

$('jumpBtn').addEventListener('click', toBottom);
$('msgList').addEventListener('scroll', () => { if (nearBottom()) $('jumpBtn').hidden = true; });

/* ---------- start ---------- */

(async () => {
  if (!classroomId) {
    $('classTitle').textContent = 'No classroom selected';
    return;
  }
  $('announcementsLink').href = 'announcements.html?id=' + classroomId;
  $('assignmentLink').href = 'class-schedule.html?id=' + classroomId;
  $('membersLink').href = 'members.html?id=' + classroomId;

  try {
    const { classroom } = await API.get('/classrooms/' + classroomId);
    showClassHeader(classroom);
    if (isStaffChat && !['lecturer', 'ta', 'staff'].includes(classroom.role)) {
      // Students never get here from the menu; a typed link gets a plain answer.
      box.innerHTML = `<div class="chat__empty"><strong>Staff only</strong>
        The Admin panel is only for the lecturer, TAs and University staff of this class.</div>`;
      return;
    }
    await loadFirst();
    start();
    input.focus();
  } catch (err) {
    $('msgList').innerHTML = `<div class="chat__empty"><strong>Could not open the chat</strong>${esc(err.message)}</div>`;
  }
})();
