/* ══════════════════════════════════════════════════════════════════
   World Alive — real-time population engine
   Data: World Bank Indicators API (live) · GeoNames · Natural Earth
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const YEAR_MS = 365.2425 * 86400000;
const YEAR_S  = 365.2425 * 86400;
const WB = 'https://api.worldbank.org/v2';
const REFRESH_MS = 30 * 60 * 1000;
const WB_TTL_MS = 6 * 60 * 60 * 1000;   // World Bank figures are annual

/* features in the basemap that carry no ISO numeric id */
const NAME2ISO = { 'Kosovo': 'XKX' };

const S = {                       // ── app state
  data: null, cIndex: {}, cities: {}, geo: null, feats: [], byIso: {},
  // rankUnit remembers the chosen unit per map mode; each mode's default is the
  // first entry in its RANKS.units list (Population opens on people/year)
  mode: 'pop', rankUnit: {}, showCities: false, showLabels: true,
  labels: [], focusIso: null,
  sel: null, city: null, hoverCity: null, k: 1, lastLive: null, cityLimit: 200,
  year: null                      // time machine: when set, population mode shows that year (timeline.js)
};

/* ───────────────────────── formatters ───────────────────────── */
const nf   = new Intl.NumberFormat('en-US');
const nf1  = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2  = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int  = n => n == null || !Number.isFinite(n) ? '—' : nf.format(Math.round(n));
const sgn  = n => (n > 0 ? '+' : n < 0 ? '−' : '') + int(Math.abs(n));
const pct  = n => (n > 0 ? '+' : n < 0 ? '−' : '') + nf2.format(Math.abs(n)) + '%';
const short = n => {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
  return nf.format(Math.round(n));
};
const shortS = n => (n > 0 ? '+' : n < 0 ? '−' : '') + short(Math.abs(n));
const $  = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ownCountry = iso => typeof iso === 'string' && /^[A-Z]{3}$/.test(iso) && S.data && Object.prototype.hasOwnProperty.call(S.data.countries, iso);
function inputNotice(message) { let note = $('securityInputStatus'); if (!note) { note = document.createElement('p'); note.id = 'securityInputStatus'; note.setAttribute('role', 'status'); $('status').after(note); } note.textContent = message; }
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

/* Windows has no flag-emoji font, so flags are served as images with a
   graceful ISO-code chip fallback if the CDN is unreachable. */
window.flFail = (img, code) => {
  const s = document.createElement('span');
  s.className = 'flcode' + (img.classList.contains('big') ? ' big' : '');
  s.textContent = code; img.replaceWith(s);
};
function fl(c, big) {
  const i2 = ((c && c.iso2) || '').toLowerCase();
  const code = (((c && c.iso2) || '??')).toUpperCase();
  if (!/^[a-z]{2}$/.test(i2)) return `<span class="flcode${big ? ' big' : ''}">${esc(code)}</span>`;
  // Self-hosted (see get_flags.py). Hot-linking flagcdn served every visitor's
  // flags at someone else's expense and made the site depend on a third party
  // staying up; the whole set is only ~150 KB. Countries with no real ISO 3166-1
  // code (e.g. CHI, a World Bank aggregate) have no file and fall back to the
  // styled ISO chip in flFail().
  return `<img class="flimg${big ? ' big' : ''}" src="flags/w${big ? '80' : '40'}/${i2}.png" ` +
         `alt="${code}" loading="lazy" onerror="flFail(this,'${code}')">`;
}

/* ───────────────── live projection mathematics ─────────────────
   P(t) = P0 · e^(r·Δt)  anchored to 1 July of the source year
   (mid-year epoch, the convention used by the UN WPP / World Bank) */
const epoch = y => Date.UTC(y, 6, 1);
function livePop(c, now) {
  if (c.pop == null) return null;
  const r = (c.growth == null ? 0 : c.growth) / 100;
  return c.pop * Math.exp(r * ((now || Date.now()) - epoch(c.popYear || 2025)) / YEAR_MS);
}
/* Shared canonical basis; its scope must be loaded before synchronous callers run. */
const cityBasis = (ct, c) => window.WPDataRuntime.cityBasis(ct, c);
const cityPop = (ct, c) => cityBasis(ct, c).p;
const liveCity = (ct, c, now = Date.now()) => {
  const b = cityBasis(ct, c);
  return b.p == null ? null : b.p * Math.exp(b.growth / 100 * (now - Date.parse(b.anchor + 'T00:00:00Z')) / YEAR_MS);
};
const perSec = (pop, ratePer1000) => (ratePer1000 == null ? 0 : pop * ratePer1000 / 1000 / YEAR_S);
const secsToday = () => { const d = new Date(); return (d - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 1000; };
const secsThisYear = () => { const d = new Date(); return (d - new Date(d.getFullYear(), 0, 1)) / 1000; };

/* ═══════════════════════════ BOOT ═══════════════════════════ */
(async function boot() {
  try {
    const [data, cidx, terms, topo] = await Promise.all([
      window.WPDataRuntime.loadWorld(),
      window.WPDataRuntime.loadTop().catch(e => { S.cityDataError = e; return null; }),
      fetch('data/admin_terms.json?v=75f86eaf').then(r => r.json()).catch(() => ({})),
      fetch('data/countries-110m.json?v=2516c915').then(r => r.json())
    ]);
    // Publish S.data only after top bases are ready or city features explicitly unavailable.
    S.cityDataReady = cidx !== null;
    S.cIndex = cidx || {}; S.data = data; S.terms = terms; S.geo = topo;
    S.feats = topojson.feature(topo, topo.objects.countries).features;
    S.feats.forEach(f => {
      const num = String(f.id == null ? '' : f.id).padStart(3, '0');
      const iso = data.num2iso3[num] || NAME2ISO[f.properties && f.properties.name] || null;
      f.iso3 = (iso && data.countries[iso]) ? iso : null;
      if (f.iso3) S.byIso[f.iso3] = f;
    });
    buildSources();
    drawMap();
    renderRanks();
    wireUI();
    guardCityFeatures();
    if (!S.cityDataReady) reportCityDataError(S.cityDataError);
    $('loading').hidden = true;
    tick(); setInterval(tick, 100);
    applyHash();
    window.addEventListener('hashchange', applyHash);
    liveRefresh();
    setInterval(liveRefresh, REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - (S.lastLive || 0) > 120000) liveRefresh();
    });
  } catch (e) {
    console.error(e);
    $('loading').innerHTML = '<div style="text-align:center;max-width:340px">' +
      '<b>Could not load data files.</b><br><br>Serve this folder over HTTP ' +
      '(<code>python -m http.server 8080</code>) — opening index.html directly with file:// ' +
      'is blocked by browser security.<br><br><span style="color:#f87171">' + esc(e.message) + '</span></div>';
  }
})();

/* full city list per country, fetched on demand and cached */
const cityLoads = new Map();
function loadCities(iso) {
  if (!ownCountry(iso)) return Promise.reject(new Error("Choose a valid country."));
  if (S.cities[iso]) return Promise.resolve(S.cities[iso]);
  if (cityLoads.has(iso)) return cityLoads.get(iso);
  const promise = window.WPDataRuntime.loadCountry(iso).then(list => {
    // Never publish a list before its matching basis shard has been verified/installed.
    list.sort((a, b) => cityPop(b, S.data.countries[iso]) - cityPop(a, S.data.countries[iso]));
    S.cities[iso] = list;
    if (S.sel === iso && $('cityFilter')) $('cityFilter').disabled = false;
    return list;
  }).catch(e => {
    cityLoads.delete(iso);
    reportCityDataError(e, iso);
    throw e; // unavailable is not an empty gazetteer and not a numeric fallback
  });
  cityLoads.set(iso, promise);
  return promise;
}
function reportCityDataError(error, iso) {
  console.error('City data unavailable', error);
  if (iso) {
    if (S.sel === iso) {
      $('pCityCount').textContent = '· unavailable';
      $('pCities').textContent = 'City data unavailable. Reopen this country to retry. ' + error.message;
      $('cityFilter').disabled = true;
    }
    const hits = $('whHits');
    if (hits && $('whCountry') && $('whCountry').value === iso) hits.textContent = 'City data unavailable. Select the country again to retry. ' + error.message;
    return;
  }
  let note = $('runtimeCityStatus');
  if (!note) { note = el('span', 'fine'); note.id = 'runtimeCityStatus'; note.setAttribute('role', 'status'); $('status').after(note); }
  note.textContent = 'City features unavailable; country data remains available. ';
  const retry = el('button', 'ghost', 'Retry city data'); note.appendChild(retry);
  retry.onclick = async () => {
    retry.disabled = true;
    try {
      const cidx = await window.WPDataRuntime.loadTop();
      S.cIndex = cidx; S.cityDataReady = true; S.cityDataError = null; searchIdx = null;
      note.remove(); guardCityFeatures();
      // Populate the existing layer; never duplicate map nodes/observers on retry.
      drawCityDots(); renderRanks();
    } catch (e) { S.cityDataError = e; reportCityDataError(e); }
  };
}
function guardCityFeatures() {
  const unavailable = !S.cityDataReady;
  for (const id of ['btnCities', 'playBtn', 'watchBtn', 'navPlay', 'navWatch', 'navWhere']) {
    const node = $("" + id); if (!node) continue;
    if ('disabled' in node) node.disabled = unavailable;
    if (unavailable) { node.setAttribute('aria-disabled', 'true'); node.title = 'City data unavailable; use Retry city data'; }
    else { node.removeAttribute('aria-disabled'); if (node.title === 'City data unavailable; use Retry city data') node.removeAttribute('title'); }
  }
  // Public entrypoints used by deep links and integration layers; files themselves untouched.
  for (const [api, names] of [[window.WPGAME, ['open', 'openQuiz']], [window.WPSTREAM, ['open']], [window.WPWHERE, ['open', 'openHash']]]) {
    if (!api) continue;
    for (const name of names) {
      const original = api[name]; if (!original || original.runtimeGuard) continue;
      const guarded = function (...args) { if (!S.cityDataReady) { reportCityDataError(S.cityDataError); return; } return original.apply(this, args); };
      guarded.runtimeGuard = true; api[name] = guarded;
    }
  }
}
document.addEventListener('click', e => {
  if (!S.cityDataReady && e.target.closest('#navPlay,#navWatch,#navWhere,#cvWhere,#btnCities,#playBtn,#watchBtn')) {
    e.preventDefault(); e.stopImmediatePropagation(); reportCityDataError(S.cityDataError);
  }
}, true);
const cityCount = iso => (S.cIndex[iso] && S.cIndex[iso].n) || 0;
const cityTop = iso => ((S.cIndex[iso] && S.cIndex[iso].top) || []).map(ct =>
  Object.assign({}, ct, {p: cityPop(ct, S.data.countries[iso])})).sort((a, b) => b.p - a.p);

/* ── administrative terminology ──────────────────────────────────────────────
   Sub-city units are not called "districts" everywhere: Japan has wards,
   Myanmar townships, Nigeria local government areas, France arrondissements,
   Cuba municipalities, the Philippines barangays. Labels come from the
   per-country table built by build_cities.py. */
