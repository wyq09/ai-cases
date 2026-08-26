/* ════════════════════════════════════════════════════════════
   Elera · Patient Flow — application
   Vanilla JS · central store · FLIP transitions · live sim
   ════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const D = window.DATA;
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─────────────────────────── icons ─────────────────────────── */
const I = {
  search : '<svg viewBox="0 0 24 24" class="i"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
  chevD  : '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  plus   : '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  check  : '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
  x      : '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  info   : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><path d="M12 11v5"/><path d="M12 7.6v.01"/></svg>',
  clock  : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l2.8 1.8"/></svg>',
  dash   : '<svg viewBox="0 0 24 24" class="dash"><circle cx="12" cy="12" r="8.2"/></svg>',
  right  : '<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6.5L19 12l-6 5.5"/></svg>',
  send   : '<svg viewBox="0 0 24 24"><path d="M21 3L10.5 13.5M21 3l-7 19-3.5-8.5L2 10z"/></svg>',
  spark  : '<svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M4.2 7.2l2.1 2.1M17.7 14.7l2.1 2.1M3 12h3M18 12h3M4.2 16.8l2.1-2.1M17.7 9.3l2.1-2.1"/></svg>',
  patient: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><circle cx="9.2" cy="10.3" r="2.1"/><path d="M5.8 16.4c.5-1.7 1.9-2.6 3.4-2.6s2.9.9 3.4 2.6M15 9.5h3.4M15 13h3.4"/></svg>',
  cal    : '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="3.5"/><path d="M3.5 9.8h17M8 2.8V6m8-3.2V6"/></svg>',
  msg    : '<svg viewBox="0 0 24 24"><path d="M21 11.8c0 4.3-4 7.7-9 7.7-1 0-2-.1-2.9-.4L4 20.5l1.2-3.6A7.3 7.3 0 0 1 3 11.8c0-4.3 4-7.8 9-7.8s9 3.5 9 7.8z"/></svg>',
  home   : '<svg viewBox="0 0 24 24"><path d="M3.5 10.2 12 3.5l8.5 6.7V20a1 1 0 0 1-1 1h-5.2v-6.4H9.7V21H4.5a1 1 0 0 1-1-1z"/></svg>',
  kanban : '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4.5"/><path d="M7.2 13.4h2.4l1.5-3.6 1.8 4.4 1.4-2.9h2.5"/></svg>',
  dollar : '<svg viewBox="0 0 24 24"><path d="M6 3.5h9.5L19 7v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5z"/><path d="M12 9.2v6.8M14 10.4c-.5-.8-3.6-1.2-3.6.7s3.7.8 3.7 2.6c0 1.7-3 1.6-3.9.6"/></svg>',
  users  : '<svg viewBox="0 0 24 24"><circle cx="9" cy="8.2" r="3.4"/><path d="M2.8 20c.7-3.3 3.2-5 6.2-5s5.5 1.7 6.2 5"/><circle cx="17" cy="9.4" r="2.6"/><path d="M15.6 14.6c2.9-.4 5.1 1.2 5.6 4.4"/></svg>',
  flask  : '<svg viewBox="0 0 24 24"><path d="M10 3.5h4M10.7 3.5v5.2L6.5 17a3.2 3.2 0 0 0 2.9 4.5h5.2a3.2 3.2 0 0 0 2.9-4.5l-4.2-8.3V3.5"/><path d="M8.2 13.5h7.6"/></svg>',
  chart  : '<svg viewBox="0 0 24 24"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M18 2.8l.4 3.4-3.4.4"/><path d="M12.2 8.8v3.6l2.6 1.6"/></svg>',
  gear   : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/></svg>',
  heart  : '<svg viewBox="0 0 24 24"><path d="M12 20.3S4 15.4 4 9.9A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.5-8 10.4-8 10.4z"/><path d="M12 9.6v4.2M9.9 11.7h4.2"/></svg>',
  drop   : '<svg viewBox="0 0 24 24"><path d="M12 3.6s6 6.2 6 10.4a6 6 0 1 1-12 0C6 9.8 12 3.6 12 3.6z"/><path d="M9.4 14.6a2.8 2.8 0 0 0 2.3 2.5"/></svg>',
  history: '<svg viewBox="0 0 24 24"><path d="M3.6 12a8.4 8.4 0 1 0 2.5-6"/><path d="M3.2 3.4l.4 3.2 3.2-.4"/><path d="M12 8.2V12l2.6 1.6"/></svg>',
  clocks : '<svg viewBox="0 0 24 24"><circle cx="9" cy="13" r="7"/><path d="M9 9.6V13l2.2 1.4"/><path d="M14.5 4.4a7 7 0 0 1 6.4 6.9"/></svg>',
  filter : '<svg viewBox="0 0 24 24"><path d="M4 7h16M7 12h10M10 17h4"/></svg>',
  star   : '<svg viewBox="0 0 24 24"><path d="M12 3.6l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8z"/></svg>',
  lab    : '<svg viewBox="0 0 24 24"><path d="M10 3.5h4M10.7 3.5v5.2L6.5 17a3.2 3.2 0 0 0 2.9 4.5h5.2a3.2 3.2 0 0 0 2.9-4.5l-4.2-8.3V3.5"/><path d="M8.2 13.5h7.6"/></svg>',
  doc    : '<svg viewBox="0 0 24 24"><path d="M6 3.5h9.5L19 7v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5z"/><path d="M14.5 3.5V7H19"/><path d="M8.6 12.6h6.8M8.6 16h4.4"/></svg>',
  out    : '<svg viewBox="0 0 24 24"><path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9"/><path d="M15 16.5L20 12l-5-4.5M20 12H9"/></svg>',
};

/* ─────────────────────────── state ─────────────────────────── */
const LS = k => 'elera:'+k;
try{
  document.body.classList.toggle('rail-force', false);
  if(localStorage.getItem(LS('accent'))) document.documentElement.dataset.accent = localStorage.getItem(LS('accent'));
}catch(e){}

const S = {
  route : 'patientflow',
  scope : 'everyone',
  doctor: 'all',
  area  : 'all',
  sortWait: false,
  quick : null,
  find  : '',
  fx    : { interp:false, breaching:false, nodoc:false },
  live  : true,
  dirty : false,
  drawer: null,
  feed  : [],           // notifications {id,title,sub,time,unread}
  unread: 0,
  history: {},          // pid -> [{t,label}]
  statCells: ['clinic','wait','over','rooms'],
  aiLog: [],
  msgsOpen: null,
};

/* decorative-first numbers（截图一致），首次交互后切换为真实推导 */
let SHOT = JSON.parse(JSON.stringify(D.INITIAL));
const MARK_DIRTY = () => { if(!S.dirty){ S.dirty = true; } };

const P = () => D.patients;
const byId = id => P().find(p=>p.id===id);
const STG = Object.fromEntries(D.STAGES.map(s=>[s.id,s]));
const ORDER = D.STAGES.map(s=>s.id);
const stageIdx = st => ORDER.indexOf(st);

const mySet = new Set(['p03','p05','p08']);        // “My patients”
const floorSet = p => /^Bay/.test(p.loc.label);

const initialsOf = n => (n.trim()[0]||'·').toUpperCase();

function tierClass(p){
  if(p.tierFixed) return p.tierFixed;
  const st = STG[p.stage];
  const tgt = st && st.target;
  if(tgt != null && p.wait > tgt) return 't-rose';
  if(p.wait >= 5) return 't-amber';
  return 't-pale';
}
const isOver = p => { const t=STG[p.stage]; return (t&&t.target!=null) ? p.wait>t.target : p.wait>=30; };
const flagsOf = p => ({
  breach : isOver(p),
  blocked: !!(p.flag && p.flag.blockedOn),
  nodoc  : p.doctor === null,
  newpt  : !!(p.flag && p.flag.new),
  interp : !!(p.flag && p.flag.interp),
});

/* ─────────────────────── tiny ui utils ─────────────────────── */
function toast(msg, kind='ok'){
  const root = $('#toastRoot');
  const el = document.createElement('div');
  el.className = 'toast '+kind;
  el.innerHTML = `<span class="ticn">${kind==='ok'?I.check:kind==='warn'?I.info:I.spark}</span>${msg}`;
  root.appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 380); }, 2800);
}

