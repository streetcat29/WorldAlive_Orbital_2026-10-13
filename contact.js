/* ══════════════════════════════════════════════════════════════════
   CONTACT — edit this block and nothing else.

   Leave any line as '' and that item simply is not rendered, so the
   section degrades cleanly rather than showing a dead link.

   ⚠ TWO RULES, both deliberate:
   1. Do NOT put a work address here. This page is public; a corporate
      mailbox on a public site invites spam and mixes personal work with
      an employer's domain. Use a free dedicated alias you can abandon.
   2. The address is ASSEMBLED IN JAVASCRIPT below and never appears as
      a plain mailto: in the HTML. Scrapers harvest static mailto links;
      most do not run JS. It is not perfect, it is free.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const CONTACT = {
  // split into parts so the finished address is never a literal string
  emailUser: 'theworldalivecom',     // <-- the bit before the @
  emailHost: 'gmail.com',            // the dedicated site inbox
  subject: 'World Alive',

  // optional — set to '' to hide the button entirely
  linkedin: '',                      // e.g. 'https://www.linkedin.com/in/your-handle'
  github: '',                        // e.g. 'https://github.com/your-handle'

  // shown under the heading; keep it short
  blurb: 'Spotted a number that looks wrong, or want to use this data somewhere? ' +
         'I read everything, and corrections are genuinely welcome.'
};

/* ─────────── rendering (no need to touch below this line) ─────────── */
(function () {
  const addr = () => CONTACT.emailUser + String.fromCharCode(64) + CONTACT.emailHost;
  const ready = () => {
    const box = document.getElementById('contactBody');
    if (!box) return;

    const configured = CONTACT.emailHost && CONTACT.emailHost !== 'example.com';
    const btns = [];

    if (configured) {
      btns.push(`<a class="cbtn primary" id="cMail" href="#">` +
        `<span class="ci">✉</span><span><b>Email me</b><em id="cAddr">...</em></span></a>`);
    } else {
      // Say plainly that it is unset rather than shipping a broken mailto to
      // example.com — a dead contact link is worse than none.
      btns.push(`<div class="cbtn todo"><span class="ci">✉</span><span>` +
        `<b>Email not set yet</b><em>add your address in contact.js</em></span></div>`);
    }
    if (CONTACT.linkedin) {
      btns.push(`<a class="cbtn" href="${CONTACT.linkedin}" target="_blank" rel="noopener me">` +
        `<span class="ci">in</span><span><b>LinkedIn</b><em>connect</em></span></a>`);
    }
    if (CONTACT.github) {
      btns.push(`<a class="cbtn" href="${CONTACT.github}" target="_blank" rel="noopener me">` +
        `<span class="ci">&lt;/&gt;</span><span><b>GitHub</b><em>the code</em></span></a>`);
    }

    box.innerHTML = `<p class="cblurb">${CONTACT.blurb}</p>` +
                    `<div class="cbtns">${btns.join('')}</div>`;

    if (configured) {
      // built at click time, so the address is never in the served HTML
      const a = document.getElementById('cMail');
      const shown = document.getElementById('cAddr');
      if (shown) shown.textContent = addr();
      if (a) a.href = 'mailto:' + addr() +
        '?subject=' + encodeURIComponent(CONTACT.subject);
    }
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
