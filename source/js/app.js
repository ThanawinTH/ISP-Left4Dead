/* ==========================================================================
   KU Classroom — shared front-end helpers
   ========================================================================== */
const KU = (() => {

  /** Small bottom-centre toast used for demo feedback. */
  let toastTimer;
  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-shown'), 2400);
  }

  /**
   * SRS-2 — generate a join code.
   * The real implementation belongs on the server, which must also check
   * uniqueness among active classrooms before saving.
   */
  function makeJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
    let out = '';
    for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return 'KU-' + out;
  }

  /** Copy text to the clipboard, with a fallback for file:// pages. */
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
  }

  return { toast, makeJoinCode, copy };
})();
