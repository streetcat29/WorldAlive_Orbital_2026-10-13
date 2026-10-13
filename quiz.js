/* ══════════════════════════════════════════════════════════════════
   World Alive — "How much do you know about humanity?"  (10-question quiz)
   Third tab inside the game overlay, next to Bigger? Endless / Daily.
   Eight question types drawn from the same verified data as the map:
     more-people (countries) · more-people (cities) · growing faster ·
     denser · older society · which capital · world-in-year · how-many-over
   Daily quiz = seeded on the date (identical for everyone, one attempt scored),
   "New quiz" = random. Ends with "You scored 8/10 🌍", a grade, share text
   with link, and a shareable PNG card. Stats in localStorage 'wp_quiz_v1'.
   Deep link: #quiz  (daily)  ·  #quiz/new
   ══════════════════════════════════════════════════════════════════ */
'use strict';
(function () {
  const W = () => window.WP, el = id => document.getElementById(id);
  const LS = 'wp_quiz_v1', SITE = 'https://theworldalive.com/';
  const nf = new Intl.NumberFormat('en-US'), int = n => nf.format(Math.round(n));
  const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const Q = { on: false, daily: true, qs: [], i: 0, score: 0, marks: [], busy: false, born: null, stats: { played: 0, best: 0, total: 0, dailyDone: null, dailyScore: 0, dailyStreak: 0, dailyPrev: null } };
  const pace = 1300;
  let generation = 0, handoff = null, bornLoading = null;

  const uint = (v, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= 0 && v <= max;
  const dayKey = v => { if (!uint(v) || v < 19700101 || v > todayKey()) return null; const s = String(v), d = new Date(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T00:00:00Z'); return Number.isFinite(+d) && d.toISOString().slice(0,10).replace(/-/g,'') === s ? v : null; };
  const maxDays = () => Math.floor(Date.now() / 86400000) + 1;

  function later(fn, ms) { clearTimeout(handoff); const ticket = generation; handoff = setTimeout(() => { handoff = null; if (Q.on && ticket === generation) fn(); }, ms); }
  function historyData() { return Q.born ? Promise.resolve() : bornLoading || (bornLoading = fetch('data/born.json').then(r => { if (!r.ok) throw new Error('History unavailable'); return r.json(); }).then(d => { if (!d || !Array.isArray(d.years) || !d.years.length || d.years.length > 300 || !d.years.every((y,i) => Number.isInteger(y) && y === 1960+i) || !d.world || !Array.isArray(d.world.pop) || d.world.pop.length !== d.years.length || !d.world.pop.every(v => v === null || typeof v === 'number' && Number.isFinite(v) && v >= 0)) throw new Error('Invalid historical data'); Q.born = d; }).finally(() => { bornLoading = null; })); }

  /* party: several players on ONE screen. Each question: players answer in turn against a countdown
     (answers hidden until everyone has gone), then reveal + leaderboard. Points like Kahoot:
     correct = 500 + 500 × (time left / limit). */
  const P = { on: false, players: [], turn: 0, t0: 0, limit: 12000, timer: null, answers: [], room: null };
  const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const roomSeed = code => [...code.toUpperCase()].reduce((h, ch) => (h * 33 + ch.charCodeAt(0)) >>> 0, 7);
  const newRoom = () => Array.from({ length: 5 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join('');

  function load() {
    Q.stats = {played:0,best:0,total:0,dailyDone:null,dailyScore:0,dailyStreak:0,dailyPrev:null};
    Q.statsNotice = false;
    try {
      const raw = localStorage.getItem(LS), s = raw && raw.length <= 4096 ? JSON.parse(raw) : {};
      if (!s || typeof s !== 'object' || Array.isArray(s)) { Q.statsNotice = true; return; }
      // A generous physical ceiling: at most one recorded play per second since Unix epoch.
      const played = uint(s.played, Math.floor(Date.now() / 1000) + 1) ? s.played : 0;
      Q.stats = {played, best:uint(s.best,10) ? s.best : 0, total:uint(s.total, played*10) ? s.total : 0,
        dailyDone:dayKey(s.dailyDone), dailyPrev:dayKey(s.dailyPrev), dailyScore:uint(s.dailyScore,10) ? s.dailyScore : 0,
        dailyStreak:uint(s.dailyStreak,maxDays()) ? s.dailyStreak : 0};
      Q.statsNotice = !!raw && (raw.length > 4096 || ['best','played','total','dailyScore','dailyStreak'].some(k => Object.prototype.hasOwnProperty.call(s,k) && s[k] !== Q.stats[k]) || Object.prototype.hasOwnProperty.call(s,'__proto__'));
      if (!uint(s.dailyScore,10)) Q.stats.dailyDone = null;
    } catch (_) { Q.statsNotice = true; }
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(Q.stats)); } catch (e) {} }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const todayKey = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  const short = n => Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + ' billion' : Math.abs(n) >= 1e6 ? ((n / 1e6) % 1 ? (n / 1e6).toFixed(1) : String(n / 1e6)) + ' million' : int(n);
  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
  const shuffle = (arr, rnd) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ── question generators: each returns {q, opts:[{t, ok, note}], src} ─ */
  function pool(minPop) { return Object.values(W().S.data.countries).filter(c => c.pop >= minPop); }
  function pair(cands, key, rnd, ratioMax, ratioMin) {
    // two entries whose values differ enough to be fair but not trivial
    for (let k = 0; k < 60; k++) {
      const a = pick(cands, rnd), b = pick(cands, rnd);
      if (a === b || a[key] == null || b[key] == null || a[key] <= 0 || b[key] <= 0) continue;
      const r = Math.max(a[key], b[key]) / Math.min(a[key], b[key]);
      if (r >= (ratioMin || 1.08) && r <= (ratioMax || 4)) return [a, b];
    }
    return null;
  }
  const nm = c => c.common || c.name;
  const gen = {
    morePeople(rnd) {
      const p = pair(pool(2e6), 'pop', rnd, 3, 1.1); if (!p) return null; const [a, b] = p, wp = W();
      return { q: 'Which country has more people?', opts: shuffle([a, b], rnd).map(c => ({ t: `${wp.fl(c)} ${esc(nm(c))}`, ok: c.pop === Math.max(a.pop, b.pop), note: int(wp.livePop(c)) })), src: 'World Bank, live projection' };
    },
    moreCity(rnd) {
      const wp = W(), cs = [];
      for (const iso in wp.S.cIndex) (wp.cityTop(iso) || []).slice(0, 4).forEach(ct => { if (ct.p >= 1e6) cs.push(Object.assign({ iso }, ct)); });
      const p = pair(cs, 'p', rnd, 3, 1.15); if (!p) return null; const [a, b] = p;
      return { q: 'Which city has more people?', opts: shuffle([a, b], rnd).map(ct => ({ t: `${wp.fl(wp.S.data.countries[ct.iso])} ${esc(ct.n)}`, ok: ct.p === Math.max(a.p, b.p), note: `${int(ct.p)} · ${esc(nm(wp.S.data.countries[ct.iso]))}` })), src: 'UN urban areas / official figures' };
    },
    growing(rnd) {
      const cands = pool(1e6).filter(c => c.growth != null);
      for (let k = 0; k < 60; k++) { const a = pick(cands, rnd), b = pick(cands, rnd); if (a !== b && Math.abs(a.growth - b.growth) >= 0.8) {
        const wp = W(); return { q: 'Which population is growing faster?', opts: shuffle([a, b], rnd).map(c => ({ t: `${wp.fl(c)} ${esc(nm(c))}`, ok: c.growth === Math.max(a.growth, b.growth), note: `${c.growth >= 0 ? '+' : '−'}${Math.abs(c.growth).toFixed(2)}% a year` })), src: 'World Bank annual growth' }; } }
      return null;
    },
    denser(rnd) {
      const p = pair(pool(1e6).filter(c => c.density), 'density', rnd, 6, 1.4); if (!p) return null; const [a, b] = p, wp = W();
      return { q: 'Which country is more densely populated?', opts: shuffle([a, b], rnd).map(c => ({ t: `${wp.fl(c)} ${esc(nm(c))}`, ok: c.density === Math.max(a.density, b.density), note: `${nf1.format(c.density)} people / km2` })), src: 'World Bank' };
    },
    older(rnd) {
      const cands = pool(1e6).filter(c => c.age65up != null);
      for (let k = 0; k < 60; k++) { const a = pick(cands, rnd), b = pick(cands, rnd); if (a !== b && Math.abs(a.age65up - b.age65up) >= 4) {
        const wp = W(); return { q: 'Which country has the older population?', opts: shuffle([a, b], rnd).map(c => ({ t: `${wp.fl(c)} ${esc(nm(c))}`, ok: c.age65up === Math.max(a.age65up, b.age65up), note: `${nf1.format(c.age65up)}% aged 65+` })), src: 'World Bank age structure' }; } }
      return null;
    },
    capital(rnd) {
      const cands = pool(3e6).filter(c => c.capital); const c = pick(cands, rnd), wp = W();
      const others = shuffle(cands.filter(x => x !== c && x.capital !== c.capital), rnd).slice(0, 3);
      return { q: `What is the capital of ${wp.fl(c)} <b>${esc(nm(c))}</b>?`, opts: shuffle([c, ...others], rnd).map(x => ({ t: esc(x.capital), ok: x === c, note: x === c ? '' : `capital of ${esc(nm(x))}` })), src: 'World Bank country data' };
    },
    worldYear(rnd) {
      if (!Q.born) return null; const ys = Q.born.years, vals = Q.born.world.pop;
      const i = 5 + Math.floor(rnd() * (ys.length - 6)); const y = ys[i], v = vals[i]; if (!v) return null;
      const opts = [v, v * 0.72, v * 1.32, v * 1.7].map((x, k) => ({ t: short(k ? Math.round(x / 1e7) * 1e7 : x), ok: k === 0, note: '' }));
      return { q: `How many people were alive in <b>${y}</b>?`, opts: shuffle(opts, rnd), src: 'World Bank 1960→today' };
    },
    howMany(rnd) {
      const th = pick([1e8, 5e7, 2e7, 1e7], rnd), n = pool(0).filter(c => c.pop >= th).length;
      const opts = [n, Math.max(1, Math.round(n * 0.6)), Math.round(n * 1.5), Math.round(n * 2.2)];
      const uniq = [...new Set(opts)]; while (uniq.length < 4) uniq.push(uniq[uniq.length - 1] + 3);
      return { q: `How many countries have more than <b>${short(th)}</b> people?`, opts: shuffle(uniq.map(x => ({ t: String(x), ok: x === n, note: '' })), rnd), src: 'World Bank, 217 economies' };
    },
    share(rnd) {
      const c = pick(pool(2e7), rnd), wp = W(), sh = wp.livePop(c) / wp.livePop(wp.S.data.world) * 100;
      const opts = [sh, sh * 0.5, sh * 2, sh * 3.5].map((x, k) => ({ t: nf1.format(x) + '%', ok: k === 0, note: '' }));
      return { q: `What share of humanity lives in ${wp.fl(c)} <b>${esc(nm(c))}</b>?`, opts: shuffle(opts, rnd), src: 'World Bank, live projection' };
    }
  };
  const ORDER = ['morePeople', 'capital', 'growing', 'moreCity', 'worldYear', 'denser', 'howMany', 'older', 'share', 'morePeople'];

  function build(seed) {
    const rnd = mulberry32(seed); const qs = [];
    for (const k of ORDER) { let q = null; for (let t = 0; t < 8 && !q; t++) q = gen[k](rnd); if (!q) q = gen.morePeople(rnd); if (q) qs.push(q); }
    return qs.slice(0, 10);
  }

  /* ── UI ─────────────────────────────────────────────────────── */
  function hud() {
    if (P.on) {
      const lead = P.players.slice().sort((a, b) => b.score - a.score)[0];
      return `<div class="gm-chip">Question <b>${Math.min(Q.i + 1, 10)}</b>/10</div>` +
        `<div class="gm-chip qz-turn">Now answering: <b>${esc(P.players[P.turn] ? P.players[P.turn].name : '')}</b></div>` +
        `<div class="gm-chip dim">Leader: <b>${esc(lead.name)}</b> ${lead.score} pts</div><div class="gm-chip dim">Party · ${P.players.length} players</div>`;
    }
    const marks = Q.marks.map(m => `<i class="${m ? 'ok' : 'no'}"></i>`).join('') + '<i></i>'.repeat(Math.max(0, 10 - Q.marks.length));
    return `<div class="gm-chip">Question <b>${Math.min(Q.i + 1, 10)}</b>/10</div><div class="gm-chip">Score <b>${Q.score}</b></div>` +
      `<div class="gm-marks">${marks}</div><div class="gm-chip dim">${P.room ? `Room <b>${P.room}</b> · same questions for everyone with the code` : Q.daily ? 'Daily quiz · same for everyone today' : 'Random quiz'}</div>`;
  }
  function render() {
    const b = el('gmBoard'); if (!b || !Q.on) return;
    if (Q.i >= Q.qs.length) return finish();
    const q = Q.qs[Q.i]; el('gmHud').innerHTML = hud();
    if (P.on) return renderParty(q, b);
    b.innerHTML = `<div class="qz"><div class="qz-q">${q.q}</div><div class="qz-opts ${q.opts.length === 2 ? 'two' : 'four'}">` +
      q.opts.map((o, i) => `<button class="qz-opt" data-i="${i}">${o.t}</button>`).join('') + `</div><div class="qz-src">Source: ${q.src}${Q.i === 0 ? ' · <a href="#quiz/party" id="qzToParty">Play with friends (party mode) →</a>' : ''}</div></div>`;
    if (Q.statsNotice) { const note = document.createElement("p"); note.setAttribute("role","status"); note.textContent = "Invalid saved quiz scores were ignored. You can still play normally."; b.appendChild(note); }
    const tp = el('qzToParty'); if (tp) tp.onclick = e => { e.preventDefault(); setupParty(); };
    b.querySelectorAll('.qz-opt').forEach(btn => btn.onclick = () => answer(+btn.dataset.i));
    Q.busy = false;
  }
  function answer(i) {
    if (!Q.on || !Number.isInteger(i) || !Q.qs[Q.i] || !Q.qs[Q.i].opts[i]) return;
    if (Q.busy) return; Q.busy = true;
    const q = Q.qs[Q.i], ok = q.opts[i].ok;
    Q.marks.push(ok); if (ok) Q.score++;
    el('gmBoard').querySelectorAll('.qz-opt').forEach((btn, k) => {
      btn.classList.add(q.opts[k].ok ? 'right' : k === i ? 'wrong' : 'dim'); btn.disabled = true;
      if (q.opts[k].note) btn.innerHTML += `<em>${q.opts[k].note}</em>`;
    });
    el('gmHud').innerHTML = hud();
    Q.i++; later(render, ok ? pace : pace + 500);
  }
  /* ── party mode ─────────────────────────────────────────────── */
  function setupParty() {
    clearTimeout(handoff); clearInterval(P.timer); Q.busy = true;
    const b = el('gmBoard'); if (!b) return;
    const n = Math.max(2, Math.min(8, P.players.length || 3));
    b.innerHTML = `<div class="qz qz-setup"><div class="qz-q">Party quiz — one screen, up to 8 players</div>
      <p class="dim">Pass the device around. Each question is shown once; players answer in turn against a countdown and answers stay hidden until everyone has gone. Faster correct answers score more (500–1,000 points). Leaderboard after every question, podium at the end.</p>
      <div class="qz-players" id="qzPlayers">${Array.from({ length: n }, (_, i) => `<input class="qz-name" value="${esc(P.players[i] ? P.players[i].name : 'Player ' + (i + 1))}" maxlength="14">`).join('')}</div>
      <div class="gm-actions"><button class="ghost" id="qzMinus">− player</button><button class="ghost" id="qzPlus">+ player</button>
        <button class="gm-cta" id="qzStart">Start party →</button></div>
      <p class="dim">Friends elsewhere? <button class="ghost sm" id="qzRoom">Create a challenge room</button> — a code that gives everyone the same 10 questions on their own device.</p></div>`;
    const names = () => [...b.querySelectorAll('.qz-name')].map((x, i) => ({ name: x.value.trim().slice(0, 14) || 'Player ' + (i + 1), score: 0, right: 0 }));
    el('qzMinus').onclick = () => { P.players = names().slice(0, -1); setupParty(); };
    el('qzPlus').onclick = () => { P.players = names().concat([{ name: 'Player ' + (names().length + 1), score: 0, right: 0 }]); setupParty(); };
    el('qzStart').onclick = () => { P.players = names(); P.on = true; P.turn = 0; Q.i = 0; Q.marks = []; Q.qs = build(Date.now() % 2147483647); render(); };
    el('qzRoom').onclick = () => startRoom(newRoom());
  }
  function renderParty(q, b) {
    clearInterval(P.timer); P.answers = []; P.turn = 0;
    b.innerHTML = `<div class="qz"><div class="qz-q">${q.q}</div><div class="qz-timer"><i id="qzBar"></i></div>
      <div class="qz-opts ${q.opts.length === 2 ? 'two' : 'four'}">${q.opts.map((o, i) => `<button class="qz-opt" data-i="${i}"><span class="qz-key">${i + 1}</span>${o.t}</button>`).join('')}</div>
      <div class="qz-src">Source: ${q.src}</div></div>`;
    b.querySelectorAll('.qz-opt').forEach(btn => btn.onclick = () => partyAnswer(+btn.dataset.i));
    startTurn();
  }
  function startTurn() {
    if (!Q.on || !P.on || !el("gmHud")) return;
    el('gmHud').innerHTML = hud(); P.t0 = Date.now(); Q.busy = false;
    const bar = el('qzBar'); clearInterval(P.timer);
    P.timer = setInterval(() => {
      const left = Math.max(0, 1 - (Date.now() - P.t0) / P.limit);
      if (bar) { bar.style.width = (left * 100).toFixed(1) + '%'; bar.classList.toggle('low', left < .25); }
      if (left <= 0) partyAnswer(-1);
    }, 100);
  }
  function partyAnswer(i) {
    if (!Q.on || !P.on || !Q.qs[Q.i] || (i !== -1 && (!Number.isInteger(i) || !Q.qs[Q.i].opts[i]))) return;
    if (Q.busy) return; Q.busy = true; clearInterval(P.timer);
    const q = Q.qs[Q.i], ok = i >= 0 && q.opts[i].ok, left = Math.max(0, 1 - (Date.now() - P.t0) / P.limit);
    const pts = ok ? Math.round(500 + 500 * left) : 0;
    P.answers.push({ p: P.turn, i, ok, pts }); P.players[P.turn].score += pts; if (ok) P.players[P.turn].right++;
    P.turn++;
    if (P.turn < P.players.length) {
      const b = el('gmBoard'); b.querySelectorAll('.qz-opt').forEach(x => x.classList.remove('picked'));
      b.querySelector('.qz-q').insertAdjacentHTML('afterend', `<div class="qz-pass">✓ ${esc(P.players[P.turn - 1].name)} answered — pass to <b>${esc(P.players[P.turn].name)}</b></div>`);
      Q.busy = true;
      later(() => { const pp = b.querySelector('.qz-pass'); if (pp) pp.remove(); startTurn(); }, 1100);
      return;
    }
    // everyone answered: reveal + leaderboard
    const b = el('gmBoard');
    b.querySelectorAll('.qz-opt').forEach((btn, k) => { btn.disabled = true; btn.classList.add(q.opts[k].ok ? 'right' : 'dim'); if (q.opts[k].note) btn.innerHTML += `<em>${q.opts[k].note}</em>`;
      const who = P.answers.filter(a => a.i === k).map(a => esc(P.players[a.p].name)); if (who.length) btn.innerHTML += `<span class="qz-who">${who.join(', ')}</span>`; });
    const board = P.players.map((p, idx) => ({ p, idx })).sort((a, b) => b.p.score - a.p.score);
    b.insertAdjacentHTML('beforeend', `<div class="qz-lb"><h4>Leaderboard</h4>${board.map((x, r) => { const a = P.answers.find(a => a.p === x.idx); return `<div class="${a && a.ok ? 'ok' : ''}"><b>#${r + 1}</b> ${esc(x.p.name)} <em>${a ? (a.ok ? '+' + a.pts : a.i < 0 ? 'no answer' : 'wrong') : ''}</em><span>${x.p.score}</span></div>`; }).join('')}
      <button class="gm-cta" id="qzNext">${Q.i + 1 >= Q.qs.length ? 'See the podium →' : 'Next question →'}</button></div>`);
    el('qzNext').onclick = () => { Q.i++; if (Q.i >= Q.qs.length) return podium(); render(); };
    el('gmHud').innerHTML = hud();
  }
  function podium() {
    const board = P.players.slice().sort((a, b) => b.score - a.score), medals = ['🥇', '🥈', '🥉'];
    const text = `World Alive party quiz 🌍\n${board.map((p, i) => `${medals[i] || (i + 1) + '.'} ${p.name} — ${p.score} pts (${p.right}/10)`).join('\n')}\n\nPlay yours: ${SITE}#quiz/party`;
    el('gmBoard').innerHTML = `<div class="gm-over qz-end"><div class="qz-emoji">🏆</div><div class="gm-big">${esc(board[0].name)} wins!</div>
      <div class="qz-podium">${board.slice(0, 3).map((p, i) => `<div class="p${i}"><div class="m">${medals[i]}</div><b>${esc(p.name)}</b><span>${p.score} pts</span><em>${p.right}/10 correct</em></div>`).join('')}</div>
      ${board.length > 3 ? `<p class="dim">${board.slice(3).map((p, i) => `${i + 4}. ${esc(p.name)} ${p.score}`).join(' · ')}</p>` : ''}
      <div class="gm-actions"><button class="gm-cta" id="qzShare">Share results</button><button class="ghost" id="qzAgain">Play again (same players)</button><button class="ghost" id="qzSolo">Solo quiz</button></div></div>`;
    el('qzShare').onclick = e => navigator.share ? navigator.share({ title: 'World Alive party quiz', text, url: SITE + '#quiz/party' }).catch(() => {}) : copy(text, e.target);
    el('qzAgain').onclick = () => { P.players.forEach(p => { p.score = 0; p.right = 0; }); P.on = true; Q.i = 0; Q.qs = build(Date.now() % 2147483647); render(); };
    el('qzSolo').onclick = () => { P.on = false; start(true); };
    el('gmHud').innerHTML = `<div class="gm-chip dim">Party over · ${P.players.length} players</div>`;
  }
  /* ── challenge room: a code = a seed; everyone with the code plays the same 10 on their own device ── */
  function startRoom(code) {
    if (typeof code !== "string" || !/^[A-Z0-9]{4,8}$/i.test(code)) { el("gmBoard").textContent = "Invalid room code. Use 4 to 8 letters or numbers."; return; }
    P.on = false; P.room = code.toUpperCase(); Q.daily = false; Q.i = 0; Q.score = 0; Q.marks = []; Q.busy = false;
    try { history.replaceState(null, '', '#quiz/room/' + P.room); } catch (e) {}
    const b = el('gmBoard');
    b.innerHTML = `<div class="qz qz-setup"><div class="qz-q">Challenge room <span class="qz-code">${P.room}</span></div>
      <p class="dim">Everyone who opens this link gets exactly the same 10 questions. Play, then compare scores.</p>
      <p><input class="qz-link" readonly value="${SITE}#quiz/room/${P.room}"></p>
      <div class="gm-actions"><button class="ghost" id="qzCopyRoom">Copy room link</button><button class="gm-cta" id="qzGoRoom">Play the room quiz →</button></div></div>`;
    el('qzCopyRoom').onclick = e => copy(`${SITE}#quiz/room/${P.room}`, e.target);
    el('qzGoRoom').onclick = () => { Q.qs = build(roomSeed(P.room)); render(); };
    el('gmHud').innerHTML = hud();
  }

  const grade = s => s >= 10 ? 'Perfect — you know the planet.' : s >= 8 ? 'Excellent — better than most demographers.' : s >= 6 ? 'Solid — you follow the world closely.' : s >= 4 ? 'Not bad — the world is bigger than it looks.' : 'The world has surprises for you. Explore the map!';
  function finish() {
    const s = Q.stats, key = todayKey();
    if (Q.daily && s.dailyDone !== key) {
      const y = new Date(); y.setDate(y.getDate() - 1); const yk = y.getFullYear() * 10000 + (y.getMonth() + 1) * 100 + y.getDate();
      s.dailyStreak = s.dailyPrev === yk ? (s.dailyStreak || 0) + 1 : 1; s.dailyPrev = key; s.dailyDone = key; s.dailyScore = Q.score;
    }
    if (!(Q.daily && s.dailyDone === key && s.dailyScore !== Q.score)) { s.played = (s.played || 0) + 1; s.total = (s.total || 0) + Q.score; s.best = Math.max(s.best || 0, Q.score); }
    save();
    const grid = Q.marks.map(m => m ? '🟩' : '🟥').join('');
    el('gmBoard').innerHTML = `<div class="gm-over qz-end">
        <div class="qz-emoji">🌍</div><div class="gm-big">You scored ${Q.score}/10</div>
        <div class="qz-grid">${grid}</div><p>${grade(Q.score)}</p>
        <p class="dim">${Q.daily ? `Daily streak <b>${s.dailyStreak || 0}</b> · ` : ''}best <b>${s.best}</b> · average <b>${(s.total / Math.max(1, s.played)).toFixed(1)}</b> over ${s.played} quiz${s.played === 1 ? '' : 'zes'}</p>
        <div class="gm-actions"><button class="gm-cta" id="qzShare">Share</button><button class="ghost" id="qzCard">Download card</button>
          <button class="ghost" id="qzNew">New random quiz</button><button class="ghost" id="qzParty">Party mode 👥</button><button class="ghost" id="qzBig">Play Bigger?</button></div></div>`;
    el('gmHud').innerHTML = hud();
    const text = P.room ? `How much do you know about humanity? 🌍\nI scored ${Q.score}/10 in World Alive quiz room ${P.room}\n${grid}\n\nSame 10 questions for you: ${SITE}#quiz/room/${P.room}`
      : `How much do you know about humanity? 🌍\nI scored ${Q.score}/10 on ${Q.daily ? "today's" : 'the'} World Alive quiz\n${grid}\n\nTry it: ${SITE}#quiz`;
    el('qzShare').onclick = e => navigator.share ? navigator.share({ title: 'World Alive quiz', text, url: SITE + '#quiz' }).catch(() => {}) : copy(text, e.target);
    el('qzCard').onclick = e => card(grid, e.target);
    el('qzNew').onclick = () => { P.room = null; start(false); };
    el('qzParty').onclick = () => setupParty();
    el('qzBig').onclick = () => { const m = el('gmMode'); if (m) m.querySelector('[data-m="endless"]').click(); };
  }
  function copy(text, btn) { const done = () => { if (!btn) return; const t = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => (btn.textContent = t), 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done); else done(); }
  function card(grid, btn) {
    const Wd = 1080, Hd = 1080, cv = document.createElement('canvas'); cv.width = Wd; cv.height = Hd; const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, Hd); bg.addColorStop(0, '#070b14'); bg.addColorStop(1, '#0d1a2e'); g.fillStyle = bg; g.fillRect(0, 0, Wd, Hd);
    const gl = g.createRadialGradient(200, 0, 0, 200, 0, 900); gl.addColorStop(0, 'rgba(34,211,238,.3)'); gl.addColorStop(1, 'rgba(34,211,238,0)'); g.fillStyle = gl; g.fillRect(0, 0, Wd, Hd);
    const SYS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', MONO = '"Cascadia Mono","SF Mono",Consolas,monospace';
    const txt = (s, x, y, f, c, a) => { g.font = f; g.fillStyle = c; g.textAlign = a || 'left'; g.fillText(s, x, y); };
    txt('HOW MUCH DO YOU KNOW ABOUT HUMANITY?', 72, 120, `700 30px ${SYS}`, '#96a3c2');
    txt('I scored', 72, 300, `500 44px ${SYS}`, '#eaf0ff');
    txt(`${Q.score}/10`, 72, 480, `800 170px ${MONO}`, '#34d399');
    txt('🌍', 540, 480, `150px ${SYS}`, '#fff');
    g.font = `64px ${SYS}`; g.textAlign = 'left'; g.fillText(grid, 72, 620);
    txt(grade(Q.score), 72, 720, `500 32px ${SYS}`, '#eaf0ff');
    txt(Q.daily ? `Daily quiz · ${new Date().toISOString().slice(0, 10)}` : 'Random quiz', 72, 780, `400 26px ${SYS}`, '#96a3c2');
    txt('Can you beat me?', 72, 960, `600 30px ${SYS}`, '#96a3c2'); txt('theworldalive.com/#quiz', 72, 1010, `700 36px ${SYS}`, '#22d3ee');
    cv.toBlob(b => { if (!b) { if (btn) btn.textContent = 'Card unavailable. Try again.'; return; } const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `world-alive-quiz-${Q.score}-of-10.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); if (btn) { const t = btn.textContent; btn.textContent = 'Saved ✓'; setTimeout(() => (btn.textContent = t), 1600); } }, 'image/png');
  }

  function start(daily, mode) {
    stop(); const ticket = generation;
    Q.on = true; Q.daily = !!daily; P.on = false; if (mode !== 'room') P.room = null;
    const fail = () => { if (Q.on && ticket === generation && el('gmBoard')) el('gmBoard').textContent = 'Quiz data unavailable. Close and reopen the quiz to retry.'; };
    if (mode === 'party') { load(); return historyData().then(() => { if (Q.on && ticket === generation) setupParty(); }).catch(fail); }
    if (mode === 'room') { load(); return historyData().then(() => { if (Q.on && ticket === generation) startRoom(daily); }).catch(fail); } Q.i = 0; Q.score = 0; Q.marks = []; Q.busy = false; load();
    const go = () => {
      if (!Q.on || ticket !== generation) return;
      if (Q.daily && Q.stats.dailyDone === todayKey()) {                 // already played today: show result, offer random
        Q.qs = build(todayKey()); Q.i = 10; Q.score = Q.stats.dailyScore;
        Q.marks = Array.from({ length: 10 }, (_, i) => i < Q.score);     // exact marks not stored; score is
        return finish();
      }
      Q.qs = build(Q.daily ? todayKey() : (Date.now() % 2147483647)); render();
    };
    if (Q.born) return go();
    return historyData().then(go).catch(fail);
  }
  function stop() { generation++; Q.on = false; P.on = false; clearInterval(P.timer); clearTimeout(handoff); P.timer = null; handoff = null; }

  window.WPQUIZ = { start, stop, hud, _Q: Q, _build: build };
})();