function tween(el, to, {prefix='',suffix='',money=false,dur=700}={}){
  const from = el._val ?? (parseFloat((el.textContent+'').replace(/[^0-9.]/g,''))||0);
  el._val = to;
  if(reduced){ el.textContent = prefix+(money?to.toLocaleString('en-US'):Math.round(to))+suffix; return; }
  const t0 = performance.now();
  cancelAnimationFrame(el._raf||0);
  const step = t => {
    const k = clamp((t-t0)/dur,0,1), e = 1-Math.pow(1-k,4);
    const v = from + (to-from)*e;
    el.textContent = prefix+(money?Math.round(v).toLocaleString('en-US'):Math.round(v))+suffix;
    if(k<1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function popFeed(n){
  S.feed.unshift({...n, time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), unread:true});
  S.unread++;
  const dot = $('#bellDot');
  dot.hidden = false;
  const b = $('#bellBtn');
  b.classList.remove('bell-ringing'); void b.offsetWidth; b.classList.add('bell-ringing');
}

/* FLIP helper — animate keyed nodes across a DOM mutation */
function withFLIP(scopeSel, mutate, {enter=true}={}){
  const scopes = $$(scopeSel);
  const before = new Map();
  scopes.forEach(sc => sc.querySelectorAll('[data-k]').forEach(el=>{
    const r = el.getBoundingClientRect();
    if(r.width||r.height) before.set(el.dataset.k, r);
  }));
  mutate();
  requestAnimationFrame(()=>{
    scopes.forEach(sc => sc.querySelectorAll('[data-k]').forEach(el=>{
      const b = before.get(el.dataset.k);
      const r = el.getBoundingClientRect();
      if(!r.width && !r.height) return;
      if(b){
        const dx=b.left-r.left, dy=b.top-r.top;
        if(Math.abs(dx)<.6 && Math.abs(dy)<.6) return;
        if(reduced) return;
        el.style.transition='none';
        el.style.transform=`translate(${dx}px,${dy}px)`;
        requestAnimationFrame(()=>{
          el.style.transition='transform .58s cubic-bezier(.22,1,.36,1)';
          el.style.transform='';
          el.addEventListener('transitionend',()=>{el.style.transition='';},{once:true});
        });
      }else if(enter && !reduced){
        el.style.animation='item-in .5s var(--e-out) backwards';
        el.style.animationDelay=Math.min(before.size*18,220)+'ms';
      }
    }));
  });
}

/* ─────────────────── predicates / derivation ────────────────── */
function passesFilters(p){
  if(S.scope==='mine'     && !mySet.has(p.id)) return false;
  if((S.scope==='floor'    && !floorSet(p)))     return false;
  if((S.scope==='frontdesk'&& !(p.stage==='checkin'))) return false;
  if((S.area==='bays'  && !/^Bay/.test(p.loc.label)))  return false;
  if((S.area==='east'  && !/Room (8|12)/.test(p.loc.label))) return false;
  if((S.area==='west'  && !/Room (5|7|10)/.test(p.loc.label))) return false;
  if((S.doctor==='chen' && p.doctor!=='Dr. Chen'))  return false;
  if((S.doctor==='patel'&& p.doctor!=='Dr. Patel')) return false;
  if((S.doctor==='none' && p.doctor!==null))        return false;
  const f = flagsOf(p);
  if((S.quick==='breaching' && !(f.breach||f.blocked))) return false;
  if((S.quick==='blocked'   && !f.blocked))  return false;
  if((S.quick==='nodoc'     && !f.nodoc))    return false;
  if((S.quick==='newpt'     && !f.newpt))    return false;
  if((S.quick==='interp'    && !f.interp))   return false;
  if((S.fx.interp    && !f.interp))   return false;
  if((S.fx.breaching && !f.breach))   return false;
  if((S.fx.nodoc     && !f.nodoc))    return false;
  const q = S.find.trim().toLowerCase();
  if(q && !(p.name.toLowerCase().includes(q)||p.reason.toLowerCase().includes(q))) return false;
  return true;
}
const visibleByStage = () => {
  const out={}; ORDER.forEach(s=>out[s]=[]);
  P().forEach(p=>{ if(passesFilters(p)) out[p.stage].push(p); });
  if(S.sortWait) ORDER.forEach(s=>out[s].sort((a,b)=>b.wait-a.wait));
  return out;
};

function liveStats(){
  const act = P().filter(p=>p.stage!=='left');
  const avg = act.length? Math.round(act.reduce((s,p)=>s+p.wait,0)/act.length) : 0;
  const over= act.filter(isOver).length;
  const left= P().filter(p=>p.stage==='left');
  const durs= left.map(p=>p.dur).filter(Boolean);
  const d2d = durs.length? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : 58;
  return {
    clinic: act.length,
    avg, over,
    durs, d2d,
    billed: D.__billed ?? 1284,
    collected: D.__collected ?? 960,
    insurance: D.__insurance ?? 324,
    same: Math.round(((D.__collected ?? 960)/(D.__billed ?? 1284))*100),
  };
}

/* ─────────────────────── board rendering ────────────────────── */
const AVCOLORS = Object.values(D.COLORS);
let avPool = 0;
const avColor = name => { const s=[...name].reduce((a,c)=>a+c.charCodeAt(0),0); return Object.keys(D.COLORS)[s % Object.keys(D.COLORS).length]; };

function cardHTML(p){
  const tc = tierClass(p);
  const inLeft = p.stage==='left';
  let inner = `
    <div class="pc-top">
      <span class="avz" style="background:${D.COLORS[p.color]}">${initialsOf(p.name)}</span>
      <div class="pc-id">
        <div class="pc-name">${p.name}</div>
        <div class="pc-reason">${p.reason}</div>
      </div>
    </div>`;
  if(inLeft){
    inner += `<div class="pc-foot">
      <span class="loc span-txt" style="margin-left:0">${p.span}</span>
      <span class="tpill onleft">${I.clock}${p.dur}m</span>
    </div>`;
  }else{
    inner += `<div class="pc-foot">
      <span class="loc">${['bay','kiosk','walk'].includes(p.loc.icon)?I.dash:''}<span>${p.loc.label}</span></span>
      ${p.team?`<span class="team-tag">${p.team}</span>`:''}
      <span class="tpill ${tc}">${I.clock}${p.wait}m</span>
    </div>`;
    if(p.note){
      inner += `<div class="note ${p.note.kind==='coach'?'coach':''}">${I.info}${p.note.text.replace('\n','<br>')}</div>`;
    }
  }
  if(p.invoice){
    inner += `<div class="card-actions" data-nodrag>
      <button class="invoice-btn ${p.invoice.paid?'paid':''}" data-invoice="${p.id}">${p.invoice.paid?I.check+' Paid · thanks!':'Invoice $'+p.invoice.amount}</button></div>`;
  }
  if(p.action && !p.action.done){
    const lab=p.action.pending?'Lab notified · waiting…':p.action.label;
    inner += `<div class="card-actions" data-nodrag>
      <button class="follow-btn ${p.action.pending?'pending':''}" data-lab="${p.id}">${lab}</button></div>`;
  }
  return `<article class="pcard ${inLeft?'left':''}" data-k="${p.id}" draggable="false">${inner}</article>`;
}

function colHTML(st, cards, liveBadge){
  const body = cards.length
    ? cards.map(cardHTML).join('')
    : `<div class="col-empty">No patients here</div>`;
  return `
  <section class="col ${st.green?'green':''}" data-stage="${st.id}">
    <header class="col-head">
      <span class="col-title">${st.label}</span>
      <span class="col-bubble" data-badge>${liveBadge}</span>
      <span class="col-meta" data-meta>${st.meta}${st.id==='left' && S.dirty? ' · '+liveStats().d2d+'m':''}</span>
    </header>
    <div class="col-body" data-dropzone="${st.id}">
      ${st.green?leftSummaryHTML():''}
      ${body}
      <button class="addpatient" data-add="${st.id}" data-nodrag>+Add Patient</button>
    </div>
  </section>`;
}
function leftSummaryHTML(){
  const v = S.dirty? liveStats() : null;
  const billed=v? v.billed:SHOT.billed, coll=v? v.collected:SHOT.collected, ins=v? v.insurance:SHOT.insurance, pct=v? v.same:SHOT.sameRate;
  return `<div class="sumcard" data-k="__sum" data-nodrag style="cursor:default">
    <h4>Today so far</h4>
    <div class="sumrow"><span class="l">Billed</span><span class="v" id="sumBilled">$${billed.toLocaleString()}</span></div>
    <div class="sumrow"><span class="l">Collected at desk</span><span class="v" id="sumColl">$${coll.toLocaleString()}</span></div>
    <div class="sumrow"><span class="l">To insurance</span><span class="v" id="sumIns">$${ins.toLocaleString()}</span></div>
    <div class="prog-track"><span class="prog-fill" style="width:${pct}%"></span></div>
    <div class="prog-cap" id="sumCap">${pct}% collected same-day</div>
  </div>`;
}

function renderBoard(){
  const vis = visibleByStage();
  const ls = liveStats();
  const host = $('#viewHost .flow'); if(!host) return;

  /* stats bar values */
  const elC=$('#stClinic'), elW=$('#stWaitNum'), elO=$('#stOver'), elR=$('#stRooms');
  if(!S.dirty){
    if(!S._statInit){
      S._statInit=true;
      elC.textContent=SHOT.statPatients; elC._val=SHOT.statPatients;
      elW.textContent=SHOT.statWait;     elW._val=parseFloat(SHOT.statWait);
      elO.textContent=SHOT.statOver;     elO._val=SHOT.statOver;
      elR.textContent=SHOT.roomsFree;    elR._val=SHOT.roomsFree;
    }
  }else{
    tween(elC,ls.clinic);
    $('#stWaitNum').textContent=ls.avg+'min'; elW._val=ls.avg;
    tween(elO,ls.over);
    tween(elR,Math.max(0,D.__roomsFree ?? SHOT.roomsFree));
    $('#badgeOver').textContent = ls.over? ls.over+' breaching':'On target';
    $('#badgeOver').classList.toggle('red', ls.over>0);
    $('#badgeWait').textContent = ls.avg<=12?'On target':(ls.avg<=18?'Watch':'Behind');
  }

  /* showing note */
  $('#showingNote').textContent = S.dirty
    ? `Showing ${Object.values(vis).reduce((a,b)=>a+b.length,0)} of ${P().length} patients`
    : SHOT.showing;

  /* quick pill counts */
  if(S.dirty){
    const f={breaching:0,blocked:0,nodoc:0,newpt:0,interp:0};
    P().filter(p=>p.stage!=='left').forEach(p=>{const fl=flagsOf(p);
      if(fl.breach)f.breaching++;if(fl.blocked)f.blocked++;if(fl.nodoc)f.nodoc++;
      if(fl.newpt)f.newpt++;if(fl.interp)f.interp++;});
    $('#qc-breaching').textContent=f.breaching; $('#qc-blocked').textContent=f.blocked;
    $('#qc-nodoc').textContent=f.nodoc; $('#qc-newpt').textContent=f.newpt; $('#qc-interp').textContent=f.interp;
  }

  /* columns */
  const board=$('#theBoard');
  if(board) ORDER.forEach(st=>{
    const zone=board.querySelector(`[data-dropzone="${st}"]`);
    if(zone){
      withFLIP(`[data-dropzone="${st}"]`, ()=>{
        const badge = S.dirty ? vis[st].length : STG[st].badge;
        const sec=board.querySelector(`[data-stage="${st}"]`);
        sec.querySelector('[data-badge]').textContent=badge;
        sec.querySelector('[data-meta]').textContent = STG[st].meta + (st==='left'&&S.dirty? ' · '+liveStats().d2d+'m':'');
        const empty=zone.querySelector('.col-empty'); if(empty)empty.remove();
        const addBtn=zone.querySelector('.addpatient');
        // replace cards in one pass (FLIP animates movers; new keys fade in)
        zone.querySelectorAll('.pcard').forEach(c=>c.remove());
        const frag=document.createElement('div');
        frag.innerHTML=cardsIn(vis,st);
        [...frag.children].forEach(c=>zone.insertBefore(c,addBtn));
      });
    }
  });

  /* left summary */
  if($('#sumBilled')){
    const v = S.dirty? [ls.billed,ls.collected,ls.insurance] : [SHOT.billed,SHOT.collected,SHOT.insurance];
    tween($('#sumBilled'),v[0],{money:true,prefix:'$'});
    tween($('#sumColl'),v[1],{money:true,prefix:'$'});
    tween($('#sumIns'),v[2],{money:true,prefix:'$'});
    const pct=S.dirty? ls.same: SHOT.sameRate;
    $('.prog-fill').style.width=pct+'%';
    $('#sumCap').textContent=pct+'% collected same-day';
  }
}
function cardsIn(vis,id){ return vis[id].map(cardHTML).join(''); }

function buildFlowShell(){
  const shots=D.STAGES;
  return `
  <div class="flow">
    <div class="stats-bar">
      ${statCell('clinic','In the clinic now','20','patients','stClinic','suClinic',I.drop,'+31%','badgePlus')}
      ${statCell('wait','Avg wait right now','','','',null,I.history,'On target','badgeWait','12min','stWaitNum')}
      ${statCell('over','Waiting over 20 min','2','','stOver',null,I.clocks,'breach','badgeOver')}
      ${statCell('rooms','Rooms free','4','of 203','stRooms',null,I.heart)}
    </div>

    <div class="flow-toolbar">
      <div class="chip-row">
        ${['everyone:Everyone','mine:My patients','floor:My floor','frontdesk:Front desk'].map(s=>{const[v,l]=s.split(':');
          return `<button class="chip scope-chip ${S.scope===v&&v!=='everyone'?'on':''}" data-scope="${v}">${l}</button>`}).join('')}
        <span class="chip-sep"></span>
        <button class="chip menu-chip" data-menu="doctor">Doctor ${S.doctor==='all'?'All':({chen:'· Dr. Chen',patel:'· Dr. Patel',none:'· Unassigned'})[S.doctor]}</button>
        <button class="chip menu-chip" data-menu="area">Area ${S.area==='all'?'All':({bays:'· Bay wing',east:'· East',west:'· West'})[S.area]}</button>
        <button class="chip ${S.sortWait?'on':''}" data-sortwait>Sort Longest wait</button>

        <label class="findbox">${I.search}<input id="findPt" placeholder="Find patient" value=""></label>
        <button class="chip" data-pop="filters">Filters ${I.filter.replace('<svg','<svg class="chev" style="width:16px;height:16px;margin-right:-4px;color:#77766F"')}</button>
      </div>
      <div class="chip-row">
        ${[['breaching','Breaching target'],['blocked','Blocked on something'],['nodoc','No doctor assigned'],['newpt','New patients'],['interp','Needs interpreter']]
          .map(([k,l])=>`<button class="chip q-chip ${quickOn(k)?'on':''}" data-quick="${k}">${l} <i class="qcount" id="qc-${k}">${SHOT.quickCounts[k]}</i></button>`).join('')}
        <span class="showing-note" id="showingNote">${SHOT.showing}</span>
      </div>
    </div>

    <div class="board-scroll"><div class="board" id="theBoard">
      ${shots.map(st=>{
        const vis={};ORDER.forEach(o=>vis[o]=P().filter(p=>passesFilters(p)&&p.stage===o));
        return colHTML(st,vis[st.id],S.dirty?vis[st.id].length:st.badge);
      }).join('')}
    </div></div>
  </div>`;
}
function statCell(key,label,num,unit,id,suId,icon,badgeTxt,badgeId,numHTML,valId){
  return `
  <div class="stat-cell">
    <span class="sq-icon">${icon}</span>
    <div class="stat-txt">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${numHTML?`<span id="${valId}">${numHTML}</span>`
        :`<span id="${id}">0</span>${unit?`<span class="stat-unit" ${suId?`id="${suId}"`:''}>${unit}</span>`:''}`}
      </div>
    </div>
    ${badgeTxt?`<span class="stat-badge ${badgeTxt==='breach'?'red':''}" ${badgeId?`id="${badgeId}"`:''}>${badgeTxt}</span>`:''}
  </div>`;
}

/* ───────────────────── flow interactions ────────────────────── */
function wireFlow(){
  const host=$('#viewHost');

  /* wait-time ticking visual refresh (cheap textual patch) */
  host.addEventListener('pointercancel',()=>{},true);

  host.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{MARK_DIRTY();
    S.scope=b.dataset.scope;refreshChips();renderBoard();});
  host.querySelector('[data-sortwait]').onclick=e=>{MARK_DIRTY();S.sortWait=!S.sortWait;
    e.currentTarget.classList.toggle('on',S.sortWait);renderBoard();};
  host.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{MARK_DIRTY();
    S._quickTouched=true;
    S.quick=S.quick===b.dataset.quick?null:b.dataset.quick;refreshQuick();renderBoard();});

  const fp=$('#findPt');
  fp.oninput=()=>{MARK_DIRTY();S.find=fp.value;clearTimeout(fp._d);fp._d=setTimeout(renderBoard,110);};

  host.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>openAddModal(b.dataset.add));

  host.querySelectorAll('[data-menu]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    if(b.dataset.menu==='doctor')
      openMenuAt(b,[['all','Doctor All'],['chen','Dr. Chen'],['patel','Dr. Patel'],['none','Unassigned']],v=>{MARK_DIRTY();S.doctor=v;rerenderFlowToolbar();renderBoard();});
    else
      openMenuAt(b,[['all','Area All'],['bays','Bay wing'],['east','East rooms'],['west','West rooms']],v=>{MARK_DIRTY();S.area=v;rerenderFlowToolbar();renderBoard();});
  });

  /* delegated inside board */
  $('#theBoard').addEventListener('click',e=>{
    const inv=e.target.closest('[data-invoice]');
    if(inv){payInvoice(inv.dataset.invoice,inv);return;}
    const lb=e.target.closest('[data-lab]');
    if(lb){notifyLab(lb.dataset.lab,lb);return;}
    const card=e.target.closest('.pcard');
    if(card && !e.target.closest('[data-nodrag]')) openDrawer(card.dataset.k);
  });

  $('#theBoard').addEventListener('pointerdown',onCardPointerDown);

  const fb=$('[data-pop="filters"]');
  if(fb) fb.onclick=e=>{e.stopPropagation();openFiltersPop(fb);};

  renderBoard();
}
function rerenderFlowToolbar(){
  const tb=$('#viewHost .flow-toolbar');
  if(!tb)return;
  const chipRow=tb.children[0];
  chipRow.innerHTML=`${['everyone:Everyone','mine:My patients','floor:My floor','frontdesk:Front desk'].map(s=>{const[v,l]=s.split(':');
    return `<button class="chip scope-chip ${S.scope===v&&v!=='everyone'?'on':''}" data-scope="${v}">${l}</button>`}).join('')}
  <span class="chip-sep"></span>
  <button class="chip menu-chip" data-menu="doctor">Doctor ${S.doctor==='all'?'All':({chen:'· Dr. Chen',patel:'· Dr. Patel',none:'· Unassigned'})[S.doctor]}</button>
  <button class="chip menu-chip" data-menu="area">Area ${S.area==='all'?'All':({bays:'· Bay wing',east:'· East',west:'· West'})[S.area]}</button>
  <button class="chip ${S.sortWait?'on':''}" data-sortwait>Sort Longest wait</button>
  <label class="findbox">${I.search}<input id="findPt" placeholder="Find patient" value="${S.find.replace(/"/g,'')}"></label>
  <button class="chip" data-pop="filters">Filters ${I.filter.replace('<svg','<svg class="chev" style="width:16px;height:16px;margin-right:-4px;color:#77766F"')}</button>`;
  wireFlow();
}
function refreshChips(){ $$('[data-scope]').forEach(b=>b.classList.toggle('on',b.dataset.scope===S.scope&&b.dataset.scope!=='everyone')); }
function quickOn(k){ return S.quick===k || (k==='breaching' && !S.quick && !S._quickTouched && !S.dirty); }
function refreshQuick(){ $$('[data-quick]').forEach(b=>b.classList.toggle('on',quickOn(b.dataset.quick))); }

