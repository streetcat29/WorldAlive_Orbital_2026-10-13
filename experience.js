'use strict';(()=>{
  // Today's challenge: open the real daily game (game.js owns the logic).
  const openDaily=e=>{if(!window.WPGAME)return;e.preventDefault();window.WPGAME._G.mode='daily';window.WPGAME.open();};
  const b=document.getElementById('wa-daily');if(b)b.addEventListener('click',openDaily);
  // Hero year form: go to /sixty/ with the year only (no other data).
  const f=document.getElementById('heroYear'),yi=document.getElementById('heroYearInput'),pv=document.getElementById('heroPreview');
  // Payoff before the click: same numbers /sixty/ will show, computed from the local World Bank series. Nothing stored or sent.
  let born=null,loading=null,tmr=0;const now=new Date().getFullYear();
  const nf=new Intl.NumberFormat('en',{maximumFractionDigits:0});
  const load=()=>loading||(loading=fetch('data/born.json',{credentials:'omit'}).then(r=>r.ok?r.json():null).then(d=>{if(!d||!Array.isArray(d.years)||!d.world||!Array.isArray(d.world.pop))throw new Error('Invalid historical data');born=d;return d;}).catch(()=>{loading=null;return null;}));
  const show=()=>{const v=(yi.value||'').trim();if(!/^\d{4}$/.test(v)||+v<1960||+v>now||!born){pv.hidden=true;return;}
    const ys=born.years,pop=born.world.pop,i=ys.indexOf(+v);let li=pop.length-1;while(li>=0&&pop[li]==null)li--;
    if(i<0||li<0||!Number.isFinite(pop[i])||pop[i]<=0||!Number.isFinite(pop[li])||!Number.isInteger(ys[li])){pv.hidden=true;return;}
    const chg=(pop[li]-pop[i])/pop[i]*100;
    pv.innerHTML='In <b>'+v+'</b> the world had <b>'+nf.format(pop[i])+'</b> people. By '+ys[li]+' it had '+(chg>=0?'grown':'shrunk')+' <b>'+Math.abs(chg).toFixed(1)+'%</b>. <a href="sixty/">See what else changed →</a>';pv.hidden=false;};
  if(f&&yi&&pv){yi.addEventListener('input',()=>{clearTimeout(tmr);tmr=setTimeout(()=>{load().then(show);},150);});
    f.addEventListener('submit',e=>{e.preventDefault();location.href='sixty/';});}
  // Presentation-only relabel of the data-source status. Never claims 'live' when app.js says error.
  const st=document.getElementById('statusText');
  if(st){const map={'offline \u00b7 cached seed':'estimate \u00b7 cached data','connecting...':'loading data\u2026'};const fix=()=>{const t=st.textContent.trim();if(map[t]&&st.textContent!==map[t])st.textContent=map[t];};fix();new MutationObserver(fix).observe(st,{childList:true,characterData:true,subtree:true});}
  // Daily-challenge return hook from REAL local stats (game.js key). Read-only; no fabricated numbers.
  const card=document.getElementById('dailyCard');
  if(card){let s={};try{const raw=localStorage.getItem('wp_game_v1');const v=raw&&raw.length<=4096?JSON.parse(raw):null;if(v&&typeof v==='object'&&!Array.isArray(v))s=v;}catch(_){}
    const today=new Date();const key=today.getUTCFullYear()*10000+(today.getUTCMonth()+1)*100+today.getUTCDate();
    const streak=Number.isSafeInteger(s.dailyStreak)&&s.dailyStreak>=0&&s.dailyStreak<=Math.floor(Date.now()/86400000)+1?s.dailyStreak:0;const done=s.dailyDone===key;
    card.innerHTML='<h2>Daily challenge</h2><div class="dc-row"><div class="dc-streak">'+(streak>0?streak+'<small>day streak</small>':'Ready<small>'+(done?'today done \u2014 back tomorrow':'10 rounds \u00b7 same for everyone today')+'</small>')+'</div><a class="wa-action primary" href="#play" id="dailyGo">'+(done?'Replay':'Play')+'</a></div>';
    card.hidden=false;const g=document.getElementById('dailyGo');if(g)g.addEventListener('click',openDaily);}
})();