const DEF_TERMS = { sub: 'Districts', sub1: 'district', adm1: 'Province', adm2: 'District' };
function T(iso) {
  return Object.assign({}, (S.terms && S.terms._default) || DEF_TERMS,
                       (S.terms && S.terms[iso]) || {});
}
/* city classification, phrased in the country's own vocabulary:
   PPLA in Japan -> "Prefecture capital", in the USA -> "State capital" */
function typeLabel(fc, t) {
  if (fc === 'PPLC') return 'National capital';
  if (fc === 'PPLA') return t.adm1 + ' capital';
  if (fc === 'PPLA2') return t.adm2 + ' seat';
  return 'Town';
}
const lc = s => (s || '').charAt(0).toLowerCase() + (s || '').slice(1);

/* ═════════════════ LIVE REFRESH FROM WORLD BANK ═════════════════ */
function validWBRows(rows, code) {
  if (!Array.isArray(rows) || rows.length > 20000) return false;
  return rows.every(row => row && typeof row === 'object' && /^[A-Z]{3}$/.test(row.countryiso3code) &&
    typeof row.date === 'string' && /^\d{4}$/.test(row.date) && +row.date >= 1900 && +row.date <= new Date().getFullYear() &&
    (row.value === null || (typeof row.value === 'number' && Number.isFinite(row.value) &&
      (code === 'SP.POP.TOTL' ? Number.isSafeInteger(row.value) && row.value >= 0 : row.value >= -100 && row.value <= 100))));
}
let refreshBusy = false;
async function liveRefresh() {
  if (refreshBusy) return;
  refreshBusy = true; S.wbStale = false;
  const st = $('status'), tx = $('statusText');
  st.className = 'status'; tx.textContent = 'syncing World Bank...';
  // Cache each indicator in localStorage. Without this, EVERY page load and
  // reload re-hit a free public API with a ~1 MB response -- slow for the reader
  // and the first thing that would break under real traffic (the API throttles
  // long before bandwidth ever costs anything). The figures are annual, so a
  // 6-hour window loses nothing.
  const pull = async code => {
    const key = 'wb_' + code, now = Date.now();
    let cached = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw && raw.length <= 4 * 1024 * 1024) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.t === 'number' && Number.isFinite(parsed.t) && parsed.t > 0 && parsed.t <= now && validWBRows(parsed.rows, code)) cached = parsed;
      }
    } catch (e) { cached = null; }
    if (cached && cached.rows && now - cached.t < WB_TTL_MS) return cached.rows;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const r = await fetch(`${WB}/country/all/indicator/${code}?format=json&per_page=20000&mrnev=1`, {signal:controller.signal});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rows = (await r.json())[1];
      if (!validWBRows(rows, code)) throw new Error('Invalid World Bank data; keeping verified values.');
      // Quota is ~5 MB; two indicators fit easily, but never let a write failure
      // break the refresh -- the data is already in hand at this point.
      try { localStorage.setItem(key, JSON.stringify({ t: now, rows })); } catch (e) {}
      return rows;
    } catch (e) {
      // STALE IS BETTER THAN NOTHING: if the API is down or throttling, serve the
      // old copy rather than falling back to the build-time seed.
      if (cached && cached.rows) { S.wbStale = true; return cached.rows; }
      throw e;
    } finally { clearTimeout(timeout); }
  };
  try {
    const [pop, grow] = await Promise.all([pull('SP.POP.TOTL'), pull('SP.POP.GROW')]);
    let upd = 0, newer = 0;
    const apply = (rows, key) => rows.forEach(row => {
      const iso = row.countryiso3code, v = row.value, y = +row.date;
      if (v == null) return;
      const t = iso === 'WLD' ? S.data.world : ownCountry(iso) ? S.data.countries[iso] : null;
      if (!t) return;
      if (t[key + 'Year'] == null || y >= t[key + 'Year']) {
        if (y > (t[key + 'Year'] || 0)) newer++;
        t[key] = v; t[key + 'Year'] = y; upd++;
      }
    });
    apply(pop, 'pop'); apply(grow, 'growth');
    S.lastLive = Date.now();
    st.className = 'status live' + (S.wbStale ? ' err' : '');
    tx.textContent = `live · World Bank · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    st.title = (S.wbStale
                ? 'api.worldbank.org unreachable — showing the last good copy from your browser cache.\n'
                : '') +
               `${upd} values confirmed from the World Bank Indicators API` +
               (newer ? `, ${newer} newer than the cached seed` : ' (cache already current)') +
               `\nReference year: ${S.data.world.popYear} · re-checks every 30 min`;
    paintMap(); renderRanks();
    if (S.sel) {
      fillPanel(S.sel);
      if (S.city && S.city.iso === S.sel) {
        const ct = (S.cities[S.sel] || [])[S.city.i];
        if (ct) renderCity(S.sel, ct, S.city.i);
      }
    }
  } catch (e) {
    S.lastLive = Date.now();
    $('status').className = 'status err';
    tx.textContent = 'offline · cached seed';
    st.title = 'Could not reach api.worldbank.org (' + e.message +
               '). Showing the cached seed built ' + new Date(S.data.generated).toLocaleString() + '.';
  } finally { refreshBusy = false; }
}

/* ═══════════════════════════ MAP ═══════════════════════════ */
let svg, gRoot, gCountries, gCities, gLabels, path, proj, zoom;

/* ── country name labels ───────────────────────────────────────────
   Anchored on each country's LARGEST landmass, not the centroid of all its
   parts: France's overall centroid sits in the Atlantic because of French
   Guiana and Réunion, and the USA's is dragged west by Alaska and Hawaii.
   Labels live inside the zoom group so panning costs nothing; only their
   counter-scale is rewritten, and only when the zoom has changed materially. */
function largestPart(f) {
  const g = f.geometry;
  if (!g) return null;
  if (g.type !== 'MultiPolygon') return g;
  let best = null, bestA = -1;
  for (const coords of g.coordinates) {
    const poly = { type: 'Polygon', coordinates: coords };
    const a = d3.geoArea(poly);
    if (a > bestA) { bestA = a; best = poly; }
  }
  return best;
}
/* A few landmasses in the basemap have no World Bank entry, so they carried no
   name at all. Taiwan in particular is far too prominent to leave blank. Keyed
   by the Natural Earth numeric id. */
/* Standard atlas abbreviations. Long names are what actually collide on the map:
   "Bosnia and Herzegovina" is 22 characters over a country ~50px wide, and it was
   painting straight over Italy. */
const SHORT_NAMES = {
  'Bosnia and Herzegovina': 'Bosnia & Herz.', 'Central African Republic': 'C.A.R.',
  'United Arab Emirates': 'U.A.E.', 'Dominican Republic': 'Dom. Rep.',
  'Papua New Guinea': 'Papua N.G.', 'North Macedonia': 'N. Macedonia',
  'Equatorial Guinea': 'Eq. Guinea', 'Trinidad and Tobago': 'Trinidad',
  'Antigua and Barbuda': 'Antigua', 'Solomon Islands': 'Solomon Is.',
  'Marshall Islands': 'Marshall Is.',
  'Saint Vincent and the Grenadines': 'St. Vincent',
  'Saint Kitts and Nevis': 'St. Kitts',
  'Turks and Caicos Islands': 'Turks & Caicos',
  'British Virgin Islands': 'Br. Virgin Is.',
  'Northern Mariana Islands': 'N. Mariana Is.',
  'Federated States of Micronesia': 'Micronesia',
  'Republic of the Congo': 'Congo',
  'Democratic Republic of the Congo': 'DR Congo',
  'Fr. S. Antarctic Lands': 'Fr. S. Ant. Lands'
};

const EXTRA_NAMES = {
  '158': 'Taiwan', '732': 'W. Sahara', '238': 'Falkland Is.',
  '260': 'Fr. S. Antarctic Lands', '010': 'Antarctica'
};

function buildLabelAnchors() {
  S.labels = [];
  for (const f of S.feats) {
    const c = f.iso3 ? S.data.countries[f.iso3] : null;
    let name = c ? (c.common || c.name) : EXTRA_NAMES[String(f.id)];
    if (!name) continue;
    name = SHORT_NAMES[name] || name;
    const part = largestPart(f);
    if (!part) continue;
    const ll = d3.geoCentroid(part), gb = d3.geoBounds(part);
    if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) continue;
    // angular size (deg) of the main landmass — converted to px per zoom in visibleLabels
    const aw = Math.min(180, Math.abs(gb[1][0] - gb[0][0])) * Math.cos(ll[1] * Math.PI / 180), ah = Math.abs(gb[1][1] - gb[0][1]);
    S.labels.push({ iso: f.iso3 || ('id' + f.id), name, len: name.length, ll, aw, ah, part, nodata: !c });
  }
  S.labels.sort((a, b) => b.aw * b.ah - a.aw * a.ah);   // biggest first
  labelK = 0;
  renderLabels();
}

/* Which names fit at this zoom?
   The first rule demanded a country be WIDER on screen than its own text, which
   silently dropped every tall-and-narrow one: Portugal (94px tall, only 44 wide),
   Bosnia, Netherlands, Switzerland, Denmark, Albania, Slovenia, Montenegro,
   Kosovo, Cyprus - all clearly visible yet unnamed. Real maps happily let a label
   overhang a small country, so the test is now the geometric mean of the
   on-screen box against a threshold that RELAXES as you zoom in, plus greedy
   collision rejection so the extra names never pile up on each other.
   Off-screen countries are culled first, otherwise the cap is spent on the
   largest countries globally rather than the ones in view. The focused country is
   always named, wherever it is and however small. */
function visibleLabels() {
  const k = S.k || 1, out = [], boxes = [];
  const stage = $('mapStage');
  const W = stage ? stage.clientWidth : 0, H = stage ? stage.clientHeight : 0;
  const centre = [-CAM.lon, -CAM.lat].map(v => -v);       // [lon, lat] the globe is facing
  const pxPerDeg = proj ? proj.scale() * Math.PI / 180 : 1; // px per degree at the globe's centre
  // Falls off steeply with zoom: strict at world view so it stays readable,
  // permissive once you are in close enough to have room.
  const need = Math.max(9, 38 - 4.6 * (k - 1));       // px, geometric mean

  const hits = (x, y, w, h) => {
    for (const b of boxes) {
      // Reject only a SUBSTANTIAL overlap: insisting on zero contact meant dense
      // regions lost their smaller members entirely. Real atlases let
      // neighbouring labels almost touch.
      if (Math.abs(x - b.x) < (w + b.w) / 2 * 1.0 &&
          Math.abs(y - b.y) < (h + b.h) / 2 * 0.95) return true;
    }
    return false;
  };
  const place = (L, force) => {
    // back of the globe: never label (the focused country is brought to the front by the camera)
    const ang = d3.geoDistance(L.ll, centre);
    if (ang > Math.PI / 2 - 0.03) return;
    const pt = proj(L.ll); if (!pt) return;
    const x = pt[0], y0 = pt[1];
    L.sx = x; L.sy = y0; L.fore = Math.cos(ang);           // foreshortening 1 → 0 at the rim
    // the focused label is never culled: the invariant "the country being talked
    // about is named" must hold even while the camera is still flying to it
    if (!force && W && H && !(x > -60 && x < W + 60 && y0 > -24 && y0 < H + 24)) return;
    const fs = force ? 14.5 : 10;
    const w = L.len * fs * 0.54, h = fs * 1.25;
    let dy = 0;
    if (!force) {
      // Nudge vertically before giving up — this is what a real label engine
      // does, and it is what finally fitted Bosnia and North Macedonia in
      // between Serbia, Croatia and Greece.
      const tries = [0, -11, 11, -21, 21, -31, 31];
      dy = tries.find(d => !hits(x, y0 + d, w, h));
      if (dy === undefined) return;
    }
    boxes.push({ x, y: y0 + dy, w, h });
    L.dy = dy;
    out.push(L);
  };

  for (const L of S.labels) if (L.iso === S.focusIso) place(L, true);
  if (S.showLabels) {
    for (const L of S.labels) {
      if (L.iso === S.focusIso) continue;
      // on-screen size ≈ angular size × px/deg × foreshortening (rim countries look thinner)
      const c0 = Math.cos(d3.geoDistance(L.ll, centre));
      if (Math.sqrt(Math.max(1e-6, L.aw * L.ah * c0)) * pxPerDeg * 0.9 < need) continue;
      place(L, false);
      if (out.length >= 90) break;
    }
  }
  return out;
}
let labelK = 0, labelX = 0, labelY = 0;
function renderLabels() {
  if (!gLabels || !proj) return;
  gLabels.selectAll('text').data(visibleLabels(), d => d.iso)
    .join(en => en.append('text').attr('class', 'clabel').text(d => d.name))
    .attr('class', d => 'clabel' + (d.iso === S.focusIso ? ' focus' : ''))
    .attr('opacity', d => d.iso === S.focusIso ? 1 : Math.min(1, 0.35 + d.fore))
    .attr('transform', d => `translate(${d.sx},${d.sy + (d.dy || 0)})`);
  labelK = S.k || 1; labelX = CAM.lon; labelY = CAM.lat;
}
/* On zoom/pan the positions are already handled by the group transform, so this
   only re-picks the visible SET and rewrites the counter-scale — and only once
   the view has moved enough to change what should be on screen. Two cheap
   comparisons per frame instead of touching every label. */
function scaleLabels(force) {
  if (!gLabels) return;
  const k = S.k || 1;
  if (!force && labelK) {
    const moved = Math.abs(CAM.lon - labelX) + Math.abs(CAM.lat - labelY);   // degrees turned
    if (Math.abs(Math.log(k / labelK)) < 0.06 && moved < 6 / k) { positionLabels(); return; }
  }
  renderLabels();
}
/* every frame: move the already-chosen labels with the globe (cheap), hide any that
   rotated onto the back; the SET is re-picked by scaleLabels only when needed */
function positionLabels() {
  if (!gLabels || !proj) return;
  const centre = [CAM.lon, CAM.lat];
  gLabels.selectAll('text').each(function (d) {
    const ang = d3.geoDistance(d.ll, centre), pt = proj(d.ll);
    const back = ang > Math.PI / 2 - 0.03 || !pt;
    this.setAttribute('display', back ? 'none' : null);
    if (!back) { d.fore = Math.cos(ang); this.setAttribute('transform', `translate(${pt[0]},${pt[1] + (d.dy || 0)})`); this.setAttribute('opacity', d.iso === S.focusIso ? 1 : Math.min(1, 0.35 + d.fore)); }
  });
}
function setFocusLabel(iso) {
  if (S.focusIso === iso) return;
  S.focusIso = iso || null;
  renderLabels();
}
function setLabels(on) {
  S.showLabels = !!on;
  const chk = $('chkNames'); if (chk) chk.classList.toggle('on', S.showLabels);
  renderLabels();
}

function drawMap() {
  const stage = $('mapStage');
  svg = d3.select('#map');
  const W = stage.clientWidth, H = stage.clientHeight;
  svg.attr('viewBox', `0 0 ${W} ${H}`);

  proj = d3.geoOrthographic().clipAngle(90).precision(0.5);
  path = d3.geoPath(proj);
  fitProjection(W, H);

  gRoot = svg.append('g');
  // atmosphere halo + ocean gradient (defs), then the sphere itself
  const defs = svg.append('defs');
  const og = defs.append('radialGradient').attr('id', 'oceanG').attr('cx', '38%').attr('cy', '34%').attr('r', '72%');
  og.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(70,120,190,.55)');
  og.append('stop').attr('offset', '70%').attr('stop-color', 'rgba(22,44,90,.62)');
  og.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(8,16,36,.9)');
  const hg = defs.append('radialGradient').attr('id', 'haloG');
  hg.append('stop').attr('offset', '82%').attr('stop-color', 'rgba(34,211,238,0)');
  hg.append('stop').attr('offset', '92%').attr('stop-color', 'rgba(34,211,238,.22)');
  hg.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(34,211,238,0)');
  gRoot.append('circle').attr('class', 'halo').attr('fill', 'url(#haloG)');
  gRoot.append('path').attr('class', 'sphere').attr('fill', 'url(#oceanG)').attr('d', path({ type: 'Sphere' }));
  gRoot.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule10()));
  placeHalo();

  gCountries = gRoot.append('g');
  gCountries.selectAll('path').data(S.feats).join('path')
    .attr('class', d => 'country' + (d.iso3 ? '' : ' nodata'))
    .attr('data-iso', d => d.iso3 || null)
    .attr('d', path)
    .on('mousemove', onHover)
    .on('mouseleave', () => $('tooltip').hidden = true)
    .on('click', (ev, d) => { if (d.iso3) openPanel(d.iso3, true); });

  gCities = gRoot.append('g').attr('display', 'none');
  drawCityDots();

  gLabels = gRoot.append('g').attr('class', 'labels');
  buildLabelAnchors();

  zoom = d3.zoom().scaleExtent([1, 14])
    // Cooperative touch gestures: a single finger must scroll the PAGE, never
    // get trapped panning the map. Only a two-finger touch pans/zooms the map.
    // Desktop wheel-zoom and left-drag pan are kept exactly as d3's default.
    .filter(ev => {
      if (ev.type && ev.type.indexOf('touch') === 0)
        return ev.touches && ev.touches.length >= 2;
      return (!ev.ctrlKey || ev.type === 'wheel') && !ev.button;
    })
    .on('start', ev => {
      svg.classed('drag', true);
      lastT = d3.zoomTransform(svg.node());
      // a real pointer/wheel gesture: drop any programmatic camera move so the
      // user's hand always wins, stop the idle spin, and let stream mode know
      if (ev.sourceEvent) {
        svg.interrupt('cam'); stopSpin();
        if (S.onUserZoom) S.onUserZoom();
      }
    })
    .on('end', () => { svg.classed('drag', false); sizeDots(true); scaleLabels(true); })
    .on('zoom', ev => {
      // d3-zoom is used only as a gesture recogniser: its translate DELTA turns the
      // globe, its k is the zoom. Programmatic transform syncs (no sourceEvent)
      // must not rotate — they only realign k after a camera flight.
      const t = ev.transform;
      if (ev.sourceEvent && lastT) {
        const sens = 0.28 / Math.sqrt(t.k) * (600 / (proj.scale() || 300));   // deg per px, slower when zoomed
        CAM.lon += (t.x - lastT.x) * sens;
        CAM.lat = Math.max(-85, Math.min(85, CAM.lat - (t.y - lastT.y) * sens));
      }
      lastT = t; CAM.k = t.k;
      applyCam();
      sizeDots(false);
      scaleLabels(false);
    });
  svg.call(zoom);

  paintMap();
  new ResizeObserver(() => resize()).observe(stage);
  startSpin();
}

/* ── globe camera ─────────────────────────────────────────────── */
const CAM = { lon: 20, lat: 18, k: 1 };          // where the globe faces + zoom (1 = whole globe)
let lastT = null, baseR = 200, spinRAF = 0, spinLast = 0;
function applyCam() {
  if (!proj) return;
  CAM.lon = ((CAM.lon + 540) % 360) - 180;
  proj.rotate([-CAM.lon, -CAM.lat]).scale(baseR * CAM.k);
  S.k = CAM.k;
  redrawGlobe();
}
function redrawGlobe() {
  gRoot.select('.sphere').attr('d', path({ type: 'Sphere' }));
  gRoot.select('.graticule').attr('d', path(d3.geoGraticule10()));
  gCountries.selectAll('path').attr('d', path);
  if (S.showCities) positionDots();
  positionLabels();
  placeHalo();
}
function placeHalo() {
  const t = proj.translate(), r = proj.scale();
  gRoot.select('.halo').attr('cx', t[0]).attr('cy', t[1]).attr('r', r * 1.12);
}
function positionDots() {
  const centre = [CAM.lon, CAM.lat];
  gCities.selectAll('circle').each(function (d) {
    const ll = [d.lo, d.la], back = d3.geoDistance(ll, centre) > Math.PI / 2 - 0.02;
    this.setAttribute('display', back ? 'none' : null);
    if (!back) { const p = proj(ll); this.setAttribute('cx', p[0]); this.setAttribute('cy', p[1]); }
  });
}
/* idle spin: the globe turns slowly until the visitor touches it, opens a country,
   or something else takes the camera. Cheap engagement; reduced-motion respects. */
function startSpin() {
  if (spinRAF || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  spinLast = performance.now();
  const step = now => {
    const dt = Math.min(80, now - spinLast); spinLast = now;
    if (CAM.k <= 1.02 && !S.sel && !document.hidden) { CAM.lon += dt * 0.0045; applyCam(); }
    spinRAF = requestAnimationFrame(step);
  };
  spinRAF = requestAnimationFrame(step);
}
function stopSpin() { if (spinRAF) cancelAnimationFrame(spinRAF); spinRAF = 0; }
/* pick the largest landmass so France means France, not French Guiana */
function mainPart(iso) { const f = S.byIso[iso]; return f ? (largestPart(f) || f) : null; }

/* resize city dots against the current scale, but only when it is worth it */
let dotK = 1;
function sizeDots(force) {
  if (!gCities || !S.showCities) return;
  const k = S.k || 1;
  if (!force && Math.abs(Math.log(k / dotK)) < 0.12) return;   // <~12% change
  dotK = k;
  gCities.selectAll('circle').attr('r', d => Math.max(.5, dotR(d.p) / Math.sqrt(k)));
}

function fitProjection(W, H) {
  baseR = Math.max(60, Math.min(W, H) / 2 - 14);
  proj.translate([W / 2, H / 2]).rotate([-CAM.lon, -CAM.lat]).scale(baseR * CAM.k);
}
function resize() {
  const stage = $('mapStage'), W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H || !gCountries) return;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  fitProjection(W, H);
  redrawGlobe();
  renderLabels();
}

const dotR = p => Math.max(1.1, Math.sqrt(p) / 480);
function drawCityDots() {
  const all = [];
  for (const iso in S.cIndex) all.push(...cityTop(iso).slice(0, 12).map(c => Object.assign({ iso }, c)));
  all.sort((a, b) => b.p - a.p);
  gCities.selectAll('circle').data(all).join('circle')
    .attr('class', 'citydot')
    .attr('r', d => dotR(d.p));
  positionDots();
}

/* ── choropleth modes ─────────────────────────────────────────── */
const MODES = {
  pop: {
    get label() { return S.year != null ? 'Population in ' + S.year : 'Population (live)'; }, ticks: ['50K', '600K', '7M', '90M', '1.4B'],
    val: c => (S.year != null && window.WPTL) ? window.WPTL.value(c.iso3, S.year) : livePop(c), scale: d3.scaleLog().domain([5e4, 1.45e9]).clamp(true),
    interp: t => d3.interpolateTurbo(0.08 + t * 0.9), fmt: v => int(v) + ' people'
  },
  growth: {
    label: 'Annual growth rate', ticks: ['−2%', '−0.5%', '+1%', '+2.5%', '+4%'], diverge: true,
    val: c => c.growth, scale: d3.scaleLinear().domain([-2, 4]).clamp(true),
    interp: t => d3.interpolateRdYlGn(t), fmt: v => pct(v) + ' / year'
  },
  density: {
    label: 'People per km2', ticks: ['1', '10', '100', '1K', '8K+'],
    val: c => c.density, scale: d3.scaleLog().domain([1, 8000]).clamp(true),
    interp: d3.interpolateViridis, fmt: v => nf1.format(v) + ' /km2'
  },
  age: {
    label: 'Share aged 65+', ticks: ['1%', '8%', '15%', '23%', '30%'],
    val: c => c.age65up, scale: d3.scaleLinear().domain([1, 30]).clamp(true),
    interp: d3.interpolatePlasma, fmt: v => nf1.format(v) + '% aged 65+'
  }
};

const NODATA = () => getComputedStyle(document.documentElement)
  .getPropertyValue('--nodata').trim() || '#1b2438';

function colorOf(iso) {
  const m = MODES[S.mode], c = S.data.countries[iso];
  if (!c) return NODATA();
  const v = m.val(c);
  if (v == null || (m.scale.domain()[0] > 0 && v <= 0)) return NODATA();
  return m.interp(m.scale(v));
}

function paintMap() {
  gCountries.selectAll('path').attr('fill', d => d.iso3 ? colorOf(d.iso3) : NODATA())
    .classed('sel', d => d.iso3 && d.iso3 === S.sel);
  const m = MODES[S.mode], stops = d3.range(0, 1.001, .05)
    .map(t => m.interp(m.diverge ? t : t)).join(',');
  $('legend').innerHTML =
    `<div class="lt">${m.label}</div><div class="bar" style="background:linear-gradient(90deg,${stops})"></div>` +
    `<div class="ticks">${m.ticks.map(t => `<span>${t}</span>`).join('')}</div>` +
    `<div class="ticks" style="margin-top:6px;color:var(--tx3)"><span style="display:flex;gap:5px;align-items:center">` +
    `<i style="width:9px;height:9px;background:${NODATA()};border:1px solid rgba(255,255,255,.2);border-radius:2px;display:inline-block"></i>no data</span></div>`;
}

/* ── tooltip ─────────────────────────────────────────────────── */
function onHover(ev, d) {
  const tp = $('tooltip'), stage = $('mapStage');
  if (!d.iso3) {
    tp.hidden = false;
    tp.innerHTML = `<div class="tn">${esc(d.properties.name)}</div>` +
      `<div class="tg">Not a World Bank reporting economy —<br>no population series available.</div>`;
  } else {
    const c = S.data.countries[d.iso3], p = livePop(c);
    const annual = p * (c.growth || 0) / 100;
    tp.hidden = false;
    tp.innerHTML =
      `<div class="tn">${fl(c)} ${esc(c.common || c.name)}</div>` +
      `<div class="tr"><span>Population</span><b>${int(p)}</b></div>` +
      `<div class="tr"><span>Growth</span><b style="color:${(c.growth || 0) >= 0 ? 'var(--up)' : 'var(--down)'}">${pct(c.growth || 0)}</b></div>` +
      `<div class="tr"><span>Per year</span><b>${shortS(annual)}</b></div>` +
      (c.density != null ? `<div class="tr"><span>Density</span><b>${nf1.format(c.density)}/km2</b></div>` : '') +
      `<div class="tg">${int(cityCount(d.iso3))} cities · click for detail</div>`;
  }
  const r = stage.getBoundingClientRect(), tw = tp.offsetWidth, th = tp.offsetHeight;
  let x = ev.clientX - r.left + 16, y = ev.clientY - r.top + 14;
  if (x + tw > r.width - 8) x = ev.clientX - r.left - tw - 16;
  if (y + th > r.height - 8) y = ev.clientY - r.top - th - 14;
  tp.style.left = Math.max(6, x) + 'px'; tp.style.top = Math.max(6, y) + 'px';
}

/* ═══════════════════════════ SIDEBAR ═══════════════════════════ */
/* ── league tables, driven by the chosen map mode ─────────────────
   Each choropleth mode gets its own pair of tables, so the card always answers a
   question about the map you are actually looking at rather than always showing
   growth. `units` is the toggle; a mode with a single unit hides the switch, and
   the FIRST unit is that mode's default — which is why Population opens on
   people/year while Growth rate opens on %/year. `signed` marks the metrics where
   a negative value is meaningful, so crowding and ageing are not painted with
   red/green arrows that would imply good and bad. */
const RANKS = {
  /* A mode must never offer a unit that IS another mode's own metric. Offering
     people/year here made the Growth-rate table byte-identical to the Population
     table, and %/year on Population duplicated Growth-rate the same way -- two
     buttons that silently produced a different mode's view. The map mode IS the
     unit selector now. Ageing keeps a second unit because a headcount of over-65s
     is a genuinely different quantity, not another mode's table. */
  pop: {
    title: 'Fastest changing', hi: 'Fastest growing', lo: 'Fastest shrinking',
    units: [{ k: 'abs', lbl: 'people / year' }],
    ok: c => c.growth != null,
    val: c => livePop(c) * c.growth / 100,
    fmt: c => shortS(livePop(c) * c.growth / 100),
    signed: true
  },
  growth: {
    title: 'Growth and decline', hi: 'Fastest growing', lo: 'Fastest shrinking',
    units: [{ k: 'pct', lbl: '% / year' }],
    ok: c => c.growth != null,
    val: c => c.growth,
    fmt: c => pct(c.growth),
    signed: true
  },
  density: {
    title: 'Crowding', hi: 'Most crowded', lo: 'Most sparse',
    units: [{ k: 'km2', lbl: 'people / km2' }],
    ok: c => c.density != null && c.density > 0,
    val: c => c.density,
    fmt: c => nf1.format(c.density) + ' /km2',
    signed: false
  },
  age: {
    title: 'Ageing', hi: 'Oldest populations', lo: 'Youngest populations',
    units: [{ k: 'pct', lbl: '% over 65' }, { k: 'abs', lbl: 'people over 65' }],
    ok: c => c.age65up != null,
    val: (c, u) => u === 'pct' ? c.age65up : livePop(c) * c.age65up / 100,
    fmt: (c, u) => u === 'pct' ? nf1.format(c.age65up) + '%'
      : short(livePop(c) * c.age65up / 100),
    signed: false
  }
};

/* the chosen unit is remembered PER MODE, so switching away and back does not
   silently reset what you were reading */
function rankUnit() {
  const r = RANKS[S.mode];
  return (S.rankUnit && S.rankUnit[S.mode]) || r.units[0].k;
}
function eligible(r) {
  const test = (r || RANKS[S.mode]).ok;
  return Object.values(S.data.countries).filter(c => c.pop >= 300000 && test(c));
}
function buildRankSwitch() {
  const r = RANKS[S.mode], u = rankUnit(), box = $('rankSwitch'), note = $('rankUnit');
  // With one unit there is nothing to choose, but the reader still needs to know
  // what the figures ARE ("+13.1M" of what, per what?) -- so show a plain caption
  // instead of a button that looks clickable and is not.
  const single = r.units.length < 2;
  box.hidden = single;
  box.innerHTML = single ? '' : r.units.map(x =>
    `<button class="${x.k === u ? 'active' : ''}" data-rank="${x.k}">${x.lbl}</button>`).join('');
  if (note) {
    note.hidden = !single;
    note.textContent = single ? r.units[0].lbl : '';
  }
  $('rankTitle').textContent = r.title;
  $('rankHi').textContent = r.hi;
  $('rankLo').textContent = r.lo;
  $('rankHi').className = r.signed ? 'up' : '';
  $('rankLo').className = r.signed ? 'down' : '';
}
function renderRanks() {
  const r = RANKS[S.mode], u = rankUnit();
  buildRankSwitch();
  const sorted = eligible(r).slice()
    .sort((a, b) => r.val(b, u) - r.val(a, u));
  const fmt = c => r.fmt(c, u);
  const sign = c => r.signed ? (r.val(c, u) >= 0 ? 'p' : 'n') : '';
  paintRank($('topGrow'), sorted.slice(0, 8), fmt, sign);
  paintRank($('topShrink'), sorted.slice(-8).reverse(), fmt, sign);

  const big = Object.values(S.data.countries).filter(c => c.pop).sort((a, b) => b.pop - a.pop).slice(0, 10);
  const max = livePop(big[0]);
  // framing the ten as a share of humanity is the hook: the raw list of figures
  // read as a caption, this gives it a headline
  const worldNow = livePop(S.data.world);
  const tenSum = big.reduce((t, c) => t + livePop(c), 0);
  const shareEl = $('popShare');
  if (shareEl) shareEl.innerHTML = 'These ten are home to <b>' +
    nf1.format(tenSum / worldNow * 100) + '%</b> of everyone alive';
  $('topPop').innerHTML = '';
  // At ten across, a cell is ~104px and the name gets ~60px of it. Only these
  // are too long; the flag plus the figure still identify the country.
  const STRIP_SHORT = { 'United States': 'USA', 'United Kingdom': 'UK',
    'Democratic Republic of the Congo': 'DR Congo', 'United Arab Emirates': 'UAE' };
  big.forEach((c, i) => {
    // exact digits, not a 1.48B short form: a rounded figure never visibly moves,
    // which wastes the fact that these count up live
    const li = el('li', '', `<div class="ps-top"><span class="rk">${i + 1}</span>${fl(c)}` +
      `<span class="nm">${esc(STRIP_SHORT[c.common || c.name] || c.common || c.name)}</span></div>` +
      `<b class="ps-n" data-live="pop" data-iso="${c.iso3}">${int(livePop(c))}</b>` +
      `<div class="ps-foot"><div class="trackbar"><i style="width:` +
      `${(livePop(c) / max * 100).toFixed(1)}%"></i></div>` +
      `<em>${nf1.format(livePop(c) / worldNow * 100)}%</em></div>`);
    if (i === 0) li.className = 'lead';        // one strong focal point
    li.title = `${c.common || c.name} - ${int(livePop(c))} people - ` +
      `${pct(c.growth || 0)} per year`;
    li.onclick = () => openPanel(c.iso3, true);
    $('topPop').appendChild(li);
  });
}
function paintRank(ol, arr, fmt, sign) {
  ol.innerHTML = '';
  arr.forEach((c, i) => {
    const li = el('li', '', `<span class="rk">${i + 1}</span>${fl(c)}` +
      `<span class="nm">${esc(c.common || c.name)}</span>` +
      `<span class="vl2 ${sign ? sign(c) : (c.growth >= 0 ? 'p' : 'n')}">${fmt(c)}</span>`);
    li.title = `${c.common || c.name} · ${int(livePop(c))} people · ${pct(c.growth)} per year (${c.growthYear})`;
    li.onclick = () => openPanel(c.iso3, true);
    ol.appendChild(li);
  });
}