/* invoice / lab buttons */
function payInvoice(pid,btn){
  MARK_DIRTY();
  const p=byId(pid); p.invoice.paid=true;
  D.__collected=(D.__collected??SHOT.collected)+p.invoice.amount;
  addHistory(pid,'Invoice $'+p.invoice.amount+' collected');
  logFeed('Payment collected',`${p.name} — invoice $${p.invoice.amount} settled at desk.`);
  toast(`${p.name}'s invoice $${p.invoice.amount} paid`);
  renderBoard();
}
function notifyLab(pid,btn){
  const p=byId(pid);
  p.action.pending=true;
  btn.innerHTML='Lab notified · waiting…'; btn.disabled=true; btn.style.pointerEvents='none';
  setTimeout(()=>{
    releaseLabFor(pid,true);
  },2600);
  logFeed('Lab pinged',`Requested release for ${p.name}.`);
  toast(`Lab desk notified about ${p.name}`);
}

/* ─────────────────────── drag & drop ────────────────────────── */
const drag = {active:false,pid:null,ghost:null,x:0,y:0,ox:0,oy:0,slot:null,fromEl:null,moved:false,started:false,pid2:null,sx:0,sy:0,offX:0,offY:0};

function onCardPointerDown(e){
  const card=e.target.closest('.pcard'); if(!card) return;
  if(e.button!==0 || e.target.closest('[data-nodrag]')) return;
  const id=card.dataset.k;
  drag.pid=id; drag.started=true; drag.moved=false;
  drag.sx=e.clientX; drag.sy=e.clientY;
  const r=card.getBoundingClientRect();
  drag.offX=e.clientX-r.left; drag.offY=e.clientY-r.top;
  const move=ev=>{
    if(!drag.started) return;
    if(!drag.moved && Math.hypot(ev.clientX-drag.sx,ev.clientY-drag.sy)>7) startDrag(ev);
    if(drag.active) moveDrag(ev);
  };
  const up=ev=>{
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',up);
    if(drag.active) endDrag(ev); else {drag.started=false;}
    if(!drag.active && !drag.moved && ev.type==='pointerup'){ /* click — handled by click handler */ }
  };
  window.addEventListener('pointermove',move,{passive:true});
  window.addEventListener('pointerup',up);
}
function startDrag(e){
  MARK_DIRTY();
  drag.active=true; drag.moved=true;
  const src=$(`.pcard[data-k="${drag.pid}"]`);
  drag.fromEl=src; drag.stage0=byId(drag.pid).stage;
  const g=$('#dragGhost');
  g.innerHTML=src.outerHTML;
  g.hidden=false;
  g.firstElementChild.classList.add('flash-off');
  drag.ghost=g.firstElementChild;
  document.body.style.cursor='grabbing';
  moveDrag(e);
}
function moveDrag(e){
  const g=$('#dragGhost');
  g.style.left=(e.clientX-drag.offX)+'px';
  g.style.top =(e.clientY-drag.offY)+'px';
  g.firstElementChild.style.width=drag.fromEl.getBoundingClientRect().width+'px';
  /* find drop column + slot position */
  const cols=$$('#theBoard .col');
  let targetCol=null;
  for(const c of cols){
    const r=c.getBoundingClientRect();
    if(e.clientX>=r.left-8&&e.clientX<=r.right+8) targetCol=c;
  }
  cols.forEach(c=>c.classList.toggle('drag-over',c===targetCol));
  drag.col=targetCol?targetCol.dataset.stage:null;
  /* insertion slot */
  const zone=targetCol?.querySelector('[data-dropzone]');
  if(!zone){return;}
  const cards=[...zone.querySelectorAll('.pcard:not(.dragging-src)')];
  let refEl=null;
  for(const c of cards){
    const r=c.getBoundingClientRect();
    if(e.clientY < r.top+r.height/2){refEl=c;break;}
  }
  let slot=zone.querySelector('.drop-slot');
  if(!slot){slot=document.createElement('div');slot.className='drop-slot';zone.insertBefore(slot,refEl||zone.querySelector('.addpatient'));}
  slot.style.height=(drag.fromEl.getBoundingClientRect().height)+'px';
  zone.insertBefore(slot,refEl||zone.querySelector('.addpatient'));
  drag.slotInto=refEl;
}
function endDrag(){
  $('#dragGhost').hidden=true; $('#dragGhost').innerHTML='';
  document.body.style.cursor='';
  $$('#theBoard .col').forEach(c=>c.classList.remove('drag-over'));
  const dst=drag.col||drag.stage0;
  const p=byId(drag.pid);
  const slot=$$('.drop-slot')[0];
  let idx=-1;
  if(slot&&slot.parentElement){
    const zone=slot.parentElement;
    idx=[...zone.querySelectorAll('.pcard')].indexOf(drag.slotInto);
    slot.remove();
  }
  const changed = dst!==drag.stage0;
  if(changed) moveToStage(p,dst,idx,{viaDrag:true});
  else renderBoard();
  drag.active=false; drag.started=false;
  if(changed){
    setTimeout(()=>{const c=$(`.pcard[data-k="${p.id}"]`); c&&c.classList.add('flash');
      setTimeout(()=>c&&c.classList.remove('flash'),950);},80);
  }
}
function moveToStage(p,dst,idx,{viaDrag=false}={}){
  const from=p.stage;
  p.stage=dst;
  if(dst==='left'){
    const now=new Date();
    const pad=n=>String(n).padStart(2,'0');
    const t0=new Date(now-(p.wait+18)*60000);
    p.span=`${pad(t0.getHours())}:${pad(t0.getMinutes())} to ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    p.dur=clamp(Math.round((now-t0)/60000),10,90);
    delete p.note;
  }
  if(from==='treatment'&&dst!=='treatment') D.__roomsFree=(D.__roomsFree??SHOT.roomsFree)+0; /* occupied accounted once entered */
  if(dst==='treatment'&&from!=='treatment') D.__roomsFree=Math.max(0,(D.__roomsFree??SHOT.roomsFree)-1);
  addHistory(p.id,`Moved ${STG[from].label} → ${STG[dst].label}`);
  if(viaDrag) logFeed('Stage moved',`${p.name} → ${STG[dst].label}`);
  renderBoard();
}
function addHistory(pid,label){
  (S.history[pid]=S.history[pid]||[]).push({
    t:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
    label});
}

/* ───────────────────── overlays: menus/popovers ──────────────── */
let popLayer;
function closePop(){ if(popLayer){popLayer.hidden=true;popLayer.innerHTML='';popLayer=null;} }
document.addEventListener('click',closePop);
window.addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(popLayer){closePop();} } });

function mountPop(anchor,html,width){
  closePop();
  popLayer=$('#popLayer');
  popLayer.hidden=false;
  popLayer.innerHTML=`<div class="pop" style="width:${width||'auto'}px">${html}</div>`;
  const pop=popLayer.firstElementChild;
  const r=anchor.getBoundingClientRect();
  const pw=pop.offsetWidth||width||240;
  let left=r.right-pw; left=clamp(left,10,innerWidth-pw-10);
  let top=r.bottom+8; if(top+pop.offsetHeight>innerHeight-10) top=r.top-pop.offsetHeight-8;
  pop.style.left=left+'px'; pop.style.top=top+'px';
  pop.addEventListener('click',e=>e.stopPropagation());
  return pop;
}
function openMenuAt(anchor,options,onPick){
  const pop=mountPop(anchor,options.map(([v,l])=>`<button class="pop-item" data-v="${v}">${l}</button>`).join(''),206);
  pop.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{onPick(b.dataset.v);closePop();});
}
function openFiltersPop(anchor){
  const mk=(k,l,on)=>`<div class="f-check ${on?'checked':''}" data-fx="${k}">
    <span class="f-box">${I.check}</span>${l}${k==='live'
      ?`<span class="f-toggle ${S.live?'on':''}" data-live></span>`:''}</div>`;
  const pop=mountPop(anchor,`
    <div class="pop-label">Refine board</div>
    ${mk('interp','Needs interpreter',S.fx.interp)}
    ${mk('breaching','Breaching target only',S.fx.breaching)}
    ${mk('nodoc','No doctor assigned',S.fx.nodoc)}
    <div class="pop-sep"></div>
    <div class="pop-label">Experience</div>
    ${mk('live','Live simulation',S.live)}
    ${mk('compact','Compact density',document.body.classList.contains('compact'))}
  `,290);
  pop.querySelectorAll('[data-fx]').forEach(row=>row.onclick=()=>{
    MARK_DIRTY();
    const k=row.dataset.fx;
    if(k==='compact'){document.body.classList.toggle('compact');row.classList.toggle('checked');return;}
    if(k==='live'){S.live=!S.live;row.querySelector('.f-toggle').classList.toggle('on',S.live);row.classList.toggle('checked',S.live);
      toast(S.live?'Live simulation on':'Live simulation paused','info');return;}
    S.fx[k]=!S.fx[k]; row.classList.toggle('checked',S.fx[k]); renderBoard();
  });
}

/* bell feed */
function openBell(anchor){
  const rows=S.feed.map((n,i)=>`
    <div class="notif-item ${n.unread?'unread':''}" data-i="${i}">
      <span class="notif-dot"></span>
      <div class="notif-body"><div class="notif-title">${n.title}</div><div class="notif-sub">${n.sub}</div></div>
      <span class="notif-time">${n.time}</span>
    </div>`).join('');
  const pop=mountPop(anchor,`
    <div style="display:flex;align-items:center;padding:8px 12px 6px">
      <b style="font-size:14px">Notifications</b>
      <button class="pop-item" data-all style="margin-left:auto;height:30px;width:auto;font-size:12px;color:#4E9A22">Mark all read</button>
    </div><div class="pop-sep"></div>
    <div style="max-height:330px;overflow-y:auto;min-width:326px">${
      rows||'<div class="cmdk-none">Quiet for now 🌿</div>'}</div>`,352);
  pop.querySelector('[data-all]').onclick=()=>{S.feed.forEach(n=>n.unread=false);S.unread=0;$('#bellDot').hidden=true;closePop();};
  pop.querySelectorAll('[data-i]').forEach(el=>el.onclick=()=>{
    const n=S.feed[+el.dataset.i];
    n.unread=false; if(!S.feed.some(x=>x.unread)){$('#bellDot').hidden=true;S.unread=0;}
    closePop();
    if(n.pid){ go('patientflow'); setTimeout(()=>{const c=$(`.pcard[data-k="${n.pid}"]`);
      if(c){c.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
        c.classList.add('flash');setTimeout(()=>c.classList.remove('flash'),950);} },340); }
  });
}
function logFeed(title,sub,pid){ popFeed({title,sub,pid}); }

/* me / widget menus */
function openMeMenu(anchor){
  const pop=mountPop(anchor,`
    <div style="display:flex;gap:12px;align-items:center;padding:10px 12px 12px">
      <span class="mini-av" style="width:38px;height:38px;background:#F4602E;border-radius:50%">DS</span>
      <div><div style="font-weight:650;font-size:14px">Dana Shaw</div>
      <div style="font-size:12px;color:var(--t3)">Practice lead · Front desk</div></div>
    </div><div class="pop-sep"></div>
    <button class="pop-item" data-a="settings">${I.gear.replace('class=""','class="pi"')}Settings</button>
    <button class="pop-item danger" data-a="out">${I.out}Sign out</button>`,236);
  pop.querySelector('[data-a=settings]').onclick=()=>{go('settings');closePop();};
  pop.querySelector('[data-a=out]').onclick=()=>{toast('Signed out — see you soon 👋','info');closePop();};
}
function openWidgetPop(anchor){
  const items=[['clinic','In the clinic now'],['wait','Avg wait right now'],['over','Waiting over 20 min'],['rooms','Rooms free']];
  const pop=mountPop(anchor,`<div class="pop-label">Stats bar widgets</div>${
    items.map(([k,l])=>`<div class="f-check ${S.statCells.includes(k)?'checked':''}" data-w="${k}">
      <span class="f-box">${I.check}</span>${l}</div>`).join('')}`,270);
  pop.querySelectorAll('[data-w]').forEach(row=>row.onclick=()=>{
    const k=row.dataset.w;
    if(S.statCells.includes(k)){ if(S.statCells.length>1) S.statCells=S.statCells.filter(x=>x!==k);}
    else S.statCells.push(k);
    row.classList.toggle('checked',S.statCells.includes(k));
    const map={clinic:0,wait:1,over:2,rooms:3};
    $$('.stat-cell').forEach((c,i)=>c.style.display=S.statCells.some(m=>map[m]===i)?'':'none');
  });
}
function openNewMenu(anchor){
  const pop=mountPop(anchor,`
    <button class="pop-item" data-a="patient">${I.patient}New patient</button>
    <button class="pop-item" data-a="appt">${I.cal}New appointment</button>
    <button class="pop-item" data-a="msg">${I.msg}New message</button>
    <div class="pop-sep"></div>
    <button class="pop-item" data-a="ai">${I.spark}Ask Elera AI</button>`,232);
  pop.querySelector('[data-a=patient]').onclick=()=>{closePop();openAddModal('checkin');};
  pop.querySelector('[data-appt], [data-a=appt]').onclick=()=>{closePop();openApptModal();};
  pop.querySelector('[data-a=msg]').onclick=()=>{closePop();go('message');setTimeout(()=>$('#composerInput')?.focus(),420);};
  pop.querySelector('[data-a=ai]').onclick=()=>{closePop();go('eleraai');setTimeout(()=>$('#aiInput')?.focus(),420);};
}

/* ───────────────────── modals ───────────────────── */
function openModal(html){
  const layer=$('#modalLayer'), slot=$('#modalSlot');
  slot.innerHTML=`<div class="modal">${html}</div>`;
  layer.hidden=false; requestAnimationFrame(()=>layer.classList.add('open'));
  slot.querySelectorAll('[data-close-modal],[data-cancel]').forEach(b=>b.onclick=closeModal);
  const onKey=e=>{if(e.key==='Escape'){closeModal();window.removeEventListener('keydown',onKey);}};
  window.addEventListener('keydown',onKey);
  return slot;
}
function closeModal(){
  const layer=$('#modalLayer');
  layer.classList.remove('open');
  setTimeout(()=>{layer.hidden=true;$('#modalSlot').innerHTML='';},320);
}

function openAddModal(stage='checkin'){
  const bays=['Bay 1','Bay 2','Bay 3','Bay 4','Bay 5','Bay 6','Kiosk','Walk-in'];
  const reasons=['Coughing','Fever check','Sore throat','Rash, itching','Follow-up labs','Minor injury','Headache','Allergic reaction','Insurance verify','Chest pain eval'];
  const slot=openModal(`
    <div class="modal-head">${I.patient.replace('class=""','style="width:22px;height:22px;stroke-width:1.8;color:#3E8F2F"')}
      <div><div class="modal-title">Add patient</div>
      <div style="font-size:12.5px;color:var(--t3)">Straight onto the flow board</div></div>
      <button class="modal-x" data-close-modal>${I.x}</button></div>
    <div class="field"><label>Full name</label><input type="text" id="npName" placeholder="e.g. Jordan Blake" autofocus></div>
    <div class="field"><label>Reason for visit</label>
      <select id="npReason">${reasons.map(r=>`<option>${r}</option>`).join('')}</select></div>
    <div class="field"><label>Place into</label>
      <div class="seg" id="npSeg">
        ${ORDER.slice(0,4).map(s=>`<button class="seg-opt ${s===stage?'sel':''}" data-v="${s}">${STG[s].label}</button>`).join('')}
      </div></div>
    <div class="field" id="npLocField"><label>Location</label>
      <select id="npLoc">${bays.map(b=>`<option>${b}</option>`).join('')}</select>
      <div class="hint">Rooms are selected automatically once treatment starts.</div></div>
    <div class="modal-foot">
      <button class="btn ghost" data-cancel>Cancel</button>
      <button class="btn primary" id="npGo">${I.plus}Add to board</button>
    </div>`);
  const seg=slot.querySelector('#npSeg');
  let pick=stage;
  seg.querySelectorAll('.seg-opt').forEach(b=>b.onclick=()=>{
    seg.querySelectorAll('.seg-opt').forEach(x=>x.classList.remove('sel'));
    b.classList.add('sel'); pick=b.dataset.v;
    slot.querySelector('#npLocField').style.display=pick==='ready'||pick==='treatment'?'block':'block';
  });
  const submit=()=>{
    const name=slot.querySelector('#npName').value.trim();
    if(!name){ const f=slot.querySelector('#npName').closest('.field');
      f.classList.add('err'); slot.querySelector('#npName').focus();
      setTimeout(()=>f.classList.remove('err'),900); return; }
    MARK_DIRTY();
    const locLabel=slot.querySelector('#npLoc').value;
    const p={
      id:'n'+Date.now(), name, reason:slot.querySelector('#npReason').value,
      color:avColor(name), stage:pick,
      loc:/^Room/.test(locLabel)||pick==='ready'?{icon:'room',label:/^Room/.test(locLabel)?locLabel:'Room 8B'}
        :{icon:/^Bay/.test(locLabel)?'bay':/Kiosk/.test(locLabel)?'kiosk':'walk',label:locLabel},
      wait:0, flag:{new:true}, doctor:null,
    };
    D.patients.unshift(p);
    addHistory(p.id,'Checked in');
    logFeed('New patient',`${name} added to ${STG[pick].label}`,p.id);
    closeModal();
    if(S.route!=='patientflow') go('patientflow');
    setTimeout(()=>{ renderBoard();
      const c=$(`.pcard[data-k="${p.id}"]`);
      c&&c.classList.add('flash'); setTimeout(()=>c&&c.classList.remove('flash'),950);
    },40);
    toast(`${name} added to ${STG[pick].label}`);
  };
  slot.querySelector('#npGo').onclick=submit;
  slot.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
  setTimeout(()=>slot.querySelector('#npName').focus(),80);
}

function openApptModal(){
  const slot=openModal(`
    <div class="modal-head">${I.cal.replace('class=""','style="width:22px;height:22px;stroke-width:1.8;color:#3E8F2F"')}
      <div><div class="modal-title">New appointment</div></div>
      <button class="modal-x" data-close-modal>${I.x}</button></div>
    <div class="field"><label>Patient</label><select id="apWho">${P().map(p=>`<option>${p.name}</option>`).join('')}</select></div>
    <div class="field"><label>Type</label><select id="apType"><option>New</option><option>Follow-up</option><option>Procedure</option><option>Video</option></select></div>
    <div class="field"><label>Time</label><select id="apTime">${['11:30','12:00','12:35','13:00','14:00','15:00','16:00','17:00'].map(t=>`<option>${t}</option>`).join('')}</select></div>
    <div class="modal-foot">
      <button class="btn ghost" data-cancel>Cancel</button>
      <button class="btn primary" id="apGo">${I.plus}Add</button>
    </div>`);
  slot.querySelector('#apGo').onclick=()=>{
    D.appointments.push({time:slot.querySelector('#apTime').value,dur:30,
      patient:slot.querySelector('#apWho').value,type:slot.querySelector('#apType').value,
      who:'Dr. Patel',state:'later'});
    $('#countScheduling').textContent=D.appointments.length;
    logFeed('Appointment booked',`${slot.querySelector('#apWho').value} · ${slot.querySelector('#apTime').value}`);
    closeModal(); toast('Appointment added');
    if(S.route==='scheduling') renderRoute();
  };
}

/* ───────────────────── drawer ───────────────────── */
function openDrawer(pid){
  const p=byId(pid); if(!p) return;
  S.drawer=pid;
  if(!S.history[pid]) seedHistory(p);
  const dw=$('#drawer');
  dw.innerHTML=dwHTML(p);
  dw.hidden=false; $('#drawerBackdrop').hidden=false;
  requestAnimationFrame(()=>{dw.classList.add('open');$('#drawerBackdrop').classList.add('open');});
  const adv=dw.querySelector('[data-advance]');
  if(adv) adv.onclick=()=>advanceFromDrawer(p);
  const interp=dw.querySelector('[data-interp]');
  if(interp) interp.onclick=()=>{MARK_DIRTY();
    p.flag=p.flag||{};p.flag.interp=!p.flag.interp;
    toast(p.flag.interp?'Interpreter requested':'Interpreter cancelled','info');
    logFeed(p.flag.interp?'Interpreter requested':'Interpreter cancelled',`${p.name}`,pid);
    openDrawerRefresh();}
  const dep=dw.querySelector('[data-depart]');
  if(dep) dep.onclick=()=>{MARK_DIRTY();
    if(p.stage!=='left'){moveToStage(p,'left');logFeed('Discharged',`${p.name} left the clinic`,pid);}
    closeDrawer(); renderBoard();}
  dw.querySelector('[data-note-add]').onclick=()=>{
    const txt=dw.querySelector('#dwNote'); if(!txt.value.trim())return;
    (p.notesArr=p.notesArr||[]).push(txt.value.trim());
    txt.value=''; openDrawerRefresh(); toast('Note saved');
  };
}
function openDrawerRefresh(){ const dw=$('#drawer'); dw.classList.remove('open'); void dw.offsetWidth; openDrawer(S.drawer); }
function closeDrawer(){
  const dw=$('#drawer');
  dw.classList.remove('open'); $('#drawerBackdrop').classList.remove('open');
  setTimeout(()=>{dw.hidden=true;$('#drawerBackdrop').hidden=true;},480);
  S.drawer=null;
}
function seedHistory(p){
  const t=h=>{const d=new Date(Date.now()-h*3600000);
    return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});};
  const arr=[];const i=stageIdx(p.stage);
  if(p.stage==='left'){arr.push({t:t(4),label:'Checked in'},{t:t(2.5),label:'Triage completed'},{t:t(1.5),label:'Treatment finished'},{t:'—',label:`Left the clinic (${p.span})`});}
  else arr.push({t:t(3),label:'Checked in'});
  if(i>=1&&p.stage!=='left')arr.push({t:t(2),label:'Triage started'});
  if(i>=2&&p.stage!=='left')arr.push({t:t(1),label:`Placed in ${p.loc.label}`});
  if(i>=3&&p.stage!=='left')arr.push({t:t(.5),label:'Ready for discharge'});
  S.history[p.id]=arr;
}
function dwHTML(p){
  const stIdx=stageIdx(p.stage);
  const kv=[['Reason',p.reason],[p.stage==='left'?'Visit length':'Waiting',p.stage==='left'?p.dur+'m · '+p.span:p.wait+' min'],
    ['Location',p.stage==='left'?'—':p.loc.label],['Provider',p.doctor===null?'Unassigned':(p.doctor||'Front desk')],
    ['Age / Sex',p.demo||'34 · F'],['MRN','MRN-10'+(P().indexOf(p)+11)]];
  const f=flagsOf(p);
  return `
  <div class="dw-head">
    <span class="dw-av" style="background:${D.COLORS[p.color]}">${initialsOf(p.name)}</span>
    <div><div class="dw-title">${p.name}</div><div class="dw-sub">${STG[p.stage].label}${p.stage!=='left'?' · '+p.loc.label:''}</div></div>
    <button class="dw-close" onclick="this.dispatchEvent(new CustomEvent('x'))" data-x>${I.x}</button>
  </div>
  <div class="dw-body">
    ${(f.breach?'<span class="dw-flag" style="background:#FCD8D4;color:#B3301F">⏱ Breaching target</span>':'')+
     (f.blocked?`<span class="dw-flag" style="background:${'#FCF1DC'};color:#A2722B">Blocked · ${p.flag.blockedOn}</span>`:'')+
     (f.interp?'<span class="dw-flag" style="background:#E4F0FD;color:#3B71C4">🌐 Interpreter needed</span>':'')+
     (f.newpt?'<span class="dw-flag" style="background:#E4F4DA;color:#3F8E2E">New patient</span>':'')}
    <div class="dw-section"><h5>Journey</h5>
      <div class="stage-line">
        ${ORDER.map((s,i)=>{
          const visited=i<stIdx||(p.stage==='left'&&i===4)||(p.stage!=='left'&&i===stIdx);
          const cur=i===stIdx&&p.stage!=='left';
          const h=(S.history[p.id]||[])[Math.min(i,(S.history[p.id]||[]).length-1)];
          return `<div class="sl-step ${visited?'visited':''} ${cur?'current':''}">
            <span class="sl-dot"></span>
            <div><div class="sl-name">${STG[s].label}</div>
            <div class="sl-meta">${cur?(p.wait+' min in stage'):(visited&&(h&&h.t!=='—')?h.t+' · '+h.label:i>stIdx?'Upcoming':'Done')}</div></div>
          </div>`;}).join('')}
      </div>
    </div>
    <div class="dw-section"><h5>Details</h5>
      ${kv.map(([k,v])=>`<div class="dw-kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
    </div>
    <div class="dw-section"><h5>Care notes</h5>
      <textarea id="dwNote" placeholder="Add an internal note…" style="width:100%;min-height:64px;border-radius:12px;border:1px solid var(--line-strong);padding:10px 12px;font-size:13.5px;outline:none;resize:none;background:#fff"></textarea>
      <button class="btn ghost" style="margin-top:9px;height:36px;padding:0 14px;font-size:13px" data-note-add>Save note</button>
      ${(p.notesArr||[]).map(n=>`<div class="note" style="margin-top:9px">${I.info}${n}</div>`).join('')}
    </div>
  </div>
  <div class="dw-actions">
    ${p.stage!=='left'?`<button class="btn primary" data-advance>${I.right}Advance stage</button>`:''}
    ${p.stage!=='ready'&&p.stage!=='left'?`<button class="btn ghost" data-interp>🌐 Interpreter</button>`:''}
    ${p.stage!=='left'?`<button class="btn dark" data-depart>${I.out}Check out</button>`:''}
    ${p.stage==='left'?`<button class="btn ghost" onclick="void 0" disabled style="opacity:.55">Visit closed</button>`:''}
  </div>`;
}
function advanceFromDrawer(p){
  MARK_DIRTY();
  const i=stageIdx(p.stage);
  if(i>=4){closeDrawer();return;}
  moveToStage(p,ORDER[i+1]);
  openDrawerRefresh();
}

/* ───────────────── command palette (⌘K) ───────────────── */
const cmdk=$('#cmdk'), cmdkInput=$('#cmdkInput'), cmdkList=$('#cmdkList');
let cmdkSel=0, cmdkItems=[];
function cmdkBuild(q){
  const ql=q.trim().toLowerCase();
  const acts=[
    {ic:I.plus,t:'Add patient',d:'Create and place on the board',run:()=>openAddModal('checkin')},
    {ic:I.kanban,t:'Go to Patient Flow',d:'Live board',run:()=>go('patientflow')},
    {ic:I.spark,t:'Ask Elera AI',d:'Summarize the floor',run:()=>{go('eleraai');setTimeout(()=>aiAsk('Summarize the floor'),500);}},
    {ic:I.filter,t:S.live?'Pause live simulation':'Resume live simulation',d:'Simulation control',run:()=>{S.live=!S.live;toast(S.live?'Live on':'Live paused','info');}},
    {ic:I.msg,t:'Messages',d:'Care-team inbox',run:()=>go('message')},
    {ic:I.dollar,t:'Billing & Claims',d:'Collect payments',run:()=>go('billing')},
  ].filter(a=>!ql||a.t.toLowerCase().includes(ql));
  const pts=P().filter(p=>!ql||p.name.toLowerCase().includes(ql)||p.reason.toLowerCase().includes(ql)).slice(0,6)
    .map(p=>({ic:'',av:p,t:p.name,d:p.reason+' · '+STG[p.stage].label,run:()=>{go('patientflow');
      setTimeout(()=>{$(`.pcard[data-k="${p.id}"]`)?.scrollIntoView({behavior:'smooth',inline:'center'});
        const c=$(`.pcard[data-k="${p.id}"]`);c&&(c.classList.add('flash'),setTimeout(()=>c.classList.remove('flash'),950));},350)}}));
  cmdkItems=[...pts,...acts];
  cmdkSel=0;
  cmdkList.innerHTML=cmdkItems.length?
    (pts.length?`<div class="pop-label">Patients</div>`:'')+
    cmdkItems.map((it,i)=>it.av?
      `<div class="cmdk-item ${i===cmdkSel?'sel':''}" data-i="${i}">
        <span class="ck-ic mini-av" style="color:#fff;background:${D.COLORS[it.av.color]};border-radius:9px">${initialsOf(it.av.name)}</span>
        <div><div class="ck-t">${it.t}</div><div class="ck-d">${it.d}</div></div><kbd>↵</kbd></div>`
      :`<div class="cmdk-item ${i===cmdkSel?'sel':''}" data-i="${i}">
        <span class="ck-ic">${it.ic}</span>
        <div><div class="ck-t">${it.t}</div><div class="ck-d">${it.d}</div></div><kbd>↵</kbd></div>`
    ).join(''):
    '<div class="cmdk-none">Nothing found — try another name.</div>';
  cmdkList.querySelectorAll('.cmdk-item').forEach(el=>{
    el.onmouseenter=()=>{cmdkSel=+el.dataset.i;paintSel();};
    el.onclick=()=>cmdkRun();
  });
}
function paintSel(){cmdkList.querySelectorAll('.cmdk-item').forEach(el=>el.classList.toggle('sel',+el.dataset.i===cmdkSel));}
function cmdkRun(){const it=cmdkItems[cmdkSel];cmdkToggle(false);it&&setTimeout(it.run,60);}
function cmdkToggle(open){
  if(open){cmdk.hidden=false;requestAnimationFrame(()=>cmdk.classList.add('open'));cmdkInput.value='';cmdkBuild('');
    setTimeout(()=>cmdkInput.focus(),90);}
  else{cmdk.classList.remove('open');setTimeout(()=>cmdk.hidden=true,260);}
  closePop();
}
cmdkInput.addEventListener('input',()=>cmdkBuild(cmdkInput.value));
cmdkInput.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'){e.preventDefault();cmdkSel=Math.min(cmdkItems.length-1,cmdkSel+1);paintSel();scrollSel();}
  if(e.key==='ArrowUp'){e.preventDefault();cmdkSel=Math.max(0,cmdkSel-1);paintSel();scrollSel();}
  if(e.key==='Enter'){e.preventDefault();cmdkRun();}
  if(e.key==='Escape')cmdkToggle(false);
});
function scrollSel(){cmdkList.querySelector('.cmdk-item.sel')?.scrollIntoView({block:'nearest'});}
cmdk.addEventListener('click',e=>{if(e.target===cmdk)cmdkToggle(false);});
window.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();cmdk.hidden||!cmdk.classList.contains('open')?cmdkToggle(true):cmdkToggle(false);}
});

