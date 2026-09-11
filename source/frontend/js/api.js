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

  /** Multipart upload (file submissions). */
  const upload = (path, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request(path, { method: 'POST', body: fd });
  };

  return { get, post: send('POST'), patch: send('PATCH'), del: send('DELETE'), upload };
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