/* ═══════════════════════════ TICKER ═══════════════════════════ */
function tick() {
  const now = Date.now(), w = S.data.world, p = livePop(w, now);
  $('wcNumber').textContent = int(p);
  const bps = perSec(p, w.birthRate), dps = perSec(p, w.deathRate);
  const nps = p * (w.growth / 100) / YEAR_S, st = secsToday();
  $('wcGrowthToday').textContent = sgn(nps * st);
  $('wcRate').textContent = `${nf1.format(nps)} net / second`;
  $('vBirths').textContent = int(bps * st);
  $('vDeaths').textContent = int(dps * st);
  $('vNet').textContent = sgn(nps * st);
  $('vBirthsY').textContent = int(bps * secsThisYear());
  $('vBirthsRate').textContent = nf1.format(bps) + ' / sec';
  $('vDeathsRate').textContent = nf1.format(dps) + ' / sec';
  $('vNetRate').textContent = int(nps * 3600) + ' / hour';

  document.querySelectorAll('[data-live="pop"]').forEach(n => {
    const c = S.data.countries[n.dataset.iso];
    if (c) n.textContent = int(livePop(c, now));      // exact, so it ticks visibly
  });

  const ss = sessionStats();
  const sb = $('sessBorn');
  if (sb && ss.secs > 1.5) {
    $('sessWrap').hidden = false;
    sb.textContent = int(ss.born);
    $('sessNet').textContent = sgn(ss.net);
    $('sessTime').textContent = ss.secs < 90
      ? Math.round(ss.secs) + ' seconds'
      : Math.round(ss.secs / 60) + ' minutes';
  }

  if (S.sel) {
    const c = S.data.countries[S.sel], cp = livePop(c, now);
    $('pPop').textContent = int(cp);
    const a = cp * (c.growth || 0) / 100;
    $('pPopSub').textContent = `${shortS(a)} per year · ${pct(c.growth || 0)} · ` +
      `${a >= 0 ? '+' : '−'}${nf2.format(Math.abs(a / YEAR_S))} / second` +
      (S.year != null && window.WPTL && window.WPTL.value(c.iso3, S.year) != null
        ? ` · in ${S.year}: ${int(window.WPTL.value(c.iso3, S.year))} (${window.WPTL.source(S.year)})` : '');
    $('pBirths').textContent = int(perSec(cp, c.birthRate) * 86400);
    $('pDeaths').textContent = int(perSec(cp, c.deathRate) * 86400);
    const f = cp / c.pop;
    document.querySelectorAll('#pCities [data-cp]').forEach(n => {
      const ct = (S.cities[S.sel] || [])[+n.dataset.cityIndex];
      n.textContent = ct ? int(liveCity(ct, c, now)) : '—';
    });
    if (S.city && S.city.iso === S.sel) {
      const ct = (S.cities[S.city.iso] || [])[S.city.i];
      if (ct) {
        const el2 = $('cvPop');
        if (el2) el2.textContent = int(liveCity(ct, c, now));
        // District values have unknown reference dates: static, with null preserved.
      }
    }
  }
}

