/* Presentation/accessibility helper for the GAME/QUIZ overlay only.
   Watch mode is intentionally untouched: stream.css/stream.js own it entirely. */
(() => {
  'use strict';
  if (window.__waPlayDesignAttached) return;
  window.__waPlayDesignAttached = true;
  let active = null, returnTo = null, inerted = [];
  const visible = node => node && !node.hidden && node.getClientRects().length;
  const focusables = root => [...root.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(visible);
  function release() {
    inerted.forEach(node => { node.inert = false; }); inerted = [];
    if (active) { active.removeAttribute('aria-modal'); active = null; }
    if (returnTo && returnTo.isConnected && visible(returnTo)) returnTo.focus({preventScroll:true});
    returnTo = null;
  }
  function sync() {
    const next = visible(document.querySelector('#gameWrap')) ? document.querySelector('#gameWrap') : null;
    if (next !== active) {
      release();
      if (!next) return;
      returnTo = document.activeElement;
      active = next;
      next.setAttribute('role','dialog'); next.setAttribute('aria-modal','true');
      next.setAttribute('aria-label','Population games and humanity quiz');
      inerted = [...document.body.children].filter(n => n !== next && !n.inert && !['SCRIPT','STYLE','LINK'].includes(n.tagName));
      inerted.forEach(n => { n.inert = true; });
      const first = next.querySelector('#gmClose');
      if (first) first.focus({preventScroll:true});
    }
    if (!active) return;
    active.querySelectorAll('.qz-name').forEach((input,i) => {
      if (!input.hasAttribute('aria-label')) input.setAttribute('aria-label','Player '+(i+1)+' name');
    });
    const room = active.querySelector('.qz-link');
    if (room && !room.hasAttribute('aria-label')) room.setAttribute('aria-label','Challenge room link');
    if (!active.contains(document.activeElement)) {
      const nextFocus = active.querySelector('#gmNext:not(:disabled)') || active.querySelector('.qz-opt:not(:disabled),.gm-btn:not(:disabled)') || active.querySelector('#qzNext,#gmAgain,#qzNew') || active.querySelector('#gmClose');
      if (nextFocus) nextFocus.focus({preventScroll:true});
    }
  }
  document.addEventListener('keydown',event => {
    if (!active || event.key !== 'Tab') return;
    const list = focusables(active); if (!list.length) return;
    const first = list[0], last = list[list.length-1];
    if (event.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  },true);
  new MutationObserver(sync).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  sync();
})();
