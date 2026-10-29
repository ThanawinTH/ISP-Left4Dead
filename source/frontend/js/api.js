/* ==========================================================================
   Tiny wrapper around fetch() for the KU Classroom API.
   Every call sends the session cookie, and a 401 sends you back to sign-in.
   ========================================================================== */
const API = (() => {

  async function request(path, options = {}) {
    const res = await fetch('/api' + path, {
      credentials: 'same-origin',
      ...options,
    });

    if (res.status === 401 && !location.pathname.endsWith('index.html')
        && location.pathname !== '/') {
      location.href = 'index.html';
      throw new Error('Not signed in');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  const get = (path) => request(path);

  const send = (method) => (path, body) => request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

  /** Sends files (and anything else, e.g. links) in one request, so they are
      saved together or not at all. Each file goes as base64 in JSON, under
      its own content type (the server reads it with a bigger size limit). */
  const readBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read ' + file.name));
    r.readAsDataURL(file);
  });

  const sendFiles = async (method, path, files, extra = {}) => {
    const list = await Promise.all(files.map(async f => ({ name: f.name, data: await readBase64(f) })));
    return request(path, {
      method,
      headers: { 'Content-Type': 'application/vnd.ku-upload+json' },
      body: JSON.stringify({ ...extra, files: list }),
    });
  };

  return { get, post: send('POST'), put: send('PUT'), patch: send('PATCH'), del: send('DELETE'), sendFiles };
})();

/* ---------- the page header inside a classroom ----------
   Every class page shows the same thing at the top: the class name, then
   its subject code and semester. */
function showClassHeader(classroom) {
  document.getElementById('classTitle').textContent = classroom.name;
  document.getElementById('classSub').textContent =
    [classroom.subject_code, 'Semester ' + classroom.semester].filter(Boolean).join(' · ');
  document.title = classroom.name + ' · KU Classroom';
}

/* ---------- files, shared by every page that shows or picks them ----------
   PDF, text and pictures open in a new tab, like Google Drive; anything else
   downloads. The server decides the type again, this only picks the link. */
const Files = (() => {
  const VIEWABLE = ['pdf', 'txt', 'png', 'jpg', 'jpeg'];
  const ext = (name) => (String(name).split('.').pop() || '').toLowerCase();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function size(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  const ICON = {
    file: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
    link: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  };

  /** href and attributes for a stored file: open in a new tab, or download. */
  function link(url, name) {
    return VIEWABLE.includes(ext(name))
      ? `href="/api${url}?view=1" target="_blank" rel="noopener"`
      : `href="/api${url}" download`;
  }

  /** One file or link as a row: icon, name, and a size or the site's name. */
  function row(item, url) {
    if (item.kind === 'link') {
      return `<a class="subfile" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
        ${ICON.link}<span class="subfile__text"><span class="subfile__name">${esc(item.url)}</span>
        <span class="subfile__meta">${esc(item.file_name)}</span></span></a>`;
    }
    return `<a class="subfile" ${link(url, item.file_name)}>
      ${ICON.file}<span class="subfile__text"><span class="subfile__name">${esc(item.file_name)}</span>
      <span class="subfile__meta">${size(item.file_size)}</span></span></a>`;
  }

  /** Checks picked files against the server's limits; returns the ones that pass. */
  function accept(picked, current, limits) {
    const ok = [];
    for (const f of picked) {
      if (!limits.types.includes(ext(f.name))) { KU.toast(`${f.name}: that file type is not allowed`); continue; }
      if (!f.size) { KU.toast(`${f.name} is empty`); continue; }
      if (f.size > limits.maxMb * 1024 * 1024) { KU.toast(`${f.name} is larger than ${limits.maxMb} MB`); continue; }
      if ([...current, ...ok].some(x => x.name.toLowerCase() === f.name.toLowerCase())) continue;
      if (current.length + ok.length >= limits.maxFiles) { KU.toast(`Up to ${limits.maxFiles} files`); break; }
      ok.push(f);
    }
    return ok;
  }

  /* The same limits the server uses, for pages that pick files before the
     server has said anything (the assignment and announcement forms). */
  const LIMITS = { maxMb: 10, maxFiles: 10, maxTotalMb: 25, maxLinks: 5,
    types: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'txt', 'png', 'jpg', 'jpeg'] };

  /** A typed link, made into a full http(s) address, or null if it isn't one. */
  function toUrl(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(t) ? t : 'https://' + t);
      return /^https?:$/.test(url.protocol) && url.hostname.includes('.') ? url.href : null;
    } catch { return null; }
  }

  /** The limits in one sentence, for the hint under each upload box. */
  const limitsText = (L) =>
    `Up to ${L.maxFiles} files (${L.maxMb} MB each, ${L.maxTotalMb} MB per save) and ${L.maxLinks} links. ` +
    `Files: ${L.types.join(', ').toUpperCase()}`;

  return { size, link, row, accept, ext, toUrl, limitsText, ICON, LIMITS };
})();

/* ---------- topics on the Assignment page ----------
   The list is split into topics, like Google Classroom. The section with the
   newest assignment is on top, so new work is always first.
   Items without a topic go under "General" (no heading if nothing has one). */
const Topics = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** [{ name, label, items }] - name '' is "no topic". `order` sorts inside a topic. */
  function group(items, order) {
    const map = new Map();
    items.forEach(it => {
      const key = it.topic || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    });
    const label = (name) => name || (map.size > 1 ? 'General' : '');
    return [...map.entries()]
      .map(([name, list]) => ({ name, label: label(name), items: list.sort(order),
                                newest: Math.max(...list.map(i => i.id)) }))
      .sort((x, y) => y.newest - x.newest);
  }

  /** One topic section: a heading with a rule under it, then the items. */
  function section(name, count, word, body, extra = '') {
    const head = name ? `
      <div class="topic__head">
        <h2 class="topic__title">${esc(name)}</h2>
        <span class="topic__count">${count} ${word}${count === 1 ? '' : 's'}</span>${extra}
      </div>` : '';
    return `<section class="topic${name ? '' : ' topic--none'}">${head}${body}</section>`;
  }

  return { group, section };
})();

/* Fill the sidebar with the signed-in user, on every page that has one.
   Clicking the user block signs out. */
document.addEventListener('DOMContentLoaded', async () => {
  const box = document.querySelector('.sidebar__user');
  if (!box) return;
  try {
    const { user } = await API.get('/auth/me');
    const nameEl = box.querySelector('.sidebar__user-name');
    const mailEl = box.querySelector('.sidebar__user-mail');
    const avatar = box.querySelector('.avatar');
    if (nameEl) nameEl.textContent = user.name;
    if (mailEl) mailEl.textContent = user.email;
    if (avatar) avatar.textContent = user.name.slice(0, 2).toUpperCase();

    box.style.cursor = 'pointer';
    box.title = 'Sign out';
    box.addEventListener('click', async () => {
      if (!confirm('Sign out?')) return;
      await API.post('/auth/logout');
      location.href = 'index.html';
    });
  } catch { /* API.get already redirects to the sign-in page on 401 */ }
});
