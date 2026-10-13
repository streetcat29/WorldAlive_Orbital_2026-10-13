/* World Alive: BASIC opt-in analytics. No Google tag, queue or pings before grant.
 * Only installer-attested, input-free /about/ and /methodology/ are eligible.
 * This is NOT an advertising CMP. Enhanced Measurement needs owner review.
 */
(() => {
  'use strict';
  if (window.WAPrivacy) return;
  const ID = 'G-5MH4QVCEC5';
  const KEY = 'wa_privacy_consent_v1';
  const LAYER = 'waConsentDataLayer';
  const DISABLE = 'ga-disable-' + ID;
  const source = document.currentScript;
  const routes = Object.freeze({
    '/about/': ['about', 'About World Alive'],
    '/methodology/': ['methodology', 'Sources and methods | World Alive']
  });
  const entryPath = location.pathname;
  const route = Object.prototype.hasOwnProperty.call(routes, entryPath) ? routes[entryPath] : null;
  const attested = !!(route && source && source.dataset.waPage === route[0]);
  let choice = null;
  let tag = null;
  let attempted = false;
  let halted = false;
  let sent = false;
  let returnFocus = null;
  let panel, status, accept, toggle;
  window[DISABLE] = true;

  function signalDenied() {
    return navigator.globalPrivacyControl === true ||
      [navigator.doNotTrack, window.doNotTrack, navigator.msDoNotTrack]
        .some(v => v === '1' || v === 1 || v === 'yes');
  }
  function readChoice() {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'granted' || value === 'denied' ? value : null;
    } catch (_) { return null; }
  }
  function remember(value) {
    try {
      localStorage.setItem(KEY, value);
      return localStorage.getItem(KEY) === value;
    } catch (_) { return false; }
  }
  function eligible() {
    // Exact static paths only. Even query/hash-bearing editorial URLs fail closed:
    // an unverified Google console must not be allowed to auto-capture those URLs.
    return attested && location.pathname === entryPath && !location.search && !location.hash &&
      !document.querySelector('form,input,select,textarea,iframe,[contenteditable]:not([contenteditable="false"])');
  }
  function allowed() {
    return !halted && choice === 'granted' && readChoice() === 'granted' && !signalDenied() && eligible();
  }
  function clearCookies() {
    // Best effort only: JS cannot see HttpOnly or other-origin cookies, or all paths.
    const names = new Set(['_ga', '_ga_5MH4QVCEC5']);
    try {
      document.cookie.split(';').forEach(pair => {
        const name = pair.trim().split('=')[0];
        if (/^_ga(?:_[A-Za-z0-9_-]+)?$/.test(name)) names.add(name);
      });
      const paths = new Set(['/']);
      const parts = location.pathname.split('/').filter(Boolean);
      let path = '';
      parts.forEach(part => { path += '/' + part; paths.add(path); paths.add(path + '/'); });
      const domains = new Set(['']);
      const host = location.hostname;
      if (host && !host.includes(':')) {
        domains.add(host); domains.add('.' + host);
        if (!/^\d+(?:\.\d+){3}$/.test(host)) {
          const labels = host.split('.');
          for (let i = 1; i < labels.length - 1; i++) {
            const domain = labels.slice(i).join('.');
            domains.add(domain); domains.add('.' + domain);
          }
        }
      }
      names.forEach(name => paths.forEach(p => domains.forEach(domain => {
        document.cookie = name + '=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=' + p +
          (domain ? '; Domain=' + domain : '') + '; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
      })));
    } catch (_) { /* Browser site-data controls remain available. */ }
  }
  function discardQueue() {
    if (Array.isArray(window[LAYER])) window[LAYER].length = 0;
    // No continuing producer, event timer, global gtag, or DOM observer is installed.
    try { delete window[LAYER]; } catch (_) { window[LAYER] = undefined; }
  }
  function stop(reload) {
    window[DISABLE] = true;
    halted = true;
    if (tag) { tag.remove(); tag = null; }
    discardQueue();
    clearCookies();
    // Removing a script does not unload code already executed. A full reload does.
    // Do not send consent-update pings on withdrawal. In-flight requests cannot be recalled.
    if (reload && attempted) location.reload();
  }
  function start() {
    if (attempted || !allowed()) return;
    attempted = true;
    window[DISABLE] = false;
    // Avoid the HTTP Referer leaking the URL on any subsequently created requests.
    let referrer = document.querySelector('meta[name="referrer"]');
    if (!referrer) { referrer = document.createElement('meta'); referrer.name = 'referrer'; document.head.append(referrer); }
    referrer.content = 'no-referrer';
    const queue = [];
    window[LAYER] = queue;
    // Private, finite bootstrap only, created AFTER consent; never install window.gtag.
    const command = function () { if (allowed()) queue.push(arguments); };
    command('consent', 'default', {
      analytics_storage: 'granted', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    command('js', new Date());
    command('config', ID, {
      send_page_view: false,
      page_location: location.origin + entryPath,
      page_referrer: '',
      page_title: route[1],
      ignore_referrer: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_path: '/', cookie_domain: 'none', cookie_expires: 2592000,
      cookie_update: false
    });
    if (!sent) {
      command('event', 'page_view', {
        send_to: ID,
        page_location: location.origin + entryPath,
        page_referrer: '', page_title: route[1]
      });
      sent = true;
    }
    tag = document.createElement('script');
    tag.id = 'wa-google-analytics';
    tag.async = true;
    tag.referrerPolicy = 'no-referrer';
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID + '&l=' + LAYER;
    tag.onerror = () => {
      stop(false);
      if (status) status.textContent = 'Analytics could not load. The site still works. Your preference is saved; no retry on this page.';
    };
    document.head.append(tag);
  }
  function describe() {
    if (!status) return;
    const blocked = signalDenied();
    accept.disabled = blocked;
    status.textContent = blocked ? 'Analytics is off: Global Privacy Control or Do Not Track is enabled. This overrides any earlier opt-in.' :
      choice === 'granted' ? 'Preference: analytics allowed on the two eligible editorial pages only. This page ' + (eligible() ? 'is eligible.' : 'is not measured.') :
        'Analytics is off. All site features work without it.';
  }
  function closePanel() {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }
  function show() {
    returnFocus = document.activeElement;
    describe(); panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    panel.querySelector('h2').focus();
  }
  function deny() {
    choice = 'denied';
    const saved = remember('denied');
    describe(); closePanel();
    stop(true);
    if (!saved) {
      panel.hidden = false; toggle.setAttribute('aria-expanded', 'true');
      status.textContent = 'Analytics is off for this page. Storage is unavailable; use browser site-data controls to remove any earlier preference.';
    }
  }
  function grant() {
    if (signalDenied()) { deny(); return; }
    if (!remember('granted')) {
      choice = null; stop(false);
      status.textContent = 'Storage is unavailable, so analytics stays off. All features still work.';
      return;
    }
    choice = 'granted'; describe(); closePanel();
    if (halted && attempted) { location.reload(); return; }
    halted = false; start();
  }
  function checkPreference() {
    const stored = readChoice();
    if (signalDenied()) {
      if (stored === 'granted') remember('denied');
      choice = 'denied'; stop(true);
    } else if (stored !== choice || (attempted && !eligible())) {
      choice = stored;
      if (attempted) stop(true);
      // A grant in another tab does not silently start this document.
    }
    describe();
  }
  choice = readChoice();
  if (signalDenied()) { choice = 'denied'; if (readChoice() === 'granted') remember('denied'); }
  if (choice !== 'granted' || !eligible()) clearCookies();
  window.WAPrivacy = Object.freeze({ open: show, reject: deny, key: KEY });

  const mount = () => {
    let footer = document.querySelector('body > footer');
    if (!footer) { footer = document.createElement('footer'); footer.className = 'wa-privacy-footer'; document.body.append(footer); }
    const holder = document.createElement('div');
    holder.className = 'wa-privacy-controls';
    toggle = document.createElement('button');
    toggle.type = 'button'; toggle.id = 'wa-privacy-choices'; toggle.textContent = 'Privacy choices';
    toggle.setAttribute('aria-controls', 'wa-consent-panel'); toggle.setAttribute('aria-expanded', 'false');
    panel = document.createElement('section'); panel.id = 'wa-consent-panel'; panel.hidden = true;
    panel.setAttribute('aria-labelledby', 'wa-consent-heading');
    const heading = document.createElement('h2'); heading.id = 'wa-consent-heading'; heading.tabIndex = -1; heading.textContent = 'Optional analytics';
    const text = document.createElement('p');
    text.textContent = 'Allow Google Analytics cookies on About and Sources & methods only? No analytics runs on the homepage, Watch or personal experiences. Rejecting is equally easy and does not affect features. Advertising stays off.';
    const actions = document.createElement('div'); actions.className = 'wa-consent-actions';
    const reject = document.createElement('button'); reject.type = 'button'; reject.id = 'wa-consent-reject'; reject.textContent = 'Reject analytics';
    accept = document.createElement('button'); accept.type = 'button'; accept.id = 'wa-consent-accept'; accept.textContent = 'Allow analytics';
    const policy = document.createElement('a'); policy.href = '/privacy/'; policy.textContent = 'Read privacy policy';
    status = document.createElement('p'); status.id = 'wa-consent-status'; status.setAttribute('role', 'status');
    actions.append(reject, accept); panel.append(heading, text, actions, policy, status); holder.append(toggle, panel); footer.append(holder);
    toggle.addEventListener('click', () => panel.hidden ? show() : closePanel());
    reject.addEventListener('click', deny); accept.addEventListener('click', grant);
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); deny(); } });
    describe();
    // Nonmodal footer prompt only on the two eligible pages; never cover Watch.
    if (choice === null && eligible() && !signalDenied()) { panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); }
    start();
  };
  window.addEventListener('storage', event => { if (event.key === KEY || event.key === null) checkPreference(); });
  window.addEventListener('pageshow', checkPreference);
  window.addEventListener('focus', checkPreference);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkPreference(); });
  // No history patching/config updates or hash/interaction analytics.
  window.addEventListener('hashchange', checkPreference);
  window.addEventListener('popstate', checkPreference);
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
