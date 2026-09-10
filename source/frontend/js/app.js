/* Shared helpers: the little toast at the bottom, and clipboard copy. */
const KU = (() => {
  let timer;

  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-shown');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('is-shown'), 2400);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  return { toast, copy };
})();
