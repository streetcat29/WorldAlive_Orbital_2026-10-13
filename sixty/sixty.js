/* Sixty: local deterministic templates. No model, telemetry, personal persistence or runtime dependencies. */
(function(root){'use strict';
const EVENTS=typeof module==='object'&&module.exports?require('./events.js'):root.SixtyEvents;
const WB={source:'World Bank',sourceTitle:'Population, total (SP.POP.TOTL)',url:'https://data.worldbank.org/indicator/SP.POP.TOTL'};
const UN={source:'United Nations',sourceTitle:'World Population Prospects 2024',url:'https://population.un.org/wpp/'};
const CHOICES=['Remember this','New to me','Not my world'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(n)?new Intl.NumberFormat('en',{maximumFractionDigits:0}).format(n):'Unavailable';
const pct=n=>new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(n)+'%';
function validYear(v,now){if((typeof v!=='number'&&typeof v!=='string')||!/^\d{4}$/.test(String(v))||!Number.isInteger(Number(v))||Number(v)<1960||Number(v)>now)throw new Error('Enter a whole birth year from 1960 to '+now+'.');return Number(v);}
function at(years,values,year){const i=years?.indexOf(year);const v=i>=0?values?.[i]:null;return Number.isFinite(v)&&v>0?v:null;}
function latest(years,values,now){let point={year:null,value:null};(years||[]).forEach(y=>{const value=at(years,values,y);if(y<=now&&value!==null&&(point.year===null||y>point.year))point={year:y,value};});return point;}
function eventAge(event,birth){const age=event.year-birth;return age<0?{age:null,text:'Before your birth year — public history, not a personal memory.'}:{age,text:(age===0?'In your birth year — not necessarily after your birthday.':'Around age '+age+' by calendar year; actual age may differ by one.')+' Public history, not a claim that you experienced it.'};}
function compare(birth,end){return birth!==null&&end!==null?{delta:end-birth,percent:(end-birth)/birth*100}:null;}
function buildStory(data,profile,now){
const year=validYear(profile.year,now);
function selected(key){
 if(!(key in profile))return '';
 const value=profile[key];
 if(!Object.hasOwn(profile,key)||typeof value!=='string'||(value!==''&&(!/^[A-Z]{3}$/.test(value)||!Object.hasOwn(data.world.countries,value))))throw new Error('Choose a country from the local list, or leave it blank.');
 return value;
}
const legacy=selected('country'),birthCountry=selected('birthCountry'),currentCountry=selected('currentCountry');
const country=Object.hasOwn(profile,'birthCountry')?birthCountry:legacy;
const hasCountry=!!(country||currentCountry);
if(!Array.isArray(data.born?.years)||!Array.isArray(data.born?.world?.pop))throw new Error('Local population data unavailable. No substitute data used.');
const start=at(data.born.years,data.born.world.pop,year),end=latest(data.born.years,data.born.world.pop,now),change=end.year>=year?compare(start,end.value):null;
// The source ledger retains earlier history; the default narrative is modern only.
const used=new Set(),available=EVENTS.filter(e=>e.year>=2000&&e.year<now);
const kinds=['Technology','Gaming','Entertainment','Sport','Science'];
const kindUses=new Map();
const ageReady=e=>e.year>=year+6;
function take(pool,target){
 const ordered=pool.filter(e=>!used.has(e.id)).sort((a,b)=>
   (kindUses.get(a.kind)||0)-(kindUses.get(b.kind)||0)||
   Math.abs(a.year-target)-Math.abs(b.year-target)||kinds.indexOf(a.kind)-kinds.indexOf(b.kind)||a.id.localeCompare(b.id));
 const e=ordered[0];if(!e)return null;
 used.add(e.id);kindUses.set(e.kind,(kindUses.get(e.kind)||0)+1);
 return {...e,...eventAge(e,year)};
}
const ready=available.filter(ageReady);
// Prefer school/teen years, then other age-six-plus public events. For very
// recent births use the latest real public history, explicitly dated before birth.
const school=ready.filter(e=>e.year<=year+19);
const eraPool=school.length?school:ready.length?ready:available;
const recognizable=eraPool.filter(e=>e.kind!=='Science');
const arrival=take(recognizable.length?recognizable:eraPool,school.length?year+14:now-1);
const childhood=[10,18].filter(age=>year+age<now).map(age=>({age,year:year+age,event:take(ready.filter(e=>e.year<=year+age),year+age)}));
const discovery=hasCountry?null:take(ready.some(e=>!used.has(e.id))?ready:available,now-1);
// Category round-robin within age-six-plus and fallback tiers; each id appears
// once and scene events are excluded. Only after exhaustion may the UI cycle.
const memories=[];
for(const pool of [available.filter(ageReady),available.filter(e=>!ageReady(e))]){
 let next;while((next=take(pool,now-1)))memories.push(next);
}
const facts=[{id:'world-birth',year,value:start,...WB},{id:'world-latest',...end,...WB}];
let cross=null;
if(data.timeline?.years&&year>=1950&&year<(data.timeline.proj_from||2024)&&start!==null){const value=at(data.timeline.years,data.timeline.world,year);if(value!==null){cross={year,wb:start,un:value,delta:value-start,...UN};facts.push({id:'UN-cross-check',year,value,...UN});}}
function countryLens(iso,role,lastOverride){
 if(!iso)return null;
 const c=data.world.countries[iso],values=data.born.countries?.[iso]?.pop;
 const pairs=data.born.years.filter(y=>y>=year&&y<=now&&at(data.born.years,values,y)!==null&&at(data.born.years,data.born.world.pop,y)!==null);
 const last=lastOverride===undefined?(pairs.length?Math.max(...pairs):null):lastOverride;
 const a=at(data.born.years,values,year),b=at(data.born.years,values,last),worldEnd=at(data.born.years,data.born.world.pop,last);
 const complete=a!==null&&b!==null&&start!==null&&worldEnd!==null;
 return {country:iso,name:c.name,role,year,last,start:a,end:b,change:complete?compare(a,b):null,worldChange:complete?compare(start,worldEnd):null};
}
const birthLens=countryLens(country,'Country of birth'),currentLens=countryLens(currentCountry,'Current country');
const lenses=[birthLens,currentLens].filter(Boolean),lens=birthLens||currentLens;
for(const l of lenses)facts.push({id:l.role+'-birth',year,value:l.start,country:l.country,...WB},{id:l.role+'-latest',year:l.last,value:l.end,country:l.country,...WB});
let countryComparison=null;
if(country&&currentCountry){
 const common=data.born.years.filter(y=>y>=year&&y<=now&&[data.born.world.pop,data.born.countries?.[country]?.pop,data.born.countries?.[currentCountry]?.pop].every(values=>at(data.born.years,values,y)!==null));
 const last=common.length?Math.max(...common):null;
 const birth=countryLens(country,'Country of birth',last),current=countryLens(currentCountry,'Current country',last);
 countryComparison={year,last,birth,current,sameCountry:country===currentCountry,complete:!!(birth.change&&current.change)};
}
const roles=lenses.map(l=>l.role+': '+l.name).join('. ');
const scenes=[
{id:'arrival',label:'Your era',title:arrival?arrival.title:'A world already in motion.',caption:arrival?arrival.fact+' '+arrival.meaning:'Your birth year belongs to an ongoing human story. This archive has no modern milestone before the current year; we will not invent one.',events:arrival?[{...arrival,context:arrival.year<year?'Before your birth year · public context':arrival.year===year?'In your birth year · public context':'Your era · '+arrival.year+' (not your birth year)'}]:[]},
{id:'childhood',label:'Grow',title:childhood.length?'While the calendar moved forward.':'Your early chapters are still ahead.',caption:childhood.length?'Ages ten and eighteen are calendar markers, not inferred memories. Modern milestones are shown only when one fits after age six and by that marker; earlier history stays on the Credits page.':'Neither age-ten nor age-eighteen calendar year is strictly in the past. No future events or memories are invented.',events:childhood.filter(x=>x.event).map(x=>({...x.event,context:'Around age '+x.age+' → '+x.year+' · '+(x.event.year===x.year?'in that calendar year':'a milestone already reached by then')}))},
{id:'change',label:'Zoom out',title:change?(change.delta>0?'The world made room for more.':change.delta<0?'The world’s population became smaller.':'A starting point, not a trend yet.'):'A comparison needs two real endpoints.',caption:change?'Between your birth year and the latest cached World Bank year, the global population '+(change.delta>0?'grew':change.delta<0?'fell':'did not change')+'. This is net population change—not a count of births, and not a live estimate.':'The local series does not have a usable birth-year endpoint. Older data is context only; it cannot be called growth since your birth.',events:[]},
{id:'lens',label:'Connect',title:lens?(countryComparison?.sameCountry?'Same years. One place, two roles.':'Same years. Different scales.'):discovery?discovery.title:'Take a wider view.',caption:lens?roles+'. '+(countryComparison?.sameCountry?'One selected place, not a journey. ':'')+'Historical population context, not your residence history. Current country means your chosen context today. No move date or route inferred.':discovery?discovery.fact+' '+discovery.meaning:'Add a country if you would like a population comparison. It is entirely optional.',events:!lens&&discovery?[{...discovery,context:'A recent anchor in this curated archive'}]:[]},
{id:'memory',label:'React',title:'History happened. What connects?',caption:'Explore modern public moments across technology, games, entertainment, sport and science. “Remember this” saves a thought for this visit; it does not claim you lived through it. Nothing is selected for you.',events:[]},
{id:'next',label:'Perspective',title:'Your world perspective',caption:'A playful reading of your selections, not a personality assessment.',events:[]}
];
return {year,country,birthCountry:country,currentCountry,birthLens,currentLens,lenses,countryComparison,now,start,end,change,cross,lens,childhood,scenes,memories,facts,populationCacheDate:String(data.born.generated||'').slice(0,10),liveAI:false};
}

// Explicit selections only. Category counts are editorial weights, never psychometric scores.
const ARCHETYPES={Technology:'Everyday Innovator',Gaming:'Playful Explorer',Entertainment:'Culture Connector',Sport:'Shared-Moment Seeker',Science:'Big-Picture Explorer'};
const CATEGORY_WINDOWS={Technology:'Everyday tools and new ways to connect form the thread.',Gaming:'Worlds built for play form the thread.',Entertainment:'Stories, screens and shared culture form the thread.',Sport:'Public moments people gather around form the thread.',Science:'Discoveries that widen the picture form the thread.'};
const DISCLAIMER='A playful reading of your selections, not a personality assessment.';
const REACTION_RULE='“Remember this” signals familiarity; “New to me” signals curiosity. Each adds one equal category vote. “Not my world” records a preference only: zero votes, no penalty. At least two positive selections are needed; a unique leading category also needs two. Ties stay balanced. Countries and birth year never affect the title.';
function buildConclusion(s,reactions={}){
 const catalog=EVENTS.filter(e=>e.year>=2000&&e.year<s.now&&Object.hasOwn(ARCHETYPES,e.kind)).slice().sort((a,b)=>b.year-a.year||a.id.localeCompare(b.id));
 const evidence=catalog.filter(e=>reactions&&Object.hasOwn(reactions,e.id)&&CHOICES.includes(reactions[e.id])).map(e=>({...e,choice:reactions[e.id],signal:reactions[e.id]===CHOICES[0]?'familiarity':reactions[e.id]===CHOICES[1]?'curiosity':'preference only',weight:reactions[e.id]===CHOICES[2]?0:1}));
 const counts=Object.keys(ARCHETYPES).map(kind=>({kind,familiar:evidence.filter(e=>e.kind===kind&&e.choice===CHOICES[0]).length,curious:evidence.filter(e=>e.kind===kind&&e.choice===CHOICES[1]).length,negative:evidence.filter(e=>e.kind===kind&&!e.weight).length})).map(c=>({...c,total:c.familiar+c.curious}));
 const positive=evidence.filter(e=>e.weight),max=Math.max(0,...counts.map(c=>c.total)),leaders=counts.filter(c=>c.total===max&&max>0).map(c=>c.kind);
 const state=positive.length<2?'quiet':leaders.length===1&&max>=2?'focused':'balanced';
 const archetype=state==='quiet'?'Quiet Observer':state==='focused'?ARCHETYPES[leaders[0]]:'Open-Horizon Explorer';
 const title=state==='focused'?'A hint of the '+archetype:state==='balanced'?archetype+' · a balanced mix':archetype+' · for now';
 const tally=counts.filter(c=>c.total).map(c=>c.kind+': '+c.familiar+' familiar + '+c.curious+' curious').join('; ');
 const shortEvidence=positive.length?tally+'.'+(evidence.some(e=>!e.weight)?' Not my world selections do not subtract votes.':''):evidence.length?'Only “Not my world” selections: preferences noted, no positive category signal.':'No reactions selected; no interests inferred.';
 let drawn=state==='quiet'?(positive.length?'One positive selection is a starting point, not enough for a theme. ':evidence.length?'You marked what was not your world, not what drew you in. No interest is guessed. ':'You have left the moments open. There is no reaction pattern to read yet. '):state==='focused'?'Your selections lean toward '+leaders[0].toLowerCase()+' in this visit—not a fixed trait. ':'Your selections open more than one window; '+leaders.join(' and ').toLowerCase()+' share the lead. ';
 if(state==='focused')drawn+=CATEGORY_WINDOWS[leaders[0]]+' ';
 drawn+=shortEvidence;
 const b=s.birthLens,c=s.currentLens,comparison=s.countryComparison;
 const labels=[b?'Born in '+b.name:'',c?'Current country '+c.name:''].filter(Boolean).join(' / ');
 const date=s.populationCacheDate&&/^\d{4}-\d{2}-\d{2}$/.test(s.populationCacheDate)?'; cache '+s.populationCacheDate:'';
 let place;
 if(!b&&!c)place='Your world lens has no country selected. Follow change at the global scale without assigning yourself a geographic story.';
 else if(b&&!c)place=labels+' (user-reported). View world change through this starting-country lens; it says nothing about where you grew up or live now.';
 else if(!b&&c)place=labels+' (user-reported). This is your chosen current-country lens, not an assumption of residency or a starting place.';
 else if(comparison.sameCountry)place=labels+' (user-reported). One place across time, in two roles—not evidence of travel or of staying there.';
 else place=labels+' (user-reported). Two geographic reference frames, not a migration story.';
 let populationEvidence=null;
 if(b&&c&&!comparison.sameCountry){
  if(comparison.complete){
   populationEvidence={year:comparison.year,last:comparison.last,birth:comparison.birth,current:comparison.current,...WB,cacheDate:s.populationCacheDate};
   place+=' In '+comparison.last+', population was '+fmt(comparison.birth.end)+' / '+fmt(comparison.current.end)+' in that order; change over the same '+comparison.year+'–'+comparison.last+' years: '+pct(comparison.birth.change.percent)+' / '+pct(comparison.current.change.percent)+' (World Bank annual estimates'+date+'). Geographic context, not a cause of your choices.';
  }else place+=' A same-year growth comparison is unavailable: matching birth-year and common endpoints are required. No substitute years used.';
 }else if(b||c){
  const l=b||c;
  if(l.change&&l.worldChange){populationEvidence={year:l.year,last:l.last,lens:l,...WB,cacheDate:s.populationCacheDate};place+=' Over '+l.year+'–'+l.last+', this country’s population changed '+pct(l.change.percent)+' versus '+pct(l.worldChange.percent)+' worldwide (World Bank annual estimates'+date+').';}
  else place+=' Matching birth-year population endpoints are unavailable; no growth is inferred.';
 }
 // Curiosity first, then unselected leading-category history, then any unselected
 // event. Never recommend a rejection or imply an unselected event is an interest.
 const unseen=catalog.filter(e=>!evidence.some(x=>x.id===e.id));
 const recommendation=evidence.find(e=>e.choice===CHOICES[1])||unseen.find(e=>leaders.includes(e.kind))||unseen[0]||positive[0]||null;
 const basis=recommendation?(evidence.some(e=>e.id===recommendation.id&&e.choice===CHOICES[1])?'Follow your “New to me” selection':unseen.some(e=>e.id===recommendation.id)?'Try one unselected public moment':'Revisit a positive selection'):null;
 const discovery=recommendation?basis+': '+recommendation.title+' ('+recommendation.year+'). '+eventAge(recommendation,s.year).text+' Read its context and decide whether it connects.':'No unselected or positive moment remains. Open World History and compare the population at your birth year with the latest dated estimate; no interest is assumed.';
 return {title,archetype,state,leaders,counts,evidence,shortEvidence,disclaimer:DISCLAIMER,rule:REACTION_RULE,paragraphs:[drawn,place,discovery],populationEvidence,recommendation:recommendation?{...recommendation,href:'#scene',label:'Explore this moment ↗'}:{href:'/history/',label:'Compare in World History ↗'}};
}
function conclusionHTML(c){
 return '<section class="conclusion" aria-labelledby="conclusion-title"><h2 id="conclusion-title">'+esc(c.title)+'</h2><div id="conclusion-paragraphs">'+c.paragraphs.map((p,i)=>'<p>'+esc(p)+(i===2?' <a id="conclusion-discovery" href="'+c.recommendation.href+'">'+esc(c.recommendation.label)+'</a>':'')+'</p>').join('')+'</div><details id="conclusion-why"><summary>Why this result?</summary><p>'+esc(c.rule)+'</p><ul>'+c.evidence.map(e=>'<li>'+esc(e.title+' ('+e.year+') · '+e.kind+' · “'+e.choice+'” → '+e.signal+'; '+e.weight+' category vote'+(e.weight===1?'':'s')+'. Source: '+e.source+' · '+e.sourceTitle)+'.</li>').join('')+'</ul>'+(c.evidence.length?'':'<p>No reactions selected. Nothing inferred on your behalf.</p>')+(c.populationEvidence?'<p>'+esc('Population evidence: World Bank · SP.POP.TOTL · matching '+c.populationEvidence.year+'–'+c.populationEvidence.last+' endpoints. Annual estimates; percentages rounded to two decimals. Cache date is not the observation year.')+'</p>':'')+'<p>Event dates and categories come from the curated local archive. Source links remain on the dedicated <a href="sources.html">Credits page</a>.</p></details></section>';
}

function sourceLink(f){return '<a class="source" href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer">'+esc(f.source+' · '+f.sourceTitle)+' ↗</a>';}
function pointText(s){return s.start===null?'Birth-year population unavailable in the local World Bank series.':fmt(s.start)+' people · World Bank · '+s.year;}
function wrap(text,width){const out=[];let line='';const words=String(text).split(/\s+/).flatMap(w=>w.match(new RegExp('.{1,'+width+'}','g'))||[]);words.forEach(word=>{if((line+' '+word).trim().length>width&&line){out.push(line);line=word;}else line=(line+' '+word).trim();});if(line)out.push(line);return out;}
function posterSVG(s,reactions={}){
 const conclusion=buildConclusion(s,reactions);
 const e=s.scenes[0].events[0];let y=62;const nodes=[];
 function block(text,size=20,bold=false){y+=size;for(const line of wrap(text,Math.floor(1040/(size*1.05)))){nodes.push('<text x="65" y="'+y+'" font-size="'+size+'"'+(bold?' font-weight="700"':'')+'>'+esc(line)+'</text>');y+=size*1.35;}y+=14;}
 block('WORLDALIVE / YOUR WORLD IN 60 SECONDS',20,true);
 block('Your world perspective',32,true);block(conclusion.title,30,true);block(conclusion.disclaimer,18);
 conclusion.paragraphs.forEach(p=>block(p,22));block('Why: '+conclusion.shortEvidence,18);
 const examples=conclusion.evidence.filter(e=>e.weight).slice(0,2);
 if(examples.length)block('Selected evidence: '+examples.map(e=>e.title+' ('+e.year+', '+e.kind+') — '+e.choice).join('; ')+'.',17);
 block('Reaction mapping: Remember this = familiarity; New to me = curiosity; equal category votes. Not my world = preference only, no penalty. Titles describe selections, not people.',17);
 if(conclusion.recommendation.id)block('Discovery source: '+conclusion.recommendation.source+' · '+conclusion.recommendation.sourceTitle+' · '+conclusion.recommendation.year+' · '+conclusion.recommendation.url,17);
 block('Local next step: '+(conclusion.recommendation.id?'/sixty/ · Explore this moment':conclusion.recommendation.href),17);
 block('BIRTH YEAR · POPULATION CONTEXT',18);block(String(s.year),82,true);
 block(e?(e.year<s.year?'Before your birth year — public history':e.year===s.year?'In your birth year — public history':'Your era — not your birth year')+' · '+e.year:'No event invented',18);
 block(e?e.title:'Your era',26,true);block(e?e.fact:'No modern historical anchor available.',22);
 block(pointText(s)+'. '+(s.change?'World population change '+s.year+'–'+s.end.year+': '+pct(s.change.percent)+' (rounded).':'Birth-year growth comparison unavailable.'),20);
 if(s.lenses.length)for(const l of s.lenses)block(l.role+': '+l.name+' ('+l.country+').',20,true);else block('World lens · no country selected.',20);
 block((s.countryComparison?.sameCountry?'One place, two roles. ':'')+'Current country is chosen context today, not residence since birth. No move date or route inferred. No personal memories inferred.',17);
 if(e){block(e.source+' · '+e.sourceTitle+' · '+e.year,17);block(e.url,15);}
 block('World Bank · Population, total · data.worldbank.org/indicator/SP.POP.TOTL',16);
 block('Annual estimates, not a live counter. Offline templates. GeoNames country names. Includes conclusion and short selection evidence; no private memories inferred.',16);
 const height=Math.max(1000,Math.ceil(y+30));
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="'+height+'" viewBox="0 0 1200 '+height+'" role="img" aria-label="Source-labelled world discovery poster"><desc>'+esc(e?e.title+' · '+e.source+' · '+e.sourceTitle+' · '+e.url:'Curated history')+'</desc><rect width="1200" height="'+height+'" fill="#ffffff"/><g fill="#14252c" font-family="sans-serif">'+nodes.join('')+'</g></svg>';
}
/* Minimal TopoJSON decoder + equirectangular projection of the real local Natural Earth atlas. */
function mapPaths(topology){if(!topology?.transform||!topology.objects?.countries)throw new Error('Local map format unavailable.');const {scale,translate}=topology.transform;const arcs=topology.arcs.map(arc=>{let x=0,y=0;return arc.map(p=>{x+=p[0];y+=p[1];return [x*scale[0]+translate[0],y*scale[1]+translate[1]];});});const project=([lon,lat])=>[(lon+180)*2,(90-lat)*2];function ring(ids){const coords=[];ids.forEach(id=>{const pts=id<0?arcs[~id].slice().reverse():arcs[id];coords.push(...pts.slice(coords.length?1:0));});return coords.map((p,i)=>{const xy=project(p);const previous=i?coords[i-1]:null;return (!i||previous&&Math.abs(p[0]-previous[0])>180?'M':'L')+xy.map(n=>n.toFixed(2)).join(',');}).join(' ')+'Z';}return topology.objects.countries.geometries.filter(g=>['Polygon','MultiPolygon'].includes(g.type)).map(g=>({id:g.id,name:g.properties.name,path:(g.type==='Polygon'?[g.arcs]:g.arcs).map(p=>p.map(ring).join(' ')).join(' ')}));}
const api={EVENTS,CHOICES,validYear,at,latest,eventAge,compare,buildStory,buildConclusion,conclusionHTML,ARCHETYPES,posterSVG,mapPaths,sourceLink};
if(typeof module==='object'&&module.exports){module.exports=api;return;}root.Sixty=api;
const $=id=>document.getElementById(id);
if($('event-credits')){$('event-credits').innerHTML=EVENTS.map(e=>'<article data-event-credit="'+esc(e.id)+'"><h3>'+e.year+' · '+esc(e.title)+'</h3><p>'+esc(e.fact)+'</p><p>'+esc(e.meaning)+'</p>'+sourceLink(e)+'</article>').join('');return;}
const now=new Date().getFullYear();let data,story,index=0,timer=null,memoryIndex=0,reactions={},geometry=null;
function theme(value,save=false){const t=['light','day'].includes(value)?'light':'dark';document.documentElement.dataset.theme=t;$('theme').textContent=t==='dark'?'Day mode':'Night mode';$('theme').setAttribute('aria-label',t==='dark'?'Switch to day theme':'Switch to night theme');if(save)try{localStorage.setItem('wp_theme',t);}catch(_){/* storage is optional */}}
try{theme(localStorage.getItem('wp_theme'));}catch(_){theme('dark');}$('theme').onclick=()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark',true);
$('year').max=now;
function pause(){if(timer)clearInterval(timer);timer=null;$('play').textContent='Play captions';$('play').setAttribute('aria-pressed','false');}
function drawMap(){
 if(!geometry){$('map').textContent='Local map unavailable. Your sourced story still works.';return;}
 const selected=[...new Set(story.lenses.map(l=>l.country))],num2iso=data.world.num2iso3||{};
 const lands=geometry.map(f=>'<path class="land'+(selected.includes(num2iso[String(Number(f.id))])||selected.includes(num2iso[f.id])?' selected':'')+'" d="'+f.path+'"><title>'+esc(f.name)+'</title></path>').join('');
 const notes=[];const markers=selected.map(iso=>{const c=data.world.countries[iso],roles=story.lenses.filter(l=>l.country===iso).map(l=>l.role).join(' / ');const known=[c.lon,c.lat].every(v=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v)))&&Math.abs(Number(c.lat))<=90&&Math.abs(Number(c.lon))<=180;
 const label=roles+': '+c.name+' · '+(known?'approximate capital marker, not your location':'no usable marker coordinates');notes.push(label);
 return known?'<circle class="map-marker" data-country="'+iso+'" cx="'+((Number(c.lon)+180)*2)+'" cy="'+((90-Number(c.lat))*2)+'" r="5"><title>'+esc(label)+'</title></circle>':'';}).join('');
 $('map').innerHTML='<svg viewBox="0 0 720 360" role="img" aria-label="World map · approximate capitals, not personal locations"><rect class="ocean" width="720" height="360"/><path class="graticule" d="M0 180H720 M0 90H720 M0 270H720 M180 0V360 M360 0V360 M540 0V360"/>'+lands+markers+'</svg>';
 $('map-note').textContent='Natural Earth / World Atlas · GeoNames · borders indicative; small territories may not appear. '+notes.join('. ');
}
function drawArc(){const pts=[{year:story.year,label:'BIRTH'},...story.childhood.map(c=>({year:c.year,label:'≈'+c.age})),{year:now,label:'NOW'}];const span=Math.max(1,now-story.year);$('arc-points').innerHTML=pts.filter((p,i)=>pts.findIndex(x=>x.year===p.year)===i).map(p=>{const a=Math.PI*(1-(p.year-story.year)/span),x=275+225*Math.cos(a),y=235-225*Math.sin(a);return '<circle class="arc-point" cx="'+x+'" cy="'+y+'" r="4"/><text class="arc-text" text-anchor="middle" x="'+x+'" y="'+(y+22)+'">'+p.year+'</text><text class="arc-text" text-anchor="middle" x="'+x+'" y="'+(y-14)+'">'+p.label+'</text>';}).join('');$('arc-label').textContent=story.year+' → '+now;}
function reactionMarkup(e){return '<div class="reactions" aria-label="Reaction to '+esc(e.title)+'">'+CHOICES.map(choice=>'<button type="button" data-event="'+e.id+'" data-choice="'+choice+'" aria-pressed="'+(reactions[e.id]===choice)+'">'+choice+'</button>').join('')+'</div>';}
function momentHTML(e,full=true){return '<section class="moment" data-moment="'+e.id+'"><p class="eyebrow">'+e.year+' / '+esc(e.kind)+(e.context?' · '+esc(e.context):'')+'</p>'+(full?'<h3>'+esc(e.title)+'</h3><p class="fact">'+esc(e.fact)+'</p><p class="meaning">'+esc(e.meaning)+'</p>':'')+'<p class="small">'+esc(e.text)+'</p>'+reactionMarkup(e)+'</section>';}
function stat(value,text,source=WB){return '<div class="stat"><strong>'+esc(value)+'</strong><p class="small">'+esc(text)+'</p>'+'</div>';}
function summary(){const entries=Object.entries(reactions);$('memory-summary').textContent=entries.length?entries.map(([id,c])=>EVENTS.find(e=>e.id===id).title+' — “'+c+'”').join(' · '):'No reactions yet. Nothing remembered on your behalf.';}
function render(i,focus=false){index=Math.min(5,Math.max(0,i));const s=story.scenes[index];$('kicker').textContent='0'+(index+1)+' / '+s.label.toUpperCase();$('scene-title').textContent=s.title;$('caption').textContent=s.caption;$('evidence').replaceChildren();$('moments').innerHTML=s.events.map(e=>momentHTML(e,!['arrival','lens'].includes(s.id))).join('');$('country-panel').hidden=!['lens','next'].includes(s.id);$('memory-panel').hidden=s.id!=='memory';$('next-panel').hidden=s.id!=='next';
if(s.id==='arrival')$('evidence').innerHTML=stat(story.start===null?'No birth-year estimate':fmt(story.start),story.start===null?'The latest cached year is '+story.end.year+'. It is not your birth year.':story.year+' · people in the world during your birth year. Annual estimate, not an exact birthday count.');
if(s.id==='childhood'){$('evidence').innerHTML=story.childhood.map(c=>'<p class="small">Around age '+c.age+': calendar year '+c.year+(c.event?' · milestone below occurred in '+c.event.year: ' · no unused curated milestone by this point')+'.</p>').join('');}
if(s.id==='change'){$('evidence').innerHTML=story.change?stat(pct(story.change.percent),story.year+' → '+story.end.year+' · ('+fmt(story.end.value)+' − '+fmt(story.start)+') ÷ '+fmt(story.start)+' × 100. Display rounded to two decimals. Net change: '+fmt(story.change.delta)+' people.'):stat('Not available',pointText(story));if(story.cross)$('evidence').innerHTML+='<p class="small">Independent same-year context: UN WPP estimates '+fmt(story.cross.un)+' people in '+story.year+'; World Bank gives '+fmt(story.cross.wb)+'. Different revisions and methods can differ. This cross-check is not used in the growth calculation.</p>'+sourceLink(UN);}
if(s.id==='lens'&&story.lens){
 $('evidence').innerHTML=story.lenses.map(l=>'<h3>'+esc(l.role+': '+l.name)+'</h3>'+(l.change&&l.worldChange?stat(pct(l.change.percent)+' / '+pct(l.worldChange.percent),l.name+' / world · '+l.year+' → '+l.last+' · same years, same World Bank series. Country: '+fmt(l.start)+' → '+fmt(l.end)+'. Annual estimates; growth rounded. Historical context, not residence history.'):stat('Comparison unavailable','Missing a matching country or world endpoint for birth year '+l.year+'. No replacement start year used.'))).join('');
 const c=story.countryComparison;
 if(c)$('evidence').innerHTML+='<h3>'+(c.sameCountry?'One place · both roles':'Both countries · common reference years')+'</h3>'+(c.complete?stat(c.sameCountry?'Single-place context':pct(c.birth.change.percent)+' / '+pct(c.current.change.percent),'Country of birth: '+c.birth.name+' '+fmt(c.birth.start)+' → '+fmt(c.birth.end)+'; Current country: '+c.current.name+' '+fmt(c.current.start)+' → '+fmt(c.current.end)+'. BOTH use '+c.year+' → '+c.last+'. World Bank annual estimates; growth rounded. No migration inferred.'):stat('Common comparison unavailable','Both countries need birth-year and common country/world endpoints. Separate lenses above are not a direct two-country comparison.'));
}
if(s.id==='memory'){const e=story.memories[memoryIndex%Math.max(1,story.memories.length)];$('moments').innerHTML=e?momentHTML(e):'<p>No further historical anchors are available.</p>';$('another').disabled=story.memories.length<2;summary();}
$('conclusion-host').replaceChildren();if(s.id==='next')$('conclusion-host').innerHTML=conclusionHTML(buildConclusion(story,reactions));
 if(!$('share-panel').hidden)openPoster();
$('position').textContent='Scene '+(index+1)+' of 6';$('prev').disabled=index===0;$('next').disabled=index===5;[...$('scene-nav').children].forEach((b,n)=>{if(n===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});if(focus)$('scene').focus();}
function openPoster(){pause();$('share-panel').hidden=false;$('share-disclosure').textContent='This poster includes birth year '+story.year+(story.lenses.length?'. '+story.lenses.map(l=>l.role+': '+l.name).join('. '):' and no country')+'. Current country is chosen context today, not residence since birth. No move date or route inferred. It includes your personalized conclusion, short reaction evidence, a public historical fact and population context. No reactions are sent anywhere; downloading saves this evidence in your local file. No private memories inferred. Review it below, then choose a download.';$('poster-preview').innerHTML=posterSVG(story,reactions);$('export-status').textContent='';}
function build(){pause();try{story=buildStory(data,{year:$('year').value,birthCountry:$('country').value,currentCountry:$('current-country').value},now);$('intro').hidden=true;$('experience').hidden=false;$('share-panel').hidden=true;$('profile-label').textContent='YOUR YEAR / '+story.year+' · '+(story.lenses.length?story.lenses.map(l=>l.role+': '+l.name).join(' · '):'WORLD VIEW');$('scene-nav').innerHTML=story.scenes.map((s,i)=>'<button type="button" data-scene="'+i+'"><span>0'+(i+1)+'</span>'+s.label+'</button>').join('');drawArc();drawMap();render(0,true);}catch(e){$('status').textContent=e.message;}}

/* Instant preview while typing: payoff before submit. Pure local numbers; nothing stored or sent. */
let previewTimer=0;
function preview(){const el=$('preview');const v=($('year').value||'').trim();if(!data||!/^\d{4}$/.test(v)||+v<1960||+v>now){el.hidden=true;return;}
 try{const y=+v,start=at(data.born.years,data.born.world.pop,y),end=latest(data.born.years,data.born.world.pop,now);
  if(start===null||end.value===null){el.hidden=true;return;}
  const ch=compare(start,end.value);el.innerHTML='In <b>'+y+'</b> the world had <b>'+fmt(start)+'</b> people. By '+end.year+' it had '+(ch.delta>=0?'grown':'shrunk')+' <b>'+pct(Math.abs(ch.percent))+'</b>.';el.hidden=false;
  const s=buildStory(data,{year:y},now),e=s.scenes[0].events[0],tz=document.querySelector('.teaser');
  if(e&&tz){tz.querySelector('.eyebrow').textContent='A SIGNAL FROM YOUR ERA / '+e.year;tz.querySelector('h2').textContent=e.title;const ps=tz.querySelectorAll('p');if(ps[0])ps[0].textContent=e.fact;const a=tz.querySelector('a');if(a){a.hidden=true;}}
 }catch(_){el.hidden=true;}}
$('year').addEventListener('input',()=>{clearTimeout(previewTimer);previewTimer=setTimeout(preview,150);});
$('year-form').onsubmit=e=>{e.preventDefault();reactions={};memoryIndex=0;build();};
$('scene-nav').onclick=e=>{const b=e.target.closest('button[data-scene]');if(b){pause();render(Number(b.dataset.scene),true);}};
$('prev').onclick=()=>{pause();render(index-1,true);};$('next').onclick=()=>{pause();render(index+1,true);};
$('play').onclick=()=>{if(timer){pause();return;}if(index===5)render(0);$('play').textContent='Pause captions';$('play').setAttribute('aria-pressed','true');timer=setInterval(()=>{if(index<5)render(index+1);else pause();},10000);};
$('restart').onclick=()=>{pause();memoryIndex=0;render(0,true);$('share-panel').hidden=true;};
$('edit').onclick=()=>{pause();$('experience').hidden=true;$('intro').hidden=false;$('year').focus();};
for(const id of ['country','current-country'])$(id).onchange=()=>{const oldIndex=index,oldMoment=story.memories[memoryIndex%Math.max(1,story.memories.length)]?.id;build();const same=story.memories.findIndex(e=>e.id===oldMoment);if(same>=0)memoryIndex=same;render(oldIndex);$(id).focus();};
$('moments').onclick=e=>{const b=e.target.closest('button[data-choice]');if(!b)return;pause();const id=b.dataset.event,choice=b.dataset.choice;if(reactions[id]===choice)delete reactions[id];else reactions[id]=choice;const focusedChoice=choice;render(index);const same=[...$('moments').querySelectorAll('button')].find(x=>x.dataset.event===id&&x.dataset.choice===focusedChoice);same?.focus();};
$('another').onclick=()=>{pause();memoryIndex++;render(index);};
$('scene').addEventListener('keydown',e=>{if(e.target!==$('scene')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();pause();render(e.key==='Home'?0:e.key==='End'?5:index+(e.key==='ArrowLeft'?-1:1),true);});
$('conclusion-host').onclick=e=>{const a=e.target.closest('#conclusion-discovery');if(!a)return;const target=buildConclusion(story,reactions).recommendation;if(!target.id)return;e.preventDefault();pause();const scene=story.scenes.findIndex(s=>s.events.some(x=>x.id===target.id));if(scene>=0)render(scene,true);else{const m=story.memories.findIndex(x=>x.id===target.id);if(m>=0){memoryIndex=m;render(4,true);}}};
$('review').onclick=()=>{openPoster();$('share-panel').scrollIntoView();$('close-share').focus();};$('close-share').onclick=()=>{$('share-panel').hidden=true;$('review').focus();};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('svg-download').onclick=()=>{download(new Blob([posterSVG(story,reactions)],{type:'image/svg+xml'}),'worldalive-sixty.svg');$('export-status').textContent='SVG prepared locally. Check your browser downloads.';};
$('png-download').onclick=async()=>{try{const blob=new Blob([posterSVG(story,reactions)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),image=new Image();try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('PNG encoder unavailable');download(png,'worldalive-sixty.png');$('export-status').textContent='PNG prepared locally. Check your browser downloads.';}finally{URL.revokeObjectURL(url);}}catch(_){$('export-status').textContent='PNG could not be generated. Download the source-labelled SVG instead.';}};
$('print').onclick=()=>{pause();window.print();};window.addEventListener('beforeprint',()=>{if(story)openPoster();});document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});root.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',pause);
async function read(name,optional=false){try{const r=await fetch('../data/'+name+'.json',{credentials:'omit'});if(!r.ok)throw new Error(name+' unavailable');return await r.json();}catch(e){if(optional)return null;throw e;}}
(async()=>{try{if(!Array.isArray(EVENTS))throw new Error('Historical anchors unavailable');const [born,world,timeline,map]=await Promise.all([read('born'),read('world'),read('timeline',true),read('countries-110m',true)]);data={born,world,timeline};if(!world?.countries||!born?.world?.pop)throw new Error('Invalid local data');try{geometry=mapPaths(map);}catch(_){geometry=null;}Object.entries(world.countries).sort((a,b)=>a[1].name.localeCompare(b[1].name)).forEach(([iso,c])=>{const o=document.createElement('option');o.value=iso;o.textContent=c.name;$('country').append(o);$('current-country').append(o.cloneNode(true));});$('build').disabled=false;$('status').textContent='';}catch(_){$('status').textContent='Could not load local facts. No substitute data used. Reload when local assets are available, or explore World History.';$('build').disabled=true;}})();
})(typeof globalThis!=='undefined'?globalThis:this);
