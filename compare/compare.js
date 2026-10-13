/* World Alive — Compare tool (countries or cities), client-side.
   Data: /data/world.json (+ /data/born.json for history, + /data/cities_index.json for cities).
   Deep links: /compare/#TUR-vs-DEU   or   /compare/#city:TUR:Istanbul-vs-GBR:London
   Mirrors the metric definitions and verdict logic of build_compare.py. */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const nf = new Intl.NumberFormat('en-US'), nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }), nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const int = n => n == null ? '—' : nf.format(Math.round(n));
  const pct = (n, d) => n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + (d === 1 ? nf1 : nf2).format(Math.abs(n)) + '%';
  const short = n => Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + ' billion' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + ' million' : int(n);
  const axis = n => Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : n.toFixed(0);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const YEAR = new Date().getFullYear(), YEAR_MS = 365.2425 * 864e5;
/* Shared canonical basis; its scope must be loaded before synchronous callers run. */
const cityBasis = (ct, c) => window.WPDataRuntime.cityBasis(ct, c);
const cityPop = (ct, c) => cityBasis(ct, c).p;
const liveCity = (ct, c, now = Date.now()) => {
  const b = cityBasis(ct, c);
  return b.p == null ? null : b.p * Math.exp(b.growth / 100 * (now - Date.parse(b.anchor + 'T00:00:00Z')) / YEAR_MS);
};

  const D = { world: null, born: null, cidx: null, mode: 'country' };
  const nm = c => c.common || c.name;
  const slug = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const fl = (c, big) => /^[a-z]{2}$/i.test(c.iso2 || '') ? `<img class="fl${big ? ' big' : ''}" src="/flags/w${big ? 80 : 40}/${c.iso2.toLowerCase()}.png" alt="" width="${big ? 40 : 20}">` : `<span class="flcode">${esc(c.iso3)}</span>`;

  const METRICS = [
    ['pop', 'Population', v => int(v), 'popYear'], ['growth', 'Growth rate / yr', v => pct(v), 'growthYear'],
    ['birthRate', 'Births per 1,000', v => nf1.format(v), 'birthRateYear'], ['deathRate', 'Deaths per 1,000', v => nf1.format(v), 'deathRateYear'],
    ['fertility', 'Children per woman', v => nf2.format(v), 'fertilityYear'], ['lifeExp', 'Life expectancy', v => nf1.format(v) + ' yrs', 'lifeExpYear'],
    ['age0014', 'Aged 0–14', v => nf1.format(v) + '%', 'age0014Year'], ['age65up', 'Aged 65+', v => nf1.format(v) + '%', 'age65upYear'],
    ['density', 'Density', v => nf1.format(v) + ' /km²', 'densityYear'], ['area', 'Area', v => int(v) + ' km²', 'areaYear'],
    ['urbanPct', 'Urban population', v => nf1.format(v) + '%', 'urbanPctYear'], ['netMig', 'Net migration / yr', v => (v > 0 ? '+' : '') + int(v), 'netMigYear'],
    ['gdpPc', 'GDP per capita', v => '$' + int(v), 'gdpPcYear']];

  const load = (k, url) => D[k] ? Promise.resolve(D[k]) : (k === 'world' ? window.WPDataRuntime.loadWorld() : fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + url); return r.json(); })).then(j => (D[k] = j));

  /* ── countries ─────────────────────────────────────────────── */
  function rank(iso) { return Object.values(D.world.countries).filter(x => (x.pop || 0) > D.world.countries[iso].pop).length + 1; }
  function series(iso) { const s = D.born && D.born.countries[iso]; return s ? D.born.years.map((y, i) => [y, s.pop[i]]).filter(p => p[1]) : []; }
  function crossover(a, b) {
    const [s, l] = a.pop < b.pop ? [a, b] : [b, a], gs = (s.growth || 0) / 100, gl = (l.growth || 0) / 100;
    if (a.popYear !== b.popYear || a.growth == null || b.growth == null || gs <= gl) return null; const t = Math.log(l.pop / s.pop) / (gs - gl); return t < 200 ? { s, l, t } : null;
  }
  function verdict(a, b) {
    const big = a.pop >= b.pop ? a : b, small = big === a ? b : a, r = big.pop / small.pop, out = [];
    out.push(`<b>${esc(nm(big))}</b> has ${r < 1.03 ? 'about the same population as' : r >= 1.15 ? `<b>${r.toFixed(1)}× the population</b> of` : `<b>${((r - 1) * 100).toFixed(0)}% more people</b> than`} ${esc(nm(small))}: ${int(big.pop)} vs ${int(small.pop)}, a gap of ${short(big.pop - small.pop)}.`);
    if (a.growth != null && b.growth != null) {
      const fast = a.growth > b.growth ? a : b, slow = fast === a ? b : a;
      if (Math.abs(a.growth - b.growth) < .05) out.push(`Both are growing at almost the same pace (${pct(a.growth)} vs ${pct(b.growth)} a year).`);
      else out.push(`<b>${esc(nm(fast))}</b> is ${Math.max(a.growth, b.growth) > 0 ? 'growing faster' : 'shrinking more slowly'} (${pct(fast.growth)} vs ${pct(slow.growth)} a year), adding about ${int(fast.pop * fast.growth / 100)} people a year against ${(slow.growth > 0 ? '+' : '−') + int(Math.abs(slow.pop * slow.growth / 100))}.`);
      const x = crossover(a, b);
      if (x) out.push(`Using continuous exponential growth from the stated base year, if these rates held, <b>${esc(nm(x.s))} would overtake ${esc(nm(x.l))} in about ${x.t.toFixed(0)} years (from the ${a.popYear} population bases, around ${a.popYear + Math.round(x.t)})</b> — a projection, not a forecast.`);
      else if (a.popYear === b.popYear && r >= 1.03) out.push(`At these source-year rates the modelled relative population gap is ${(big.growth || 0) >= (small.growth || 0) ? 'widening' : 'narrowing, but too slowly to close within two centuries'}.`);
    }
    if (a.age65up != null && b.age65up != null && Math.abs(a.age65up - b.age65up) >= 1) {
      const old = a.age65up > b.age65up ? a : b, young = old === a ? b : a;
      out.push(`${esc(nm(old))} is the older society: ${nf1.format(old.age65up)}% aged 65+ against ${nf1.format(young.age65up)}% in ${esc(nm(young))}${young.age0014 > old.age0014 ? `, while ${esc(nm(young))} has more children (${nf1.format(young.age0014)}% under 15 vs ${nf1.format(old.age0014)}%).` : '.'}`);
    }
    if (a.density && b.density && Math.max(a.density, b.density) / Math.min(a.density, b.density) >= 1.3) {
      const d = a.density > b.density ? a : b, s = d === a ? b : a;
      out.push(`${esc(nm(d))} is ${(d.density / s.density).toFixed(1)}× as densely populated (${nf1.format(d.density)} vs ${nf1.format(s.density)} people per km²).`);
    }
    if (a.lifeExp && b.lifeExp && Math.abs(a.lifeExp - b.lifeExp) >= 1) {
      const h = a.lifeExp > b.lifeExp ? a : b, l = h === a ? b : a;
      out.push(`People in ${esc(nm(h))} live ${Math.abs(a.lifeExp - b.lifeExp).toFixed(1)} years longer on average (${nf1.format(h.lifeExp)} vs ${nf1.format(l.lifeExp)}).`);
    }
    if (a.gdpPc && b.gdpPc && Math.max(a.gdpPc, b.gdpPc) / Math.min(a.gdpPc, b.gdpPc) >= 1.25) {
      const rch = a.gdpPc > b.gdpPc ? a : b, pr = rch === a ? b : a;
      out.push(`GDP per capita is ${(rch.gdpPc / pr.gdpPc).toFixed(1)}× higher in ${esc(nm(rch))} ($${int(rch.gdpPc)} vs $${int(pr.gdpPc)}).`);
    }
    return out.join(' ');
  }
  function chart(sa, sb, la, lb, indexed) {
    if (sa.length < 2 || sb.length < 2) return '';
    if (indexed) { sa = sa.map(p => [p[0], p[1] / sa[0][1] * 100]); sb = sb.map(p => [p[0], p[1] / sb[0][1] * 100]); }
    const W = 720, H = 250, L = 64, R = 16, T = 14, B = 34, x0 = Math.min(sa[0][0], sb[0][0]), x1 = Math.max(sa[sa.length - 1][0], sb[sb.length - 1][0]);
    const y1 = Math.max(...sa.map(p => p[1]), ...sb.map(p => p[1])) * 1.06;
    const X = y => L + (y - x0) / (x1 - x0) * (W - L - R), Y = v => T + (1 - v / y1) * (H - T - B);
    const d = ps => ps.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
    const f = indexed ? v => v.toFixed(0) : axis;
    let g = ''; for (let k = 0; k < 5; k++) { const v = y1 * k / 4; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${k ? f(v) : '0'}</text>`; }
    let xt = ''; for (let y = Math.ceil(x0 / 10) * 10; y <= x1; y += 10) xt += `<text x="${X(y).toFixed(1)}" y="${H - 10}" text-anchor="middle">${y}</text>`;
    const ea = sa[sa.length - 1], eb = sb[sb.length - 1];
    return `<svg class="chart" viewBox="0 0 ${W} ${H}"><g class="grid">${g}</g><g class="xt">${xt}</g><path class="line" d="${d(sa)}"/><path class="line b" d="${d(sb)}"/>` +
      `<text class="lbl" x="${(X(ea[0]) - 8).toFixed(1)}" y="${(Y(ea[1]) - 8).toFixed(1)}" text-anchor="end">${esc(la)}</text><text class="lbl b" x="${(X(eb[0]) - 8).toFixed(1)}" y="${(Y(eb[1]) + 16).toFixed(1)}" text-anchor="end">${esc(lb)}</text></svg>`;
  }
  function renderCountries(ia, ib) {
    const C = D.world.countries, a = C[ia], b = C[ib]; if (!a || !b) return;
    const W = D.world.world.pop;
    let rows = '';
    METRICS.forEach(([k, l, f, yk]) => {
      const va = a[k], vb = b[k]; if (va == null && vb == null) return;
      const hi = (va || 0) > (vb || 0) ? 'a' : (vb || 0) > (va || 0) ? 'b' : '';
      rows += `<tr><th>${l}</th><td class="${hi === 'a' ? 'win' : ''}">${va == null ? '—' : f(va)}<small style="display:block">${a[yk] || 'year not supplied'}</small></td><td class="${hi === 'b' ? 'win' : ''}">${vb == null ? '—' : f(vb)}<small style="display:block">${b[yk] || 'year not supplied'}</small></td></tr>`;
    });
    rows += `<tr><th>Country population rank (available records)</th><td>#${rank(ia)}</td><td>#${rank(ib)}</td></tr><tr><th>Base / world population (World Bank ${D.world.world.popYear})</th><td>${(a.pop / W * 100).toFixed(2)}%</td><td>${(b.pop / W * 100).toFixed(2)}%</td></tr>`;
    const sa = series(ia), sb = series(ib);
    const [p, q] = [ia, ib].sort((x, y) => slug(nm(C[x])) < slug(nm(C[y])) ? -1 : 1);
    $('cmpOut').innerHTML = `
      <div class="vsrow"><div class="side" style="min-width:0;overflow-wrap:anywhere"><a href="/countries/${slug(nm(a))}/">${fl(a, 1)}<h3>${esc(nm(a))}</h3></a><b>${int(a.pop)}</b><i>#${rank(ia)} · ${pct(a.growth)}/yr</i></div><div class="vsmark">vs</div>
      <div class="side" style="min-width:0;overflow-wrap:anywhere"><a href="/countries/${slug(nm(b))}/">${fl(b, 1)}<h3>${esc(nm(b))}</h3></a><b>${int(b.pop)}</b><i>#${rank(ib)} · ${pct(b.growth)}/yr</i></div></div>
      <p class="lead">${verdict(a, b)}</p><p class="muted">Country/territory population bases: World Bank ${a.popYear} (${esc(nm(a))}) and ${b.popYear} (${esc(nm(b))}); growth years ${a.growthYear} / ${b.growthYear}. Annual source values, not live counts; years may differ. Population growth is national, not local.</p>
      <table class="vs" style="table-layout:fixed;overflow-wrap:anywhere"><thead><tr><th></th><th>${fl(a)} ${esc(nm(a))}</th><th>${fl(b)} ${esc(nm(b))}</th></tr></thead><tbody>${rows}</tbody></table>
      ${sa.length && sb.length ? `<h3>Population since ${sa[0][0]}</h3><div class="two">${chart(sa, sb, nm(a), nm(b))}${chart(sa, sb, nm(a), nm(b), true)}</div><p class="muted">World Bank population history (not the separate UN WPP timeline). Left: absolute. Right: each series indexed to its own first available year = 100: ${esc(nm(a))} ${sa[0][0]}, ${esc(nm(b))} ${sb[0][0]}.</p>` : ''}
      <p class="muted">Permanent page for this pair (if built): <a href="/compare/${slug(nm(C[p]))}-vs-${slug(nm(C[q]))}/">/compare/${slug(nm(C[p]))}-vs-${slug(nm(C[q]))}/</a> · <a href="#" id="cmpCopy">copy link</a></p>`;
    $('cmpCopy').onclick = e => { e.preventDefault(); if (!navigator.clipboard) { e.target.textContent = 'Copy the address bar link'; return; } navigator.clipboard.writeText(location.href).then(() => { e.target.textContent = 'copied ✓'; }).catch(() => { e.target.textContent = 'Copy the address bar link'; }); };
    try { history.replaceState(null, '', '#' + ia + '-vs-' + ib); } catch (e) {}
  }

  /* ── cities (from cities_index top lists; UN urban-area figure where the map has one) ── */
  function cityList() {
    const out = [];
    for (const iso in D.cidx) (D.cidx[iso].top || []).forEach(ct => out.push(Object.assign({ iso }, ct)));
    return out.map(ct => Object.assign({}, ct, {p: cityPop(ct, D.world.countries[ct.iso])})).sort((x, y) => y.p - x.p);
  }
  function cityGrowth(ct) { return cityBasis(ct, D.world.countries[ct.iso]).growth; }
  function renderCities(a, b) {
    const C = D.world.countries, ca = C[a.iso], cb = C[b.iso];
    const ba = cityBasis(a, ca), bb = cityBasis(b, cb), ga = ba.growth, gb = bb.growth;
    const r = Math.max(ba.p, bb.p) / Math.min(ba.p, bb.p);
    const v = `${esc(a.n)} (${esc(ba.kind)}): ${int(ba.p)}; ${esc(b.n)} (${esc(bb.kind)}): ${int(bb.p)}. ` +
      `The higher population is ${r.toFixed(2)}× the lower population on these source bases. ` +
      (ba.kind === bb.kind ? 'Same definition label, but boundaries and reference dates are not necessarily harmonised.' : 'Different geographic definitions: this is not a like-for-like city population comparison.') +
      ' No comparable global city rank is inferred. National growth used in a model is not measured city growth.';
    const row = (l, fa, fb) => `<tr><th>${l}</th><td>${fa}</td><td>${fb}</td></tr>`;
    const side = (ct, co, basis) => `<div class="side" style="min-width:0;overflow-wrap:anywhere"><a href="/#${ct.iso}/${encodeURIComponent(ct.n)}">${fl(co, 1)}<h3>${esc(ct.n)}</h3></a><b>${int(basis.p)}</b><i>${esc(nm(co))} · ${esc(basis.kind)} · ${esc(basis.source)} · ${esc(basis.reference)}</i></div>`;
    $('cmpOut').innerHTML = `
      <div class="vsrow">${side(a, ca, ba)}<div class="vsmark">vs</div>${side(b, cb, bb)}</div>
      <p class="lead">${v}</p>
      <table class="vs" style="table-layout:fixed;overflow-wrap:anywhere"><thead><tr><th></th><th>${esc(a.n)}</th><th>${esc(b.n)}</th></tr></thead><tbody>
      ${row('Base population (not a live count)', int(ba.p), int(bb.p))}
      ${row('Population basis', esc(ba.kind), esc(bb.kind))}${row('Source', esc(ba.source), esc(bb.source))}
      ${row('Population reference', esc(ba.reference), esc(bb.reference))}
      ${row('Modelling anchor (not inferred census date)', ba.anchor, bb.anchor)}
      ${row('Growth used by model / yr', pct(ga), pct(gb))}${row('Growth definition', esc(ba.method), esc(bb.method))}
      ${row('Base / country population', (ba.p / ca.pop * 100).toFixed(2) + `% · World Bank ${ca.popYear}: ${int(ca.pop)}`, (bb.p / cb.pop * 100).toFixed(2) + `% · World Bank ${cb.popYear}: ${int(cb.pop)}`)}
      ${row('Base / world population', (ba.p / D.world.world.pop * 100).toFixed(3) + `% · World Bank ${D.world.world.popYear}`, (bb.p / D.world.world.pop * 100).toFixed(3) + `% · World Bank ${D.world.world.popYear}`)}
      ${row('Country', `${fl(ca)} ${esc(nm(ca))}`, `${fl(cb)} ${esc(nm(cb))}`)}${row('Capital?', a.cap ? 'yes' : 'no', b.cap ? 'yes' : 'no')}
      ${row('Time zone', esc(a.tz || '—'), esc(b.tz || '—'))}</tbody></table>
      <p class="muted">Shares divide the displayed source base by the labelled World Bank denominator; reference dates may differ. Administrative, urban-centre and settlement populations are not interchangeable and may overlap. Counters elsewhere use continuous exponential illustrations from the stated modelling anchors. <a href="#" id="cmpCopy">copy link</a></p>`;
    $('cmpCopy').onclick = e => { e.preventDefault(); if (!navigator.clipboard) { e.target.textContent = 'Copy the address bar link'; return; } navigator.clipboard.writeText(location.href).then(() => { e.target.textContent = 'copied ✓'; }).catch(() => { e.target.textContent = 'Copy the address bar link'; }); };
    try { history.replaceState(null, '', `#city:${a.iso}:${encodeURIComponent(a.n)}-vs-${b.iso}:${encodeURIComponent(b.n)}`); } catch (e) {}
  }

  /* ── UI ─────────────────────────────────────────────────────── */
  function fillCountry(sel, val) {
    sel.style.minWidth = "0"; sel.style.maxWidth = "100%";
    const C = D.world.countries;
    sel.innerHTML = Object.values(C).sort((x, y) => nm(x).localeCompare(nm(y))).map(c => `<option value="${c.iso3}"${c.iso3 === val ? ' selected' : ''}>${esc(nm(c))}</option>`).join('');
  }
  function fillCity(sel, val) {
    sel.style.minWidth = "0"; sel.style.maxWidth = "100%";
    const L = cityList().slice(0, 3000), C = D.world.countries;
    sel.innerHTML = L.map(ct => { const k = ct.iso + ':' + ct.n; return `<option value="${esc(k)}"${k === val ? ' selected' : ''}>${esc(ct.n)} — ${esc(nm(C[ct.iso]) || ct.iso)}</option>`; }).join('');
  }
  function go() {
    if (D.mode === 'city' && !D.cidx) return;
    if (D.quiet) { D.quiet = false; $('cmpOut').innerHTML = '<p class="muted">Pick any two above — the result appears here.</p>'; return; }
    const a = $('selA').value, b = $('selB').value;
    if (D.mode === 'country') { if (a === b) { $('cmpOut').innerHTML = '<p class="muted">Pick two different countries.</p>'; return; } renderCountries(a, b); }
    else {
      const L = cityList(), f = k => L.find(ct => ct.iso + ':' + ct.n === k);
      const ca = f(a), cb = f(b); if (!ca || !cb || ca === cb) { $('cmpOut').innerHTML = '<p class="muted">Pick two different cities.</p>'; return; }
      renderCities(ca, cb);
    }
  }
  let modeRequest = 0;
  async function setMode(m, a, b) {
    if (!['country','city'].includes(m)) return;
    const ticket = ++modeRequest;
    D.mode = m; [...$('cmpMode').children].forEach(x => x.classList.toggle('active', x.dataset.m === m));
    const busy = state => { for (const id of ['selA', 'selB', 'cmpGo']) $(id).disabled = state; };
    if (m === 'country') { const valid = iso => !iso || (/^[A-Z]{3}$/.test(iso) && Object.prototype.hasOwnProperty.call(D.world.countries,iso)); if (!valid(a) || !valid(b)) { busy(false); fillCountry($('selA'),'TUR'); fillCountry($('selB'),'DEU'); $('cmpOut').textContent = 'Invalid country in link. Choose two countries above.'; return; } busy(false); fillCountry($('selA'), a || 'TUR'); fillCountry($('selB'), b || 'DEU'); go(); return; }
    busy(true); $('cmpOut').textContent = 'Loading verified city data...';
    try {
      const cidx = await window.WPDataRuntime.loadTop();
      if (ticket !== modeRequest || D.mode !== 'city') return;
      D.cidx = cidx;
      fillCity($('selA'), a); fillCity($('selB'), b);
      if (!a) { $('selA').selectedIndex = 0; $('selB').selectedIndex = 1; }
      busy(false); go();
    } catch (e) {
      if (ticket !== modeRequest || D.mode !== 'city') return;
      $('cmpOut').textContent = 'City data unavailable: ' + e.message + '. Select Cities again to retry, or Countries to continue.';
      console.error(e);
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    const tool = $('tool'); if (!tool) return;
    Promise.all([load('world', '/data/world.json'), load('born', '/data/born.json').catch(() => null)]).then(() => {
      $('cmpGo').onclick = go; $('selA').onchange = go; $('selB').onchange = go;
      $('cmpMode').onclick = e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); };
      let h = '', invalidLink = false;
      try { if (location.hash.length > 4096) throw new Error('Long link'); h = decodeURIComponent(location.hash.slice(1)); } catch (_) { invalidLink = true; }
      let m = /^city:([A-Z]{3}):(.+)-vs-([A-Z]{3}):(.+)$/.exec(h);
      if (m) return setMode('city', m[1] + ':' + m[2], m[3] + ':' + m[4]);
      m = /^([A-Z]{3})-vs-([A-Z]{3})$/i.exec(h);
      if (m) return setMode('country', m[1].toUpperCase(), m[2].toUpperCase());
      D.quiet = !!tool.dataset.a;                 // static pair page: the result is already above, wait for the user
      setMode('country', tool.dataset.a || 'TUR', tool.dataset.b || 'DEU');
      if (invalidLink) $('cmpOut').textContent = 'This link is invalid or too long. Pick two countries above to compare.';
    }).catch(e => { $('cmpOut').textContent = 'Country data unavailable: ' + e.message + '. Reload to retry.'; });
  });
})();
