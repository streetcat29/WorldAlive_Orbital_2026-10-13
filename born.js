/* ══════════════════════════════════════════════════════════════════
   World Alive — "The world when you were born"
   A personal, shareable read-out: the world (and optionally your country)
   on your birth date versus right now, plus everything that happened in
   between — babies born, people who died, milestones the planet crossed.

   Data: data/born.json (World Bank 1960→latest, built by build_born.py),
   loaded lazily the first time the feature opens. "Now" uses the same live
   projection as the header counter (window.WP.livePop), so both numbers on
   screen always agree.

   Every figure is a MODEL from annual data — the UI says so. Nothing typed
   here leaves the browser; the last query is kept in localStorage only so
   the card re-opens where you left it.

   Deep link: #born/YYYY-MM-DD[/ISO3]   (app.js routes it to WPBORN.openHash)
   ══════════════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const W = () => window.WP;
  const el = id => document.getElementById(id);
  const LS = 'wp_born_v1';
  const SITE = 'https://theworldalive.com/';
  const YEAR_MS = 365.2425 * 86400000;
  const DAY_MS = 86400000;
  const DATA_URL = 'data/born.json?v=9a919a69';
  const MIN_DATE = '1960-01-01';

  const nf = new Intl.NumberFormat('en-US');
  const int = n => nf.format(Math.round(n));
  const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const epoch = y => Date.UTC(y, 6, 1);           // mid-year anchor (UN / WB convention)

  const B = { open: false, data: null, loading: null, t0: null, iso: null, timer: null, res: null };

  /* ── persistence (last query only, so re-opening lands on your card) ─ */
  function remember() {
    if (!el("bnRemember") || !el("bnRemember").checked) { try { localStorage.removeItem(LS); } catch(e) {} return; }
    try { localStorage.setItem(LS, JSON.stringify({ d: isoDate(B.t0), iso: B.iso })); } catch (e) {}
  }
  let generation = 0;
  function profile(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const d = value.d, t = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(d+'T00:00:00Z') : NaN;
    const validDate = Number.isFinite(t) && new Date(t).toISOString().slice(0,10) === d && d >= MIN_DATE && t <= Date.now();
    const iso = value.iso;
    const validISO = typeof iso === 'string' && /^[A-Z]{3}$/.test(iso) && Object.prototype.hasOwnProperty.call(W().S.data.countries, iso) && B.data && Object.prototype.hasOwnProperty.call(B.data.countries, iso);
    return {d:validDate ? d : '', iso:validISO ? iso : null, invalid:!!(d && !validDate || iso && !validISO)};
  }
  function recall() {
    try { const raw = localStorage.getItem(LS); return raw && raw.length <= 1024 ? profile(JSON.parse(raw)) : {invalid:!!raw}; } catch (_) { return {invalid:true}; }
  }

  /* ── data ─────────────────────────────────────────────────────── */
  function loadData() {
    if (B.data) return Promise.resolve(B.data);
    if (!B.loading) {
      B.loading = fetch(DATA_URL).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(d => {
          const object = x => x && typeof x === 'object' && !Array.isArray(x);
          const ys = d && d.years, number = x => x === null || (typeof x === 'number' && Number.isFinite(x) && x >= 0);
          const series = a => Array.isArray(a) && a.length === ys.length && a.every(number);
          if (!Array.isArray(ys) || !ys.length || ys.length > 300 || !ys.every((y,i) => Number.isInteger(y) && y === 1960+i) ||
              !object(d.world) || !['pop','cbr','cdr','le'].every(k => series(d.world[k])) || !object(d.countries) || Object.keys(d.countries).length > 300 ||
              !Object.entries(d.countries).every(([iso,c]) => /^[A-Z]{3}$/.test(iso) && object(c) && series(c.pop) && series(c.le))) throw new Error('Invalid historical series');
          B.data = d; return d;
        })
        .catch(e => { B.loading = null; throw e; });
    }
    return B.loading;
  }

  /* value of an annual series in year y — carries the last known value forward
     (rates for the current year are not published yet), null before the start */
  function val(arr, y) {
    const y0 = B.data.years[0];
    let i = y - y0;
    if (i < 0) return null;
    if (i >= arr.length) i = arr.length - 1;
    for (; i >= 0; i--) if (arr[i] != null) return arr[i];
    return null;
  }
  function lastIdx(arr) { let i = arr.length - 1; while (i >= 0 && arr[i] == null) i--; return i; }

  /* population of a series at instant t: exponential interpolation between the
     mid-year anchors; beyond the last anchor it continues with the same growth
     rate the live counter uses, so "now" here == "now" in the header. */
  function popAt(arr, t, growthPct) {
    const y0 = B.data.years[0], li = lastIdx(arr);
    if (li < 1) return null;
    const yL = y0 + li;
    if (t >= epoch(yL)) return arr[li] * Math.exp((growthPct || 0) / 100 * (t - epoch(yL)) / YEAR_MS);
    let y = new Date(t).getUTCFullYear();
    if (t < epoch(y)) y--;
    if (y < y0) {                                   // Jan–Jun 1960: extend the first year's slope back
      const a = arr[0], b = arr[1];
      return a * Math.exp(Math.log(b / a) * (t - epoch(y0)) / YEAR_MS);
    }
    const a = arr[y - y0], b = arr[y - y0 + 1];
    if (a == null || b == null) return null;
    return a * Math.pow(b / a, (t - epoch(y)) / (epoch(y + 1) - epoch(y)));
  }

  /* births (or deaths) between t0 and t1 = Σ over calendar years of
     mid-year population × crude rate/1000 × fraction of that year inside [t0,t1] */
  function flowBetween(t0, t1, popArr, rateArr, growthPct, rateNow) {
    let total = 0;
    for (let y = new Date(t0).getUTCFullYear(); y <= new Date(t1).getUTCFullYear(); y++) {
      const ys = Date.UTC(y, 0, 1), ye = Date.UTC(y + 1, 0, 1);
      const s = Math.max(ys, t0), e = Math.min(ye, t1);
      if (e <= s) continue;
      const p = popAt(popArr, epoch(y), growthPct);
      let r = val(rateArr, y); if (r == null) r = rateNow;
      if (p == null || r == null) continue;
      total += p * r / 1000 * ((e - s) / (ye - ys));
    }
    return total;
  }

  /* first instant the series crossed `T`, or null */
  function crossing(arr, T) {
    const y0 = B.data.years[0];
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i], b = arr[i + 1];
      if (a == null || b == null) continue;
      if (a < T && b >= T) return epoch(y0 + i) + Math.log(T / a) / Math.log(b / a) * (epoch(y0 + i + 1) - epoch(y0 + i));
    }
    return null;
  }

  function rankIn(iso, yearOrNow) {
    const C = B.data.countries, S = W().S.data.countries;
    let mine, list = [];
    for (const k in C) {
      const v = yearOrNow === 'now' ? (S[k] ? W().livePop(S[k]) : null) : val(C[k].pop, yearOrNow);
      if (v == null) continue;
      list.push(v); if (k === iso) mine = v;
    }
    if (mine == null) return null;
    return list.filter(v => v > mine).length + 1;
  }

  /* ── the computation, one object the renderer and the card both read ─ */
  function compute(t0, iso) {
    const wp = W(), wd = wp.S.data.world, D = B.data, now = Date.now();
    const wThen = popAt(D.world.pop, t0, wd.growth);
    const wNow = wp.livePop(wd, now);
    const births = flowBetween(t0, now, D.world.pop, D.world.cbr, wd.growth, wd.birthRate);
    const deaths = flowBetween(t0, now, D.world.pop, D.world.cdr, wd.growth, wd.deathRate);
    const ageMs = now - t0, ageY = ageMs / YEAR_MS;
    const y0 = new Date(t0).getUTCFullYear();
    const r = {
      t0, now, ageY, ageDays: ageMs / DAY_MS,
      wThen, wNow, wDelta: wNow - wThen, wPct: (wNow / wThen - 1) * 100,
      births, deaths, shared: wThen + births,
      leThen: val(D.world.le, y0), leNow: val(D.world.le, 9999),
      milestones: [], country: null
    };
    [3e9, 4e9, 5e9, 6e9, 7e9, 8e9].forEach(T => {
      const t = crossing(D.world.pop, T);
      if (t != null && t > t0) r.milestones.push({ T, t, age: (t - t0) / YEAR_MS });
    });
    if (iso && D.countries[iso] && wp.S.data.countries[iso]) {
      const c = wp.S.data.countries[iso], cd = D.countries[iso];
      const cThen = popAt(cd.pop, t0, c.growth), cNow = wp.livePop(c, now);
      if (cThen != null && cNow != null) {
        r.country = {
          iso, name: c.common || c.name, c,
          then: cThen, now: cNow, pct: (cNow / cThen - 1) * 100,
          rankThen: rankIn(iso, y0), rankNow: rankIn(iso, 'now'),
          leThen: val(cd.le, y0), leNow: val(cd.le, 9999),
          shareThen: cThen / wThen * 100, shareNow: cNow / wNow * 100
        };
      }
    }
    return r;
  }

  /* ── helpers ──────────────────────────────────────────────────── */
  const isoDate = t => new Date(t).toISOString().slice(0, 10);
  const prettyDate = t => dateFmt.format(new Date(t));
  const bn = n => (n / 1e9).toFixed(2) + ' billion';
  const shortHuman = n => { const a = Math.abs(n);
    return a >= 1e9 ? (n / 1e9).toFixed(2) + ' billion' : a >= 1e6 ? (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + ' million' : int(n); };
  const ageWords = y => { const yy = Math.floor(y), mm = Math.floor((y - yy) * 12);
    return yy > 0 ? `${yy} year${yy === 1 ? '' : 's'}${mm ? ` and ${mm} month${mm === 1 ? '' : 's'}` : ''}` : `${mm} month${mm === 1 ? '' : 's'}`; };
  const shareUrl = () => SITE + 'story/#story?year=' + new Date(B.t0).getUTCFullYear() + (B.iso ? '&country=' + encodeURIComponent(B.iso) : '');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function shareText(r) {
    const c = r.country;
    return `🌍 When I was born (in ${new Date(r.t0).getUTCFullYear()}) the world had ${bn(r.wThen)} people. ` +
      `Today: ${bn(r.wNow)} — ${r.wPct >= 0 ? '+' : ''}${nf1.format(r.wPct)}% in my lifetime.\n` +
      `Since then ~${shortHuman(r.births)} babies were born.` +
      (c ? `\n${c.name}: ${shortHuman(c.then)} → ${shortHuman(c.now)}.` : '') +
      `\n\nWhat was the world like when YOU were born?\n${shareUrl()}`;
  }

  /* ── shell ────────────────────────────────────────────────────── */
  function countryOptions(sel) {
    const S = W().S.data.countries, C = B.data.countries;
    return Object.values(S).filter(c => C[c.iso3]).sort((a, b) => (a.common || a.name).localeCompare(b.common || b.name))
      .map(c => `<option value="${c.iso3}"${c.iso3 === sel ? ' selected' : ''}>${esc(c.common || c.name)}</option>`).join('');
  }

  function shell(d, iso) {
    const today = new Date().toISOString().slice(0, 10);
    return `
      <div class="bn-top">
        <div class="bn-title">The world when <span>you</span> were born</div>
        <button class="bn-x" id="bnClose" aria-label="Close">✕</button>
      </div>
      <div class="bn-scroll">
      <form class="bn-form" id="bnForm" autocomplete="off">
        <label class="bn-field">
          <span>Your birth date</span>
          <input type="date" id="bnDate" min="${MIN_DATE}" max="${today}" value="${esc(d || '')}" required>
        </label>
        <label class="bn-field">
          <span>Your country <em>(optional)</em></span>
          <select id="bnCountry"><option value="">— skip —</option>${countryOptions(iso)}</select>
        </label>
        <button class="bn-cta" type="submit">Show me the world I was born into</button>
        <label class="bn-priv"><input id="bnRemember" type="checkbox"> Remember my exact date on this device (optional)</label><p class="bn-priv">Calculated on your device. Share links use your year only. <a href="privacy/">Privacy details</a>.</p>
      </form>
      <div class="bn-err" id="bnErr" hidden></div>
      <div class="bn-result" id="bnResult" hidden></div>
      </div>`;
  }

  /* ── result renderer (static skeleton; live numbers ticked by refresh) ─ */
  function render(r) {
    const c = r.country;
    const tiles = [
      ['Babies born since', r.births, 'bnBirths', 'up'],
      ['People who died since', r.deaths, 'bnDeaths', 'down'],
      ['Humans you have shared the planet with', r.shared, 'bnShared', 'acc'],
      ['Days you have been alive', r.ageDays, 'bnDays', ''],
    ].map(([l, v, id, cls]) => `<div class="bn-tile ${cls}"><div class="tl">${l}</div><div class="tv" id="${id}">${int(v)}</div></div>`).join('');

    const miles = r.milestones.length
      ? `<div class="bn-miles"><h3>Milestones in your lifetime</h3><ul>` +
        r.milestones.map(m => `<li><b>${m.T / 1e9} billion</b> — ${new Date(m.t).getUTCFullYear()}, ` +
          `when you were ${m.age < 1 ? 'a few months old' : Math.floor(m.age) + ' year' + (Math.floor(m.age) === 1 ? '' : 's') + ' old'}</li>`).join('') +
        `</ul></div>` : '';

    const le = (r.leThen != null && r.leNow != null)
      ? `<div class="bn-le"><span>Life expectancy at birth, world</span><b>${nf1.format(r.leThen)} yrs</b> <i>→</i> <b>${nf1.format(r.leNow)} yrs</b></div>` : '';

    const country = c ? `
      <div class="bn-country">
        <div class="bn-ch">${W().fl(c.c, true)}<div><h3>${esc(c.name)}</h3><p>on your birth date vs now</p></div></div>
        <div class="bn-cgrid">
          <div><em>Then</em><b>${int(c.then)}</b></div>
          <div><em>Now</em><b id="bnCNow">${int(c.now)}</b></div>
          <div><em>Change</em><b class="${c.pct >= 0 ? 'up' : 'down'}" id="bnCPct">${c.pct >= 0 ? '+' : ''}${nf1.format(c.pct)}%</b></div>
          ${c.rankThen && c.rankNow ? `<div><em>World rank</em><b>#${c.rankThen} → #${c.rankNow}</b></div>` : ''}
          <div><em>Share of humanity</em><b>${nf1.format(c.shareThen)}% → ${nf1.format(c.shareNow)}%</b></div>
          ${c.leThen != null && c.leNow != null ? `<div><em>Life expectancy at birth</em><b>${nf1.format(c.leThen)} → ${nf1.format(c.leNow)} yrs</b></div>` : ''}
        </div>
        <button class="bn-link" id="bnExplore">Explore ${esc(c.name)} on the map →</button>
      </div>` : '';

    return `
      <div class="bn-hero">
        <p class="bn-when">On <b>${prettyDate(r.t0)}</b> the world had</p>
        <div class="bn-big">${int(r.wThen)}</div>
        <p class="bn-when">people. Right now it has</p>
        <div class="bn-big live" id="bnNow">${int(r.wNow)}</div>
        <p class="bn-delta"><b id="bnDelta">${r.wDelta >= 0 ? '+' : '−'}${int(Math.abs(r.wDelta))}</b>
          <span id="bnPct">${r.wPct >= 0 ? '+' : ''}${nf1.format(r.wPct)}%</span> in your ${ageWords(r.ageY)} on Earth.</p>
      </div>
      <div class="bn-tiles">${tiles}</div>
      ${le}
      ${country}
      ${miles}
      <div class="bn-actions">
        <button class="bn-cta" id="bnShare">Share</button>
        <button class="ghost" id="bnCopy">Copy text</button>
        <button class="ghost" id="bnCard">Download card</button>
        <button class="ghost" id="bnLink">Copy link</button>
      </div>
      <p class="bn-fine">Modelled, not measured: mid-year World Bank population totals interpolated to your exact date;
        births and deaths from annual crude rates × population; "right now" is the same live projection as the
        counter at the top of the page. World Bank data begins in 1960. Source: World Bank (CC BY 4.0).</p>`;
  }

  function refresh() {
    if (!B.open || !B.t0 || !el('bnNow')) return;
    const r = compute(B.t0, B.iso); B.res = r;
    el('bnNow').textContent = int(r.wNow);
    el('bnDelta').textContent = (r.wDelta >= 0 ? '+' : '−') + int(Math.abs(r.wDelta));
    el('bnPct').textContent = (r.wPct >= 0 ? '+' : '') + nf1.format(r.wPct) + '%';
    el('bnBirths').textContent = int(r.births);
    el('bnDeaths').textContent = int(r.deaths);
    el('bnShared').textContent = int(r.shared);
    el('bnDays').textContent = int(r.ageDays);
    if (r.country && el('bnCNow')) {
      el('bnCNow').textContent = int(r.country.now);
      el('bnCPct').textContent = (r.country.pct >= 0 ? '+' : '') + nf1.format(r.country.pct) + '%';
    }
  }

  /* ── actions ──────────────────────────────────────────────────── */
  function flash(btn, msg) {
    if (!btn) return;
    const t = btn.textContent; btn.textContent = msg;
    setTimeout(() => { btn.textContent = t; }, 1600);
  }
  function copy(text, btn, msg) {
    const done = () => flash(btn, msg || 'Copied ✓');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); }
  }
  function share(btn) {
    const text = shareText(B.res);
    if (navigator.share) {
      navigator.share({ title: 'The world when I was born', text, url: shareUrl() }).catch(() => {});
    } else copy(text, btn, 'Copied — paste anywhere ✓');
  }

  /* ── shareable PNG card (1080×1350, drawn on a canvas — no upload) ── */
  function drawCard(r) {
    const Wd = 1080, Hd = 1350, cv = document.createElement('canvas');
    cv.width = Wd; cv.height = Hd;
    const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, Hd); bg.addColorStop(0, '#070b14'); bg.addColorStop(1, '#0d1a2e');
    g.fillStyle = bg; g.fillRect(0, 0, Wd, Hd);
    const glow = g.createRadialGradient(200, 0, 0, 200, 0, 900); glow.addColorStop(0, 'rgba(34,211,238,.28)'); glow.addColorStop(1, 'rgba(34,211,238,0)');
    g.fillStyle = glow; g.fillRect(0, 0, Wd, Hd);
    const glow2 = g.createRadialGradient(950, 1350, 0, 950, 1350, 800); glow2.addColorStop(0, 'rgba(52,211,153,.22)'); glow2.addColorStop(1, 'rgba(52,211,153,0)');
    g.fillStyle = glow2; g.fillRect(0, 0, Wd, Hd);

    const SYS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const MONO = '"Cascadia Mono", "SF Mono", Consolas, monospace';
    const txt = (s, x, y, font, color, align) => { g.font = font; g.fillStyle = color; g.textAlign = align || 'left'; g.fillText(s, x, y); };

    txt('THE WORLD WHEN I WAS BORN', 72, 120, `700 30px ${SYS}`, '#96a3c2');
    txt(prettyDate(r.t0), 72, 190, `800 62px ${SYS}`, '#eaf0ff');

    txt('People on Earth that day', 72, 300, `500 26px ${SYS}`, '#96a3c2');
    txt(int(r.wThen), 72, 372, `700 74px ${MONO}`, '#eaf0ff');
    txt('Right now', 72, 470, `500 26px ${SYS}`, '#96a3c2');
    const grad = g.createLinearGradient(72, 0, 900, 0); grad.addColorStop(0, '#22d3ee'); grad.addColorStop(1, '#34d399');
    txt(int(r.wNow), 72, 542, `700 74px ${MONO}`, grad);
    txt(`${r.wPct >= 0 ? '+' : ''}${nf1.format(r.wPct)}% in my ${ageWords(r.ageY)}`, 72, 600, `600 30px ${SYS}`, '#34d399');

    const tiles = [
      ['Babies born since', shortHuman(r.births)],
      ['People who died since', shortHuman(r.deaths)],
      ['Humans I have shared the planet with', shortHuman(r.shared)],
      ['Days alive', int(r.ageDays)],
    ];
    let y = 680;
    tiles.forEach(([l, v], i) => {
      const x = 72 + (i % 2) * 480, yy = y + Math.floor(i / 2) * 150;
      g.fillStyle = 'rgba(255,255,255,.05)'; g.strokeStyle = 'rgba(255,255,255,.11)'; g.lineWidth = 2;
      roundRect(g, x, yy, 456, 124, 20); g.fill(); g.stroke();
      txt(l, x + 24, yy + 42, `500 21px ${SYS}`, '#96a3c2');
      txt(v, x + 24, yy + 94, `700 40px ${MONO}`, '#eaf0ff');
    });
    y = 1010;
    if (r.country) {
      const c = r.country;
      g.fillStyle = 'rgba(34,211,238,.08)'; g.strokeStyle = 'rgba(34,211,238,.35)';
      roundRect(g, 72, y, 936, 130, 20); g.fill(); g.stroke();
      txt(c.name, 96, y + 50, `700 30px ${SYS}`, '#eaf0ff');
      txt(`${shortHuman(c.then)}  →  ${shortHuman(c.now)}   (${c.pct >= 0 ? '+' : ''}${nf1.format(c.pct)}%)`, 96, y + 100, `600 30px ${MONO}`, '#22d3ee');
      y += 160;
    } else if (r.milestones.length) {
      const m = r.milestones[r.milestones.length - 1];
      txt(`The world passed ${m.T / 1e9} billion when I was ${Math.max(0, Math.floor(m.age))}.`, 72, y + 40, `500 28px ${SYS}`, '#eaf0ff');
      y += 90;
    }
    txt('What was the world like when YOU were born?', 72, 1260, `600 28px ${SYS}`, '#96a3c2');
    txt('theworldalive.com', 72, 1305, `700 34px ${SYS}`, '#22d3ee');
    txt('World Bank data · modelled estimate', 1008, 1305, `400 20px ${SYS}`, '#5f6d8c', 'right');
    return cv;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function downloadCard(btn) {
    const cv = drawCard(B.res);
    cv.toBlob(b => {
      if (!b) { btn.textContent = "Card unavailable. Try again."; return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = `world-alive-born-${isoDate(B.t0)}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      flash(btn, 'Saved ✓');
    }, 'image/png');
  }

  /* ── open / close / submit ────────────────────────────────────── */
  function show(t0, iso, scroll) {
    B.t0 = t0; B.iso = iso || null;
    const r = compute(t0, B.iso); B.res = r;
    const res = el('bnResult'); res.hidden = false; res.innerHTML = render(r);
    el('bnErr').hidden = true;
    el('bnShare').onclick = e => share(e.target);
    el('bnCopy').onclick = e => copy(shareText(B.res), e.target);
    el('bnLink').onclick = e => copy(shareUrl(), e.target, 'Link copied ✓');
    el('bnCard').onclick = e => downloadCard(e.target);
    const ex = el('bnExplore'); if (ex) ex.onclick = () => { close(); W().openPanel(B.iso); };
    remember();
    try { history.replaceState(null, '', '#born'); } catch (e) {}
    clearInterval(B.timer); B.timer = setInterval(refresh, 1000);
    if (scroll) res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fail(msg) { const e = el('bnErr'); e.hidden = false; e.textContent = msg; el('bnResult').hidden = true; }

  function submit(fromLink) {
    const v = el('bnDate').value;
    if (!v) return fail('Pick your birth date first.');
    const t0 = Date.parse(v + 'T00:00:00Z');
    if (isNaN(t0)) return fail('That date does not look right.');
    if (t0 > Date.now()) return fail('That is in the future — the world is still waiting for you.');
    if (v < MIN_DATE) return fail('World Bank population data begins in 1960, so we cannot build this honestly for earlier dates yet.');
    const selected = profile({d:v,iso:el('bnCountry').value || null});
    if (selected.invalid) return fail('Choose a valid date and country.');
    show(t0, selected.iso, !fromLink);
  }

  function open(preset) {
    const ticket = ++generation; clearInterval(B.timer); B.timer = null;
    const wp = W();
    let wrap = el('bornWrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'bornwrap'; wrap.id = 'bornWrap'; document.body.appendChild(wrap); }
    B.open = true; wrap.hidden = false; document.body.classList.add('bn-on');
    if (!wp || !wp.S || !wp.S.data) {
      wrap.innerHTML = `<div class="bn-top"><div class="bn-title">The world when <span>you</span> were born</div>
        <button class="bn-x" id="bnClose" aria-label="Close">✕</button></div>
        <div class="bn-scroll"><p class="bn-err">Population data is still loading — try again in a moment.</p></div>`;
      el('bnClose').onclick = close; return;
    }
    wrap.innerHTML = `<div class="bn-top"><div class="bn-title">The world when <span>you</span> were born</div>
        <button class="bn-x" id="bnClose" aria-label="Close">✕</button></div>
        <div class="bn-scroll"><p class="bn-priv">Loading 1960→today series...</p></div>`;
    el('bnClose').onclick = close;
    loadData().then(() => {
      if (!B.open || ticket !== generation) return;
      const last = preset ? profile(preset) : recall();
      wrap.innerHTML = shell(last.d, last.iso);
      el('bnClose').onclick = close;
      el('bnForm').onsubmit = e => { e.preventDefault(); submit(); };
      if (last.invalid) fail("Saved date or country is invalid. Please choose again.");
      else if (preset && last.d) submit(true);
      else setTimeout(() => { const d = el('bnDate'); if (d && !d.value) d.focus(); }, 60);
    }).catch(e => {
      if (!B.open || ticket !== generation || !wrap.querySelector('.bn-scroll')) return;
      wrap.querySelector('.bn-scroll').innerHTML = `<p class="bn-err">Could not load the historical series (${esc(e.message)}). Check the connection and try again.</p>`;
    });
  }

  function close() {
    generation++; B.open = false; clearInterval(B.timer); B.timer = null;
    const w = el('bornWrap'); if (w) { w.hidden = true; w.innerHTML = ''; }
    document.body.classList.remove('bn-on');
    if (/^#born/i.test(location.hash)) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  }

  function openHash(raw) {                        // "born/1990-05-14/TUR"
    const parts = raw.split('/');
    const d = (parts[1] || ''), iso = (parts[2] || '').toUpperCase() || null;
    open(/^\d{4}-\d{2}-\d{2}$/.test(d) ? { d, iso } : iso ? { iso } : null);
  }

  document.addEventListener('keydown', e => { if (B.open && e.key === 'Escape') close(); });
  document.addEventListener('DOMContentLoaded', () => {
    ['bornBtn', 'bornCta', 'navBorn'].forEach(id => { const b = el(id); if (b) b.addEventListener('click', e => { e.preventDefault(); open(); }); });
    const quick = el('bornQuick');
    if (quick) quick.addEventListener('submit', e => {
      e.preventDefault();
      const v = el('bornQuickDate').value;
      open(v ? { d: v, iso: null } : null);
    });
  });

  window.WPBORN = { open, close, openHash, card: r => drawCard(r), compute: (d, iso) => loadData().then(() => compute(Date.parse(d + 'T00:00:00Z'), iso)), _B: B };
})();
