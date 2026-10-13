/* Approved responsive layout behavior; uses existing data and feature engines. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);let watchActive=false,returnFocus=null,inerted=[];
 const visible=e=>e&&!e.hidden&&e.getClientRects().length&&getComputedStyle(e).display!=='none';
 function release(){for(const [e,value] of inerted)e.inert=value;inerted=[];watchActive=false;if(returnFocus&&visible(returnFocus))returnFocus.focus({preventScroll:true});returnFocus=null;}
 function syncWatch(){
  const wrap=$('streamWrap'),on=!!(wrap&&!wrap.hidden&&window.WPSTREAM?._V.on);
  if(!on){if(watchActive)release();return;}
  if(!watchActive){watchActive=true;returnFocus=$('watchBtn');wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-label','World Feed');
   // Keep the underlying globe pointer-interactive; other page controls are inert.
   const targets=[...document.body.children].filter(e=>e!==wrap&&e.tagName!=='MAIN'&&!['SCRIPT','STYLE','LINK'].includes(e.tagName));
   document.querySelectorAll('main .mapcol > :not(.mapcard),main .side').forEach(e=>targets.push(e));
   for(const e of targets){inerted.push([e,e.inert]);e.inert=true;}
   if(matchMedia('(prefers-reduced-motion: reduce)').matches)WPSTREAM.pause(true);
  }
  if(!wrap.querySelector('.pv-watch-controls')&&$('svCard')){
   const controls=document.createElement('div');controls.className='pv-watch-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','World Feed controls');
   const pause=document.createElement('button');pause.type='button';pause.id='pvPause';pause.onclick=()=>{WPSTREAM.pause();paintPause();};
   const skip=document.createElement('button');skip.type='button';skip.textContent='Next →';skip.onclick=()=>{WPSTREAM.skip();paintPause();};
   const exit=document.createElement('button');exit.type='button';exit.textContent='Exit';exit.onclick=()=>WPSTREAM.close();
   controls.append(pause,skip,exit);wrap.append(controls);paintPause();pause.focus({preventScroll:true});
   for(const [id,name] of [['svZin','Zoom in'],['svZout','Zoom out'],['svZfit','Show whole world']])$(id)?.setAttribute('aria-label',name);
  }
 }
 function paintPause(){const b=$('pvPause');if(b){const paused=!!window.WPSTREAM?._V.paused;const text=paused?'▶ Resume':'II Pause';if(b.textContent!==text)b.textContent=text;b.setAttribute('aria-pressed',String(paused));}}
 document.addEventListener('keydown',e=>{
  if(!watchActive)return;
  // Preserve native Space activation on controls, rather than also toggling the global shortcut.
  if(e.key===' '&&document.activeElement?.tagName==='BUTTON'){e.stopImmediatePropagation();return;}
  if(e.key!=='Tab')return;const wrap=$('streamWrap');const items=[...wrap.querySelectorAll('button:not(:disabled),a[href],input,select,[tabindex="0"]')].filter(visible);if(!items.length)return;
  const first=items[0],last=items[items.length-1],active=document.activeElement;
  if(e.shiftKey&&(active===first||!wrap.contains(active))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(active===last||!wrap.contains(active))){e.preventDefault();first.focus();}
 },true);
 const observer=new MutationObserver(syncWatch);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});syncWatch();
 document.addEventListener('keydown',()=>requestAnimationFrame(paintPause));
})();
