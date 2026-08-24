const scenarios={
recent:{
cmd:'sessionmem ask "what was I working on recently?"',
badge:'16 EVENTS',
body:`<p>Recently, you modified the following files:</p><ul><li><code>src/db/schema.sql</code> <span style="color:#596678">— database setup</span></li><li><code>src/server.js</code> <span style="color:#596678">— health check endpoint</span></li><li><code>docs/API.md</code> <span style="color:#596678">— API documentation</span></li></ul><p>You also set up <code>OPENAI_API_KEY</code> (safely redacted) and ran <code>npm test</code>.</p>`,
meta:'16 events retrieved · no time filter · gpt-4o-mini · 488 prompt tokens · 62 completion tokens'
},
exact:{
cmd:'sessionmem ask "what was the curl command I used to test the endpoint?"',
badge:'EXACT RECALL',
body:`<p>You tested the health endpoint with:</p><p><code>curl localhost:3000/api/health</code></p>`,
meta:'4 events retrieved · time: today · gpt-4o-mini · 120 prompt tokens · 18 completion tokens'
},
time:{
cmd:'sessionmem ask "what was I working on yesterday afternoon?"',
badge:'TIME WINDOW',
body:`<p>Yesterday afternoon (between 12:00 and 18:00), you:</p><ol><li>Modified <code>src/auth/jwt.js</code></li><li>Modified <code>src/server.js</code></li><li>Ran <code>npm test</code></li><li>Committed <code>add express server and auth</code></li></ol>`,
meta:'5 events retrieved · yesterday afternoon · UTC 07:00 → 13:00 · gpt-4o-mini'
},
secret:{
cmd:'sessionmem ask "what API key environment variable did I export, and is it visible?"',
badge:'REDACTION CHECK',
body:`<p>You exported <code>OPENAI_API_KEY</code>, but the secret is redacted (<code>[REDACTED]</code>) and therefore not visible.</p>`,
meta:'2 events retrieved · no time filter · gpt-4o-mini'
}};
const q=document.querySelector('#queryCommand'), body=document.querySelector('#answerBody'), badge=document.querySelector('#answerBadge'), meta=document.querySelector('#answerMeta');
function setScenario(key){
  const s=scenarios[key]; document.querySelectorAll('.q').forEach(x=>x.classList.toggle('active',x.dataset.scenario===key));
  q.textContent='';
  let i=0; const text=s.cmd;
  clearInterval(setScenario.timer);
  setScenario.timer=setInterval(()=>{q.textContent=text.slice(0,++i);if(i>=text.length){clearInterval(setScenario.timer);badge.textContent=s.badge;body.innerHTML=s.body;meta.textContent=s.meta}},18);
  badge.textContent=''; body.innerHTML='<span style="color:#556274">retrieving local events<span class="dots"> ...</span></span>'; meta.textContent='';
}
document.querySelectorAll('.q').forEach(x=>x.addEventListener('click',()=>setScenario(x.dataset.scenario)));
window.addEventListener('keydown',e=>{if(['1','2','3','4'].includes(e.key)){setScenario(['recent','exact','time','secret'][+e.key-1])}});
setScenario('recent');

const evals=[
['01','E01','Package Recall','Identified express, rejected false matches','1.26s'],
['02','E02','File Path Recall','Retrieved schema.sql and database.js','0.89s'],
['03','E03','Time Window','Filtered afternoon without morning leak','1.07s'],
['04','E04','Anti-Hallucination','Rejected non-existent .py files','0.90s'],
['05','E05','Exact Command','Recalled curl localhost:3000/api/health','0.86s'],
['06','E06','Git Commit','Recalled exact documentation commit','0.78s'],
['07','E07','Secret Redaction','Confirmed OPENAI_API_KEY was sanitized','0.80s'],
['08','E08','Relative Duration','Resolved last 2 hours to recent docs','0.88s'],
['09','E09','Repeated Workflow','Identified recurring npm test','1.19s'],
['10','E10','Multi-Source','Unified terminal and editor into narrative','2.79s']
];
document.querySelector('#evalList').innerHTML=evals.map(e=>`<div class="eval-row"><span class="id">${e[0]}</span><span class="pass">✓ ${e[1]}</span><span class="title">${e[2]} <span style="color:#596678">— ${e[3]}</span></span><span class="time">${e[4]}</span></div>`).join('');

const stageData={
capture:['Capture','PowerShell hooks and the native recursive watcher feed raw events into a tiny transient queue.','AppendAllText(timestamp, source, command, pwd)'],
store:['Store','The security boundary lives here: known credentials are sanitized before anything crosses into persistent SQLite storage.','insertEvent(event) → redact → transaction()'],
query:['Query','Natural-language time hints become exact time windows before SQLite retrieves the relevant events.','timestamp >= ? AND timestamp <= ?'],
reason:['Reason','The selected slice becomes structured context, constrained to 12,000 tokens and streamed over native SSE.','fetch() → ReadableStream → gpt-4o-mini']
};
document.querySelectorAll('.sys-card').forEach(card=>card.addEventListener('click',()=>{
 document.querySelectorAll('.sys-card').forEach(c=>c.classList.remove('active-card'));card.classList.add('active-card');
 const d=stageData[card.dataset.stage];document.querySelector('#stageTitle').textContent=d[0];document.querySelector('#stageDescription').textContent=d[1];document.querySelector('#stageCode').textContent=d[2];
}));

const cursor=document.querySelector('#cursorGlow');
window.addEventListener('pointermove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px'});
const revealTargets=document.querySelectorAll('.problem,.play,.system,.contrast,.proof,.security,.notes,.final');
const obs=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('in')}),{threshold:.12});
revealTargets.forEach(x=>{x.classList.add('reveal');obs.observe(x)});

const numberObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
 if(!entry.isIntersecting)return;
 entry.target.querySelectorAll('.count').forEach(el=>{
   const raw=el.dataset.target;
   if(raw==='0.2'){el.textContent='<0.2';return}
   if(raw==='0'){el.textContent='0';return}
   let target=parseFloat(raw), start=0, duration=750, t0=performance.now();
   const tick=now=>{const p=Math.min(1,(now-t0)/duration), eased=1-Math.pow(1-p,3);el.textContent=Math.round(target*eased);if(p<1)requestAnimationFrame(tick)};
   requestAnimationFrame(tick);
 });
 numberObserver.unobserve(entry.target);
}),{threshold:.5});
document.querySelectorAll('.numbers').forEach(x=>numberObserver.observe(x));