/* ═══════════════════════════ PANEL ═══════════════════════════ */
let panelRequest = 0;
function applyHash() {
  if (!S.cityDataReady && /^#(?:play|quiz|where|watch)(?:[\/]|$)/i.test(location.hash)) { reportCityDataError(S.cityDataError); return; }
  let raw;
  if (location.hash.length > 4096) { inputNotice('This link is too long. Choose a country or use search.'); return; }
  try { raw = decodeURIComponent((location.hash || '').slice(1)).trim(); }
  catch (_) { inputNotice('This link is not valid. Choose a country or use search.'); return; }
  if (!raw) return;
  // #stream / #watch launches the ambient feed straight away (second monitor, TV)
  if (/^(stream|watch|live)$/i.test(raw)) {
    if (window.WPSTREAM) window.WPSTREAM.open();
    return;
  }
  // #where/ISO/City opens "Where are you in humanity?"
  if (/^where\//i.test(raw)) { if (window.WPWHERE) window.WPWHERE.openHash(raw); return; }
  // #time/1900 opens the time machine at that year
  if (/^time(\/\d{4})?$/i.test(raw)) { if (window.WPTL) window.WPTL.openHash(raw); return; }
  // #quiz (daily) / #quiz/new opens the humanity quiz inside the game overlay
  if (/^quiz(\/.*)?$/i.test(raw)) {
    if (!window.WPGAME) return;
    const m = /^quiz\/room\/([A-Z0-9]{4,8})$/i.exec(raw);
    if (m) window.WPGAME.openQuiz({ room: m[1].toUpperCase() });
    else if (/party$/i.test(raw)) window.WPGAME.openQuiz({ party: true });
    else window.WPGAME.openQuiz({ random: /new$/i.test(raw) });
    return;
  }
  // #play opens the game (country pages link here)
  if (/^play$/i.test(raw)) { if (window.WPGAME) window.WPGAME.open(); return; }
  // #born/YYYY-MM-DD[/ISO3] opens the birth-date read-out (shared links land here)
  if (/^born(\/|$)/i.test(raw)) {
    if (window.WPBORN) window.WPBORN.openHash(raw);
    return;
  }
  const [cpart, citypart] = raw.split('/');
  const h = (cpart || '').toUpperCase();
  let iso = ownCountry(h) ? h : null;
  if (!iso) {
    const m = Object.values(S.data.countries)
      .find(c => (c.common || c.name).toUpperCase() === h || c.iso2 === h);
    if (m) iso = m.iso3;
  }
  if (!iso) return;
  if (S.sel !== iso) openPanel(iso, true);
  const ticket = ++panelRequest;
  if (citypart) loadCities(iso).then(list => {
    if (S.sel !== iso || ticket !== panelRequest) return;
    const i = list.findIndex(x => x.n.toLowerCase() === citypart.toLowerCase());
    if (i >= 0) openCity(iso, i);
  }).catch(() => {});
}
function openPanel(iso, zoomTo) {
  if (!ownCountry(iso)) { inputNotice("Choose a valid country."); return; }
  panelRequest++; S.sel = iso; stopSpin();
  S.city = null;
  $('cityView').hidden = true;
  $('countryView').hidden = false;
  $('panel').hidden = false; $('scrim').hidden = false;
  $('panel').scrollTop = 0;
  fillPanel(iso); paintMap(); tick();
  const pf = $('pFull');                   // static country page (built by build_pages.py)
  if (pf) { const sl = window.COUNTRY_SLUGS && window.COUNTRY_SLUGS[iso]; pf.hidden = !sl; if (sl) pf.href = 'countries/' + sl + '/'; }
  setFocusLabel(iso);                     // name the country you are reading about
  try { history.replaceState(null, '', '#' + iso); } catch (e) {}
  if (zoomTo) zoomToCountry(iso);
}
function closePanel() {
  panelRequest++; S.sel = null; S.city = null;
  setFocusLabel(null);
  $('cityView').hidden = true; $('countryView').hidden = false;
  $('panel').hidden = true; $('scrim').hidden = true; paintMap();
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
}
function zoomToCountry(iso) { stopSpin(); camTo({ iso }, 900); }

function fillPanel(iso) {
  const c = S.data.countries[iso], cs = S.cities[iso] || [];
  $('pFlag').innerHTML = fl(c, true);
  $('pName').textContent = c.common || c.name;
  $('pMeta').textContent = [c.region, c.income, c.capital && 'Capital: ' + c.capital]
    .filter(Boolean).join(' · ');

  /* tiles */
  const T = [
    ['Growth rate', pct(c.growth || 0), c.growthYear],
    ['Density', c.density != null ? nf1.format(c.density) + ' /km2' : '—', c.densityYear],
    ['Urban', c.urbanPct != null ? nf1.format(c.urbanPct) + '%' : '—', c.urbanPctYear],
    ['Life expectancy', c.lifeExp != null ? nf1.format(c.lifeExp) + ' yrs' : '—', c.lifeExpYear],
    ['Fertility', c.fertility != null ? nf2.format(c.fertility) : '—', c.fertilityYear],
    ['Aged 0–14', c.age0014 != null ? nf1.format(c.age0014) + '%' : '—', c.age0014Year],
    ['Aged 65+', c.age65up != null ? nf1.format(c.age65up) + '%' : '—', c.age65upYear],
    ['GDP / capita', c.gdpPc != null ? '$' + short(c.gdpPc) : '—', c.gdpPcYear],
    ['Land area', c.area != null ? int(c.area) + ' km2' : '—', c.areaYear],
    ['World share', c.pop ? nf2.format(c.pop / S.data.world.pop * 100) + '%' : '—', c.popYear],
    ['World rank', '#' + (Object.values(S.data.countries).filter(x => (x.pop || 0) > c.pop).length + 1), c.popYear],
    ['Doubling time', (c.growth > .01 ? nf1.format(Math.log(2) / (c.growth / 100)) + ' yrs'
      : c.growth < -.01 ? 'halves in ' + nf1.format(Math.log(2) / (-c.growth / 100)) + ' yrs' : 'flat'), c.growthYear]
  ];
  $('pGrid').innerHTML = T.map(([l, v, y]) =>
    `<div class="tile"${y ? ` title="Data year: ${y}"` : ''}>` +
    `<div class="tl">${l}</div><div class="tv">${v}</div></div>`).join('');

  $('pMig').textContent = c.netMig != null ? shortS(c.netMig) : '—';
  drawSpark(c);

  /* city list — full per-country file, loaded on demand */
  S.cityLimit = 200;
  $('pCityCount').textContent = '· loading...';
  $('pCities').innerHTML = '<div class="fine">Loading cities...</div>';
  $('cityFilter').value = '';
  loadCities(iso).then(list => {
    if (S.sel !== iso) return;
    renderCities(iso, list);
    drawCityMap(iso, list);
  }).catch(() => {});

  $('pSrc').innerHTML =
    `<b>How this figure works</b><br>` +
    `The counter advances the World Bank ${c.popYear} estimate of ${int(c.pop)} from model anchor ${c.popYear}-07-01 continuously at ` +
    `${pct(c.growth || 0)} a year (World Bank national growth, ${c.growthYear}), using an exponential model rather than a census — treat the ` +
    `final digits as motion, not measurement.`;
}

function renderCities(iso, list, filter) {
  const c = S.data.countries[iso];
  const t = T(iso);
  const q = (filter || '').trim().toLowerCase();
  const src = q ? list.filter(x => x.n.toLowerCase().includes(q) ||
                                   (x.pv || '').toLowerCase().includes(q)) : list;
  const shown = src.slice(0, S.cityLimit);
  const folded = list.reduce((a, x) => a + (x.dn || 0), 0);

  $('pCityCount').innerHTML = list.length
    ? `· ${int(list.length)} cities &amp; towns` + (q ? ` · ${int(src.length)} match` : '')
    : '· no gazetteer entries';

  if (!list.length) {
    $('pCities').innerHTML = '<div class="fine">No settlements of 5,000 or more inhabitants ' +
      'are recorded for this territory in the GeoNames gazetteer.</div>';
    return;
  }
  let html = shown.map(ct => {
    const i = list.indexOf(ct);
    const b = cityBasis(ct, c), share = c.pop ? (b.p / c.pop * 100) : 0;
    const sub = `${b.kind} · ${b.source} · ${b.reference} · model anchor ${b.anchor}; ${b.method}. Base share / World Bank ${c.popYear}.`;
    const kids = ct.dn ? `<span class="dchip" title="Associated administrative records; membership and population coverage vary">${ct.dn} ${lc(t.sub)}</span>` : '';
    return `<div class="crow" data-i="${i}">` +
      `<span class="ck" title="List position, not a comparable population rank">${i + 1}</span>` +
      `<span class="cn">${esc(ct.n)}${ct.cap ? '<span class="badge">CAPITAL</span>' : ''}${kids}` +
      `<em class="csub">${esc(sub)}</em></span>` +
      `<span class="cp" data-cp="${b.p}" data-city-index="${i}">${int(liveCity(ct, c))}</span>` +
      `<span class="cs">${share >= .05 ? nf1.format(share) + '%' : '&lt;0.1%'}</span></div>`;
  }).join('');
  if (src.length > shown.length) {
    html += `<button class="showmore" id="showMore">Show all ${int(src.length)} &darr;</button>`;
  }
  if (!src.length) html = '<div class="fine">No city matches that filter.</div>';
  $('pCities').innerHTML = html;

  const more = $('showMore');
  if (more) more.onclick = () => { S.cityLimit = 1e6; renderCities(iso, list, filter); };
  bindCityRows();
  $('pFold').innerHTML = folded
    ? `${int(folded)} ${lc(t.sub)} (e.g. ${(list.find(x => x.dn) || {}).dl.slice(0, 3).join(', ')}) ` +
      `are associated with parent records. Populations can overlap; do not sum them.`
    : '';
  const dq = S.cIndex[iso] && S.cIndex[iso].dq;
  const warn = $('pDQ');
  if (warn) {
    warn.innerHTML = dq
      ? `<strong>Data caveat:</strong> the published figures for ${esc(c.common || c.name)} sum to ` +
        `${nf2.format(dq)}× the national population, so some entries below overlap each other ` +
        `(a city and its own quarters recorded separately). Individual figures are as published; ` +
        `do not sum these overlapping populations.`
      : '';
    warn.hidden = !dq;
  }
}
/* ═══════════════════════ CITY DRILL-DOWN ═══════════════════════ */
function openCity(iso, i) {
  const list = S.cities[iso] || [], ct = list[i];
  if (!ct) return;
  S.city = { iso, i };
  $('countryView').hidden = true;
  $('cityView').hidden = false;
  $('panel').scrollTop = 0;
  renderCity(iso, ct, i);
  cityPageLink(iso, ct.n);
  try { history.replaceState(null, '', '#' + iso + '/' + encodeURIComponent(ct.n)); } catch (e) {}
  tick();
}
function closeCity() {
  S.city = null;
  $('cityView').hidden = true;
  $('countryView').hidden = false;
  if (S.sel) { try { history.replaceState(null, '', '#' + S.sel); } catch (e) {} }
}

function renderCity(iso, ct, idx) {
  const c = S.data.countries[iso];
  const t = T(iso);
  const dz = ct.dz || [];
  const lz = ct.lz || [];
  const b = cityBasis(ct, c), p = b.p;
  const share = c.pop ? p / c.pop * 100 : 0;
  const available = dz.filter(d => d.p != null).length;
  const verified = dz.filter(d => d.population_verified === true).length;
  const coverage = ct.district_coverage;
  const cohort = (S.cities[iso] || []).filter(x => cityBasis(x, c).kind === b.kind).sort((a, z) => cityPop(z, c) - cityPop(a, c));
  const rank = cohort.indexOf(ct) + 1;
  const coverageNote = coverage
    ? `${coverage.membership_verified}/${coverage.expected} memberships checked against ${coverage.membership_source}; reference date ${coverage.reference_date || 'not supplied'}. ${available}/${dz.length} population values available; ${verified} independently verified.`
    : `Associated administrative records; completeness and containment not independently verified. ${available}/${dz.length} population values available; ${verified} independently verified.`;

  let localTime = '—';
  if (ct.tz) {
    try {
      localTime = new Intl.DateTimeFormat([], {
        timeZone: ct.tz, hour: '2-digit', minute: '2-digit'
      }).format(new Date());
    } catch (e) {}
  }
  const dms = (v, ns) => `${Math.abs(v).toFixed(3)}°${v >= 0 ? ns[0] : ns[1]}`;

  const tiles = [
    ['Base / country population', nf2.format(share) + '%', `${int(p)} / ${int(c.pop)} · World Bank ${c.popYear}; dates may differ`],
    ['Same-definition database rank', rank ? '#' + rank : '—', `of ${cohort.length} ${b.kind} records in ${c.common || c.name}; not a global city rank`],
    ['Population basis', b.kind, b.source],
    [t.adm1, ct.pv || '—', ct.ds || ''],
    ['Local time', localTime, ct.tz || ''],
    ['Coordinates', dms(ct.la, 'NS') + ' ' + dms(ct.lo, 'EW'), ''],
    [t.sub, dz.length ? int(dz.length) : 'none recorded', coverageNote],
    ['District population coverage', `${available}/${dz.length}`, `${verified} independently verified; no reconciled district total`]
  ];

  $('cityView').innerHTML =
    `<button class="backbtn" id="cityBack">&larr; ${fl(c)} ${esc(c.common || c.name)}</button>` +
    `<div class="chead"><div class="cicon">${dz.length ? '🏙️' : '🏘️'}</div><div>` +
    `<h2>${esc(ct.n)}${ct.cap ? '<span class="badge">CAPITAL</span>' : ''}</h2>` +
`<p class="pfull"><a id="cvFull" hidden>Full page: districts, nearby cities &amp; comparisons →</a> · ` +
`<a id="cvWhere" href="#where/${iso}/${encodeURIComponent(ct.n)}" data-iso="${iso}" data-n="${esc(ct.n)}">Where am I in humanity? →</a></p>` +
    `<p>${esc([typeLabel(ct.fc, t), ct.pv, c.common || c.name].filter(Boolean).join(' · '))}</p></div></div>` +

    `<div class="pcounter"><div class="pc-label"><span class="pulse"></span> Modelled ${b.kind} population</div>` +
    `<div class="pc-number" id="cvPop">${int(liveCity(ct, c))}</div>` +
    `<div class="pc-sub" id="cvSub">Base ${int(p)} · ${b.kind} · ${b.source}. ${b.reference}. ` +
    `Model anchor ${b.anchor} (not an inferred census date); ${pct(b.growth)}/yr · ${b.method}. ` +
    `Continuous exponential illustration, not a measured live count. Other geographic definitions are not interchangeable.</div></div>` +

    `<div class="pgrid">` + tiles.map(([l, v, y]) =>
      `<div class="tile"><div class="tl">${l}</div><div class="tv">${v}</div>` +
      // only render the context line when there IS context: the Classification
      // tile no longer carries one, and an empty div still costs vertical space
      (y ? `<div class="ty2">${y}</div>` : '') + `</div>`).join('') + `</div>` +

    `<div class="citymapwrap"><svg id="cityZoom"></svg></div>` +

    (dz.length
      ? `<div class="cardhead" style="margin-top:16px"><h3>${t.sub} <span class="muted">· ${dz.length} associated records</span></h3>` +
        `<input id="distFilter" class="minisearch" placeholder="Filter..."></div>` +
        `<p class="fine">${coverageNote} Population source: existing GeoNames records; population reference dates not supplied. Values are not projected or reconciled with the parent total. — means unavailable, not zero.</p>` +
        `<div class="citylist" id="cvDistricts">` + dz.map((d, i) =>
          `<div class="crow dr" data-di="${i}"><span class="ck">${i + 1}</span>` +
          `<span class="cn">${esc(d.n)}${d.de ? '<span class="badge">CENTRAL</span>' : ''}` +
          `<em class="csub">${d.km == null ? 'Coordinates unavailable' : d.km + ' km from centre'}</em></span>` +
          `<span class="cp">${int(d.p)}</span>` +
          `<span class="cs" title="Source value / parent base; dates may differ, not a verified population partition">${d.p == null || !p ? '—' : nf1.format(d.p / p * 100) + '%'}</span></div>`).join('') + `</div>` +
        `<p class="fine">Administrative membership is distinct from population verification. These figures may overlap or use different reference dates; do not sum them or assume they partition the displayed population.</p>`
      : `<p class="fine" style="margin-top:16px">No separate ${lc(t.sub1)} records are supplied for ${esc(ct.n)}.</p>`) +
    (lz.length
      ? `<details class="locbox"><summary>${lz.length} associated localities</summary>` +
        `<p class="fine">Existing GeoNames locality records, with population reference dates not supplied. Association is not polygon-verified containment. Figures may overlap; do not sum them with the parent or district populations.</p>` +
        `<div class="citylist">` + lz.map(d =>
          `<div class="crow dr"><span class="cn">${esc(d.n)}` +
          `<em class="csub">${d.u ? 'Associated with ' + d.u + ' · ' : ''}${d.km == null ? 'Coordinates unavailable' : d.km + ' km from centre'}</em></span>` +
          `<span class="cp">${int(d.p)}</span></div>`).join('') + `</div></details>` : '') +
    `<div class="psrc"><b>How this figure works</b><br>` +
    `${b.source}. ${b.reference}. Base ${int(p)}; model anchor ${b.anchor}; ${b.method} (${pct(b.growth)}/yr). ` +
    `The counter is a continuous exponential projection, not a census or measured local growth. Province, urban-centre and settlement records are not interchangeable. ` +
    `Same-definition database ranks describe available records only, not complete or boundary-harmonised world rankings. Missing district coordinates are omitted from the inset map, not invented.</div>`;

  $('cityBack').onclick = closeCity;
  drawCityZoom(iso, ct);
  const df = $('distFilter');
  if (df) df.oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#cvDistricts .crow').forEach(r => {
      r.style.display = r.querySelector('.cn').textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  };
}

/* inset map zoomed to the city and its districts */
function drawCityZoom(iso, ct) {
  const box = $('cityZoom');
  if (!box) return;
  const W = box.clientWidth || 480, H = 230;
  const sv = d3.select('#cityZoom').attr('viewBox', `0 0 ${W} ${H}`);
  sv.selectAll('*').remove();

  const pts = [{ n: ct.n, p: cityPop(ct, S.data.countries[iso]), la: ct.la, lo: ct.lo, main: 1, di: -1 }]
    .concat((ct.dz || []).map((d, di) => Object.assign({di}, d)).filter(d => Number.isFinite(d.la) && Number.isFinite(d.lo)));
  const fc = { type: 'FeatureCollection', features: pts.map(p => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [p.lo, p.la] }, properties: p })) };

  const p2 = d3.geoMercator();
  if (pts.length > 1) p2.fitExtent([[30, 26], [W - 30, H - 26]], fc);
  else p2.center([ct.lo, ct.la]).scale(26000).translate([W / 2, H / 2]);

  // faint reference grid - the national outline is meaningless at city zoom
  const grid = sv.append('g').attr('class', 'zgrid');
  for (let i = 1; i < 5; i++) {
    grid.append('line').attr('x1', 0).attr('x2', W).attr('y1', H * i / 5).attr('y2', H * i / 5);
    grid.append('line').attr('y1', 0).attr('y2', H).attr('x1', W * i / 5).attr('x2', W * i / 5);
  }
  const r = d3.scaleSqrt().domain([1, Math.max(2, cityPop(ct, S.data.countries[iso]))]).range([2.5, 10]).clamp(true);
  const g = sv.append('g');
  g.selectAll('circle').data(pts).join('circle')
    .attr('class', d => d.main ? 'cdot main' : 'cdot')
    .attr('data-di', d => d.di)
    .attr('cx', d => p2([d.lo, d.la])[0]).attr('cy', d => p2([d.lo, d.la])[1])
    .attr('r', d => d.main ? 7 : d.p == null ? 2.5 : r(d.p))
    .call(s => s.append('title').text(d => `${d.n} — ${int(d.p)}`))
    .on('mouseenter', (ev, d) => hiDistrict(d.di, true))
    .on('mouseleave', (ev, d) => hiDistrict(d.di, false));

  // label the city plus its five largest districts only, to stay readable
  const labelled = [pts[0]].concat(pts.slice(1, 6));
  g.selectAll('text').data(labelled).join('text')
    .attr('class', d => d.main ? 'clbl main' : 'clbl')
    .attr('x', d => p2([d.lo, d.la])[0] + (d.main ? 10 : r(d.p) + 3))
    .attr('y', d => p2([d.lo, d.la])[1] + (d.main ? 4 : 3))
    .text(d => d.n);

  if (pts.length > 1) {
    const tt = T(iso);
    const span = Math.max(...pts.map(p => haversineJS(ct.la, ct.lo, p.la, p.lo)));
    sv.append('text').attr('class', 'zscale').attr('x', 8).attr('y', H - 8)
      .text(`furthest ${lc(tt.sub1)} ${span.toFixed(0)} km · ${pts.length - 1} ${lc(tt.sub)}`);
  }
}
function haversineJS(la1, lo1, la2, lo2) {
  const p = Math.PI / 180;
  const a = .5 - Math.cos((la2 - la1) * p) / 2
    + Math.cos(la1 * p) * Math.cos(la2 * p) * (1 - Math.cos((lo2 - lo1) * p)) / 2;
  return 12742 * Math.asin(Math.sqrt(Math.max(0, a)));
}
function hiDistrict(i, on) {
  const row = document.querySelector(`#cvDistricts .crow[data-di="${i}"]`);
  const dot = document.querySelector(`#cityZoom .cdot[data-di="${i}"]`);
  if (row) row.classList.toggle('hi', on);
  if (dot) dot.classList.toggle('hi', on);
}