/* ───────────────────── routing / nav ───────────────────── */
const ROUTES={
  patientflow:{title:'Patient Flow',render:buildFlowShell,wire:wireFlow},
  dashboard  :{title:'Dashboard',render:vDash,wire:wireKPIs},
  scheduling :{title:'Scheduling',render:vSchedule,wire:wSchedule},
  message    :{title:'Message',render:vMsg,wire:wMsg},
  eleraai    :{title:'Elera AI',render:vAI,wire:wAI},
  patients   :{title:'Patients',render:vPatients,wire:wPatients},
  labs       :{title:'Pharmacy & Labs',render:vLabs,wire:wLabs},
  billing    :{title:'Billing & Claims',render:vBill,wire:wBill},
  reports    :{title:'Reports',render:vReports,wire:wireKPIs},
  staff      :{title:'Staff',render:vStaff,wire:wireKPIs},
  pro        :{title:'Pro',render:vPro,wire:()=>{wireKPIs();wPro();}},
  help       :{title:'Help',render:vHelp},
  settings   :{title:'Settings',render:vSettings,wire:wSettings},
};
function go(route){
  S.route=route;
  location.hash='/'+route;
  $$('#sideNav .nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===route));
  renderRoute(true);
}
function renderRoute(fresh){
  const r=ROUTES[S.route];
  $('#pageTitle').textContent=r.title;
  const host=$('#viewHost');
  if(S.drawer) closeDrawer();
  const paint=()=>{
    host.innerHTML=r.render();
    if(fresh&&!reduced){
      [...host.firstElementChild?.children||[]].forEach((el,i)=>{
        el.style.animation='view-in .5s var(--e-out) backwards';
        el.style.animationDelay=Math.min(i*45,300)+'ms';
      });
    }
    r.wire&&r.wire();
  };
  if(reduced){paint();return;}
  host.animate?host.animate([{opacity:1},{opacity:.4}],{duration:120,fill:'forwards'}).onfinish=()=>{
    paint();host.animate([{opacity:.4},{opacity:1}],{duration:180});
  }:paint();
}
window.addEventListener('hashchange',()=>{const h=location.hash.replace('#/','');if(ROUTES[h]&&h!==S.route){S.route=h;
  $$('#sideNav .nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===h));renderRoute(true);}});

$$('#sideNav .nav-item').forEach(b=>b.onclick=()=>go(b.dataset.nav));
const collapseBtn=$('#collapseBtn');
collapseBtn.onclick=()=>{document.body.classList.toggle('rail');
  try{localStorage.setItem(LS('rail'),document.body.classList.contains('rail')?'1':'');}catch(e){}
};
try{if(localStorage.getItem(LS('rail')))document.body.classList.add('rail');}catch(e){}

$('#globalSearch').addEventListener('input',e=>{
  S.find=e.target.value;
  if(S.route!=='patientflow'){go('patientflow');setTimeout(()=>{const f=$('#findPt');f&&(f.value=S.find);renderBoard();},60);}
  else{MARK_DIRTY();const f=$('#findPt');f&&(f.value=S.find);renderBoard();}
});
$('#bellBtn').onclick=e=>{e.stopPropagation();if(popLayer?.querySelector('.notif-item,.notif-title'))return closePop();openBell($('#bellBtn'));};
$('#meBtn').onclick=e=>{e.stopPropagation();popLayer?closePop():openMeMenu($('#meBtn'));};
$('#widgetBtn').onclick=e=>{e.stopPropagation();popLayer?closePop():openWidgetPop($('#widgetBtn'));};
$('#newBtn').onclick=e=>{e.stopPropagation();popLayer?closePop():openNewMenu($('#newBtn'));};
$('#drawerBackdrop').onclick=closeDrawer;
document.addEventListener('click',e=>{ if(!e.target.closest('.drawer') && S.route && S.drawer && !e.target.closest('.pcard') && !e.target.closest('.dw-actions')){} },true);

/* ═════════════════ SUB-PAGE VIEWS ═════════════════ */

/* —— Dashboard —— */
function vDash(){
  const ls=liveStats();
  const nextAp=D.appointments.filter(a=>a.state!=='done').slice(0,5);
  return `<div class="page"><div class="page-inner">
    <div class="page-greet"><h2>${greet()}, Dr. Shaw</h2><p>${todayStr()} · ${ls.clinic} patients on the floor right now · clinic runs smoothly.</p></div>
    <div class="kpis">
      ${kpi(I.drop,ls.clinic,'patients','In the clinic','+12%')}
      ${kpi(I.history,ls.avg,'min','Avg wait','−4%')}
      ${kpi(I.clock,ls.over,'waiting >20 m','Breaching','',ls.over>0)}
      ${kpi(I.heart,SHOT.roomsFree,'of 203','Rooms free','')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="dash-grid">
      <div class="panel"><h3>Arrivals today<span class="more" data-go-flow>Live board ${I.right}</span></h3>
        <div class="bars">${D.arrivals.map((a,i)=>`
          <div class="barcol"><div class="bar ${a.h==='11'?'now':''}" style="height:${(a.n/11*100)|0}%;animation-delay:${i*60}ms" title="${a.h}:00 — ${a.n} arrivals"></div><span class="bar-lab">${a.h}</span></div>`).join('')}
        </div></div>
      <div class="panel next-up"><h3>Coming up</h3>
        ${nextAp.map(a=>`<div class="nu-item"><span class="nu-time">${a.time}</span><span class="nu-name">${a.patient}</span><span class="nu-meta">${a.type} · ${a.who}</span></div>`).join('')}
        <button class="btn ghost" style="margin-top:12px;height:38px;font-size:13.5px;width:100%" data-navlink="scheduling">Full schedule</button>
      </div>
    </div>
    <div class="panel"><h3>Providers on shift</h3>
      <div class="staff-grid">${D.staff.filter(s=>s.on).map(staffCard).join('')}</div>
    </div>
  </div></div>`;
}
const greet=()=>{const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening';};
const todayStr=()=>new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
function kpi(icon,num,unit,label,trend,down,opts={}){
  const money=opts.money?'$':'';
  return `<div class="kpi"><span class="sq-icon">${icon}</span>
    <div class="stat-txt"><div class="stat-label">${label}</div>
    <div class="stat-value"><span class="kpinum" data-to="${num}" ${opts.money?'data-money="1"':''}>0</span><span class="stat-unit">${unit}</span></div></div>
    ${trend?`<span class="trend ${down?'down':''}">${trend}</span>`:''}</div>`;
}
function wireKPIs(){
  $$('[data-to]').forEach(el=>{
    const to=parseFloat(el.dataset.to)||0, money=el.dataset.money;
    el._val=null;
    tween(el,to,{money:!!money,prefix:money?'$':'',dur:900});
  });
}
function staffCard(s){
  return `<div class="staff-card">
    <span class="avz" style="width:44px;height:44px;border-radius:14px;background:${D.COLORS[s.color]}">${initialsOf(s.name)}</span>
    <div style="flex:1;min-width:0"><div class="pc-name">${s.name}</div>
      <div class="staff-role">${s.role}</div>
      <div class="staff-room"><span class="${s.on?'dot-on':'dot-off'}"></span>${s.room}</div>
      <div class="load-row"><div class="meter"><i style="width:${s.load/8*100}%;animation-delay:${s.load*60}ms"></i></div>${s.load}/8 assigned</div></div>
    <div class="staff-state"><span class="state-word">${s.on?'On shift':'Off'}</span></div>
  </div>`;
}

/* —— Scheduling —— */
function vSchedule(){
  const blocks=D.appointments.map((a,i)=>{
    const [h,m]=a.time.split(':').map(Number);
    const top=(h*60+m)-480;             // day grid starts 08:00
    const H=top*0.92;
    return {...a,top:H,h:i};
  });
  const maxEnd=Math.max(...blocks.map(b=>b.top+b.dur*0.92))+40;
  const hours=[];
  for(let m=0;m<=maxEnd;m+=60)hours.push(m);
  const now=new Date();const nm=now.getHours()*60+now.getMinutes()-480;
  return `<div class="page"><div class="page-inner" style="max-width:1080px">
    <div class="agenda-wrap">
      <div class="agenda">
        ${hours.map(h=>`<div class="ag-hour" style="top:${h*0.92+8}px"><span>${String(Math.floor(h/60)+8).padStart(2,'0')}:00</span></div>`).join('')}
        ${blocks.map(b=>{
          const cls={done:'state-done',now:'state-now',offer:'state-offer',open:'state-open'}[b.state]||'';
          const tt={'New':'at-new','Follow-up':'at-fu','Procedure':'at-proc','Video':'at-video','Walk-in':'at-open'}[b.type]||'at-fu';
          return `<div class="appt ${cls}" data-h="${b.h}" style="top:${b.top+8}px;height:${Math.max(34,b.dur*0.92-6)}px;animation-delay:${b.h*55}ms">
            <b>${b.patient}</b><span class="ap-type ${tt}">${b.type}</span><span class="ap-meta">${b.who} · ${b.time}</span></div>`;}).join('')}
        ${nm>0&&nm<maxEnd?`<div class="now-line" style="top:${nm*0.92+8}px"><i>${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}</i></div>`:''}
      </div>
      <div class="side-stack">
        <div class="panel"><h3>Today</h3>
          <div style="display:flex;gap:18px">
            ${[['Appointments',D.appointments.length],['New',D.appointments.filter(a=>a.type==='New').length],['Video',D.appointments.filter(a=>a.type==='Video').length]]
              .map(([l,v])=>`<div><div style="font-size:22px;font-weight:700;letter-spacing:-.02em">${v}</div><div style="font-size:11.5px;color:var(--t3)">${l}</div></div>`).join('')}
          </div>
          <button class="btn primary" style="margin-top:14px;width:100%" data-new-appt>${I.plus}New appointment</button>
        </div>
        <div class="panel"><h3>Video slots</h3>
          <div class="nu-item"><span class="nu-time">12:35</span><span class="nu-name">Dana M</span><span class="nu-meta">Offered</span></div>
          <div class="nu-item"><span class="nu-time">15:40</span><span class="nu-name">Open</span><span class="nu-meta">Book</span></div>
        </div>
      </div>
    </div></div></div>`;
}
function wSchedule(hostless){
  $('[data-new-appt]')?.addEventListener('click',openApptModal);
  $$('[data-navlink]').forEach(b=>b.onclick=()=>go(b.dataset.navlink));
  $$('[data-go-flow]').forEach(b=>b.onclick=()=>go('patientflow'));
  $$('.appt[data-h]').forEach(el=>el.onclick=()=>toast(`Appointment — ${D.appointments[+el.dataset.h].patient}`,'info'));
}

/* —— Messages —— */
function vMsg(){
  const cur=S.msgsOpen||D.threads[0].id;
  const t=D.threads.find(x=>x.id===cur);
  return `<div class="msg-grid">
    <div class="thread-list">
      ${D.threads.map(th=>`
        <div class="th-row ${th.id===cur?'sel':''}" data-th="${th.id}">
          <span class="avz" style="width:36px;height:36px;background:${D.COLORS[th.color]}">${initialsOf(th.from)}</span>
          <div style="flex:1;min-width:0">
            <div class="th-name">${th.from}<span class="th-time">${th.time}</span></div>
            <div class="th-prev">${th.preview}</div>
          </div>
          ${th.unread?'<span class="th-unread"></span>':''}
        </div>`).join('')}
    </div>
    <div class="chat-pane">
      <div class="chat-head">
        <span class="avz" style="width:40px;height:40px;border-radius:12px;background:${D.COLORS[t.color]}">${initialsOf(t.from)}</span>
        <div><div style="font-weight:700;font-size:15px">${t.from}</div>
        <div style="font-size:12px;color:var(--t3)">usually replies in a few minutes</div></div>
      </div>
      <div class="chat-body" id="chatBody">
        ${t.msgs.map(([who,txt,tm])=>bubble(who,txt,tm)).join('')}
      </div>
      <div class="composer">
        <input id="composerInput" placeholder="Write a message…">
        <button class="send-btn" id="sendBtn">${I.send}</button>
      </div>
    </div></div>`;
}
const bubble=(who,txt,tm)=>`<div class="bubble ${who==='me'?'me':'them'}">${txt}<span>${tm}</span></div>`;
function wMsg(){
  S.msgsOpen||(S.msgsOpen=D.threads[0].id);
  $$('.th-row').forEach(r=>r.onclick=()=>{S.msgsOpen=r.dataset.th;
    const th=D.threads.find(x=>x.id===S.msgsOpen);th.unread=0;renderRoute();});
  const input=$('#composerInput'),body=$('#chatBody');
  const send=()=>{
    const v=input.value.trim(); if(!v)return;
    const t=D.threads.find(x=>x.id===S.msgsOpen);
    const tm=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    t.msgs.push(['me',v,tm]);
    body.insertAdjacentHTML('beforeend',bubble('me',v,tm));
    input.value=''; body.scrollTop=body.scrollHeight;
    setTimeout(()=>{ /* canned reply */
      body.insertAdjacentHTML('beforeend','<div class="typing" id="typingDots"><i></i><i></i><i></i></div>');
      body.scrollTop=body.scrollHeight;
      setTimeout(()=>{$('#typingDots')?.remove();
        const reply=t.id==='t2'?'On it — will ping you the moment they\'re out.':
                    t.id==='t1'?'Great, updating Dana\'s plan now.':'Got it 👍';
        t.msgs.push(['them',reply,new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})]);
        body.insertAdjacentHTML('beforeend',bubble('them',reply,'now'));
        body.scrollTop=body.scrollHeight;},1500);
    },900);
  };
  $('#sendBtn').onclick=send;
  input.onkeydown=e=>{if(e.key==='Enter')send();};
  body.scrollTop=body.scrollHeight;
}

/* —— Elera AI —— */
function vAI(){
  return `<div class="ai-wrap"><div class="ai-col ${S.aiLog.length?'':'empty'}">
    ${S.aiLog.length?'':'<div class="ai-hero"><div class="ai-orb"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><circle cx="9.1" cy="10.4" r=".9" fill="#fff" stroke="none"/><circle cx="14.9" cy="10.4" r=".9" fill="#fff" stroke="none"/><path d="M8.6 13.7a4.4 4.4 0 0 0 6.8 0"/></svg></div>'
      +'<h2>Hi, I\'m Elera AI</h2><p>I can read your live floor and answer instantly — ask anything, or try a suggestion below.</p></div>'}
    <div class="ai-msgs" id="aiMsgs">${S.aiLog.map(m=>aiBubble(m.role,m.text)).join('')}</div>
    <div class="ai-chips">
      ${['Summarize the floor','Who can discharge now?','What is running late?','Draft an update for Dr. Chen']
        .map(c=>`<button class="ai-chip" data-suggest="${c}">${c}</button>`).join('')}
    </div>
    <div class="composer" style="padding:0">
      <input id="aiInput" placeholder="Ask Elera AI about the live floor…">
      <button class="send-btn" id="aiSend">${I.send}</button>
    </div>
  </div></div>`;
}
const aiBubble=(role,text)=>`<div class="ai-bubble ${role==='user'?'user':'bot'}">${role==='bot'?mdInline(text):text}</div>`;
function aiScroll(){const m=$('#aiMsgs');m&&(m.scrollTop=m.scrollHeight);}
function aiAsk(q){
  const msgs=$('#aiMsgs');const hero=$('.ai-hero');hero&&hero.remove();
  S.aiLog.push({role:'user',text:q});
  msgs.insertAdjacentHTML('beforeend',aiBubble('user',q));aiScroll();
  const dots='<div class="typing" id="aiTyping"><i></i><i></i><i></i></div>';
  setTimeout(()=>{
    msgs.insertAdjacentHTML('beforeend',dots);aiScroll();
    setTimeout(()=>{$('#aiTyping')?.remove();
      const ans=aiAnswer(q);
      S.aiLog.push({role:'bot',text:ans});
      const el=document.createElement('div');
      el.className='ai-bubble bot';msgs.appendChild(el);
      typewrite(el,ans);
    },1000);
  },400);
}
function typewrite(el,text){
  if(reduced){el.innerHTML=mdInline(text);aiScroll();return;}
  const segs=[];text.split(/(\*\*[^*]+\*\*)/g).forEach(part=>{
    if(!part)return;
    segs.push({b:part.startsWith('**'),txt:part.replace(/\*\*/g,'')});
  });
  let si=0,ci=0,cur=null;
  const step=()=>{
    if(si>=segs.length){aiScroll();return;}
    if(!cur){
      cur=segs[si].b?document.createElement('b'):document.createTextNode('');
      el.appendChild(cur);
    }
    ci+=2;
    cur.textContent=segs[si].txt.slice(0,ci);
    aiScroll();
    if(ci>=segs[si].txt.length){si++;ci=0;cur=null;}
    setTimeout(step,11);
  };
  step();
}
const mdInline=t=>t.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
function aiAnswer(q){
  const ql=q.toLowerCase();const ls=liveStats();
  const over=P().filter(p=>p.stage!=='left'&&isOver(p));
  const ready=P().filter(p=>p.stage==='ready');
  const blocked=P().filter(p=>p.flag?.blockedOn&&p.stage!=='left');
  if(ql.includes('discharge'))return ready.length?
    `These patients are **ready to discharge** right now:\n\n`+ready.map(p=>`• ${p.name} — ${p.loc.label}, waiting ${p.wait}m${p.invoice&&!p.invoice.paid?` · ⚠️ invoice $${p.invoice.amount} unpaid`:''}`).join('\n')+
    `\n\nSuggested order: settle invoices first (“bill first” rule), then walk them out.`:
    `Nobody is queued in *Ready to D/C* at the moment — the board is clear.`;
  if(ql.includes('late')||ql.includes('behind')||ql.includes('overdue')){
    return over.length?`${over.length} patient${over.length>1?'s are':' is'} past target:\n\n`+
      over.map(p=>`• ${p.name} — ${p.wait}m in ${STG[p.stage].label} (target ${STG[p.stage].target}m)`).join('\n')+
      (ql.includes('dr.')||ql.includes('chen')?`\n\nWant me to offer Dr. Chen's 12:35 video slot to the longest waiter? That usually clears triage breaches fastest.`:''):
    `Nothing is breaching its target — average wait is **${ls.avg} min**, comfortably on plan. 🎯`;
  }
  if(ql.includes('draft')||ql.includes('update')){
    return `Here's a quick update for Dr. Chen:\n\n“Floor check — ${ls.clinic} in clinic, avg wait ${ls.avg}m. `+
      (over.length?`${over.length} breaching: ${over.map(p=>p.name.split(' ')[0]+' ('+p.wait+'m)').join(', ')}. `:`No breaches. `)+
      (ready.length?`${ready.length} ready for D/C; ${ready.filter(p=>p.invoice&&!p.invoice.paid).length} awaiting payment. `:'')+
      (blocked.length?`Still blocked on labs: ${blocked.map(p=>p.name).join(', ')}.`:'')+'”\n\nSend via Message?';
  }
  if(ql.includes('collect')||ql.includes('money')||ql.includes('bill'))
    return `Today so far: billed **$${(D.__billed??1284).toLocaleString()}** · collected at desk **$${(D.__collected??960).toLocaleString()}** (${liveStats().same}% same-day) · $${(D.__insurance??324).toLocaleString()} routed to insurance.\n\nOutstanding at desk: ${ready.filter(p=>p.invoice&&!p.invoice.paid).map(p=>`${p.name} ($${p.invoice.amount})`).join(', ')||'nothing 🎉'}`;
  return `Snapshot of the floor:\n• **${ls.clinic}** patients in clinic · avg wait **${ls.avg} min**\n• **${ls.over}** waiting over target\n• **${ready.length}** ready to discharge · **${blocked.length}** blocked on labs\n\nTry: “Who can discharge now?” · “What is running late?” · “How's collection going?”`;
}
function wAI(){
  $('#aiSend').onclick=()=>{const v=$('#aiInput').value.trim();if(v){$('#aiInput').value='';aiAsk(v);}};
  $('#aiInput').onkeydown=e=>{if(e.key==='Enter')$('#aiSend').click();};
  $$('[data-suggest]').forEach(b=>b.onclick=()=>aiAsk(b.dataset.suggest));
}

/* —— Patients table —— */
let ptSort={key:'name',dir:1}, ptQuery='', ptStage='all';
function vPatients(){
  const demo={p01:'29 · F',p02:'41 · M',p03:'23 · F',p04:'37 · F',p05:'31 · F',p06:'54 · M',p07:'19 · M',p08:'46 · F',p09:'8 · M',p10:'62 · F',p11:'58 · M',p12:'27 · F',p13:'43 · F',p14:'51 · M',p15:'66 · M',p16:'35 · M'};
  let rows=P().filter(p=>(ptStage==='all'||p.stage===ptStage)&&
    (!ptQuery||(p.name+p.reason).toLowerCase().includes(ptQuery)));
  const kv={name:p=>p.name,wait:p=>p.wait,stage:p=>stageIdx(p.stage)};
  rows.sort((a,b)=>((kv[ptSort.key]?.(a))-kv[ptSort.key]?.(b)??0)*ptSort.dir
    || String(kv[ptSort.key]?.(a)||a).localeCompare(String(kv[ptSort.key]?.(b)||b))*ptSort.dir);
  return `<div class="page"><div class="page-inner">
    <div class="kpis" style="margin-bottom:18px">
      ${kpi(I.users,P().length,'total','Registered today','+5%')}
      ${kpi(I.drop,P().filter(p=>p.stage!=='left').length,'active','On the floor','')}
      ${kpi(I.dollar,D.__collected??960,'collected','Collected today','',{},{money:true})}
    </div>
    <div class="panel">
      <h3>All patients
        <input id="ptSearch" placeholder="Search…" value="${ptQuery}"
          style="margin-left:auto;width:190px;height:34px;border-radius:10px;border:1px solid var(--line-strong);padding:0 12px;font-size:13px;outline:none;font-weight:450">
      </h3>
      <div class="chip-row" style="margin-bottom:10px">
        ${['all:All','checkin:Check-in','triage:Triage','treatment:Treatment','ready:Ready','left:Left'].map(s=>{const[v,l]=s.split(':');
          return `<button class="chip ${ptStage===v?'on':''}" data-ptstage="${v}" style="height:32px;font-size:12.5px">${l}</button>`}).join('')}
      </div>
      <table class="tbl"><thead><tr>
        <th data-sk="name">Patient<i class="sort-ind">↕</i></th><th>Age/Sex</th><th>Reason</th>
        <th data-sk="stage">Stage<i class="sort-ind">↕</i></th><th data-sk="wait">Wait<i class="sort-ind">↕</i></th><th>Vitals</th>
      </tr></thead>
      <tbody>${rows.map(p=>`
        <tr data-open="${p.id}">
          <td><span class="cell-patient"><span class="mini-av" style="background:${D.COLORS[p.color]}">${initialsOf(p.name)}</span>
            <span>${p.name}<span class="cell-sub">MRN-${p.id.toUpperCase()}</span></span></span></td>
          <td>${demo[p.id]||'—'}</td><td>${p.reason}</td>
          <td><span class="stage-chip sc-${p.stage}">${STG[p.stage].label}</span></td>
          <td><span class="tpill ${tierClass(p)}">${I.clock}${p.stage==='left'?p.dur+'m':p.wait+'m'}</span></td>
          <td style="color:var(--t2)">${p.stage==='left'?'final':'BP 118/76 · SpO₂ 98%'}</td>
        </tr>`).join('')}</tbody></table>
    </div></div></div>`;
}
function wPatients(){
  wireKPIs();
  $('#ptSearch').oninput=e=>{ptQuery=e.target.value;renderRoute();setTimeout(()=>$('#ptSearch').focus(),0);};
  $$('[data-ptstage]').forEach(b=>b.onclick=()=>{ptStage=b.dataset.ptstage;renderRoute();});
  $$('[data-sk]').forEach(th=>th.onclick=()=>{const k=th.dataset.sk;
    ptSort.dir=ptSort.key===k?-ptSort.dir:1;ptSort.key=k;renderRoute();});
  $$('[data-open]').forEach(tr=>tr.onclick=()=>openDrawer(tr.dataset.open));
}

/* —— Pharmacy & Labs —— */
function vLabs(){
  return `<div class="page"><div class="page-inner" style="max-width:940px">
    <div class="panel"><h3>${I.flask}Pending orders<span class="more">Auto-refreshes with the board</span></h3>
      ${D.orders.map((o,i)=>orderRow(o,i)).join('')}</div>
    <div class="panel"><h3>Sent to pharmacy today</h3>
      <div class="order-row"><span class="mini-av" style="background:${D.COLORS.raspberry}">LC</span>
        <div class="or-main"><div class="or-item">Rx — azithromycin 500mg</div>
        <div class="or-sub">Linda C · Room 10A · picked up at counter</div></div>
        <span class="rel-done">${I.check}Picked up</span></div></div>
  </div></div>`;
}
function orderRow(o,i){
  const done=o.done;
  return `<div class="order-row" style="animation-delay:${i*70}ms">
    <span class="mini-av" style="background:${D.COLORS[P().find(p=>p.id===o.relTo)?.color||'blue']}">${initialsOf(o.patient)}</span>
    <div class="or-main"><div class="or-item">${o.item}</div>
      <div class="or-sub">${o.urgent?'<span class="u-dot"></span>Urgent · ':''}${o.patient} · ${o.room}</div></div>
    <span class="stage-chip ${done?'sc-left':o.stage==='Ready to release'?'sc-await':'sc-submit'}"
      style="margin-right:4px">${done?'Released':o.stage}</span>
    ${o.stage==='Ready to release'&&!done
      ?`<button class="rel-btn" data-rel="${o.id}">Release now</button>`
      :`<span class="rel-done">${done?I.check+'':I.clock}&nbsp;${done?'In chart':'Tracking'}</span>`}
  </div>`;
}
function wLabs(){
  $$('[data-rel]').forEach(b=>b.onclick=()=>{
    const o=D.orders.find(x=>x.id===b.dataset.rel);
    b.disabled=true;b.textContent='Releasing…';
    setTimeout(()=>{releaseLabFor(o.relTo);o.done=true;renderRoute();
      toast(`Released · ${o.item} — ${o.patient}`);},1400);
  });
}
function releaseLabFor(pid,viaCard=false){
  MARK_DIRTY();
  const p=byId(pid); const o=D.orders.find(x=>x.relTo===pid&&x.stage==='Ready to release');
  o&&(o.done=true);
  if(p){
    delete (p.flag||{}).blockedOn;
    p.note=null;p.action&&delete p.action;
    addHistory(pid,'Pre-op labs released');
    logFeed('Labs released',`${p.name} — pre-op results in chart`,pid);
  }
  const blocked=P().filter(x=>x.flag?.blockedOn&&!x.stage.match('left'));
  if(viaCard) toast(`${p?.name}: lab block cleared`);
  renderBoard();
}

/* —— Billing —— */
function vBill(){
  const cl=(status)=>({'Paid':'sc-paid','Awaiting desk':'sc-await','Blocked — lab':'sc-block','Submitted':'sc-submit'}[status]);
  const tot=D.claims.reduce((s,c)=>s+c.amount,0);
  const paid=D.claims.filter(c=>c.status==='Paid').reduce((s,c)=>s+c.copayAtDesk,0);
  return `<div class="page"><div class="page-inner">
    <div class="kpis">
      ${kpi(I.doc,tot,'billed','Billed today','',{},{money:true})}
      ${kpi(I.dollar,paid,'at desk','Collected','+6%',false,{money:true})}
      ${kpi(I.chart,SHOT.sameRate,'% same-day','Collection rate','+3%')}
    </div>
    <div class="panel"><h3>${I.dollar}Claims — sync with Left today</h3>
      <table class="tbl"><thead><tr><th>Patient</th><th>Payer</th><th>Amount</th><th>Status</th><th>Collect at desk</th><th></th></tr></thead>
      <tbody>${D.claims.map(c=>claimRow(c,cl)).join('')}</tbody></table>
      <div style="display:flex;gap:26px;margin-top:14px;font-size:13px;color:var(--t2)">
        <span>Total billed <b style="color:var(--ink)">$${tot.toLocaleString()}</b></span>
        <span>Desk-collected <b style="color:var(--ink)" id="bc-total">$${paid.toLocaleString()}</b></span>
        <span>Same-day rate <b style="color:var(--ink)">${Math.round(paid/(tot/2)*100)}%</b></span>
      </div></div>
  </div></div>`;
}
function claimRow(c,cl){
  return `<tr>
    <td><span class="cell-patient"><span class="mini-av" style="background:${D.COLORS[P().find(p=>p.name.startsWith(c.patient.split(' ')[0]) )?.color||'teal']}">${initialsOf(c.patient)}</span>${c.patient}</span></td>
    <td>${c.payer}</td><td><b>$${c.amount}</b></td>
    <td><span class="stage-chip ${cl(c.status)}">${c.status}</span></td>
    <td>$${c.copayAtDesk}</td>
    <td style="text-align:right">${c.status==='Awaiting desk'?`<button class="collect-mini" data-pay="${c.id}">Collect $${c.copayAtDesk}</button>`
      :c.status==='Paid'?`<span class="rel-done">${I.check}Paid</span>`:''}</td></tr>`;
}
function wBill(){
  wireKPIs();
  $$('[data-pay]').forEach(b=>b.onclick=()=>{
    const c=D.claims.find(x=>x.id===b.dataset.pay);
    c.status='Paid';
    D.__collected=(D.__collected??SHOT.collected)+c.copayAtDesk;
    const pc=P().find(p=>p.invoice&&!p.invoice.paid&&p.name.startsWith(c.patient.split(' ')[0]));
    if(pc){pc.invoice.paid=true;const cb=$(`[data-invoice="${pc.id}"]`);cb&&(cb.classList.add('paid'),cb.innerHTML=I.check+' Paid · thanks!');}
    logFeed('Payment collected',`${c.patient} — $${c.copayAtDesk} at desk.`);
    toast(`$${c.copayAtDesk} collected from ${c.patient}`);
    renderBoardSoft();renderRoute();
  });
}
function renderBoardSoft(){ if(S.route==='billing'||S.route==='labs'){} }

/* —— Reports —— */
function vReports(){
  const w=[[60,72,65,80,74,88,79]];
  return `<div class="page"><div class="page-inner">
    <div class="kpis">
      ${kpi(I.history,12,'min','Avg door-to-doctor','−9%')}
      ${kpi(I.chart,94,'%','Same-day collections','+3%')}
      ${kpi(I.users,482,'patients','This month','+11%')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="dash-grid">
      <div class="panel"><h3>Door-to-doctor trend</h3>
        <svg viewBox="0 0 320 120" style="width:100%">
          <defs><linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#7DD571" stop-opacity=".28"/><stop offset="1" stop-color="#7DD571" stop-opacity="0"/></linearGradient></defs>
          <path class="spark-area" d="M0,86 L46,78 L92,84 L138,64 L184,70 L230,50 L276,56 L320,42 L320,120 L0,120 Z"/>
          <path class="spark" d="M0,86 L46,78 L92,84 L138,64 L184,70 L230,50 L276,56 L320,42"/>
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t3)"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
      </div>
      <div class="panel"><h3>Top delay causes</h3>
        ${[['Lab turnaround',34],['Insurance verify',22],['Interpreter wait',11],['Room turnover',9]]
          .map(([l,v],i)=>`<div style="margin-bottom:13px">
            <div style="display:flex;font-size:13px;margin-bottom:6px"><span>${l}</span><b style="margin-left:auto">${v}%</b></div>
            <div class="meter" style="width:100%"><i style="width:${v}%;animation-delay:${i*90}ms"></i></div></div>`).join('')}
      </div>
    </div>
    <div class="panel"><h3>Weekly volume</h3>
      <div class="bars">${[126,138,131,152,144,167,158].map((n,i)=>`
        <div class="barcol"><div class="bar ${i===5?'now':''}" style="height:${n/167*100}%;animation-delay:${i*60}ms" title="${n} visits"></div></div>`).join('')}
      </div></div>
  </div></div>`;
}

/* —— Staff —— */
function vStaff(){
  return `<div class="page"><div class="page-inner">
    <div class="kpis">
      ${kpi(I.users,D.staff.filter(s=>s.on).length,'on shift','Coverage now','')}
      ${kpi(I.clock,3.4,'avg load','Patients per provider','')}
      ${kpi(I.heart,92,'%','Utilization','+2%')}
    </div>
    <div class="panel"><h3>Care team</h3>
      <div class="staff-grid">${D.staff.map(staffCard).join('')}</div></div>
  </div></div>`;
}

/* —— Pro —— */
function vPro(){
  return `<div class="page"><div class="page-inner" style="max-width:900px">
    <div class="pro-banner reveal">
      <h2>Elera Pro</h2>
      <p>Predictive breach alerts, insurance autopilot, smart room assignment, multi-site views and unlimited Elera AI reasoning.</p>
      <div class="pro-feats">
        <span class="pro-feat">⚡ Predictive alerts</span><span class="pro-feat">🧾 Insurance autopilot</span>
        <span class="pro-feat">🏥 Multi-site</span><span class="pro-feat">🤖 Unlimited AI</span>
      </div>
      <button class="btn primary pro-cta" data-trial>Start 30-day trial</button>
    </div>
    <div class="panel" style="margin-top:16px"><h3>What clinics gain in month one</h3>
      <div class="kpis" style="margin:0">
        ${kpi(I.clock,22,'%','Avg wait ↓','')}
        ${kpi(I.dollar,18,'%','Point-of-service yield ↑','')}
        ${kpi(I.users,2.1,'×','Patients seen ↑','')}
      </div></div>
  </div></div>`;
}
function wPro(){$('[data-trial]').onclick=()=>toast('You\'re on the Pro waitlist ✨');}

/* —— Help —— */
function vHelp(){
  const qa=[
    ['How does the board decide “breaching”?','Every stage carries a target (Check-in 5m, Triage 10m). A card turns rose the moment its wait crosses the stage target — the same logic drives the “Waiting over 20 min” counter.'],
    ['Can I move patients between stages?','Yes — drag any card to another column, or open the card and press “Advance stage”. Room counters and the Left-today ledger update automatically.'],
    ['Where do the invoice amounts come from?','“Ready to D/C” follows a bill-first policy: walk to Billing & Claims (or press Invoice on the card) to collect copays before check-out; totals mirror the green column.'],
    ['Is the simulation real?','It’s a local demo: waits tick, walk-ins arrive, labs release. Pause any time under Filters ▸ Live simulation.'],
    ['Keyboard shortcuts','⌘K opens the command palette anywhere — jump to patients, fire actions, navigate modules.'],
  ];
  return `<div class="page"><div class="page-inner" style="max-width:820px">
    <div class="panel">
      ${qa.map(([q,a],i)=>`<details class="acc"${i===0?' open':''}><summary>${q}<span class="acc-plus"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span></summary><div class="acc-body">${a}</div></details>`).join('')}
    </div></div></div>`;
}

/* —— Settings —— */
function vSettings(){
  return `<div class="page"><div class="page-inner" style="max-width:720px">
    <div class="panel">
      <h3>Preferences</h3>
      <div class="set-row"><div class="set-info"><div class="set-name">Live simulation</div>
        <div class="set-desc">Walk-ins arrive, waits tick, labs release</div></div>
        <span class="f-toggle ${S.live?'on':''}" data-set="live"></span></div>
      <div class="set-row"><div class="set-info"><div class="set-name">Compact density</div>
        <div class="set-desc">Tighter paddings for large screens</div></div>
        <span class="f-toggle ${document.body.classList.contains('compact')?'on':''}" data-set="compact"></span></div>
      <div class="set-row"><div class="set-info"><div class="set-name">Accent</div>
        <div class="set-desc">Interactive accent across the console</div></div>
        <div class="accent-swatches">
          <span class="swatch ${document.documentElement.dataset.accent!=='blue'&&document.documentElement.dataset.accent!=='violet'?'sel':''}" data-accent-set="" style="background:#7DD571"></span>
          <span class="swatch ${document.documentElement.dataset.accent==='blue'?'sel':''}" data-accent-set="blue" style="background:#6FB5F2"></span>
          <span class="swatch ${document.documentElement.dataset.accent==='violet'?'sel':''}" data-accent-set="violet" style="background:#B49DF2"></span>
        </div></div>
      <div class="set-row"><div class="set-info"><div class="set-name">Sidebar</div>
        <div class="set-desc">Collapse to icon rail</div></div>
        <span class="f-toggle ${document.body.classList.contains('rail')?'on':''}" data-set="rail"></span></div>
    </div>
    <div class="panel"><h3>About</h3>
      <div style="font-size:13.5px;color:var(--t2);line-height:1.7">Elera · operations console concept.<br>Patient Flow replica — vanilla HTML/CSS/JS, zero dependencies, fully offline.</div>
    </div></div></div>`;
}
function wSettings(){
  $$('[data-set]').forEach(t=>t.onclick=()=>{
    const k=t.dataset.set;
    if(k==='live'){S.live=!S.live;t.classList.toggle('on',S.live);}
    if(k==='compact'){document.body.classList.toggle('compact');t.classList.toggle('on');}
    if(k==='rail'){collapseBtn.click();t.classList.toggle('on');}
  });
  $$('[data-accent-set]').forEach(sw=>sw.onclick=()=>{
    document.documentElement.dataset.accent=sw.dataset.accentSet;
    try{localStorage.setItem(LS('accent'),sw.dataset.accentSet);}catch(e){}
    $$('.swatch').forEach(x=>x.classList.remove('sel'));sw.classList.add('sel');
    toast('Accent updated','info');
  });
}

/* ═════════════════ LIVE SIMULATION ═════════════════ */
const WALK_NAMES=['Ada Liu','Ben Ortiz','Chloe Tan','Dev Rao','Ella Novak','Finn Marsh','Grace Wu','Hugo Silva','Iris Bell','Jonas Berg'];
let walkIdx=0,nextWalk=14;
function simTick(){
  if(document.hidden||S.route==='eleraai'&&!S.live){}
  if(!S.live||document.hidden) return;
  const nowMin=(Date.now()/1000)|0;
  if(nowMin>=nextWalk){
    nextWalk=nowMin+18+((Math.random()*22)|0);
    if(P().filter(p=>p.stage!=='left').length<21){
      MARK_DIRTY();
      const name=WALK_NAMES[walkIdx++%WALK_NAMES.length];
      const bayN=1+walkIdx%6;
      const p={id:'w'+Date.now()+walkIdx,name,color:avColor(name),reason:['Coughing','Fever','Ankle pain','Sore throat'][walkIdx%4],
        stage:'checkin',loc:{icon:/^\d/.test(bayN)?'bay':'bay',label:'Bay '+bayN},wait:0,flag:{new:true},doctor:null};
      D.patients.push(p);
      logFeed('Walk-in arrived',`${name} seated in Bay ${bayN}`,p.id);
      if(S.route==='patientflow') renderBoard();
    }
  }
  /* occasional progression */
  if(Math.random()<0.55){
    const movers=P().filter(p=>p.stage!=='left');
    if(movers.length){
      const cand=movers[Math.random()*movers.length|0];
      /* don't disturb reference stars early — prefer low-visibility picks after 2 moves */
      const keep=['p05','p10','p11','p13','p14'];
      let pick=movers.filter(p=>!keep.includes(p.id))[Math.random()*Math.max(1,movers.filter(p=>!keep.includes(p.id)).length)|0]||cand;
      MARK_DIRTY();
      const i=stageIdx(pick.stage);
      if(i<4) moveToStage(pick,ORDER[i+1]);
    }
  }
  /* resolves: released lab unblocks */
  if(Math.random()<0.2){
    const blocked=P().find(p=>p.flag?.blockedOn&&p.stage!=='left');
    blocked&&releaseLabFor(blocked.id);
  }
}
setInterval(simTick,9000);
/* minute ticker — everyone waits one more minute */
setInterval(()=>{
  if(!S.live||document.hidden)return;
  const touched=P().filter(p=>p.stage!=='left');
  if(!touched.length)return;
  touched.forEach(p=>p.wait++);
  MARK_DIRTY();
  if(S.route==='patientflow'&&Date.now()-(S._lastPaint||0)>20000){S._lastPaint=Date.now();renderBoard();}
  else if(S.route==='patientflow'){$$('.tpill').forEach(()=>{});
    /* light touch: refresh pills only */
    visibleByStage();
  }
},75000);

/* ═════════════════ BOOT ═════════════════ */
function boot(){
  P().forEach(p=>seedHistory(p));
  const h=location.hash.replace('#/','');
  if(ROUTES[h])S.route=h;
  $$('#sideNav .nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===S.route));
  renderRoute(true);
  logFeed('Board synced','Live floor imported · all systems normal.');
  S.feed.forEach(n=>n.unread=false);S.unread=0;$('#bellDot').hidden=true;
  setTimeout(()=>{const p=P().find(x=>x.stage==='treatment');},0);
}
boot();

/* expose tiny debug handle */
window.elera={go,S,D:P,renderBoard};
})();
