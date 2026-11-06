const { q, one } = require('./db');

/* Chat (US-12, US-13), two channels per classroom:
     class - Chat: every member of the class, students included
     staff - Staff chat in the Admin panel: the lecturer, TAs and University
             staff only; the route refuses anyone else (SRS-18)
   Same rules for both: each message keeps its author and the time of sending
   (SRS-19), the list runs oldest to newest, and an open chat picks up new
   messages without a reload (SRS-20).

   The page asks every few seconds with the newest id it has and the server
   time of its last ask, and gets back only what changed: new messages, and
   the ids of messages deleted since then. */

const CHANNELS = ['class', 'staff'];
const BODY_MAX = 2000;
const FIRST_LOAD = 200;     // how far back a freshly opened chat goes

/** One message as the page needs it. A deleted message keeps its place but loses its text. */
function shape(m, req) {
  const mine = m.author_id === req.session.user.id;
  return {
    id: m.id,
    body: m.deleted_at ? null : m.body,
    created_at: m.created_at,
    deleted: !!m.deleted_at,
    author_id: m.author_id,
    author_name: m.author_name,
    author_role: m.author_role || null,          // null once they have left the class
    mine,
    can_delete: !m.deleted_at && (mine || req.isOwner),
  };
}

const SELECT = `
  SELECT s.id, s.body, s.created_at, s.deleted_at, s.author_id,
         u.name AS author_name, m.role AS author_role
    FROM chat_messages s
    JOIN users u ON u.id = s.author_id
    LEFT JOIN memberships m ON m.classroom_id = s.classroom_id AND m.user_id = s.author_id`;

/** The server's clock, as the next ask's "since". */
const serverNow = async () => (await one("SELECT DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s') AS now")).now;

/** Builds the three handlers for one channel. */
function channel(name) {
  if (!CHANNELS.includes(name)) throw new Error('Unknown chat channel ' + name);

  /**
   * GET  ...[?after=<id>&since=<time>]
   * No after: the latest messages, oldest first. With after: only the
   * messages newer than that id, plus the ids deleted at or after `since`.
   */
  async function list(req, res) {
    const now = await serverNow();
    const after = Number(req.query.after);

    if (!after) {
      const rows = await q(
        `SELECT * FROM (${SELECT} WHERE s.classroom_id = ? AND s.channel = ? ORDER BY s.id DESC LIMIT ${FIRST_LOAD}) t
          ORDER BY t.id ASC`, [req.params.id, name]);
      return res.json({ messages: rows.map(r => shape(r, req)), deleted: [], now });
    }

    const rows = await q(`${SELECT} WHERE s.classroom_id = ? AND s.channel = ? AND s.id > ? ORDER BY s.id ASC`,
      [req.params.id, name, after]);
    const since = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(String(req.query.since || '')) ? req.query.since : now;
    const gone = await q(
      'SELECT id FROM chat_messages WHERE classroom_id = ? AND channel = ? AND deleted_at >= ? AND id <= ?',
      [req.params.id, name, since, after]);
    res.json({ messages: rows.map(r => shape(r, req)), deleted: gone.map(g => g.id), now });
  }

  /** POST  { body } - saved with its author and time, set by the server. Empty is refused. */
  async function send(req, res) {
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Type a message first' });
    if (body.length > BODY_MAX) return res.status(400).json({ error: `Keep a message under ${BODY_MAX} characters` });

    const r = await q(
      'INSERT INTO chat_messages (classroom_id, channel, author_id, body, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
      [req.params.id, name, req.session.user.id, body]);
    const row = await one(`${SELECT} WHERE s.id = ?`, [r.insertId]);
    res.status(201).json({ message: shape(row, req) });
  }

  /**
   * DELETE .../:messageId - the person who sent it, or the lecturer. The text
   * is wiped and the message shows as deleted for everyone at their next update.
   */
  async function remove(req, res) {
    const m = await one(
      'SELECT id, author_id, deleted_at FROM chat_messages WHERE id = ? AND classroom_id = ? AND channel = ?',
      [req.params.messageId, req.params.id, name]);
    if (!m || m.deleted_at) return res.status(404).json({ error: 'Message not found' });
    if (m.author_id !== req.session.user.id && !req.isOwner) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }
    await q('UPDATE chat_messages SET body = NULL, deleted_at = UTC_TIMESTAMP() WHERE id = ?', [m.id]);
    res.json({ ok: true, id: m.id });
  }

  return { list, send, remove };
}

module.exports = { classChat: channel('class'), staffChat: channel('staff'), BODY_MAX };