function drawSpark(c) {
  const yrs = Object.keys(c.hist || {}).sort();
  if (yrs.length < 4) { $('pSpark').innerHTML = ''; return; }
  const pts = yrs.map(y => ({ y: +y, v: c.hist[y] }));
  const W = $('pSpark').clientWidth || 480, H = 74;
  const x = d3.scaleLinear().domain(d3.extent(pts, p => p.y)).range([2, W - 2]);
  const y = d3.scaleLinear().domain(d3.extent(pts, p => p.v)).nice().range([H - 16, 6]);
  const line = d3.line().x(p => x(p.y)).y(p => y(p.v)).curve(d3.curveMonotoneX);
  const area = d3.area().x(p => x(p.y)).y0(H - 16).y1(p => y(p.v)).curve(d3.curveMonotoneX);
  const first = pts[0], last = pts[pts.length - 1];
  const chg = (last.v / first.v - 1) * 100;
  $('pSpark').innerHTML =
    `<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#22d3ee" stop-opacity=".35"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/>` +
    `</linearGradient></defs>` +
    `<path class="sa" d="${area(pts)}"/><path class="sl" d="${line(pts)}"/>` +
    `<circle cx="${x(last.y)}" cy="${y(last.v)}" r="3" fill="#6ee7b7"/>` +
    `<text class="st" x="2" y="${H - 3}">${first.y} · ${short(first.v)}</text>` +
    `<text class="st" x="${W - 2}" y="${H - 3}" text-anchor="end">${last.y} · ${short(last.v)}</text>` +
    `<text class="st" x="${W / 2}" y="${H - 3}" text-anchor="middle" fill="${chg >= 0 ? '#34d399' : '#f87171'}">` +
    `${chg >= 0 ? '+' : '−'}${nf1.format(Math.abs(chg))}% over ${last.y - first.y} yrs</text></svg>`;
}

