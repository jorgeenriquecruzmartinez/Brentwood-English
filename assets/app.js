(() => {
'use strict';

const VERSION = '2.5.1';
const FULL = window.BRENTWOOD_FULL_SIMULATIONS || [];
const DEEP = window.BRENTWOOD_DEEP_PRACTICE || [];
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const app = $('#app');

const RUNTIME = {
  attempt: null,
  tasks: [],
  taskIndex: 0,
  timer: null,
  timerContext: null,
  timerHidden: false,
  wordCountHidden: false,
  recordings: new Map(),
  mediaRecorder: null,
  mediaStream: null,
  recordingTimer: null,
  currentAudio: null,
  audioContext: null,
  deepWriting: '',
};

const KEYS = {
  theme: 'brentwood_theme_v250',
  active: 'brentwood_active_attempt_v250',
  completed: 'brentwood_completed_attempts_v250',
};

function esc(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function stripMd(s='') { return String(s).replace(/\*\*/g,'').replace(/^#+\s*/gm,'').replace(/^>\s?/gm,'').trim(); }
function md(s='') {
  let x = esc(String(s));
  x = x.replace(/^###\s+(.+)$/gm,'<h3>$1</h3>').replace(/^##\s+(.+)$/gm,'<h2>$1</h2>');
  x = x.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  x = x.replace(/^&gt;\s?(.*)$/gm,'<blockquote>$1</blockquote>');
  x = x.replace(/^-\s+(.+)$/gm,'<li>$1</li>');
  x = x.replace(/(?:<li>.*?<\/li>\n?)+/gs, m => `<ul>${m}</ul>`);
  x = x.replace(/\n{2,}/g,'</p><p>').replace(/\n/g,'<br>');
  return `<p>${x}</p>`.replace(/<p>\s*<h/g,'<h').replace(/<\/h([23])>\s*<\/p>/g,'</h$1>');
}
function words(s='') { return (String(s).trim().match(/\b[\p{L}\p{N}'’-]+\b/gu) || []).length; }
function nowIso(){ return new Date().toISOString(); }
function makeId(){ return (crypto.randomUUID ? crypto.randomUUID() : `a-${Date.now()}-${Math.random().toString(16).slice(2)}`); }
function fmtTime(sec){ sec=Math.max(0,Math.round(sec||0)); const m=Math.floor(sec/60), s=sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function toast(msg){ const old=$('.toast'); if(old) old.remove(); const d=document.createElement('div'); d.className='toast'; d.textContent=msg; document.body.appendChild(d); setTimeout(()=>d.remove(),2600); }
function setHash(h){ if(location.hash===h) route(); else location.hash=h; }
function parseHash(){ const raw=(location.hash||'#/').slice(1); const [path,q='']=raw.split('?'); return {parts:path.split('/').filter(Boolean), params:new URLSearchParams(q)}; }

// Resolve media from the site root on HTTP(S), but from the current project folder
// when the build is opened locally. This keeps the same audio references working
// in Netlify, section practice, full simulations, and local testing.
function mediaUrl(src=''){
  const raw=String(src||'').trim();
  if(!raw) return '';
  if(/^(?:https?:|blob:|data:)/i.test(raw)) return raw;
  const clean=raw.replace(/^\/+/, '');
  const base = location.protocol==='file:' ? new URL('./', location.href) : new URL('/', location.href);
  return new URL(clean, base).href;
}
function mediaErrorCode(a){
  const code=a?.error?.code;
  return code===1?'playback was aborted':code===2?'a network error occurred':code===3?'the audio could not be decoded':code===4?'the audio source is not supported':'';
}
async function describeAudioFailure(src,a,err){
  const url=mediaUrl(src), code=mediaErrorCode(a);
  if(/^https?:/i.test(url)){
    try{
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok) return `Audio file could not be loaded (HTTP ${r.status}). Retry after the site finishes updating.`;
      const type=(r.headers.get('content-type')||'').toLowerCase();
      if(type && !type.includes('audio') && !type.includes('mpeg') && !type.includes('octet-stream')) return `The audio URL returned ${type} instead of an audio file.`;
    }catch{}
  }
  if(code) return `Audio playback failed because ${code}. Tap again to retry.`;
  if(err?.name==='NotAllowedError') return 'The browser blocked playback. Tap Play again to allow audio.';
  if(err?.name==='NotSupportedError') return 'This browser could not decode the audio file.';
  return 'Audio playback failed. Tap again to retry.';
}

function applyTheme(choice){
  localStorage.setItem(KEYS.theme, choice);
  const resolved = choice === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light') : choice;
  document.documentElement.dataset.theme = resolved;
  updateThemeMeta(choice);
}
function updateThemeMeta(choice){ const m=$('meta[name="theme-color"]'); if(m) m.content=document.documentElement.dataset.theme==='dark'?'#11181c':'#0b6f86'; }
function cycleTheme(){ const cur=localStorage.getItem(KEYS.theme)||'system'; const next=cur==='system'?'light':cur==='light'?'dark':'system'; applyTheme(next); renderHeaderThemeLabel(); }
function themeLabel(){ const v=localStorage.getItem(KEYS.theme)||'system'; return v==='dark'?'Dark':v==='light'?'Light':'System'; }
function renderHeaderThemeLabel(){ $$('.theme-label').forEach(e=>e.textContent=themeLabel()); }
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{ if((localStorage.getItem(KEYS.theme)||'system')==='system') applyTheme('system'); });
applyTheme(localStorage.getItem(KEYS.theme)||'system');

function siteHeader(context=''){
  return `<header class="site-header">
    <a class="brand" href="#/"><span class="brand-mark">BE</span><span>Brentwood English</span>${context?`<span class="brand-context">${esc(context)}</span>`:''}</a>
    <div class="header-actions"><button class="text-btn" data-action="theme">Appearance: <span class="theme-label">${themeLabel()}</span></button><a class="text-btn teacher-link" href="#/teacher">Teacher</a></div>
  </header>`;
}
function shell(content, context=''){ app.innerHTML=`<div class="app-shell">${siteHeader(context)}<main>${content}</main><div class="footer-note">Focused practice. Clear review. Deliberate repetition. &nbsp; <span class="version">Beta ${VERSION}</span></div></div>`; bindCommon(); }
function bindCommon(){ $$('[data-action="theme"]').forEach(b=>b.onclick=cycleTheme); }

function activeSaved(){ try{return JSON.parse(localStorage.getItem(KEYS.active)||'null')}catch{return null} }
function saveActive(){ if(!RUNTIME.attempt) return; const copy={attempt:RUNTIME.attempt,tasks:RUNTIME.tasks,taskIndex:RUNTIME.taskIndex}; localStorage.setItem(KEYS.active,JSON.stringify(copy)); }
function clearActive(){ localStorage.removeItem(KEYS.active); }
function loadCompleted(){ try{return JSON.parse(localStorage.getItem(KEYS.completed)||'[]')}catch{return []} }
function saveCompletedAttempt(attempt){ const arr=loadCompleted().filter(a=>a.id!==attempt.id); arr.unshift(attempt); localStorage.setItem(KEYS.completed,JSON.stringify(arr.slice(0,250))); }

// IndexedDB keeps audio blobs through refreshes on the same device.
const DB = {
  open(){ return new Promise((resolve,reject)=>{ const req=indexedDB.open('brentwood-english-v250',1); req.onupgradeneeded=()=>req.result.createObjectStore('recordings'); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); },
  async put(key,blob){ const db=await this.open(); return new Promise((res,rej)=>{ const tx=db.transaction('recordings','readwrite'); tx.objectStore('recordings').put(blob,key); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); },
  async get(key){ const db=await this.open(); return new Promise((res,rej)=>{ const rq=db.transaction('recordings').objectStore('recordings').get(key); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>rej(rq.error); }); },
  async delPrefix(prefix){ const db=await this.open(); return new Promise((res,rej)=>{ const tx=db.transaction('recordings','readwrite'), store=tx.objectStore('recordings'); const rq=store.openCursor(); rq.onsuccess=()=>{const c=rq.result;if(!c)return;if(String(c.key).startsWith(prefix))c.delete();c.continue()};tx.oncomplete=res;tx.onerror=()=>rej(tx.error);}); }
};

function home(){
  const saved=activeSaved();
  shell(`<section class="home"><div class="hero"><div class="eyebrow">Brentwood English</div><h1>What do you want to work on?</h1><p>TOEFL practice built around compact tasks, timed production, and detailed review.</p></div>
  ${saved?`<div class="resume-banner"><div><strong>Unfinished practice found</strong><div style="font-size:13px;color:var(--muted);margin-top:3px">${esc(saved.attempt?.label||'Practice session')} · ${esc(saved.attempt?.student||'Student')}</div></div><button class="btn small" id="resumeAttempt">Resume</button></div>`:''}
  <div class="choice-grid">
    <a class="choice-card" href="#/full"><div><h2>Full Simulation</h2><p>Reading, Listening, Writing, and Speaking in one continuous test.</p></div><span class="choice-arrow">→</span></a>
    <a class="choice-card" href="#/section"><div><h2>Section Practice</h2><p>Work on one TOEFL section using the same simulation banks.</p></div><span class="choice-arrow">→</span></a>
    <a class="choice-card" href="#/deep"><div><h2>Deep Practice</h2><p>Produce, correct, rewrite, and transfer language under pressure.</p></div><span class="choice-arrow">→</span></a>
  </div></section>`, 'TOEFL Practice');
  if(saved) $('#resumeAttempt').onclick=()=>resumeSaved(saved);
}

function listFull(){
  shell(`<section class="subpage"><div class="subpage-title"><div><div class="eyebrow">TOEFL Practice</div><h1>Full Simulation</h1></div><a class="btn secondary small" href="#/">Home</a></div><div class="list-grid">${FULL.map(s=>`<a class="sim-card" href="#/start/full/${s.id}"><div class="num">SIMULATION ${String(s.id).padStart(2,'0')}</div><h3>${esc(s.name)}</h3><p>40 Reading · 34 Listening · 12 Writing · 11 Speaking</p></a>`).join('')}</div></section>`,'Full Simulation');
}
function listSections(){
  const secs=[['reading','Reading','40 items · two modules'],['listening','Listening','34 items · two modules'],['writing','Writing','10 sentence builds + email + discussion'],['speaking','Speaking','7 repeat + 4 interview']];
  shell(`<section class="subpage"><div class="subpage-title"><div><div class="eyebrow">TOEFL Practice</div><h1>Section Practice</h1></div></div><div class="list-grid">${secs.map(([id,n,d])=>`<a class="sim-card" href="#/section/${id}"><div class="num">SECTION</div><h3>${n}</h3><p>${d}</p></a>`).join('')}</div></section>`,'Section Practice');
}
function listSectionSims(section){ const cap=section[0].toUpperCase()+section.slice(1); shell(`<section class="subpage"><div class="subpage-title"><div><div class="eyebrow">Section Practice</div><h1>${cap}</h1></div><a class="btn secondary small" href="#/section">Back</a></div><div class="list-grid">${FULL.map(s=>`<a class="sim-card" href="#/start/section/${section}/${s.id}"><div class="num">SIMULATION ${String(s.id).padStart(2,'0')}</div><h3>${cap} ${String(s.id).padStart(2,'0')}</h3><p>Uses the ${cap} section from ${esc(s.name)}.</p></a>`).join('')}</div></section>`,cap); }
function listDeep(){ shell(`<section class="subpage"><div class="subpage-title"><div><div class="eyebrow">TOEFL Practice</div><h1>Deep Practice</h1></div></div><div class="list-grid">${DEEP.map(s=>`<a class="sim-card" href="#/start/deep/${s.id}"><div class="num">SESSION ${String(s.id).padStart(2,'0')}</div><h3>${esc(s.name)}</h3><p>${esc(s.subtitle||'Production, correction, and transfer')}</p></a>`).join('')}</div></section>`,'Deep Practice'); }

function getLaunch(parts){
  if(parts[1]==='full') return {kind:'full',simId:+parts[2],needsAudio:true,needsMic:true,label:`Full Simulation ${String(+parts[2]).padStart(2,'0')}`};
  if(parts[1]==='section') { const section=parts[2],simId=+parts[3]; return {kind:'section',section,simId,needsAudio:['listening','speaking'].includes(section),needsMic:section==='speaking',label:`${section[0].toUpperCase()+section.slice(1)} Practice ${String(simId).padStart(2,'0')}`}; }
  if(parts[1]==='deep') return {kind:'deep',deepId:+parts[2],needsAudio:false,needsMic:false,label:`Deep Practice ${String(+parts[2]).padStart(2,'0')}`};
  return null;
}

function setup(parts){
  const cfg=getLaunch(parts); if(!cfg){home();return}
  shell(`<div class="setup-card"><div class="eyebrow">${esc(cfg.label)}</div><h1>Ready to begin?</h1><p>Enter the student's name. ${cfg.needsAudio?'Complete the audio check before starting.':''}</p>
    <div class="field"><label>Student name</label><input class="input" id="studentName" autocomplete="name" placeholder="Student name"></div>
    ${cfg.needsAudio?`<div class="check-row"><span class="status-dot" id="audioDot"></span><div class="check-copy"><strong>Audio</strong><small id="audioText">Play the sample and confirm you can hear it.</small></div><audio id="setupAudio" preload="auto" playsinline src="${esc(mediaUrl('/media/audio/hardware-check.mp3'))}"></audio><button class="btn secondary small" id="audioCheck">Play sample</button></div>`:''}
    ${cfg.needsMic?`<div class="check-row"><span class="status-dot" id="micDot"></span><div class="check-copy"><strong>Microphone</strong><small id="micText">Allow microphone access and speak for a moment.</small></div><div class="meter"><span id="micMeter"></span></div><button class="btn secondary small hidden" id="micPlaybackBtn">Play recording</button><button class="btn secondary small" id="micCheck">Test</button></div>`:''}
    <div class="setup-actions"><a class="btn secondary" href="#/">Cancel</a><button class="btn" id="beginBtn" ${cfg.needsAudio?'disabled':''}>Begin</button></div></div>`,cfg.label);
  let audioOK=!cfg.needsAudio, micOK=!cfg.needsMic;
  const update=()=>{ $('#beginBtn').disabled=!(audioOK&&micOK); };
  if(cfg.needsAudio) $('#audioCheck').onclick=async()=>{
    const b=$('#audioCheck'), a=$('#setupAudio'), dot=$('#audioDot'), text=$('#audioText');
    b.disabled=true; audioOK=false; dot.classList.remove('ok','bad'); text.textContent='Loading audio…';
    try{
      a.pause(); a.currentTime=0; a.volume=1;
      // play() is called directly from the user's click. This matters on mobile browsers.
      await a.play();
      text.textContent='Playing…';
      await new Promise((res,rej)=>{a.onended=res;a.onerror=rej});
      audioOK=true; dot.classList.add('ok'); text.textContent='Audio playback completed.';
    }catch(e){
      audioOK=false; dot.classList.add('bad'); text.textContent=await describeAudioFailure('/media/audio/hardware-check.mp3',a,e);
    }
    b.disabled=false; update();
  };
  if(cfg.needsMic) $('#micCheck').onclick=async()=>{
    const b=$('#micCheck'); b.disabled=true;
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !(window.AudioContext||window.webkitAudioContext)){micOK=false;$('#micDot').classList.add('bad');$('#micText').textContent='This browser cannot provide the recording features required for Speaking. Try a current mobile or desktop browser.';b.disabled=false;update();return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true}); const ctx=new (window.AudioContext||window.webkitAudioContext)(); const src=ctx.createMediaStreamSource(stream); const an=ctx.createAnalyser(); an.fftSize=256; src.connect(an); const data=new Uint8Array(an.frequencyBinCount); let max=0,frames=0;
      let sampleBlob=null; const chunks=[]; const mime=recorderMime(); let sampleRecorder=null;
      if(window.MediaRecorder){sampleRecorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);sampleRecorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};sampleRecorder.start();}
      await new Promise(res=>{const tick=()=>{an.getByteFrequencyData(data); const v=data.reduce((a,b)=>a+b,0)/data.length; max=Math.max(max,v); $('#micMeter').style.width=Math.min(100,v*2.2)+'%'; if(++frames<110)requestAnimationFrame(tick);else res()};tick()});
      if(sampleRecorder&&sampleRecorder.state!=='inactive'){await new Promise(res=>{sampleRecorder.onstop=()=>{sampleBlob=new Blob(chunks,{type:sampleRecorder.mimeType||mime||'audio/webm'});res()};sampleRecorder.stop()});}
      stream.getTracks().forEach(t=>t.stop()); await ctx.close(); micOK=max>1; $('#micDot').classList.toggle('ok',micOK); $('#micDot').classList.toggle('bad',!micOK); $('#micText').textContent=micOK?'Microphone signal detected. Play the sample to confirm it sounds clear.':'Microphone opened, but no signal was detected. Try again.';
      if(sampleBlob&&sampleBlob.size){const pb=$('#micPlaybackBtn');const url=URL.createObjectURL(sampleBlob);pb.classList.remove('hidden');pb.onclick=()=>new Audio(url).play();}
    }catch(e){micOK=false;$('#micDot').classList.add('bad');$('#micText').textContent='Microphone access failed. Check browser permission.'}
    b.disabled=false; update();
  };
  $('#beginBtn').onclick=()=>{ const name=$('#studentName').value.trim(); if(!name){toast('Enter the student name.');return} launchAttempt(cfg,name); };
}

function resetRuntimeForAttempt(){
  stopTimer(); stopCurrentAudio();
  if(RUNTIME.recordingTimer){ clearInterval(RUNTIME.recordingTimer); RUNTIME.recordingTimer=null; }
  if(RUNTIME.mediaRecorder && RUNTIME.mediaRecorder.state!=='inactive'){ try{RUNTIME.mediaRecorder.stop()}catch{} }
  RUNTIME.mediaRecorder=null;
  if(RUNTIME.mediaStream){ RUNTIME.mediaStream.getTracks().forEach(t=>t.stop()); RUNTIME.mediaStream=null; }
  if(RUNTIME.audioContext){ try{RUNTIME.audioContext.close()}catch{} RUNTIME.audioContext=null; }
  RUNTIME.timerHidden=false;
  RUNTIME.wordCountHidden=false;
  RUNTIME.recordings.clear();
  RUNTIME.deepWriting='';
}
function launchAttempt(cfg,student){
  resetRuntimeForAttempt();
  const attempt={id:makeId(),student,kind:cfg.kind,label:cfg.label,simulationId:cfg.simId||null,deepId:cfg.deepId||null,section:cfg.section||null,startedAt:nowIso(),completedAt:null,status:'in-progress',responses:{},scores:{},timing:{},recordings:[],teacher:{},sync:'pending'};
  RUNTIME.attempt=attempt; RUNTIME.taskIndex=0;
  if(cfg.kind==='deep') RUNTIME.tasks=buildDeepTasks(DEEP.find(d=>d.id===cfg.deepId)); else RUNTIME.tasks=buildExamTasks(FULL.find(s=>s.id===cfg.simId),cfg.kind==='full'?null:cfg.section);
  saveActive(); setHash('#/attempt');
}
function resumeSaved(saved){ resetRuntimeForAttempt(); RUNTIME.attempt=saved.attempt; RUNTIME.tasks=saved.tasks; RUNTIME.taskIndex=saved.taskIndex||0; setHash('#/attempt'); }

function buildExamTasks(sim,only=null){
  const tasks=[]; const include=s=>!only||only===s;
  if(include('reading')){
    tasks.push({type:'transition',section:'Reading',id:'reading-start',title:'Reading',copy:'Complete the Words, Read in Daily Life, and Read an Academic Passage.'});
    sim.reading.forEach((m,mi)=>{
      if(mi) tasks.push({type:'transition',section:'Reading',id:`reading-m${mi+1}-start`,title:`Reading · Module ${mi+1}`,copy:'Continue to the next module.'});
      tasks.push({type:'cloze',section:'Reading',module:mi+1,id:`reading-m${mi+1}-cloze`,data:m.cloze,progress:mi===0?'Questions 1–10 of 40':'Questions 21–30 of 40',timerSeconds:24*60,timerKey:'reading'});
      m.groups.forEach(g=>g.questions.forEach(q=>tasks.push({type:'reading-mcq',section:'Reading',module:mi+1,id:`reading-m${mi+1}-q${q.n}`,q,group:g,progress:`Question ${mi*20+q.n} of 40`,timerSeconds:24*60,timerKey:'reading'})));
    });
  }
  if(include('listening')){
    tasks.push({type:'transition',section:'Listening',id:'listening-start',title:'Listening',copy:'Listen once. Choose the best response or answer questions about what you hear.'});
    sim.listening.forEach((m,mi)=>{
      if(mi) tasks.push({type:'transition',section:'Listening',id:`listening-m${mi+1}-start`,title:`Listening · Module ${mi+1}`,copy:'Continue to the next module.'});
      m.choose.forEach(item=>tasks.push({type:'listen-response',section:'Listening',module:mi+1,id:`listening-m${mi+1}-r${item.n}`,item,progress:`Question ${mi?18+item.n:item.n} of 34`,timerSeconds:24*60,timerKey:'listening'}));
      m.groups.forEach((g,gi)=>g.questions.forEach((q,qi)=>tasks.push({type:'listen-group',section:'Listening',module:mi+1,id:`listening-m${mi+1}-g${gi+1}-q${q.n}`,group:g,q,first:qi===0,progress:`Question ${mi?18+q.n:q.n} of 34`,timerSeconds:24*60,timerKey:'listening'})));
    });
  }
  if(include('writing')){
    tasks.push({type:'transition',section:'Writing',id:'writing-start',title:'Writing',copy:'Build sentences, write an email, then contribute to an academic discussion.'});
    sim.writing.build.forEach((it,i)=>tasks.push({type:'build',section:'Writing',id:`writing-build-${i+1}`,data:it,progress:`Question ${i+1} of 12`,timerSeconds:6*60,timerKey:'writing-build'}));
    tasks.push({type:'email',section:'Writing',id:'writing-email',raw:sim.writing.email,progress:'Question 11 of 12',timerSeconds:7*60,timerKey:'writing-email'});
    tasks.push({type:'discussion',section:'Writing',id:'writing-discussion',raw:sim.writing.discussion,progress:'Question 12 of 12',timerSeconds:10*60,timerKey:'writing-discussion'});
  }
  if(include('speaking')){
    tasks.push({type:'transition',section:'Speaking',id:'speaking-start',title:'Speaking',copy:'Listen and Repeat, then answer four interview questions.'});
    tasks.push({type:'speaking-intro',section:'Speaking',id:'speaking-repeat-intro',title:'Listen and Repeat',raw:sim.speaking.repeat.scenario});
    sim.speaking.repeat.prompts.forEach((p,i)=>tasks.push({type:'repeat',section:'Speaking',id:`speaking-repeat-${i+1}`,prompt:p,audio:sim.speaking.repeat.audio[i],n:i+1,progress:`Question ${i+1} of 11`}));
    tasks.push({type:'speaking-intro',section:'Speaking',id:'speaking-interview-intro',title:'Take an Interview',raw:sim.speaking.interview.scenario});
    sim.speaking.interview.questions.forEach((q,i)=>tasks.push({type:'interview',section:'Speaking',id:`speaking-interview-${i+1}`,prompt:q,audio:sim.speaking.interview.audio[i],n:i+1,progress:`Question ${8+i} of 11`}));
  }
  return tasks;
}
function buildDeepTasks(session){ return session.steps.map((s,i)=>({type:'deep',section:'Deep Practice',id:`deep-${session.id}-step-${s.n}-${i}`,step:s,session,progress:`Step ${i+1} of ${session.steps.length}`})); }

function examShell(task,body,{back=true,next=true,nextLabel='Next',nextDisabled=false}={}){
  stopCurrentAudio();
  app.innerHTML=`<div class="exam"><header class="exam-header"><div class="left"><a class="brand" href="#/" data-exit><span class="brand-mark">BE</span><span>Brentwood English</span></a></div><div class="center"><div class="exam-section">${esc(task.section||'TOEFL Practice')}</div><div class="exam-progress">${esc(task.progress||'')}</div></div><div class="right"><button class="text-btn" id="hideTime">${RUNTIME.timerHidden?'Show':'Hide'} Time</button><span class="timer" id="timerDisplay">${RUNTIME.timerHidden?'—':timerDisplay()}</span></div></header><div class="exam-body"><div class="exam-workspace">${body}</div></div><footer class="exam-footer"><button class="btn secondary" id="backBtn" ${!back?'disabled':''}>Back</button><div class="exam-progress">${esc(task.progress||'')}</div><button class="btn" id="nextBtn" ${!next||nextDisabled?'disabled':''}>${esc(nextLabel)}</button></footer></div>`;
  $('#hideTime').onclick=()=>{RUNTIME.timerHidden=!RUNTIME.timerHidden; renderTask();};
  $('#backBtn').onclick=()=>goBack(); $('#nextBtn').onclick=()=>goNext();
  $('[data-exit]').onclick=e=>{e.preventDefault(); if(confirm('Leave this practice? Your current text answers are saved on this device.')){saveActive();setHash('#/')}};
}
function timerDisplay(){ return RUNTIME.timer ? fmtTime(Math.ceil((RUNTIME.timer.ends-Date.now())/1000)) : '—'; }
function startTimer(seconds,key){
  if(!seconds || !RUNTIME.attempt) return;
  if(RUNTIME.timer && RUNTIME.timer.key===key) return;
  stopTimer();
  const saved=RUNTIME.attempt.timing[key];
  let ends=saved?.endsAt ? Date.parse(saved.endsAt) : NaN;
  if(!Number.isFinite(ends)){ ends=Date.now()+seconds*1000; RUNTIME.attempt.timing[key]={startedAt:nowIso(),seconds,endsAt:new Date(ends).toISOString()}; saveActive(); }
  RUNTIME.timer={key,ends};
  const tick=()=>{ if(!RUNTIME.timer||RUNTIME.timer.key!==key)return; const el=$('#timerDisplay'); const left=Math.ceil((ends-Date.now())/1000); if(el&&!RUNTIME.timerHidden) el.textContent=fmtTime(left); if(left<=0){clearInterval(RUNTIME.timer.interval);RUNTIME.timer=null;onTimerExpired(key)} };
  RUNTIME.timer.interval=setInterval(tick,250); tick();
}
function stopTimer(){ if(RUNTIME.timer?.interval) clearInterval(RUNTIME.timer.interval); RUNTIME.timer=null; }
function onTimerExpired(key){ toast('Time is up.'); if(key==='reading'||key==='listening') jumpAfterSection(key); else if(key==='writing-build') jumpToTask('writing-email'); else if(key==='writing-email') jumpToTask('writing-discussion'); else if(key==='writing-discussion') goNext(); else if(key?.startsWith('deep-')) goNext(); }
function jumpAfterSection(sec){ const i=RUNTIME.tasks.findIndex((t,idx)=>idx>RUNTIME.taskIndex&&t.section.toLowerCase()!==sec); RUNTIME.taskIndex=i>=0?i:RUNTIME.tasks.length; saveActive(); renderTask(); }
function jumpToTask(id){ const i=RUNTIME.tasks.findIndex(t=>t.id===id); if(i>=0){RUNTIME.taskIndex=i;saveActive();renderTask();} }

function renderAttempt(){ if(!RUNTIME.attempt){ const s=activeSaved(); if(s){RUNTIME.attempt=s.attempt;RUNTIME.tasks=s.tasks;RUNTIME.taskIndex=s.taskIndex||0}else{home();return}} renderTask(); }
function renderTask(){
  if(RUNTIME.taskIndex>=RUNTIME.tasks.length){ finishAttempt(); return; }
  const task=RUNTIME.tasks[RUNTIME.taskIndex]; if(task.timerSeconds) startTimer(task.timerSeconds,task.timerKey||task.id);
  if(task.type==='transition') return renderTransition(task);
  if(task.type==='cloze') return renderCloze(task);
  if(task.type==='reading-mcq') return renderReadingMCQ(task);
  if(task.type==='listen-response') return renderListenResponse(task);
  if(task.type==='listen-group') return renderListenGroup(task);
  if(task.type==='build') return renderBuild(task);
  if(task.type==='email'||task.type==='discussion') return renderWriting(task);
  if(task.type==='speaking-intro') return renderSpeakingIntro(task);
  if(task.type==='repeat'||task.type==='interview') return renderSpeakingTask(task);
  if(task.type==='deep') return renderDeep(task);
}
function goBack(){ if(RUNTIME.taskIndex>0){RUNTIME.taskIndex--;saveActive();renderTask()} }
function goNext(){ RUNTIME.taskIndex++; saveActive(); renderTask(); }
function renderTransition(task){ if(['reading-start','listening-start','writing-start','speaking-start'].includes(task.id)) stopTimer(); examShell(task,`<div class="transition"><div class="transition-inner"><div class="mini-rule"></div><div class="eyebrow">TOEFL Practice</div><h1>${esc(task.title)}</h1><p>${esc(task.copy||'')}</p></div></div>`,{back:RUNTIME.taskIndex>0&&!['listening-start','writing-start','speaking-start'].includes(task.id),next:true,nextLabel:'Continue'}); }

function renderCloze(task){
  const key=task.id, saved=RUNTIME.attempt.responses[key]||[]; let idx=0;
  const answers=task.data.answers||[];
  const html=esc(task.data.text).replace(/([A-Za-z]+)___/g,(m,prefix)=>{
    const i=idx++, missing=String(answers[i]?.missing||''), count=Math.max(1,missing.length||4), entered=String(saved[i]||'');
    const slots=Array.from({length:count},(_,j)=>`<input class="cloze-letter" data-word="${i}" data-slot="${j}" maxlength="1" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Missing letter ${j+1} of ${count} for word ${i+1}" value="${esc(entered[j]||'')}">`).join('');
    return `<span class="cloze-word"><span class="cloze-prefix">${esc(prefix)}</span><span class="cloze-slots" aria-label="${count} missing letters">${slots}</span></span>`;
  });
  examShell(task,`<div class="cloze-wrap"><div class="task-kicker">Complete the Words</div><h2>Fill in the missing letters.</h2><div class="cloze-text">${html}</div></div>`);
  $$('.cloze-letter').forEach(inp=>{
    inp.oninput=()=>{
      let v=inp.value.replace(/[^A-Za-z]/g,'').slice(-1); inp.value=v;
      const wi=+inp.dataset.word, si=+inp.dataset.slot;
      const letters=$$(`.cloze-letter[data-word="${wi}"]`).map(x=>x.value).join('');
      const arr=RUNTIME.attempt.responses[key]||[]; arr[wi]=letters; RUNTIME.attempt.responses[key]=arr; saveActive();
      if(v){const next=$(`.cloze-letter[data-word="${wi}"][data-slot="${si+1}"]`); next?.focus();}
    };
    inp.onkeydown=e=>{
      if(e.key==='Backspace'&&!inp.value){const wi=+inp.dataset.word,si=+inp.dataset.slot;const prev=$(`.cloze-letter[data-word="${wi}"][data-slot="${si-1}"]`);if(prev){e.preventDefault();prev.focus();}}
      if(e.key==='ArrowLeft'){const wi=+inp.dataset.word,si=+inp.dataset.slot;$(`.cloze-letter[data-word="${wi}"][data-slot="${si-1}"]`)?.focus();}
      if(e.key==='ArrowRight'){const wi=+inp.dataset.word,si=+inp.dataset.slot;$(`.cloze-letter[data-word="${wi}"][data-slot="${si+1}"]`)?.focus();}
    };
    inp.onpaste=e=>{
      const text=(e.clipboardData?.getData('text')||'').replace(/[^A-Za-z]/g,''); if(!text)return; e.preventDefault();
      const wi=+inp.dataset.word, start=+inp.dataset.slot, fields=$$(`.cloze-letter[data-word="${wi}"]`);
      text.split('').forEach((ch,j)=>{if(fields[start+j])fields[start+j].value=ch});
      const arr=RUNTIME.attempt.responses[key]||[];arr[wi]=fields.map(x=>x.value).join('');RUNTIME.attempt.responses[key]=arr;saveActive();
      fields[Math.min(fields.length-1,start+text.length)]?.focus();
    };
  });
}
function stimulusType(raw){ const l=raw.toLowerCase(); if(l.includes('to:')&&l.includes('from:'))return'email';if(l.includes('text-message')||/\b[a-z]+:\s/.test(l))return'chat';return'notice'; }
function renderStimulus(raw,kind){
  if(kind==='academic') return `<div class="stimulus-body">${md(raw)}</div>`;
  const type=stimulusType(raw);
  if(type==='email'){
    const lines=stripMd(raw).split('\n').map(x=>x.trim()).filter(Boolean); const head=lines.filter(x=>/^(To|From|Subject):/i.test(x)); const body=lines.filter(x=>!head.includes(x)&&!/^Read an email\.?$/i.test(x));
    return `<div class="daily-card email"><div class="email-head">${head.map(x=>`<div>${esc(x)}</div>`).join('')}</div><div class="email-body">${body.map(x=>`<p>${esc(x)}</p>`).join('')}</div></div>`;
  }
  if(type==='chat'){
    const lines=stripMd(raw).split('\n').map(x=>x.trim()).filter(x=>x&&!/^Read a text/i.test(x)); return `<div class="daily-card"><div class="chat">${lines.map(x=>`<div class="bubble">${esc(x)}</div>`).join('')}</div></div>`;
  }
  return `<div class="daily-card stimulus-body">${md(raw)}</div>`;
}
function renderReadingMCQ(task){ const ans=RUNTIME.attempt.responses[task.id]; examShell(task,`<div class="split"><section class="pane stimulus">${renderStimulus(task.group.stimulus,task.group.kind)}</section><section class="pane"><div class="task-kicker">${task.group.kind==='academic'?'Read an Academic Passage':'Read in Daily Life'}</div><div class="question">${esc(task.q.question)}</div><div class="options">${Object.entries(task.q.options).map(([k,v])=>`<div class="option ${ans===k?'selected':''}" data-opt="${k}"><span class="option-letter">${k}</span><span>${esc(v)}</span></div>`).join('')}</div></section></div>`); bindOptions(task.id); }
function bindOptions(key){ $$('.option[data-opt]').forEach(o=>o.onclick=()=>{RUNTIME.attempt.responses[key]=o.dataset.opt;saveActive();renderTask()}); }

function audioPanel(title,sub,audio,playedKey){ const played=!!RUNTIME.attempt.responses[playedKey+'-played']; return `<div class="audio-task"><div class="audio-card"><div class="audio-visual">◉</div><h2>${esc(title)}</h2><p>${esc(sub)}</p><audio class="audio-player" id="taskAudio" preload="auto" playsinline src="${esc(mediaUrl(audio))}"></audio><button class="btn play-once" id="playAudio" ${played?'disabled':''}>${played?'Audio played':'Play audio'}</button><div class="audio-status" id="audioStatus">${played?'Audio can only be played once in this attempt.':'Tap Play audio. If playback fails, tap again to retry.'}</div></div></div>`; }
function attachAudioOnce(audio,playedKey,onEnded){
  const btn=$('#playAudio'), a=$('#taskAudio'), status=$('#audioStatus'); if(!btn||!a)return;
  btn.onclick=async()=>{
    btn.disabled=true;status.textContent='Loading…';
    try{
      stopCurrentAudio(); a.currentTime=0; a.volume=1;
      // Keep play() directly inside the user's click for mobile playback policies.
      await a.play(); status.textContent='Playing…'; RUNTIME.currentAudio=a;
      a.onended=()=>{RUNTIME.attempt.responses[playedKey+'-played']=true;saveActive();status.textContent='Audio completed.';RUNTIME.currentAudio=null;onEnded?.();};
      a.onerror=async()=>{btn.disabled=false;status.textContent=await describeAudioFailure(audio,a);};
    }catch(e){btn.disabled=false;status.textContent=await describeAudioFailure(audio,a,e);}
  };
}
function stopCurrentAudio(){ if(RUNTIME.currentAudio){try{RUNTIME.currentAudio.pause()}catch{} RUNTIME.currentAudio=null} }
function renderListenResponse(task){ const ans=RUNTIME.attempt.responses[task.id]; examShell(task,`<div class="split"><section class="pane stimulus">${audioPanel('Listen and choose a response','You will hear the sentence once.',task.item.audio,task.id)}</section><section class="pane"><div class="task-kicker">Choose a Response</div><div class="question">Choose the best response.</div><div class="options">${Object.entries(task.item.options).map(([k,v])=>`<div class="option ${ans===k?'selected':''}" data-opt="${k}"><span class="option-letter">${k}</span><span>${esc(v)}</span></div>`).join('')}</div></section></div>`); attachAudioOnce(task.item.audio,task.id); bindOptions(task.id); }
function renderListenGroup(task){ const ans=RUNTIME.attempt.responses[task.id]; const playedKey=`${task.id.replace(/-q\d+$/,'')}-audio`; examShell(task,`<div class="split"><section class="pane stimulus">${audioPanel(`Listen to ${task.group.title.toLowerCase()}`,'The audio is available once for this stimulus.',task.group.audio,playedKey)}</section><section class="pane"><div class="task-kicker">${esc(task.group.title)}</div><div class="question">${esc(task.q.question)}</div><div class="options">${Object.entries(task.q.options).map(([k,v])=>`<div class="option ${ans===k?'selected':''}" data-opt="${k}"><span class="option-letter">${k}</span><span>${esc(v)}</span></div>`).join('')}</div></section></div>`); attachAudioOnce(task.group.audio,playedKey); bindOptions(task.id); }

function renderBuild(task){ const key=task.id, saved=RUNTIME.attempt.responses[key]||[]; const used=new Set(saved.map(x=>x.i)); examShell(task,`<div class="build-area"><div class="task-kicker">Build a Sentence</div><h2>${esc(task.data.question)}</h2><div class="sentence-line">${esc(task.data.prefix)} <span class="answer-zone" id="answerZone" aria-label="Sentence answer area">${saved.map(x=>`<button class="token answer" draggable="true" data-remove="${x.i}">${esc(x.text)}</button>`).join('')}</span>${esc(task.data.suffix||'')}</div><div class="token-bank" id="tokenBank">${task.data.tokens.map((t,i)=>`<button class="token ${used.has(i)?'used':''}" draggable="${used.has(i)?'false':'true'}" data-token="${i}" ${used.has(i)?'disabled':''}>${esc(t)}</button>`).join('')}</div><div class="build-hint">Drag words into the sentence, or tap them on touch devices. Tap an answer word to remove it.</div></div>`);
  const addToken=i=>{const arr=RUNTIME.attempt.responses[key]||[];if(arr.some(x=>x.i===i))return;arr.push({i,text:task.data.tokens[i]});RUNTIME.attempt.responses[key]=arr;saveActive();renderTask()};
  const removeToken=i=>{RUNTIME.attempt.responses[key]=(RUNTIME.attempt.responses[key]||[]).filter(x=>x.i!==i);saveActive();renderTask()};
  $$('[data-token]').forEach(b=>{b.onclick=()=>addToken(+b.dataset.token);b.ondragstart=e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',`bank|${b.dataset.token}`)};});
  $$('[data-remove]').forEach(b=>{b.onclick=()=>removeToken(+b.dataset.remove);b.ondragstart=e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',`answer|${b.dataset.remove}`)};});
  const zone=$('#answerZone'), bank=$('#tokenBank');
  zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag-over')}; zone.ondragleave=()=>zone.classList.remove('drag-over');
  zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag-over');const [from,i]=e.dataTransfer.getData('text/plain').split('|');if(from==='bank')addToken(+i)};
  bank.ondragover=e=>e.preventDefault(); bank.ondrop=e=>{e.preventDefault();const [from,i]=e.dataTransfer.getData('text/plain').split('|');if(from==='answer')removeToken(+i)};
}

function splitWritingRaw(raw,type){
  const text=String(raw); if(type==='email') return {prompt:text,meta:''}; return {prompt:text,meta:''};
}
function writingPromptData(raw,type){let prompt=String(raw).replace(/^\s*Time:\s*[^\n]+\n*/i,'').trim();if(type!=='email')return{prompt,to:'',subject:''};const to=prompt.match(/^To:\s*(.+)$/mi)?.[1]?.trim()||'';const subject=prompt.match(/^Subject:\s*(.+)$/mi)?.[1]?.trim()||'';prompt=prompt.replace(/^To:\s*.+$/gmi,'').replace(/^Subject:\s*.+$/gmi,'').trim();return{prompt,to,subject};}
function renderWriting(task){ const value=RUNTIME.attempt.responses[task.id]||'',data=writingPromptData(task.raw,task.type); examShell(task,`<div class="writing-layout"><section class="writing-prompt"><div class="task-kicker">${task.type==='email'?'Write an Email':'Academic Discussion'}</div>${md(data.prompt)}</section><section class="writing-editor"><div class="editor-head"><strong>Your Response</strong><div class="editor-meta editor-tools"><button class="text-btn wc-toggle" id="hideWc">${RUNTIME.wordCountHidden?'Show':'Hide'} Word Count</button><span id="wcWrap" style="visibility:${RUNTIME.wordCountHidden?'hidden':'visible'}"><span id="wc">${words(value)}</span> words</span></div></div>${task.type==='email'?`<div class="email-compose-meta"><div><span>To</span><strong>${esc(data.to)}</strong></div><div><span>Subject</span><strong>${esc(data.subject)}</strong></div></div>`:''}<textarea id="writingBox" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="sentences">${esc(value)}</textarea><div class="editor-meta">Your response is saved automatically on this device.</div></section></div>`,{back:false});
  const box=$('#writingBox'); box.oninput=()=>{RUNTIME.attempt.responses[task.id]=box.value;$('#wc').textContent=words(box.value);saveActive()}; setTimeout(()=>box.focus(),50);
  $('#hideWc').onclick=()=>{RUNTIME.wordCountHidden=!RUNTIME.wordCountHidden;$('#hideWc').textContent=`${RUNTIME.wordCountHidden?'Show':'Hide'} Word Count`;$('#wcWrap').style.visibility=RUNTIME.wordCountHidden?'hidden':'visible'};
  $('#nextBtn').onclick=()=>{const left=RUNTIME.timer?Math.ceil((RUNTIME.timer.ends-Date.now())/1000):0;if(left>5&&!confirm(`You still have ${fmtTime(left)} remaining. Leave this task now? You will not be able to return.`))return;goNext();};
}

function renderSpeakingIntro(task){ examShell(task,`<div class="transition"><div class="transition-inner"><div class="mini-rule"></div><div class="eyebrow">Speaking</div><h1>${esc(task.title)}</h1><div style="color:var(--muted);line-height:1.6">${md(task.raw)}</div></div></div>`,{nextLabel:'Continue'}); }
function speakingSeconds(task){ if(task.type==='interview')return 45; const wc=words(task.prompt); return wc<=8?8:wc<=13?10:12; }
async function ensureMic(){ if(RUNTIME.mediaStream?.active)return RUNTIME.mediaStream; RUNTIME.mediaStream=await navigator.mediaDevices.getUserMedia({audio:true}); return RUNTIME.mediaStream; }
function recorderMime(){ return ['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg'].find(t=>window.MediaRecorder?.isTypeSupported?.(t))||''; }
function renderSpeakingTask(task){ const slot=task.id; const has=RUNTIME.attempt.recordings.some(r=>r.slot===slot); examShell(task,`<div class="speaking-card"><section class="speaking-visual"><div><div class="scene">${task.type==='repeat'?'▤':'◌'}</div><div style="text-align:center;color:var(--muted);font-size:12px;margin-top:10px">${task.type==='repeat'?'Scenario continues':'University interview'}</div></div></section><section class="speaking-control"><div><div class="task-kicker">${task.type==='repeat'?'Listen and Repeat':'Take an Interview'}</div><h2>${task.type==='repeat'?'Listen once, then repeat exactly.':'Listen to the question, then respond.'}</h2><audio id="taskAudio" preload="auto" src="${esc(task.audio)}"></audio><button class="btn" id="speakPlay" ${has?'disabled':''}>${has?'Response recorded':'Play prompt'}</button><div class="response-time" id="responseTime">${fmtTime(speakingSeconds(task))}</div><div class="record-state" id="recordState">${has?'Recording saved on this device.':'Recording begins automatically after the prompt.'}</div></div></section></div>`,{back:false,nextDisabled:!has});
  if(has)return;
  $('#speakPlay').onclick=async()=>{ const btn=$('#speakPlay');btn.disabled=true; const state=$('#recordState'); try{await ensureMic(); const a=$('#taskAudio');await a.play();RUNTIME.currentAudio=a;state.textContent='Listen…';a.onended=()=>startRecording(task);}catch(e){btn.disabled=false;state.textContent='Audio or microphone could not start. Check permissions and try again.'} };
}
async function startRecording(task){
  const seconds=speakingSeconds(task), state=$('#recordState'), display=$('#responseTime');
  try{ const stream=await ensureMic(); const mime=recorderMime(); const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined); const chunks=[]; rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}; rec.onstop=async()=>{const blob=new Blob(chunks,{type:rec.mimeType||mime||'audio/webm'});const slot=task.id;RUNTIME.recordings.set(slot,blob);try{await DB.put(`${RUNTIME.attempt.id}/${slot}`,blob)}catch(e){console.warn('IndexedDB recording backup unavailable.',e)}RUNTIME.attempt.recordings=RUNTIME.attempt.recordings.filter(r=>r.slot!==slot);RUNTIME.attempt.recordings.push({slot,mime:blob.type,seconds});saveActive();state.innerHTML='<span class="record-dot"></span>Response recorded.';$('#nextBtn').disabled=false;}; rec.start();RUNTIME.mediaRecorder=rec;let left=seconds;state.innerHTML='<span class="record-dot live"></span>Recording…';display.textContent=fmtTime(left);RUNTIME.recordingTimer=setInterval(()=>{left--;display.textContent=fmtTime(left);if(left<=0){clearInterval(RUNTIME.recordingTimer);if(rec.state!=='inactive')rec.stop()}},1000);
  }catch(e){state.textContent='Recording failed. Check microphone permission.';$('#speakPlay').disabled=false;}
}

// Deep Practice rendering is data-driven so sessions can use different step combinations.
function deepTimerSeconds(raw){ const m=String(raw).match(/(?:\*\*)?(?:Time|Maximum):\s*(?:\*\*)?(\d+)\s*(seconds?|minutes?)(?:\*\*)?/i); if(!m)return 0; return +m[1]*(m[2].toLowerCase().startsWith('minute')?60:1); }
function deepInstructionRaw(step){ const raw=String(step.raw); if(step.type==='reading') return raw.match(/\*\*Time:[^\n]+/i)?.[0]||'Read under the timer. No assistance.'; if(['comprehension','vocab-mcq','active-vocab','sentence-correction','build','rapid-transfer'].includes(step.type)){ const first=raw.split(/\n(?:###\s+\d+\.?|\d+\.)/)[0].trim(); return first||step.title; } return raw; }
function renderDeep(task){ const step=task.step; const key=task.id; const sec=deepTimerSeconds(step.raw); const tkey=`deep-${task.session.id}-${step.n}`; if(sec) startTimer(sec,tkey); else if(RUNTIME.timer?.key?.startsWith('deep-')) stopTimer(); const leftRaw=deepInstructionRaw(step); const left=`<div class="task-kicker">${esc(task.session.name)}</div><h2>${esc(step.title)}</h2><div style="color:var(--muted);line-height:1.55">${md(leftRaw)}</div>`;
  let work='';
  if(step.type==='reading') work=`<div class="stimulus-body">${md(step.raw.replace(/\*\*Time:.*?\*\*/i,''))}</div>`;
  else if(step.type==='comprehension') work=deepComprehension(step,key);
  else if(step.type==='vocab-mcq') work=deepVocab(step,key);
  else if(step.type==='active-vocab') work=deepActiveVocab(step,key);
  else if(step.type==='sentence-correction') work=deepCorrections(step,key);
  else if(step.type==='build') work=deepBuild(step,key);
  else if(step.type==='abstraction') work=deepAbstraction(step,key);
  else if(step.type==='discussion'||step.type==='transfer') work=deepWritingEditor(step,key);
  else if(step.type==='repair') work=deepRepair(step,key,false);
  else if(step.type==='repair-rewrite') work=deepRepair(step,key,true);
  else if(step.type==='rewrite') work=deepRewrite(step,key);
  else if(step.type==='rapid-transfer') work=deepRapid(step,key);
  else work=`<textarea class="textarea" style="min-height:260px" data-deep-text>${esc(RUNTIME.attempt.responses[key]||'')}</textarea>`;
  examShell(task,`<div class="deep-step"><section class="deep-instructions">${left}</section><section class="deep-work">${work}</section></div>`);
  bindDeepInputs(key,step);
}
function parseNumbered(raw){ const lines=String(raw).splitlines?raw.splitlines():String(raw).split('\n'); const out=[]; for(const ln of lines){const m=ln.match(/^\s*(\d+)\.\s+(.+)/);if(m&&!/^[A-D]\./.test(m[2]))out.push({n:+m[1],text:stripMd(m[2])})} return out; }
function deepComprehension(step,key){ const qs=parseNumbered(step.raw); const v=RUNTIME.attempt.responses[key]||{}; return qs.map(q=>`<div class="short-answer"><label>${q.n}. ${esc(q.text)}</label><textarea data-deep-field="q${q.n}" spellcheck="false">${esc(v['q'+q.n]||'')}</textarea></div>`).join(''); }
function parseVocabMCQ(raw){
  const lines=String(raw).split('\n'), items=[]; let cur=null;
  for(const line of lines){ let m=line.match(/^\s*(?:###\s*)?(\d+)\.\s*(.+)$/); if(m&&!/^[A-D]\./.test(m[2])){ if(cur)items.push(cur);cur={n:+m[1],stem:stripMd(m[2]),options:{}};continue } m=line.match(/^\s*([A-D])\.\s*(.+)$/); if(m&&cur)cur.options[m[1]]=stripMd(m[2]); }
  if(cur)items.push(cur); return items.filter(x=>Object.keys(x.options).length);
}
function deepVocab(step,key){ const its=parseVocabMCQ(step.raw), v=RUNTIME.attempt.responses[key]||{}; return its.map(it=>`<div class="vocab-row"><div class="question">${esc(it.stem)}</div><div class="options">${Object.entries(it.options).map(([k,t])=>`<div class="option ${v['q'+it.n]===k?'selected':''}" data-deep-opt="q${it.n}|${k}"><span class="option-letter">${k}</span><span>${esc(t)}</span></div>`).join('')}</div></div>`).join(''); }
function parseBullets(raw){ return [...String(raw).matchAll(/^\s*-\s+\*\*?([^*\n]+)\*\*?\s*$/gm)].map(m=>m[1].trim()).concat([...String(raw).matchAll(/^\s*-\s+([^\n*][^\n]*)$/gm)].map(m=>m[1].trim())).filter((x,i,a)=>a.indexOf(x)===i); }
function deepActiveVocab(step,key){ const list=parseBullets(step.raw).filter(x=>!x.includes(';')&&!x.toLowerCase().includes('minimum')&&!x.toLowerCase().includes('correct')); const v=RUNTIME.attempt.responses[key]||{}; return `<h3>Original sentences</h3>${list.map((w,i)=>`<div class="short-answer"><label>${esc(w)}</label><textarea data-deep-field="word${i}" placeholder="Write one original sentence.">${esc(v['word'+i]||'')}</textarea></div>`).join('')}<h3>Use selected vocabulary again in a different topic</h3>${[0,1,2].map(i=>`<div class="short-answer"><textarea data-deep-field="transfer${i}" placeholder="New context sentence ${i+1}">${esc(v['transfer'+i]||'')}</textarea></div>`).join('')}`; }
function deepCorrections(step,key){ const qs=parseNumbered(step.raw); const v=RUNTIME.attempt.responses[key]||{}; return qs.map(q=>`<div class="repair-row"><div class="repair-original">${q.n}. ${esc(q.text)}</div><textarea class="textarea" data-deep-field="q${q.n}" placeholder="Correct the sentence.">${esc(v['q'+q.n]||'')}</textarea></div>`).join(''); }
function parseBuildBlocks(raw){ const chunks=('\n'+String(raw)).split(/\n#{3,4}\s+\d+\s*\n/).slice(1); return chunks.map((c,i)=>{const lines=c.split('\n').map(x=>stripMd(x).trim()).filter(Boolean); const q=lines[0]||''; const template=lines[1]||''; const tokline=lines.find(x=>x.includes(' / '))||lines[2]||''; const tokens=tokline.split('/').map(x=>x.trim()).filter(Boolean); const prefix=template.split(/_+/)[0].trim(); return {n:i+1,q,template,prefix,tokens}}); }
function deepBuild(step,key){ const items=parseBuildBlocks(step.raw), v=RUNTIME.attempt.responses[key]||{}; return items.map(it=>{const arr=v['q'+it.n]||[];const used=new Set(arr.map(x=>x.i));return `<div class="vocab-row"><strong>${it.n}. ${esc(it.q)}</strong><div class="sentence-line" style="font-size:17px">${esc(it.prefix)} <span class="answer-zone" data-deep-zone="q${it.n}">${arr.map(x=>`<button class="token answer" draggable="true" data-deep-remove="q${it.n}|${x.i}">${esc(x.text)}</button>`).join('')}</span></div><div class="token-bank" data-deep-bank="q${it.n}">${it.tokens.map((t,i)=>`<button class="token ${used.has(i)?'used':''}" draggable="${used.has(i)?'false':'true'}" data-deep-token="q${it.n}|${i}|${esc(t)}" ${used.has(i)?'disabled':''}>${esc(t)}</button>`).join('')}</div></div>`}).join(''); }
function parseLabels(raw){ return [...String(raw).matchAll(/\*\*([^*:\n]+(?:\/[^*:\n]+)?):\*\*/g)].map(m=>m[1].trim()).filter(x=>!/^Time$/i.test(x)); }
function deepAbstraction(step,key){ const labs=parseLabels(step.raw); const v=RUNTIME.attempt.responses[key]||{}; return labs.map((l,i)=>`<div class="short-answer"><label>${esc(l)}</label><input class="input" data-deep-field="f${i}" value="${esc(v['f'+i]||'')}"></div>`).join(''); }
function deepWritingEditor(step,key){ const v=RUNTIME.attempt.responses[key]||''; return `<div class="editor-head"><strong>Your Response</strong><span class="editor-meta editor-tools"><button class="text-btn wc-toggle" id="hideDeepWc">${RUNTIME.wordCountHidden?'Show':'Hide'} Word Count</button><span id="deepWcWrap" style="visibility:${RUNTIME.wordCountHidden?'hidden':'visible'}"><span id="deepWc">${words(v)}</span> words</span></span></div><textarea class="textarea" id="deepWritingBox" style="height:calc(100% - 38px);min-height:330px;resize:none" spellcheck="false" autocomplete="off">${esc(v)}</textarea>`; }
function previousWriting(){ for(let i=RUNTIME.taskIndex-1;i>=0;i--){const t=RUNTIME.tasks[i];if(t.type==='deep'&&['discussion','transfer','rewrite'].includes(t.step.type)){const v=RUNTIME.attempt.responses[t.id];if(typeof v==='string'&&v.trim())return v}} return ''; }
const CORR=[['task','Task / Prompt'],['content','Content / Development'],['grammar','Grammar / Syntax'],['vocab','Vocabulary / Word Form'],['spelling','Spelling / Typo'],['clarity','Clarity / Meaning']];
function deepRepair(step,key,withRewrite){ const original=previousWriting(), sentences=(original.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[]).map(x=>x.trim()).filter(Boolean), v=RUNTIME.attempt.responses[key]||{}; return `<h3>Original response</h3>${sentences.map((s,i)=>`<div class="repair-row"><div class="repair-original">${esc(s)}</div><div class="chips">${CORR.map(([c,l])=>`<button class="chip ${(v[i]?.cats||[]).includes(c)?'active':''}" data-corr="${i}|${c}">${esc(l)}</button>`).join('')}</div><textarea class="textarea" data-repair="${i}" placeholder="Student correction">${esc(v[i]?.text||'')}</textarea></div>`).join('')}${withRewrite?`<h3 style="margin-top:22px">Full rewrite</h3><textarea class="textarea" id="combinedRewrite" style="min-height:260px">${esc(v.rewrite||'')}</textarea>`:''}`; }
function deepRewrite(step,key){ const original=previousWriting(), v=RUNTIME.attempt.responses[key]||''; return `<div class="deep-rewrite"><section class="deep-original"><div class="task-kicker">Original response</div><div>${esc(original).replace(/\n/g,'<br>')}</div></section><section class="deep-rewrite-editor"><div class="editor-head"><strong>Rewrite</strong><span class="editor-meta"><span id="deepWc">${words(v)}</span> words</span></div><textarea id="deepWritingBox" spellcheck="false">${esc(v)}</textarea><div class="editor-meta">Correct the identified weaknesses and meet the requirements.</div></section></div>`; }
function deepRapid(step,key){ const qs=parseNumbered(step.raw); const v=RUNTIME.attempt.responses[key]||{}; return qs.map(q=>`<div class="short-answer"><label>${q.n}. ${esc(q.text)}</label><textarea data-deep-field="q${q.n}" placeholder="One sentence only">${esc(v['q'+q.n]||'')}</textarea></div>`).join(''); }
function bindDeepInputs(key,step){
  $$('[data-deep-field]').forEach(el=>el.oninput=()=>{const v=(typeof RUNTIME.attempt.responses[key]==='object'&&RUNTIME.attempt.responses[key]!==null&&!Array.isArray(RUNTIME.attempt.responses[key]))?RUNTIME.attempt.responses[key]:{};v[el.dataset.deepField]=el.value;RUNTIME.attempt.responses[key]=v;saveActive()});
  $$('[data-deep-opt]').forEach(o=>o.onclick=()=>{const [f,val]=o.dataset.deepOpt.split('|');const v=RUNTIME.attempt.responses[key]||{};v[f]=val;RUNTIME.attempt.responses[key]=v;saveActive();renderTask()});
  const addDeepToken=(f,i,t)=>{const v=RUNTIME.attempt.responses[key]||{};const arr=v[f]||[];if(arr.some(x=>x.i===i))return;arr.push({i,text:t});v[f]=arr;RUNTIME.attempt.responses[key]=v;saveActive();renderTask()};
  const removeDeepToken=(f,i)=>{const v=RUNTIME.attempt.responses[key]||{};v[f]=(v[f]||[]).filter(x=>x.i!==i);RUNTIME.attempt.responses[key]=v;saveActive();renderTask()};
  $$('[data-deep-token]').forEach(b=>{const [f,i,...rest]=b.dataset.deepToken.split('|'),t=rest.join('|');b.onclick=()=>addDeepToken(f,+i,t);b.ondragstart=e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',`deep-bank|${f}|${i}|${t}`)};});
  $$('[data-deep-remove]').forEach(b=>{const [f,i]=b.dataset.deepRemove.split('|');b.onclick=()=>removeDeepToken(f,+i);b.ondragstart=e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',`deep-answer|${f}|${i}`)};});
  $$('[data-deep-zone]').forEach(zone=>{zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag-over')};zone.ondragleave=()=>zone.classList.remove('drag-over');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag-over');const parts=e.dataTransfer.getData('text/plain').split('|');if(parts[0]==='deep-bank'&&parts[1]===zone.dataset.deepZone)addDeepToken(parts[1],+parts[2],parts.slice(3).join('|'))};});
  $$('[data-deep-bank]').forEach(bank=>{bank.ondragover=e=>e.preventDefault();bank.ondrop=e=>{e.preventDefault();const parts=e.dataTransfer.getData('text/plain').split('|');if(parts[0]==='deep-answer'&&parts[1]===bank.dataset.deepBank)removeDeepToken(parts[1],+parts[2])};});
  const box=$('#deepWritingBox'); if(box) box.oninput=()=>{RUNTIME.attempt.responses[key]=box.value;const wc=$('#deepWc');if(wc)wc.textContent=words(box.value);saveActive()};
  const dw=$('#hideDeepWc');if(dw)dw.onclick=()=>{RUNTIME.wordCountHidden=!RUNTIME.wordCountHidden;dw.textContent=`${RUNTIME.wordCountHidden?'Show':'Hide'} Word Count`;const wrap=$('#deepWcWrap');if(wrap)wrap.style.visibility=RUNTIME.wordCountHidden?'hidden':'visible'};
  $$('[data-corr]').forEach(b=>b.onclick=()=>{const [i,c]=b.dataset.corr.split('|');const v=RUNTIME.attempt.responses[key]||{};v[i]=v[i]||{cats:[],text:''};const ix=v[i].cats.indexOf(c);if(ix>=0)v[i].cats.splice(ix,1);else v[i].cats.push(c);RUNTIME.attempt.responses[key]=v;saveActive();renderTask()});
  $$('[data-repair]').forEach(t=>t.oninput=()=>{const i=t.dataset.repair,v=RUNTIME.attempt.responses[key]||{};v[i]=v[i]||{cats:[],text:''};v[i].text=t.value;RUNTIME.attempt.responses[key]=v;saveActive()});
  const cr=$('#combinedRewrite');if(cr)cr.oninput=()=>{const v=RUNTIME.attempt.responses[key]||{};v.rewrite=cr.value;RUNTIME.attempt.responses[key]=v;saveActive()};
  const generic=$('[data-deep-text]');if(generic)generic.oninput=()=>{RUNTIME.attempt.responses[key]=generic.value;saveActive()};
}

function gradeAttempt(attempt){
  const scores={};
  if(attempt.kind==='deep'){
    const session=DEEP.find(d=>d.id===attempt.deepId); if(!session)return scores;
    const vocabTask=RUNTIME.tasks.find(t=>t.type==='deep'&&t.step.type==='vocab-mcq');
    const buildTask=RUNTIME.tasks.find(t=>t.type==='deep'&&t.step.type==='build');
    if(vocabTask){const v=attempt.responses[vocabTask.id]||{};let c=0;Object.entries(session.key?.vocab||{}).forEach(([n,a])=>{if(v['q'+n]===a)c++});scores.deepVocabulary={correct:c,total:Object.keys(session.key?.vocab||{}).length};}
    if(buildTask){const v=attempt.responses[buildTask.id]||{};let c=0,total=0;Object.entries(session.key?.build||{}).forEach(([n,order])=>{total++;const got=(v['q'+n]||[]).map(x=>x.text);if(got.length===order.length&&got.every((x,i)=>String(x).toLowerCase()===String(order[i]).toLowerCase()))c++});scores.deepBuild={correct:c,total};}
    const discussion=RUNTIME.tasks.find(t=>t.type==='deep'&&t.step.type==='discussion'); if(discussion)scores.discussionWords=words(attempt.responses[discussion.id]||'');
    const transfer=RUNTIME.tasks.find(t=>t.type==='deep'&&t.step.type==='transfer'); if(transfer)scores.transferWords=words(attempt.responses[transfer.id]||'');
    return scores;
  }
  const sim=FULL.find(s=>s.id===attempt.simulationId); if(!sim)return scores;
  const includes=sec=>attempt.kind==='full'||attempt.section===sec;
  if(includes('reading')){let correct=0,total=40;sim.reading.forEach((m,mi)=>{const a=attempt.responses[`reading-m${mi+1}-cloze`]||[];m.cloze.answers.forEach((x,i)=>{if(String(a[i]||'').trim().toLowerCase()===String(x.missing).toLowerCase())correct++});m.groups.forEach(g=>g.questions.forEach(q=>{if(attempt.responses[`reading-m${mi+1}-q${q.n}`]===q.answer)correct++}))});scores.reading={correct,total};}
  if(includes('listening')){let correct=0,total=34;sim.listening.forEach((m,mi)=>{m.choose.forEach(it=>{if(attempt.responses[`listening-m${mi+1}-r${it.n}`]===it.answer)correct++});m.groups.forEach((g,gi)=>g.questions.forEach(q=>{if(attempt.responses[`listening-m${mi+1}-g${gi+1}-q${q.n}`]===q.answer)correct++}))});scores.listening={correct,total};}
  if(includes('writing')){let correct=0,total=10;sim.writing.build.forEach((it,i)=>{const arr=(attempt.responses[`writing-build-${i+1}`]||[]).map(x=>x.text);if(arr.length===it.correctOrder.length&&arr.every((x,j)=>x.toLowerCase()===it.correctOrder[j].toLowerCase()))correct++});scores.build={correct,total};scores.emailWords=words(attempt.responses['writing-email']||'');scores.discussionWords=words(attempt.responses['writing-discussion']||'');}
  if(includes('speaking')) scores.speakingRecordings=attempt.recordings?.length||0;
  return scores;
}
async function finishAttempt(){
  stopTimer(); stopCurrentAudio(); if(RUNTIME.recordingTimer)clearInterval(RUNTIME.recordingTimer); if(RUNTIME.mediaStream){RUNTIME.mediaStream.getTracks().forEach(t=>t.stop());RUNTIME.mediaStream=null}
  const a=RUNTIME.attempt;a.completedAt=nowIso();a.status='complete';a.scores=gradeAttempt(a);a.durationSeconds=Math.round((new Date(a.completedAt)-new Date(a.startedAt))/1000);saveCompletedAttempt(a);clearActive();
  const sync=await syncAttempt(a);a.sync=sync?'synced':'local-only';saveCompletedAttempt(a);RUNTIME.attempt=a;setHash('#/results');
}
async function syncAttempt(a){
  try{
    a.sync='uploading';
    let r=await fetch('/.netlify/functions/attempts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(a)}); if(!r.ok)throw new Error('attempt upload');
    for(const rec of a.recordings||[]){ let blob=RUNTIME.recordings.get(rec.slot);if(!blob){try{blob=await DB.get(`${a.id}/${rec.slot}`)}catch{}} if(!blob)continue; const ur=await fetch(`/.netlify/functions/audio?attemptId=${encodeURIComponent(a.id)}&slot=${encodeURIComponent(rec.slot)}`,{method:'POST',headers:{'content-type':blob.type||rec.mime||'audio/webm'},body:blob}); if(!ur.ok)throw new Error('audio upload'); }
    a.sync='synced';
    r=await fetch('/.netlify/functions/attempts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(a)}); if(!r.ok)throw new Error('final sync state');
    return true;
  }catch(e){a.sync='local-only';console.warn('Remote sync unavailable; kept locally.',e);return false}
}

function results(){ const a=RUNTIME.attempt?.status==='complete'?RUNTIME.attempt:loadCompleted()[0]; if(!a){home();return} const s=a.scores||{}; const cards=[];if(s.reading)cards.push(['Reading',`${s.reading.correct}/${s.reading.total}`]);if(s.listening)cards.push(['Listening',`${s.listening.correct}/${s.listening.total}`]);if(s.build)cards.push(['Build a Sentence',`${s.build.correct}/${s.build.total}`]);if(s.speakingRecordings!=null)cards.push(['Speaking',`${s.speakingRecordings}/11 recorded`]);if(s.deepVocabulary)cards.push(['Vocabulary',`${s.deepVocabulary.correct}/${s.deepVocabulary.total}`]);if(s.deepBuild)cards.push(['Build a Sentence',`${s.deepBuild.correct}/${s.deepBuild.total}`]);if(s.transferWords!=null)cards.push(['Transfer',`${s.transferWords} words`]);
  shell(`<section class="results"><div class="results-head"><div><div class="eyebrow">Results</div><h1>${esc(a.label)}</h1><div style="color:var(--muted);margin-top:6px">${esc(a.student)} · ${new Date(a.completedAt).toLocaleString()}</div></div><div><a class="btn secondary" href="#/">Home</a></div></div><div class="sync-state">${a.sync==='synced'?'Saved to Teacher Dashboard.':'Saved locally. Remote storage will sync when deployed through Netlify.'}</div><div class="score-grid">${cards.map(([n,v])=>`<div class="score-card"><strong>${esc(v)}</strong><span>${esc(n)}</span></div>`).join('')}</div>${renderResultDetails(a)}</section>`,'Results'); }

function buildAutoReview(a){
  const out=[];
  if(a.kind==='deep'){
    const sess=DEEP.find(d=>d.id===a.deepId); if(!sess)return out; const tasks=buildDeepTasks(sess);
    const vt=tasks.find(t=>t.step.type==='vocab-mcq'); if(vt){const v=a.responses[vt.id]||{};const rows=Object.entries(sess.key?.vocab||{}).map(([n,correct])=>({label:`Vocabulary ${n}`,got:v['q'+n]||'—',correct,ok:v['q'+n]===correct}));out.push({title:'Vocabulary Under Pressure',rows});}
    const bt=tasks.find(t=>t.step.type==='build'); if(bt){const v=a.responses[bt.id]||{};const rows=Object.entries(sess.key?.build||{}).map(([n,correct])=>{const got=(v['q'+n]||[]).map(x=>x.text);const ok=got.length===correct.length&&got.every((x,i)=>String(x).toLowerCase()===String(correct[i]).toLowerCase());return{label:`Build ${n}`,got:got.join(' · ')||'—',correct:correct.join(' · '),ok}});out.push({title:'Build a Sentence',rows});}
    return out;
  }
  const sim=FULL.find(s=>s.id===a.simulationId); if(!sim)return out; const include=sec=>a.kind==='full'||a.section===sec;
  if(include('reading')){
    const rows=[];sim.reading.forEach((m,mi)=>{const ca=a.responses[`reading-m${mi+1}-cloze`]||[];m.cloze.answers.forEach((x,i)=>{const got=String(ca[i]||'').trim();rows.push({label:`Module ${mi+1} · Word ${i+1}`,got:got||'—',correct:x.missing,ok:got.toLowerCase()===String(x.missing).toLowerCase()})});m.groups.forEach(g=>g.questions.forEach(q=>{const got=a.responses[`reading-m${mi+1}-q${q.n}`]||'—';rows.push({label:`Module ${mi+1} · Question ${q.n}`,got,correct:q.answer,ok:got===q.answer})}))});out.push({title:'Reading',rows});
  }
  if(include('listening')){
    const rows=[];sim.listening.forEach((m,mi)=>{m.choose.forEach(it=>{const got=a.responses[`listening-m${mi+1}-r${it.n}`]||'—';rows.push({label:`Module ${mi+1} · Response ${it.n}`,got,correct:it.answer,ok:got===it.answer})});m.groups.forEach((g,gi)=>g.questions.forEach(q=>{const got=a.responses[`listening-m${mi+1}-g${gi+1}-q${q.n}`]||'—';rows.push({label:`Module ${mi+1} · Question ${q.n}`,got,correct:q.answer,ok:got===q.answer})}))});out.push({title:'Listening',rows});
  }
  if(include('writing')){
    const rows=sim.writing.build.map((it,i)=>{const got=(a.responses[`writing-build-${i+1}`]||[]).map(x=>x.text);const ok=got.length===it.correctOrder.length&&got.every((x,j)=>String(x).toLowerCase()===String(it.correctOrder[j]).toLowerCase());return{label:`Build ${i+1}`,got:got.join(' · ')||'—',correct:it.correctOrder.join(' · '),ok}});out.push({title:'Build a Sentence',rows});
  }
  return out;
}
function autoReviewHtml(a,open=false){ const sections=buildAutoReview(a);return sections.map(sec=>`<details class="result-section" ${open?'open':''}><summary>${esc(sec.title)} item review</summary><div class="result-body"><div class="answer-list">${sec.rows.map(r=>`<div class="answer-item ${r.ok?'good':'bad'}"><strong>${esc(r.label)}</strong><div style="margin-top:5px">Student: ${esc(r.got)}<br>Correct: ${esc(r.correct)}</div></div>`).join('')}</div></div></details>`).join(''); }

function renderResultDetails(a){
  let h=autoReviewHtml(a,false); const sim=FULL.find(s=>s.id===a.simulationId);
  if(sim&&(a.kind==='full'||a.section==='writing')) h+=`<details class="result-section" open><summary>Writing production</summary><div class="result-body"><h3>Email</h3><div class="answer-item">${esc(a.responses['writing-email']||'No response').replace(/\n/g,'<br>')}</div><h3>Academic Discussion</h3><div class="answer-item">${esc(a.responses['writing-discussion']||'No response').replace(/\n/g,'<br>')}</div></div></details>`;
  if(a.kind==='deep'){const sess=DEEP.find(d=>d.id===a.deepId);const dtasks=sess?buildDeepTasks(sess):[];h+=`<details class="result-section" open><summary>Deep Practice production</summary><div class="result-body"><div class="answer-list">${dtasks.map(t=>`<div class="answer-item"><strong>${esc(t.step?.title||t.id)}</strong><div style="margin-top:6px">${formatAny(a.responses[t.id])}</div></div>`).join('')}</div></div></details>`;}
  if(a.recordings?.length) h+=`<details class="result-section"><summary>Speaking recordings</summary><div class="result-body"><div class="recordings">${a.recordings.map(r=>`<div class="recording"><strong>${esc(r.slot)}</strong><button class="btn secondary small" data-local-play="${esc(r.slot)}">Play</button></div>`).join('')}</div></div></details>`;
  setTimeout(()=>$$('[data-local-play]').forEach(b=>b.onclick=async()=>{const blob=RUNTIME.recordings.get(b.dataset.localPlay)||await DB.get(`${a.id}/${b.dataset.localPlay}`);if(blob)new Audio(URL.createObjectURL(blob)).play();else toast('Recording is not available on this device.')}),0);
  return h;
}
function formatAny(v){ if(v==null||v==='')return'<span style="color:var(--muted)">No response</span>';if(typeof v==='string')return esc(v).replace(/\n/g,'<br>');if(Array.isArray(v))return esc(v.map(x=>x.text||x).join(' · '));return Object.entries(v).map(([k,x])=>`<div><strong>${esc(k)}:</strong> ${formatAny(x)}</div>`).join(''); }

async function teacher(){
  shell(`<section class="teacher"><div class="teacher-top"><div><div class="eyebrow">Brentwood English</div><h1>Teacher Dashboard</h1></div><button class="btn secondary" id="refreshTeacher">Refresh</button></div><div class="teacher-note"><strong>Development access:</strong> this dashboard is intentionally not authenticated in Beta ${VERSION}. Do not treat the URL as private.</div><div class="score-grid teacher-stats" id="teacherStats"></div><div class="teacher-grid"><div class="attempt-list"><div class="attempt-list-head"><input class="input" id="attemptSearch" placeholder="Search student or practice"></div><div class="attempt-scroll" id="attemptList"><div class="empty">Loading attempts…</div></div></div><div class="attempt-detail" id="attemptDetail"><div class="empty">Select an attempt to inspect student production.</div></div></div></section>`,'Teacher');
  $('#refreshTeacher').onclick=loadTeacherAttempts; $('#attemptSearch').oninput=renderTeacherList; await loadTeacherAttempts();
}
let teacherAttempts=[];
async function loadTeacherAttempts(){ const local=loadCompleted(); let remote=[];try{const r=await fetch('/.netlify/functions/attempts');if(r.ok)remote=await r.json()}catch{} const map=new Map();[...local,...remote].forEach(a=>map.set(a.id,{...map.get(a.id),...a}));teacherAttempts=[...map.values()].sort((a,b)=>new Date(b.completedAt||b.startedAt)-new Date(a.completedAt||a.startedAt));renderTeacherStats();renderTeacherList(); }
function renderTeacherStats(){const el=$('#teacherStats');if(!el)return;const students=new Set(teacherAttempts.map(a=>String(a.student||'').trim().toLowerCase()).filter(Boolean)).size;const reviewed=teacherAttempts.filter(a=>a.teacher&&(a.teacher.notes||a.teacher.writingScore||a.teacher.speakingScore)).length;const synced=teacherAttempts.filter(a=>a.sync==='synced').length;el.innerHTML=[[students,'Students'],[teacherAttempts.length,'Attempts'],[reviewed,'Reviewed'],[synced,'Remote records']].map(([v,n])=>`<div class="score-card"><strong>${v}</strong><span>${n}</span></div>`).join('');}
function attemptScoreLine(a){const s=a.scores||{},parts=[];if(s.reading)parts.push(`R ${s.reading.correct}/${s.reading.total}`);if(s.listening)parts.push(`L ${s.listening.correct}/${s.listening.total}`);if(s.build)parts.push(`Build ${s.build.correct}/${s.build.total}`);if(s.deepVocabulary)parts.push(`Vocab ${s.deepVocabulary.correct}/${s.deepVocabulary.total}`);if(s.deepBuild)parts.push(`Build ${s.deepBuild.correct}/${s.deepBuild.total}`);return parts.join(' · ');}
function renderTeacherList(){ const el=$('#attemptList');if(!el)return;const q=($('#attemptSearch')?.value||'').toLowerCase();const arr=teacherAttempts.filter(a=>(a.student+' '+a.label).toLowerCase().includes(q));el.innerHTML=arr.length?arr.map(a=>`<div class="attempt-row" data-attempt="${a.id}"><strong>${esc(a.student)}</strong><span>${esc(a.label)} · ${new Date(a.completedAt||a.startedAt).toLocaleString()}</span>${attemptScoreLine(a)?`<span class="attempt-score">${esc(attemptScoreLine(a))}</span>`:''}</div>`).join(''):'<div class="empty">No matching attempts.</div>';$$('[data-attempt]').forEach(r=>r.onclick=()=>openTeacherAttempt(r.dataset.attempt)); }
async function fetchAttemptDetail(id){ let a=teacherAttempts.find(x=>x.id===id);try{const r=await fetch(`/.netlify/functions/attempts?id=${encodeURIComponent(id)}`);if(r.ok)a=await r.json()}catch{}return a; }
async function openTeacherAttempt(id){ $$('[data-attempt]').forEach(r=>r.classList.toggle('active',r.dataset.attempt===id));const el=$('#attemptDetail');el.innerHTML='<div class="empty">Loading…</div>';const a=await fetchAttemptDetail(id);if(!a){el.innerHTML='<div class="empty">Attempt unavailable.</div>';return}const s=a.scores||{};el.innerHTML=`<div class="eyebrow">Student attempt</div><h2 style="margin:5px 0">${esc(a.student)}</h2><div class="detail-meta"><span class="pill">${esc(a.label)}</span><span class="pill">${new Date(a.completedAt||a.startedAt).toLocaleString()}</span><span class="pill">${Math.round((a.durationSeconds||0)/60)} min</span></div>${teacherScores(s)}${autoReviewHtml(a,false)}${teacherProduction(a)}${teacherRecordings(a)}<div class="teacher-editor"><h3>Teacher review</h3><div class="field"><label>Writing score (1–6)</label><input class="input" id="teacherWriting" type="number" min="1" max="6" step="0.5" value="${esc(a.teacher?.writingScore||'')}"></div><div class="field"><label>Speaking score (1–6)</label><input class="input" id="teacherSpeaking" type="number" min="1" max="6" step="0.5" value="${esc(a.teacher?.speakingScore||'')}"></div><div class="field"><label>Notes</label><textarea class="textarea" id="teacherNotes" rows="5">${esc(a.teacher?.notes||'')}</textarea></div><button class="btn" id="saveTeacherReview">Save review</button></div>`;$('#saveTeacherReview').onclick=()=>saveTeacherReview(a); }
function teacherScores(s){ const c=[];if(s.reading)c.push(['Reading',`${s.reading.correct}/${s.reading.total}`]);if(s.listening)c.push(['Listening',`${s.listening.correct}/${s.listening.total}`]);if(s.build)c.push(['Build',`${s.build.correct}/${s.build.total}`]);if(s.emailWords!=null)c.push(['Email',`${s.emailWords} words`]);if(s.discussionWords!=null)c.push(['Discussion',`${s.discussionWords} words`]);if(s.deepVocabulary)c.push(['Vocabulary',`${s.deepVocabulary.correct}/${s.deepVocabulary.total}`]);if(s.deepBuild)c.push(['Deep Build',`${s.deepBuild.correct}/${s.deepBuild.total}`]);if(s.transferWords!=null)c.push(['Transfer',`${s.transferWords} words`]);return c.length?`<div class="score-grid" style="grid-template-columns:repeat(${Math.min(4,c.length)},1fr)">${c.map(([n,v])=>`<div class="score-card"><strong>${esc(v)}</strong><span>${esc(n)}</span></div>`).join('')}</div>`:''; }
function teacherProduction(a){ const entries=Object.entries(a.responses||{}).filter(([k,v])=>{if(k.endsWith('-played'))return false;if(typeof v==='string')return v.trim();if(Array.isArray(v))return v.length;if(v&&typeof v==='object')return Object.keys(v).length;return false});return `<details class="result-section" open><summary>Student production and answers</summary><div class="result-body"><div class="answer-list">${entries.map(([k,v])=>`<div class="answer-item"><strong>${esc(humanKey(k))}</strong><div style="margin-top:6px">${formatAny(v)}</div></div>`).join('')}</div></div></details>`; }
function humanKey(k){ return k.replace(/-/g,' ').replace(/\b\w/g,m=>m.toUpperCase()); }
function teacherRecordings(a){ if(!a.recordings?.length)return'';const localOnly=a.sync!=='synced'; const html=`<details class="result-section" open><summary>Speaking recordings (${a.recordings.length})</summary><div class="result-body"><div class="recordings">${a.recordings.map(r=>localOnly?`<div class="recording"><span>${esc(humanKey(r.slot))}</span><button class="btn secondary small" data-teacher-local-audio="${esc(r.slot)}" data-attempt-id="${esc(a.id)}">Play local</button></div>`:`<div class="recording"><span>${esc(humanKey(r.slot))}</span><audio controls preload="none" src="/.netlify/functions/audio?attemptId=${encodeURIComponent(a.id)}&slot=${encodeURIComponent(r.slot)}"></audio></div>`).join('')}</div></div></details>`; setTimeout(()=>$$('[data-teacher-local-audio]').forEach(b=>b.onclick=async()=>{const blob=await DB.get(`${b.dataset.attemptId}/${b.dataset.teacherLocalAudio}`);if(blob)new Audio(URL.createObjectURL(blob)).play();else toast('Recording is not stored on this device.')}),0); return html; }
async function saveTeacherReview(a){ a.teacher={writingScore:$('#teacherWriting').value,speakingScore:$('#teacherSpeaking').value,notes:$('#teacherNotes').value,updatedAt:nowIso()}; const local=loadCompleted();const i=local.findIndex(x=>x.id===a.id);if(i>=0){local[i]=a;localStorage.setItem(KEYS.completed,JSON.stringify(local))}try{await fetch('/.netlify/functions/attempts',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:a.id,teacher:a.teacher})})}catch{}toast('Teacher review saved.'); }

function route(){
  const {parts}=parseHash(); stopCurrentAudio();
  if(!parts.length)return home();
  if(parts[0]==='full')return listFull();
  if(parts[0]==='section'&&parts.length===1)return listSections();
  if(parts[0]==='section'&&parts.length===2)return listSectionSims(parts[1]);
  if(parts[0]==='deep')return listDeep();
  if(parts[0]==='start')return setup(parts);
  if(parts[0]==='attempt')return renderAttempt();
  if(parts[0]==='results')return results();
  if(parts[0]==='teacher')return teacher();
  home();
}
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',()=>{if(RUNTIME.attempt?.status==='in-progress')saveActive()});
route();
})();
