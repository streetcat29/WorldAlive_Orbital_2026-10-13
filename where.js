/* ══════════════════════════════════════════════════════════════════
   World Alive — "Where are you in humanity?"
   Type your city (or use your location) and a sequence of facts unfolds:
   your city's population and its slice of humanity, city vs country,
   country/territory population-base comparisons, same-definition places like
   yours, live births since you arrived — ending in a shareable card.

   Data: the same city lists the map uses (cities_index tops for search,
   full per-country lists on demand via WP.loadCities), validated population bases shared with the map. Nothing typed or located leaves the
   browser. Deep link: #where/ISO3/City name
   ══════════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const W = () => window.WP, el = id => document.getElementById(id);
  const SITE = 'https://theworldalive.com/';
  const nf = new Intl.NumberFormat('en-US'), int = n => nf.format(Math.round(n));
  const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const H = { open: false, city: null, iso: null, step: 0, timer: null, t0: 0, cards: [], full: null, fullIso: null };

  let generation = 0, searchRequest = 0;
  const validISO = iso => typeof iso === "string" && /^[A-Z]{3}$/.test(iso) && Object.prototype.hasOwnProperty.call(W().S.data.countries, iso);
  const notice = text => { const box = el("whHits"); if (H.open && box) box.textContent = text; };

  /* ── candidates ─────────────────────────────────────────────── */
  function tops() {
    const wp = W(), out = [];
    for (const iso in wp.S.cIndex) (wp.cityTop(iso) || []).forEach(ct => out.push(Object.assign({ iso }, ct)));
    return out;
  }
  const hav = (a, b) => { const r = Math.PI / 180, dl = (b.lo - a.lo) * r, p1 = a.la * r, p2 = b.la * r;
    const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };

  function search(q, list) {
    if (typeof q !== "string" || q.length > 512) return [];
    q = q.trim().toLowerCase(); if (q.length < 2) return [];
    const C = W().S.data.countries;
    return list.filter(ct => ct.n.toLowerCase().includes(q)).sort((a, b) => {
      const as = a.n.toLowerCase().startsWith(q) ? 0 : 1, bs = b.n.toLowerCase().startsWith(q) ? 0 : 1;
      return as !== bs ? as - bs : b.p - a.p;
    }).slice(0, 8).map(ct => ({ ct, c: C[ct.iso] }));
  }

  /* ── the facts, computed once for a city ───────────────────── */
  function facts(ct) {
    const wp = W(), C = wp.S.data.countries, c = Object.assign({}, C[ct.iso]), world = wp.S.data.world.pop;
    const basis = wp.cityBasis(ct, c), p = basis.p, cname = c.common || c.name;
    const oneIn = Math.round(world / p);
    const smaller = Object.values(C).filter(x => x.pop && x.pop < p).sort((a, b) => b.pop - a.pop);
    const all = tops().filter(x => wp.cityBasis(x, C[x.iso]).kind === basis.kind).sort((a, b) => b.p - a.p);
    const alike = all.filter(x => x.iso !== ct.iso && Math.abs(Math.log(x.p / p)) < 0.08).slice(0, 3);
    const cShare = p / c.pop * 100, worldShareC = c.pop / world * 100;
    const context = `${esc(basis.kind)} · ${esc(basis.source)} · ${esc(basis.reference)}`;
    const countryDenom = `World Bank ${c.popYear}: ${int(c.pop)}; population dates may differ`;
    const worldDenom = `World Bank ${wp.S.data.world.popYear}: ${int(world)}; population dates may differ`;
    const cards = [];
    cards.push({ k: 'hero', h: `Your selected place: <b>${esc(ct.n)}</b>`, t: `${int(p)} people · ${context}` });
    cards.push({ k: 'big', n: `1 in ${int(oneIn)}`, h: `people in the world base, as a population ratio for ${esc(ct.n)}`, t: `Source-base ratio, not a live count: ${(p / world * 100).toFixed(p / world * 100 < 0.01 ? 4 : 3)}% · ${worldDenom}` });
    cards.push({ k: 'bar', h: `${esc(ct.n)}'s ${esc(basis.kind)} population is <b>${nf1.format(cShare)}%</b> of the country base`, t: `${int(p)} / ${int(c.pop)} · ${countryDenom}`, pct: Math.min(100, cShare) });
    if (smaller.length) cards.push({ k: 'list', h: `This population base exceeds <b>${smaller.length} country/territory population records</b>`, t: 'World Bank source-year populations (not geographic area): ' + smaller.slice(0, 5).map(x => `${wp.fl(x)} ${esc(x.common || x.name)} (${wp.short(x.pop)}, ${x.popYear})`).join(', ') });
    else cards.push({ k: 'list', h: `No country/territory population record is lower than this base`, t: 'This compares source populations, not geographic size or harmonised reference dates.' });
    cards.push({ k: 'list', h: 'Population definitions matter', t: 'Province, UN urban-centre and GeoNames settlement records are not interchangeable. No comparable global city rank is claimed; shared definition labels do not guarantee harmonised boundaries or dates.' });
    if (alike.length) cards.push({ k: 'list', h: `Similar population bases in the same definition category`, t: alike.map(x => { const b = wp.cityBasis(x, C[x.iso]); return `${wp.fl(C[x.iso])} ${esc(x.n)}, ${esc(C[x.iso].common || C[x.iso].name)} (${wp.short(b.p)}) · ${esc(b.kind)} · ${esc(b.source)} · ${esc(b.reference)}`; }).join('<br>') });
    cards.push({ k: 'country', h: `And ${esc(cname)} in the world base`, t: `1 in every <b>${int(world / c.pop)}</b> · ${nf1.format(worldShareC)}% · World Bank country ${c.popYear} / world ${wp.S.data.world.popYear}. National annual growth ${wp.pct(c.growth || 0)} (${c.growthYear}); not local growth.` });
    cards.push({ k: 'live', h: `Modelled births since you opened this`, t: '' });
    cards.push({ k: 'end' });
    return { cards, ct, c, p, basis, oneIn, world, cShare, smaller: smaller.length, wrank: 0, crank: 0 };
  }

  /* ── render ─────────────────────────────────────────────────── */
  function card(cd, F) {
    const wp = W();
    if (cd.k === 'hero') return `<div class="wh-card hero">${wp.fl(F.c, true)}<h3>${cd.h}</h3><p>${cd.t}</p></div>`;
    if (cd.k === 'big') return `<div class="wh-card big"><div class="wh-n">${cd.n}</div><p><b>${cd.h}</b></p><p class="dim">${cd.t}</p></div>`;
    if (cd.k === 'bar') return `<div class="wh-card"><p>${cd.h}</p><div class="wh-bar"><i style="width:${cd.pct.toFixed(2)}%"></i></div><p class="dim">${cd.t}</p></div>`;
    if (cd.k === 'list') return `<div class="wh-card"><p>${cd.h}</p><p class="dim">${cd.t}</p></div>`;
    if (cd.k === 'rank') return `<div class="wh-card"><p>${cd.h}</p><div class="wh-ranks">${cd.items.map(([v, l]) => `<div><b>${v}</b><em>${l}</em></div>`).join('')}</div></div>`;
    if (cd.k === 'country') return `<div class="wh-card"><p>${cd.h}</p><p class="dim">${cd.t}</p></div>`;
    if (cd.k === 'live') return `<div class="wh-card live"><p>${cd.h}</p><p class="dim"><b id="whBorn">—</b> babies born worldwide · <b id="whBornC">—</b> in ${esc(F.c.common || F.c.name)}</p></div>`;
    return `<div class="wh-card end"><p><b>That is where you are in humanity.</b></p>
      <div class="wh-actions"><button class="bn-cta" id="whShare">Share</button><button class="ghost" id="whCard">Download card</button><button class="ghost" id="whLink">Copy link</button>
      <button class="ghost" id="whAgain">Another city</button></div>
      <p class="bn-fine">${esc(F.basis.kind)} · ${esc(F.basis.source)} · ${esc(F.basis.reference)}. Static population base ${int(F.p)}; map counter modelling anchor ${F.basis.anchor}, ${esc(F.basis.method)} (${wp.pct(F.basis.growth)}/yr), using continuous exponential growth. Country/world ratios use labelled World Bank annual bases, not live counts. Birth counters are rate-based illustrations, not observed events. No global city rank or verified containment is implied. Location matching finds a nearby gazetteer point, not your administrative jurisdiction. Nothing you typed or located leaves your browser.</p></div>`;
  }

  function reveal(F) {
    const box = el('whCards'); box.innerHTML = ''; H.step = 0; H.t0 = Date.now(); clearInterval(H.timer);
    const next = () => {
      if (!H.open) return clearInterval(H.timer);
      if (H.step >= F.cards.length) return clearInterval(H.timer);
      const d = document.createElement('div'); d.innerHTML = card(F.cards[H.step], F); box.appendChild(d.firstChild);
      box.lastChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (F.cards[H.step].k === 'end') wire(F);
      H.step++;
    };
    next(); H.timer = setInterval(next, 1400);
    box.onclick = () => { if (H.step < F.cards.length) { clearInterval(H.timer); next(); H.timer = setInterval(next, 1400); } };
    if (H.live) clearInterval(H.live);
    H.live = setInterval(() => {
      const wp = W(), b = el('whBorn'); if (!b) return;
      const secs = (Date.now() - H.t0) / 1000, w = wp.S.data.world;
      b.textContent = int(wp.perSec(wp.livePop(w), w.birthRate) * secs);
      const bc = wp.perSec(wp.livePop(F.c), F.c.birthRate) * secs; el('whBornC').textContent = bc < 10 ? bc.toFixed(1) : int(bc);
    }, 1000);
  }

  const shareUrl = () => SITE + '#where/' + H.iso + '/' + encodeURIComponent(H.city.n);
  const shareText = F => `🌍 ${F.ct.n}: ${int(F.p)} people · ${F.basis.kind} · ${F.basis.source}. ${F.basis.reference}. ` +
    `${nf1.format(F.cShare)}% of ${F.c.common || F.c.name}'s World Bank ${F.c.popYear} population base; reference dates may differ. ` +
    `Population ratio, not a live count or comparable global rank.\n\nFind yours: ${shareUrl()}`;
  function flash(b, m) { if (!b) return; const t = b.textContent; b.textContent = m; setTimeout(() => (b.textContent = t), 1600); }
  function copy(text, b, m) { const done = () => flash(b, m || 'Copied ✓'); if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done(); }
  function wire(F) {
    el('whShare').onclick = e => navigator.share ? navigator.share({ title: 'Where am I in humanity?', text: shareText(F), url: shareUrl() }).catch(() => {}) : copy(shareText(F), e.target, 'Copied — paste anywhere ✓');
    el('whLink').onclick = e => copy(shareUrl(), e.target, 'Link copied ✓');
    el('whCard').onclick = e => download(F, e.target);
    el('whAgain').onclick = () => { el('whResult').hidden = true; el('whPick').hidden = false; el('whQ').value = ''; el('whQ').focus(); clearInterval(H.live); };
  }

  /* ── PNG card ───────────────────────────────────────────────── */
  function download(F, btn) {
    const Wd = 1080, Hd = 1080, cv = document.createElement('canvas'); cv.width = Wd; cv.height = Hd; const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, Hd); bg.addColorStop(0, '#070b14'); bg.addColorStop(1, '#0d1a2e'); g.fillStyle = bg; g.fillRect(0, 0, Wd, Hd);
    const gl = g.createRadialGradient(900, 100, 0, 900, 100, 800); gl.addColorStop(0, 'rgba(34,211,238,.3)'); gl.addColorStop(1, 'rgba(34,211,238,0)'); g.fillStyle = gl; g.fillRect(0, 0, Wd, Hd);
    const SYS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', MONO = '"Cascadia Mono","SF Mono",Consolas,monospace';
    const txt = (s, x, y, f, c, a) => { g.font = f; g.fillStyle = c; g.textAlign = a || 'left'; g.fillText(s, x, y); };
    txt('WHERE AM I IN HUMANITY?', 72, 120, `700 30px ${SYS}`, '#96a3c2');
    txt(F.ct.n, 72, 210, `800 ${F.ct.n.length > 14 ? 56 : 72}px ${SYS}`, '#eaf0ff');
    txt(`${F.c.common || F.c.name} · ${int(F.p)} people`, 72, 262, `500 28px ${SYS}`, '#96a3c2');
    txt('1 in', 72, 420, `600 40px ${SYS}`, '#96a3c2');
    txt(int(F.oneIn), 72, 540, `800 130px ${MONO}`, '#34d399');
    txt('people in the world base (population ratio)', 72, 600, `500 32px ${SYS}`, '#eaf0ff');
    const lines = [`${nf1.format(F.cShare)}% of country base · World Bank ${F.c.popYear}`, `${F.basis.kind} · source base, not live`, `World denominator: World Bank ${W().S.data.world.popYear}`];
    lines.forEach((l, i) => txt('•  ' + l, 72, 700 + i * 52, `500 30px ${SYS}`, '#eaf0ff'));
    txt(F.basis.source, 72, 880, `500 22px ${SYS}`, '#96a3c2');
    txt(F.basis.urban ? '2025 annual estimate' : 'Population reference date unknown', 72, 915, `500 22px ${SYS}`, '#96a3c2');
    txt('Dates/boundaries may differ; no global city rank', 72, 955, `500 22px ${SYS}`, '#96a3c2');
    txt('theworldalive.com', 72, 1010, `700 36px ${SYS}`, '#22d3ee');
    cv.toBlob(b => { if (!b) { flash(btn, 'Card unavailable. Try again.'); return; } const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `where-am-i-${F.ct.n.replace(/\W+/g, '-')}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); flash(btn, 'Saved ✓'); }, 'image/png');
  }

  /* ── shell / open / close ───────────────────────────────────── */
  function shell() {
    const C = W().S.data.countries;
    const opts = Object.values(C).sort((a, b) => (a.common || a.name).localeCompare(b.common || b.name)).map(c => `<option value="${c.iso3}">${esc(c.common || c.name)}</option>`).join('');
    return `<div class="bn-top"><div class="bn-title">Where are <span>you</span> in humanity?</div><button class="bn-x" id="whClose" aria-label="Close">✕</button></div>
      <div class="bn-scroll">
        <div id="whPick" class="wh-pick">
          <p class="wh-lead">Type the city you are in. One number at a time, the world will tell you where you fit.</p>
          <div class="wh-row"><input id="whQ" class="wh-q" placeholder="Your city..." autocomplete="off" spellcheck="false"><button class="ghost" id="whGeo" title="Uses your device location once, locally">📍 Use my location</button></div>
          <div id="whHits" class="wh-hits"></div>
          <p class="bn-priv">Can't find it? Pick the country to search the available place records:
            <select id="whCountry"><option value="">— country —</option>${opts}</select></p>
        </div>
        <div id="whResult" class="wh-result" hidden><div id="whCards" class="wh-cards"></div></div>
      </div>`;
  }
  function pickList() {
    return (H.full && H.fullIso === el('whCountry').value && el('whCountry').value) ? H.full.map(ct => Object.assign({ iso: H.fullIso }, ct)) : tops();
  }
  function showHits(hits) {
    const wp = W();
    el('whHits').innerHTML = hits.map((h, i) => `<button class="wh-hit" data-i="${i}">${wp.fl(h.c)} <b>${esc(h.ct.n)}</b> <span>${esc(h.c.common || h.c.name)}</span><em>${wp.short(h.ct.p)}</em></button>`).join('');
    el('whHits').querySelectorAll('.wh-hit').forEach(b => b.onclick = () => show(hits[+b.dataset.i].ct));
  }
  function show(ct) {
    if (!H.open || !ct || !validISO(ct.iso) || !el("whPick")) return;
    ct = Object.assign({}, ct, {p: W().cityPop(ct, W().S.data.countries[ct.iso])});
    H.city = ct; H.iso = ct.iso;
    el('whPick').hidden = true; el('whResult').hidden = false;
    const F = facts(ct); H.F = F; reveal(F);
    try { history.replaceState(null, '', '#where/' + ct.iso + '/' + encodeURIComponent(ct.n)); } catch (e) {}
  }
  function geo() {
    if (H.geoPending) return;
    const ticket = generation, request = ++searchRequest;
    const current = () => H.open && ticket === generation && request === searchRequest;
    const b = el('whGeo'); if (!navigator.geolocation) return flash(b, 'Not available');
    H.geoPending = true; b.disabled = true; b.textContent = 'Locating...';
    const done = () => { if (ticket === generation) { H.geoPending = false; if (b.isConnected) { b.disabled = false; b.textContent = 'Use my location'; } } };
    navigator.geolocation.getCurrentPosition(pos => {
      done(); if (!current()) return;
      const me = { la: pos.coords.latitude, lo: pos.coords.longitude };
      const near = tops().map(ct => [hav(me, ct), ct]).sort((a, b) => a[0] - b[0])[0];
      if (!near) return flash(b, 'No match');
      W().loadCities(near[1].iso).then(list => {
        const best = list.map(ct => [hav(me, ct), Object.assign({ iso: near[1].iso }, ct)]).sort((a, b) => a[0] - b[0])[0];
        if (!current()) return;
        show(best && best[0] < near[0] ? best[1] : near[1]);
      }).catch(() => { if (current()) notice('City data unavailable. Select a country to retry.'); });
    }, () => { done(); if (current()) flash(b, 'Location blocked'); }, { timeout: 8000, maximumAge: 600000 });
  }
  function open(preset) {
    const wp = W(); if (!wp || !wp.S || !wp.S.data) return;
    let wrap = el('whereWrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'bornwrap wherewrap'; wrap.id = 'whereWrap'; document.body.appendChild(wrap); }
    const ticket = ++generation; H.geoPending = false; ++searchRequest; clearInterval(H.timer); clearInterval(H.live); H.timer = H.live = null; H.full = null; H.fullIso = null;
    H.open = true; wrap.hidden = false; document.body.classList.add('bn-on');
    wrap.innerHTML = shell();
    el('whClose').onclick = close;
    el('whQ').oninput = e => { ++searchRequest; if (e.target.value.length > 512) { notice('Search is too long. Use a city name.'); return; } showHits(search(e.target.value, pickList())); };
    el('whGeo').onclick = geo;
    el('whCountry').onchange = e => { const iso = e.target.value, request = ++searchRequest; H.full = null; H.fullIso = null;
      if (!iso) { showHits(search(el('whQ').value, tops())); return; }
      if (!validISO(iso)) { notice('Choose a valid country.'); return; }
      const current = () => H.open && ticket === generation && el('whCountry') && el('whCountry').value === iso;
      notice('Loading city data...');
      wp.loadCities(iso).then(list => { if (!current()) return; H.full = list.map(ct => Object.assign({}, ct, {p: wp.cityPop(ct, wp.S.data.countries[iso])})); H.fullIso = iso;
        const q = el('whQ').value; showHits(search(q || (request === searchRequest && list[0] ? list[0].n.slice(0,2) : ''), pickList()));
      }).catch(() => { if (current()) notice('City data unavailable. Select the country again to retry.'); }); };
    if (preset) {
      if (!validISO(preset.iso) || typeof preset.n !== "string" || preset.n.length > 512) { notice("This city link is invalid. Search for a city instead."); return; }
      const request = searchRequest;
      const t = tops().find(ct => ct.iso === preset.iso && ct.n.toLowerCase() === preset.n.toLowerCase());
      if (t) return show(t);
      wp.loadCities(preset.iso).then(list => { if (!H.open || ticket !== generation || request !== searchRequest) return; const ct = list.find(x => x.n.toLowerCase() === preset.n.toLowerCase()); if (ct) show(Object.assign({ iso: preset.iso }, ct)); else notice("City not found. Try searching by name."); }).catch(() => { if (H.open && ticket === generation && request === searchRequest) notice("City data unavailable. Try searching again."); });
    } else setTimeout(() => el('whQ') && el('whQ').focus(), 60);
  }
  function close() {
    generation++; searchRequest++; H.open = false; clearInterval(H.timer); clearInterval(H.live); H.timer = H.live = null;
    const w = el('whereWrap'); if (w) { w.hidden = true; w.innerHTML = ''; }
    document.body.classList.remove('bn-on');
    if (/^#where/i.test(location.hash)) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  }
  document.addEventListener('keydown', e => { if (H.open && e.key === 'Escape') close(); });
  document.addEventListener('DOMContentLoaded', () => {
    ['navWhere'].forEach(id => { const b = el(id); if (b) b.addEventListener('click', e => { e.preventDefault(); open(); }); });
    document.addEventListener('click', e => { const b = e.target.closest('#cvWhere'); if (b) { e.preventDefault(); const iso = b.dataset.iso, n = b.dataset.n; W().closePanel(); open({ iso, n }); } });
  });
  window.WPWHERE = { open, close, openHash: raw => { const m = /^where\/([A-Z]{3})\/(.+)$/i.exec(raw); open(m ? { iso: m[1].toUpperCase(), n: m[2] } : null); }, facts, _H: H };
})();
