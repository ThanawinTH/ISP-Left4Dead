/* Live character counter, e.g. "37/190", under any text field that has a
   maxlength. The limit is read from the field's own maxlength attribute, so
   it is written in one place - the HTML - and matches the server's limit
   (title 190, message 5000 in announcements.js).
   Usage: put <div class="charcount" data-for="FIELD_ID"></div> after the
   field and load this script. */
(() => {
  const WARN_AT = 0.9;   // turn amber at 90% of the limit

  function attach(field, out) {
    const max = Number(field.getAttribute('maxlength'));
    if (!max || !out) return;
    const update = () => {
      const n = field.value.length;
      const full = n >= max;
      out.textContent = full ? `${n}/${max} · limit reached` : `${n}/${max}`;
      out.classList.toggle('is-near', !full && n >= max * WARN_AT);
      out.classList.toggle('is-full', full);
    };
    field.addEventListener('input', update);
    update();
  }

  document.querySelectorAll('.charcount[data-for]').forEach((out) => {
    attach(document.getElementById(out.dataset.for), out);
  });

  window.CharCount = { attach };
})();