function drawCityMap(iso, list) {
  const f = S.byIso[iso], cs = (list || []).slice(0, 30);
  const box = $('cityMap'), W = box.clientWidth || 500, H = 210;
  const sv = d3.select('#cityMap').attr('viewBox', `0 0 ${W} ${H}`);
  sv.selectAll('*').remove();
  if (!f) {
    sv.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
      .attr('class', 'clbl').text('no map geometry for this territory');
    return;
  }
  const p2 = d3.geoMercator().fitExtent([[10, 12], [W - 10, H - 12]], f);
  const pa = d3.geoPath(p2);
  sv.append('path').attr('class', 'cshape').attr('d', pa(f));
  const g = sv.append('g');
  const r = d3.scaleSqrt().domain([15000, Math.max(2e5, d3.max(cs, d => cityPop(d, S.data.countries[iso])) || 2e5)]).range([2.2, 11]).clamp(true);
  g.selectAll('circle').data(cs).join('circle')
    .attr('class', 'cdot').attr('data-i', d => (S.cities[iso] || []).indexOf(d))
    .attr('cx', d => p2([d.lo, d.la])[0]).attr('cy', d => p2([d.lo, d.la])[1])
    .attr('r', d => r(cityPop(d, S.data.countries[iso])))
    .append('title').text(d => `${d.n} — ${int(cityPop(d, S.data.countries[iso]))} · ${cityBasis(d, S.data.countries[iso]).kind} · ${cityBasis(d, S.data.countries[iso]).source}`);
  g.selectAll('.clbl').data(cs.slice(0, 6)).join('text')
    .attr('class', 'clbl')
    .attr('x', d => p2([d.lo, d.la])[0] + r(cityPop(d, S.data.countries[iso])) + 3)
    .attr('y', d => p2([d.lo, d.la])[1] + 3)
    .text(d => d.n);
  g.selectAll('.cdot')
    .on('mouseenter', (ev, d) => hiCity((S.cities[iso] || []).indexOf(d), true))
    .on('mouseleave', (ev, d) => hiCity((S.cities[iso] || []).indexOf(d), false))
    .on('click', (ev, d) => openCity(iso, (S.cities[iso] || []).indexOf(d)));
}
function hiCity(i, on) {
  const row = document.querySelector(`#pCities .crow[data-i="${i}"]`);
  const dot = document.querySelector(`#cityMap .cdot[data-i="${i}"]`);
  if (row) row.classList.toggle('hi', on);
  if (dot) dot.classList.toggle('hi', on);
}
function bindCityRows() {
  document.querySelectorAll('#pCities .crow').forEach(row => {
    const i = +row.dataset.i;
    row.onmouseenter = () => hiCity(i, true);
    row.onmouseleave = () => hiCity(i, false);
    row.onclick = () => openCity(S.sel, i);
  });
}

