/* Local privacy-page controls only; no analytics events or input collection. */
(() => {
  'use strict';
  const button = document.getElementById('wa-clear');
  const status = document.getElementById('wa-clear-status');
  if (!button || !status) return;
  button.addEventListener('click', () => {
    if (!confirm('Clear known World Alive choices, scores and caches on this device, and reject optional analytics?')) return;
    try {
      const consentKey = 'wa_privacy_consent_v1';
      const keys = Object.keys(localStorage).filter(key => key !== consentKey && /^(wp_|wa_|wb_|worldalive)/i.test(key));
      keys.forEach(key => localStorage.removeItem(key));
      if (window.WAPrivacy) window.WAPrivacy.reject();
      else localStorage.setItem(consentKey, 'denied');
      status.textContent = 'Cleared ' + keys.length + ' known local entries. Kept only a denied analytics preference for this control. Downloads, shared links, other browser storage and data already held by Google are not erased. Use browser site-data controls for a complete local clear.';
    } catch (_) {
      status.textContent = 'Storage is unavailable. Use browser site-data controls. Downloads, shared links and data already held by Google are unchanged.';
    }
  });
})();
