/* ══════════════════════════════════════════════════════════════════
   World Alive — "Bigger?" game mode
   Chain guessing loop over the same verified data the map uses.
   Endless mode (3 lives, difficulty ramp) + a seeded Daily Challenge
   that is identical for everyone and produces a shareable score card.

   Interaction model: the LEFT card is always revealed, the RIGHT card is the
   question. The right card carries two explicit choices — More / Fewer — so
   there is never an invisible click target and it is always obvious which
   entry you are being asked about.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const W = () => window.WP;                    // app.js state bridge
  const el = id => document.getElementById(id);
  const LS = 'wp_game_v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uint = (v, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= 0 && v <= max;
  const dayKey = v => { if (!uint(v) || v < 19700101 || v > todayKey()) return null; const s = String(v), d = new Date(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T00:00:00Z'); return Number.isFinite(+d) && d.toISOString().slice(0,10).replace(/-/g,'') === s ? v : null; };
  const maxDays = () => Math.floor(Date.now() / 86400000) + 1;


  const G = {
    open: false, mode: 'endless', cat: 'mixed',
    pool: [], left: null, right: null, used: null,
    streak: 0, lives: 3, score: 0, busy: false, timer: null, nextAction: null,
    dailyRounds: [], dailyIdx: 0, dailyMarks: [], dailyLocked: false,
    // how long a reveal stays on screen before the next round; one place so
    // pacing can be tuned (and driven fast by the test harness)
    pace: { win: 1050, lose: 1150, daily: 1150 },
    stats: {
      best: 0, played: 0, correct: 0,
      dailyDone: null, dailyBest: 0, dailyStreak: 0, dailyPrev: null,
      dailyScore: 0, dailyMarks: []
    }
  };

  /* ── persistence ─────────────────────────────────────────────── */
  function load() {
    G.statsNotice = false;
    try {
      const raw = localStorage.getItem(LS);
      const s = raw && raw.length <= 4096 ? JSON.parse(raw) : {};
      if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('Invalid saved stats');
      // A generous physical ceiling: at most one recorded play per second since Unix epoch.
      const played = uint(s.played, Math.floor(Date.now() / 1000) + 1) ? s.played : 0;
      const correct = uint(s.correct, played) ? s.correct : 0;
      G.stats = { played, correct, best: uint(s.best, correct) ? s.best : 0,
        dailyDone: dayKey(s.dailyDone), dailyPrev: dayKey(s.dailyPrev),
        dailyStreak: uint(s.dailyStreak, maxDays()) ? s.dailyStreak : 0,
        dailyBest: uint(s.dailyBest, 10) ? s.dailyBest : 0,
        dailyScore: uint(s.dailyScore, 10) ? s.dailyScore : 0,
        dailyMarks: Array.isArray(s.dailyMarks) && s.dailyMarks.length <= 10 && s.dailyMarks.every(v => typeof v === 'boolean') ? s.dailyMarks.slice() : [] };
      G.statsNotice = !!raw && (raw.length > 4096 || ['best','played','correct','dailyScore','dailyBest','dailyStreak'].some(k => Object.prototype.hasOwnProperty.call(s,k) && s[k] !== G.stats[k]) || Object.prototype.hasOwnProperty.call(s,'__proto__'));
      if (G.stats.dailyDone && (G.stats.dailyMarks.length !== 10 || G.stats.dailyMarks.filter(Boolean).length !== G.stats.dailyScore)) {
        G.stats.dailyDone = null; G.stats.dailyScore = 0; G.stats.dailyMarks = [];
      }
    } catch (e) { G.statsNotice = true; G.stats = {best:0,played:0,correct:0,dailyDone:null,dailyPrev:null,dailyStreak:0,dailyBest:0,dailyScore:0,dailyMarks:[]}; }
  }
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(G.stats)); } catch (e) {}
  }

  /* ── seeded RNG so the daily is identical worldwide ───────────── */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const todayKey = () => {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  };

  /* Every scheduled hand-off goes through here, so closing the game can never
     leave a timer that fires into a DOM that no longer exists. */
  function later(fn, ms) {
    clearTimeout(G.timer);
    G.timer = setTimeout(() => { G.timer = null; if (G.open) fn(); }, ms);
  }

  /* ── candidate pool ──────────────────────────────────────────── */
  function buildPool(cat) {
    const wp = W(), out = [];
    if (cat !== 'cities') {
      for (const iso in wp.S.data.countries) {
        const c = wp.S.data.countries[iso];
        if ((c.pop || 0) < 800000) continue;          // keep entries recognisable
        out.push({
          k: 'country', iso, name: c.common || c.name,
          sub: c.region || 'the world', pop: wp.livePop(c), flag: wp.fl(c)
        });
      }
    }
    if (cat !== 'countries') {
      for (const iso in wp.S.cIndex) {
        const c = wp.S.data.countries[iso];
        if (!c) continue;
        (wp.S.cIndex[iso].top || []).forEach(ct => {
          if ((ct.p || 0) < 700000) return;
          const f = wp.livePop(c) / c.pop;
          out.push({
            k: 'city', iso, name: ct.n, sub: (c.common || c.name),
            pop: ct.p * f, flag: wp.fl(c)
          });
        });
      }
    }
    return out;
  }

  /* Difficulty ramp: early rounds are lopsided and obvious, later rounds get
     close. Returns a partner for `a` from `pool` whose population ratio sits in
     the band for the current streak. The pool is passed in explicitly so the
     picker is a pure function and can be tested on its own; `avoid` is a Set of
     names already used in this run. */
  function partnerFor(a, streak, rnd, pool, avoid) {
    const r = rnd || Math.random;
    const p = pool || G.pool;
    if (!a || !p || !p.length) return null;
    const band = streak < 3 ? [2.2, 40] :
                 streak < 6 ? [1.5, 6] :
                 streak < 10 ? [1.2, 3] :
                 streak < 15 ? [1.08, 1.9] : [1.01, 1.45];

    // A city can never be weighed against the country that contains it: the
    // answer is definitional rather than interesting.
    const eligible = b => b !== a && b.name !== a.name &&
                          !(b.iso === a.iso && b.k !== a.k);

    const inBand = [], anyOk = [];
    for (const b of p) {
      if (!eligible(b)) continue;
      if (avoid && avoid.has(b.name)) continue;
      anyOk.push(b);
      const hi = Math.max(a.pop, b.pop), lo = Math.min(a.pop, b.pop);
      if (lo <= 0) continue;
      const ratio = hi / lo;
      if (ratio >= band[0] && ratio <= band[1]) inBand.push(b);
    }
    // relax in steps: right difficulty → any unused → any at all
    let src = inBand.length ? inBand : anyOk;
    if (!src.length) src = p.filter(eligible);
    if (!src.length) return null;
    return src[Math.floor(r() * src.length)];
  }

  /* ── UI ──────────────────────────────────────────────────────── */
  function shell() {
    return `
      <div class="gm-top">
        <div class="gm-title">${G.mode === 'quiz' ? 'How much do you know about <span>humanity?</span>' : 'Bigger<span>?</span>'}</div>
        <div class="segmented small" id="gmMode">
          <button class="${G.mode === 'endless' ? 'active' : ''}" data-m="endless">Endless</button>
          <button class="${G.mode === 'daily' ? 'active' : ''}" data-m="daily">Daily challenge</button>
          <button class="${G.mode === 'quiz' ? 'active' : ''}" data-m="quiz">Humanity quiz</button>
        </div>
        <div class="segmented small" id="gmCat">
          <button class="${G.cat === 'mixed' ? 'active' : ''}" data-c="mixed">Mixed</button>
          <button class="${G.cat === 'countries' ? 'active' : ''}" data-c="countries">Countries</button>
          <button class="${G.cat === 'cities' ? 'active' : ''}" data-c="cities">Cities</button>
        </div>
        <button class="gm-x" id="gmClose" aria-label="Close">✕</button>
      </div>
      <div class="gm-hud" id="gmHud"></div>
      <div class="gm-announcement sr-only" id="gmAnnouncement" role="status" aria-live="polite" aria-atomic="true"></div>
      <div class="gm-board" id="gmBoard"></div>
      <div class="gm-foot">
        <span>Keys: <kbd>↑</kbd> more · <kbd>↓</kbd> fewer · <kbd>Esc</kbd> close</span>
        <span id="gmSrc"></span>
      </div>`;
  }

  function hud() {
    const s = G.stats;
    if (G.mode === 'daily') {
      const marks = G.dailyMarks.map(m => m ? '<i class="ok"></i>' : '<i class="no"></i>').join('') +
        '<i></i>'.repeat(Math.max(0, 10 - G.dailyMarks.length));
      return `<div class="gm-chip">Round <b>${Math.min(G.dailyIdx + 1, 10)}</b>/10</div>` +
        `<div class="gm-chip">Score <b>${G.score}</b></div>` +
        `<div class="gm-marks">${marks}</div>` +
        `<div class="gm-chip dim">Daily streak <b>${s.dailyStreak || 0}</b></div>`;
    }
    return `<div class="gm-chip">Streak <b id="gmStreak">${G.streak}</b></div>` +
      `<div class="gm-chip">Best <b>${s.best}</b></div>` +
      `<div class="gm-lives">${'<i class="on"></i>'.repeat(Math.max(0, G.lives))}` +
      `${'<i></i>'.repeat(Math.max(0, 3 - G.lives))}</div>` +
      (s.played ? `<div class="gm-chip dim">Accuracy <b>${Math.round(s.correct / s.played * 100)}%</b></div>` : '');
  }

  const kindChip = o => `<div class="gm-kind ${o.k}">${o.k === 'city' ? 'City' : 'Country'}` +
    `<span>${esc(o.sub)}</span></div>`;

  function popBlock(o) {
    return `<div class="gm-pop" data-target="${Math.round(o.pop)}">0</div>` +
      `<div class="gm-lbl">people</div>`;
  }

  function render() {
    if (!G.open) return;
    const board = el('gmBoard'), hudEl = el('gmHud');
    if (!board || !hudEl || !G.left || !G.right) return;
    hudEl.innerHTML = hud();
    board.innerHTML =
      `<div class="gm-card l">${kindChip(G.left)}
         <div class="gm-flag">${G.left.flag}</div>
         <div class="gm-name">${esc(G.left.name)}</div>
         ${popBlock(G.left)}
       </div>
       <div class="gm-vs">vs</div>
       <div class="gm-card r">${kindChip(G.right)}
         <div class="gm-flag">${G.right.flag}</div>
         <div class="gm-name">${esc(G.right.name)}</div>
         <div class="gm-slot">
           <div class="gm-ask"><strong class="gm-question">Which has more people?</strong><span class="gm-question-detail">Does <b>${esc(G.right.name)}</b> have more or fewer people than <b>${esc(G.left.name)}</b>?</span><small class="gm-choice-note">Compare population, not land area.</small></div>
           <div class="gm-choices">
             <button class="gm-btn more" data-pick="more">▲ More</button>
             <button class="gm-btn fewer" data-pick="fewer">▼ Fewer</button>
           </div>
         </div>
       </div>`;
    roll(board.querySelector('.gm-card.l .gm-pop'));
    board.querySelectorAll('[data-pick]').forEach(b => {
      b.onclick = () => answer(b.dataset.pick);
    });
    el('gmSrc').textContent = (G.left.k === 'city' || G.right.k === 'city')
      ? 'City figures: GeoNames · projected live' : 'World Bank, projected live';
  }

  /* Count-up reveal. Two hazards, both handled:
     · the baseline comes from the FIRST animation frame, not performance.now() —
       the two clocks can have different origins, which once rendered a negative
       population mid-animation;
     · animation frames may never arrive at all (background tab, throttling,
       reduced-motion), so a timer snaps the real figure into place. The number
       must never be left showing 0. */
  function roll(node) {
    if (!node) return;
    const wp = W(), target = +node.dataset.target, dur = 620;
    if (!isFinite(target)) return;
    const snap = () => {
      done = true;                       // also stops any frame still in flight,
      if (node.isConnected) node.textContent = wp.int(target);   // which would
    };                                   // otherwise overwrite the real figure
    let done = false, t0 = null;
    const still = (window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) || document.hidden;
    if (still) return snap();

    node.textContent = wp.int(0);
    requestAnimationFrame(function step(t) {
      if (done || !node.isConnected) return;
      if (t0 === null) t0 = t;
      const p = Math.max(0, Math.min(1, (t - t0) / dur));
      node.textContent = wp.int(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
      else snap();
    });
    setTimeout(() => { if (!done) snap(); }, dur + 300);
  }

  function nextRound() {
    G.busy = false; G.nextAction = null;
    const announcement = el("gmAnnouncement"); if (announcement) announcement.textContent = "";
    if (G.mode === 'daily') {
      const pair = G.dailyRounds[G.dailyIdx];
      if (G.dailyIdx >= 10 || !pair) return finishDaily();
      G.left = pair[0]; G.right = pair[1];
      return render();
    }
    if (!G.left) {
      G.left = G.pool[Math.floor(Math.random() * G.pool.length)];
      if (G.used) G.used.add(G.left.name);
    }
    G.right = partnerFor(G.left, G.streak, null, G.pool, G.used);
    if (!G.right) {                       // pool exhausted — start a fresh run
      if (G.used && G.used.size) { G.used.clear(); G.used.add(G.left.name); }
      G.right = partnerFor(G.left, G.streak, null, G.pool, G.used);
    }
    if (!G.right) return;
    if (G.used) G.used.add(G.right.name);
    render();
  }

  function answer(choice) {
    if (G.busy || !G.open || !G.left || !G.right) return;
    const board = el('gmBoard');
    const slot = board && board.querySelector('.gm-card.r .gm-slot');
    if (!slot) return;                    // no live round (result screen etc.)
    G.busy = true;

    const wp = W();
    const diff = G.right.pop - G.left.pop;
    const correct = Math.abs(diff) < 0.5 ? true          // a tie is never a loss
      : choice === 'more' ? diff > 0 : diff < 0;

    G.stats.played++;
    if (correct) G.stats.correct++;

    slot.outerHTML = popBlock(G.right);
    roll(board.querySelector('.gm-card.r .gm-pop'));

    const hi = Math.max(G.left.pop, G.right.pop), lo = Math.min(G.left.pop, G.right.pop);
    const tied = Math.abs(diff) < 0.5;
    const right = board.querySelector('.gm-card.r');
    right.classList.add(correct ? 'answer-correct' : 'answer-incorrect');
    const verdict = correct ? 'Correct' : 'Incorrect';
    const direction = diff > 0 ? 'more' : 'fewer';
    const explanation = tied
      ? `${esc(G.right.name)} and ${esc(G.left.name)} have equal populations at the game's rounding precision. Either answer counts as correct.`
      : `${esc(G.right.name)} has <strong>${wp.int(Math.abs(diff))} ${direction} people</strong> than ${esc(G.left.name)}.`;
    right.insertAdjacentHTML('beforeend',
      `<section class="gm-answer-panel ${correct ? 'good' : 'bad'}" aria-label="Answer result">
        <div class="gm-answer-heading"><span class="gm-answer-icon" aria-hidden="true">${correct ? '✓' : '✕'}</span><b>${verdict}</b></div>
        <p class="gm-your-choice">You chose: ${choice === 'more' ? 'More people' : 'Fewer people'}.</p>
        <p class="gm-answer-explanation">${explanation}</p>
        <button type="button" class="gm-next" id="gmNext">Next round <span aria-hidden="true">→</span></button>
      </section>`);
    const announcement = el('gmAnnouncement');
    if (announcement) announcement.textContent = verdict + '. ' + (tied
      ? 'Equal populations at rounding precision. Either answer counts as correct.'
      : G.right.name + ' has ' + wp.int(Math.abs(diff)) + ' ' + direction + ' people than ' + G.left.name + '.');

    if (G.mode === 'daily') {
      G.dailyMarks.push(correct);
      if (correct) G.score++;
      G.dailyIdx++;
      el('gmHud').innerHTML = hud();
      save();
      return showNext(() => G.dailyIdx >= 10 ? finishDaily() : nextRound(), G.dailyIdx >= 10 ? 'See daily score' : 'Next round');
    }

    if (correct) {
      G.streak++;
      if (G.streak > G.stats.best) G.stats.best = G.streak;
      G.left = G.right;                   // winner carries forward — the chain
      save();
      showNext(nextRound);
    } else {
      G.lives--;
      save();
      if (G.lives <= 0) showNext(gameOver, 'See your score');
      else { G.left = G.right; showNext(nextRound); }
    }
    el('gmHud').innerHTML = hud();
  }

  // Feedback remains visible until explicitly continued: no fleeting colour flash.
  function showNext(action, label = 'Next round') {
    clearTimeout(G.timer); G.timer = null; G.nextAction = null; G.nextAction = action;
    const button = el('gmNext'); if (!button) return;
    button.innerHTML = esc(label) + ' <span aria-hidden="true">→</span>';
    button.onclick = () => {
      if (!G.open || !G.nextAction) return;
      const next = G.nextAction; G.nextAction = null; button.disabled = true; next();
    };
    button.onkeydown = event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat && !button.disabled) button.click();
    };
    button.focus({preventScroll:true});
    // Immediate scroll, not animation: ensures the answer is on-screen on phones.
    const panel = button.closest('.gm-answer-panel');
    if (panel) panel.scrollIntoView({block:'nearest', behavior:'instant'});
  }

  function gameOver() {
    if (!G.open || !el('gmBoard')) return;
    const s = G.stats, best = G.streak > 0 && G.streak >= s.best;
    el('gmBoard').innerHTML = `
      <div class="gm-over">
        <div class="gm-big">${G.streak}</div>
        <div class="gm-olbl">${best ? 'new personal best' : 'streak'}</div>
        <p>Best ever <b>${s.best}</b> · accuracy <b>${Math.round(s.correct / Math.max(1, s.played) * 100)}%</b>
           over <b>${s.played}</b> guesses.</p>
        <div class="gm-actions">
          <button class="gm-cta" id="gmAgain">Play again</button>
          <button class="ghost" id="gmShare">Copy result</button>
          <button class="ghost" id="gmDaily">Try today's challenge</button>
        </div>
      </div>`;
    el('gmAgain').onclick = () => startEndless();
    el('gmDaily').onclick = () => { G.mode = 'daily'; syncTabs(); startDaily(); };
    el('gmShare').onclick = e => copy(
      `World Alive — Bigger?\nStreak ${G.streak} (best ${s.best})\nCan you beat it?`, e.target);
    el('gmHud').innerHTML = hud();
  }

  function finishDaily() {
    if (!G.open || !el('gmBoard')) return;
    const s = G.stats, key = todayKey();
    if (s.dailyDone !== key) {            // first completion today — record it
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yk = y.getFullYear() * 10000 + (y.getMonth() + 1) * 100 + y.getDate();
      s.dailyStreak = (s.dailyPrev === yk) ? (s.dailyStreak || 0) + 1 : 1;
      s.dailyPrev = key;
      s.dailyDone = key;
      s.dailyScore = G.score;
      s.dailyMarks = G.dailyMarks.slice();
      s.dailyBest = Math.max(s.dailyBest || 0, G.score);
      save();
    }
    G.dailyLocked = true;
    G.score = s.dailyScore;
    G.dailyMarks = (s.dailyMarks || []).slice();
    const grid = G.dailyMarks.map(m => m ? '🟩' : '🟥').join('');
    el('gmBoard').innerHTML = `
      <div class="gm-over gm-done">
        <div class="gm-big">${G.score}<span class="gm-of">/10</span></div>
        <div class="gm-olbl">today's challenge</div>
        <div class="gm-grid">${grid}</div>
        <p>Everyone in the world gets the same ten rounds today.
           Daily streak <b>${s.dailyStreak}</b> · best score <b>${s.dailyBest}</b>.</p>
        <p class="gm-note">Today's challenge is done — a new one unlocks at midnight.
           Endless mode is always open.</p>
        <div class="gm-actions">
          <button class="gm-cta" id="gmShare2">Copy score card</button>
          <button class="ghost" id="gmEnd">Play endless</button>
        </div>
      </div>`;
    el('gmShare2').onclick = e => copy(
      `World Alive — Daily ${new Date().toISOString().slice(0, 10)}\n` +
      `${G.score}/10 ${grid}\nStreak ${G.stats.dailyStreak}`, e.target);
    el('gmEnd').onclick = () => { G.mode = 'endless'; syncTabs(); startEndless(); };
    el('gmHud').innerHTML = hud();
  }

  function copy(text, btn) {
    const done = () => {
      if (!btn) return;
      const t = btn.textContent; btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = t; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, done);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove(); done();
    }
  }

  /* ── starts ──────────────────────────────────────────────────── */
  function syncTabs() {
    const m = el('gmMode'), c = el('gmCat');
    if (m) [...m.children].forEach(b => b.classList.toggle('active', b.dataset.m === G.mode));
    if (c) [...c.children].forEach(b => b.classList.toggle('active', b.dataset.c === G.cat));
  }

  function startEndless() {
    clearTimeout(G.timer); G.timer = null; G.nextAction = null;
    G.mode = 'endless';
    G.pool = buildPool(G.cat);
    G.used = new Set();
    G.streak = 0; G.lives = 3; G.left = null; G.right = null; G.busy = false;
    nextRound();
  }

  function startDaily() {
    clearTimeout(G.timer); G.timer = null; G.nextAction = null;
    G.mode = 'daily';
    G.pool = buildPool(G.cat);
    G.busy = false;
    // already played today? show the recorded result instead of a fresh score
    if (G.stats.dailyDone === todayKey()) {
      G.dailyIdx = 10;
      G.score = G.stats.dailyScore || 0;
      G.dailyMarks = (G.stats.dailyMarks || []).slice();
      return finishDaily();
    }
    G.dailyLocked = false;
    const rnd = mulberry32(todayKey() + (G.cat === 'mixed' ? 0 : G.cat === 'cities' ? 7 : 13));
    G.dailyRounds = []; G.dailyMarks = []; G.dailyIdx = 0; G.score = 0;
    const used = new Set();
    let a = G.pool[Math.floor(rnd() * G.pool.length)];
    used.add(a.name);
    for (let i = 0; i < 10; i++) {
      const b = partnerFor(a, i, rnd, G.pool, used);
      if (!b) break;
      used.add(b.name);
      G.dailyRounds.push([a, b]);
      a = b;
    }
    nextRound();
  }

  /* ── open / close ────────────────────────────────────────────── */
  function open(opt) {
    if (window.WPQUIZ) window.WPQUIZ.stop();
    const wp = W();
    let wrap = el('gameWrap');
    if (!wrap) {                       // container absent (embedded / test page)
      wrap = document.createElement('div');
      wrap.className = 'gamewrap'; wrap.id = 'gameWrap';
      document.body.appendChild(wrap);
    }
    clearTimeout(G.timer); G.timer = null; G.nextAction = null;
    G.open = true;
    wrap.hidden = false;
    document.body.classList.add('gm-on');

    if (!wp || !wp.S || !wp.S.data) {   // data still downloading — say so
      wrap.innerHTML = `<div class="gm-top"><div class="gm-title">Bigger<span>?</span></div>
          <button class="gm-x" id="gmClose" aria-label="Close">✕</button></div>
        <div class="gm-board"><div class="gm-over">
          <p>Loading population data... try again in a moment.</p></div></div>`;
      el('gmClose').onclick = close;
      return;
    }

    load();
    wrap.innerHTML = shell();
    if (G.statsNotice) { const note = document.createElement("p"); note.setAttribute("role","status"); note.textContent = "Invalid saved scores were ignored. You can still play normally."; wrap.appendChild(note); }
    el('gmClose').onclick = close;
    el('gmMode').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      G.mode = b.dataset.m; syncTabs(); startMode();
    };
    el('gmCat').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      G.cat = b.dataset.c; syncTabs(); startMode();
    };
    startMode(opt);
  }

  /* quiz.js owns the board while G.mode === 'quiz'; Bigger? state is left untouched */
  function startMode(opt) {
    clearTimeout(G.timer); G.timer = null; G.nextAction = null;
    const cat = el('gmCat'), foot = document.querySelector('.gm-foot span:first-child'), title = document.querySelector('.gm-title');
    if (title) title.innerHTML = G.mode === 'quiz' ? 'How much do you know about <span>humanity?</span>' : 'Bigger<span>?</span>';
    if (cat) cat.style.display = G.mode === 'quiz' ? 'none' : '';
    if (foot) foot.innerHTML = G.mode === 'quiz' ? 'Keys: <kbd>1</kbd>–<kbd>4</kbd> answer · <kbd>Esc</kbd> close' : 'Keys: <kbd>↑</kbd> more · <kbd>↓</kbd> fewer · <kbd>Esc</kbd> close';
    if (G.mode === 'quiz') { if (window.WPQUIZ) { if (opt && opt.party) window.WPQUIZ.start(false, 'party'); else if (opt && opt.room) window.WPQUIZ.start(opt.room, 'room'); else window.WPQUIZ.start(!(opt && opt.random)); } return; }
    if (window.WPQUIZ) window.WPQUIZ.stop();
    G.mode === 'daily' ? startDaily() : startEndless();
  }

  function close() {
    if (window.WPQUIZ) window.WPQUIZ.stop();
    G.open = false;
    clearTimeout(G.timer); G.timer = null; G.nextAction = null;
    const w = el('gameWrap');
    if (w) { w.hidden = true; w.innerHTML = ''; }
    document.body.classList.remove('gm-on');
  }

  document.addEventListener('keydown', e => {
    if (!G.open) return;
    if (e.key === 'Escape') return close();
    if (G.mode === 'quiz') { const k = +e.key; if (k >= 1 && k <= 4) { const b = document.querySelectorAll('.qz-opt')[k - 1]; if (b && !b.disabled) b.click(); } return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); answer('more'); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); answer('fewer'); }
  });

  window.WPGAME = { open, close, openQuiz: opt => { G.mode = 'quiz'; open(typeof opt === 'object' ? opt : { random: !!opt }); }, _partnerFor: partnerFor, _buildPool: buildPool,
                    _rng: mulberry32, _todayKey: todayKey, _G: G };
})();
