/* ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
   World Alive — "World Feed" ambient / stream mode
   A lean-back broadcast: the real map becomes the stage and drifts
   continuously while a director plays a rundown of data segments.

   Two halves, deliberately:
     · STABLE furniture — the left rail and the bottom ticker never change
       shape, so a viewer always knows where to look for the running totals.
     · ROTATING segments — nine kinds of story, weighted-random with
       cooldowns, so it never feels like a loop.
   ================================================================== */
'use strict';

(function () {
  const W = () => window.WP;
  const el = id => document.getElementById(id);
  const SEG = 17000;                    // default segment length (ms)

  const V = {
    on: false, paused: false, cur: null, timer: null, userCam: false, cardT: null,
    t0: 0, left: 0, queue: [], recentIso: [], recentKind: [], seenIso: new Set(),
    tuned: 0, tick: null, idleTimer: null,
    bandT: null, bandFade: null, bandPages: [], bandI: 0, bandMax: 1, boardIso: []
  };

  /* ?"??"? small helpers ?"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"? */
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function countries(minPop) {
    const S = W().S, out = [];
    for (const iso in S.data.countries) {
      const c = S.data.countries[iso];
      if ((c.pop || 0) >= (minPop || 0) && S.byIso[iso]) out.push(c);
    }
    return out;
  }
  /* Pick a country to feature.
     The feed used to revisit the same handful of big countries: the floor was
     2M people and the weighting favoured population, so most of the world could
     never appear. Now every country not yet featured THIS SESSION is preferred,
     so the feed walks the whole map before repeating anything, and only recycles
     once it has run out. Weighting inside the unseen pool stays mild so the
     famous places still turn up early. */
  function pickCountry(minPop) {
    const all = countries(minPop == null ? 3e5 : minPop);
    if (!all.length) return null;
    let pool = all.filter(c => !V.seenIso.has(c.iso3) && !V.recentIso.includes(c.iso3));
    if (!pool.length) {                       // a full cycle done — start again
      V.seenIso.clear();
      pool = all.filter(c => !V.recentIso.includes(c.iso3));
    }
    if (!pool.length) pool = all;
    const wts = pool.map(c => 1 + Math.log10(Math.max(1e5, c.pop)) / 4);
    let r = Math.random() * wts.reduce((a, b) => a + b, 0);
    let pick = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) { r -= wts[i]; if (r <= 0) { pick = pool[i]; break; } }
    V.seenIso.add(pick.iso3);
    return pick;
  }
  function allCities(minPop) {
    const S = W().S, out = [];
    for (const iso in S.cIndex) {
      const c = S.data.countries[iso]; if (!c) continue;
      (S.cIndex[iso].top || []).forEach(ct => {
        if ((ct.p || 0) >= (minPop || 0)) out.push({ ct, c, iso });
      });
    }
    return out;
  }
  const growthPerSec = c => (c.pop || 0) * ((c.growth || 0) / 100) / W().YEAR_S;

  function spark(hist, w, h) {
    if (!hist) return '';
    w = w || 200; h = h || 44;
    const ys = Object.keys(hist).sort(), vs = ys.map(y => hist[y]);
    if (vs.length < 3) return '';
    const mn = Math.min(...vs), mx = Math.max(...vs), sp = (mx - mn) || 1;
    const pts = vs.map((v, i) => [(i / (vs.length - 1)) * w, h - ((v - mn) / sp) * (h - 3) - 1.5]);
    const d = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    return `<svg class="sv-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polyline points="${d}"/>
      <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="2.6"/>
    </svg><em class="sv-sparklbl">${ys[0]} → ${ys[ys.length - 1]}</em>`;
  }
  function localTime(tz) {
    try {
      return new Intl.DateTimeFormat('en-GB',
        { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    } catch (e) { return null; }
  }
  const localHour = tz => { const t = localTime(tz); return t ? +t.slice(0, 2) : null; };

  /* a live-updating figure inside a card: data-lv holds the per-second rate */
  const liveNum = (base, rate, cls) =>
    `<span class="sv-live-n ${cls || ''}" data-base="${base}" data-rate="${rate || 0}"
       data-t0="${Date.now()}">${W().int(base)}</span>`;

  /* ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
     SEGMENTS — each returns {kind, cam, mode?, dots?, dur?, html}
     ============================================================== */
  const KIND = {

    /* 1 ?- country spotlight ?"? the backbone */
    spotlight() {
      const wp = W(), c = pickCountry(2e5);
      const rows = [
        ['Growth', wp.pct(c.growth) + ' / yr'],
        ['Density', c.density ? wp.nf1(c.density) + ' /km2' : '—'],
        ['Over 65', c.age65up ? wp.nf1(c.age65up) + '%' : '—'],
        ['Life expectancy', c.lifeExp ? wp.nf1(c.lifeExp) + ' yrs' : '—'],
        ['Fertility', c.fertility ? wp.nf2(c.fertility) + ' children' : '—'],
        ['Urban', c.urbanPct ? wp.nf1(c.urbanPct) + '%' : '—']
      ].filter(r => r[1] !== '—');
      return {
        kind: 'spotlight', iso: c.iso3, cam: { iso: c.iso3 }, mode: 'pop',
        html: `
          <div class="sv-eyebrow">Country spotlight</div>
          <div class="sv-head">${wp.fl(c, true)}<div>
            <h2>${c.common || c.name}</h2>
            <p>${[c.region, c.capital && 'Capital ' + c.capital].filter(Boolean).join(' · ')}</p>
          </div></div>
          <div class="sv-hero">${liveNum(wp.livePop(c), growthPerSec(c))}<em>people, right now</em></div>
          ${spark(c.hist)}
          <ul class="sv-kv">${rows.map(r =>
            `<li><span>${r[0]}</span><b>${r[1]}</b></li>`).join('')}</ul>`
      };
    },

    /* 2 ?- city spotlight with its administrative sub-units */
    city() {
      const wp = W();
      const pool = allCities(250000).filter(x => (x.ct.dn || 0) > 1);
      if (!pool.length) return KIND.spotlight();
      const { ct, c } = rnd(pool);
      const t = wp.T(c.iso3), f = wp.livePop(c) / c.pop;
      const share = c.pop ? (ct.p / c.pop) * 100 : 0;
      const tm = localTime(ct.tz);
      return {
        kind: 'city', iso: c.iso3, cam: { lonlat: [ct.lo, ct.la], k: 6 }, dots: true, mode: 'pop',
        html: `
          <div class="sv-eyebrow">City spotlight</div>
          <div class="sv-head">${wp.fl(c, true)}<div>
            <h2>${ct.n}</h2><p>${c.common || c.name}${tm ? ' · local time ' + tm : ''}</p>
          </div></div>
          <div class="sv-hero">${liveNum(ct.p * f, growthPerSec(c) * (ct.p / c.pop))}
            <em>people in the city</em></div>
          <ul class="sv-kv">
            <li><span>Share of ${c.common || c.name}</span><b>${wp.nf1(share)}%</b></li>
            <li><span>${t.sub}</span><b>${ct.dn}</b></li>
            <li><span>In those ${t.sub.toLowerCase()}</span><b>${wp.short(ct.dp || 0)}</b></li>
            ${ct.pv ? `<li><span>${t.adm1}</span><b>${ct.pv}</b></li>` : ''}
          </ul>`
      };
    },

    /* 3 ?- dead heat ?"? two countries with almost the same NUMBER OF PEOPLE
       (the wording must say population: "the same size" reads as land area) */
    duel() {
      const wp = W(), pool = countries(6e5);
      let a = null, b = null, best = 9;
      for (let i = 0; i < 260; i++) {
        const x = rnd(pool), y = rnd(pool);
        if (x === y) continue;
        const r = Math.max(x.pop, y.pop) / Math.min(x.pop, y.pop);
        if (r < best && r > 1.0001) { best = r; a = x; b = y; }
        if (best < 1.02) break;
      }
      if (!a) return KIND.spotlight();
      if (a.pop < b.pop) { const t = a; a = b; b = t; }
      const gap = wp.livePop(a) - wp.livePop(b);
      return {
        kind: 'duel', iso: a.iso3, cam: { iso: a.iso3, k: 2.4 }, mode: 'pop',
        html: `
          <div class="sv-eyebrow">Dead heat</div>
          <h2 class="sv-t2">Two countries with almost the same population</h2>
          <div class="sv-duel">
            <div class="sv-dcell">${wp.fl(a, true)}<b>${a.common || a.name}</b>
              <span>${liveNum(wp.livePop(a), growthPerSec(a))}</span></div>
            <div class="sv-dvs">${wp.nf2(best)}×</div>
            <div class="sv-dcell">${wp.fl(b, true)}<b>${b.common || b.name}</b>
              <span>${liveNum(wp.livePop(b), growthPerSec(b))}</span></div>
          </div>
          <p class="sv-note">Just ${wp.int(Math.abs(gap))} people separate them —
             fewer than live in many single cities. Land area is unrelated:
             ${a.area && b.area ? (a.area > b.area
               ? `${a.common || a.name} covers ${wp.nf1(a.area / b.area)}× more ground`
               : `${b.common || b.name} covers ${wp.nf1(b.area / a.area)}× more ground`)
               : 'these two are shaped very differently'}.</p>`
      };
    },

    /* 4 ?- leaderboard on a randomly chosen metric */
    record() {
      const wp = W();
      const metrics = [
        { k: 'density', lbl: 'Most crowded', unit: ' /km2', min: 2e5, f: v => wp.nf1(v) },
        { k: 'growth', lbl: 'Fastest growing', unit: ' % / yr', min: 3e5, f: v => wp.nf2(v) },
        { k: 'fertility', lbl: 'Most children per woman', unit: '', min: 3e5, f: v => wp.nf2(v) },
        { k: 'age65up', lbl: 'Oldest populations', unit: '% over 65', min: 3e5, f: v => wp.nf1(v) },
        { k: 'lifeExp', lbl: 'Longest lives', unit: ' yrs', min: 3e5, f: v => wp.nf1(v) },
        { k: 'urbanPct', lbl: 'Most urban', unit: '% in cities', min: 3e5, f: v => wp.nf1(v) },
        { k: 'pop', lbl: 'Largest populations', unit: '', min: 0, f: v => wp.short(v) },
        { k: 'area', lbl: 'Largest by land area', unit: ' km2', min: 0, f: v => wp.short(v) }
      ];
      const m = rnd(metrics);
      const top = countries(m.min).filter(c => c[m.k] != null)
        .sort((x, y) => y[m.k] - x[m.k]).slice(0, 6);
      if (top.length < 4) return KIND.spotlight();
      const mx = top[0][m.k];
      return {
        kind: 'record', iso: top[0].iso3, cam: { k: 1 },
        mode: m.k === 'density' ? 'density' : m.k === 'growth' ? 'growth'
          : m.k === 'age65up' ? 'age' : 'pop',
        html: `
          <div class="sv-eyebrow">Record board</div>
          <h2 class="sv-t2">${m.lbl}</h2>
          <ol class="sv-bars">${top.map((c, i) => `
            <li><span class="sv-bn">${i + 1}</span>${wp.fl(c)}
              <span class="sv-bl">${c.common || c.name}</span>
              <span class="sv-bv">${m.f(c[m.k])}${m.unit}</span>
              <i style="width:${clamp(c[m.k] / mx * 100, 3, 100)}%"></i></li>`).join('')}</ol>`
      };
    },

    /* 5 ?- crossover ?"? when one country overtakes another */
    crossover() {
      const wp = W(), pool = countries(2e6);
      let hit = null;
      for (let i = 0; i < 700; i++) {
        const a = rnd(pool), b = rnd(pool);                   // a chases b
        if (a === b || a.pop >= b.pop) continue;
        const ra = (a.growth || 0) / 100, rb = (b.growth || 0) / 100;
        if (ra - rb < 0.0015) continue;
        const t = Math.log(b.pop / a.pop) / (ra - rb);
        if (t > 0.6 && t < 90) { hit = { a, b, t }; break; }
      }
      if (!hit) return KIND.record();
      let yrs = Math.floor(hit.t), mo = Math.round((hit.t - yrs) * 12);
      if (mo === 12) { yrs++; mo = 0; }            // never "8 years 12 months"
      const when = `${yrs === 1 ? 'year' : 'years'}` +
        (mo ? ` ${mo} ${mo === 1 ? 'month' : 'months'}` : '');
      return {
        kind: 'crossover', iso: hit.a.iso3, cam: { iso: hit.a.iso3, k: 2.1 }, mode: 'growth',
        html: `
          <div class="sv-eyebrow">On current trends</div>
          <h2 class="sv-t2">${hit.a.common || hit.a.name} overtakes
             ${hit.b.common || hit.b.name}</h2>
          <div class="sv-hero sv-mid">${yrs}<em>${when} from now</em></div>
          <div class="sv-duel tight">
            <div class="sv-dcell">${wp.fl(hit.a, true)}<b>${wp.short(wp.livePop(hit.a))}</b>
              <span class="up">${wp.pct(hit.a.growth)}/yr</span></div>
            <div class="sv-dvs">vs</div>
            <div class="sv-dcell">${wp.fl(hit.b, true)}<b>${wp.short(wp.livePop(hit.b))}</b>
              <span>${wp.pct(hit.b.growth)}/yr</span></div>
          </div>
          <p class="sv-note">Simple projection at today's growth rates — not a forecast.</p>`
      };
    },

    /* 6 ?- the next round-number milestone for the whole world */
    milestone() {
      const wp = W(), S = W().S, w = S.data.world;
      const p = wp.livePop(w), r = (w.growth || 1) / 100;
      const step = 1e8, target = (Math.floor(p / step) + 1) * step;
      const secs = Math.log(target / p) / (r / W().YEAR_S);
      const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600);
      return {
        kind: 'milestone', cam: { k: 1 }, mode: 'pop', dur: 14000,
        html: `
          <div class="sv-eyebrow">Milestone watch</div>
          <h2 class="sv-t2">The world reaches ${wp.short(target)}</h2>
          <div class="sv-hero sv-mid">${d}<em>days ${h} hours away</em></div>
          <ul class="sv-kv">
            <li><span>Right now</span><b>${liveNum(p, p * r / W().YEAR_S)}</b></li>
            <li><span>Added every second</span><b>+${wp.nf1(p * r / W().YEAR_S)}</b></li>
            <li><span>Added every day</span><b>+${wp.int(p * r / 365.2425)}</b></li>
          </ul>`
      };
    },

    /* 7 ?- the night side of the planet */
    nightside() {
      const wp = W();
      const pool = allCities(500000).filter(x => {
        const h = localHour(x.ct.tz);
        return h !== null && (h >= 23 || h <= 4);
      });
      if (!pool.length) return KIND.city();
      const { ct, c } = rnd(pool);
      const f = wp.livePop(c) / c.pop;
      const others = pool.slice(0, 40).reduce((s, x) => s + x.ct.p, 0);
      return {
        kind: 'nightside', iso: c.iso3, cam: { lonlat: [ct.lo, ct.la], k: 4.2 }, dots: true,
        html: `
          <div class="sv-eyebrow">Meanwhile, in the dark</div>
          <div class="sv-head"><div class="sv-moon">🌙</div><div>
            <h2>${ct.n}</h2><p>${c.common || c.name} · ${localTime(ct.tz)} local</p></div></div>
          <div class="sv-hero">${liveNum(ct.p * f, growthPerSec(c) * (ct.p / c.pop))}
            <em>people, most of them asleep</em></div>
          <p class="sv-note">Across the ${pool.length} largest cities where it is
             now past midnight, roughly ${wp.short(others)} people are in the small hours.</p>`
      };
    },

    /* 8 ?- momentum ?"? fastest growing and shrinking */
    momentum() {
      const wp = W(), pool = countries(5e5).filter(c => c.growth != null);
      const up = pool.slice().sort((a, b) => b.growth - a.growth).slice(0, 4);
      const dn = pool.slice().sort((a, b) => a.growth - b.growth).slice(0, 4);
      // a leaderboard always has the same leader, so vary which of the eight the
      // camera actually visits ??" otherwise this segment only ever showed one place
      const subject = rnd(up.concat(dn));
      return {
        kind: 'momentum', iso: subject.iso3, cam: { iso: subject.iso3, k: 2.6 }, mode: 'growth',
        html: `
          <div class="sv-eyebrow">Momentum</div>
          <h2 class="sv-t2">Rising fastest · falling fastest</h2>
          <div class="sv-two">
            <ul class="sv-mv up">${up.map(c => `<li>${wp.fl(c)}
              <span>${c.common || c.name}</span><b>${wp.pct(c.growth)}</b>
              <em>+${wp.int(growthPerSec(c) * 86400)}/day</em></li>`).join('')}</ul>
            <ul class="sv-mv dn">${dn.map(c => `<li>${wp.fl(c)}
              <span>${c.common || c.name}</span><b>${wp.pct(c.growth)}</b>
              <em>${wp.int(growthPerSec(c) * 86400)}/day</em></li>`).join('')}</ul>
          </div>
          <p class="sv-note">Now over ${subject.common || subject.name}.</p>`
      };
    },

    /* 9 ?- atlas ?"? let the choropleth itself be the story */
    atlas() {
      const wp = W(), M = wp.MODES;
      const key = rnd(['growth', 'density', 'age']);
      const m = M[key];
      const region = rnd([
        { n: 'Europe', ll: [15, 52], k: 3.1 }, { n: 'West Africa', ll: [2, 10], k: 3.2 },
        { n: 'South Asia', ll: [80, 22], k: 3.2 }, { n: 'East Asia', ll: [116, 34], k: 3 },
        { n: 'South America', ll: [-60, -15], k: 2.5 }, { n: 'the Middle East', ll: [45, 27], k: 3.1 },
        { n: 'South East Asia', ll: [110, 5], k: 3 }, { n: 'North America', ll: [-100, 42], k: 2.5 }
      ]);
      const blurb = {
        growth: 'Green is growing, red is shrinking. Whole regions now sit below replacement.',
        density: 'The deep colours are where people are packed tightest — river deltas and island states.',
        age: 'The darker the country, the older its people. This map is the century\'s quiet story.'
      }[key];
      return {
        kind: 'atlas', cam: { lonlat: region.ll, k: region.k }, mode: key, dur: 15000,
        html: `
          <div class="sv-eyebrow">Reading the map</div>
          <h2 class="sv-t2">${m.label}</h2>
          <p class="sv-lead">${blurb}</p>
          <p class="sv-note">Now over ${region.n}.</p>`
      };
    }
  };

  /* Camera: ONE transition per segment. The previous two-phase version fired a
     second transition 70 ms after the first, and the handoff between two
     different easings was visible as a lurch. A single easeCubicOut move over
     the whole segment arrives briskly and then keeps creeping in, so the world
     is always drifting without ever jerking. */
  function runCamera(seg) {
    const wp = W();
    if (V.userCam) return;                 // the viewer has taken the controls
    const cam = Object.assign({}, seg.cam || { k: 1 });
    // A country target fitted to 55% of the stage fills the screen and loses all
    // surrounding context, which reads as disorienting on a lean-back display.
    // Pull country shots wider; explicit city/region zooms are already framed.
    if (cam.iso && !cam.k) cam.kMul = (cam.kMul || 1) * 0.82;
    wp.camTo(cam, Math.max(1200, seg.dur * 0.98), 'out');
  }

  /* the viewer grabbed the map: stop directing the camera and offer it back */
  function userTookCamera() {
    if (!V.on || V.userCam) return;
    V.userCam = true;
    const b = el('svManual');
    if (b) b.hidden = false;
  }
  function returnCamera() {
    V.userCam = false;
    const b = el('svManual');
    if (b) b.hidden = true;
    if (V.cur) runCamera(V.cur);
  }
  /* weighted rundown ??" spotlight is the anchor, the rest add variety */
  const WEIGHTS = [
    ['spotlight', 22], ['city', 16], ['record', 13], ['duel', 10],
    ['crossover', 10], ['momentum', 9], ['nightside', 8], ['atlas', 7], ['milestone', 5]
  ];
  function pickKind() {
    const avail = WEIGHTS.filter(w => V.recentKind.indexOf(w[0]) < 0);
    const src = avail.length ? avail : WEIGHTS;
    let r = Math.random() * src.reduce((a, b) => a + b[1], 0);
    for (const [k, w] of src) { r -= w; if (r <= 0) return k; }
    return 'spotlight';
  }
  function build(kind) {
    let seg;
    try { seg = KIND[kind](); } catch (e) { seg = KIND.spotlight(); }
    seg.dur = seg.dur || SEG;
    return seg;
  }
  function refill() {
    while (V.queue.length < 3) {
      const k = pickKind();
      V.recentKind.unshift(k); V.recentKind = V.recentKind.slice(0, 3);
      V.queue.push(build(k));
    }
  }

  const TITLES = {
    spotlight: 'Country spotlight', city: 'City spotlight', duel: 'Dead heat',
    record: 'Record board', crossover: 'Crossover', milestone: 'Milestone watch',
    nightside: 'The night side', momentum: 'Momentum', atlas: 'Reading the map'
  };

  /* ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
     director
     ============================================================== */
  function play() {
    if (!V.on) return;
    refill();
    const seg = V.queue.shift();
    V.cur = seg;
    if (seg.iso) { V.recentIso.unshift(seg.iso); V.recentIso = V.recentIso.slice(0, 14); }

    const wp = W();
    if (seg.mode) wp.setMode(seg.mode);
    wp.setCityDots(!!seg.dots);
    wp.setFocusLabel(seg.iso || null);   // name the country being talked about
    runCamera(seg);

    const card = el('svCard');
    card.classList.remove('in');
    card.innerHTML = seg.html;
    void card.offsetWidth;                      // restart the entrance
    card.classList.add('in');
    // Drop the class once the entrance is over. While an animation is running it
    // overrides the resting style, so if frames never arrive (reduced motion,
    // throttled tab) the card would stay at opacity 0 ??" invisible.
    clearTimeout(V.cardT);
    V.cardT = setTimeout(() => card.classList.remove('in'), 850);

    renderNext();
    V.t0 = Date.now(); V.left = seg.dur;
    schedule(seg.dur);
  }
  function schedule(ms) {
    clearTimeout(V.timer);
    V.timer = setTimeout(() => { if (V.on && !V.paused) play(); }, ms);
  }
  function renderNext() {
    const q = V.queue.slice(0, 2).map(s => TITLES[s.kind]);
    el('svNext').innerHTML =
      `<div class="sv-nline"><span class="sv-nlbl">Up next</span>` +
      `<b>${q[0] || '—'}</b>${q[1] ? `<i>then ${q[1]}</i>` : ''}</div>` +
      `<div class="sv-hint"><kbd>space</kbd>pause <kbd>→</kbd>skip <kbd>+ −</kbd>zoom
         <kbd>r</kbd>recentre <kbd>f</kbd>full <kbd>esc</kbd>exit</div>`;
  }

  /* ?"??"? the stable half: hero counter, rail, top tens ?"??"??"??"??"??"??"??"??"??"??"??"??"??"? */
  const secsUTCToday = () => {
    const n = new Date();
    return (n.getUTCHours() * 3600 + n.getUTCMinutes() * 60 + n.getUTCSeconds())
      + n.getUTCMilliseconds() / 1000;
  };

  /* Top boards. Ranked by rate so the order is stable enough to follow, while
     every figure counts up live. Built once per open, then only the numbers are
     refreshed — rebuilding rows each tick would wipe the DOM 10x a second.

     FIVE rows, not ten. Twenty two-line rows in a 274px column meant 8.5px type:
     an eye chart, not a broadcast graphic. On a lean-back display nobody reads
     rank 8-10, so the space goes into size instead. A magnitude bar behind each
     row lets you compare without reading any digits at all. */
  const TOP_N = 5;

  /* ── "Rest of the world" band ──────────────────────────────────────
     The boards only ever show the same handful of giants, so every other country
     was invisible. This band pages through ALL of them, eight at a time, with a
     diverging bar: growth to the right in green, decline to the left in red.

     It PAGES with a fade rather than scrolling continuously — a marquee is
     unreadable and was removed for that reason. Bar length is derived from the
     per-second RATE, not the accumulated total, which makes it time-invariant:
     both scale linearly with elapsed time, so the bars look identical at 00:05
     and 23:55 instead of starting the day as invisible slivers. A square-root
     scale keeps small countries visible next to the giants. */
  const BAND_N = 8, BAND_MS = 7000;

  function buildBand() {
    const wp = W();
    const shown = new Set(V.boardIso || []);
    const all = countries(0)
      .filter(c => c.growth != null && !shown.has(c.iso3))
      .map(c => ({ c, rate: growthPerSec(c) }))
      .filter(o => isFinite(o.rate) && o.rate !== 0);

    /* Every page MIXES growth and decline. Sorting purely by magnitude buried
       the shrinking countries: declines are far smaller in absolute terms
       (Japan -1,662 a day against India's +35,558), so all 49 of them landed on
       the back pages and a viewer only ever saw green. Five gainers and three
       decliners per page means the diverging bar earns its keep every time. */
    const up = all.filter(o => o.rate > 0).sort((a, b) => b.rate - a.rate);
    const dn = all.filter(o => o.rate < 0).sort((a, b) => a.rate - b.rate);
    const UP_N = 5, DN_N = BAND_N - UP_N;

    V.bandMax = Math.max(
      up.length ? up[0].rate : 0, dn.length ? -dn[0].rate : 0) || 1;
    V.bandPages = [];
    const pages = Math.max(1, Math.ceil(up.length / UP_N));
    for (let i = 0; i < pages; i++) {
      const page = up.slice(i * UP_N, i * UP_N + UP_N);
      for (let j = 0; j < DN_N && dn.length; j++) {
        page.push(dn[(i * DN_N + j) % dn.length]);       // decliners cycle
      }
      if (page.length) V.bandPages.push(page);
    }
    V.bandI = 0;
    renderBand();
  }

  function renderBand() {
    const wp = W(), box = el('svBand');
    if (!box || !V.bandPages || !V.bandPages.length) return;
    const page = V.bandPages[V.bandI % V.bandPages.length];
    const cells = page.map(o => {
      // cube root, not square root: on a linear or even sqrt scale the small
      // countries were invisible next to India. Keeps ONE global scale so
      // pages stay comparable with each other.
      const frac = Math.cbrt(Math.abs(o.rate) / V.bandMax);  // 0..1
      const w = (frac * 48).toFixed(1);                       // half-track max
      const pos = o.rate > 0;
      return `<div class="sv-cell">
        <div class="sv-ctop">${wp.fl(o.c)}<span>${o.c.common || o.c.name}</span></div>
        <div class="sv-track">
          <i class="${pos ? 'pos' : 'neg'}" style="${pos ? 'left' : 'right'}:50%;width:${w}%"></i>
          <u></u>
        </div>
        <div class="sv-cbot">
          <span class="sv-tp sv-bp" data-iso="${o.c.iso3}">—</span>
          <em class="sv-td sv-bd" data-iso="${o.c.iso3}">—</em>
        </div>
      </div>`;
    }).join('');
    box.innerHTML = cells;
    box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
    clearTimeout(V.bandFade);
    V.bandFade = setTimeout(() => box.classList.remove('in'), 700);
    const n = V.bandPages.length;
    const c = el('svBandLbl');
    if (c) c.innerHTML = `Rest of the world <em>population change today &middot; ` +
      `group ${(V.bandI % n) + 1} of ${n}</em>`;
  }

  function bandNext() {
    if (!V.on || V.paused) return;
    V.bandI++;
    renderBand();
  }


  const BIG_N = 10;                 // matches the strip in explore mode

  function buildTops() {
    const wp = W(), rows = countries(0);
    const mk = arr => {
      const max = arr.length ? arr[0].rate : 1;
      return arr.map((o, i) => `<li>
        <i class="sv-bar" style="width:${(o.rate / max * 100).toFixed(1)}%"></i>
        <div class="sv-r1">
          <span class="sv-tn">${i + 1}</span>${wp.fl(o.c)}
          <span class="sv-tl">${o.c.common || o.c.name}</span>
          <b class="sv-live-n" data-base="0" data-rate="${o.rate}" data-mid="1">0</b>
        </div>
        <div class="sv-r2">
          <span class="sv-tp" data-iso="${o.c.iso3}">—</span>
          <em class="sv-td" data-iso="${o.c.iso3}">—</em>
        </div>
      </li>`).join('');
    };
    const rank = key => rows.filter(c => c[key])
      .map(c => ({ c, rate: wp.perSec(c.pop, c[key]) }))
      .sort((a, b) => b.rate - a.rate).slice(0, TOP_N);
    const b = rank('birthRate'), d = rank('deathRate');
    el('svTopB').innerHTML = mk(b);
    el('svTopD').innerHTML = mk(d);
    // the band shows everyone the boards do NOT
    V.boardIso = b.concat(d).map(o => o.c.iso3);
  }

  /* Ten largest countries, counting live, in the left column.
     Names are abbreviated because the rail is only 250px wide and the figure
     needs ~80px of that; the flag plus the number still identify the country. */
  const BIG_SHORT = {
    'United States': 'USA', 'United Kingdom': 'UK',
    'Democratic Republic of the Congo': 'DR Congo',
    'United Arab Emirates': 'UAE', 'Russian Federation': 'Russia'
  };
  function buildBig() {
    const wp = W(), box = el('svBig');
    if (!box) return;
    const big = Object.values(wp.S.data.countries).filter(c => c.pop)
      .sort((a, b) => b.pop - a.pop).slice(0, BIG_N);
    if (!big.length) return;
    const max = wp.livePop(big[0]) || 1;
    box.innerHTML = big.map((c, i) => {
      const nm = c.common || c.name;
      return `<li${i === 0 ? ' class="lead"' : ''}>
        <i class="sv-bigbar" style="width:${(wp.livePop(c) / max * 100).toFixed(1)}%"></i>
        <span class="sv-bgn">${i + 1}</span>${wp.fl(c)}
        <span class="sv-bgl">${BIG_SHORT[nm] || nm}</span>
        <b class="sv-tp sv-pp" data-iso="${c.iso3}">—</b>
      </li>`;
    }).join('');
  }

  function paintRail() {
    const wp = W(), w = wp.S.data.world, p = wp.livePop(w);
    const bs = wp.perSec(p, w.birthRate), ds = wp.perSec(p, w.deathRate);
    const net = p * (w.growth / 100) / wp.YEAR_S;
    const today = secsUTCToday();
    const ss = wp.sessionStats ? wp.sessionStats() : null;
    const set = (id, v) => { const n = el(id); if (n) n.textContent = v; };

    set('svPop', wp.int(p));
    set('svPopAdd', '+' + wp.int(net * today) + ' today');
    set('svPopSec', '+' + wp.nf1(net) + ' every second');
    set('svBs', wp.nf1(bs)); set('svDs', wp.nf1(ds)); set('svNs', '+' + wp.nf1(net));
    set('svBd', wp.int(bs * today)); set('svDd', wp.int(ds * today));
    set('svNd', '+' + wp.int(net * today));
    // "one every X" is far more graspable than a rate per second
    const every = r => r > 0 ? (r >= 1 ? wp.nf2(1 / r) + ' s' : wp.nf1(1 / r) + ' s') : '—';
    set('svBev', every(bs)); set('svDev', every(ds));
    // proportional bar: how much of today's turnover is births vs deaths
    const tot = bs + ds;
    if (tot > 0) {
      const bb = el('svBarB'), bd = el('svBarD');
      if (bb) bb.style.width = (bs / tot * 100).toFixed(1) + '%';
      if (bd) bd.style.width = (ds / tot * 100).toFixed(1) + '%';
    }
    set('svRatio', bs > 0
      ? `For every 10 births today, ${wp.nf1(ds / bs * 10)} deaths.` : '');
    if (ss) {
      set('svSb', wp.int(ss.born));
      set('svSt', ss.secs < 90 ? Math.round(ss.secs) + 's' : Math.round(ss.secs / 60) + 'm');
    }
    // Local time (with seconds) to match normal mode's status clock, which
    // uses the browser's own zone. formatToParts lets us grab both the
    // HH:MM:SS and the short zone name from one formatter.
    { const zp = new Intl.DateTimeFormat('en-GB', { hour12: false,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZoneName: 'short' }).formatToParts(new Date());
      set('svUtc', zp.filter(x => ['hour','minute','second'].includes(x.type))
        .map(x => x.value).join(':'));
      const zl = document.getElementById('svTz');
      if (zl) zl.textContent = (zp.find(x => x.type === 'timeZoneName') || {}).value || 'local'; }

    // live population and its net change since midnight, per country on the boards
    document.querySelectorAll('#streamWrap .sv-tp').forEach(n => {
      const c = wp.S.data.countries[n.dataset.iso];
      if (c) n.textContent = wp.int(wp.livePop(c));
    });
    document.querySelectorAll('#streamWrap .sv-td').forEach(n => {
      const c = wp.S.data.countries[n.dataset.iso];
      if (!c) return;
      const d = growthPerSec(c) * today;
      n.textContent = (d >= 0 ? '▲ +' : '▼ ') + wp.int(d);
      // classList, NOT className: an assignment here wiped the band's own
      // `sv-bd` class on the first tick, silently unstyling every cell
      n.classList.toggle('up', d >= 0);
      n.classList.toggle('dn', d < 0);
    });

    // every live figure: the boards count from midnight UTC, cards from their own t0
    document.querySelectorAll('#streamWrap .sv-live-n').forEach(n => {
      const rate = +n.dataset.rate;
      if (n.dataset.mid) n.textContent = wp.int(rate * today);
      else n.textContent = wp.int(+n.dataset.base + rate * (Date.now() - +n.dataset.t0) / 1000);
    });

    if (V.cur && !V.paused) {
      const done = clamp((Date.now() - V.t0) / V.cur.dur, 0, 1);
      el('svProg').style.width = (done * 100).toFixed(2) + '%';
    }
  }

  /* ?"??"? shell ?"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"? */
  function shell() {
    return `
      <div class="sv-vig"></div>
      <header class="sv-top">
        <div class="sv-live"><i></i>LIVE</div>
        <div class="sv-brand">World&nbsp;Alive<span>World Feed</span></div>
        <div class="sv-hero-count">
          <div class="sv-hclbl">World population right now</div>
          <div class="sv-hcnum" id="svPop">—</div>
          <div class="sv-hcsub"><b id="svPopAdd">—</b><span id="svPopSec">—</span></div>
        </div>
        <div class="sv-clock"><b id="svUtc">--:--:--</b><em id="svTz">local</em></div>
        <button class="sv-x" id="svExit">Exit</button>
      </header>

      <!-- One flex column: the largest-populations panel must sit directly under
           the rail, and the rail's height changes with the viewport, so a
           hard-coded top value on the second panel would drift. -->
      <div class="sv-leftcol">
      <aside class="sv-rail">
        <div class="sv-rlbl">So far today <em>since 00:00 UTC</em></div>
        <div class="sv-day">
          <div class="sv-dayrow born">
            <span class="sv-dayico">👶</span>
            <div><b id="svBd">—</b><em>born · one every <span id="svBev">—</span></em></div>
          </div>
          <div class="sv-daybar"><i class="b" id="svBarB"></i><i class="d" id="svBarD"></i></div>
          <div class="sv-dayrow died">
            <span class="sv-dayico">🕯️</span>
            <div><b id="svDd">—</b><em>died · one every <span id="svDev">—</span></em></div>
          </div>
          <div class="sv-daynet"><span>More people than at midnight</span><b id="svNd">—</b></div>
          <div class="sv-dayratio" id="svRatio">—</div>
        </div>
        <ul class="sv-rate">
          <li><b id="svBs">—</b><span>births / sec</span></li>
          <li><b id="svDs">—</b><span>deaths / sec</span></li>
          <li><b id="svNs" class="up">—</b><span>net / sec</span></li>
        </ul>
        <div class="sv-tuned">
          <b id="svSb">—</b> babies born since you tuned in
          <em>watching for <span id="svSt">0s</span></em>
        </div>
      </aside>

      <aside class="sv-big">
        <div class="sv-rlbl">Largest populations <em>live</em></div>
        <ol class="sv-biglist" id="svBig"></ol>
      </aside>
      </div>

      <aside class="sv-tops">
        <div class="sv-board">
          <div class="sv-blbl up">Most births today<span>born</span></div>
          <div class="sv-bsub">live population · change since 00:00 UTC</div>
          <ol class="sv-tlist" id="svTopB"></ol>
        </div>
        <div class="sv-board">
          <div class="sv-blbl dn">Most deaths today<span>died</span></div>
          <div class="sv-bsub">live population · change since 00:00 UTC</div>
          <ol class="sv-tlist" id="svTopD"></ol>
        </div>
      </aside>
      <div class="sv-next" id="svNext"></div>

      <section class="sv-card" id="svCard"></section>

      <section class="sv-bandwrap">
        <div class="sv-bandlbl" id="svBandLbl"></div>
        <div class="sv-bandrow" id="svBand"></div>
      </section>

      <div class="sv-zoom">
        <button id="svZin" title="Zoom in">+</button>
        <button id="svZout" title="Zoom out">−</button>
        <button id="svZfit" title="Whole world">⤢</button>
      </div>
      <button class="sv-manual" id="svManual" hidden>Resume auto camera</button>
      <div class="sv-pausebadge" id="svPause" hidden>Paused</div>
      <div class="sv-progwrap"><i id="svProg"></i></div>`;
  }

  /* ?"??"? open / close ?"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"??"? */
  function open() {
    const wp = W();
    if (V.on) return;
    let wrap = el('streamWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'streamWrap'; wrap.className = 'sv';
      document.body.appendChild(wrap);
    }
    V.on = true; V.paused = false; V.tuned = Date.now();
    V.queue = []; V.recentIso = []; V.recentKind = [];
    wrap.hidden = false;
    document.body.classList.add('stream-on');
    if (wp && wp.closePanel) { try { wp.closePanel(); } catch (e) {} }

    if (!wp || !wp.S || !wp.S.data) {
      wrap.innerHTML = `<div class="sv-boot">Loading live data...
        <button class="ghost" id="svExit">Exit</button></div>`;
      el('svExit').onclick = close;
      return;
    }

    wrap.innerHTML = shell();
    el('svExit').onclick = close;
    el('svZin').onclick = () => { userTookCamera(); wp.camZoomBy(1.6); };
    el('svZout').onclick = () => { userTookCamera(); wp.camZoomBy(1 / 1.6); };
    el('svZfit').onclick = () => { userTookCamera(); wp.camTo({ k: 1 }, 700, 'out'); };
    el('svManual').onclick = returnCamera;
    wp.onUserZoom = userTookCamera;
    buildTops();
    buildBig();
    buildBand();
    paintRail();
    V.tick = setInterval(paintRail, 100);
    V.bandT = setInterval(bandNext, BAND_MS);
    play();
    idle();
  }

  function close() {
    V.on = false; V.cur = null; V.userCam = false;
    clearTimeout(V.timer); clearInterval(V.tick);
    clearTimeout(V.idleTimer); clearTimeout(V.cardT);
    clearInterval(V.bandT); clearTimeout(V.bandFade);
    V.timer = V.tick = V.idleTimer = V.cardT = V.bandT = V.bandFade = null;
    const wp = W();
    if (wp) wp.onUserZoom = null;
    const w = el('streamWrap');
    if (w) { w.hidden = true; w.innerHTML = ''; }
    document.body.classList.remove('stream-on', 'sv-idle');
    if (wp) { wp.camStop(); wp.setCityDots(false); wp.setFocusLabel(null);
              wp.camTo({ k: 1 }, 700, 'out'); }
    if (location.hash.toLowerCase().indexOf('stream') >= 0) history.replaceState(null, '', '#');
  }

  function pause(on) {
    V.paused = on === undefined ? !V.paused : !!on;
    el('svPause').hidden = !V.paused;
    const wp = W();
    if (V.paused) {
      V.left = Math.max(0, V.cur ? V.cur.dur - (Date.now() - V.t0) : 0);
      clearTimeout(V.timer); wp.camStop();
    } else if (V.cur) {
      V.t0 = Date.now() - (V.cur.dur - V.left);
      if (!V.userCam) {
        const cam = Object.assign({}, V.cur.cam || { k: 1 });
        if (cam.iso && !cam.k) cam.kMul = (cam.kMul || 1) * 0.82;
        wp.camTo(cam, Math.max(900, V.left), 'out');
      }
      schedule(V.left);
    }
  }
  function skip() { if (!V.on) return; V.paused = false; el('svPause').hidden = true; play(); }

  /* hide the cursor while nothing is happening ??" it is a display, not an app */
  function idle() {
    document.body.classList.remove('sv-idle');
    clearTimeout(V.idleTimer);
    V.idleTimer = setTimeout(() => {
      if (V.on) document.body.classList.add('sv-idle');
    }, 3200);
  }
  document.addEventListener('mousemove', () => { if (V.on) idle(); });

  document.addEventListener('keydown', e => {
    if (!V.on) return;
    const k = e.key.toLowerCase(), wp = W();
    if (e.key === 'Escape') return close();
    if (e.key === ' ') { e.preventDefault(); return pause(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); return skip(); }
    if (k === 'r') { e.preventDefault(); return returnCamera(); }
    if (e.key === '+' || e.key === '=') { userTookCamera(); return wp.camZoomBy(1.6); }
    if (e.key === '-' || e.key === '_') { userTookCamera(); return wp.camZoomBy(1 / 1.6); }
    if (k === '0') { userTookCamera(); return wp.camTo({ k: 1 }, 700, 'out'); }
    if (k === 'f') {
      e.preventDefault();
      const d = document;
      if (d.fullscreenElement) { if (d.exitFullscreen) d.exitFullscreen(); }
      else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen();
    }
  });

  window.WPSTREAM = {
    open, close, pause, skip, returnCamera,
    _V: V, _TOP_N: TOP_N, _BAND_N: BAND_N, _bandNext: bandNext, _KIND: KIND, _build: build, _pickKind: pickKind, _titles: TITLES
  };
})();
