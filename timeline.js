/* ══════════════════════════════════════════════════════════════════
   World Alive — Time machine (1800 → 2100)
   A year slider that recolours the map and rewrites the world figure for
   any year between 1800 and 2100. Data: data/timeline.json (built by
   build_timeline.py — HYDE/Gapminder before 1950, UN WPP 2024 estimates
   1950–2023, UN medium projection 2024–2100). Loaded on first use.

   Integration: app.js exposes S.year; MODES.pop.val asks WPTL.value() when a
   year is set, so colours, legend and tooltips all follow the slider.
   Deep link: #time/1900   ·   Space = play/pause, ← → = step, Esc = exit.
   ══════════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const W = () => window.WP, el = id => document.getElementById(id);
  const nf = new Intl.NumberFormat('en-US'), int = n => nf.format(Math.round(n));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let generation = 0;
  const T = { data: null, loading: null, on: false, year: null, timer: null, speed: 90, wrap: null };

  function load() {
    if (T.data) return Promise.resolve(T.data);
    if (!T.loading) T.loading = fetch('data/timeline.json?v=3c90e721').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(d => { const ys = d && d.years; const series = a => Array.isArray(a) && a.length === ys.length && a.every(v => v === null || typeof v === 'number' && Number.isFinite(v) && v >= 0); if (!Array.isArray(ys) || !ys.length || ys.length > 400 || !ys.every((y,i) => Number.isInteger(y) && y >= 1800 && y <= 2100 && (!i || y > ys[i-1])) || !series(d.world) || !d.countries || Array.isArray(d.countries) || Object.keys(d.countries).length > 300 || !Object.entries(d.countries).every(([iso,a]) => /^[A-Z]{3}$/.test(iso) && series(a)) || !Number.isFinite(d.y0) || !Number.isFinite(d.split) || !Number.isFinite(d.step_pre) || d.step_pre <= 0) throw new Error('Invalid timeline data'); return (T.data = d); }).catch(e => { T.loading = null; throw e; });
    return T.loading;
  }

  /* value of a series at year y — exact where a point exists, linear between 5-year points before 1950 */
  function at(arr, y) {
    const d = T.data, ys = d.years;
    if (y < d.split) {
      const i = Math.floor((y - d.y0) / d.step_pre), y_a = d.y0 + i * d.step_pre;
      const a = arr[i], b = arr[i + 1];
      if (a == null) return null; if (b == null || y_a === y) return a;
      return a + (b - a) * (y - y_a) / d.step_pre;
    }
    const i = ys.indexOf(y); return i >= 0 ? arr[i] : null;
  }
  const value = (iso, y) => { const s = T.data && T.data.countries[iso]; return s ? at(s, y) : null; };
  const world = y => T.data ? at(T.data.world, y) : null;
  const source = y => y < 1950 ? 'HYDE / Gapminder estimate' : y <= 2023 ? 'UN WPP 2024 estimate' : 'UN WPP 2024 medium projection';

  /* ── UI ─────────────────────────────────────────────────────── */
  function shell() {
    return `
      <div class="tl-row">
        <button class="tl-btn" id="tlPlay" title="Play (space)">▶</button>
        <div class="tl-year" id="tlYear">—</div>
        <div class="tl-slider"><input type="range" id="tlRange" min="1800" max="2100" step="1" value="2025" aria-label="Year">
          <div class="tl-ticks"><span>1800</span><span>1850</span><span>1900</span><span>1950</span><span class="now">now</span><span>2050</span><span>2100</span></div></div>
        <div class="tl-world"><em>World population</em><b id="tlWorld">—</b><i id="tlSrc"></i></div>
        <button class="tl-btn ghost" id="tlNow" title="Back to today (Esc)">Back to now ✕</button>
      </div>
      <div class="tl-top" id="tlTop"></div>`;
  }

  function render() {
    const wp = W(), y = T.year, C = wp.S.data.countries;
    el('tlYear').textContent = y;
    const w = world(y);
    el('tlWorld').textContent = w == null ? '—' : int(w);
    el('tlSrc').textContent = source(y) + (y === 2025 || y === 2024 ? ' · live counter above uses World Bank' : '');
    const rows = Object.keys(T.data.countries).map(iso => [iso, value(iso, y)]).filter(x => x[1] != null && C[x[0]])
      .sort((a, b) => b[1] - a[1]).slice(0, 8);
    const now = Object.values(C).filter(c => c.pop).sort((a, b) => b.pop - a.pop).map(c => c.iso3);
    el('tlTop').innerHTML = `<span class="tl-lbl">Largest in ${y}</span>` + rows.map(([iso, v], i) => {
      const c = C[iso], was = now.indexOf(iso) + 1;
      return `<button class="tl-chip" data-iso="${iso}">${wp.fl(c)} <b>${i + 1}</b> ${esc(c.common || c.name)} <em>${wp.short(v)}</em>` +
        (was && was !== i + 1 ? `<i title="rank today">${was < i + 1 ? '▲' : '▼'}#${was}</i>` : '') + `</button>`;
    }).join('');
    el('tlTop').querySelectorAll('.tl-chip').forEach(b => b.onclick = () => wp.openPanel(b.dataset.iso));
    wp.S.year = y; wp.repaint();
    try { history.replaceState(null, '', '#time/' + y); } catch (e) {}
  }

  function setYear(y) { if (!Number.isFinite(y) || !el("tlRange")) return; T.year = Math.max(1800, Math.min(2100, Math.round(y))); el('tlRange').value = T.year; render(); }
  function play() {
    if (T.timer) return pause();
    el('tlPlay').textContent = '❚❚';
    if (T.year >= 2100) setYear(1800);
    T.timer = setInterval(() => { if (T.year >= 2100) return pause(); setYear(T.year + (T.year < 1950 ? 5 : 1)); }, T.speed);
  }
  function pause() { clearInterval(T.timer); T.timer = null; const b = el('tlPlay'); if (b) b.textContent = '▶'; }

  function open(y) {
    const ticket = ++generation; pause();
    const wp = W(); if (!wp || !wp.S || !wp.S.data) return;
    let wrap = el('tlWrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'tlWrap'; wrap.className = 'tlwrap'; const stage = el('mapStage'); stage.parentNode.insertBefore(wrap, stage.nextSibling); }
    wrap.hidden = false; wrap.innerHTML = '<div class="tl-row"><div class="tl-year">...</div><div class="tl-world"><em>loading 1800→2100 series</em></div></div>';
    T.on = true; document.body.classList.add('tl-on');
    const tb = el('btnTime'); if (tb) tb.classList.add('active');
    load().then(() => {
      if (!T.on || ticket !== generation) return;
      wrap.innerHTML = shell();
      wp.setMode('pop');
      el('tlRange').oninput = e => { pause(); setYear(+e.target.value); };
      el('tlPlay').onclick = play;
      el('tlNow').onclick = close;
      setYear(y || 1900);
    }).catch(e => { if (!T.on || ticket !== generation) return; wrap.innerHTML = `<div class="tl-row"><div class="tl-world"><em>Could not load the timeline (${esc(e.message)}).</em></div><button class="tl-btn ghost" id="tlNow">✕</button></div>`; el('tlNow').onclick = close; });
  }
  function close() {
    generation++; pause(); T.on = false; T.year = null;
    const wrap = el('tlWrap'); if (wrap) { wrap.hidden = true; wrap.innerHTML = ''; }
    document.body.classList.remove('tl-on');
    const tb = el('btnTime'); if (tb) tb.classList.remove('active');
    const wp = W(); wp.S.year = null; wp.repaint();
    if (/^#time/.test(location.hash)) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  }

  document.addEventListener('keydown', e => {
    if (!T.on || !T.data) return;
    if (e.key === 'Escape') close();
    else if (e.key === ' ') { e.preventDefault(); play(); }
    else if (e.key === 'ArrowLeft') { pause(); setYear(T.year - 1); }
    else if (e.key === 'ArrowRight') { pause(); setYear(T.year + 1); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    ['btnTime', 'navTime'].forEach(id => { const b = el(id); if (b) b.addEventListener('click', e => { e.preventDefault(); T.on ? close() : open(); }); });
  });

  window.WPTL = { open, close, value, world, source, openHash: raw => { const m = /^time\/(\d{4})$/.exec(raw); open(m ? +m[1] : undefined); }, _T: T };
})();