/* ═══════════════════════════ SEARCH ═══════════════════════════ */
let searchIdx = null, selIdx = -1;
function buildIndex() {
  if (searchIdx) return searchIdx;
  searchIdx = [];
  for (const iso in S.data.countries) {
    const c = S.data.countries[iso];
    searchIdx.push({ t: 'country', iso, iso2: c.iso2, n: c.common || c.name, alt: c.name, p: c.pop || 0 });
  }
  for (const iso in S.cIndex) {
    const c = S.data.countries[iso];
    if (!c) continue;
    cityTop(iso).forEach(ct => searchIdx.push({
      t: 'city', iso, iso2: c.iso2, n: ct.n, alt: (c.common || c.name), p: ct.p, city: ct
    }));
  }
  return searchIdx;
}
function runSearch(q) {
  const box = $('results');
  // Reset selection before every query, including short and no-match queries.
  selIdx = -1;
  box._hits = [];
  box.dataset.n = '0';
  if (typeof q !== "string" || q.length > 512) { box.hidden = false; box.textContent = "Search is too long. Use a city or country name."; return; }
  q = q.trim().toLowerCase();
  if (q.length < 2) { box.hidden = true; return; }
  const idx = buildIndex();
  const hits = idx.filter(o => o.n.toLowerCase().includes(q) || (o.alt || '').toLowerCase().includes(q))
    .sort((a, b) => {
      const as = a.n.toLowerCase().startsWith(q) ? 0 : 1, bs = b.n.toLowerCase().startsWith(q) ? 0 : 1;
      if (as !== bs) return as - bs;
      if (a.t !== b.t) return a.t === 'country' ? -1 : 1;
      return b.p - a.p;
    }).slice(0, 12);
  selIdx = -1;
  box.hidden = false;
  if (!hits.length) { box.innerHTML = '<div class="empty">No match</div>'; return; }
  box.innerHTML = hits.map((h, i) =>
    `<div class="row" data-i="${i}">${fl(h)}` +
    `<span class="nm">${esc(h.n)}${h.t === 'city' ? ` <span style="color:var(--tx3);font-size:11px">${esc(h.alt)}</span>` : ''}</span>` +
    `<span class="pp">${short(h.p)}</span><span class="ty">${h.t}</span></div>`).join('');
  box.querySelectorAll('.row').forEach(r => r.onclick = () => pick(hits[+r.dataset.i]));
  box.dataset.n = hits.length;
  box._hits = hits;
}
function pick(h) {
  $('results').hidden = true;
  $('search').value = '';
  openPanel(h.iso, true);
  const ticket = panelRequest;
  if (h.t === 'city') setTimeout(() => {
    loadCities(h.iso).then(list => {
      if (S.sel !== h.iso || ticket !== panelRequest) return;
      const i = list.findIndex(x => x.n === h.n);
      if (i >= 0) openCity(h.iso, i);
    }).catch(() => {});
  }, 450);
}

/* ═══════════════════════════ UI WIRING ═══════════════════════════ */
function wireUI() {
  $('modeSwitch').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    S.mode = b.dataset.mode;
    [...$('modeSwitch').children].forEach(x => x.classList.toggle('active', x === b));
    paintMap();
    renderRanks();          // the sidebar tables belong to the mode as well
  };
  $('rankSwitch').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    S.rankUnit = S.rankUnit || {};
    S.rankUnit[S.mode] = b.dataset.rank;    // remembered per mode
    renderRanks();
  };
  $('btnCities').onclick = () => {
    S.showCities = !S.showCities;
    gCities.attr('display', S.showCities ? null : 'none');
    $('chkCities').classList.toggle('on', S.showCities);
    if (S.showCities) sizeDots(true);
  };
  $('btnNames').onclick = () => setLabels(!S.showLabels);
  $('btnReset').onclick = () => { camTo({ lon: 20, lat: 18, k: 1 }, 700, 'out'); setTimeout(startSpin, 720); };
  $('panelClose').onclick = closePanel;
  $('scrim').onclick = closePanel;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (S.city) closeCity();
      else { closePanel(); $('results').hidden = true; }
    }
    if (e.key === '/' && document.activeElement !== $('search')) { e.preventDefault(); $('search').focus(); }
    const box = $('results');
    if (!box.hidden && box._hits && box._hits.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        selIdx = Math.max(0, Math.min(box._hits.length - 1, selIdx + (e.key === 'ArrowDown' ? 1 : -1)));
        box.querySelectorAll('.row').forEach((r, i) => r.classList.toggle('sel', i === selIdx));
      } else if (e.key === 'Enter' && selIdx >= 0) pick(box._hits[selIdx]);
    }
  });
  $('search').oninput = e => runSearch(e.target.value);
  const pb = $('playBtn');
  if (pb) pb.onclick = () => { closePanel(); if (window.WPGAME) window.WPGAME.open(); };
  const wb = $('watchBtn');
  if (wb) wb.onclick = () => { if (window.WPSTREAM) window.WPSTREAM.open(); };
  $('search').onfocus = e => { if (e.target.value.trim().length >= 2) runSearch(e.target.value); };
  document.addEventListener('click', e => {
    if (!e.target.closest('.searchwrap')) $('results').hidden = true;
  });
  $('cityFilter').oninput = e => {
    if (!S.sel || !S.cities[S.sel]) return;
    S.cityLimit = 200;
    renderCities(S.sel, S.cities[S.sel] || [], e.target.value);
  };
}

function buildSources() {
  if (!document.getElementById('srcList')) return;  // sources panel removed
  const s = S.data.sources;
  $('srcList').innerHTML = Object.keys(s).map(k =>
    `<li><b>${k}</b> — ${s[k]}</li>`).join('') +
    `<li><b>live endpoint</b> — <code>api.worldbank.org/v2/country/all/indicator/...</code> queried from your browser</li>`;
  $('genStamp').textContent = new Date(S.data.generated).toLocaleString();
}

/* ── bridge for game.js / stream.js: state, formatters and map camera ── */

/* Where should the camera sit for this target? Pure maths, no animation, so it
   can be reasoned about and tested on its own. */
/* Camera target as {lon, lat, k}. Countries are framed on their MAIN landmass
   (largestPart) — the whole-feature bounds used to put France in the Atlantic and
   the USA halfway to Hawaii, which is exactly the "zooms to the wrong country"
   bug in the live feed. Pure maths, safe to unit-test. */
function camTarget(t) {
  if (!proj || !path) return null;
  const stage = $('mapStage'), W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return null;
  let lon = CAM.lon, lat = CAM.lat, k = t.k || 1;
  if (t.iso && S.byIso[t.iso]) {
    const part = mainPart(t.iso), ll = d3.geoCentroid(part), gb = d3.geoBounds(part);
    lon = ll[0]; lat = ll[1];
    if (!t.k) {
      // angular size of the landmass → px at k=1 → zoom so it fills ~55% of the globe
      const aw = Math.min(170, Math.abs(gb[1][0] - gb[0][0]) * Math.cos(lat * Math.PI / 180)), ah = Math.abs(gb[1][1] - gb[0][1]);
      const px = 2 * baseR * Math.sin(Math.max(aw, ah) / 2 * Math.PI / 180);
      k = Math.max(1, Math.min(9, 0.55 * Math.min(W, H) / Math.max(8, px)));
    }
  } else if (t.lonlat) { lon = t.lonlat[0]; lat = t.lonlat[1]; }
  else if (t.lon != null) { lon = t.lon; lat = t.lat != null ? t.lat : lat; }
  if (t.kMul) k = k * t.kMul;                       // slow drift-in
  k = Math.max(1, Math.min(12, k));
  lat = Math.max(-85, Math.min(85, lat));
  return { lon, lat, k, W, H, cx: W / 2, cy: H / 2 };
}

/* Glide the map camera. ms <= 0 applies the move instantly (deep links, tests).
   `ease`: 'linear' | 'out' (arrive briskly, then keep easing in) | default smooth.
   d3-zoom interpolates along an arc, so long moves fly out and back in. */
function syncZoomK() {       // realign d3-zoom's k with the camera without rotating (no sourceEvent)
  if (!svg || !zoom) return;
  lastT = null; svg.call(zoom.transform, d3.zoomIdentity.scale(CAM.k)); lastT = d3.zoomTransform(svg.node());
}
function camTo(t, ms, ease) {
  if (!zoom || !svg) return;
  const g = camTarget(t);
  if (!g) return;
  stopSpin();
  const from = { lon: CAM.lon, lat: CAM.lat, k: CAM.k };
  let dlon = g.lon - from.lon; dlon = ((dlon + 540) % 360) - 180;        // shortest way round
  const set = u => { CAM.lon = from.lon + dlon * u; CAM.lat = from.lat + (g.lat - from.lat) * u;
    CAM.k = Math.exp(Math.log(from.k) + (Math.log(g.k) - Math.log(from.k)) * u); applyCam(); };
  if (!ms || ms <= 0) { svg.interrupt('cam'); set(1); syncZoomK(); sizeDots(true); scaleLabels(true); return; }
  const fn = (ease === true || ease === 'linear') ? d3.easeLinear
    : ease === 'out' ? d3.easeCubicOut : d3.easeCubicInOut;
  svg.transition('cam').duration(ms).ease(fn).tween('cam', () => u => { set(u); sizeDots(false); scaleLabels(false); })
    .on('end', () => { syncZoomK(); sizeDots(true); scaleLabels(true); });
}
function camStop() { if (svg) { svg.interrupt('cam'); syncZoomK(); } }
function camZoomBy(f, ms) {                   // used by the stream's own buttons
  if (!svg || !zoom) return;
  camTo({ lon: CAM.lon, lat: CAM.lat, k: CAM.k * f }, ms === 0 ? 0 : (ms || 420), 'out');
}
function setMode(m) {
  if (!MODES[m]) return;
  S.mode = m;
  const sw = $('modeSwitch');
  if (sw) [...sw.children].forEach(x => x.classList.toggle('active', x.dataset.mode === m));
  paintMap();
  if (S.data && $('rankSwitch')) renderRanks();   // keep the sidebar in step
}
function setCityDots(on) {
  S.showCities = !!on;
  if (gCities) gCities.attr('display', S.showCities ? null : 'none');
  const chk = $('chkCities'); if (chk) chk.classList.toggle('on', S.showCities);
  if (S.showCities) sizeDots(true);
}

/* static city page for the open city (build_city_pages.py); slug map fetched once, lazily */
let _citySlugs = null;
function cityPageLink(iso, name) {
  const set = () => { const a = $('cvFull'); if (!a) return;
    const path = _citySlugs && _citySlugs[iso] && _citySlugs[iso][name];
    a.hidden = !path; if (path) a.href = 'cities/' + path + '/'; };
  if (_citySlugs) return set();
  fetch('data/city_slugs.json').then(r => r.ok ? r.json() : {}).then(m => { _citySlugs = (m && m.names) || {}; set(); }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {          // site-nav buttons for in-page features
  if (S.data) guardCityFeatures();
  const np = document.getElementById('navPlay'), nw = document.getElementById('navWatch');
  if (np) np.addEventListener('click', e => { e.preventDefault(); if (window.WPGAME) window.WPGAME.open(); });
  if (nw) nw.addEventListener('click', e => { e.preventDefault(); if (window.WPSTREAM) window.WPSTREAM.open(); });
});

window.WP = {
  repaint: () => paintMap(),
  get S() { return S; },
  wbCacheClear: () => { try { localStorage.removeItem('wb_SP.POP.TOTL');
    localStorage.removeItem('wb_SP.POP.GROW'); } catch (e) {} },
  wbCacheInfo: () => ['SP.POP.TOTL', 'SP.POP.GROW'].map(c => {
    try { const raw = localStorage.getItem('wb_' + c); const v = raw && raw.length <= 4 * 1024 * 1024 ? JSON.parse(raw) : null;
      return { code: c, rows: v ? v.rows.length : 0,
               ageMin: v ? Math.round((Date.now() - v.t) / 60000) : null }; }
    catch (e) { return { code: c, rows: 0, ageMin: null }; } }),
  livePop, cityBasis, cityPop, liveCity, fl, int, short, pct, T, typeLabel, perSec, sessionStats,
  nf1: n => nf1.format(n), nf2: n => nf2.format(n),
  YEAR_S, MODES,
  cityTop: iso => cityTop(iso),
  loadCities: iso => loadCities(iso),
  openPanel: iso => openPanel(iso, true),
  closePanel, camTo, camTarget, camStop, camZoomBy, setMode, setCityDots, cam: CAM, stopSpin, startSpin,
  setFocusLabel, setLabels,
  set onUserZoom(fn) { S.onUserZoom = fn; }
};

/* ── "since you arrived" — a live personal anchor, updated by tick() ── */
const ARRIVED = Date.now();
function sessionStats() {
  const w = S.data.world, p = livePop(w);
  const secs = (Date.now() - ARRIVED) / 1000;
  return {
    secs,
    born: perSec(p, w.birthRate) * secs,
    died: perSec(p, w.deathRate) * secs,
    net: p * (w.growth / 100) / YEAR_S * secs
  };
}
